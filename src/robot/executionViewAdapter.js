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

import { compactFeedback } from '@/robot/executionRecords'

const rows = (value) => (Array.isArray(value) ? value : [])
const terminalStatuses = new Set([
  'completed',
  'succeeded',
  'failed',
  'stopped',
  'cancelled',
  'canceled',
  'interrupted'
])

export function currentExecutionStage(execution = {}) {
  const stages = rows(execution.stages)
  // 摘要已前进而详细事件尚未到达时，应显示摘要中的准确 Stage 名称，
  // 不能用任意旧阶段的 label / status 冒充它。
  if (execution.stage)
    return (
      stages.find((stage) => stage.name === execution.stage || stage.id === execution.stage) || null
    )
  return stages.at(-1) || null
}

// 只派生展示语义：Execution 结束不代表 Pilot 已上报每个 Stage 的终态。
export function lastReportedStageStatus(execution, stage) {
  if (
    !terminalStatuses.has(execution?.status) ||
    !stage?.status ||
    terminalStatuses.has(stage.status)
  )
    return ''
  return (
    {
      running: '运行中',
      busy: '运行中',
      pending: '等待中',
      queued: '排队中',
      starting: '启动中',
      waiting_agent: '等待 Agent',
      waiting_input: '等待输入',
      stopping: '停止中',
      cancelling: '取消中',
      paused: '已暂停',
      unknown: '未知',
      not_reported: '未上报'
    }[stage.status] || stage.status
  )
}

const TELEMETRY_FIELDS = [
  {
    key: 'contact_detected',
    label: '工具接触',
    format: (value) => (value ? '已检测' : '未检测')
  },
  {
    key: 'grip_force_n',
    label: '夹持力',
    format: (value) => {
      const force = Number(value)
      return Number.isFinite(force) ? `${force.toFixed(2)} N` : String(value)
    }
  },
  {
    key: 'slip_detected',
    label: '滑移',
    format: (value) => (value ? '已检测' : '未检测')
  },
  {
    key: 'overload_detected',
    label: '过载',
    format: (value) => (value ? '已检测' : '未检测')
  }
]

function actionId(item) {
  return item?.action_id || item?.id || ''
}

function stageNames(stage) {
  return new Set([stage?.id, stage?.name].filter(Boolean))
}

function refsFrom(value) {
  return rows(value).filter((item) => typeof item === 'string' && item)
}

function unique(values) {
  return [...new Set(values)]
}

function recordReferences(item) {
  return [
    ...refsFrom(item?.artifact_refs),
    ...refsFrom(item?.evidence_refs),
    ...(typeof item?.data_ref === 'string' && item.data_ref ? [item.data_ref] : [])
  ]
}

// Stage.completed 的 evidence_refs 可以是整个 Skill 的累计引用。用正式
// Observation / Action 的归属解析图片，不能把引用它的每个后续 Stage 当作拍摄阶段。
function artifactOwnership(execution, actions) {
  const records = rows(execution.artifact_sync)
  const stageName = (name) => {
    if (!name) return ''
    const stage = rows(execution.stages).find((item) => item.id === name || item.name === name)
    return stage?.name || stage?.id || name
  }
  const stageFor = (item) =>
    stageName(
      item?.stage ||
        (item?.action_id
          ? actions.find((action) => actionId(action) === item.action_id)?.stage
          : '')
    )
  const identity = (ref) => {
    const record = records.find((item) => recordMatchesReference(execution, item, ref))
    return record?.server_artifact_id ? `artifact://${record.server_artifact_id}` : ref
  }
  const owners = new Map()
  const add = (reference, item, priority) => {
    const stage = stageFor(item)
    if (!reference || !stage) return
    const key = identity(reference)
    const previous = owners.get(key)
    if (previous && previous.priority > priority) return
    const sources = previous?.priority === priority ? previous.sources : []
    sources.push({ stage, observation: item })
    owners.set(key, { priority, sources })
  }
  for (const observation of rows(execution.observations))
    for (const ref of recordReferences(observation))
      // 采集 Observation 优先于随后引用同一帧的判断/结果 Observation。
      add(ref, observation, observation.kind === 'sensor.frame' ? 3 : 2)
  for (const action of actions) for (const ref of recordReferences(action)) add(ref, action, 1)
  for (const record of records) {
    if (record.execution_id && execution.id && record.execution_id !== execution.id) continue
    const observation = rows(execution.observations).find(
      (item) => item.id && item.id === record.observation_id
    )
    add(
      record.server_artifact_id ? `artifact://${record.server_artifact_id}` : record.ref,
      observation || record,
      observation?.kind === 'sensor.frame' ? 3 : observation ? 2 : 1
    )
  }
  return {
    stageFor,
    sources: (ref) => owners.get(identity(ref))?.sources || [],
    stageName
  }
}

function artifactForRecord(record) {
  if (record?.status !== 'synced' || !record.server_artifact_id) return null
  return {
    id: record.server_artifact_id,
    media_type: record.media_type || 'application/octet-stream',
    summary: record.summary || record.ref || record.server_artifact_id,
    size: Number(record.size_bytes || record.size || 0),
    captured_at: record.captured_at || record.observed_at || '',
    metadata: record.metadata || {}
  }
}

