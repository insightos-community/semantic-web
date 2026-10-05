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

import { defineStore } from 'pinia'
import {
  MAP_IDS,
  createMapGeneration,
  getMapSnapshot,
  queryMap,
  updateMap
} from '@/api/semanticMaps'
import { isMapSelectionValid } from '@/studio/mapSelection'

const rows = (value) => (Array.isArray(value) ? value : [])

const geometryFromBounds = (bounds = {}) => {
  if (bounds.kind === 'cylinder') {
    return {
      kind: 'cylinder',
      size: {
        x: Number(bounds.radius || 0.2) * 2,
        y: Number(bounds.radius || 0.2) * 2,
        z: Number(bounds.height || 0)
      }
    }
  }
  if (['plane', 'region'].includes(bounds.kind) && bounds.points?.length) {
    const xs = bounds.points.map((point) => Number(point.x || 0))
    const ys = bounds.points.map((point) => Number(point.y || 0))
    return {
      ...bounds,
      size: {
        x: Math.max(...xs) - Math.min(...xs),
        y: Math.max(...ys) - Math.min(...ys),
        z: 0.02
      }
    }
  }
  return bounds.kind ? bounds : { kind: 'box', size: { x: 0.4, y: 0.4, z: 0.4 } }
}

const normalizeEntity = (value = {}) => ({
  ...value,
  id: value.id || value.entity_id || '',
  map_id: value.map_id || value.mapId || '',
  generation: Number(value.generation || 0),
  revision: Number(value.revision || 0),
  status: value.status || 'active',
  frame_id: value.frame_id || value.frameId || 'world',
  pose: value.pose || {
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 }
  },
  geometry: value.geometry || geometryFromBounds(value.bounds),
  properties: value.properties || {}
})

const normalizeRelation = (value = {}) => ({
  ...value,
  id: value.id || value.relation_id || '',
  subject_id: value.subject_id || value.subjectId || '',
  predicate: value.predicate || value.type || 'related_to',
  object_id: value.object_id || value.objectId || '',
  revision: Number(value.revision || 0)
})

export const normalizeMapSnapshot = (value = {}, fallbackId = '') => {
  const metadata = value.map || value
  // HTTP、Interaction 和 Studio 始终使用稳定的地图槽位；Framework 内部
  // map_id 只用于保存地图实例，不能在 generation 变化后替换前端路由。
  const mapId = metadata.slot || fallbackId || metadata.map_id || metadata.id
  return {
    ...value,
    ...metadata,
    id: mapId,
    map_id: mapId,
    generation: Number(metadata.generation || 0),
    revision: Number(metadata.revision || 0),
    frame_id: metadata.frame_id || metadata.frameId || 'world',
    read_only: Boolean(value.read_only),
    generation_view: value.generation_view || null,
    entities: rows(value.entities).map((entity) => normalizeEntity({ ...entity, map_id: mapId })),
    relations: rows(value.relations).map(normalizeRelation)
  }
}

