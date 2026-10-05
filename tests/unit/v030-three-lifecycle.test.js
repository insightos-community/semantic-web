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

import { describe, expect, it, vi } from 'vitest'
import {
  createRenderLoop,
  disposeThreeLifecycle,
  disposeThreeResources
} from '@/studio/threeLifecycle'

describe('Three.js 面板生命周期', () => {
  it('stop 后即使迟到的 RAF callback 执行也不会继续 render 或重新排队', () => {
    const callbacks = []
    const render = vi.fn()
    const requestFrame = vi.fn((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancelFrame = vi.fn()
    const loop = createRenderLoop(render, { requestFrame, cancelFrame })

    loop.start()
    expect(render).toHaveBeenCalledTimes(1)
    expect(requestFrame).toHaveBeenCalledTimes(1)

    const scheduled = callbacks[0]
    loop.stop()
    scheduled()

    expect(cancelFrame).toHaveBeenCalledWith(1)
    expect(render).toHaveBeenCalledTimes(1)
    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(loop.active).toBe(false)
  })

  it('组合释放会停止 RAF 并断开 ResizeObserver', () => {
    const renderLoop = { stop: vi.fn() }
    const resizeObserver = { disconnect: vi.fn() }
    const scene = { traverse: vi.fn() }
    const renderer = {
      renderLists: { dispose: vi.fn() },
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
      domElement: { remove: vi.fn() }
    }

    disposeThreeLifecycle({ renderLoop, resizeObserver, scene, renderer })

    expect(renderLoop.stop).toHaveBeenCalledOnce()
    expect(resizeObserver.disconnect).toHaveBeenCalledOnce()
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce()
  })

  it('释放场景中实体、ground、GridHelper 材质和 renderer context', () => {
    const geometryA = { dispose: vi.fn() }
    const geometryB = { dispose: vi.fn() }
    const materialA = { dispose: vi.fn() }
    const materialB = { dispose: vi.fn() }
    const materialC = { dispose: vi.fn() }
    const scene = {
      traverse(callback) {
        callback({ geometry: geometryA, material: materialA })
        callback({ geometry: geometryB, material: [materialB, materialC] })
      }
    }
    const renderer = {
      renderLists: { dispose: vi.fn() },
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
      domElement: { remove: vi.fn() }
    }

    disposeThreeResources(scene, renderer)

    expect(geometryA.dispose).toHaveBeenCalledOnce()
    expect(geometryB.dispose).toHaveBeenCalledOnce()
    expect(materialA.dispose).toHaveBeenCalledOnce()
    expect(materialB.dispose).toHaveBeenCalledOnce()
    expect(materialC.dispose).toHaveBeenCalledOnce()
    expect(renderer.renderLists.dispose).toHaveBeenCalledOnce()
    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce()
    expect(renderer.domElement.remove).toHaveBeenCalledOnce()
  })
})
