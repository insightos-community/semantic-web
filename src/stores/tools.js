// Copyright 2026 InsightOS
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// 工具目录域（R17 前端工具目录页）：目录加载 + 工具扁平目录 + 统计。
// 契约以 internal/server/http/handlers/tools.go 为准：GET /tools 按来源
// 分组 {sources:[{kind(builtin|mcp), tools}]}，mcp 组工具另带
// server/updated_at，健康状态按 server 维护（同 server 条目同生共死）。
// 前端保留来源分组用于统计与来源元数据，交互层按工具 namespace 分类，
// 直接选择工具查看详情；目录是慢变数据，页面不做轮询，首屏 load 一次。
import { defineStore } from 'pinia'
import * as toolsApi from '@/api/tools'

// 健康状态取值（与 mcpregistry 契约一致）。
export const HEALTH_HEALTHY = 'healthy'
export const HEALTH_UNAVAILABLE = 'unavailable'

// healthOf 聚合一组工具的健康：任一 unavailable 即组级 unavailable
// （健康按 server 维护，正常情形全组一致；聚合规则兜底防御）。
// 纯函数导出供单测。
export function healthOf(tools) {
  return tools.some((t) => t.health === HEALTH_UNAVAILABLE) ? HEALTH_UNAVAILABLE : HEALTH_HEALTHY
}

// groupSources 把 GET /tools 的 sources 拆成左列来源树分组：
// builtin 组单组（key=builtin，标题"内置工具"）；mcp 组按 server 拆分
// （server 缺省回退 namespace），组间按 server 名升序，组内保持服务端
// 排序（FullName 升序）。组形状：
// {key, kind, title, health, updatedAt(组内最大 updated_at，无则 null), tools}。
// 纯函数导出供单测。
export function groupSources(sources) {
  const groups = []
  const list = Array.isArray(sources) ? sources : []
  for (const src of list) {
    const tools = Array.isArray(src?.tools) ? src.tools : []
    if (src?.kind === 'builtin') {
      groups.push({
        key: 'builtin',
        kind: 'builtin',
        title: '内置工具',
        health: healthOf(tools),
        updatedAt: null,
        tools
      })
    } else if (src?.kind === 'mcp') {
      const byServer = new Map()
      for (const t of tools) {
        const server = t.server || t.namespace || 'unknown'
        let g = byServer.get(server)
        if (!g) {
          g = { key: `mcp:${server}`, kind: 'mcp', title: server, updatedAt: null, tools: [] }
          byServer.set(server, g)
        }
        g.tools.push(t)
        if (t.updated_at && (!g.updatedAt || Date.parse(t.updated_at) > Date.parse(g.updatedAt))) {
          g.updatedAt = t.updated_at
        }
      }
      for (const g of [...byServer.values()].sort((a, b) => a.title.localeCompare(b.title))) {
        g.health = healthOf(g.tools)
        groups.push(g)
      }
    }
  }
  return groups
}

