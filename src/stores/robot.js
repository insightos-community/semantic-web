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

import { defineStore } from 'pinia'
import * as devicesApi from '@/api/devices'
import { compactFeedback, feedbackDisplayKey } from '@/robot/executionRecords'
import { getRun } from '@/api/runs'
import { getSpans } from '@/api/traces'

export const ACTIVE_ROBOT_EXECUTION_STATUSES = new Set([
  'queued',
  'starting',
  'running',
  'waiting_agent',
  'stopping'
])

const asNumber = (value) => Math.max(0, Number(value) || 0)
const asArray = (value) => (Array.isArray(value) ? value : [])

const normalizeExecution = (execution, current = null) => {
  if (!execution?.id) return null
  return {
    ...current,
    ...execution,
    stages: execution.stages == null ? asArray(current?.stages) : asArray(execution.stages),
    actions: execution.actions == null ? asArray(current?.actions) : asArray(execution.actions),
    feedback:
      execution.feedback == null || execution.feedback === current?.feedback
        ? asArray(current?.feedback)
        : compactFeedback(asArray(execution.feedback)),
    observations:
      execution.observations == null
        ? asArray(current?.observations)
        : asArray(execution.observations),
    artifact_sync:
      execution.artifact_sync == null
        ? asArray(current?.artifact_sync)
        : asArray(execution.artifact_sync),
    progress: execution.progress === undefined ? (current?.progress ?? null) : execution.progress
  }
}

const itemKey = {
  stages: (item) => item?.id || item?.name || '',
  actions: (item) => item?.action_id || item?.id || item?.action_key || '',
  feedback: feedbackDisplayKey,
  observations: (item, event) =>
    item?.id ||
    `${item?.action_id || ''}:${item?.source || ''}:${item?.type || item?.kind || ''}:${item?.sequence ?? item?.occurred_at ?? event.sequence}`,
  artifact_sync: (item, event) =>
    item?.local_artifact_id || item?.server_artifact_id || item?.ref || `event:${event.sequence}`
}

function mergeTimelineItem(items, item, keyFor, event) {
  if (!item || typeof item !== 'object') return items
  const key = keyFor(item, event)
  if (!key) return [...items, item]
  const index = items.findIndex((candidate) => keyFor(candidate, event) === key)
  if (index < 0) return [...items, item]
  const next = [...items]
  const merged = {
    ...items[index],
    ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))
  }
  // stage.running 也用于周期反馈，进入时间应保留最早值；历史回放可能
  // 晚于当前快照到达，取两者最早时间才能稳定恢复真实阶段顺序。
  if (keyFor === itemKey.stages && items[index].started_at && item.started_at)
    merged.started_at = [items[index].started_at, item.started_at].sort()[0]
  // 阶段证据是增量记录。后续进度或终态事件的空引用表示本次没有新增证据，
  // 不能清除 stage.evidence 已登记的照片，否则失败验收阶段会丢失图像入口。
  if (keyFor === itemKey.stages)
    merged.evidence_refs = [
      ...new Set([...asArray(items[index].evidence_refs), ...asArray(item.evidence_refs)])
    ]
  next.splice(index, 1, merged)
  return next
}

function timelineKind(type = '') {
  const value = String(type).toLowerCase()
  if (value.includes('artifact') && value.includes('sync')) return 'artifact_sync'
  if (value.includes('observation')) return 'observations'
  if (value.includes('feedback')) return 'feedback'
  if (value.includes('stage')) return 'stages'
  if (value.includes('action')) return 'actions'
  return ''
}

