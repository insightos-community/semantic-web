// Device.configuration 是 Pilot 的安全摘要，复制/展示仍再脱敏一次，防旧版本误带凭据。
const secretKey =
  /(?:password|passwd|secret|token|api.?key|authorization|cookie|private.?key|credential)/i
export function safeDeviceRecord(value) {
  if (Array.isArray(value)) return value.map(safeDeviceRecord)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? '[已脱敏]' : safeDeviceRecord(item)
      ])
    )
  if (typeof value !== 'string') return value
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object') return JSON.stringify(safeDeviceRecord(parsed))
  } catch {
    /* 普通字符串继续检查 URL 与常见凭据格式。 */
  }
  return value
    .replace(/((?:https?|wss?):\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[已脱敏]@')
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'&,;<>]+/gi, 'Bearer [已脱敏]')
    .replace(
      /((?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|passwd|client[-_]?secret)["']?\s*[:=]\s*["']?)[^\s"'&,;<>]+/gi,
      '$1[已脱敏]'
    )
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      '[私钥已脱敏]'
    )
}
