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
