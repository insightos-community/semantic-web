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

import { describe, expect, it } from 'vitest'
import {
  displayPropertyText,
  formatPropertyText,
  INSPECTOR_MAX_CHARS,
  shouldExpandProperty,
  summarizeProperty
} from '@/studio/inspectorProperty'

describe('inspectorProperty', () => {
  it('短标量不展开，对象和长文本展开', () => {
    expect(shouldExpandProperty('ok')).toBe(false)
    expect(shouldExpandProperty({ a: 1 })).toBe(true)
    expect(shouldExpandProperty('x'.repeat(81))).toBe(true)
    expect(summarizeProperty({ a: 1, b: 2 })).toBe('对象 · 2 个字段')
    expect(summarizeProperty(['a', 'b'])).toBe('数组 · 2 项')
    expect(formatPropertyText({ a: 1 })).toContain('"a": 1')
  })

  it('超长正文按 32KB 截断', () => {
    const value = '汉'.repeat(INSPECTOR_MAX_CHARS + 4)
    const display = displayPropertyText(value)
    expect(display.truncated).toBe(true)
    expect(display.text.endsWith('…（已截断）')).toBe(true)
  })
})