function normalizeExecutionEvent(rawEvent, fallbackExecutionId = '', fallbackSequence = 0) {
  if (!rawEvent || typeof rawEvent !== 'object') return null
  const payload = rawEvent.payload || {}
  const executionId =
    rawEvent.execution_id ||
    payload.execution_id ||
    payload.execution?.id ||
    fallbackExecutionId ||
    rawEvent.resource_id ||
    ''
  if (!executionId) return null
  return {
    ...rawEvent,
    execution_id: executionId,
    type: rawEvent.type || rawEvent.event_type || '',
    sequence: asNumber(
      rawEvent.execution_sequence ??
        rawEvent.event_sequence ??
        rawEvent.sequence ??
        payload.execution_sequence ??
        payload.event_sequence ??
        fallbackSequence
    ),
    payload
  }
}

export function robotExecutionIdFromEvent(event) {
  const payload = event?.payload || {}
  return (
    payload.execution?.id ||
    payload.event?.execution_id ||
    payload.event?.payload?.execution_id ||
    event?.execution_id ||
    event?.resource_id ||
    ''
  )
}

function timelineItem(event, kind) {
  const payload = event.payload || {}
  if (kind === 'stages') {
    const item =
      payload.stage_summary ||
      (payload.stage && typeof payload.stage === 'object' ? payload.stage : null) ||
      payload.value
    if (item && typeof item === 'object') return item
    if (typeof payload.stage !== 'string' || !payload.stage) return null
    const result = {
      id: payload.stage,
      name: payload.stage,
      status:
        payload.stage_status ||
        (event.type.endsWith('.failed')
          ? 'failed'
          : event.type.endsWith('.completed')
            ? 'completed'
            : event.type === 'stage.started' || event.type === 'stage.running'
              ? 'running'
              : undefined),
      progress: payload.progress,
      expectation: payload.expectation,
      observation:
        payload.observation_summary ||
        (event.type === 'stage.running' ? payload.summary : undefined),
      recovery_reason: payload.deviation,
      evidence_refs: payload.evidence_refs,
      next_step: payload.next_step,
      updated_at: event.created_at || payload.occurred_at || ''
    }
    // stage.progress 的 summary 通常是 accepted/running/succeeded 这类采样值，
    // 它属于当前观测而不是阶段名称。只有 Stage 进入事件才能定义用户可读标题，
    // 后续进度事件只更新观测、偏差和进度，不能把语义阶段改名为 running。
    if (event.type === 'stage.running' || event.type === 'stage.started') {
      result.label = payload.summary || payload.stage
      result.started_at = event.created_at || payload.occurred_at || ''
    }
    if (event.type === 'stage.completed' || event.type === 'stage.failed') {
      result.completed_at = event.created_at || payload.occurred_at || ''
    }
    return result
  }
  if (kind === 'feedback') {
    const item = payload.feedback || payload.value
    return item
      ? {
          ...item,
          action_id: item.action_id || payload.action_id,
          action_type: item.action_type || payload.action_type,
          stage: item.stage || payload.stage,
          occurred_at: item.occurred_at || event.created_at || payload.occurred_at
        }
      : null
  }
  if (kind === 'observations') {
    const item = payload.observation || payload.value
    return item
      ? {
          ...item,
          action_id: item.action_id || payload.action_id,
          action_type: item.action_type || payload.action_type,
          stage: item.stage || payload.stage,
          occurred_at: item.occurred_at || event.created_at || payload.occurred_at
        }
      : null
  }
  if (kind === 'artifact_sync') {
    const item = payload.artifact_sync || payload.artifact || payload.value
    return item
      ? {
          ...item,
          stage: item.stage || payload.stage,
          action_id: item.action_id || payload.action_id
        }
      : null
  }
  if (kind === 'actions') {
    const item =
      payload.action ||
      payload.current_action ||
      payload.value ||
      (payload.action_id ? payload : null)
    if (!item) return null
    return {
      ...item,
      action_id: item.action_id || item.id || payload.action_id,
      action_type: item.action_type || item.type || payload.action_type,
      stage: item.stage || payload.stage,
      started_at:
        item.started_at ||
        (event.type === 'action.started' ? event.created_at || payload.occurred_at : undefined),
      completed_at:
        item.completed_at ||
        (event.type === 'action.terminal' ? event.created_at || payload.occurred_at : undefined)
    }
  }
  return null
}

