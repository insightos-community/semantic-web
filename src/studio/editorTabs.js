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

// Tab 生命周期只属于工作区布局。运行、消息和场景实例仍由各自 Store 管理。
export function editorTabMode(type, params = {}) {
  if (params.tabMode === 'pinned') return 'pinned'
  if (params.tabMode === 'kept' || params.preview === false) return 'kept'
  return ['scene-workspace', 'conversation'].includes(type) ? 'kept' : 'preview'
}

export function replaceablePreview(panels, isDirty) {
  return panels.find((panel) => panel.params?.tabMode === 'preview' && !isDirty(panel.id))
}

export function closeableTabs(panels) {
  return panels.filter((panel) => panel.params?.tabMode !== 'pinned' && !permanentEditor(panel))
}

export function permanentEditor(panel) {
  return panel?.params?.panelType === 'scene-workspace'
}

export function persistentEditorLayout(layout) {
  const panels = Object.fromEntries(
    Object.entries(layout.panels || {}).filter(([, panel]) => panel.params?.tabMode !== 'preview')
  )
  const groups = []
  // Dockview 的主区域、浮动窗口和弹出窗口都引用同一份 panels。删除预览时
  // 同时修正组内选择和空组，避免恢复布局后出现不存在的 activeView。
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit).filter((item) => item !== null)
    if (!value || typeof value !== 'object') return value
    if (Array.isArray(value.views)) {
      const views = value.views.filter((id) => panels[id])
      if (!views.length) return null
      groups.push(value.id)
      return {
        ...value,
        views,
        activeView: views.includes(value.activeView) ? value.activeView : views[0]
      }
    }
    const result = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item)])
    )
    if (
      'data' in result &&
      (result.data === null || (Array.isArray(result.data) && !result.data.length))
    )
      return null
    return result
  }
  const saved = visit({ ...layout, panels: undefined })
  // 主区域只剩预览时，浮动窗口中仍可能有保留页；保留合法的空主网格，
  // 不因主网格变空而一起丢弃这些窗口。
  if (saved.grid && !saved.grid.root) {
    saved.grid.root = { ...layout.grid.root, type: 'branch', data: [] }
  }
  return {
    ...saved,
    panels,
    activeGroup: groups.includes(layout.activeGroup) ? layout.activeGroup : groups[0]
  }
}
