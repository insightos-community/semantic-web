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

export const INSPECTOR_EXPAND_LIMIT = 80
export const INSPECTOR_MAX_CHARS = 32 * 1024

export function isStructured(value) {
  return value !== null && typeof value === 'object'
}

export function formatPropertyText(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function shouldExpandProperty(value) {
  if (value == null || value === '') return false
  if (isStructured(value)) return true
  const text = formatPropertyText(value)
  return text.length > INSPECTOR_EXPAND_LIMIT || text.includes('\n')
}

export function summarizeProperty(value) {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return `数组 · ${value.length} 项`
  if (isStructured(value)) return `对象 · ${Object.keys(value).length} 个字段`
  const text = formatPropertyText(value)
  return text.length > INSPECTOR_EXPAND_LIMIT ? `${text.slice(0, INSPECTOR_EXPAND_LIMIT)}…` : text
}

export function displayPropertyText(value) {
  const text = formatPropertyText(value)
  if (text.length <= INSPECTOR_MAX_CHARS) return { text, truncated: false }
  return { text: `${text.slice(0, INSPECTOR_MAX_CHARS)}\n…（已截断）`, truncated: true }
}
