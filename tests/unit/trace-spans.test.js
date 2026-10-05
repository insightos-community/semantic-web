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

// R19 Trace 视图纯函数：parent_id 组树压平（缩进/兄弟序/孤儿兜底）、
// 耗时按 kind 三分解聚合、耗时格式化。
import { describe, expect, it } from 'vitest'
import { aggregateByKind, flattenSpans, formatDuration } from '@/components/trace/spans'

// GET /traces/{id}/spans 行形态（handlers/traces.go spanView）：按开始时间升序
const span = (id, parentId, kind, durationMs, over = {}) => ({
  id,
  parent_id: parentId,
  name: `span-${id}`,
  kind,
  started_at: '2026-08-03T10:00:00.000Z',
  duration_ms: durationMs,
  attrs: {},
  ...over
})

describe('trace spans · 组树压平', () => {
  it('parent_id 组树：先序输出带深度，兄弟保持输入序', () => {
    const rows = flattenSpans([
      span(1, '', 'Agent', 900),
      span(2, '1', 'ChatModel', 400),
      span(3, '1', 'Tool', 300),
      span(4, '3', 'ChatModel', 100),
      span(5, '', 'Agent', 50)
    ])
    expect(rows.map((r) => [r.span.id, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 0]
    ])
  })

  it('孤儿跨度（parent_id 指向不存在的 id）按根处理，不丢行', () => {
    const rows = flattenSpans([span(1, 'ghost', 'Tool', 10), span(2, '', 'ChatModel', 20)])
    expect(rows.map((r) => [r.span.id, r.depth])).toEqual([
      [1, 0],
      [2, 0]
    ])
  })

  it('空集/非法输入返回空数组', () => {
    expect(flattenSpans([])).toEqual([])
    expect(flattenSpans(null)).toEqual([])
  })
})

describe('trace spans · 耗时三分解', () => {
  it('ChatModel→推理、Tool→工具、其余→等待；ratio 按合计归一', () => {
    const segs = aggregateByKind([
      span(1, '', 'Agent', 200),
      span(2, '1', 'ChatModel', 500),
      span(3, '1', 'Tool', 300)
    ])
    const byKey = Object.fromEntries(segs.map((s) => [s.key, s]))
    expect(byKey.inference.ms).toBe(500)
    expect(byKey.tool.ms).toBe(300)
    expect(byKey.wait.ms).toBe(200)
    expect(byKey.inference.ratio).toBeCloseTo(0.5)
    expect(byKey.tool.ratio).toBeCloseTo(0.3)
    expect(byKey.wait.ratio).toBeCloseTo(0.2)
  })

  it('空集三段皆为 0 且 ratio 为 0', () => {
    const segs = aggregateByKind([])
    expect(segs.map((s) => s.ms)).toEqual([0, 0, 0])
    expect(segs.map((s) => s.ratio)).toEqual([0, 0, 0])
  })
})

describe('trace spans · 耗时格式化', () => {
  it('≥1s 带两位小数，否则毫秒整数', () => {
    expect(formatDuration(320)).toBe('320ms')
    expect(formatDuration(1500)).toBe('1.50s')
    expect(formatDuration(0)).toBe('0ms')
  })
})
