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

// 仿真工作区的前端公共模型。
//
// 这里不复制 MuJoCo 的 body、geom 或 actuator 类型。页面只处理跨 Runtime
// 都能理解的场景节点、低层轨迹命令和状态；引擎专有参数统一放在
// `extensions` 中，由构建器校验，不能被页面静默忽略。

export const SCENE_NODE_KINDS = Object.freeze([
  'group',
  'object',
  'robot',
  'camera',
  'light',
  'region'
])

export const RUNTIME_COMMAND_TYPES = Object.freeze([
  'joint_trajectory',
  'base_trajectory',
  'gripper_command',
  'stop',
  'hold'
])

const STUDIO_TRAJECTORY_COMMAND_TYPES = Object.freeze([
  'joint_trajectory',
  'base_trajectory',
  'gripper_command'
])

export const COMMAND_STATES = Object.freeze([
  'accepted',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'unknown'
])

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)))

export function defaultTransform() {
  return {
    position: [0, 0, 0],
    quaternion_xyzw: [0, 0, 0, 1],
    scale: [1, 1, 1]
  }
}

export function createSceneNode({
  id,
  kind,
  name,
  parentId = null,
  assetId = '',
  transform,
  properties = {}
}) {
  if (!SCENE_NODE_KINDS.includes(kind)) throw new Error(`不支持的场景节点类型：${kind}`)
  return {
    id,
    kind,
    name,
    parent_id: parentId,
    ...(assetId ? { asset_id: assetId } : {}),
    transform: clone(transform || defaultTransform()),
    properties: clone(properties),
    extensions: {}
  }
}

// Studio 拖拽和 Agent 场景生成都使用相同操作名称。操作只描述用户意图，
// revision 检查、循环层级检查和资产存在性检查仍由 Framework 完成。
export function createSceneOperation(type, nodeId, payload = {}) {
  const supported = [
    'CreateNode',
    'DeleteNode',
    'MoveNode',
    'SetTransform',
    'SetProperty',
    'AttachAsset',
    'AddRobot',
    'AddCamera',
    'AddRegion'
  ]
  if (!supported.includes(type)) throw new Error(`不支持的场景操作：${type}`)
  const operation = { type }
  if (nodeId) operation.node_id = nodeId
  // SceneOperation 的字段保持扁平，避免 Framework 和不同编辑客户端各自
  // 维护一层含义不明的 payload。未使用字段不发送，服务端可严格拒绝拼写错误。
  for (const key of ['node', 'parent_id', 'transform', 'property', 'value', 'asset_id', 'asset']) {
    if (payload[key] !== undefined) operation[key] = clone(payload[key])
  }
  return operation
}

// 将本地编辑结果转换成公共场景操作。这样拖拽、表单修改和未来的 Agent
// 编辑最终都走同一条保存路径，Framework 可以逐个定位失败节点。
export function diffSceneDocuments(previous, next) {
  const allNodes = (document) => [...(document?.nodes || []), ...(document?.regions || [])]
  const before = new Map(allNodes(previous).map((node) => [node.id, node]))
  const after = new Map(allNodes(next).map((node) => [node.id, node]))
  const assets = new Map((next?.assets || []).map((asset) => [asset.id, asset]))
  const operations = []
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
  const attachAsset = (node) => {
    if (!node.asset_id) return
    const asset = assets.get(node.asset_id)
    if (!asset) throw new Error(`节点 ${node.id} 引用的资产不在草稿资产目录中`)
    operations.push(
      createSceneOperation('AttachAsset', node.id, {
        asset_id: node.asset_id,
        asset: clone(asset)
      })
    )
  }

  if (!same(previous?.physics || {}, next?.physics || {})) {
    operations.push(
      createSceneOperation('SetProperty', '', { property: 'physics', value: next?.physics || {} })
    )
  }

  for (const [id] of before) {
    if (!after.has(id)) operations.push(createSceneOperation('DeleteNode', id))
  }
  for (const [id, node] of after) {
    const old = before.get(id)
    if (!old) {
      const type =
        node.kind === 'robot'
          ? 'AddRobot'
          : node.kind === 'camera'
            ? 'AddCamera'
            : node.kind === 'region'
              ? 'AddRegion'
              : 'CreateNode'
      operations.push(createSceneOperation(type, id, { node: clone(node) }))
      attachAsset(node)
      continue
    }
    if (old.parent_id !== node.parent_id) {
      operations.push(createSceneOperation('MoveNode', id, { parent_id: node.parent_id || null }))
    }
    if (!same(old.transform, node.transform)) {
      operations.push(
        createSceneOperation('SetTransform', id, { transform: clone(node.transform) })
      )
    }
    if (old.name !== node.name) {
      operations.push(
        createSceneOperation('SetProperty', id, { property: 'name', value: node.name })
      )
    }
    if (!same(old.properties, node.properties)) {
      operations.push(
        createSceneOperation('SetProperty', id, {
          property: 'properties',
          value: clone(node.properties || {})
        })
      )
    }
    if (!same(old.extensions, node.extensions)) {
      operations.push(
        createSceneOperation('SetProperty', id, {
          property: 'extensions',
          value: clone(node.extensions || {})
        })
      )
    }
    if (old.asset_id !== node.asset_id) attachAsset(node)
  }
  return operations
}

