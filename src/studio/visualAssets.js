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

const visualPromises = new Map()

function visualContent(descriptor, purpose) {
  return purpose === 'map'
    ? descriptor?.map_visual || descriptor?.editor_visual
    : descriptor?.editor_visual
}

function visualURL(descriptor, purpose) {
  const content = visualContent(descriptor, purpose)
  return content?.content_url || content?.url || ''
}

/**
 * 旧资产目录只有 Runtime model 与明确的几何占位；把它规范化为视觉描述后，
 * 后续 Runtime Pack 只需增加 GLB 内容引用，Editor 与 Map 无需再改领域接口。
 */
export function visualDescriptorForCatalogEntry(entry) {
  if (!entry) return null
  if (entry.visual) return entry.visual
  const model = entry.asset?.metadata?.model || entry.catalog_id
  const size = entry.preview?.size || [0.5, 0.5, 0.5]
  return {
    visual_id: model,
    version: '3',
    fallback_geometry: entry.preview,
    local_bounds: size,
    placement_anchor: 'bottom_center',
    runtime_bindings: { 'native-mujoco': model }
  }
}

export function resolveVisualDescriptor(catalog, visualRef, fallbackEntry = null) {
  const id = visualRef?.visual_id || ''
  const version = visualRef?.version || ''
  const entry = (catalog || []).find((item) => {
    const descriptor = visualDescriptorForCatalogEntry(item)
    return descriptor?.visual_id === id && (!version || descriptor.version === version)
  })
  return visualDescriptorForCatalogEntry(entry || fallbackEntry)
}

/**
 * 从 Framework 提供的安全内容地址加载版本化 GLB。
 *
 * Scene Editor 和 Semantic Map 都调用本模块，因此二者的缓存、缩放、贴地和失败
 * 回退一致。浏览器从不解析 MJCF/URDF，也不会看见 Runtime 的宿主绝对路径。
 */
export async function loadVisualAsset(descriptor, purpose = 'editor') {
  const content = visualContent(descriptor, purpose)
  const url = visualURL(descriptor, purpose)
  if (!url || content?.format !== 'glb') return null
  const key = `${purpose}:${descriptor.visual_id || url}@${descriptor.version || '0'}:${url}`
  if (!visualPromises.has(key)) {
    visualPromises.set(
      key,
      Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/utils/SkeletonUtils.js')
      ])
        .then(async ([{ GLTFLoader }, { clone }]) => {
          const apiURL = url.startsWith('/api/v1/') ? url.slice('/api/v1'.length) : url
          const buffer = await request.get(apiURL, { responseType: 'arraybuffer' })
          return new Promise((resolve, reject) => {
            new GLTFLoader().parse(
              buffer,
              '',
              (gltf) => resolve({ scene: gltf.scene, clone }),
              reject
            )
          })
        })
        .catch((error) => {
          visualPromises.delete(key)
          throw error
        })
    )
  }
  const loaded = await visualPromises.get(key)
  const instance = loaded.clone(loaded.scene)
  // SkeletonUtils 会克隆节点和骨骼，但材质仍可能被多个对象共享。Map 选择高亮、
  // Editor 透明预览等视图状态必须只影响当前实例，不能让同一 GLB 的其他对象
  // 或另一个 Dock 面板一起变白、半透明。
  instance.traverse((child) => {
    if (!child.material) return
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone()
  })
  return instance
}

/**
 * 单资产 GLB 与完整场景 GLB 都在根节点完成 Z-up→Y-up。Scene Editor 本身
 * 使用 Z-up，因此只在这一公共边界撤销根旋转，节点和 Mesh 不做第二次换轴。
 */
export function adaptVisualToSemanticZUp(object) {
  const coordinateRoot = object?.getObjectByName?.('semantic-z-up-root')
  if (coordinateRoot) {
    coordinateRoot.quaternion.identity()
    coordinateRoot.updateMatrixWorld(true)
  }
  return object
}
export function fitVisualToDescriptor(
  THREE,
  object,
  descriptor,
  fallbackSize = [1, 1, 1],
  options = {}
) {
  const bounds = new THREE.Box3().setFromObject(object)
  const size = bounds.getSize(new THREE.Vector3())
  const target =
    options.targetSize ||
    (Array.isArray(descriptor?.local_bounds)
      ? descriptor.local_bounds
      : descriptor?.local_bounds?.size) ||
    fallbackSize
  const zUp = options.upAxis === 'z'
  // 普通页面是 Three Y-up；Editor 是 Semantic Z-up。轴映射只在这里选择，
  // 调用方不得再自行交换位置或尺寸。
  const ratios = (
    zUp
      ? [target[0] / size.x, target[1] / size.y, target[2] / size.z]
      : [target[0] / size.x, target[2] / size.y, target[1] / size.z]
  ).filter((value) => Number.isFinite(value) && value > 0)
  const scale = ratios.length ? Math.min(...ratios) : 1
  object.scale.multiplyScalar(scale)
  const placed = new THREE.Box3().setFromObject(object)
  const anchor = descriptor?.placement_anchor || 'bottom_center'
  if (options.centerAtOrigin) {
    object.position.sub(placed.getCenter(new THREE.Vector3()))
  } else if (options.placeAtAnchor !== false && anchor === 'bottom_center') {
    const center = placed.getCenter(new THREE.Vector3())
    object.position.x -= center.x
    if (zUp) {
      object.position.y -= center.y
      object.position.z -= placed.min.z
    } else {
      object.position.z -= center.z
      object.position.y -= placed.min.y
    }
  }
  return object
}

export function clearVisualAssetCache() {
  visualPromises.clear()
}

/**
 * SceneDocument 中显式声明的 RGBA 同时是 MuJoCo Compiler 的材质输入。
 * Editor 在预览单资产 GLB 时必须应用同一值，否则公共 Layout 的白色箱体会
 * 被资产目录的橙色默认材质覆盖。这里只修改明确声明 RGBA 的节点；Robot、
 * 纹理 Mesh 和未声明材质的资产继续完整保留导出器中的原始材质。
 */
export function applySceneNodeMaterial(object, node) {
  const rgba =
    node?.properties?.material?.rgba || node?.properties?.rgba || node?.properties?.color_rgba
  if (!Array.isArray(rgba) || rgba.length !== 4) return object
  object?.traverse?.((child) => {
    if (!child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material?.color || material.map) continue
      material.color.setRGB(Number(rgba[0]), Number(rgba[1]), Number(rgba[2]))
      material.opacity = Number(rgba[3])
      material.transparent = Number(rgba[3]) < 1
      material.needsUpdate = true
    }
  })
  return object
}
