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

import { studioFixture } from '@/fixtures/studioFixture'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { useConversationStore } from '@/stores/conversation'
import { useRunsStore } from '@/stores/runs'
import { useInteractionsStore } from '@/stores/interactions'
import { useChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useDeviceStore } from '@/stores/device'
import { robotExecutionIdFromEvent, useRobotStore } from '@/stores/robot'
import { useArtifactSyncStore } from '@/stores/artifactSync'
import { createDefaultDispatcher } from '@/ws/dispatcher'
import { createWsClient, WS_STATUS } from '@/ws/client'
import { clearStudioCommandTransport, setStudioCommandTransport } from '@/studio/commandGateway'

let activeSubscription = null

function studioWsUrl(projectId, token) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const query = new URLSearchParams({ project_id: projectId, token })
  return `${proto}://${window.location.host}/ws/studio?${query.toString()}`
}

function normalizeStatus(status) {
  if (status === WS_STATUS.ONLINE || status === 'online') return 'online'
  if (status === WS_STATUS.CONNECTING || status === 'connecting') return 'connecting'
  if (status === WS_STATUS.RECONNECTING || status === 'reconnecting') return 'reconnecting'
  return 'offline'
}

function normalizeForChat(event) {
  const parent = event.parent || {}
  const type =
    event.type === 'interaction.requested'
      ? 'interaction.request'
      : event.type === 'interaction.answered'
        ? 'interaction.resolved'
        : event.type
  return {
    ...event,
    channel: event.channel || event.resource_type,
    type,
    ts: event.ts || event.occurred_at,
    session_id: event.session_id || event.conversation_id,
    payload: {
      ...(event.payload || {}),
      run_id: event.run_id || parent.run_id || event.payload?.run_id,
      trace_id: event.trace_id || parent.trace_id || event.payload?.trace_id
    }
  }
}

function normalizeStudioEvent(event) {
  const payload = event?.payload || {}
  const parent = event?.parent || {}
  const rawResourceType = event?.resource_type || event?.channel || ''
  return {
    ...event,
    project_id:
      event?.project_id ||
      payload.project_id ||
      payload.execution?.project_id ||
      payload.runtime_instance?.project_id ||
      payload.event?.project_id ||
      payload.event?.payload?.project_id ||
      '',
    resource_type: rawResourceType === 'run' ? 'agent_run' : rawResourceType,
    resource_revision:
      event?.resource_revision ??
      event?.revision ??
      payload.execution?.revision ??
      payload.revision ??
      0,
    conversation_id: event?.conversation_id || event?.session_id || payload.conversation_id || '',
    run_id: event?.run_id || parent.run_id || payload.run_id || '',
    trace_id: event?.trace_id || parent.trace_id || payload.trace_id || '',
    occurred_at: event?.occurred_at || event?.ts || ''
  }
}

export function createStudioSubscription({ projectId, afterSequence = 0, onGap }) {
  const project = useProjectStore()
  const conversations = useConversationStore()
  const runs = useRunsStore()
  const interactions = useInteractionsStore()
  const chat = useChatStore()
  const robot = useRobotStore()
  const artifactSync = useArtifactSyncStore()
  const workflow = useWorkflowStore()
  const semanticMap = useSemanticMapStore()
  const devices = useDeviceStore()
  const dispatcher = createDefaultDispatcher()
  // sequence 是 Project 事件流的全局游标，不是资源自己的 revision。
  // 资源的新旧由各 Store 使用 resource_revision 判断。
  let lastProjectSequence = Math.max(0, Number(afterSequence) || 0)
  let closed = false
  let transport = null

  const updateStatus = (raw) => {
    const status = normalizeStatus(raw)
    project.setConnectionStatus(status)
    chat.setConnectionStatus(status)
  }

  const applyEvent = (rawEvent) => {
    if (!rawEvent) return
    if (rawEvent.type === 'error') {
      if (rawEvent.code === 'SYNC_FAILED') {
        project.stale = true
        onGap?.({ error: rawEvent, previousSequence: lastProjectSequence })
        return
      }
      if (
        rawEvent.code === 'INTERACTION_REPLY_FAILED' ||
        rawEvent.code === 'INTERACTION_CANCEL_FAILED'
      ) {
        interactions.failSubmissions(rawEvent.message)
      }
      chat.applyProtocolError(rawEvent)
      return
    }
    const event = normalizeStudioEvent(rawEvent)
    if (event.project_id !== projectId) return
    const sequence = Number(event.sequence || 0)
    if (sequence && sequence > lastProjectSequence + 1) {
      project.stale = true
      onGap?.({ event, previousSequence: lastProjectSequence })
      return
    }
    if (sequence && sequence <= lastProjectSequence) return

    if (event.resource_type === 'project') project.applyEvent(event)
    else if (event.resource_type === 'conversation') conversations.applyEvent(event)
    else if (event.resource_type === 'agent_run') runs.applyEvent(event)
    else if (event.resource_type === 'interaction') interactions.applyEvent(event)
    else if (['plan_proposal', 'workflow', 'task', 'subtask'].includes(event.resource_type)) {
      workflow.applyEvent(event)
    } else if (['semantic_map', 'map_entity', 'map_relation'].includes(event.resource_type)) {
      semanticMap.applyEvent(event)
    } else if (event.resource_type === 'robot_runtime_instance') {
      devices.applyRuntimeEvent(event)
    } else if (event.resource_type === 'robot_execution') {
      robot.applyEvent(event)
      const execution = robot.byId(robotExecutionIdFromEvent(event))
      if (execution) artifactSync.mergeExecutions([execution])
    } else if (event.resource_type === 'artifact_sync') {
      artifactSync.applyEvent(event)
    }

    const normalized = normalizeForChat(event)
    if (['dialogue', 'alert', 'artifact', 'interaction'].includes(normalized.channel)) {
      dispatcher.dispatch(normalized)
    }
    if (sequence) {
      lastProjectSequence = sequence
      project.advanceEventCursor(sequence, event.id)
    }
  }

  const start = () => {
    if (activeSubscription) activeSubscription.stop()
    if (import.meta.env.VITE_STUDIO_FIXTURES === 'true') {
      transport = studioFixture.subscribe(projectId, {
        afterSequence,
        onEvent: applyEvent,
        onStatus: updateStatus
      })
      setStudioCommandTransport((type, payload) => transport?.send(type, payload) === true)
    } else {
      const token = useSessionStore().token
      const client = createWsClient({
        url: studioWsUrl(projectId, token),
        initialAfterSequence: afterSequence
      })
      client.onStatus(updateStatus)
      client.on('*', applyEvent)
      client.connect()
      transport = {
        send: (type, payload) => client.send(type, payload),
        close: () => client.disconnect()
      }
      setStudioCommandTransport((type, payload) => transport?.send(type, payload) === true)
    }
    activeSubscription = api
    return api
  }

  const stop = () => {
    if (closed) return
    closed = true
    transport?.close()
    transport = null
    clearStudioCommandTransport()
    updateStatus('offline')
    if (activeSubscription === api) activeSubscription = null
  }

  const api = { projectId, start, stop, applyEvent }
  return api
}

export function stopActiveStudioSubscription() {
  activeSubscription?.stop()
}
