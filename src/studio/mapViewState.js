// Browser-local display preferences, independent of map/robot coordinates.
const version = '1.0.0'
const modes = ['2d', '3d']
const vector = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
const positive = (value) => Number.isFinite(value) && value > 0

export function mapViewStorageKey(projectId, mapId, snapshot) {
  if (!projectId || !mapId || !Number.isInteger(snapshot?.generation) || snapshot.generation < 1)
    return ''
  // Revisions update the same map. A new generation/frame has its own view.
  return (
    'semantic.map-view.v1:' +
    [projectId, mapId, snapshot.generation, snapshot.frame_id || 'world']
      .map(encodeURIComponent)
      .join(':')
  )
}

function validCamera(value, mode) {
  return (
    value &&
    vector(value.position) &&
    vector(value.target) &&
    vector(value.up) &&
    Math.hypot(...value.up) > 0 &&
    Math.hypot(...value.position.map((n, i) => n - value.target[i])) > 0 &&
    positive(value.zoom) &&
    positive(value.near) &&
    positive(value.far) &&
    value.far > value.near &&
    (mode === '2d' ? positive(value.verticalSpan) : positive(value.fov) && value.fov < 180)
  )
}

export function readMapView(key, storage) {
  if (!key) return null
  try {
    storage ||= globalThis.localStorage
    const value = JSON.parse(storage.getItem(key))
    if (value?.schema_version !== version || !modes.includes(value.mode)) return null
    const views = Object.fromEntries(
      modes
        .filter((mode) => validCamera(value.views?.[mode], mode))
        .map((mode) => [mode, value.views[mode]])
    )
    return views[value.mode] ? { schema_version: version, mode: value.mode, views } : null
  } catch {
    return null
  }
}

export function captureMapCamera(camera, controls) {
  return {
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    up: camera.up.toArray(),
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
    ...(camera.isOrthographicCamera
      ? { verticalSpan: camera.top - camera.bottom }
      : { fov: camera.fov })
  }
}

export function saveMapView(key, mode, camera, controls, storage) {
  if (!key || !modes.includes(mode) || !camera || !controls) return null
  try {
    storage ||= globalThis.localStorage
    const view = captureMapCamera(camera, controls)
    if (!validCamera(view, mode)) return null
    const previous = readMapView(key, storage)
    const value = { schema_version: version, mode, views: { ...previous?.views, [mode]: view } }
    storage.setItem(key, JSON.stringify(value))
    return value
  } catch {
    // Private browsing, disabled storage and quota failures must not break maps.
    return null
  }
}

export function restoreMapCamera(camera, saved, aspect = 1) {
  const mode = camera.isOrthographicCamera ? '2d' : '3d'
  if (!validCamera(saved, mode)) return false
  camera.position.fromArray(saved.position)
  camera.up.fromArray(saved.up)
  camera.zoom = saved.zoom
  camera.near = saved.near
  camera.far = saved.far
  if (mode === '2d') {
    camera.top = saved.verticalSpan / 2
    camera.bottom = -camera.top
    camera.left = -camera.top * aspect
    camera.right = camera.top * aspect
  } else {
    camera.fov = saved.fov
    camera.aspect = aspect
  }
  camera.lookAt(...saved.target)
  camera.updateProjectionMatrix()
  return true
}

export function resizeMapCamera(camera, aspect) {
  if (camera.isOrthographicCamera) {
    const halfHeight = (camera.top - camera.bottom) / 2
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
  } else camera.aspect = aspect
  camera.updateProjectionMatrix()
}
