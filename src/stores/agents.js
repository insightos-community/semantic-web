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

// Agent 目录域（R6 Agent/Team 管理页）：roster 快照 + 30s 轮询。
// 契约以 internal/server/http/handlers/agents.go 与
// internal/agent/runtime/roster.go 为准：基础身份外还包含 Profile 的工具范围、
// 运行限制与当前全局 Skill 可见清单；前端不在 store 中重新推断这些关系。
// 按 id 升序，status ∈ starting/idle/running/stopped。
// 轮询纪律：首屏 load 置 loading（骨架/加载态）；后续静默刷新原地更新数据、
// 失败保留旧数据不抛错，避免 30s 一次的闪烁与错误弹窗轰炸。
import { defineStore } from 'pinia'
import * as agentsApi from '@/api/agents'

// POLL_INTERVAL 成员目录轮询周期（与 AppShell 组件健康轮询一致的 30s）。
export const POLL_INTERVAL = 30000

// STATUS_META 状态点映射（roster.go AgentStatus，以代码为准）：
// starting 黄（--sf-warning）/ idle 灰（--sf-text-disabled）/
// running 绿（--sf-success）/ stopped 红（--sf-danger）。
const STATUS_META = {
  starting: { label: '启动中', color: 'var(--sf-warning)' },
  idle: { label: '待命', color: 'var(--sf-text-disabled)' },
  running: { label: '运行中', color: 'var(--sf-success)' },
  stopped: { label: '已停止', color: 'var(--sf-danger)' }
}

// agentStatusMeta 返回状态展示元数据；未知状态按灰色原样展示（不阻断渲染）。
// 纯函数导出供单测。
export function agentStatusMeta(status) {
  const meta = STATUS_META[status]
  if (meta) return meta
  return { label: status || '未知', color: 'var(--sf-text-disabled)' }
}

// roleColor 返回角色徽标色：优先 --sf-role-<role> 令牌（leader/monitor 等），
// 令牌未定义的角色（如 query）回退 --sf-text-disabled，均不写死色值。
// 纯函数导出供单测。
export function roleColor(role) {
  return `var(--sf-role-${role}, var(--sf-text-disabled))`
}

// 轮询定时器为模块级句柄：同一时刻只有一个活跃 pinia（页面卸载即 stopPolling），
// 不放入 state（非响应式数据且不可序列化）。
let pollTimer = null
// 轮询引用计数：多个页面（Agents 管理页 / 对话页协作侧栏）共享同一定时器，
// 引用归零才停表——否则路由切换时后卸载页面的 stopPolling 会停掉先挂载
// 页面仍在使用的轮询。
let pollRefs = 0

export const useAgentsStore = defineStore('agents', {
  state: () => ({
    agents: [], // roster 成员清单（服务端已按 id 升序）
    loading: false, // 仅首屏加载态；轮询静默刷新不置位（防闪烁）
    error: '', // 最近一次加载错误（首屏展示用）
    polling: false, // 轮询运行标记（页面可见性联动与单测观测点）
    savingModels: '',
    // session_id → 会话 Agent 模型快照。全局 roster 与会话快照分开保存，
    // 避免用户误以为修改 Profile 会立即改写已有会话。
    sessionAgents: {},
    loadingSessionAgents: '',
    savingSessionAgent: ''
  }),
  getters: {
    runningCount: (s) => s.agents.filter((a) => a.status === 'running').length
  },
  actions: {
    // load 拉取 roster。silent=true（轮询）时不置 loading、失败保留旧数据不抛出；
    // 首屏（silent=false）失败写 error 并原样抛出，由页面统一提示。
    async load({ silent = false } = {}) {
      if (!silent) this.loading = true
      try {
        const data = await agentsApi.listAgents()
        this.agents = Array.isArray(data?.agents) ? data.agents : []
        this.error = ''
      } catch (e) {
        this.error = e.message || 'Agent 目录加载失败'
        if (!silent) throw e
      } finally {
        if (!silent) this.loading = false
      }
    },
    async saveModels(id, payload) {
      this.savingModels = id
      try {
        await agentsApi.updateAgentModels(id, payload)
        await this.load({ silent: true })
      } finally {
        this.savingModels = ''
      }
    },
    // loadSessionAgents 拉取一个会话的模型快照；后端返回实际 Provider、
    // endpoint、model 和配置来源，前端不依赖模型自述判断身份。
    async loadSessionAgents(sessionId) {
      if (!sessionId) return []
      this.loadingSessionAgents = sessionId
      try {
        const data = await agentsApi.listSessionAgents(sessionId)
        const rows = Array.isArray(data?.agents) ? data.agents : []
        this.sessionAgents[sessionId] = rows
        return rows
      } finally {
        if (this.loadingSessionAgents === sessionId) this.loadingSessionAgents = ''
      }
    },
    // saveSessionAgentModel 只覆盖当前会话中的目标 Agent。SESSION_BUSY
    // 原样向上抛出，由界面提示用户等待当前模型或工具调用结束。
    async saveSessionAgentModel(sessionId, agentId, endpointId, reasoningEffort = 'auto') {
      if (!sessionId || !agentId || !endpointId) return null
      this.savingSessionAgent = agentId
      try {
        const data = await agentsApi.updateSessionAgentModel(sessionId, agentId, {
          endpoint_id: endpointId,
          reasoning_effort: reasoningEffort
        })
        const saved = data?.agent || null
        if (saved) {
          const rows = this.sessionAgents[sessionId] || []
          this.sessionAgents[sessionId] = [
            ...rows.filter((item) => item.agent_id !== agentId),
            saved
          ].sort((a, b) => a.agent_id.localeCompare(b.agent_id))
        }
        return saved
      } finally {
        this.savingSessionAgent = ''
      }
    },
    clearSessionAgents(sessionId) {
      if (sessionId) delete this.sessionAgents[sessionId]
    },
    // startPolling 启动 30s 轮询（引用计数 +1；定时器已存在则不叠加）。
    startPolling() {
      pollRefs += 1
      this.polling = true
      if (pollTimer) return
      pollTimer = setInterval(() => {
        this.load({ silent: true }).catch(() => {})
      }, POLL_INTERVAL)
    },
    // stopPolling 释放一份轮询引用：引用归零才真正停表（幂等——
    // 无引用时调用只是把标记复位）。
    stopPolling() {
      if (pollRefs > 0) pollRefs -= 1
      if (pollRefs > 0) return
      clearInterval(pollTimer)
      pollTimer = null
      this.polling = false
    }
  }
})