function recordMatchesReference(execution, record, ref) {
  if (typeof ref !== 'string' || !ref) return false
  if (record.execution_id && execution.id && record.execution_id !== execution.id) return false
  return (
    record.ref === ref ||
    `artifact://${record.server_artifact_id}` === ref ||
    Boolean(
      record.pilot_instance_id &&
      record.local_artifact_id &&
      `pilot-artifact://${record.pilot_instance_id}/${record.local_artifact_id}` === ref
    )
  )
}

function resolveArtifacts(execution, references) {
  const records = rows(execution?.artifact_sync)
  const artifacts = []
  const unresolvedRefs = []

  for (const ref of references) {
    const record = records.find((item) => recordMatchesReference(execution, item, ref))
    // 正式 artifact:// 引用可直接按鉴权 API 读取；没有元数据时由响应 MIME
    // 决定是否预览图片。Pilot 本地引用始终等待同步，不推测图片路径。
    const id = /^artifact:\/\/([^/]+)$/.exec(ref)?.[1]
    const artifact =
      artifactForRecord(record) ||
      (!record && id ? { id, media_type: '', summary: id, size: 0, metadata: {} } : null)
    if (!artifact) {
      unresolvedRefs.push(ref)
      continue
    }
    if (!artifacts.some((item) => item.id === artifact.id)) artifacts.push(artifact)
  }
  return { artifacts, unresolvedRefs }
}

function telemetryFromObservations(observations) {
  const latest = {}
  for (const observation of observations) {
    const value = observation?.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    for (const field of TELEMETRY_FIELDS) {
      if (Object.hasOwn(value, field.key)) latest[field.key] = value[field.key]
    }
  }
  return TELEMETRY_FIELDS.filter((field) => Object.hasOwn(latest, field.key)).map((field) => ({
    key: field.key,
    label: field.label,
    value: field.format(latest[field.key]),
    alert:
      field.key === 'slip_detected' || field.key === 'overload_detected'
        ? Boolean(latest[field.key])
        : false
  }))
}

/**
 * 将 Robot Execution 的正式时间线记录整理为一个 Stage 的只读视图。
 *
 * 这里刻意不从 message、summary 或 measurements 猜测夹持状态：接触、夹持力、
 * 滑移和过载只接受 Ability Observation.value 的同名字段。Artifact 也只有在
 * Pilot→Server 同步记录已经给出 server_artifact_id 后才成为可读取卡片，避免
 * 把 pilot 本地路径或 evidence 文本伪装成已经存在的 Server 文件。
 */
export function buildRobotStageView(execution = {}, stage = {}) {
  const names = stageNames(stage)
  const allActions = rows(execution.actions).length
    ? rows(execution.actions)
    : execution.current_action
      ? [execution.current_action]
      : []
  const actions = allActions.filter((item) => names.has(item.stage))
  const ownership = artifactOwnership(execution, allActions)
  const selectedName = ownership.stageName(stage.name || stage.id)
  const belongsToStage = (item) => ownership.stageFor(item) === selectedName && !!selectedName
  const chronologicalFeedback = rows(execution.feedback).filter(belongsToStage)
  const chronologicalObservations = rows(execution.observations).filter(belongsToStage)
  const observationIds = new Set(chronologicalObservations.map((item) => item.id).filter(Boolean))
  const stageArtifacts = rows(execution.artifact_sync).filter(
    (item) => belongsToStage(item) || observationIds.has(item.observation_id)
  )
  const references = unique([
    ...refsFrom(stage.evidence_refs),
    ...stageArtifacts
      .map((item) => (item.server_artifact_id ? `artifact://${item.server_artifact_id}` : item.ref))
      .filter(Boolean),
    ...actions.flatMap(recordReferences),
    ...chronologicalObservations.flatMap(recordReferences)
  ])
  const stageReferences = references.filter((ref) => {
    // 无 Stage 名称的调用是完整执行导出，不按阶段筛掉原始证据。
    if (!selectedName) return true
    const owners = ownership.sources(ref)
    return !owners.length || owners.every((item) => item.stage === selectedName)
  })
  const { artifacts, unresolvedRefs } = resolveArtifacts(execution, stageReferences)
  for (const artifact of artifacts) {
    const sources = ownership.sources(`artifact://${artifact.id}`)
    const source = sources.every((item) => item.stage === sources[0]?.stage) ? sources[0] : null
    const observation = source?.observation
    artifact.captured_at =
      observation?.observed_at || observation?.occurred_at || artifact.captured_at || ''
    const captureStage = rows(execution.stages).find(
      (item) => item.name === source?.stage || item.id === source?.stage
    )
    artifact.stage = source ? captureStage?.name || source.stage : stage.name || stage.label
    artifact.stage_label = captureStage?.label || stage.label
    const action = actions.find((item) => actionId(item) === observation?.action_id)
    if (action?.action_key?.startsWith('stage-rgb:')) {
      try {
        const identity = JSON.parse(action.action_key.slice('stage-rgb:'.length))
        if (identity[0] === execution.id && identity[2] === artifact.stage)
          artifact.capture_point = identity[3]
      } catch {
        /* Older actions may not retain a structured capture identity. */
      }
    }
  }

  return {
    actions,
    feedback: compactFeedback(chronologicalFeedback).reverse(),
    observations: [...chronologicalObservations].reverse(),
    telemetry: telemetryFromObservations(chronologicalObservations),
    // 原始累计引用仍供 Inspector / 导出审阅；预览与采集状态只用准确归属的引用。
    evidence: references,
    stageEvidence: stageReferences,
    artifacts,
    unresolvedRefs
  }
}
