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

const array = (value) => (Array.isArray(value) ? value : [])
export function parseRecord(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
export function traceCallRows(spans = [], events = [], runId = '') {
  const calls = new Map()
  const seen = new Set()
  for (const event of [...events].sort((a, b) => Number(a.sequence) - Number(b.sequence))) {
    const payload = event.payload || {}
    const owner = event.run_id || event.parent?.run_id || payload.run_id
    if (runId && owner !== runId) continue
    if (!['tool.call', 'tool.result'].includes(event.type) || !payload.call_id) continue
    const identity = event.id || `${event.sequence}:${event.type}:${payload.call_id}`
    if (seen.has(identity)) continue
    seen.add(identity)
    const key = `${owner}:${payload.call_id}`
    const row = calls.get(key) || {
      id: `call:${key}`,
      kind: 'tool',
      callId: payload.call_id,
      name: payload.name || '工具调用',
      status: '未上报',
      events: []
    }
    const at = event.occurred_at || event.ts || event.created_at
    row.events.push(event)
    if (payload.name) row.name = payload.name
    if (event.type === 'tool.call') {
      row.input = parseRecord(payload.arguments)
      row.startedAt = at
      if (!row.endedAt) row.status = 'running'
    } else {
      row.output = parseRecord(payload.result)
      row.error = payload.error || row.output?.error || (payload.is_error ? payload.result : '')
      row.status = row.error ? 'failed' : 'completed'
      row.endedAt = at
      row.truncated = payload.truncated === true
    }
    const elapsed = Date.parse(row.endedAt) - Date.parse(row.startedAt)
    row.duration = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null
    calls.set(key, row)
  }
  const models = array(spans)
    .filter((span) => span.kind === 'ChatModel')
    .map((span) => ({
      id: `span:${span.id || span.span_id}`,
      kind: 'model',
      name: span.name || span.attrs?.model || '模型调用',
      status: span.attrs?.status || '未上报',
      startedAt: span.started_at,
      duration: span.duration_ms,
      error: span.attrs?.error,
      input: span.attrs?.input,
      output: span.attrs?.output,
      span
    }))
  // 老记录只有 Span 时仍显示工具名、耗时与错误；不把空 attrs 当成空参数。
  const toolSpans = calls.size
    ? []
    : array(spans)
        .filter((span) => span.kind === 'Tool')
        .map((span) => ({
          id: `span:${span.id || span.span_id}`,
          kind: 'tool',
          name: span.name || '工具调用',
          status: span.attrs?.status || '未上报',
          startedAt: span.started_at,
          duration: span.duration_ms,
          error: span.attrs?.error,
          input: span.attrs?.input,
          output: span.attrs?.output,
          span
        }))
  return [...models, ...calls.values(), ...toolSpans].sort(
    (a, b) =>
      (Date.parse(a.startedAt || a.endedAt) || 0) - (Date.parse(b.startedAt || b.endedAt) || 0)
  )
}

export function mergeRunEvents(previous, incoming, runId) {
  const events = new Map()
  for (const event of [...array(previous), ...array(incoming)]) {
    const owner = event.run_id || event.parent?.run_id || event.payload?.run_id
    if (owner !== runId) continue
    events.set(event.id || `${event.sequence}:${event.type}`, event)
  }
  return [...events.values()].sort((a, b) => Number(a.sequence) - Number(b.sequence))
}
