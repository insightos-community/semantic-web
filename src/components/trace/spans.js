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

// Trace 视图 span 组树与聚合（纯函数，供组件与单测复用，R19）。
// 契约（以代码为准）：GET /traces/{id}/spans 按开始时间升序（同刻按写入序）
// 返回全部跨度；parent_id 指向父跨度的自增 id（字符串），根跨度为空串
// （internal/server/http/handlers/traces.go spanView、internal/store/trace.go
// GetSpans）。kind 为 eino 组件类别（ChatModel/Tool/Agent/Chain…，
// kernel/trace.go spanNameKind）。

// parent_id 组树后 DFS 压平为带缩进层级的行（先序 ≈ 时间序，兄弟保持输入序）。
// 孤儿跨度（parent_id 指向不存在的 id，脏数据）按根处理，保证不丢行。
export function flattenSpans(spans) {
  const list = Array.isArray(spans) ? spans : []
  const byId = new Map()
  for (const sp of list) byId.set(String(sp.id), sp)
  const childrenOf = new Map() // parentKey → [span]（输入序即开始时间升序）
  const roots = []
  for (const sp of list) {
    const pid = sp.parent_id || ''
    if (pid && byId.has(pid)) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, [])
      childrenOf.get(pid).push(sp)
    } else {
      roots.push(sp)
    }
  }
  const rows = []
  const walk = (sp, depth) => {
    rows.push({ span: sp, depth })
    for (const child of childrenOf.get(String(sp.id)) || []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  return rows
}

// 耗时分解段取值（三分解条图例与配色约定；顺序即条带顺序）
export const BREAKDOWN_SEGMENTS = Object.freeze([
  { key: 'inference', label: '推理', color: 'var(--sf-channel-dialogue)' },
  { key: 'tool', label: '工具', color: 'var(--sf-channel-artifact)' },
  { key: 'wait', label: '等待', color: 'var(--sf-channel-trace)' }
])

// 耗时按 kind 聚合成 推理/工具/等待 三段：ChatModel → 推理（模型调用）、
// Tool → 工具（工具执行）、其余 kind（Agent/Chain 等编排跨度，含审批阻塞
// 与编排开销）→ 等待。口径与后端一致：duration_ms 直接相加，嵌套不去重。
export function aggregateByKind(spans) {
  const totals = { inference: 0, tool: 0, wait: 0 }
  for (const sp of Array.isArray(spans) ? spans : []) {
    const ms = Number(sp.duration_ms) || 0
    if (sp.kind === 'ChatModel') totals.inference += ms
    else if (sp.kind === 'Tool') totals.tool += ms
    else totals.wait += ms
  }
  const total = totals.inference + totals.tool + totals.wait
  return BREAKDOWN_SEGMENTS.map((seg) => ({
    ...seg,
    ms: totals[seg.key],
    ratio: total > 0 ? totals[seg.key] / total : 0
  }))
}

// 耗时展示：≥1s 带两位小数，否则毫秒整数
export function formatDuration(ms) {
  const v = Number(ms) || 0
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`
  return `${v}ms`
}
