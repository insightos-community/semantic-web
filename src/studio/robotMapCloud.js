import { worldPositionToMapScene } from './mapCoordinates'

// Pilot snapshots use metric, Z-up map coordinates, identical to map entities.
export function robotMapCloudPositions(entity) {
  if (entity?.type !== 'map_layer') return null
  const points = entity.properties?.points_m
  if (!Array.isArray(points) || points.length > 60000) return null
  const positions = []
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) continue
    positions.push(...worldPositionToMapScene({ x: point[0], y: point[1], z: point[2] }))
  }
  return new Float32Array(positions)
}
