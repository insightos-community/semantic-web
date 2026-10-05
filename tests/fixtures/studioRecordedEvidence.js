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

// 从 round01 的 place-object 记录抽取协议形状；身份和字节响应均为隔离测试数据。
// 真实记录的 stage.completed 引用累计，但 sensor.frame 每次只引用本次拍摄帧。
export function recordedPlaceEvidence(id = 'recorded-place') {
  const names = [
    'verify_held_object',
    'observe_target_slot',
    'plan_approach',
    'approach',
    'release',
    'retreat',
    'verify_stability',
    'restore_travel_posture'
  ]
  const execution = {
    id,
    project_id: 'proj-v020-demo',
    skill_name: 'place-object',
    status: 'completed',
    stage: names.at(-1),
    revision: 100,
    created_at: '2026-09-07T13:25:04.000000001Z',
    artifact_sync: []
  }
  const events = []
  const cumulative = []
  const add = (type, payload) =>
    events.push({
      execution_id: id,
      sequence: events.length + 1,
      type,
      created_at: '2026-09-07T13:26:02Z',
      payload
    })
  let image = 0
  for (const stage of names) {
    add('stage.running', { stage, summary: stage })
    const count = ['plan_approach', 'retreat'].includes(stage)
      ? 0
      : stage === 'restore_travel_posture'
        ? 2
        : 1
    for (let sample = 0; sample < count; sample++) {
      image++
      const local = `${id}-local-${image}`
      const ref = `pilot-artifact://fixture-pilot/${local}`
      cumulative.push(ref)
      execution.artifact_sync.push({
        pilot_instance_id: 'fixture-pilot',
        local_artifact_id: local,
        server_artifact_id: `${id}-image-${image}`,
        execution_id: id,
        media_type: 'image/jpeg',
        summary: 'Robot Skill 关键检查点传感器证据',
        size_bytes: 33409,
        status: 'synced'
      })
      add('observation.recorded', {
        stage,
        observation: {
          id: `${id}-observation-${image}`,
          kind: 'sensor.frame',
          schema_version: 2,
          artifact_refs: [],
          data_ref: null,
          evidence_refs: [ref],
          source: 'robot-sdk://fixture-robot/sensor/camera.rgb',
          observed_at: `2026-09-07T13:25:0${image}.123083+00:00`,
          value: { media_type: 'image/jpeg', encoding: 'jpeg', width: 640, height: 480 }
        }
      })
    }
    add('stage.completed', {
      stage,
      evidence_refs: ['plan_approach', 'restore_travel_posture'].includes(stage)
        ? []
        : [...cumulative, `evidence://ability/${stage}`]
    })
  }
  add('execution.terminal', { status: 'completed', result: { placed: true } })
  return { execution, events, complete_pagination: true }
}
