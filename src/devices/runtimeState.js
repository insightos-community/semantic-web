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

export const ROBOT_RUNTIME_STATUSES = Object.freeze([
  'starting',
  'ready',
  'degraded',
  'stopping',
  'stopped',
  'failed',
  'interrupted'
])

const validStatus = new Set(ROBOT_RUNTIME_STATUSES)

export function runtimeInstanceFromRobot(robot) {
  return robot?.runtime_instance || null
}

export function normalizeRobotRuntimeInstance(raw, robotId = '') {
  if (!raw || typeof raw !== 'object') return null
  const status = String(raw.status || 'interrupted')
  return {
    instance_id: String(raw.instance_id || ''),
    robot_id: String(raw.robot_id || robotId || ''),
    scene_instance_id: String(raw.scene_instance_id || ''),
    status: validStatus.has(status) ? status : 'interrupted',
    failure_reason: String(raw.failure_reason || ''),
    revision: Math.max(0, Number(raw.revision) || 0),
    created_at: raw.created_at || '',
    updated_at: raw.updated_at || ''
  }
}

export function runtimeAllowsRobotExecution(runtime) {
  // ready 表示 Pilot、AbilityFramework 和所需 Ability 已完成就绪检查；是否能
  // 执行由这一状态直接决定，避免 Server 另外持久化可能互相矛盾的布尔字段。
  return runtime?.status === 'ready'
}
