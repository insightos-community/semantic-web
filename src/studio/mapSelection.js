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
