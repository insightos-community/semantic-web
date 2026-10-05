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

import request from './request'
import { studioFixture } from '@/fixtures/studioFixture'

export const MAP_IDS = Object.freeze(['simulation_map', 'real_map'])

const fixtureEnabled = () => import.meta.env.VITE_STUDIO_FIXTURES === 'true'
const id = (value) => encodeURIComponent(value)

function mapBounds(entity, geometry = {}, canonical = false) {
  if (canonical) return geometry
  const kind = geometry.kind || 'box'
  const size = geometry.size || { x: 0.4, y: 0.4, z: 0.4 }
  if (kind === 'cylinder') {
    return { kind, radius: Number(size.x || size.y || 0.4) / 2, height: Number(size.z || 0) }
  }
  if (kind === 'plane' || kind === 'region') {
    const center = entity.pose?.position || { x: 0, y: 0, z: 0 }
    const halfX = Number(size.x || 0.4) / 2
    const halfY = Number(size.y || 0.4) / 2
    const z = Number(center.z || 0)
    return {
      kind,
      points: [
        { x: Number(center.x || 0) - halfX, y: Number(center.y || 0) - halfY, z },
        { x: Number(center.x || 0) + halfX, y: Number(center.y || 0) - halfY, z },
        { x: Number(center.x || 0) + halfX, y: Number(center.y || 0) + halfY, z },
        { x: Number(center.x || 0) - halfX, y: Number(center.y || 0) + halfY, z }
      ]
    }
  }
  return { kind, size }
}

function serializeEntity(entity = {}) {
  const { geometry, bounds, ...value } = entity
  return { ...value, bounds: mapBounds(entity, geometry || bounds, !geometry && Boolean(bounds)) }
}

export function serializeMapUpdate(payload = {}) {
  const result = {
    generation: payload.generation,
    expected_revision: payload.expected_revision ?? payload.revision,
    source: payload.source || 'user',
    entities: [],
    remove_entity_ids: [],
    relations: [],
    remove_relation_ids: []
  }
  for (const operation of payload.operations || []) {
    if (operation.op === 'upsert_entity') result.entities.push(serializeEntity(operation.entity))
    else if (operation.op === 'remove_entity') result.remove_entity_ids.push(operation.entity_id)
    else if (operation.op === 'upsert_relation') result.relations.push(operation.relation)
    else if (operation.op === 'remove_relation')
      result.remove_relation_ids.push(operation.relation_id)
  }
  return result
}

export async function getMapSnapshot(projectId, mapId) {
  const response = fixtureEnabled()
    ? await studioFixture.getMapSnapshot(projectId, mapId)
    : await request.get('/projects/' + id(projectId) + '/maps/' + id(mapId))
  return response?.map_snapshot || response?.snapshot || response
}

export async function queryMap(projectId, mapId, query = {}) {
  const response = fixtureEnabled()
    ? await studioFixture.queryMap(projectId, mapId, query)
    : await request.post('/projects/' + id(projectId) + '/maps/' + id(mapId) + '/query', query)
  return response?.map_view || response?.result || response
}

export async function createMapGeneration(projectId, mapId, payload) {
  const body = {
    reason: payload.reason,
    expected_revision: payload.expected_revision ?? payload.revision
  }
  const response = fixtureEnabled()
    ? await studioFixture.createMapGeneration(projectId, mapId, body)
    : await request.post('/projects/' + id(projectId) + '/maps/' + id(mapId) + '/generations', body)
  return response?.map_snapshot || response?.snapshot || response
}

export async function updateMap(projectId, mapId, payload) {
  const response = fixtureEnabled()
    ? await studioFixture.updateMap(projectId, mapId, serializeMapUpdate(payload))
    : await request.post(
        '/projects/' + id(projectId) + '/maps/' + id(mapId) + '/updates',
        serializeMapUpdate(payload)
      )
  return response?.map_snapshot || response?.snapshot || response
}
