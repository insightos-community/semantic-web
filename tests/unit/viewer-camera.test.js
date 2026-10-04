import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { attachViewerCamera } from '@/studio/sceneVisuals'

describe('Runtime 相机坐标与位姿流', () => {
  const descriptor = { position: [1, 2, 3], quaternion_xyzw: [0, 0, 0, 1] }

  it('旧世界坐标相机继续使用一次 Z-up 转换', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    attachViewerCamera(THREE, camera, descriptor, new Map(), scene)
    expect(camera.parent.parent).toBe(scene)
    expect(camera.parent.rotation.x).toBeCloseTo(-Math.PI / 2)
    expect(camera.position.toArray()).toEqual([1, 2, 3])
  })

  it('动态相机跟随节点且不重复转换坐标', () => {
    const scene = new THREE.Scene()
    const node = new THREE.Group()
    scene.add(node)
    const camera = new THREE.PerspectiveCamera()
    attachViewerCamera(THREE, camera, { ...descriptor, render_node_id: 'head' }, new Map([['head', node]]), scene)
    node.position.set(4, 0, 0)
    expect(camera.parent).toBe(node)
    expect(camera.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([5, 2, 3])
  })
})
