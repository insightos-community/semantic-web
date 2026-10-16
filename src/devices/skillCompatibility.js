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

// 设备页展示当前 Robot 的安装候选，不直接展示 Server 的全局技能库。
// 与 Pilot 的动作契约一致，同时核对声明的执行和停止动作的类型、schema_version；
// 未声明型号限制仅表示不限型号，仍需具备技能要求的全部 Ability 动作。
// Registry 发布时已校验停止策略：cancel_actions 使用 SDK Task 取消，
// 合法的 stop_actions 可以为空。这里不能额外要求一个不存在的停止 Ability。
export function installableRobotSkills(packages, robot) {
  const actionKey = (action) => `${action.type}@${action.schema_version}`
  const actions = new Set(
    (robot.abilities || [])
      .filter((ability) => ability.selected !== false)
      .flatMap((ability) => ability.action_details || [])
      .map(actionKey)
  )

  return packages.filter((skill) => {
    if (skill.applicable_models?.length && !skill.applicable_models.includes(robot.model))
      return false
    const required = skill.required_actions || []
    const stop = skill.stop_actions || []
    return (
      required.length > 0 &&
      (Array.isArray(skill.stop_actions) || skill.stop_actions === null) &&
      [...required, ...stop].every((action) => actions.has(actionKey(action)))
    )
  })
}
