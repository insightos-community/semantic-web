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

import { describe, expect, it } from 'vitest'
import { mergeRunEvents, traceCallRows } from '@/components/trace/records'

const event = (sequence, type, payload) => ({
  id: `event-${sequence}`,
  sequence,
  type,
  ts: `2026-09-07T10:00:0${sequence}Z`,
  payload: { run_id: 'run-1', call_id: 'call-1', name: 'robot.get', ...payload }
})
describe('Trace 调用分析使用现有 Run 记录', () => {
  it('精确 Run + Call 归并参数结果，重复分页不堆卡且不导入另一 Run', () => {
    const start = event(1, 'tool.call', { arguments: '{"robot_id":"robot-1"}' })
    const end = event(3, 'tool.result', { result: '{"status":"idle"}' })
    const events = mergeRunEvents(
      [start],
      [start, end, event(4, 'tool.result', { run_id: 'other', result: '错误运行' })],
      'run-1'
    )
    expect(events).toHaveLength(2)
    const rows = traceCallRows([], events, 'run-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'robot.get',
      input: { robot_id: 'robot-1' },
      output: { status: 'idle' },
      duration: 2000,
      status: 'completed'
    })
  })
  it('跨页先返回结果也保留，稍后补入参数不会倒退为运行中', () => {
    const rows = traceCallRows(
      [],
      [
        event(3, 'tool.result', { result: { error: { code: 'ROBOT_BUSY' } }, truncated: true }),
        event(1, 'tool.call', { arguments: { robot_id: 'r' } })
      ],
      'run-1'
    )
    expect(rows[0]).toMatchObject({
      input: { robot_id: 'r' },
      status: 'failed',
      error: { code: 'ROBOT_BUSY' },
      truncated: true
    })
  })
  it('同名多次调用不按工具名错误合并，parent.run_id可定位', () => {
    const value = event(2, 'tool.call', { call_id: 'call-2', arguments: { second: true } })
    delete value.payload.run_id
    value.parent = { run_id: 'run-1' }
    expect(traceCallRows([], [event(1, 'tool.call', {}), value], 'run-1')).toHaveLength(2)
  })
  it('模型只显示已保存的Span数据，不伪造空参数；旧工具Span仍可分析耗时错误', () => {
    const rows = traceCallRows([
      {
        id: 1,
        name: 'deepseek',
        kind: 'ChatModel',
        duration_ms: 1800,
        attrs: { status: 'completed', stream_chunks: 10 }
      },
      {
        id: 2,
        name: 'robot.get',
        kind: 'Tool',
        duration_ms: 12,
        attrs: { status: 'failed', error: 'offline' }
      }
    ])
    expect(rows[0]).toMatchObject({ kind: 'model', duration: 1800, status: 'completed' })
    expect(rows[0].input).toBeUndefined()
    expect(rows[1]).toMatchObject({ kind: 'tool', error: 'offline' })
  })
})
