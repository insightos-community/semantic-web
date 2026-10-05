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
import { evidenceTitle, stageTitle } from '@/robot/stagePresentation'
import { parseDebugFields } from '@/devices/debugInput'
import { executionLogRows } from '@/robot/executionRecords'
describe('stage presentation and debug inputs', () => {
  it('reuses immutable historical log projections and rebuilds replaced events', () => {
    const event = { sequence: 1, type: 'action.terminal', payload: { result: { value: 3 } } }
    const first = executionLogRows({ id: 'e1' }, [event])[0]
    expect(executionLogRows({ id: 'e1' }, [event])[0]).toBe(first)
    expect(executionLogRows({ id: 'e2' }, [event])[0].executionId).toBe('e2')
    expect(
      executionLogRows({ id: 'e1' }, [{ ...event, payload: { result: { value: 4 } } }])[0].output
    ).toContain('4')
  })
  it('uses semantic labels without guessing capture time', () => {
    expect(stageTitle({ name: 'approach' })).toBe('接近')
    expect(stageTitle({ name: 'execute_policy' })).toBe('执行策略')
    expect(stageTitle({ name: 'verify_result' })).toBe('验收结果')
    expect(evidenceTitle({ stage: 'approach', capture_point: 'entry' })).toBe('接近阶段执行前图像')
    expect(evidenceTitle({ stage: 'approach', capture_point: 'exit' })).toBe('接近阶段完成后图像')
    expect(evidenceTitle({ stage: 'approach' })).toBe('接近阶段图像')
  })
  it('validates required and typed values before sending', () => {
    const fields = [
      { name: 'speed', type: 'number', required: true },
      { name: 'sensors', type: 'string[]' }
    ]
    expect(() => parseDebugFields(fields, {})).toThrow('speed')
    expect(() => parseDebugFields(fields, { speed: 'abc' })).toThrow('数字')
    expect(() => parseDebugFields(fields, { speed: '1', sensors: '{}' })).toThrow('数组')
    expect(parseDebugFields(fields, { speed: '0.2', sensors: '["camera.rgb"]' })).toEqual({
      speed: 0.2,
      sensors: ['camera.rgb']
    })
  })
})
