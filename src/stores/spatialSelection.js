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
import * as simulationApi from '@/api/simulation'
import { useSemanticMapStore } from '@/stores/semanticMap'

/**
 * Viewer 与 Semantic Map 共享的离散空间选择。
 *
 * 这里只保存公共 source_id/entity_id，不保存 MuJoCo body/geom。originToken 用来
 * 阻止 Viewer 与 Map 在互相高亮时形成事件回环；选择本身不会写地图或发送命令。
 */
export const useSpatialSelectionStore = defineStore('spatialSelection', {
  state: () => ({
    projectId: '',
    generation: 0,
    sourceId: '',
    entityId: '',
    origin: '',
    originToken: 0
  }),
  actions: {
    clear() {
      this.sourceId = ''
      this.entityId = ''
      this.origin = ''
      this.originToken += 1
    },
    ensureGeneration(projectId, generation) {
      const next = Number(generation || 0)
      if (this.projectId !== projectId || this.generation !== next) {
        this.projectId = projectId
        this.generation = next
        this.clear()
      }
    },
    async fromViewer(projectId, instanceId, generation, sourceId) {
      this.ensureGeneration(projectId, generation)
      this.sourceId = sourceId || ''
      this.entityId = ''
      this.origin = 'viewer'
      const token = ++this.originToken
      if (!sourceId) return null
      try {
        const response = await simulationApi.resolveSourceLink(projectId, instanceId, {
          generation,
          source_id: sourceId
        })
        if (token !== this.originToken || Number(generation) !== this.generation) return null
        this.entityId = response.source_link?.entity_id || ''
        // 跨面板选择属于共享领域状态，不能依赖 Map 面板当前是否挂载。
        // 这里只更新地图选择，不改变 Studio Inspector；Viewer 仍展示仿真对象属性。
        const semanticMap = useSemanticMapStore()
        const entity = this.entityId ? semanticMap.entityById(this.entityId) : null
        if (semanticMap.activeMapId === 'simulation_map' && entity) {
          const kind = entity.geometry?.kind === 'region' ? 'region' : 'entity'
          semanticMap.select({ kind, entity_id: entity.id })
        }
        return response.source_link || null
      } catch (error) {
        // Map 尚未同步时对象选择仍然有效；不能伪造 entity_id，也不把它当 Viewer 故障。
        if (error?.status !== 404 && error?.code !== 'SIMULATION_NOT_FOUND') throw error
        return null
      }
    },
    async fromMap(projectId, instanceId, generation, entityId) {
      this.ensureGeneration(projectId, generation)
      this.entityId = entityId || ''
      this.sourceId = ''
      this.origin = 'map'
      const token = ++this.originToken
      if (!entityId || !instanceId) return null
      try {
        const response = await simulationApi.resolveSourceLink(projectId, instanceId, {
          generation,
          entity_id: entityId
        })
        if (token !== this.originToken || Number(generation) !== this.generation) return null
        this.sourceId = response.source_link?.source_id || ''
        return response.source_link || null
      } catch (error) {
        if (error?.status !== 404 && error?.code !== 'SIMULATION_NOT_FOUND') throw error
        return null
      }
    }
  }
})
