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

import { describe, expect, it } from 'vitest'
import {
  hasLiveScene,
  sceneWorkspaceView,
  runningProjectScene,
  sceneSelectionAfterRefresh
} from '@/studio/sceneWorkspace'

it('预览刷新保留 radio 选择，不回到窗口最初的 composting 场景', () => {
  const store = {
    projectScenes: [{ project_scene_id: 'composting' }, { project_scene_id: 'radio' }]
  }
  expect(sceneSelectionAfterRefresh('radio', 'composting', store)).toBe('radio')
  expect(sceneSelectionAfterRefresh('', 'radio', store)).toBe('radio')
  expect(sceneSelectionAfterRefresh('removed', 'composting', store)).toBe('composting')
})

it('现场使用实例 scene_key，而不是白杯配置页的旧选择', () => {
  const bowl = { project_scene_id: 'bowl', catalog_scene_id: 'spatial-0' }
  const mug = { project_scene_id: 'mug', catalog_scene_id: 'mug-0' }
  const store = {
    instance: { scene_key: 'libero_spatial:0' },
    catalogSceneId: 'mug-0',
    projectScenes: [mug, bowl],
    catalogById: (id) => ({
      versions: [{ runtime_scene_key: id === 'spatial-0' ? 'libero_spatial:0' : 'libero_90:67' }]
    })
  }
  expect(runningProjectScene(store)).toEqual(bowl)
  store.instance.scene_key = 'libero_90:67'
  expect(runningProjectScene(store)).toEqual(mug)
  store.instance.scene_key = 'unregistered'
  expect(runningProjectScene(store)).toBeNull()
})

const live = () => ({
  instance: { instance_id: 'current', state: 'running', generation: 2 },
  sceneSnapshot: { instance_id: 'current', generation: 2 },
  runtimeInterrupted: false
})

describe('场景工作页按实际现场恢复', () => {
  it('有效现场恢复到现场，暂停也可以查看', () => {
    expect(sceneWorkspaceView(undefined, live())).toBe('live')
    expect(hasLiveScene({ ...live(), instance: { ...live().instance, state: 'paused' } })).toBe(
      true
    )
    expect(sceneWorkspaceView('setup', live())).toBe('setup')
  })
  it('历史实例、断开的 Runtime、缺失或过期快照均回到配置', () => {
    for (const store of [
      { ...live(), instance: null },
      { ...live(), runtimeInterrupted: true },
      { ...live(), sceneSnapshot: null },
      { ...live(), instance: { ...live().instance, state: 'stopped' } },
      { ...live(), instance: { ...live().instance, state: 'failed' } },
      { ...live(), sceneSnapshot: { instance_id: 'old', generation: 2 } },
      { ...live(), sceneSnapshot: { instance_id: 'current', generation: 1 } }
    ]) {
      expect(sceneWorkspaceView('live', store)).toBe('setup')
      expect(sceneWorkspaceView('sensors', store)).toBe('setup')
      expect(hasLiveScene(store)).toBe(false)
    }
  })
  it('地图保留独立查看能力，不依赖仿真实例存在', () => {
    expect(sceneWorkspaceView('map', { instance: null })).toBe('map')
  })
})
