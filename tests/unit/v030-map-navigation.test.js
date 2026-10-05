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
import { applyMapNavigationPreset } from '@/studio/mapNavigation'

const constants = {
  MOUSE: { PAN: 'pan', ROTATE: 'rotate' },
  TOUCH: { PAN: 'touch-pan', DOLLY_ROTATE: 'dolly-rotate', DOLLY_PAN: 'dolly-pan' }
}

function controls() {
  return { mouseButtons: {}, touches: {} }
}

describe('Semantic Map 导航预设', () => {
  it('3D 使用左键平移、右键旋转和双指缩放旋转', () => {
    const value = applyMapNavigationPreset(controls(), constants, '3d')
    expect(value).toMatchObject({
      enablePan: true,
      enableZoom: true,
      enableRotate: true,
      screenSpacePanning: true,
      mouseButtons: { LEFT: 'pan', RIGHT: 'rotate' },
      touches: { ONE: 'touch-pan', TWO: 'dolly-rotate' }
    })
  })

  it('2D 保持左右键平移且禁用旋转', () => {
    const value = applyMapNavigationPreset(controls(), constants, '2d')
    expect(value.enableRotate).toBe(false)
    expect(value.screenSpacePanning).toBe(true)
    expect(value.mouseButtons).toEqual({ LEFT: 'pan', RIGHT: 'pan' })
    expect(value.touches).toEqual({ ONE: 'touch-pan', TWO: 'dolly-pan' })
  })
})
