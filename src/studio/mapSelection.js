export function isMapSelectionValid(selection, snapshot, mapId) {
  if (!selection || !snapshot || selection.map_id !== mapId) return false
  if (Number(selection.generation) !== Number(snapshot.generation)) return false
  if (selection.kind === 'point') {
    return (
      Boolean(selection.frame_id) &&
      Array.isArray(selection.position) &&
      selection.position.length === 3 &&
      selection.position.every((value) => Number.isFinite(Number(value)))
    )
  }
  if (!['entity', 'region'].includes(selection.kind) || !selection.entity_id) return false
  const entity = snapshot.entities?.find((item) => item.id === selection.entity_id)
  if (!entity || entity.status === 'removed') return false
  if (Number(entity.generation) !== Number(snapshot.generation)) return false
  return selection.kind !== 'region' || entity.geometry?.kind === 'region'
}
