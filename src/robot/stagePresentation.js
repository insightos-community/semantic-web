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

const labels = {
  observe_target: '观察目标',
  approach: '接近',
  grasp: '抓取',
  lift_and_verify: '抬升与验证',
  prepare_transport: '准备运输',
  validate_target: '检查目标',
  prepare: '执行准备',
  execute_policy: '执行策略',
  verify_result: '验收结果',
  plan_route: '规划路线',
  navigate: '导航',
  follow_path: '沿路径移动',
  verify_arrival: '确认到达',
  verify_held_object: '检查持物',
  observe_target_slot: '观察目标位置',
  plan_approach: '规划接近',
  release: '释放',
  retreat: '撤离',
  verify_placement: '验证放置',
  restore_travel_posture: '恢复行走姿态'
}

export function stageTitle(stage = {}) {
  const name = typeof stage === 'string' ? stage : stage.name || stage.id || ''
  return labels[name] || (typeof stage === 'object' && stage.label) || name || '阶段'
}

export function evidenceTitle(artifact = {}) {
  if (!artifact.stage) return artifact.summary || artifact.id
  const point = artifact.capture_point || artifact.metadata?.point
  const timing =
    point === 'entry' ? '执行前' : ['exit', 'completed'].includes(point) ? '完成后' : ''
  return `${stageTitle({ name: artifact.stage, label: artifact.stage_label })}阶段${timing}图像`
}
