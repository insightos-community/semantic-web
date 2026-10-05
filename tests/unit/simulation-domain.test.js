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
import {
  commandTemplateForRobot,
  commandTypesForRobot,
  createSceneNode,
  diffSceneDocuments,
  validateRuntimeCommand
} from '@/domain/simulation'
import { validateAuthoringNode } from '@/domain/sceneAuthoring'

const node = (overrides = {}) =>
  createSceneNode({
    id: overrides.id || 'box-1',
    kind: overrides.kind || 'object',
    name: overrides.name || 'Box',
    parentId: overrides.parentId,
    transform: overrides.transform,
    properties: overrides.properties || { size: [1, 1, 1] }
  })

describe('simulation domain', () => {
  it('只创建已定义的场景节点并固定 xyzw 姿态', () => {
    expect(node().transform.quaternion_xyzw).toEqual([0, 0, 0, 1])
    expect(() => node({ kind: 'mujoco_geom' })).toThrow('不支持的场景节点类型')
  })

  it('资产节点通过 AttachAsset 携带完整发布描述', () => {
    const asset = {
      id: 'object-box-v1',
      asset_key: 'assets/objects/box.xml',
      kind: 'object',
      metadata: { model: 'box', category: 'box' }
    }
    const box = createSceneNode({
      id: 'box-asset-1',
      kind: 'object',
      name: 'Box',
      assetId: asset.id,
      properties: { model: 'box', size: [0.5, 0.5, 0.5] }
    })
    const operations = diffSceneDocuments(
      { assets: [], nodes: [], regions: [] },
      { assets: [asset], nodes: [box], regions: [] }
    )

    expect(operations.map((operation) => operation.type)).toEqual(['CreateNode', 'AttachAsset'])
    expect(operations[1]).toEqual(
      expect.objectContaining({
        node_id: 'box-asset-1',
        asset_id: asset.id,
        asset
      })
    )
  })

  it('将草稿差异转换为可定位的公共场景操作', () => {
    const before = {
      nodes: [node(), node({ id: 'old-1', name: 'Old' })]
    }
    const changed = node({
      name: 'Moved Box',
      parentId: 'group-1',
      transform: {
        position: [1, 2, 3],
        quaternion_xyzw: [0, 0, 0, 1],
        scale: [1, 1, 1]
      },
      properties: { size: [2, 2, 2] }
    })
    const next = {
      nodes: [
        changed,
        node({ id: 'group-1', kind: 'group', name: 'Group' }),
        node({ id: 'robot-1', kind: 'robot', name: 'R1 Pro' })
      ]
    }

    const operations = diffSceneDocuments(before, next)
    expect(operations.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'DeleteNode',
        'MoveNode',
        'SetTransform',
        'SetProperty',
        'CreateNode',
        'AddRobot'
      ])
    )
    expect(operations.find((item) => item.type === 'SetTransform').node_id).toBe('box-1')
  })

  it('将场景物理参数保存为文档级 SetProperty 操作', () => {
    const physics = { gravity_m_s2: [0, 0, -3.71], timestep_seconds: 0.001 }
    const operations = diffSceneDocuments({ physics: {} }, { physics })
    expect(operations).toContainEqual({
      type: 'SetProperty',
      property: 'physics',
      value: physics
    })
  })

  it('校验主惯量和 MuJoCo 碰撞分组', () => {
    const editable = node({
      properties: {
        size: [0.5, 0.4, 0.3],
        mass: 2,
        inertia: [0.02, 0.03, 0.04],
        collision: { enabled: true, friction: [1, 0.005, 0.0001], contype: 1, conaffinity: 3 }
      }
    })
    editable.asset_id = 'object-box-v1'

    expect(validateAuthoringNode(editable)).toEqual([])

    editable.properties.inertia = [0, 0.03, 0.04]
    editable.properties.collision.contype = 1.5
    expect(validateAuthoringNode(editable).map((item) => item.field)).toEqual(
      expect.arrayContaining(['properties.inertia', 'properties.collision.contype'])
    )
  })

  it('只允许 Runtime 执行低层轨迹、夹爪、停止和保持', () => {
    expect(
      validateRuntimeCommand('joint_trajectory', {
        frame_id: 'base_link',
        resources: ['left_arm'],
        points: [{ positions: { joint_1: 0.2 }, time_from_start_seconds: 1 }]
      })
    ).toBe('')
    expect(validateRuntimeCommand('eef_pose', { x: 1 })).toContain('不支持')
    expect(validateRuntimeCommand('base_trajectory', {})).toContain('轨迹点')
    expect(
      validateRuntimeCommand('joint_trajectory', {
        resources: ['torso', 'torso'],
        points: [{ positions: { joint_1: 0 }, time_from_start_seconds: 0 }]
      })
    ).toContain('resources')
  })

  it('SDK 调试命令由虚拟 Robot 能力决定', () => {
    expect(
      commandTypesForRobot({ capabilities: { commands: ['hold', 'joint_trajectory'] } })
    ).toEqual(['joint_trajectory'])
  })

  it('SDK 调试模板使用 Robot 实际资源名和当前位置', () => {
    const template = commandTemplateForRobot(
      'joint_trajectory',
      { joint_names: ['left_joint_1', 'left_joint_2'], coordinate_frame: 'base_link' },
      { joints: { left_joint_1: { position: 0.3 }, left_joint_2: { position: -0.1 } } }
    )
    expect(template.points[0].positions).toEqual({ left_joint_1: 0.3, left_joint_2: -0.1 })
    expect(template.points[1].positions).toEqual({ left_joint_1: 0.35, left_joint_2: -0.1 })
    expect(() => commandTemplateForRobot('joint_trajectory', { joint_names: [] })).toThrow(
      '没有声明可调试的关节'
    )
  })
})
