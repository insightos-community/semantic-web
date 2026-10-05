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

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateRuntimeCommand } from '@/domain/simulation'

const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/simulation/v1/${name}.json`, import.meta.url), 'utf8')
  )

describe('v0.4 canonical simulation fixtures', () => {
  it('只接受 v1 native profile 的实际场景与 Robot 标识', () => {
    const profile = fixture('runtime-profile-native')
    expect(Object.keys(profile).sort()).toEqual(
      [
        'api_version',
        'available',
        'capabilities',
        'engine',
        'environment',
        'environment_ready',
        'loader',
        'name',
        'runtime_profile_id',
        'scene_kinds',
        'unavailable_reason'
      ].sort()
    )
    expect(profile).toMatchObject({
      runtime_profile_id: 'native-mujoco',
      api_version: 'v1',
      scene_kinds: ['scene_document', 'asset_scene'],
      environment_ready: true,
      available: true
    })
    expect(profile.capabilities.robot_models).toEqual(['r1_pro_chassis'])
  })

  it('用同一 bundle、启动请求和低层命令驱动 Studio 输入', () => {
    const profile = fixture('runtime-profile-native')
    const bundle = fixture('runtime-bundle')
    const start = fixture('scene-start-request')
    const command = fixture('robot-command-joint')

    expect(bundle.runtime_profile_id).toBe(profile.runtime_profile_id)
    expect(bundle.document.nodes[0]).toMatchObject({
      kind: 'robot',
      properties: { model: 'r1_pro_chassis' }
    })
    expect(start).toMatchObject({
      runtime_profile_id: profile.runtime_profile_id,
      runtime_bundle_id: bundle.runtime_bundle_id,
      layout: 'layout001',
      render_backend: 'egl'
    })
    expect(Object.keys(command).sort()).toEqual(
      ['command_id', 'joint_trajectory', 'scene_generation', 'timeout_seconds', 'type'].sort()
    )
    expect(validateRuntimeCommand(command.type, command.joint_trajectory)).toBe('')
    expect(command.joint_trajectory.points[1].positions).toEqual({ left_arm_joint1: 0.3 })
  })

  it('保留 Profile 原生 evaluator 证据而不解释成 Task 结果', () => {
    const evaluation = fixture('scene-evaluation-profile')
    expect(evaluation).toMatchObject({
      scene_key: 'libero_spatial:0',
      generation: 1,
      runtime_profile_id: 'libero-robosuite-1.4',
      success: false,
      metrics: { suite: 'libero_spatial', task_id: 0 }
    })
  })
})
