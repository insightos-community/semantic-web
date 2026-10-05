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

import request from '@/api/request'

const scenePromises = new Map()

function apiPath(url) {
  return url.startsWith('/api/v1/') ? url.slice('/api/v1'.length) : url
}

/**
 * 加载 Runtime 已编译场景的唯一 GLB。
 *
 * Physics Viewer、Scene Editor 与 Simulation Map 共享解析缓存。返回值是节点树副本，
 * 几何、纹理和材质仍由缓存中的 GLB 共享；选择高亮必须使用 BoxHelper/Outline，
 * 不得修改共享材质。
 */
export async function loadVisualContent(contentUrl, sceneRevision) {
  if (!contentUrl || !sceneRevision) throw new Error('Viewer Scene 缺少内容地址或 revision')
  const key = `${sceneRevision}:${contentUrl}`
  if (!scenePromises.has(key)) {
    scenePromises.set(
      key,
      Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/utils/SkeletonUtils.js')
      ])
        .then(async ([{ GLTFLoader }, { clone }]) => {
          const buffer = await request.get(apiPath(contentUrl), { responseType: 'arraybuffer' })
          const scene = await new Promise((resolve, reject) => {
            new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject)
          })
          return { scene, clone }
        })
        .catch((error) => {
          scenePromises.delete(key)
          throw error
        })
    )
  }
  const loaded = await scenePromises.get(key)
  return loaded.clone(loaded.scene)
}

export function indexViewerScene(scene, dynamicNodeOrder = []) {
  const dynamic = new Map()
  const bySource = new Map()
  const expected = new Set(dynamicNodeOrder)
  scene.traverse((node) => {
    const renderNodeId = node.userData?.render_node_id
    const sourceId = node.userData?.source_id
    if (renderNodeId && expected.has(renderNodeId)) dynamic.set(renderNodeId, node)
    if (sourceId) {
      if (!bySource.has(sourceId)) bySource.set(sourceId, [])
      bySource.get(sourceId).push(node)
    }
  })
  const missing = dynamicNodeOrder.filter((id) => !dynamic.has(id))
  if (missing.length) throw new Error(`Viewer GLB 缺少 ${missing.length} 个动态节点`)
  return { dynamic, bySource }
}

export function createSemanticCoordinateRoot(THREE) {
  const root = new THREE.Group()
  root.name = 'semantic-z-up-root'
  root.rotation.x = -Math.PI / 2
  return root
}

// 可选的动态相机节点沿用现有位姿流。旧 Runtime 没有 render_node_id 时，
// 相机仍放在独立的世界坐标根节点下，保持 MuJoCo 固定相机行为。
export function attachViewerCamera(THREE, camera, descriptor, dynamicNodes, scene) {
  const parent = descriptor.render_node_id
    ? dynamicNodes.get(descriptor.render_node_id)
    : createSemanticCoordinateRoot(THREE)
  if (!parent) throw new Error(`Viewer 缺少相机位姿节点 ${descriptor.render_node_id}`)
  camera.position.fromArray(descriptor.position)
  camera.quaternion.fromArray(descriptor.quaternion_xyzw)
  parent.add(camera)
  if (!descriptor.render_node_id) scene.add(parent)
}

// 有尺寸的地图实体以几何中心定位；GLB body 可能以底面定位。
// 在 anchor 局部坐标中求中心，保留旋转和 Robot（无 bounds.size）的基座原点。
export function mapSourceReferenceMatrix(THREE, sourceNodes, entity) {
  const anchor = sourceNodes[0]
  anchor.updateWorldMatrix(true, true)
  const reference = anchor.matrix.clone()
  if (!entity.bounds?.size) return reference
  const inverse = anchor.matrixWorld.clone().invert()
  const bounds = new THREE.Box3()
  for (const node of sourceNodes) {
    node.updateWorldMatrix(true, true)
    node.traverse((child) => {
      if (!child.isMesh) return
      child.geometry.computeBoundingBox()
      bounds.union(
        child.geometry.boundingBox
          .clone()
          .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld))
      )
    })
  }
  if (!bounds.isEmpty()) {
    const center = bounds.getCenter(new THREE.Vector3())
    reference.multiply(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z))
  }
  return reference
}

export function clearSceneVisualCache() {
  scenePromises.clear()
}

// 场景可在坐标根上提供初始工作视角。仅在首次取景/恢复视角时使用，
// 不绑定机器人相机，也不覆盖用户后续旋转平移；旧场景仍按包围盒取景。
export function applyInitialSceneView(THREE, root, camera, controls) {
  const anchor = root?.getObjectByName('semantic-z-up-root')
  const view = anchor?.userData?.initial_view
  if (!view || !camera.isPerspectiveCamera) return false
  if (
    ![view.position, view.target].every(
      (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
    )
  )
    return false
  anchor.updateWorldMatrix(true, false)
  camera.position.fromArray(view.position).applyMatrix4(anchor.matrixWorld)
  controls.target.fromArray(view.target).applyMatrix4(anchor.matrixWorld)
  camera.up.set(0, 1, 0)
  // 室内工作视角可声明视场角，避免把机器人裁到边缘；旧 GLB 保留原值。
  if (Number.isFinite(view.fovy) && view.fovy > 0 && view.fovy < 180) camera.fov = view.fovy
  camera.near = 0.01
  camera.far = 1000
  camera.updateProjectionMatrix()
  controls.update()
  return true
}
