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

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createDeviceSubscription } from '@/devices/subscription'
import {
  normalizeRobotRuntimeInstance,
  ROBOT_RUNTIME_STATUSES,
  runtimeAllowsRobotExecution
} from '@/devices/runtimeState'
import { deviceFixture } from '@/fixtures/deviceFixture'
import { createStudioSubscription } from '@/studio/subscription'
import { useDeviceStore } from '@/stores/device'
import { useProjectStore } from '@/stores/project'

const runtime = (robotId, status = 'ready', revision = 1) => ({
  instance_id: `runtime-${robotId}`,
  robot_id: robotId,
  scene_instance_id: `scene-${robotId}`,
  status,
  revision
})

const robot = (robotId, status = 'ready') => ({
  robot_id: robotId,
  display_name: robotId,
  status: 'idle',
  pilot: { instance_id: `pilot-${robotId}`, status: 'online' },
  runtime_instance: runtime(robotId, status),
  revision: 1
})

describe('v0.5 Robot Runtime Instance', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('完整保留七种 Runtime 状态，并只允许 ready 状态执行动作', () => {
    for (const status of ROBOT_RUNTIME_STATUSES) {
      const normalized = normalizeRobotRuntimeInstance(runtime('robot-1', status), 'robot-1')
      expect(normalized.status).toBe(status)
      expect(runtimeAllowsRobotExecution(normalized)).toBe(status === 'ready')
    }
    const degraded = normalizeRobotRuntimeInstance(
      {
        ...runtime('robot-1', 'degraded'),
        failure_reason: 'Robot SDK Backend 初始化失败'
      },
      'robot-1'
    )
    expect(runtimeAllowsRobotExecution(degraded)).toBe(false)
    expect(degraded.failure_reason).toBe('Robot SDK Backend 初始化失败')
  })

  it('全局设备事件只更新目标 Robot 的 Runtime Instance', () => {
    const devices = useDeviceStore()
    devices.hydrate({ event_sequence: 10, robots: [robot('robot-a'), robot('robot-b')] })
    const subscription = createDeviceSubscription({ afterSequence: 10 })

    subscription.applyEvent({
      sequence: 11,
      resource_type: 'robot_runtime_instance',
      resource_revision: 2,
      payload: {
        runtime_instance: {
          ...runtime('robot-a', 'degraded', 2),
          failure_reason: 'Robot SDK Session 断开'
        }
      }
    })

    expect(devices.runtimeForRobot('robot-a').status).toBe('degraded')
    expect(devices.runtimeForRobot('robot-a').failure_reason).toBe('Robot SDK Session 断开')
    expect(devices.runtimeForRobot('robot-b').status).toBe('ready')
    expect(devices.lastEventSequence).toBe(11)
  })

  it('Project 事件更新 Runtime，同时保持 Project 事件游标', () => {
    const project = useProjectStore()
    const devices = useDeviceStore()
    project.hydrateSnapshot({
      project: { id: 'project-1', name: 'Runtime Project', revision: 1 },
      event_sequence: 20
    })
    devices.hydrate({ robots: [robot('robot-a'), robot('robot-b')] })
    const subscription = createStudioSubscription({ projectId: 'project-1', afterSequence: 20 })

    subscription.applyEvent({
      id: 'project-event-21',
      project_id: 'project-1',
      sequence: 21,
      resource_type: 'robot_runtime_instance',
      resource_revision: 2,
      payload: {
        runtime_instance: {
          ...runtime('robot-b', 'stopping', 2)
        }
      }
    })

    expect(devices.runtimeForRobot('robot-a').status).toBe('ready')
    expect(devices.runtimeForRobot('robot-b').status).toBe('stopping')
    expect(project.lastEventSequence).toBe(21)
  })

  it('Fixture 停止 Robot A 不改变 Robot B 及两边 Runtime Instance', async () => {
    const before = (await deviceFixture.getSnapshot()).snapshot
    const robotA = before.robots.find((item) => item.robot_id === 'r1pro-sim-001')
    const robotB = before.robots.find((item) => item.robot_id === 'r1pro-real-001')

    await deviceFixture.stopRobot(robotA.robot_id, robotA.current_execution_id)
    const after = (await deviceFixture.getSnapshot()).snapshot
    const stoppedA = after.robots.find((item) => item.robot_id === robotA.robot_id)
    const untouchedB = after.robots.find((item) => item.robot_id === robotB.robot_id)

    expect(stoppedA.status).toBe('stopping')
    expect(stoppedA.runtime_instance).toEqual(robotA.runtime_instance)
    expect(untouchedB.status).toBe('idle')
    expect(untouchedB.runtime_instance).toEqual(robotB.runtime_instance)
  })
})
