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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/devices', () => ({
  getDeviceSnapshot: vi.fn(),
  getDevice: vi.fn(),
  listProjectRobotExecutions: vi.fn(),
  getRobotExecution: vi.fn(),
  stopRobotExecution: vi.fn(),
  startRobotSkillExecution: vi.fn(),
  installRobotSkill: vi.fn(),
  setRobotSkillEnabled: vi.fn(),
  uninstallRobotSkill: vi.fn(),
  startAbilityDebug: vi.fn(),
  stopAbilityDebug: vi.fn(),
  subscribeDeviceFixture: vi.fn(),
  usingDeviceFixtures: vi.fn(() => false)
}))

import * as devicesApi from '@/api/devices'
import { createDeviceSubscription } from '@/devices/subscription'
import { createStudioSubscription } from '@/studio/subscription'
import { useAbilityStore } from '@/stores/ability'
import { useArtifactSyncStore } from '@/stores/artifactSync'
import { useDeviceStore } from '@/stores/device'
import { useProjectStore } from '@/stores/project'
import { ACTIVE_ROBOT_EXECUTION_STATUSES, useRobotStore } from '@/stores/robot'

const robot = {
  robot_id: 'r1pro-1',
  display_name: 'R1 Pro 1',
  model: 'r1pro',
  backend: 'fake',
  environment: 'simulation',
  status: 'busy',
  pilot: { instance_id: 'pilot-1', status: 'online' },
  ability_framework: { status: 'ready', healthy_instances: 1, total_instances: 1 },
  installed_skills: [],
  abilities: [{ instance_id: 'ability-1', ability_name: 'Navigation', health: 'healthy' }],
  revision: 2
}

const execution = {
  id: 'rex-1',
  project_id: 'project-1',
  robot_id: 'r1pro-1',
  skill_name: 'semantic-navigation',
  status: 'running',
  progress: null,
  revision: 3,
  artifact_sync: [
    {
      local_artifact_id: 'local-1',
      server_artifact_id: 'server-1',
      status: 'synced'
    }
  ]
}

