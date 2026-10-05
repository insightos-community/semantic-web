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

// 恢复的是仍存在的运行现场，而不是浏览器最后打开的 Viewer 标签。
export function hasLiveScene(store) {
  if (!store.instance || store.runtimeInterrupted) return false
  if (!['running', 'paused'].includes(store.instance.state)) return false
  const snapshot = store.sceneSnapshot
  if (!snapshot) return false
  return (
    (!snapshot.instance_id || snapshot.instance_id === store.instance.instance_id) &&
    (snapshot.generation == null || snapshot.generation === store.instance.generation)
  )
}

export function sceneWorkspaceView(requested, store) {
  if (requested === 'map') return 'map'
  if (!hasLiveScene(store)) return 'setup'
  return ['setup', 'live', 'sensors'].includes(requested) ? requested : 'live'
}

// 目录刷新只补全无效选择。面板的 resourceId 是打开窗口时的入口，不能在
// 每次预览轮询后覆盖用户随后选中的场景（项目第一项可能是另一个任务）。
export function sceneSelectionAfterRefresh(current, requested, store) {
  const exists = (id) => store.projectScenes.some((item) => item.project_scene_id === id)
  if (exists(current)) return current
  if (exists(requested)) return requested
  return (
    runningProjectScene(store)?.project_scene_id || store.projectScenes[0]?.project_scene_id || ''
  )
}

// Viewer 消费的是运行实例。配置页的历史选择不能作为现场标题；优先用
// Runtime 的 scene_key 匹配目录，避免旧 catalog 选择覆盖实际任务身份。
export function runningProjectScene(store) {
  const key = store.instance?.scene_key
  if (!store.instance) return null
  return (
    store.projectScenes.find((item) => {
      const catalog = store.catalogById(item.catalog_scene_id)
      return key
        ? catalog?.versions?.some((version) => version.runtime_scene_key === key)
        : item.catalog_scene_id === store.catalogSceneId
    }) || null
  )
}
