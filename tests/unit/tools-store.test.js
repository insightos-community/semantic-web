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

// tools store（R17 前端工具目录页）：目录加载 / 来源分组树 / 统计 /
// 健康映射（契约以 internal/server/http/handlers/tools.go 为准）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/tools', () => ({
  listTools: vi.fn(),
  listSessionAgentTools: vi.fn()
}))

import * as toolsApi from '@/api/tools'
import {
  filterTools,
  flattenTools,
  groupSources,
  groupToolsByCategory,
  healthOf,
  normalizeEffectiveTools,
  summarize,
  toolTags,
  useToolsStore
} from '@/stores/tools'

// GET /tools 响应形态（builtin 组在前，mcp 组在后；mcp 工具另带
// server/updated_at；内置工具 health 恒为 healthy）
const toolsPayload = () => ({
  sources: [
    {
      kind: 'builtin',
      tools: [
        {
          name: 'artifact.get',
          namespace: 'artifact',
          description: '读取产物',
          risk: 'medium',
          health: 'healthy'
        },
        {
          name: 'artifact.put',
          namespace: 'artifact',
          description: '写入产物',
          risk: 'high',
          health: 'healthy'
        },
        {
          name: 'system.echo',
          namespace: 'system',
          description: '回显文本',
          risk: 'low',
          health: 'healthy'
        }
      ]
    },
    {
      kind: 'mcp',
      tools: [
        {
          name: 'map.route',
          namespace: 'map',
          description: '路径规划',
          risk: 'medium',
          health: 'healthy',
          server: 'map',
          updated_at: '2026-08-05T08:00:00Z'
        },
        {
          name: 'map.locate',
          namespace: 'map',
          description: '定位查询',
          risk: 'low',
          health: 'unavailable',
          server: 'map',
          updated_at: '2026-08-05T09:30:00Z'
        },
        {
          name: 'helper.ping',
          namespace: 'helper',
          description: '连通性探测',
          risk: 'low',
          health: 'healthy',
          server: 'helper',
          updated_at: '2026-08-05T07:00:00Z'
        }
      ]
    }
  ]
})

describe('tools store · 目录加载', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load：写入快照，loading 复位，自动选中首个工具', async () => {
    toolsApi.listTools.mockResolvedValue(toolsPayload())
    const tools = useToolsStore()

    await tools.load()

    expect(tools.loading).toBe(false)
    expect(tools.error).toBe('')
    expect(tools.sources).toHaveLength(2)
    expect(tools.activeKey).toBe('builtin:artifact.get')
    expect(tools.activeTool.name).toBe('artifact.get')
    expect(tools.catalog).toHaveLength(6)
  })

  it('load 失败：loading 复位、error 落态且错误原样抛出', async () => {
    toolsApi.listTools.mockRejectedValue(new Error('网络异常，请稍后重试'))
    const tools = useToolsStore()

    await expect(tools.load()).rejects.toThrow('网络异常，请稍后重试')
    expect(tools.loading).toBe(false)
    expect(tools.error).toBe('网络异常，请稍后重试')
    expect(tools.sources).toEqual([])
    expect(tools.activeKey).toBe('')
  })

  it('load 空目录（无来源）：groups 为空、activeKey 置空（空态由页面渲染）', async () => {
    toolsApi.listTools.mockResolvedValue({ sources: [] })
    const tools = useToolsStore()

    await tools.load()

    expect(tools.groups).toEqual([])
    expect(tools.activeKey).toBe('')
    expect(tools.error).toBe('')
  })

  it('load 重新加载：选中工具仍在则保留，已消失则兜底落到首个工具', async () => {
    toolsApi.listTools.mockResolvedValue(toolsPayload())
    const tools = useToolsStore()
    await tools.load()
    tools.select('mcp:helper:helper.ping')

    await tools.load() // helper 仍在：选中保留
    expect(tools.activeKey).toBe('mcp:helper:helper.ping')

    toolsApi.listTools.mockResolvedValue({ sources: [toolsPayload().sources[0]] }) // mcp 组消失
    await tools.load()
    expect(tools.activeKey).toBe('builtin:artifact.get')
  })

  it('select：直接切换工具，activeTool 联动', async () => {
    toolsApi.listTools.mockResolvedValue(toolsPayload())
    const tools = useToolsStore()
    await tools.load()

    tools.select('mcp:map:map.locate')

    expect(tools.activeKey).toBe('mcp:map:map.locate')
    expect(tools.activeTool.name).toBe('map.locate')
    expect(tools.activeTool.sourceTitle).toBe('map')
  })

  it('loadEffective：读取会话 Agent 实际工具并保留交付方式', async () => {
    toolsApi.listSessionAgentTools.mockResolvedValue({
      session_id: 'cs-1',
      agent_id: 'leader',
      role: 'leader',
      tool_search_active: false,
      tools: [
        {
          name: 'ask_query',
          model_name: 'ask_query',
          namespace: 'ask_query',
          description: '查询助手',
          risk: 'low',
          source: 'agent',
          delivery: 'agent_tool'
        },
        {
          name: 'read_file',
          model_name: 'read_file',
          namespace: 'filesystem',
          description: '读取 Project 文件',
          risk: 'low',
          source: 'filesystem',
          delivery: 'middleware'
        }
      ]
    })
    const tools = useToolsStore()

    await tools.loadEffective('cs-1', 'leader')

    expect(toolsApi.listSessionAgentTools).toHaveBeenCalledWith('cs-1', 'leader')
    expect(tools.effectiveCatalog.map((item) => item.name)).toEqual(['ask_query', 'read_file'])
    expect(tools.effectiveCatalog[0]).toEqual(
      expect.objectContaining({
        key: 'effective:leader:ask_query',
        sourceTitle: 'agent · Eino AgentTool',
        health: 'healthy'
      })
    )
    expect(tools.effectiveCatalog[1].tags).toContain('Eino Middleware')
  })
})

