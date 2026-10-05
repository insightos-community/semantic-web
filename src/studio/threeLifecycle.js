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

export function createRenderLoop(
  render,
  {
    requestFrame = globalThis.requestAnimationFrame,
    cancelFrame = globalThis.cancelAnimationFrame
  } = {}
) {
  let active = false
  let frameId = 0

  const tick = () => {
    if (!active) return
    render()
    frameId = requestFrame(tick)
  }

  return {
    start() {
      if (active) return
      active = true
      tick()
    },
    stop() {
      active = false
      if (frameId) cancelFrame(frameId)
      frameId = 0
    },
    get active() {
      return active
    }
  }
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach((item) => item?.dispose?.())
    return
  }
  material?.dispose?.()
}

export function disposeThreeResources(scene, renderer) {
  scene?.traverse?.((object) => {
    object.geometry?.dispose?.()
    disposeMaterial(object.material)
  })
  renderer?.renderLists?.dispose?.()
  renderer?.dispose?.()
  renderer?.forceContextLoss?.()
  renderer?.domElement?.remove?.()
}

export function disposeThreeLifecycle({ renderLoop, resizeObserver, scene, renderer }) {
  renderLoop?.stop?.()
  resizeObserver?.disconnect?.()
  disposeThreeResources(scene, renderer)
}
