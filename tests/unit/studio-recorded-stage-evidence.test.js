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
import { useRobotStore } from '@/stores/robot'
import { buildRobotStageView } from '@/robot/executionViewAdapter'
import { finalStageEvidence } from '@/studio/executionProcess'
import { recordedPlaceEvidence } from '../fixtures/studioRecordedEvidence'

beforeEach(() => setActivePinia(createPinia()))

describe('真实记录形状：累计 Stage 引用与拍摄归属', () => {
  it('VLA 验收失败的空引用保留此前 stage.evidence 上报的图像', () => {
    const robots = useRobotStore()
    const id = 'rex-vla-failed'
    const ref = 'pilot-artifact://pilot/frame-final'
    robots.upsert({ id, status: 'running', artifact_sync: [{
      execution_id: id, pilot_instance_id: 'pilot', local_artifact_id: 'frame-final',
      server_artifact_id: 'image-final', media_type: 'image/jpeg', status: 'synced'
    }] })
    for (const [index, type] of ['stage.running', 'stage.evidence', 'stage.failed'].entries())
      robots.appendExecutionEvent(id, { execution_id: id, sequence: index + 1, type,
        payload: { stage: 'verify_result', evidence_refs: type === 'stage.evidence' ? [ref] : [] }
      })
    const execution = robots.byId(id)
    expect(execution.stages[0].status).toBe('failed')
    expect(buildRobotStageView(execution, execution.stages[0]).artifacts)
      .toMatchObject([{ id: 'image-final' }])
  })

  it('累计2/3/5张只预览各阶段自己的1张，最终空Stage refs仍从两次sensor.frame取图', () => {
    const { execution, events } = recordedPlaceEvidence()
    const robots = useRobotStore()
    robots.upsert(execution)
    for (const event of events) robots.appendExecutionEvent(execution.id, event)
    const value = robots.byId(execution.id)
    const view = (name) =>
      buildRobotStageView(
        value,
        value.stages.find((s) => s.name === name)
      )
    for (const [stage, image] of [
      ['observe_target_slot', 2],
      ['approach', 3],
      ['verify_stability', 5]
    ]) {
      const result = view(stage)
      expect(result.artifacts).toMatchObject([{ id: `${execution.id}-image-${image}`, stage }])
      expect(result.artifacts).toHaveLength(1)
      expect(result.evidence).toContain(`pilot-artifact://fixture-pilot/${execution.id}-local-1`)
      expect(result.stageEvidence).not.toContain(
        `pilot-artifact://fixture-pilot/${execution.id}-local-1`
      )
    }
    expect(view('retreat').artifacts).toEqual([])
    expect(view('retreat').stageEvidence).toEqual(['evidence://ability/retreat'])
    expect(finalStageEvidence(value).artifacts.map((item) => item.id)).toEqual([
      `${execution.id}-image-6`,
      `${execution.id}-image-7`
    ])
    expect(finalStageEvidence(value).artifacts[0].captured_at).toBe(
      '2026-09-07T13:25:06.123083+00:00'
    )
    expect(value.status).toBe('completed')
    expect(value.stages.at(-1).status).toBe('completed')
    // 聚合导出依然可读全部七帧，且每张保留实际采集阶段，不剪掉原始引用。
    const aggregate = buildRobotStageView(value, {
      evidence_refs: value.artifact_sync.map((item) => `artifact://${item.server_artifact_id}`)
    })
    expect(aggregate.artifacts).toHaveLength(7)
    expect(aggregate.artifacts[0].stage).toBe('verify_held_object')
  })

  it('明确Observation阶段优先于Action，未知归属才按Stage引用回退', () => {
    const execution = {
      actions: [
        { action_id: 'capture', stage: 'observe' },
        { action_id: 'verify', stage: 'verify', evidence_refs: ['artifact://action-image'] }
      ],
      observations: [
        { action_id: 'capture', data_ref: 'artifact://via-action' },
        { stage: 'verify', action_id: 'capture', evidence_refs: ['artifact://explicit-stage'] }
      ]
    }
    const view = buildRobotStageView(execution, {
      name: 'verify',
      evidence_refs: ['artifact://via-action', 'artifact://legacy-unknown']
    })
    expect(view.artifacts.map((item) => item.id)).toEqual([
      'legacy-unknown',
      'action-image',
      'explicit-stage'
    ])
    expect(view.observations).toHaveLength(1)
    expect(view.artifacts.every((item) => item.stage === 'verify')).toBe(true)
  })

  it('最终Stage累计旧照片而自身没有采集时，不把旧图冒充最终证据', () => {
    const value = {
      stage: 'finish',
      stages: [{ name: 'finish', evidence_refs: ['artifact://old'] }],
      observations: [{ kind: 'sensor.frame', stage: 'observe', evidence_refs: ['artifact://old'] }]
    }
    expect(finalStageEvidence(value).artifacts).toEqual([])
    expect(buildRobotStageView(value, value.stages[0]).evidence).toEqual(['artifact://old'])
  })
})
