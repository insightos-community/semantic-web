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
import { decodeFloat32Depth, formatDepthRange } from '@/utils/depthFrame'

function float32le(values) {
  const payload = new ArrayBuffer(values.length * 4)
  const view = new DataView(payload)
  values.forEach((value, index) => view.setFloat32(index * 4, value, true))
  return payload
}

const metadata = {
  encoding: 'float32-le',
  media_type: 'application/octet-stream',
  width: 2,
  height: 2
}

describe('Profile float32-le Depth', () => {
  it('按小端解析、计算可解释范围并生成不透明伪彩色像素', () => {
    const depth = decodeFloat32Depth(metadata, float32le([0.1, 0.2, 0.4, 0.8]))

    expect(depth).toMatchObject({ width: 2, height: 2, unit: 'raw' })
    expect(depth.minimum).toBeCloseTo(0.1)
    expect(depth.maximum).toBeCloseTo(0.8)
    expect(depth.rgba).toHaveLength(16)
    expect([...depth.rgba].filter((_, index) => index % 4 === 3)).toEqual([255, 255, 255, 255])
    expect([...depth.rgba.slice(0, 3)]).not.toEqual([...depth.rgba.slice(12, 15)])
    expect(formatDepthRange(depth)).toContain('raw')
  })

  it('常量深度也能生成稳定颜色，而不是除零或透明画面', () => {
    const depth = decodeFloat32Depth(metadata, float32le([0.5, 0.5, 0.5, 0.5]))

    expect(depth.minimum).toBe(0.5)
    expect(depth.maximum).toBe(0.5)
    expect([...depth.rgba.slice(0, 4)]).toEqual([...depth.rgba.slice(12, 16)])
    expect([...depth.rgba].every(Number.isFinite)).toBe(true)
  })

  it('拒绝错误编码、尺寸、载荷长度以及 NaN/Infinity', () => {
    expect(() =>
      decodeFloat32Depth({ ...metadata, encoding: 'png16-mm' }, float32le([1, 2, 3, 4]))
    ).toThrow('不支持的 float32 Depth 编码')
    expect(() => decodeFloat32Depth({ ...metadata, width: 0 }, new ArrayBuffer(0))).toThrow(
      'width 必须是正整数'
    )
    expect(() => decodeFloat32Depth(metadata, new ArrayBuffer(12))).toThrow(
      'float32 Depth 载荷长度错误'
    )
    expect(() => decodeFloat32Depth(metadata, float32le([0, Number.NaN, 1, 2]))).toThrow(
      '包含非有限值'
    )
    expect(() =>
      decodeFloat32Depth(metadata, float32le([0, Number.POSITIVE_INFINITY, 1, 2]))
    ).toThrow('包含非有限值')
  })
})
