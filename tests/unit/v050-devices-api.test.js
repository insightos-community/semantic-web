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

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}))

import request from '@/api/request'
import {
  createPilotEnrollment,
  getDevice,
  getDeviceSnapshot,
  getRobotExecution,
  installRobotSkill,
  listProjectRobotExecutions,
  setRobotSkillEnabled,
  startAbilityDebug,
  stopAbilityDebug,
  stopRobotExecution,
  uninstallRobotSkill
} from '@/api/devices'

describe('v0.5 Device API adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('创建 Pilot 加入码使用专用 enrollment 入口', async () => {
    await createPilotEnrollment()
    expect(request.post).toHaveBeenLastCalledWith('/pilot-enrollments')
  })

  it('使用 Server 的设备与 Project Execution 路径', async () => {
    request.get.mockResolvedValueOnce({ snapshot: { robots: [] } })
    await getDeviceSnapshot()
    expect(request.get).toHaveBeenLastCalledWith('/devices/snapshot')

    await getDevice('r1/pro 1')
    expect(request.get).toHaveBeenLastCalledWith('/devices/r1%2Fpro%201')

    await listProjectRobotExecutions('project/1')
    expect(request.get).toHaveBeenLastCalledWith('/projects/project%2F1/robot-executions')

    await getRobotExecution('rex/1', 12)
    expect(request.get).toHaveBeenLastCalledWith('/robot-executions/rex%2F1', {
      params: { after_sequence: 12 }
    })
  })

  it('Robot stop 只提交明确 execution_id', async () => {
    await stopRobotExecution('robot-1', 'rex-1')
    expect(request.post).toHaveBeenCalledWith('/devices/robot-1/stop', {
      execution_id: 'rex-1'
    })
  })

  it('Skill 安装、启停和卸载使用精确版本命令路径', async () => {
    const skill = { name: 'grasp/object', version: '0.1.0 rc1' }
    await installRobotSkill('robot-1', skill)
    expect(request.post).toHaveBeenLastCalledWith(
      '/devices/robot-1/skills/grasp%2Fobject/0.1.0%20rc1/install'
    )

    await setRobotSkillEnabled('robot-1', { ...skill, enabled: true })
    expect(request.post).toHaveBeenLastCalledWith(
      '/devices/robot-1/skills/grasp%2Fobject/0.1.0%20rc1/enable'
    )
    await setRobotSkillEnabled('robot-1', { ...skill, enabled: false })
    expect(request.post).toHaveBeenLastCalledWith(
      '/devices/robot-1/skills/grasp%2Fobject/0.1.0%20rc1/disable'
    )

    await uninstallRobotSkill('robot-1', skill)
    expect(request.delete).toHaveBeenCalledWith(
      '/devices/robot-1/skills/grasp%2Fobject/0.1.0%20rc1'
    )
  })

  it('Ability debug 始终经过 Server→Pilot 命令，不拼 AbilityFramework 地址', async () => {
    await startAbilityDebug('robot-1', 'ability-1', {
      task_name: 'VerifyArrival',
      input: { x: 1 }
    })
    expect(request.post).toHaveBeenLastCalledWith('/devices/robot-1/abilities/debug', {
      ability_instance_id: 'ability-1',
      task_name: 'VerifyArrival',
      input: { x: 1 }
    })

    await stopAbilityDebug('robot-1', 'debug-1')
    expect(request.post).toHaveBeenLastCalledWith('/devices/robot-1/abilities/debug/debug-1/stop')
  })
})
