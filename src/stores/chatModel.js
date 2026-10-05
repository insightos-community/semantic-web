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

import { stripEmbeddedThinkBlocks } from '@/utils/reasoning'

// 对话消息的纯模型与归并函数。这里不持有 Pinia/WS/API 状态，便于独立测试，
// 避免 chat store 同时承担协议模型与生命周期编排。
export const CONNECTION_STATUS = Object.freeze({
  OFFLINE: 'offline',
  CONNECTING: 'connecting',
  ONLINE: 'online',
  RECONNECTING: 'reconnecting'
})

export const MESSAGE_STATUS = Object.freeze({
  STREAMING: 'streaming',
  DONE: 'done',
  CANCELLED: 'cancelled',
  ERROR: 'error'
})

export const INTERACTION_STATUS = Object.freeze({
  PENDING: 'pending',
  RESOLVED: 'resolved'
})

export const INTERACTION_RESULT = Object.freeze({
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
})

export const DELEGATION_STATUS = Object.freeze({
  RUNNING: 'running',
  DONE: 'done'
})

export const ALERT_IMPORTANCE = Object.freeze({
  CRITICAL: 'critical',
  NORMAL: 'normal',
  LOW: 'low'
})

export const ALERT_LIST_LIMIT = 50
export const PAGE_SIZE = 50

export function isDefaultSessionTitle(title) {
  return ['', '新会话', '新对话'].includes(String(title || '').trim())
}

export function deriveConversationTitle(text, attachments = []) {
  const normalized = String(text || '')
    .trim()
    .split(/\s+/u)
    .join(' ')
  if (normalized && !isGenericConversationOpening(normalized)) {
    return [...normalized].slice(0, 20).join('')
  }
  const filename = String(attachments[0]?.name || '').trim()
  if (!filename || filename === 'blob') return attachments.length ? '图片分析' : ''
  const base = filename.replace(/\.[^.]+$/u, '')
  return [...`${base} · 图片分析`].slice(0, 20).join('')
}

function isGenericConversationOpening(text) {
  return ['你好', '你好！', '你好。', 'hi', 'hello', '在吗', '开始'].includes(text.toLowerCase())
}

const ALERT_SEVERITY = Object.freeze({
  critical: ALERT_IMPORTANCE.CRITICAL,
  fatal: ALERT_IMPORTANCE.CRITICAL,
  high: ALERT_IMPORTANCE.CRITICAL,
  warning: ALERT_IMPORTANCE.NORMAL,
  warn: ALERT_IMPORTANCE.NORMAL,
  medium: ALERT_IMPORTANCE.NORMAL,
  info: ALERT_IMPORTANCE.LOW,
  low: ALERT_IMPORTANCE.LOW,
  debug: ALERT_IMPORTANCE.LOW
})

export function alertImportance(env) {
  const tagged = env?.importance
  if (
    tagged === ALERT_IMPORTANCE.CRITICAL ||
    tagged === ALERT_IMPORTANCE.NORMAL ||
    tagged === ALERT_IMPORTANCE.LOW
  ) {
    return tagged
  }
  const level = env?.payload?.level
  if (typeof level === 'number' && Number.isFinite(level)) {
    if (level >= 3) return ALERT_IMPORTANCE.CRITICAL
    if (level >= 1) return ALERT_IMPORTANCE.LOW
    return ALERT_IMPORTANCE.NORMAL
  }
  if (typeof level === 'string') {
    const mapped = ALERT_SEVERITY[level.toLowerCase()]
    if (mapped) return mapped
  }
  return ALERT_IMPORTANCE.NORMAL
}

function isPending(msg) {
  return /^(local|stream|evt)-.+/u.test(msg.id)
}

