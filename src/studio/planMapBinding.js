export function normalizePlanSelection(value) {
  if (!value || !['entity', 'region', 'point'].includes(value.kind)) return null
  if (value.kind === 'point') {
    if (!value.frame_id || !Array.isArray(value.position) || value.position.length !== 3)
      return null
    return { kind: 'point', frame_id: value.frame_id, position: [...value.position] }
  }
  if (!value.entity_id) return null
  return { kind: value.kind, entity_id: value.entity_id }
}

export function selectionsFromMapBinding(binding = {}) {
  if (Array.isArray(binding.selections)) {
    return binding.selections.map(normalizePlanSelection).filter(Boolean)
  }
  const legacy = []
  for (const entityId of binding.entity_ids || []) {
    legacy.push({ kind: 'entity', entity_id: entityId })
  }
  if (binding.entity_id) legacy.push({ kind: 'entity', entity_id: binding.entity_id })
  if (binding.region_id) legacy.push({ kind: 'region', entity_id: binding.region_id })
  if (binding.point) legacy.push({ kind: 'point', ...binding.point })
  return legacy.map(normalizePlanSelection).filter(Boolean)
}

export function mapBindingFromSelection(mapId, generation, selection) {
  const normalized = normalizePlanSelection(selection)
  if (!mapId || Number(generation) <= 0 || !normalized) return null
  return { map_id: mapId, generation: Number(generation), selections: [normalized] }
}