export const COMMAND_TEMPLATES = Object.freeze({
  joint_trajectory: {
    resources: ['left_arm'],
    frame_id: 'base_link',
    points: [
      { positions: { joint_1: 0 }, time_from_start_seconds: 0 },
      { positions: { joint_1: 0.2 }, time_from_start_seconds: 1 }
    ]
  },
  base_trajectory: {
    frame_id: 'world',
    points: [
      { positions: { x: 0, y: 0, yaw: 0 }, time_from_start_seconds: 0 },
      { positions: { x: 0.5, y: 0, yaw: 0 }, time_from_start_seconds: 2 }
    ]
  },
  gripper_command: {
    gripper_id: 'left',
    position: 0.04,
    max_effort: 20
  },
  stop: { reason: 'studio_debug_stop' },
  hold: { reason: 'studio_debug_hold' }
})

export function commandTypesForRobot(robot) {
  const advertised =
    robot?.capabilities?.commands ||
    robot?.capabilities?.runtime_commands ||
    robot?.runtime_commands
  if (!Array.isArray(advertised) || advertised.length === 0) {
    return [...STUDIO_TRAJECTORY_COMMAND_TYPES]
  }
  // stop 和 hold 使用专用端点，不得伪装成带 payload 的普通轨迹命令。
  return STUDIO_TRAJECTORY_COMMAND_TYPES.filter((type) => advertised.includes(type))
}

export function commandTemplateForRobot(type, robot, state = {}) {
  if (type === 'joint_trajectory') {
    const joints = robot?.joint_names || []
    if (!joints.length) throw new Error('当前 Robot 没有声明可调试的关节')
    // 某些 Runtime（例如 Franka Profile）要求轨迹点携带完整关节集合。
    // 只改变第一个关节，其余关节保持实际反馈值，避免未声明关节被错误归零。
    const currentPositions = Object.fromEntries(
      joints.map((joint) => [joint, Number(state?.joints?.[joint]?.position || 0)])
    )
    const targetPositions = { ...currentPositions }
    targetPositions[joints[0]] += 0.05
    return {
      resources: ['joints'],
      frame_id: robot.coordinate_frame || 'base_link',
      points: [
        { positions: currentPositions, time_from_start_seconds: 0 },
        { positions: targetPositions, time_from_start_seconds: 1 }
      ]
    }
  }
  if (type === 'base_trajectory') {
    const position = state?.base_pose?.position || [0, 0, 0]
    return {
      frame_id: state?.base_pose?.frame_id || robot?.coordinate_frame || 'world',
      points: [
        {
          positions: { x: Number(position[0] || 0), y: Number(position[1] || 0), yaw: 0 },
          time_from_start_seconds: 0
        },
        {
          positions: { x: Number(position[0] || 0) + 0.1, y: Number(position[1] || 0), yaw: 0 },
          time_from_start_seconds: 1
        }
      ]
    }
  }
  if (type === 'gripper_command') {
    const gripper = robot?.grippers?.[0]
    if (!gripper) throw new Error('当前 Robot 没有声明夹爪')
    return { gripper_id: gripper, position: 0.02, max_effort: 20 }
  }
  throw new Error(`不支持生成调试模板：${type}`)
}

export function validateRuntimeCommand(type, payload) {
  if (!RUNTIME_COMMAND_TYPES.includes(type)) return `不支持的 Runtime 命令：${type}`
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '命令内容必须是对象'

  if (type === 'joint_trajectory') {
    if (
      !Array.isArray(payload.resources) ||
      payload.resources.length === 0 ||
      new Set(payload.resources).size !== payload.resources.length
    ) {
      return 'JointTrajectory 必须声明非空且不重复的 resources'
    }
    if (!Array.isArray(payload.points) || payload.points.length === 0) {
      return 'JointTrajectory 必须包含轨迹点'
    }
  }
  if (
    type === 'base_trajectory' &&
    (!Array.isArray(payload.points) || payload.points.length === 0)
  ) {
    return 'BaseTrajectory 必须包含轨迹点'
  }
  if (type === 'gripper_command' && !Number.isFinite(Number(payload.position))) {
    return 'GripperCommand 必须包含以米为单位的 position'
  }
  return ''
}
