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
import { isMapSelectionValid } from '@/studio/mapSelection'

const snapshot = {
  generation: 4,
  entities: [
    { id: 'box-1', generation: 4, status: 'active', geometry: { kind: 'box' } },
    { id: 'region-1', generation: 4, status: 'active', geometry: { kind: 'region' } },
    { id: 'removed-1', generation: 4, status: 'removed', geometry: { kind: 'box' } }
  ]
}
const selection = (value) => ({ map_id: 'simulation_map', generation: 4, ...value })

describe('Semantic Map selection 有效性', () => {
  it('只接受当前 generation 中未移除的 Entity 与 Region', () => {
    expect(
      isMapSelectionValid(
        selection({ kind: 'entity', entity_id: 'box-1' }),
        snapshot,
        'simulation_map'
      )
    ).toBe(true)
    expect(
      isMapSelectionValid(
        selection({ kind: 'region', entity_id: 'region-1' }),
        snapshot,
        'simulation_map'
      )
    ).toBe(true)
    expect(
      isMapSelectionValid(
        selection({ kind: 'entity', entity_id: 'removed-1' }),
        snapshot,
        'simulation_map'
      )
    ).toBe(false)
    expect(
      isMapSelectionValid(
        selection({ kind: 'entity', entity_id: 'missing' }),
        snapshot,
        'simulation_map'
      )
    ).toBe(false)
  })

  it('拒绝旧 generation、跨地图和非法点位', () => {
    expect(
      isMapSelectionValid(
        { ...selection({ kind: 'entity', entity_id: 'box-1' }), generation: 3 },
        snapshot,
        'simulation_map'
      )
    ).toBe(false)
    expect(
      isMapSelectionValid(selection({ kind: 'entity', entity_id: 'box-1' }), snapshot, 'real_map')
    ).toBe(false)
    expect(
      isMapSelectionValid(
        selection({ kind: 'point', frame_id: 'world', position: [1, 2, 0] }),
        snapshot,
        'simulation_map'
      )
    ).toBe(true)
    expect(
      isMapSelectionValid(
        selection({ kind: 'point', frame_id: 'world', position: [1, 2] }),
        snapshot,
        'simulation_map'
      )
    ).toBe(false)
  })
})
