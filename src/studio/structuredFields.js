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

const cloneJSON = (value) => JSON.parse(JSON.stringify(value))

export function normalizeStructuredField(value) {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value) || typeof value === 'object') return cloneJSON(value)
  return [value]
}

const displayValue = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 0))

export function structuredFieldItems(value) {
  if (Array.isArray(value)) return value.map(displayValue)
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => key + ': ' + displayValue(item))
  }
  return value === null || value === undefined || value === '' ? [] : [displayValue(value)]
}

export function structuredFieldToEditor(value) {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.join('\n')
  }
  if (value && (Array.isArray(value) || typeof value === 'object')) {
    return JSON.stringify(value, null, 2)
  }
  return value === null || value === undefined ? '' : String(value)
}

export function structuredFieldFromEditor(text) {
  const value = String(text || '').trim()
  if (!value) return []
  if (value.startsWith('{') || value.startsWith('[')) {
    const parsed = JSON.parse(value)
    if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
      throw new Error('结构化字段必须是 JSON 对象或数组')
    }
    return parsed
  }
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}
