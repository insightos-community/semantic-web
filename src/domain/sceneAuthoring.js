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

// Scene Editor 的即时校验只用于尽早提示；Framework 与 Plugin 仍会独立校验。
const allowedProperties = Object.freeze({
  group: [],
  object: [
    'model',
    'category',
    'size',
    'rgba',
    'color_rgba',
    'static',
    'interactive',
    'mass',
    'inertia',
    'friction',
    'material',
    'collision'
  ],
  robot: ['model', 'robot_id', 'sensor_names'],
  camera: ['robot_id', 'sensor_kind', 'width', 'height', 'fps', 'intrinsics', 'fovy'],
  light: ['direction', 'diffuse', 'specular', 'castshadow', 'active'],
  region: [
    'model',
    'category',
    'size',
    'rgba',
    'color_rgba',
    'static',
    'interactive',
    'material',
    'collision'
  ]
})

const finiteVector = (value, size, predicate = () => true) =>
  Array.isArray(value) &&
  value.length === size &&
  value.every((item) => Number.isFinite(Number(item)) && predicate(Number(item)))

export function validateAuthoringNode(node) {
  const problems = []
  const problem = (field, message) => problems.push({ node_id: node?.id || '', field, message })
  if (!node?.id) problem('id', '节点 ID 不能为空')
  if (!String(node?.name || '').trim()) problem('name', '节点名称不能为空')
  if (!Object.hasOwn(allowedProperties, node?.kind)) {
    problem('kind', `当前 Scene Editor 不支持独立 ${node?.kind || 'unknown'} 节点`)
    return problems
  }
  if (['robot', 'object'].includes(node.kind) && !node.asset_id) {
    problem('asset_id', 'Robot 和 Object 必须通过 AttachAsset 使用发布资产')
  }

  const transform = node.transform || {}
  if (!finiteVector(transform.position, 3)) {
    problem('transform.position', '位置必须是三个有限数值，单位为米')
  }
  if (!finiteVector(transform.scale, 3, (value) => value > 0)) {
    problem('transform.scale', '缩放必须是三个大于零的数值')
  }
  if (!finiteVector(transform.quaternion_xyzw, 4)) {
    problem('transform.quaternion_xyzw', '姿态必须是 xyzw 四元数')
  } else {
    const norm = Math.hypot(...transform.quaternion_xyzw.map(Number))
    if (Math.abs(norm - 1) > 1e-6) {
      problem('transform.quaternion_xyzw', '四元数必须归一化')
    }
  }

  const properties = node.properties || {}
  for (const key of Object.keys(properties)) {
    if (!allowedProperties[node.kind].includes(key)) {
      problem(`properties.${key}`, `该节点类型不支持属性 ${key}`)
    }
  }
  if ('size' in properties && !finiteVector(properties.size, 3, (value) => value > 0)) {
    problem('properties.size', '尺寸必须是三个大于零的米制数值')
  }
  const rgba = properties.material?.rgba || properties.rgba || properties.color_rgba
  if (rgba && !finiteVector(rgba, 4, (value) => value >= 0 && value <= 1)) {
    problem('properties.material.rgba', 'RGBA 必须是四个 0 到 1 的数值')
  }
  if (
    'mass' in properties &&
    !(Number.isFinite(Number(properties.mass)) && Number(properties.mass) > 0)
  ) {
    problem('properties.mass', '质量必须大于零')
  }
  if ('inertia' in properties) {
    if (!('mass' in properties)) problem('properties.inertia', '设置惯量时必须同时设置质量')
    if (!finiteVector(properties.inertia, 3, (value) => value > 0)) {
      problem('properties.inertia', '惯量必须是三个大于零的主惯量')
    }
  }
  const friction = properties.collision?.friction || properties.friction
  if (friction && !finiteVector(friction, 3, (value) => value >= 0)) {
    problem('properties.collision.friction', '摩擦参数必须是三个非负数值')
  }
  const collision = properties.collision
  if (collision && (typeof collision !== 'object' || Array.isArray(collision))) {
    problem('properties.collision', '碰撞设置必须是对象')
  } else if (collision) {
    if ('enabled' in collision && typeof collision.enabled !== 'boolean') {
      problem('properties.collision.enabled', '碰撞开关必须是布尔值')
    }
    for (const field of ['contype', 'conaffinity']) {
      const value = collision[field]
      if (value != null && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) {
        problem(`properties.collision.${field}`, '碰撞分组必须是非负整数')
      }
    }
  }
  for (const field of ['width', 'height', 'fps', 'fovy']) {
    if (
      field in properties &&
      !(Number.isFinite(Number(properties[field])) && Number(properties[field]) > 0)
    ) {
      problem(`properties.${field}`, `${field} 必须大于零`)
    }
  }
  if (
    'sensor_names' in properties &&
    (!Array.isArray(properties.sensor_names) ||
      properties.sensor_names.some((value) => typeof value !== 'string'))
  ) {
    problem('properties.sensor_names', 'sensor_names 必须是字符串数组')
  }
  return problems
}

export function normalizeQuaternionXYZW(value) {
  if (!finiteVector(value, 4)) return null
  const norm = Math.hypot(...value.map(Number))
  if (norm <= 1e-12) return null
  return value.map((item) => Number(item) / norm)
}