function byIdAsc(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function tsMs(ts) {
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null
  if (!ts) return null
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : t
}

function byTsAsc(a, b) {
  const ta = tsMs(a.ts)
  const tb = tsMs(b.ts)
  if (ta === null || tb === null) return 0
  return ta - tb
}

export function insertIndexByTs(list, ts) {
  const t = tsMs(ts)
  if (t === null) return list.length
  let i = list.length
  while (i > 0) {
    const cur = tsMs(list[i - 1].ts)
    if (cur === null || cur <= t) break
    i -= 1
  }
  return i
}

export function reconcileMessages(existing, fetched) {
  const serverById = new Map()
  for (const m of existing) if (!isPending(m)) serverById.set(m.id, m)
  for (const m of fetched) serverById.set(m.id, m)
  const server = [...serverById.values()].sort(byIdAsc)

  const pool = fetched.map((m) => ({
    side: m.role === 'user' ? 'user' : 'assistant',
    text: m.text,
    message: m,
    used: false
  }))
  const kept = []
  for (const m of existing) {
    if (!isPending(m)) continue
    if (m.channel !== 'dialogue') {
      kept.push(m)
      continue
    }
    const side = m.role === 'user' ? 'user' : 'assistant'
    const hit = pool.find((p) => !p.used && p.side === side && p.text === m.text)
    if (hit) {
      hit.used = true
      for (const key of [
        'agentName',
        'toolCalls',
        'delegations',
        'reasoning',
        'reasoningRounds',
        'modelResolution',
        'traceId',
        'turns',
        'usage',
        'error'
      ]) {
        if (m[key] !== undefined && m[key] !== null) hit.message[key] = m[key]
      }
      continue
    }
    kept.push(m)
  }
  return [...server, ...kept].sort(byTsAsc)
}

export function parseToolArguments(value) {
  if (!value || typeof value !== 'string') return value || ''
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const SYSTEM_ACTIVITY_KINDS = new Set([
  'workflow_started',
  'task_assigned',
  'task_reassigned',
  'task_started',
  'task_waiting_input',
  'task_paused',
  'task_failed',
  'task_completed',
  'workflow_failed',
  'workflow_completed'
])

export function agentRoleFromIdentity(agentId = '', explicitRole = '') {
  if (explicitRole) return explicitRole
  const normalized = String(agentId || '').trim()
  if (!normalized) return 'leader'
  if (normalized.includes(':')) return normalized.split(':', 1)[0]
  return normalized.replace(/-\d+$/u, '')
}

export function isSystemActivityMetadata(metadata = {}) {
  if (metadata.system_activity === true || metadata.message_type === 'activity') return true
  return SYSTEM_ACTIVITY_KINDS.has(metadata.message_kind)
}

export function fromRest(row) {
  const isUser = row.role === 'user'
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const agentName = isUser ? '' : row.agent_id || meta.agent_id || 'leader'
  const systemActivity = !isUser && isSystemActivityMetadata(meta)
  const tools = Array.isArray(meta.tools) ? meta.tools : []
  const normalizeTool = (tool) => ({
    id: tool.call_id || `${tool.agent_id || 'leader'}-${tool.name}`,
    name: tool.name || 'tool',
    status: tool.status || 'done',
    params: parseToolArguments(tool.arguments),
    result: tool.result ?? '',
    ...(tool.truncated === true ? { truncated: true } : {})
  })
  return {
    id: row.id,
    role: isUser ? 'user' : systemActivity ? 'system' : 'assistant',
    agentName,
    targetAgentId: isUser ? meta.target_agent_id || '' : '',
    agentRole: isUser ? '' : agentRoleFromIdentity(agentName, meta.agent_role),
    messageKind: meta.message_kind || '',
    systemActivity,
    activity: systemActivity
      ? {
          workflowId: meta.workflow_id || '',
          taskId: meta.task_id || '',
          subtaskId: meta.subtask_id || '',
          status: meta.status || '',
          reason: meta.reason || '',
          resultSummary: meta.result_summary || '',
          assignedAgentId: meta.assigned_agent_id || '',
          assignedRobotId: meta.assigned_robot_id || ''
        }
      : null,
    text: row.content || '',
    attachments: Array.isArray(meta.attachments) ? meta.attachments : [],
    runId: row.run_id || '',
    traceId: row.trace_id || '',
    toolCalls: tools.filter((tool) => !tool.agent_id).map(normalizeTool),
    delegations: (Array.isArray(meta.delegations) ? meta.delegations : []).map((item, index) => ({
      id: `${row.id}-delegation-${index}`,
      agentName: item.agent_id || 'subagent',
      agentRole: String(item.agent_id || 'subagent').replace(/-\d+$/u, ''),
      task: item.task || '',
      // 历史消息可能由修复前的 Server 写入，需在薄 DTO 转换边界净化，
      // 不能让 Provider 内嵌思考作为 SubAgent 可见答案重新出现。
      result: stripEmbeddedThinkBlocks(item.text),
      reasoning: item.reasoning || '',
      status: item.status || 'done',
      tools: tools.filter((tool) => tool.agent_id === item.agent_id).map(normalizeTool),
      ts: row.created_at
    })),
    turns: meta.turns,
    usage: meta.usage || null,
    error: meta.error || undefined,
    reasoning: meta.reasoning || '',
    reasoningRounds: meta.reasoning_rounds || [],
    modelResolution: meta.model || null,
    reasoningPolicy: {
      effort: meta.reasoning_effort || '',
      visibility: meta.reasoning_visibility || ''
    },
    ts:
      !isUser && !systemActivity
        ? meta.started_at || row.started_at || row.created_at
        : row.created_at,
    status:
      meta.status === 'cancelled'
        ? MESSAGE_STATUS.CANCELLED
        : meta.status === 'failed'
          ? MESSAGE_STATUS.ERROR
          : MESSAGE_STATUS.DONE,
    channel: 'dialogue',
    type: 'history'
  }
}

export function freshBucket() {
  return { list: [], earliestPage: 1, total: 0, loaded: false, loadingEarlier: false }
}

export function restInteractionResult(row) {
  if (row.status === 'answered') {
    return row.reply?.approved ? INTERACTION_RESULT.APPROVED : INTERACTION_RESULT.REJECTED
  }
  if (row.status === 'cancelled') return INTERACTION_RESULT.CANCELLED
  return INTERACTION_RESULT.EXPIRED
}
