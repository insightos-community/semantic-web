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

import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
vi.mock('@/api/request', () => ({ default: {} }))
import { mapSourceReferenceMatrix, createSemanticCoordinateRoot, applyInitialSceneView } from '@/studio/sceneVisuals'
import { fitVisualToDescriptor } from '@/studio/visualAssets'

describe('地图几何中心与 GLB body 原点', () => {
  it('工作视角经过统一坐标变换并保留自由相机', () => {
    const root = createSemanticCoordinateRoot(THREE)
    root.userData.initial_view = { position: [1, 2, 3], target: [4, 5, 6], fovy: 60 }
    const camera = new THREE.PerspectiveCamera()
    const controls = { target: new THREE.Vector3(), update: vi.fn() }
    expect(applyInitialSceneView(THREE, root, camera, controls)).toBe(true)
    expect(camera.position.distanceTo(new THREE.Vector3(1, 3, -2))).toBeLessThan(1e-7)
    expect(camera.parent).toBeNull()
    expect(camera.fov).toBe(60)
    expect(applyInitialSceneView(THREE, root, new THREE.OrthographicCamera(), controls)).toBe(false)
  })
  it.each([0, Math.PI / 3])('底面原点箱体不会多升高半个箱高，旋转 %s', (yaw) => {
    const root = createSemanticCoordinateRoot(THREE)
    const body = new THREE.Group()
    body.position.set(1, 2, 0.15)
    body.rotation.z = yaw
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.36, 0.34))
    mesh.position.z = 0.17
    body.add(mesh)
    root.add(body)
    root.updateMatrixWorld(true)
    const reference = mapSourceReferenceMatrix(THREE, [body], { bounds: { size: { z: 0.34 } } })
    const target = new THREE.Matrix4().compose(
      new THREE.Vector3(1, 2, 0.32),
      body.quaternion,
      new THREE.Vector3(1, 1, 1)
    )
    const delta = target.multiply(reference.invert())
    expect(new THREE.Vector3().setFromMatrixPosition(delta).length()).toBeLessThan(1e-7)
    const moved = new THREE.Matrix4().makeTranslation(2, 0, 0).multiply(delta)
    expect(new THREE.Vector3().setFromMatrixPosition(moved).x).toBeCloseTo(2)
  })

  it('Robot 无尺寸的基座语义保留 body 原点，不以全身中心定位', () => {
    const body = new THREE.Group()
    body.position.set(0, 0, 0.01)
    body.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2)))
    const matrix = mapSourceReferenceMatrix(THREE, [body], { bounds: { kind: 'point' } })
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).z).toBe(0.01)
  })

  it('独立资产 fallback 也以中心放置，不改变原场景编辑器的底面规则', () => {
    const visual = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1))
    mesh.position.y = 1
    visual.add(mesh)
    fitVisualToDescriptor(THREE, visual, {}, [1, 1, 2], { centerAtOrigin: true })
    visual.updateMatrixWorld(true)
    expect(
      new THREE.Box3().setFromObject(visual).getCenter(new THREE.Vector3()).length()
    ).toBeLessThan(1e-8)
  })
})
