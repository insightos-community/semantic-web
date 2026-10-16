// Use exact Pilot bindings, never infer an environment from a version number.
export function robotHasSkill(robot, skill) {
  return [...(robot?.desired_skills || []), ...(robot?.installed_skills || [])].some(
    (item) => item.name === skill.name && item.version === skill.version
  )
}

export function robotSkillStatus(robot, skill) {
  const matches = (item) => item.name === skill.name && item.version === skill.version
  const desired = robot?.desired_skills?.find(matches)
  const installed = robot?.installed_skills?.find(matches)
  if (installed?.status === 'failed') return 'failed'
  if (!desired) {
    if (!installed) return 'not_installed'
    // Pilot retains disabled packages after an upgrade. This is package history,
    // not a failure to converge; an unexpectedly enabled version remains visible.
    if (installed.status === 'installed' && installed.enabled === false) return 'retained'
    return 'degraded'
  }
  if (!installed || installed.enabled !== desired.enabled || installed.status !== 'installed')
    return 'pending'
  return installed.enabled ? 'installed' : 'disabled'
}

export function visibleRobotSkills(packages, robot, showAll = false) {
  return packages.filter((skill) => {
    const models = skill.applicable_models || skill.compatible_models || []
    // Keep configured, active and abnormal entries in the default list. Healthy
    // disabled packages without a desired binding remain in explicit browsing.
    if (robotHasSkill(robot, skill)) return showAll || robotSkillStatus(robot, skill) !== 'retained'
    return showAll && (!models.length || models.includes(robot.model))
  })
}

export function robotSkillGroups(skills, robots) {
  const packages = skills.filter((skill) => skill.skill_kind === 'robot')
  const assigned = new Set()
  const groups = []
  for (const robot of robots) {
    const items = packages.filter((skill) => robotHasSkill(robot, skill))
    if (!items.length) continue
    items.forEach((skill) => assigned.add(`${skill.name}@${skill.version}`))
    groups.push({
      category: `Robot Skill · ${robot.display_name || robot.robot_id} · ${robot.robot_id}`,
      items
    })
  }
  const unassigned = packages.filter((skill) => !assigned.has(`${skill.name}@${skill.version}`))
  if (unassigned.length) groups.push({ category: 'Robot Skill · 尚未关联实例', items: unassigned })
  return groups
}