function updatesExecutionStatus(type = '') {
  return type.startsWith('execution.') || type === 'skill.stop.finalized'
}

export const useRobotStore = defineStore('robotExecutions', {
  state: () => ({
    projectId: '',
    executions: [],
    selectedExecutionId: '',
    eventsByExecution: {},
    eventPages: {},
    scopeGeneration: 0,
    tracesByRun: {},
    traceErrors: {},
    traceLoadingIds: [],
    eventSequenceByExecution: {},
    detailLoadingIds: [],
    loading: false,
    startRequests: [],
    stopRequests: [],
    error: ''
  }),
  getters: {
    byId: (state) => (executionId) =>
      state.executions.find((item) => item.id === executionId) || null,
    currentForRobot: (state) => (robot) => {
      const executionId = String(robot?.current_execution_id || '')
      if (!executionId) return null
      const execution = state.executions.find((item) => item.id === executionId) || null
      return execution?.robot_id === robot?.robot_id ? execution : null
    },
    selected: (state) =>
      state.executions.find((item) => item.id === state.selectedExecutionId) || null,
    active: (state) =>
      state.executions.filter((item) => ACTIVE_ROBOT_EXECUTION_STATUSES.has(item.status)),
    forRobot: (state) => (robotId) => state.executions.filter((item) => item.robot_id === robotId),
    startPending: (state) => (robotId) => state.startRequests.includes(robotId),
    stopPending: (state) => (executionId) => state.stopRequests.includes(executionId),
    eventsFor: (state) => (executionId) => state.eventsByExecution[executionId] || [],
    eventSequenceFor: (state) => (executionId) => state.eventSequenceByExecution[executionId] || 0,
    detailLoading: (state) => (executionId) => state.detailLoadingIds.includes(executionId)
  },
  actions: {
    hydrate(projectId, executions = []) {
      this.scopeGeneration += 1
      this.projectId = projectId || ''
      this.executions = executions.map(normalizeExecution).filter(Boolean)
      this.eventsByExecution = {}
      this.eventSequenceByExecution = {}
      this.eventPages = {}
      this.tracesByRun = {}
      this.traceErrors = {}
      this.traceLoadingIds = []
      this.detailLoadingIds = []
      if (!this.byId(this.selectedExecutionId))
        this.selectedExecutionId = this.executions[0]?.id || ''
    },
    mergeExecutions(executions = []) {
      for (const execution of executions) this.upsert(execution)
      if (!this.selectedExecutionId) this.selectedExecutionId = this.executions[0]?.id || ''
    },
    async loadDetail(executionId, { allPages = true, more = false } = {}) {
      const current = this.byId(executionId)
      if (!current) return null
      if (this.detailLoadingIds.includes(executionId)) return current
      this.detailLoadingIds.push(executionId)
      const generation = this.scopeGeneration
      this.error = ''
      try {
        let afterSequence = more ? asNumber(this.eventPages[executionId]?.cursor) : 0
        let response
        const persistedEvents = []
        do {
          try {
            response = await devicesApi.getRobotExecution(executionId, afterSequence)
          } catch (error) {
            if (!persistedEvents.length) throw error
            if (generation !== this.scopeGeneration) return null
            this.error = error.message || '后续执行记录读取失败'
            this.eventPages[executionId] = {
              loaded: true,
              hasMore: true,
              cursor: afterSequence,
              error: this.error
            }
            break
          }
          if (generation !== this.scopeGeneration) return null
          if (response?.execution?.id && response.execution.id !== executionId)
            throw new Error('Robot Execution 响应身份不匹配')
          if (response?.execution) this.upsert(response.execution)
          persistedEvents.push(...asArray(response?.events))
          this.eventPages[executionId] = {
            loaded: true,
            hasMore: response?.has_more === true,
            cursor: asNumber(
              response?.next_sequence ?? response?.events?.at(-1)?.sequence ?? afterSequence
            ),
            error: ''
          }
          if (response?.has_more === true) {
            const nextSequence = asNumber(response?.next_sequence)
            if (nextSequence <= afterSequence) throw new Error('Robot Execution 事件分页没有前进')
            afterSequence = nextSequence
          }
        } while (allPages && response?.has_more === true)
        const bufferedEvents = asArray(this.eventsByExecution[executionId])
        const events = persistedEvents
          .concat(bufferedEvents)
          .sort((left, right) => asNumber(left?.sequence) - asNumber(right?.sequence))
        const seenSequences = new Set()
        this.eventsByExecution[executionId] = []
        this.eventSequenceByExecution[executionId] = 0
        // 从原始事件重建展示，避免分页回放时重复累计已合并告警。
        // 这里取已按 revision 合并后的 Store，不是可能晚到的 HTTP 旧响应。
        const acceptedSnapshot = this.byId(executionId)
        this.upsert({ ...acceptedSnapshot, feedback: [] })
        for (const event of events) {
          const sequence = asNumber(event?.sequence)
          if (sequence > 0 && seenSequences.has(sequence)) continue
          if (sequence > 0) seenSequences.add(sequence)
          this.appendExecutionEvent(executionId, event)
        }
        // 回放可以只含首批旧事件；完整 Execution 摘要的 stage 仍是当前事实，
        // 不能被早期 stage.running 倒退（详细阶段可继续按页补齐）。
        if (acceptedSnapshot?.stage)
          this.upsert({ ...this.byId(executionId), stage: acceptedSnapshot.stage })
        return this.byId(executionId)
      } catch (error) {
        if (generation !== this.scopeGeneration) return null
        this.error = error.message || 'Robot Execution 详情加载失败'
        this.eventPages[executionId] = { ...this.eventPages[executionId], error: this.error }
        return this.byId(executionId)
      } finally {
        if (generation === this.scopeGeneration)
          this.detailLoadingIds = this.detailLoadingIds.filter((id) => id !== executionId)
      }
    },
    loadMoreEvents(executionId) {
      return this.loadDetail(executionId, { allPages: false, more: true })
    },
    async loadRunTrace(run) {
      if (!run?.id || this.traceLoadingIds.includes(run.id)) return
      const generation = this.scopeGeneration
      this.traceLoadingIds.push(run.id)
      delete this.traceErrors[run.id]
      try {
        const detail = run.trace_id ? run : (await getRun(run.id))?.run
        if (generation !== this.scopeGeneration) return
        if (!detail?.trace_id) {
          this.traceErrors[run.id] = '该 Run 未提供 Trace 引用'
          return
        }
        const response = await getSpans(detail.trace_id)
        if (generation !== this.scopeGeneration) return
        this.tracesByRun[run.id] = {
          run: detail,
          run_id: run.id,
          trace_id: detail.trace_id,
          spans: asArray(response?.spans)
        }
      } catch (error) {
        if (generation === this.scopeGeneration)
          this.traceErrors[run.id] = error.message || 'Trace 读取失败'
      } finally {
        if (generation === this.scopeGeneration)
          this.traceLoadingIds = this.traceLoadingIds.filter((id) => id !== run.id)
      }
    },
    async loadProject(projectId) {
      this.loading = true
      this.error = ''
      try {
        const response = await devicesApi.listProjectRobotExecutions(projectId)
        this.hydrate(projectId, response?.executions || [])
        return this.executions
      } catch (error) {
        this.error = error.message || 'Robot Execution 加载失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    upsert(execution) {
      if (!execution?.id) return false
      const index = this.executions.findIndex((item) => item.id === execution.id)
      const current = index < 0 ? null : this.executions[index]
      if (
        asNumber(execution.revision) &&
        asNumber(execution.revision) < asNumber(current?.revision)
      )
        return false
      const next = normalizeExecution(execution, index < 0 ? null : this.executions[index])
      if (
        current?.status &&
        !ACTIVE_ROBOT_EXECUTION_STATUSES.has(current.status) &&
        ACTIVE_ROBOT_EXECUTION_STATUSES.has(next.status)
      )
        next.status = current.status
      if (index < 0) this.executions.unshift(next)
      else this.executions.splice(index, 1, next)
      return true
    },
    appendExecutionEvent(executionId, rawEvent, fallbackSequence = 0) {
      const event = normalizeExecutionEvent(rawEvent, executionId, fallbackSequence)
      if (!event || event.execution_id !== executionId) return false
      const current = this.byId(executionId)
      if (!current) return false
      if (this.projectId && current.project_id && current.project_id !== this.projectId)
        return false
      const cursor = this.eventSequenceFor(executionId)
      if (event.sequence && event.sequence <= cursor) return false

      const kind = timelineKind(event.type)
      const item = timelineItem(event, kind)
      const next = { ...current }
      if (
        ['stages', 'actions', 'feedback', 'observations', 'artifact_sync'].includes(kind) &&
        item
      ) {
        next[kind] = mergeTimelineItem(asArray(current[kind]), item, itemKey[kind], event)
        if (kind === 'stages')
          next.stages.sort(
            (left, right) =>
              (Date.parse(left.started_at || left.updated_at) || Infinity) -
              (Date.parse(right.started_at || right.updated_at) || Infinity)
          )
        if (kind === 'feedback') {
          const previous = asArray(current.feedback).find(
            (value) => feedbackDisplayKey(value) === feedbackDisplayKey(item)
          )
          const feedback = next.feedback.find(
            (value) => feedbackDisplayKey(value) === feedbackDisplayKey(item)
          )
          feedback.repeat_count = (previous?.repeat_count || (previous ? 1 : 0)) + 1
        }
        if (kind === 'actions') next.current_action = { ...current.current_action, ...item }
      } else if (kind === 'stages' && event.type === 'stage.completed') {
        // 旧 Worker 的 stage.completed 没有携带 stage。完成事件严格对应最后一个
        // 未终结阶段；这里只为已持久的旧事件补全展示，新 Skill 会直接上报名称。
        const stages = asArray(current.stages)
        const index = [...stages].map((stage) => stage.status).lastIndexOf('running')
        if (index >= 0) {
          next.stages = stages.map((stage, stageIndex) =>
            stageIndex === index
              ? { ...stage, status: 'completed', completion_summary: event.payload.summary }
              : stage
          )
        }
      }
      // Stage 和 Action 也有自己的 status。只有 Execution 领域事件才能
      // 推进顶层状态，否则迟到的 Action 终态会覆盖 completed 或 stopped。
      let executionStatus = ''
      if (event.payload.skill_status) executionStatus = event.payload.skill_status
      else if (event.payload.status && updatesExecutionStatus(event.type))
        executionStatus = event.payload.status
      if (
        executionStatus &&
        !(
          next.status &&
          !ACTIVE_ROBOT_EXECUTION_STATUSES.has(next.status) &&
          ACTIVE_ROBOT_EXECUTION_STATUSES.has(executionStatus)
        )
      )
        next.status = executionStatus
      if (updatesExecutionStatus(event.type)) {
        if (event.payload.error) next.error = event.payload.error
        if (event.payload.result) next.result = event.payload.result
      }
      // Execution 当前 Stage 只能由正在执行的 Stage 事件推进。详情回放可能同时
      // 包含未来的 pending Stage，Action/Feedback 也会携带归属 Stage；若直接取
      // 最后一个 payload.stage，页面会错误跳到尚未开始或已经结束的阶段。
      if (kind === 'stages' && item && ['running', 'in_progress'].includes(item.status)) {
        next.stage = item.name || item.id
      }
      this.upsert(next)

      if (!this.eventsByExecution[executionId]) this.eventsByExecution[executionId] = []
      this.eventsByExecution[executionId].push(event)
      if (event.sequence) this.eventSequenceByExecution[executionId] = event.sequence
      return true
    },
    applyEvent(event) {
      const payload = event?.payload || {}
      const execution = payload.execution
      const executionId = robotExecutionIdFromEvent(event)
      if (!executionId) return false
      const current = this.byId(executionId)
      const projectId = execution?.project_id || current?.project_id || ''
      if (this.projectId && projectId && projectId !== this.projectId) return false
      let changed = false

      if (execution) {
        const revision = asNumber(event.resource_revision || execution.revision)
        if (!current || !revision || revision > asNumber(current.revision)) {
          changed =
            this.upsert({
              ...execution,
              revision: revision || execution.revision
            }) || changed
        }
      }

      // 两条流到达顺序可能相反。旧 Project 事件可以补时间线，但不能把
      // 已由较新 Device / REST 摘要确认的当前阶段倒退。
      const snapshotStage = execution?.stage ? this.byId(executionId)?.stage : ''

      if (payload.event) {
        changed = this.appendExecutionEvent(executionId, payload.event) || changed
      } else {
        const eventSequence = asNumber(
          event.execution_sequence || payload.execution_sequence || payload.event_sequence
        )
        const kind = timelineKind(event.type || payload.type)
        // Device 流只携带 Execution 摘要，外层 sequence 属于全局设备流。
        // 只有内层 event / 显式 execution_sequence 才能推进本执行的游标，
        // 否则较大的全局游标会让后续 Project 内层阶段事件被误判为旧事件。
        if ((kind || eventSequence) && (!execution || eventSequence)) {
          const timelinePayload = { ...payload }
          delete timelinePayload.execution
          delete timelinePayload.event
          changed =
            this.appendExecutionEvent(
              executionId,
              {
                ...event,
                type: event.type || payload.type,
                sequence: eventSequence || event.sequence,
                payload: timelinePayload
              },
              event.sequence
            ) || changed
        }
      }
      if (snapshotStage && this.byId(executionId)?.stage !== snapshotStage)
        this.upsert({ ...this.byId(executionId), stage: snapshotStage })
      return changed
    },
    async select(executionId, { loadDetail = true } = {}) {
      const current = this.byId(executionId)
      if (!current) return null
      this.selectedExecutionId = executionId
      if (!loadDetail) return current
      return await this.loadDetail(executionId)
    },
    async startSkillDebug(projectId, robotId, skill, input, requestKey) {
      if (!projectId || !robotId || !skill?.name || !skill?.version) return null
      if (this.startRequests.includes(robotId)) return null
      this.startRequests.push(robotId)
      this.error = ''
      try {
        const response = await devicesApi.startRobotSkillExecution(projectId, robotId, {
          skill_name: skill.name,
          skill_version: skill.version,
          input,
          request_key: requestKey
        })
        if (response?.execution) {
          this.upsert(response.execution)
          this.selectedExecutionId = response.execution.id
        }
        return response?.execution || null
      } catch (error) {
        this.error = error.message || 'Robot Skill 调试启动失败'
        throw error
      } finally {
        this.startRequests = this.startRequests.filter((id) => id !== robotId)
      }
    },
    async stop(execution) {
      if (!execution?.id || this.stopRequests.includes(execution.id)) return null
      this.stopRequests.push(execution.id)
      try {
        const response = await devicesApi.stopRobotExecution(execution.robot_id, execution.id)
        // 这里只应用 Server 的响应；绝不在请求发出时假设 Robot 已经 stopped。
        if (response?.execution) this.upsert(response.execution)
        return response
      } finally {
        this.stopRequests = this.stopRequests.filter((id) => id !== execution.id)
      }
    },
    clear() {
      const generation = this.scopeGeneration + 1
      this.$reset()
      this.scopeGeneration = generation
    }
  }
})
