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
  mapBindingFromSelection,
  normalizePlanSelection,
  selectionsFromMapBinding
} from '@/studio/planMapBinding'

describe('Plan map_binding 公共格式', () => {
  it.each([
    [{ kind: 'entity', entity_id: 'box-1' }],
    [{ kind: 'region', entity_id: 'region-1' }],
    [{ kind: 'point', frame_id: 'world', position: [1, 2, 0] }]
  ])('保存 %s 为 selections 数组', (selection) => {
    expect(mapBindingFromSelection('simulation_map', 4, selection)).toEqual({
      map_id: 'simulation_map',
      generation: 4,
      selections: [selection]
    })
  })

  it('拒绝缺失 entity_id 和非三维点位', () => {
    expect(normalizePlanSelection({ kind: 'entity' })).toBeNull()
    expect(
      normalizePlanSelection({ kind: 'point', frame_id: 'world', position: [1, 2] })
    ).toBeNull()
  })

  it('读取旧字段时统一成 selections，但后续只写新格式', () => {
    expect(
      selectionsFromMapBinding({
        entity_ids: ['box-1'],
        region_id: 'region-1',
        point: { frame_id: 'world', position: [1, 2, 0] }
      })
    ).toEqual([
      { kind: 'entity', entity_id: 'box-1' },
      { kind: 'region', entity_id: 'region-1' },
      { kind: 'point', frame_id: 'world', position: [1, 2, 0] }
    ])
  })
})