describe('tools store · 分组纯函数', () => {
  it('groupSources：builtin 单组在前，mcp 按 server 拆分且组间按名升序', () => {
    const groups = groupSources(toolsPayload().sources)

    expect(groups.map((g) => g.key)).toEqual(['builtin', 'mcp:helper', 'mcp:map'])
    expect(groups[0].title).toBe('内置工具')
    expect(groups[0].health).toBe('healthy')
    expect(groups[0].updatedAt).toBeNull()
    // 组内保持服务端排序（FullName 升序）
    expect(groups[2].tools.map((t) => t.name)).toEqual(['map.route', 'map.locate'])
  })

  it('groupSources：server 缺省回退 namespace；updatedAt 取组内最大', () => {
    const groups = groupSources([
      {
        kind: 'mcp',
        tools: [
          {
            name: 'demo.a',
            namespace: 'demo',
            health: 'healthy',
            updated_at: '2026-08-05T01:00:00Z'
          },
          {
            name: 'demo.b',
            namespace: 'demo',
            health: 'healthy',
            updated_at: '2026-08-05T03:00:00Z'
          },
          {
            name: 'demo.c',
            namespace: 'demo',
            health: 'healthy',
            updated_at: '2026-08-05T02:00:00Z'
          }
        ]
      }
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('mcp:demo')
    expect(groups[0].updatedAt).toBe('2026-08-05T03:00:00Z')
  })

  it('groupSources：健康聚合——组内任一 unavailable 即组级 unavailable', () => {
    const groups = groupSources(toolsPayload().sources)
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.health]))

    expect(byKey).toEqual({ builtin: 'healthy', 'mcp:helper': 'healthy', 'mcp:map': 'unavailable' })
  })

  it('groupSources：非法输入兜底（非数组/缺 tools）返回空或空组', () => {
    expect(groupSources(null)).toEqual([])
    expect(groupSources([{ kind: 'mcp' }])).toEqual([]) // 无 tools → 无 server 组
    expect(groupSources([{ kind: 'builtin' }])).toEqual([
      expect.objectContaining({ key: 'builtin', tools: [], health: 'healthy' })
    ])
  })

  it('healthOf：全 healthy 为 healthy，任一 unavailable 为 unavailable', () => {
    expect(healthOf([{ health: 'healthy' }, { health: 'healthy' }])).toBe('healthy')
    expect(healthOf([{ health: 'healthy' }, { health: 'unavailable' }])).toBe('unavailable')
    expect(healthOf([])).toBe('healthy')
  })
})

describe('tools store · 统计', () => {
  it('summarize：总数 / 各来源计数 / 异常计数', () => {
    const stats = summarize(groupSources(toolsPayload().sources))

    expect(stats).toEqual({ total: 6, builtin: 3, mcp: 3, unhealthy: 1 })
  })

  it('summarize：空分组全零', () => {
    expect(summarize([])).toEqual({ total: 0, builtin: 0, mcp: 0, unhealthy: 0 })
  })

  it('stats getter：与 summarize 同源（store 加载后直接可得）', async () => {
    toolsApi.listTools.mockResolvedValue(toolsPayload())
    const tools = useToolsStore()
    await tools.load()

    expect(tools.stats).toEqual({ total: 6, builtin: 3, mcp: 3, unhealthy: 1 })
  })
})

describe('tools store · 扁平目录与筛选', () => {
  it('normalizeEffectiveTools：区分当前有效工具与全局安装目录', () => {
    const catalog = normalizeEffectiveTools({
      agent_id: 'leader',
      tools: [
        {
          name: 'execute',
          namespace: 'execute',
          source: 'builtin',
          delivery: 'direct',
          risk: 'high'
        }
      ]
    })
    expect(catalog[0].tags).toEqual(expect.arrayContaining(['当前可用', '直接注入', '风险:high']))
  })

  it('flattenTools：来源变为元数据，按分类分组时工具可直接选择', () => {
    const catalog = flattenTools(toolsPayload().sources)
    const groups = groupToolsByCategory(catalog)

    expect(catalog).toHaveLength(6)
    expect(catalog[0]).toEqual(
      expect.objectContaining({
        key: 'builtin:artifact.get',
        sourceTitle: '内置工具',
        category: 'artifact'
      })
    )
    expect(groups.map((group) => group.category)).toEqual(['artifact', 'helper', 'map', 'system'])
  })

  it('filterTools：搜索、分类和多个标签使用组合筛选', () => {
    const catalog = flattenTools(toolsPayload().sources)

    expect(filterTools(catalog, { query: '路径' }).map((tool) => tool.name)).toEqual(['map.route'])
    expect(filterTools(catalog, { category: 'artifact' })).toHaveLength(2)
    expect(filterTools(catalog, { tags: ['MCP', '失联'] }).map((tool) => tool.name)).toEqual([
      'map.locate'
    ])
  })

  it('toolTags：保留派生标签并兼容后端原生 tags', () => {
    expect(
      toolTags({
        namespace: 'vision',
        sourceKind: 'mcp',
        risk: 'medium',
        health: 'healthy',
        tags: ['camera', 'realtime']
      })
    ).toEqual(['vision', 'MCP', '风险:medium', '健康', 'camera', 'realtime'])
  })
})
