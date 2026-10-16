// Pilot map visuals reuse the normal Semantic asset loader and entity roots.
// Only a normalized furniture mesh needs per-axis sizing instead of uniform fit.
export function pilotVisualDescriptor(entity) {
  if (!entity?.properties?.pilot_robot_id) return null
  const descriptor = entity.properties.visual_descriptor
  // A Pilot entity without a model uses annotation geometry. Never start a
  // simulation Runtime to resolve the appearance of a real robot's furniture.
  return descriptor?.map_visual?.format === 'glb' ? descriptor : {}
}

export function hasTwinMap(layers = []) {
  return layers.some((layer) => layer.properties?.mapping?.twin_scene?.schema_version === '1.0.0')
}

export function mapViewRotation(layers = []) {
  const mapping = layers.find((layer) => layer.type === 'map_layer')?.properties?.mapping
  const value = (mapping?.display_view || mapping?.view || mapping?.provenance?.view)?.rotation_deg
  return Number.isFinite(value) ? value : 0
}

export function fitPilotVisual(THREE, object, descriptor, size) {
  if (descriptor?.fit !== 'stretch') return false
  // glTF is Y-up. Heading is an appearance correction inside the entity;
  // the entity's map yaw is applied once by MapPanel to its parent mesh.
  const rotated = new THREE.Group()
  rotated.position.copy(object.position)
  rotated.quaternion.copy(object.quaternion)
  rotated.scale.copy(object.scale)
  for (const child of [...object.children]) rotated.add(child)
  rotated.applyMatrix4(
    new THREE.Matrix4().makeRotationY(Number(descriptor.heading_offset_rad || 0))
  )
  object.position.set(0, 0, 0)
  object.quaternion.identity()
  object.scale.set(1, 1, 1)
  object.add(rotated)
  object.updateMatrixWorld(true)
  const before = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  const target = [size[0], size[2], size[1]]
  if (![before.x, before.y, before.z, ...target].every((v) => Number.isFinite(v) && v > 0))
    throw new Error('Invalid Pilot visual dimensions')
  // Scale in entity axes (not rotated mesh axes), including non-square furniture.
  object.scale.multiply(
    new THREE.Vector3(target[0] / before.x, target[1] / before.y, target[2] / before.z)
  )
  object.updateMatrixWorld(true)
  const placed = new THREE.Box3().setFromObject(object)
  object.position.sub(placed.getCenter(new THREE.Vector3()))
  object.updateMatrixWorld(true)
  return true
}

export function positionTwinCamera(THREE, camera, target, distance, layers) {
  if (!hasTwinMap(layers)) return false
  const angle = THREE.MathUtils.degToRad(mapViewRotation(layers))
  if (camera.isOrthographicCamera) {
    camera.position.set(target.x, target.y + distance, target.z)
    camera.up.set(Math.sin(angle), 0, -Math.cos(angle))
  } else {
    camera.position.set(
      target.x - Math.sin(angle) * distance,
      target.y + distance * 0.7,
      target.z + Math.cos(angle) * distance
    )
    camera.up.set(0, 1, 0)
  }
  camera.lookAt(target)
  return true
}

export function stylePilotEntity(mesh, entity) {
  if (!entity.properties?.pilot_robot_id) return
  const color = entity.type === 'wall' ? 0x809491 : entity.type === 'table' ? 0x8eb2a5 : 0x3d6bd9
  mesh.material.color.setHex(color)
  if (entity.type === 'wall') {
    mesh.material.transparent = true
    mesh.material.opacity = 0.32
    mesh.material.depthWrite = false
  }
}
