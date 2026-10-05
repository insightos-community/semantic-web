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
