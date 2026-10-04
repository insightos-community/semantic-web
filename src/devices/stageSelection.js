const SEPARATOR = '::'

// Inspector 的选择状态只持久化资源类型和资源 ID。Stage 本身没有全局 ID，
// 因此用 Execution ID 与 Skill 上报的稳定 Stage ID/名称组成可逆引用；不把
// Feedback、Observation 等业务正文复制进 Layout Store。
export function robotStageResourceId(executionId, stage) {
  const stageId = stage?.id || stage?.name || ''
  if (!executionId || !stageId) return ''
  return `${encodeURIComponent(executionId)}${SEPARATOR}${encodeURIComponent(stageId)}`
}

export function parseRobotStageResourceId(resourceId) {
  const value = String(resourceId || '')
  const separator = value.indexOf(SEPARATOR)
  if (separator <= 0 || separator >= value.length - SEPARATOR.length) return null
  try {
    return {
      executionId: decodeURIComponent(value.slice(0, separator)),
      stageId: decodeURIComponent(value.slice(separator + SEPARATOR.length))
    }
  } catch {
    return null
  }
}
