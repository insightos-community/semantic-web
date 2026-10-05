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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({ resolveSourceLink: vi.fn() }))

vi.mock('@/api/simulation', () => api)

import { useSemanticMapStore } from '@/stores/semanticMap'
import { useSpatialSelectionStore } from '@/stores/spatialSelection'

describe('Viewer 与 Semantic Map 空间选择', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('Viewer source_id 解析后直接更新地图选择且不形成回环', async () => {
    const semanticMap = useSemanticMapStore()
    semanticMap.hydrate('project-1', {
      maps: [
        {
          slot: 'simulation_map',
          generation: 2,
          revision: 1,
          frame_id: 'world',
          entities: [
            {
              entity_id: 'entity-r1',
              generation: 2,
              revision: 1,
              name: 'r1_pro_chassis-1',
              type: 'robot',
              status: 'active',
              frame_id: 'world',
              geometry: { kind: 'box', size: { x: 1, y: 1, z: 2 } }
            }
          ],
          relations: []
        }
      ]
    })
    api.resolveSourceLink.mockResolvedValue({
      source_link: {
        map_id: 'simulation_map',
        generation: 1,
        source_id: 'r1_pro_chassis-1',
        entity_id: 'entity-r1'
      }
    })

    const selection = useSpatialSelectionStore()
    const result = await selection.fromViewer(
      'project-1',
      'instance-1',
      1,
      'r1_pro_chassis-1'
    )

    expect(result?.entity_id).toBe('entity-r1')
    expect(selection.entityId).toBe('entity-r1')
    expect(semanticMap.selection).toMatchObject({
      map_id: 'simulation_map',
      generation: 2,
      entity_id: 'entity-r1'
    })
    expect(api.resolveSourceLink).toHaveBeenCalledTimes(1)
  })
})
