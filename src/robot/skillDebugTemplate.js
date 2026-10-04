export function robotSkillDebugTemplate(skill) {
  const value = skill?.extensions?.debug_input
  if (!value || Array.isArray(value) || typeof value !== 'object') return '{}'
  return JSON.stringify(value, null, 2)
}
