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
