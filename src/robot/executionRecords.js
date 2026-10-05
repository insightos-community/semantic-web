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

const rows = (value) => (Array.isArray(value) ? value : [])
export const recordText = (value) =>
  typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2)

export function recordLevel(value = {}) {
  const payload = value.payload || value
  const feedback = payload.feedback || {}
  const statuses = [payload.status, payload.phase, feedback.phase].map((item) =>
    String(item || '').toLowerCase()
  )
  const levels = [payload.level, payload.severity, feedback.level, feedback.severity].map((item) =>
    String(item || '').toLowerCase()
  )
  const meaningfulError = (error) =>
    typeof error === 'string'
      ? Boolean(error.trim())
      : Boolean(error && typeof error === 'object' && (error.message || error.code || error.cause))
  // Classify explicit severity/lifecycle values, never prose, substring matches,
  // or an empty error object carried by otherwise normal load feedback.
  if (
    meaningfulError(payload.error) ||
    meaningfulError(feedback.error) ||
    levels.some((item) => ['error', 'fatal'].includes(item)) ||
    statuses.some((item) => ['error', 'failed', 'failure'].includes(item)) ||
    (['skill.stop.finalized', 'execution.terminal'].includes(value.type) &&
      payload.status === 'interrupted') ||
    /(?:^|\.)(?:error|failed)$/.test(value.type || '')
  )
    return 'error'
  if (
    (value.type === 'decision.required' && Boolean(payload.deviation)) ||
    levels.some((item) => ['warn', 'warning'].includes(item)) ||
    statuses.some((item) => ['warn', 'warning'].includes(item)) ||
    /(?:^|\.)(?:warning|warn|evidence_unavailable)$/.test(value.type || '')
  )
    return 'warning'
  return 'info'
}