// summarize 统计来源分组：总数 / 各来源（builtin|mcp）计数 / 异常
// （unavailable）计数。纯函数导出供单测。
export function summarize(groups) {
  const stats = { total: 0, builtin: 0, mcp: 0, unhealthy: 0 }
  for (const g of groups) {
    stats.total += g.tools.length
    if (g.kind === 'builtin') stats.builtin += g.tools.length
    else stats.mcp += g.tools.length
    stats.unhealthy += g.tools.filter((t) => t.health === HEALTH_UNAVAILABLE).length
  }
  return stats
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

// toolTags 先从目录现有字段派生标签，并兼容后端未来新增的 tags 字段。
export function toolTags(tool) {
  const sourceLabel =
    tool.sourceKind === 'builtin'
      ? '内置'
      : tool.sourceKind === 'mcp'
        ? 'MCP'
        : tool.sourceTitle || tool.sourceKind || '运行时'
  const tags = [
    tool.category || tool.namespace || 'general',
    sourceLabel,
    tool.risk ? `风险:${tool.risk}` : '',
    tool.health === HEALTH_UNAVAILABLE ? '失联' : '健康',
    ...normalizeTags(tool.tags)
  ]
  return [...new Set(tags.filter(Boolean))]
}

// normalizeEffectiveTools 把会话有效工具协议转换为与全局目录相同的展示
// 形状。delivery 明确说明工具是直接注入、ToolSearch 发现、Middleware
// 注入还是 AgentTool 生成，避免把“已安装”误解为“当前模型可调用”。
export function normalizeEffectiveTools(view) {
  const labels = {
    direct: '直接注入',
    tool_search: 'ToolSearch 按需发现',
    middleware: 'Eino Middleware',
    agent_tool: 'Eino AgentTool'
  }
  return (Array.isArray(view?.tools) ? view.tools : []).map((tool) => {
    const deliveryLabel = labels[tool.delivery] || tool.delivery || '运行时'
    const item = {
      ...tool,
      key: `effective:${view.agent_id}:${tool.name}`,
      category: tool.namespace || 'general',
      sourceKind: tool.source || 'runtime',
      sourceTitle: `${tool.source || 'runtime'} · ${deliveryLabel}`,
      health: HEALTH_HEALTHY,
      tags: [...normalizeTags(tool.tags), deliveryLabel, '当前可用']
    }
    return { ...item, tags: toolTags(item) }
  })
}

// flattenTools 把来源协议转换为可直接选择的工具目录项，来源仅作为元数据。
export function flattenTools(sources) {
  return groupSources(sources).flatMap((group) =>
    group.tools.map((tool) => {
      const item = {
        ...tool,
        category: tool.namespace || 'general',
        sourceKind: group.kind,
        sourceTitle: group.title,
        key: `${group.key}:${tool.name}`
      }
      return { ...item, tags: toolTags(item) }
    })
  )
}

export function groupToolsByCategory(items) {
  const grouped = new Map()
  for (const tool of items || []) {
    const category = tool.category || 'general'
    if (!grouped.has(category)) grouped.set(category, [])
    grouped.get(category).push(tool)
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, tools]) => ({
      category,
      tools: tools.sort((left, right) => left.name.localeCompare(right.name))
    }))
}

export function filterTools(items, { query = '', category = 'all', tags = [] } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return (items || []).filter((tool) => {
    if (category !== 'all' && tool.category !== category) return false
    if (tags.length && !tags.every((tag) => tool.tags?.includes(tag))) return false
    if (!normalizedQuery) return true
    return [tool.name, tool.description, tool.namespace, tool.sourceTitle, ...(tool.tags || [])]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
  })
}

export const useToolsStore = defineStore('tools', {
  state: () => ({
    sources: [], // GET /tools 原始分组快照
    loading: false, // 首屏加载态
    error: '', // 加载错误（首屏展示用）
    activeKey: '', // 当前选中工具 key（空 = 未选中）
    effectiveView: null, // 当前会话 Agent 的实际装配快照
    effectiveLoading: false,
    effectiveError: ''
  }),
  getters: {
    // groups 左列来源树分组视图
    groups: (s) => groupSources(s.sources),
    catalog: (s) => flattenTools(s.sources),
    effectiveCatalog: (s) => normalizeEffectiveTools(s.effectiveView),
    // stats 顶部统计条数据
    stats() {
      return summarize(this.groups)
    },
    // activeTool 当前选中工具（右侧详情数据源）
    activeTool() {
      return this.catalog.find((tool) => tool.key === this.activeKey) || null
    }
  },
  actions: {
    // load 拉取工具目录：首屏置 loading、失败写 error 并原样抛出（页面统一
    // 提示）。加载后兜底选中：当前选中组已不存在（或尚未选中）则落到首个组。
    async load() {
      this.loading = true
      try {
        const data = await toolsApi.listTools()
        this.sources = Array.isArray(data?.sources) ? data.sources : []
        this.error = ''
        const keys = flattenTools(this.sources).map((tool) => tool.key)
        this.activeKey = keys.includes(this.activeKey) ? this.activeKey : keys[0] || ''
      } catch (e) {
        this.error = e.message || '工具目录加载失败'
        throw e
      } finally {
        this.loading = false
      }
    },
    // loadEffective 读取当前会话中目标 Agent 的真实装配结果；切换会话、
    // Agent 或宿主执行权限后应重新读取，不能在浏览器自行推断。
    async loadEffective(sessionId, agentId) {
      if (!sessionId || !agentId) {
        this.effectiveView = null
        return null
      }
      this.effectiveLoading = true
      try {
        const data = await toolsApi.listSessionAgentTools(sessionId, agentId)
        this.effectiveView = data || null
        this.effectiveError = ''
        return this.effectiveView
      } catch (error) {
        this.effectiveError = error.message || '有效工具加载失败'
        throw error
      } finally {
        this.effectiveLoading = false
      }
    },
    // select 直接选中工具（纯本地切换，右侧详情随 activeTool 联动）
    select(key) {
      this.activeKey = key
    }
  }
})
