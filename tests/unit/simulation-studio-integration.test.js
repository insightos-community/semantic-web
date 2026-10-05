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
import * as THREE from 'three'
import { getPanelDefinition, listPanelDefinitions } from '@/studio/panelRegistry'
import { mapGroundPointToWorld, worldPositionToMapScene } from '@/studio/mapCoordinates'
import {
  applySceneNodeMaterial,
  adaptVisualToSemanticZUp,
  fitVisualToDescriptor,
  resolveVisualDescriptor
} from '@/studio/visualAssets'

describe('Simulation 与统一 Studio 的集成', () => {
  it('拆除嵌套 Workbench，并把仿真资源注册成独立 Editor 面板', () => {
    const oldWorkbench = getPanelDefinition('simulation')
    expect(oldWorkbench.unavailable).toContain('已拆分')

    for (const type of [
      'scene-details',
      'scene-editor',
      'physics-viewer',
      'sensor-viewer',
      'evaluation-result',
      'robot-sdk-debug'
    ]) {
      const definition = getPanelDefinition(type)
      expect(definition.preferredRegion).toBe('editor')
      expect(definition.unavailable).toBeUndefined()
      expect(definition.resolvedComponent).toBeTruthy()
    }

    expect(listPanelDefinitions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'scene-details', title: 'Scene Details' }),
        expect.objectContaining({ type: 'physics-viewer', title: 'Physics Viewer' }),
        expect.objectContaining({ type: 'sensor-viewer', title: 'Sensor Viewer' })
      ])
    )
  })

  it('以右手坐标转换 Map 画面，避免 Simulation 的左右关系被镜像', () => {
    expect(worldPositionToMapScene({ x: 0.25, y: 1.5, z: 0.6 })).toEqual([0.25, 0.6, -1.5])
    expect(mapGroundPointToWorld({ x: 0.25, z: -1.5 })).toEqual({
      x: 0.25,
      y: 1.5,
      z: 0
    })
  })

  it('按 Z-up 描述缩放并把 GLB 的 Y-up 底面贴到地面', () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6))
    fitVisualToDescriptor(THREE, object, {
      local_bounds: [2, 6, 4],
      placement_anchor: 'bottom_center'
    })
    const bounds = new THREE.Box3().setFromObject(object)
    expect(object.scale.toArray()).toEqual([1, 1, 1])
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0)
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0)
  })

  it('已有 Entity 使用实际尺寸并保持中心位姿，不重复执行贴地偏移', () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6))
    fitVisualToDescriptor(
      THREE,
      object,
      { local_bounds: [20, 20, 20], placement_anchor: 'bottom_center' },
      [1, 1, 1],
      { targetSize: [2, 6, 4], placeAtAnchor: false }
    )
    const bounds = new THREE.Box3().setFromObject(object)
    const center = bounds.getCenter(new THREE.Vector3())
    expect(bounds.getSize(new THREE.Vector3()).toArray()).toEqual([2, 4, 6])
    expect(center.toArray()).toEqual([0, 0, 0])
  })

  it('Scene Editor 撤销 GLB 根换轴并按 Z-up 贴地，不让 Robot 横躺', () => {
    const asset = new THREE.Group()
    asset.name = 'semantic-z-up-root'
    asset.rotation.x = -Math.PI / 2
    asset.add(new THREE.Mesh(new THREE.BoxGeometry(2, 6, 4)))

    adaptVisualToSemanticZUp(asset)
    fitVisualToDescriptor(
      THREE,
      asset,
      { local_bounds: [2, 6, 4], placement_anchor: 'bottom_center' },
      [1, 1, 1],
      { upAxis: 'z' }
    )
    const bounds = new THREE.Box3().setFromObject(asset)
    expect(bounds.min.z).toBeCloseTo(0)
    expect(bounds.getCenter(new THREE.Vector3()).y).toBeCloseTo(0)
  })

  it('Editor 对显式 Layout RGBA 使用与 Runtime Compiler 相同的材质', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xd89b45 })
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
    applySceneNodeMaterial(visual, {
      properties: { material: { rgba: [1, 1, 1, 1] } }
    })
    expect(material.color.getHex()).toBe(0xffffff)
    expect(material.opacity).toBe(1)
  })

  it('Scene Editor 与 Semantic Map 解析同一版本化视觉素材', () => {
    const visual = {
      visual_id: 'r1_pro_chassis',
      version: '3',
      editor_visual: {
        format: 'glb',
        content_url: '/api/v1/projects/project-1/simulation/visual-assets/r1_pro_chassis/3.glb'
      },
      map_visual: {
        format: 'glb',
        content_url: '/api/v1/projects/project-1/simulation/visual-assets/r1_pro_chassis/3.glb'
      },
      local_bounds: [0.636, 0.674953, 1.695695],
      placement_anchor: 'bottom_center'
    }
    const catalog = [
      {
        catalog_id: 'r1-pro-chassis',
        node_kind: 'robot',
        visual
      }
    ]
    const visualRef = { visual_id: 'r1_pro_chassis', version: '3' }

    expect(resolveVisualDescriptor(catalog, visualRef)).toBe(visual)
    expect(visual.editor_visual.content_url).toBe(visual.map_visual.content_url)
  })
})
