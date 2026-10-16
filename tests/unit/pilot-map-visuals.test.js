import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import fs from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { fitPilotVisual, hasTwinMap, positionTwinCamera } from '@/studio/pilotMapVisuals'

const layers = [
  {
    type: 'map_layer',
    properties: {
      mapping: { twin_scene: { schema_version: '1.0.0' }, display_view: { rotation_deg: 23 } }
    }
  }
]
describe('Pilot twin geometry', () => {
  it.each([0, 0.47, Math.PI / 2, Math.PI])(
    'fits non-square geometry at heading %s and centers exactly once',
    (heading) => {
      const object = new THREE.Group()
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
      mesh.position.y = 0.5
      object.add(mesh)
      expect(
        fitPilotVisual(
          THREE,
          object,
          { fit: 'stretch', heading_offset_rad: heading },
          [1.2, 0.4, 0.748]
        )
      ).toBe(true)
      const b = new THREE.Box3().setFromObject(object)
      const s = b.getSize(new THREE.Vector3()),
        c = b.getCenter(new THREE.Vector3())
      expect(s.x).toBeCloseTo(1.2)
      expect(s.y).toBeCloseTo(0.748)
      expect(s.z).toBeCloseTo(0.4)
      expect(c.length()).toBeLessThan(1e-9)
      const parent = new THREE.Group()
      parent.add(object)
      parent.position.set(1.558, 0.542, 2.996)
      parent.rotateY(0.7)
      parent.updateMatrixWorld(true)
      const actual = new THREE.Box3().setFromObject(parent).getCenter(new THREE.Vector3())
      expect(actual.distanceTo(parent.position)).toBeLessThan(1e-9)
    }
  )
  it('changes only the camera for a saved view rotation', () => {
    const target = new THREE.Vector3(1, 2, 3),
      original = target.clone(),
      camera = new THREE.PerspectiveCamera()
    expect(hasTwinMap(layers)).toBe(true)
    expect(positionTwinCamera(THREE, camera, target, 10, layers)).toBe(true)
    expect(target.equals(original)).toBe(true)
    expect(camera.position.x).toBeCloseTo(1 - Math.sin((23 * Math.PI) / 180) * 10)
    expect(camera.position.y).toBeCloseTo(9)
    expect(positionTwinCamera(THREE, camera, target, 10, [])).toBe(false)
  })
  // Use the same curated GLBs as the twin, not substitute cubes.
  it
    .skipIf(!process.env.R1PRO_TWIN_ASSETS)
    .each(['table-small', 'table-large', 'table-white', 'cabinet', 'refrigerator'])(
    'loads and sizes the real %s asset',
    async (name) => {
      const bytes = fs.readFileSync(`${process.env.R1PRO_TWIN_ASSETS}/${name}.glb`)
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      const { scene } = await new Promise((resolve, reject) =>
        new GLTFLoader().parse(data, '', resolve, reject)
      )
      fitPilotVisual(
        THREE,
        scene,
        { fit: 'stretch', heading_offset_rad: Math.PI },
        [0.8, 0.4, 0.748]
      )
      const bounds = new THREE.Box3().setFromObject(scene),
        size = bounds.getSize(new THREE.Vector3())
      expect(size.toArray()).toEqual(expect.arrayContaining([expect.any(Number)]))
      expect(size.x).toBeCloseTo(0.8)
      expect(size.y).toBeCloseTo(0.748)
      expect(size.z).toBeCloseTo(0.4)
      expect(bounds.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-7)
    }
  )
})
