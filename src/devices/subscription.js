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

import { subscribeDeviceFixture, usingDeviceFixtures } from '@/api/devices'
import { useSessionStore } from '@/stores/session'
import { useDeviceStore } from '@/stores/device'
import { robotExecutionIdFromEvent, useRobotStore } from '@/stores/robot'
import { useAbilityStore } from '@/stores/ability'
import { useArtifactSyncStore } from '@/stores/artifactSync'
import { createWsClient, WS_STATUS } from '@/ws/client'

let activeSubscription = null

function devicesWsUrl(token) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const query = new URLSearchParams({ token })
  return `${proto}://${window.location.host}/ws/devices?${query.toString()}`
}

function normalizeStatus(status) {
  if (status === WS_STATUS.ONLINE || status === 'online') return 'online'
  if (status === WS_STATUS.CONNECTING || status === 'connecting') return 'connecting'
  if (status === WS_STATUS.RECONNECTING || status === 'reconnecting') return 'reconnecting'
  return 'offline'
}

export function createDeviceSubscription({ afterSequence = 0, onGap } = {}) {
  const devices = useDeviceStore()
  const robots = useRobotStore()
  const abilities = useAbilityStore()
  const artifactSync = useArtifactSyncStore()
  let lastSequence = Math.max(0, Number(afterSequence) || 0)
  let transport = null
  let closed = false

  const updateStatus = (status) => devices.setConnectionStatus(normalizeStatus(status))

  const applyEvent = (event) => {
    if (!event || closed) return
    // 侧栏手动补查也会推进快照游标，后续事件应从这个新基线继续。
    lastSequence = Math.max(lastSequence, devices.lastEventSequence)
    if (event.type === 'error' && event.code === 'SYNC_FAILED') {
      devices.stale = true
      onGap?.({ error: event, previousSequence: lastSequence })
      return
    }
    const sequence = Number(event.sequence || 0)
    if (sequence && sequence > lastSequence + 1) {
      devices.stale = true
      onGap?.({ event, previousSequence: lastSequence })
      return
    }
    if (sequence && sequence <= lastSequence) return

    if (event.resource_type === 'robot' || event.resource_type === 'pilot') {
      devices.applyRobotEvent(event)
      const robot = event.payload?.robot
      if (robot?.robot_id && Array.isArray(robot.abilities))
        abilities.hydrateRobot(robot.robot_id, robot.abilities)
    } else if (event.resource_type === 'robot_runtime_instance') {
      devices.applyRuntimeEvent(event)
    } else if (event.resource_type === 'robot_execution') {
      robots.applyEvent(event)
      const execution = robots.byId(robotExecutionIdFromEvent(event))
      if (execution) artifactSync.mergeExecutions([execution])
    } else if (event.resource_type === 'ability_debug') {
      abilities.applyDebugEvent(event)
    } else if (event.resource_type === 'artifact_sync') {
      artifactSync.applyEvent(event)
    }

    if (sequence) {
      lastSequence = sequence
      devices.advanceSequence(sequence)
    }
  }

  const api = {
    start() {
      activeSubscription?.stop()
      if (usingDeviceFixtures()) {
        transport = subscribeDeviceFixture({
          afterSequence,
          onEvent: applyEvent,
          onStatus: updateStatus
        })
      } else {
        const client = createWsClient({
          url: devicesWsUrl(useSessionStore().token),
          initialAfterSequence: afterSequence
        })
        client.onStatus(updateStatus)
        client.on('*', applyEvent)
        client.connect()
        transport = { close: () => client.disconnect() }
      }
      activeSubscription = api
      return api
    },
    stop() {
      if (closed) return
      closed = true
      transport?.close()
      transport = null
      updateStatus('offline')
      if (activeSubscription === api) activeSubscription = null
    },
    applyEvent
  }
  return api
}

export function stopActiveDeviceSubscription() {
  activeSubscription?.stop()
}
