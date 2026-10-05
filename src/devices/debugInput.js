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

export function parseDebugFields(fields, values) {
  const input = {}
  for (const field of fields || []) {
    const value = values[field.name]
    if (value === undefined || value === '') {
      if (field.required) throw new Error(`请填写 ${field.name}`)
      continue
    }
    if (['number', 'integer'].includes(field.type)) {
      const number = Number(value)
      if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isInteger(number)))
        throw new Error(`${field.name} 必须是${field.type === 'integer' ? '整数' : '数字'}`)
      input[field.name] = number
    } else if (field.type === 'boolean') input[field.name] = value === true || value === 'true'
    else if (['string', 'enum'].includes(field.type)) input[field.name] = value
    else {
      try {
        input[field.name] = JSON.parse(value)
      } catch {
        throw new Error(`${field.name} 需要有效的 JSON 值`)
      }
      if (
        (field.type === 'array' || field.type?.endsWith('[]')) &&
        !Array.isArray(input[field.name])
      )
        throw new Error(`${field.name} 必须是数组`)
    }
  }
  return input
}