describe('v0.5 设备工作台状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    devicesApi.usingDeviceFixtures.mockReturnValue(true)
  })

  it('用一个设备 Snapshot 恢复 Robot、Ability、Execution 和 Artifact 同步状态', () => {
    const devices = useDeviceStore()
    const robots = useRobotStore()
    const abilities = useAbilityStore()
    const artifacts = useArtifactSyncStore()
    const snapshot = {
      event_sequence: 20,
      robots: [robot],
      skill_packages: [{ name: 'semantic-navigation', version: '0.1.0' }],
      executions: [execution]
    }

    devices.hydrate(snapshot)
    robots.hydrate('', snapshot.executions)
    abilities.hydrateRobot(robot.robot_id, robot.abilities)
    artifacts.hydrateExecutions(snapshot.executions)

    expect(devices.byId('r1pro-1').pilot.status).toBe('online')
    expect(robots.byId('rex-1').progress).toBeNull()
    expect(abilities.forRobot('r1pro-1')[0].instance_id).toBe('ability-1')
    expect(artifacts.forExecution('rex-1')[0].server_artifact_id).toBe('server-1')
  })

  it('旧 Robot revision 不回退状态，新 revision 更新状态', () => {
    const devices = useDeviceStore()
    devices.hydrate({ event_sequence: 10, robots: [robot] })

    expect(
      devices.applyRobotEvent({
        resource_revision: 1,
        payload: { robot: { ...robot, status: 'idle', revision: 1 } }
      })
    ).toBe(false)
    expect(devices.byId('r1pro-1').status).toBe('busy')

    expect(
      devices.applyRobotEvent({
        resource_revision: 3,
        payload: { robot: { ...robot, status: 'stopping', revision: 3 } }
      })
    ).toBe(true)
    expect(devices.byId('r1pro-1').status).toBe('stopping')
  })

  it('Pilot 部分状态事件不会清空 Robot Skill 与 Ability 目录', () => {
    const devices = useDeviceStore()
    devices.hydrate({
      robots: [
        {
          ...robot,
          installed_skills: [{ name: 'grasp-object', version: '0.1.0' }],
          desired_skills: [{ name: 'grasp-object', version: '0.1.0', enabled: true }]
        }
      ]
    })
    expect(
      devices.applyRobotEvent({
        resource_revision: 3,
        payload: { robot_id: 'r1pro-1', pilot: { robot_id: 'r1pro-1', status: 'degraded' } }
      })
    ).toBe(true)
    expect(devices.byId('r1pro-1').installed_skills).toHaveLength(1)
    expect(devices.byId('r1pro-1').desired_skills).toHaveLength(1)
    expect(devices.byId('r1pro-1').abilities).toHaveLength(1)
  })

  it('停止请求期间不在本地伪造 stopped，只采用 Server 返回的 stopping', async () => {
    const robots = useRobotStore()
    robots.hydrate('project-1', [execution])
    let resolveStop
    devicesApi.stopRobotExecution.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStop = resolve
        })
    )

    const pending = robots.stop(execution)
    expect(robots.byId('rex-1').status).toBe('running')
    expect(robots.stopPending('rex-1')).toBe(true)

    resolveStop({ execution: { ...execution, status: 'stopping', revision: 4 } })
    await pending
    expect(robots.byId('rex-1').status).toBe('stopping')
    expect(robots.stopPending('rex-1')).toBe(false)
  })

  it('历史 interrupted 不冒充当前执行，当前执行只服从 Server 指针', () => {
    const robots = useRobotStore()
    const interrupted = {
      ...execution,
      id: 'rex-interrupted-history',
      skill_name: 'grasp-object',
      status: 'interrupted'
    }
    robots.hydrate('project-1', [interrupted])

    expect(ACTIVE_ROBOT_EXECUTION_STATUSES.has('interrupted')).toBe(false)
    expect(robots.active).toHaveLength(0)
    expect(
      robots.currentForRobot({
        robot_id: interrupted.robot_id,
        current_execution_id: ''
      })
    ).toBeNull()
    expect(
      robots.currentForRobot({
        robot_id: interrupted.robot_id,
        current_execution_id: interrupted.id
      })?.id
    ).toBe(interrupted.id)
  })

  it('人工 Robot Skill 调试创建正式 Execution 并选中结果', async () => {
    const robots = useRobotStore()
    robots.hydrate('project-1', [])
    devicesApi.startRobotSkillExecution.mockResolvedValue({
      execution: {
        ...execution,
        id: 'rex-manual-1',
        skill_name: 'grasp-object',
        skill_version: '0.2.0',
        status: 'queued'
      }
    })

    const created = await robots.startSkillDebug(
      'project-1',
      'r1pro-1',
      { name: 'grasp-object', version: '0.2.0' },
      { target: { object_ref: 'tote-1' } },
      'manual-request-1'
    )

    expect(devicesApi.startRobotSkillExecution).toHaveBeenCalledWith('project-1', 'r1pro-1', {
      skill_name: 'grasp-object',
      skill_version: '0.2.0',
      input: { target: { object_ref: 'tote-1' } },
      request_key: 'manual-request-1'
    })
    expect(created.id).toBe('rex-manual-1')
    expect(robots.selectedExecutionId).toBe('rex-manual-1')
  })

  it('全局设备事件按 sequence 去重，并在缺口时请求重新读取 Snapshot', () => {
    const devices = useDeviceStore()
    devices.hydrate({ event_sequence: 10, robots: [robot] })
    const onGap = vi.fn()
    const subscription = createDeviceSubscription({ afterSequence: 10, onGap })

    subscription.applyEvent({
      id: 'event-11',
      sequence: 11,
      resource_type: 'robot',
      resource_revision: 3,
      payload: { robot: { ...robot, status: 'stopping', revision: 3 } }
    })
    expect(devices.lastEventSequence).toBe(11)
    expect(devices.byId('r1pro-1').status).toBe('stopping')

    subscription.applyEvent({
      id: 'event-13',
      sequence: 13,
      resource_type: 'robot',
      resource_revision: 4,
      payload: { robot: { ...robot, status: 'idle', revision: 4 } }
    })
    expect(onGap).toHaveBeenCalledWith(expect.objectContaining({ previousSequence: 11 }))
    expect(devices.lastEventSequence).toBe(11)
    expect(devices.stale).toBe(true)
  })

  it('同名 Skill 的安装状态按 Robot 隔离', async () => {
    const devices = useDeviceStore()
    devices.hydrate({
      robots: [
        robot,
        { ...robot, robot_id: 'r1pro-2', pilot: { instance_id: 'pilot-2', status: 'online' } }
      ]
    })
    const installedRobot = {
      ...robot,
      installed_skills: [
        { name: 'grasp-object', version: '0.1.0', enabled: false, status: 'installed' }
      ],
      revision: 3
    }
    devicesApi.installRobotSkill.mockResolvedValue({
      robot: installedRobot,
      robot_skill: installedRobot.installed_skills[0]
    })

    await devices.installSkill('r1pro-1', { name: 'grasp-object', version: '0.1.0' })
    expect(devices.byId('r1pro-1').installed_skills).toHaveLength(1)
    expect(devices.byId('r1pro-2').installed_skills).toHaveLength(0)
  })

  it('选择 Execution 时从持久事件完整回放时间线', async () => {
    const robots = useRobotStore()
    robots.hydrate('project-1', [
      { ...execution, stages: [], feedback: [], observations: [], artifact_sync: [] }
    ])
    robots.eventSequenceByExecution['rex-1'] = 4
    robots.eventsByExecution['rex-1'] = [
      {
        execution_id: 'rex-1',
        sequence: 4,
        type: 'artifact.sync.updated',
        payload: { artifact_sync: { local_artifact_id: 'local-2', status: 'uploading' } }
      }
    ]
    devicesApi.getRobotExecution
      .mockResolvedValueOnce({
        execution: {
          ...execution,
          revision: 4,
          stages: [],
          feedback: [],
          observations: [],
          artifact_sync: []
        },
        events: [
          {
            execution_id: 'rex-1',
            sequence: 1,
            type: 'stage.updated',
            payload: { stage: 'navigate', stage_status: 'running', expectation: '到达目标区域' }
          },
          {
            execution_id: 'rex-1',
            sequence: 2,
            type: 'feedback.emitted',
            payload: {
              action_id: 'action-route-1',
              action_type: 'navigation.follow_route',
              stage: 'navigate',
              feedback: { sequence: 7, message: '路线跟随中' }
            }
          }
        ],
        has_more: true,
        next_sequence: 2
      })
      .mockResolvedValueOnce({
        execution: {
          ...execution,
          revision: 4,
          stages: [],
          feedback: [],
          observations: [],
          artifact_sync: []
        },
        events: [
          {
            execution_id: 'rex-1',
            sequence: 3,
            type: 'observation.emitted',
            payload: { stage: 'navigate', observation: { id: 'obs-1', type: 'robot_pose' } }
          },
          {
            execution_id: 'rex-1',
            sequence: 4,
            type: 'artifact.sync.updated',
            payload: { artifact_sync: { local_artifact_id: 'local-2', status: 'uploading' } }
          }
        ],
        has_more: false,
        next_sequence: 4
      })

    await robots.select('rex-1')
    expect(devicesApi.getRobotExecution).toHaveBeenCalledWith('rex-1', 0)
    expect(devicesApi.getRobotExecution).toHaveBeenCalledWith('rex-1', 2)
    expect(robots.byId('rex-1').stages).toHaveLength(1)
    expect(robots.byId('rex-1').stages[0].expectation).toBe('到达目标区域')
    expect(robots.byId('rex-1').feedback).toHaveLength(1)
    expect(robots.byId('rex-1').feedback[0].action_id).toBe('action-route-1')
    expect(robots.byId('rex-1').observations).toHaveLength(1)
    expect(robots.byId('rex-1').artifact_sync).toHaveLength(1)
    expect(robots.eventSequenceFor('rex-1')).toBe(4)

    robots.appendExecutionEvent('rex-1', {
      execution_id: 'rex-1',
      sequence: 5,
      type: 'action.terminal',
      payload: {
        action_id: 'action-route-1',
        action_type: 'navigation.follow_route',
        stage: 'navigate',
        status: 'succeeded',
        ability_instance_id: 'ability-navigation-1'
      }
    })
    expect(robots.byId('rex-1').status).toBe(execution.status)
    expect(robots.byId('rex-1').current_action).toMatchObject({
      action_id: 'action-route-1',
      stage: 'navigate',
      status: 'succeeded',
      ability_instance_id: 'ability-navigation-1'
    })
    robots.appendExecutionEvent('rex-1', {
      execution_id: 'rex-1',
      sequence: 6,
      type: 'stage.updated',
      payload: { stage: { name: 'verify_arrival', status: 'pending' } }
    })
    expect(robots.byId('rex-1').stage).toBe('navigate')
    robots.appendExecutionEvent('rex-1', {
      execution_id: 'rex-1',
      sequence: 7,
      type: 'stage.running',
      payload: {
        stage: 'navigate',
        stage_status: 'running',
        summary: '沿路线前往目标区',
        expectation: 'Robot 到达目标且保持持物'
      }
    })
    robots.appendExecutionEvent('rex-1', {
      execution_id: 'rex-1',
      sequence: 8,
      type: 'stage.progress',
      payload: { stage: 'navigate', stage_status: 'running', summary: 'running', progress: 0.5 }
    })
    expect(robots.byId('rex-1').stages[0]).toMatchObject({
      name: 'navigate',
      label: '沿路线前往目标区',
      status: 'running',
      progress: 0.5
    })
    robots.appendExecutionEvent('rex-1', {
      execution_id: 'rex-1',
      sequence: 9,
      type: 'stage.completed',
      payload: { stage: 'navigate', stage_status: 'completed', summary: '路线执行完成' }
    })
    expect(robots.byId('rex-1').stages[0]).toMatchObject({
      name: 'navigate',
      label: '沿路线前往目标区',
      status: 'completed'
    })
    robots.appendExecutionEvent('rex-1', {
      execution_id: 'rex-1',
      sequence: 10,
      type: 'execution.terminal',
      payload: { skill_status: 'completed' }
    })
    robots.appendExecutionEvent('rex-1', {
      execution_id: 'rex-1',
      sequence: 11,
      type: 'complete',
      payload: { skill_status: 'running', status: 'completed' }
    })
    expect(robots.byId('rex-1').status).toBe('completed')
    const duplicate = robots.applyEvent({
      resource_type: 'robot_execution',
      resource_id: 'rex-1',
      resource_revision: 4,
      payload: {
        execution: { ...execution, revision: 4 },
        event: {
          execution_id: 'rex-1',
          sequence: 2,
          type: 'feedback.emitted',
          payload: { feedback: { sequence: 7, message: '重复反馈' } }
        }
      }
    })
    expect(duplicate).toBe(false)
    expect(robots.byId('rex-1').feedback).toHaveLength(1)
  })

  it('Project Studio 同时推进 Project 游标与 Execution 事件游标', () => {
    const project = useProjectStore()
    const robots = useRobotStore()
    project.hydrateSnapshot({
      project: { id: 'project-1', name: '测试项目', revision: 1 },
      event_sequence: 10
    })
    robots.hydrate('project-1', [{ ...execution, feedback: [], observations: [] }])
    const subscription = createStudioSubscription({ projectId: 'project-1', afterSequence: 10 })

    subscription.applyEvent({
      id: 'project-event-11',
      sequence: 11,
      resource_type: 'robot_execution',
      resource_id: 'rex-1',
      resource_revision: 4,
      payload: {
        execution: { ...execution, revision: 4 },
        event: {
          execution_id: 'rex-1',
          project_id: 'project-1',
          sequence: 7,
          type: 'feedback.emitted',
          payload: { feedback: { sequence: 9, message: '来自 Pilot 的反馈' } }
        }
      }
    })
    expect(project.lastEventSequence).toBe(11)
    expect(robots.byId('rex-1').feedback[0].message).toBe('来自 Pilot 的反馈')
    expect(robots.eventSequenceFor('rex-1')).toBe(7)

    subscription.applyEvent({
      id: 'project-event-12',
      sequence: 12,
      resource_type: 'robot_execution',
      resource_id: 'rex-1',
      type: 'observation.emitted',
      payload: {
        project_id: 'project-1',
        execution_id: 'rex-1',
        execution_sequence: 8,
        observation: { id: 'obs-2', type: 'held_object' }
      }
    })
    expect(robots.byId('rex-1').observations[0].id).toBe('obs-2')
    expect(robots.eventSequenceFor('rex-1')).toBe(8)
  })
})
