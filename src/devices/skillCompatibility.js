// 设备页展示当前 Robot 的安装候选，不直接展示 Server 的全局技能库。
// 与 Pilot 的动作契约一致，同时核对执行和停止动作的类型、schema_version；
// 未声明型号限制仅表示不限型号，仍需具备技能要求的全部 Ability 动作。
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
      stop.length > 0 &&
      [...required, ...stop].every((action) => actions.has(actionKey(action)))
    )
  })
}
