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

// Profile Runtime 的 float32-le 深度是未经相机近远平面换算的原始缓冲。
// Studio 只做可视化，不把它标成米或毫米，避免给调试人员错误的物理含义。
const MAX_DEPTH_PIXELS = 4 * 1024 * 1024

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`float32 Depth ${name} 必须是正整数`)
  }
  return value
}

function depthColor(value) {
  // 蓝 → 青 → 黄：颜色只表达本帧内由小到大的相对位置，实际范围会同时显示。
  const position = Math.min(1, Math.max(0, value))
  const red = Math.round(255 * Math.min(1, Math.max(0, 2 * position - 0.35)))
  const green = Math.round(255 * Math.min(1, 2 * Math.min(position, 1 - position) + 0.15))
  const blue = Math.round(255 * Math.min(1, Math.max(0, 1.25 - 1.6 * position)))
  return [red, green, blue]
}

export function decodeFloat32Depth(metadata, payload) {
  if (metadata?.encoding !== 'float32-le') {
    throw new Error(`不支持的 float32 Depth 编码：${metadata?.encoding || 'missing'}`)
  }
  if (metadata.media_type && metadata.media_type !== 'application/octet-stream') {
    throw new Error(`float32 Depth media_type 无效：${metadata.media_type}`)
  }
  const width = positiveInteger(metadata.width, 'width')
  const height = positiveInteger(metadata.height, 'height')
  const pixelCount = width * height
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_DEPTH_PIXELS) {
    throw new Error('float32 Depth 尺寸超出 Studio 限制')
  }
  if (!(payload instanceof ArrayBuffer)) {
    throw new Error('float32 Depth 载荷必须是 ArrayBuffer')
  }
  const expectedBytes = pixelCount * Float32Array.BYTES_PER_ELEMENT
  if (payload.byteLength !== expectedBytes) {
    throw new Error(`float32 Depth 载荷长度错误：${payload.byteLength} != ${expectedBytes}`)
  }

  const view = new DataView(payload)
  const values = new Float32Array(pixelCount)
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (let index = 0; index < pixelCount; index += 1) {
    const value = view.getFloat32(index * 4, true)
    if (!Number.isFinite(value)) {
      throw new Error(`float32 Depth 包含非有限值：pixel ${index}`)
    }
    values[index] = value
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4)
  const span = maximum - minimum
  for (let index = 0; index < pixelCount; index += 1) {
    const normalized = span > 0 ? (values[index] - minimum) / span : 0.5
    const [red, green, blue] = depthColor(normalized)
    const offset = index * 4
    rgba[offset] = red
    rgba[offset + 1] = green
    rgba[offset + 2] = blue
    rgba[offset + 3] = 255
  }

  return { width, height, rgba, minimum, maximum, unit: 'raw' }
}

export function formatDepthRange(depth) {
  if (!depth) return ''
  const format = (value) => Number(value).toPrecision(5).replace(/\.0+$/, '')
  return `${format(depth.minimum)}–${format(depth.maximum)} ${depth.unit}`
}
