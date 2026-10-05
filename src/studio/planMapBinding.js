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