export function recordSummary(value, limit = 180) {
  const text = recordText(value).replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

export function isKeyLog(row) {
  if (row.level !== 'info' || row.input || row.output) return true
  if (row.source === 'trace') return !['heartbeat', 'stream', 'token'].includes(row.type)
  if (
    /^(stage\.(started|completed|failed|recovering|recovered|evidence)|skill\.(completed|failed)|execution\.terminal|action\.(completed|failed))$/.test(
      row.type || ''
    )
  )
    return true
  const phase = row.details?.payload?.feedback?.phase
  return ['succeeded', 'completed', 'failed'].includes(phase)
}

export function groupLogRows(logs = []) {
  const grouped = new Map()
  for (const row of logs) {
    const key = [
      row.source,
      row.executionId || row.runId,
      row.stage,
      row.action,
      row.type,
      row.level,
      row.message,
      row.input,
      row.output
    ].join('\u001f')
    const previous = grouped.get(key)
    grouped.set(key, {
      ...row,
      id: previous?.id || row.id,
      count: (previous?.count || 0) + 1,
      ids: [...(previous?.ids || []), row.id],
      originals: [...(previous?.originals || []), row.details]
    })
  }
  return [...grouped.values()]
}

export function feedbackDisplayKey(item = {}) {
  const location = `${item.stage || ''}:${item.action_id || item.invocation_id || item.source || ''}`
  const level = recordLevel(item)
  if (level === 'warning') return `${location}:warning:${item.message || item.code || ''}`
  if (
    level === 'error' ||
    /accept|start|success|succeed|complet|stop|cancel|terminal/.test(item.phase || '')
  )
    return `${location}:${item.phase || level}:${item.id || item.sequence || item.occurred_at || ''}`
  return `${location}:latest`
}

// 只压缩过程展示；原始消息仍保存在 Execution 事件列表，可分页查看和导出。
export function compactFeedback(feedback = []) {
  const result = new Map()
  for (const item of feedback) {
    const key = feedbackDisplayKey(item)
    const previous = result.get(key)
    result.set(key, {
      ...item,
      display_key: key,
      repeat_count: (previous?.repeat_count || 0) + (item.repeat_count || 1)
    })
  }
  return [...result.values()]
}

// Execution events are append-only. Reuse their display projection instead of
// serializing every historical input/output on each incoming feedback frame.
// Weak keys release cached rows when the Project/event history is discarded.
const eventRowCache = new WeakMap()
export function executionLogRows(execution, events = []) {
  const result = events.map((event) => {
    const cached = eventRowCache.get(event)
    if (cached?.executionId === execution.id) return cached
    const row = {
      id: `${execution.id}:${event.sequence}`,
      executionId: execution.id,
      stage: event.payload?.stage || event.payload?.feedback?.stage || '',
      action:
        event.payload?.action_type ||
        event.payload?.action?.type ||
        event.payload?.action?.action_type ||
        event.payload?.task_name ||
        '',
      input: recordSummary(
        event.payload?.input || event.payload?.parameters || event.payload?.action?.parameters
      ),
      output: recordSummary(
        event.payload?.result ||
          event.payload?.output ||
          (event.payload?.observation?.kind !== 'sensor.frame'
            ? event.payload?.observation?.value
            : null)
      ),
      at: event.created_at || event.payload?.occurred_at,
      source: 'execution',
      level: recordLevel(event),
      message:
        event.payload?.summary ||
        event.payload?.feedback?.message ||
        event.payload?.error?.message ||
        event.payload?.observation?.kind ||
        event.payload?.message ||
        event.type,
      details: event,
      type: event.type
    }
    eventRowCache.set(event, row)
    return row
  })
  if (recordLevel({ error: execution.error }) === 'error')
    result.push({
      id: `${execution.id}:error`,
      executionId: execution.id,
      stage: execution.stage,
      at: execution.updated_at,
      source: 'execution',
      level: 'error',
      message: execution.error.message || execution.error.code || '执行失败',
      details: execution.error
    })
  for (const record of rows(execution.artifact_sync).filter((item) => item.status === 'failed'))
    result.push({
      id: `${execution.id}:artifact:${record.local_artifact_id}`,
      executionId: execution.id,
      stage: record.stage || '',
      at: record.updated_at,
      source: 'execution',
      level: 'error',
      message: `图像或文件同步失败：${record.summary || record.local_artifact_id}`,
      details: record
    })
  return result
}

export function runLogRows(run, trace) {
  const result = rows(trace?.spans).map((span) => ({
    id: `trace:${run.id}:${span.id}`,
    runId: run.id,
    at: span.started_at,
    source: 'trace',
    level: recordLevel({ ...span.attrs, type: span.kind }),
    type: span.kind,
    input: recordSummary(span.attrs?.input || span.attrs?.inputs || span.attrs?.arguments),
    output: recordSummary(span.attrs?.output || span.attrs?.result),
    message: span.name || span.kind,
    details: { run_id: run.id, trace_id: trace.trace_id, ...span }
  }))
  if (recordLevel(run) === 'error')
    result.push({
      id: `run:${run.id}:error`,
      runId: run.id,
      at: run.finished_at || run.updated_at,
      source: 'trace',
      level: 'error',
      message:
        typeof run.error === 'string'
          ? run.error
          : run.error?.message || run.reason || 'Agent Run 失败',
      details: run
    })
  return result
}

export function executionProblems(executions = [], eventsFor = () => []) {
  const result = []
  for (const execution of executions) {
    const logs = executionLogRows(execution, eventsFor(execution.id))
    if (execution.status === 'stopping') {
      result.push({
        id: `${execution.id}:stopping`,
        executionId: execution.id,
        workflowId: execution.workflow_id,
        taskId: execution.task_id,
        subtaskId: execution.subtask_id,
        skillName: execution.skill_name,
        stage: execution.stage,
        at: execution.updated_at,
        level: 'warning',
        message: '停止尚未完成，等待完整安全停止确认',
        resolution: 'stopping',
        resolutionLabel: '停止中 / 安全状态待确认',
        details: execution,
        recovery: []
      })
    }
    const grouped = new Map()
    for (const log of logs.filter((row) => row.level !== 'info')) {
      const key = `${log.stage}:${log.type}:${log.message}:${recordText(log.details?.payload?.error)}`
      const previous = grouped.get(key)
      grouped.set(key, { ...log, count: (previous?.count || 0) + 1 })
    }
    for (const problem of grouped.values()) {
      const sequence = problem.details?.sequence
      const following =
        Number.isFinite(sequence) && problem.stage
          ? logs.filter((row) => row.stage === problem.stage && row.details?.sequence > sequence)
          : []
      const completion = following.find((row) => row.type === 'stage.completed')
      const history = following.filter(
        (row) => !completion || row.details.sequence <= completion.details.sequence
      )
      const recovery = history.filter(
        (row) => row.type === 'stage.recovering' || row.type === 'stage.recovered'
      )
      const retry =
        problem.action &&
        history.find(
          (row) =>
            row.action === problem.action &&
            row.type === 'action.terminal' &&
            ['succeeded', 'completed'].includes(row.details?.payload?.status)
        )
      const resolved = Boolean(
        completion &&
        ((recovery.length && retry) ||
          (problem.type === 'decision.required' &&
            history.some((row) => row.type === 'agent.resolved'))) &&
        !history.some(
          (row) =>
            row.level === 'error' && row.details.sequence > (retry?.details.sequence ?? sequence)
        )
      )
      result.push({
        ...problem,
        workflowId: execution.workflow_id,
        taskId: execution.task_id,
        subtaskId: execution.subtask_id,
        skillName: execution.skill_name,
        resolution: resolved
          ? 'recovered'
          : execution.status === 'stopping' || execution.status === 'stopped'
            ? execution.status
            : execution.status === 'waiting_agent'
              ? 'waiting_agent'
              : recovery.length && !completion
                ? 'recovering'
                : execution.status === 'failed'
                  ? 'unresolved'
                  : 'unknown',
        resolutionLabel: resolved
          ? '已恢复并验证'
          : execution.status === 'stopping'
            ? '停止中 / 不再恢复执行'
            : execution.status === 'stopped'
              ? '已停止 / 未恢复'
              : execution.status === 'waiting_agent'
                ? '等待 Agent 决策'
                : recovery.length && !completion
                  ? '恢复中 / 待验证'
                  : execution.status === 'failed'
                    ? '未解决'
                    : '恢复结果待确认',
        recovery: history
          .filter(
            (row) =>
              (row.type.startsWith('stage.') &&
                !['stage.running', 'stage.evidence'].includes(row.type)) ||
              ['agent.requested', 'agent.resolved', 'skill.stop.finalized'].includes(row.type) ||
              (row.type === 'action.terminal' && row.action !== 'sensor.capture_rgbd')
          )
          .map((row) => ({
            ...row,
            message:
              row.message === row.type
                ? `${row.action} · ${row.details?.payload?.status || ''}`
                : row.message
          }))
      })
    }
  }
  return result
}

export function durationLabel(value, now = Date.now()) {
  const start = Date.parse(value?.started_at || value?.created_at || '')
  const endValue =
    value?.completed_at ||
    value?.finished_at ||
    value?.ended_at ||
    (![
      'pending',
      'queued',
      'starting',
      'running',
      'waiting_agent',
      'waiting_input',
      'stopping',
      'cancelling'
    ].includes(value?.status)
      ? value?.updated_at
      : '')
  const end = endValue ? Date.parse(endValue) : now
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—'
  const seconds = Math.floor((end - start) / 1000)
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}
