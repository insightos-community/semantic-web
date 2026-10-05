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

/**
 * Semantic/MuJoCo 使用右手 z-up，Three.js 使用右手 y-up。
 *
 * 仅交换 Y/Z 会把右手坐标系镜像。正确基变换为：
 * world(x, y, z) -> three(x, z, -y)。
 */
export function worldPositionToMapScene(position = {}) {
  return [Number(position.x || 0), Number(position.z || 0), -Number(position.y || 0)]
}

/** 把 Three.js 地面 X/Z 点还原为 Semantic world X/Y 点。 */
export function mapGroundPointToWorld(point = {}) {
  return {
    x: Number(point.x || 0),
    y: -Number(point.z || 0),
    z: 0
  }
}
