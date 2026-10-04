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
