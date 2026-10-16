import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  mapViewStorageKey,
  readMapView,
  saveMapView,
  restoreMapCamera,
  resizeMapCamera
} from '@/studio/mapViewState'

const memory = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
}
const key = mapViewStorageKey('kitchen', 'real_map', { generation: 1, frame_id: 'map' })
const controls = () => ({ target: new THREE.Vector3(1, 0.5, -2) })

describe('map view persistence', () => {
  it('isolates project, map slot, coordinate frame and generation, but not revisions', () => {
    const snapshot = { generation: 1, frame_id: 'map', revision: 10 }
    expect(mapViewStorageKey('kitchen', 'real_map', snapshot)).toBe(key)
    expect(mapViewStorageKey('other', 'real_map', snapshot)).not.toBe(key)
    expect(mapViewStorageKey('kitchen', 'simulation_map', snapshot)).not.toBe(key)
    expect(mapViewStorageKey('kitchen', 'real_map', { ...snapshot, generation: 2 })).not.toBe(key)
    expect(mapViewStorageKey('kitchen', 'real_map', { ...snapshot, frame_id: 'world' })).not.toBe(
      key
    )
    expect(mapViewStorageKey('kitchen', 'real_map', null)).toBe('')
  })

  it.each(['2d', '3d'])(
    'round trips a manually positioned %s camera and its projection',
    (mode) => {
      const storage = memory(),
        target = controls()
      const camera =
        mode === '2d'
          ? new THREE.OrthographicCamera(-20, 20, 10, -10, 0.2, 300)
          : new THREE.PerspectiveCamera(48, 2, 0.2, 300)
      camera.position.set(4, 8, 12)
      camera.up.set(0, 1, 0)
      camera.zoom = 2.4
      camera.lookAt(target.target)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      saveMapView(key, mode, camera, target, storage)
      const saved = readMapView(key, storage)
      const restored =
        mode === '2d' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera()
      expect(restoreMapCamera(restored, saved.views[mode], 2)).toBe(true)
      restored.updateMatrixWorld()
      expect(restored.position.toArray()).toEqual(camera.position.toArray())
      expect(restored.zoom).toBe(camera.zoom)
      const point = new THREE.Vector3(2, 1, 0)
      expect(
        point.clone().project(restored).distanceTo(point.clone().project(camera))
      ).toBeLessThan(1e-10)
      resizeMapCamera(restored, 1.4)
      expect(restored.zoom).toBe(camera.zoom)
      if (mode === '2d') expect(restored.top - restored.bottom).toBe(20)
      else expect(restored.aspect).toBe(1.4)
    }
  )

  it('keeps both mode views while remembering the last selected mode', () => {
    const storage = memory(),
      c = controls()
    const threeD = new THREE.PerspectiveCamera()
    threeD.position.set(2, 3, 10)
    saveMapView(key, '3d', threeD, c, storage)
    const twoD = new THREE.OrthographicCamera(-5, 5, 5, -5)
    twoD.position.set(1, 20, -2)
    twoD.zoom = 3
    saveMapView(key, '2d', twoD, c, storage)
    const saved = readMapView(key, storage)
    expect(saved.mode).toBe('2d')
    expect(saved.views['3d'].position).toEqual([2, 3, 10])
    expect(saved.views['2d'].zoom).toBe(3)
  })

  it('ignores corrupt or incompatible data and tolerates unavailable storage', () => {
    const storage = memory()
    for (const value of [
      'bad json',
      'null',
      '{"schema_version":"2.0.0"}',
      '{"schema_version":"1.0.0","mode":"3d","views":{"3d":{}}}'
    ]) {
      storage.setItem(key, value)
      expect(readMapView(key, storage)).toBeNull()
    }
    const denied = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('quota')
      }
    }
    expect(readMapView(key, denied)).toBeNull()
    expect(saveMapView(key, '3d', new THREE.PerspectiveCamera(), controls(), denied)).toBeNull()
    const camera = new THREE.PerspectiveCamera()
    expect(restoreMapCamera(camera, { position: [null, 1, 2] })).toBe(false)
    expect(camera.position.toArray()).toEqual([0, 0, 0])
  })
})
