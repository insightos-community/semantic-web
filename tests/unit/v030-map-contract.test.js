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

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}))

vi.mock('@/api/request', () => ({
  default: http
}))

import { createMapGeneration, serializeMapUpdate, updateMap } from '@/api/semanticMaps'
import { normalizeMapSnapshot } from '@/stores/semanticMap'

describe('v0.3 Semantic Map 公开接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    http.post.mockResolvedValue({})
  })

  it('解析 Framework 的嵌套 MapSnapshot，不丢 generation 与 revision', () => {
    const result = normalizeMapSnapshot(
      {
        map: {
          map_id: 'map-simulation-id',
          slot: 'simulation_map',
          project_id: 'project-1',
          generation: 4,
          revision: 7,
          frame_id: 'world'
        },
        generation_view: { generation: 4, revision: 7, reason: 'reset' },
        read_only: false,
        entities: [
          {
            id: 'region-1',
            generation: 4,
            type: 'region',
            name: '托盘区域',
            status: 'active',
            frame_id: 'world',
            bounds: { kind: 'region', size: { x: 1, y: 1, z: 0.02 } },
            properties: { purpose: 'drop_zone' }
          }
        ],
        relations: []
      },
      'simulation_map'
    )

    expect(result).toMatchObject({
      map_id: 'simulation_map',
      generation: 4,
      revision: 7,
      frame_id: 'world',
      read_only: false
    })
    expect(result.entities[0]).toMatchObject({
      id: 'region-1',
      geometry: { kind: 'region' },
      properties: { purpose: 'drop_zone' }
    })
  })

  it('把 UI 领域操作集中转换为 Framework MapUpdate', () => {
    expect(
      serializeMapUpdate({
        generation: 4,
        revision: 7,
        operations: [
          {
            op: 'upsert_entity',
            entity: {
              id: 'entity-1',
              name: '箱体',
              type: 'box',
              evidence: ['artifact-image-1'],
              geometry: { kind: 'box', size: { x: 1, y: 1, z: 1 } }
            }
          },
          { op: 'remove_entity', entity_id: 'entity-old' },
          {
            op: 'upsert_relation',
            relation: {
              id: 'relation-1',
              subject_id: 'entity-1',
              predicate: 'inside',
              object_id: 'region-1'
            }
          },
          { op: 'remove_relation', relation_id: 'relation-old' }
        ]
      })
    ).toEqual({
      generation: 4,
      expected_revision: 7,
      source: 'user',
      entities: [
        {
          id: 'entity-1',
          name: '箱体',
          type: 'box',
          evidence: ['artifact-image-1'],
          bounds: { kind: 'box', size: { x: 1, y: 1, z: 1 } }
        }
      ],
      remove_entity_ids: ['entity-old'],
      relations: [
        {
          id: 'relation-1',
          subject_id: 'entity-1',
          predicate: 'inside',
          object_id: 'region-1'
        }
      ],
      remove_relation_ids: ['relation-old']
    })
  })

  it('把 Region 和 Cylinder 转成 Framework Bounds', () => {
    const update = serializeMapUpdate({
      generation: 2,
      revision: 3,
      operations: [
        {
          op: 'upsert_entity',
          entity: {
            id: 'region-1',
            pose: { position: { x: 2, y: 3, z: 0 } },
            geometry: { kind: 'region', size: { x: 4, y: 2, z: 0.02 } }
          }
        },
        {
          op: 'upsert_entity',
          entity: {
            id: 'cylinder-1',
            geometry: { kind: 'cylinder', size: { x: 0.8, y: 0.8, z: 1.2 } }
          }
        },
        {
          op: 'upsert_entity',
          entity: {
            id: 'canonical-cylinder',
            bounds: { kind: 'cylinder', radius: 0.5, height: 1.5 }
          }
        }
      ]
    })

    expect(update.entities[0].bounds).toEqual({
      kind: 'region',
      points: [
        { x: 0, y: 2, z: 0 },
        { x: 4, y: 2, z: 0 },
        { x: 4, y: 4, z: 0 },
        { x: 0, y: 4, z: 0 }
      ]
    })
    expect(update.entities[1].bounds).toEqual({ kind: 'cylinder', radius: 0.4, height: 1.2 })
    expect(update.entities[2].bounds).toEqual({ kind: 'cylinder', radius: 0.5, height: 1.5 })
  })

  it('generation 与 update 请求只发送 Framework 公开字段', async () => {
    await createMapGeneration('project-1', 'simulation_map', {
      revision: 7,
      reason: 'scene reset'
    })
    expect(http.post).toHaveBeenNthCalledWith(
      1,
      '/projects/project-1/maps/simulation_map/generations',
      { expected_revision: 7, reason: 'scene reset' }
    )

    await updateMap('project-1', 'real_map', {
      generation: 2,
      revision: 3,
      operations: [{ op: 'remove_entity', entity_id: 'entity-1' }]
    })
    expect(http.post).toHaveBeenNthCalledWith(2, '/projects/project-1/maps/real_map/updates', {
      generation: 2,
      expected_revision: 3,
      source: 'user',
      entities: [],
      remove_entity_ids: ['entity-1'],
      relations: [],
      remove_relation_ids: []
    })
  })
})
