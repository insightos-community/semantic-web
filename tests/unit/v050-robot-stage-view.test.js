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

import { describe, expect, it } from 'vitest'
import { buildRobotStageView, lastReportedStageStatus } from '@/robot/executionViewAdapter'

describe('v0.5 Robot Stage 正式执行视图', () => {
  it('Execution 终态的非终态 Stage 仅标为最后上报，不改写阶段事实', () => {
    const stage = Object.freeze({ name: 'grasp', status: 'running' })
    for (const status of ['failed', 'completed', 'stopped', 'cancelled'])
      expect(lastReportedStageStatus({ status }, stage)).toBe('运行中')
    expect(stage.status).toBe('running')
    expect(lastReportedStageStatus({ status: 'running' }, stage)).toBe('')
    expect(lastReportedStageStatus({ status: 'failed' }, { status: 'completed' })).toBe('')
    expect(lastReportedStageStatus({ status: 'failed' }, { status: 'failed' })).toBe('')
  })
  it('只读取 Observation.value 的正式工具状态字段', () => {
    const view = buildRobotStageView(
      {
        actions: [{ action_id: 'action-close', stage: 'grasp' }],
        observations: [
          {
            id: 'obs-contact',
            action_id: 'action-close',
            kind: 'gripper_contact',
            observed_at: '2026-08-15T10:00:01Z',
            value: {
              contact_detected: true,
              grip_force_n: 18.5,
              slip_detected: false,
              contact: false,
              force_n: 999
            }
          }
        ]
      },
      { id: 'stage-grasp', name: 'grasp' }
    )

    expect(view.telemetry).toEqual([
      { key: 'contact_detected', label: '工具接触', value: '已检测', alert: false },
      { key: 'grip_force_n', label: '夹持力', value: '18.50 N', alert: false },
      { key: 'slip_detected', label: '滑移', value: '未检测', alert: false }
    ])
    expect(view.telemetry.some((item) => item.key === 'overload_detected')).toBe(false)
  })

  it('仅把已同步到 Server 的真实 ArtifactRef 转为可读取卡片', () => {
    const view = buildRobotStageView(
      {
        observations: [
          {
            id: 'obs-rgbd',
            stage: 'observe_target',
            kind: 'rgbd_capture',
            artifact_refs: ['artifact://art-rgb-001', 'pilot-artifact://pilot-1/depth-local'],
            value: { overload_detected: true }
          }
        ],
        artifact_sync: [
          {
            ref: 'artifact://art-rgb-001',
            server_artifact_id: 'art-rgb-001',
            status: 'synced',
            media_type: 'image/png',
            summary: '抓取前 RGB'
          },
          {
            ref: 'pilot-artifact://pilot-1/depth-local',
            server_artifact_id: '',
            status: 'uploading',
            media_type: 'application/x-depth-map'
          }
        ]
      },
      { name: 'observe_target', evidence_refs: ['artifact://art-rgb-001'] }
    )

    expect(view.artifacts).toEqual([
      expect.objectContaining({
        id: 'art-rgb-001',
        media_type: 'image/png',
        summary: '抓取前 RGB'
      })
    ])
    expect(view.unresolvedRefs).toEqual(['pilot-artifact://pilot-1/depth-local'])
    expect(view.telemetry).toEqual([
      { key: 'overload_detected', label: '过载', value: '已检测', alert: true }
    ])
  })
})
