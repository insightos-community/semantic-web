import { describe, expect, it } from 'vitest'
import { robotMapCloudPositions } from '../../src/studio/robotMapCloud'

describe('Pilot real map point cloud', () => {
  it('uses the same metric coordinates and handedness as annotations', () => {
    expect(
      Array.from(
        robotMapCloudPositions({
          type: 'map_layer',
          properties: {
            points_m: [
              [1, 2, 3],
              [0, 0, 0]
            ]
          }
        })
      )
    ).toEqual([1, 3, -2, 0, 0, -0])
  })
  it('ignores invalid values and does not reinterpret ordinary entities', () => {
    expect(robotMapCloudPositions({ type: 'table' })).toBeNull()
    expect(
      Array.from(
        robotMapCloudPositions({
          type: 'map_layer',
          properties: {
            points_m: [
              [1, NaN, 2],
              [1, 2]
            ]
          }
        })
      )
    ).toEqual([])
  })
})
