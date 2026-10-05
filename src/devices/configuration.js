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