export const useSemanticMapStore = defineStore('semanticMap', {
  state: () => ({
    projectId: '',
    activeMapId: 'simulation_map',
    snapshots: { simulation_map: null, real_map: null },
    summaries: [],
    selection: null,
    selectionPurpose: '',
    loading: false,
    saving: false,
    error: ''
  }),
  getters: {
    activeSnapshot: (state) => state.snapshots[state.activeMapId],
    entities: (state) => state.snapshots[state.activeMapId]?.entities || [],
    relations: (state) => state.snapshots[state.activeMapId]?.relations || [],
    entityById: (state) => (entityId) =>
      state.snapshots[state.activeMapId]?.entities.find((item) => item.id === entityId) || null,
    selectionValid: (state) =>
      isMapSelectionValid(state.selection, state.snapshots[state.activeMapId], state.activeMapId),
    isBindingCurrent: (state) => (binding) => {
      if (!binding?.map_id || !Number(binding.generation)) return false
      const mapId = binding.map_id
      const snapshot = state.snapshots[mapId]
      const summary = state.summaries.find(
        (item) => (item.map_id || item.slot || item.id) === mapId
      )
      const currentGeneration = Number(snapshot?.generation || summary?.generation || 0)
      const selections = rows(binding.selections)
      if (!selections.length) return false
      if (currentGeneration && currentGeneration !== Number(binding.generation)) return false
      if (!snapshot) return true
      return selections.every((selection) =>
        isMapSelectionValid(
          { ...selection, map_id: mapId, generation: Number(binding.generation) },
          snapshot,
          mapId
        )
      )
    }
  },
  actions: {
    hydrate(projectId, snapshot = {}) {
      this.projectId = projectId
      this.summaries = rows(snapshot.map_summaries)
      for (const raw of rows(snapshot.maps)) {
        const map = normalizeMapSnapshot(raw)
        if (MAP_IDS.includes(map.map_id)) this.snapshots[map.map_id] = map
      }
    },
    async load(mapId = this.activeMapId) {
      if (!MAP_IDS.includes(mapId)) throw new Error('未知地图类型')
      this.loading = true
      this.error = ''
      try {
        const snapshot = normalizeMapSnapshot(await getMapSnapshot(this.projectId, mapId), mapId)
        if (snapshot.map_id !== mapId) throw new Error('地图响应与当前选择不匹配')
        this.snapshots[mapId] = snapshot
        return snapshot
      } catch (error) {
        this.error = error.message || 'Semantic Map 加载失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async switchMap(mapId) {
      if (!MAP_IDS.includes(mapId)) return false
      this.activeMapId = mapId
      this.clearSelection()
      if (!this.snapshots[mapId]) await this.load(mapId)
      return true
    },
    async query(query) {
      return queryMap(this.projectId, this.activeMapId, {
        ...query,
        generation: this.activeSnapshot?.generation
      })
    },
    async submitUpdate(operations) {
      if (!this.activeSnapshot) await this.load()
      this.saving = true
      try {
        const snapshot = normalizeMapSnapshot(
          await updateMap(this.projectId, this.activeMapId, {
            generation: this.activeSnapshot.generation,
            revision: this.activeSnapshot.revision,
            operations
          }),
          this.activeMapId
        )
        this.snapshots[this.activeMapId] = snapshot
        if (this.selection && !isMapSelectionValid(this.selection, snapshot, this.activeMapId)) {
          this.clearSelection()
        }
        return snapshot
      } catch (error) {
        this.error =
          error.code === 'MAP_GENERATION_CONFLICT'
            ? '地图已经进入新的地图版本，请重新选择'
            : error.message
        throw error
      } finally {
        this.saving = false
      }
    },
    async newGeneration(reason) {
      const snapshot = normalizeMapSnapshot(
        await createMapGeneration(this.projectId, this.activeMapId, {
          revision: this.activeSnapshot?.revision || 0,
          reason
        }),
        this.activeMapId
      )
      this.snapshots[this.activeMapId] = snapshot
      this.clearSelection()
      return snapshot
    },
    beginSelection(purpose) {
      this.selectionPurpose = purpose || ''
      this.selection = null
    },
    select(selection) {
      if (!this.activeSnapshot) return false
      const candidate = {
        ...selection,
        map_id: this.activeMapId,
        generation: this.activeSnapshot.generation
      }
      if (!isMapSelectionValid(candidate, this.activeSnapshot, this.activeMapId)) return false
      this.selection = candidate
      return true
    },
    clearSelection() {
      this.selection = null
      this.selectionPurpose = ''
    },
    applyEvent(event) {
      if (
        event.project_id !== this.projectId ||
        !['semantic_map', 'map_entity', 'map_relation'].includes(event.resource_type)
      ) {
        return false
      }
      const mapId =
        event.payload?.map_id ||
        event.payload?.map?.slot ||
        event.payload?.map?.map_id ||
        event.resource_id
      if (!MAP_IDS.includes(mapId)) return false
      const generation = Number(event.payload?.generation || 0)
      if (generation && this.snapshots[mapId] && generation < this.snapshots[mapId].generation) {
        return false
      }
      getMapSnapshot(this.projectId, mapId)
        .then((raw) => {
          if (this.projectId !== event.project_id) return
          const snapshot = normalizeMapSnapshot(raw, mapId)
          const current = this.snapshots[mapId]
          if (
            current &&
            (snapshot.generation < current.generation ||
              (snapshot.generation === current.generation && snapshot.revision < current.revision))
          )
            return
          this.snapshots[mapId] = snapshot
          if (
            this.selection?.map_id === mapId &&
            !isMapSelectionValid(this.selection, snapshot, mapId)
          ) {
            this.clearSelection()
          }
        })
        .catch((error) => {
          this.error = error.message || '地图状态对账失败'
        })
      return true
    },
    clear() {
      this.projectId = ''
      this.activeMapId = 'simulation_map'
      this.snapshots = { simulation_map: null, real_map: null }
      this.summaries = []
      this.clearSelection()
      this.loading = false
      this.saving = false
      this.error = ''
    }
  }
})
