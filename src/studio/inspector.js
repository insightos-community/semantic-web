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

// 只有已有属性页的资源才创建 Inspector。编辑器焦点本身（例如对话、
// Agent 列表）不等同于选中了业务对象，不再生成只有 Resource ID 的空详情。
const supportedTypes = new Set([
  'map_entity',
  'robot_stage',
  'robot_execution',
  'run',
  'robot',
  'ability',
  'robot_skill',
  'workflow',
  'plan_proposal',
  'task',
  'subtask',
  'trace',
  'artifact',
  'interaction',
  'runtime_installation',
  'project_scene',
  'scene_instance',
  'simulation_object',
  'virtual_robot',
  'simulation_sensor',
  'scene_editor_node',
  'scene_document',
  'scene-editor',
  'viewer_session'
])

export function supportsInspector(resource) {
  return Boolean(resource?.resourceId && supportedTypes.has(resource.resourceType))
}
