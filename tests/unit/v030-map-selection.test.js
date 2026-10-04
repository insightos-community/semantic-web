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
