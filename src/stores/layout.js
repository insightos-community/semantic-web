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
import { shellForPreset } from '@/studio/presets'
import { supportsInspector } from '@/studio/inspector'

export const LAYOUT_VERSION = 2
export const STUDIO_PRESETS = Object.freeze(['default', 'debug', 'focus'])

const PRIMARY_VIEWS = new Set([
  'explorer',
  'conversation',
  'simulation',
  'builder',
  'map',
  'run',
  'scene',
  'robots'
])
const BOTTOM_TABS = new Set(['activity', 'interactions', 'artifacts', 'logs', 'problems'])
const storageKey = (projectId, preset) =>
  `semantic-studio:layout:v${LAYOUT_VERSION}:${projectId}:${preset}`
const preferredPresetKey = (projectId) =>
  `semantic-studio:layout:v${LAYOUT_VERSION}:${projectId}:preferred-preset`
const SAFE_PANEL_PARAM_KEYS = new Set([
  'panelType',
  'projectId',
  'resourceType',
  'resourceId',
  'viewMode',
  'runId',
  'tabMode',
  'inspectorResourceType',
  'inspectorResourceId',
  'inspectorTitle'
])

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function sanitizeShell(raw = {}, preset = 'default') {
  const fallback = shellForPreset(preset, typeof window === 'undefined' ? 1440 : window.innerWidth)
  const primaryView =
    { conversation: 'explorer', simulation: 'scene', map: 'scene' }[raw.primaryView] ||
    raw.primaryView
  return {
    primaryVisible:
      typeof raw.primaryVisible === 'boolean' ? raw.primaryVisible : fallback.primaryVisible,
    secondaryVisible:
      typeof raw.secondaryVisible === 'boolean' ? raw.secondaryVisible : fallback.secondaryVisible,
    bottomVisible:
      raw.bottomTab === 'inspector'
        ? false
        : typeof raw.bottomVisible === 'boolean'
          ? raw.bottomVisible
          : fallback.bottomVisible,
    primaryWidth: clamp(raw.primaryWidth, 240, 420, fallback.primaryWidth),
    secondaryWidth: clamp(raw.secondaryWidth, 320, 640, fallback.secondaryWidth),
    secondaryTab: raw.secondaryTab === 'inspector' ? 'inspector' : 'conversation',
    conversationLocation:
      raw.conversationLocation === 'editor' || (!raw.conversationLocation && preset === 'focus')
        ? 'editor'
        : 'sidebar',
    conversationOpen: raw.conversationOpen !== false,
    bottomHeight: clamp(raw.bottomHeight, 180, 520, fallback.bottomHeight),
    primaryView: PRIMARY_VIEWS.has(primaryView) ? primaryView : fallback.primaryView,
    bottomTab: BOTTOM_TABS.has(raw.bottomTab) ? raw.bottomTab : fallback.bottomTab
  }
}

// Dockview 的布局 JSON 可以保存编辑器结构和尺寸，但业务正文必须留在
// Pinia/Server。这里递归清理 panel params，避免消息、Run 和 Artifact 内容
// 被意外写入 localStorage。
export function sanitizeLayout(raw) {
  const visit = (value, key = '') => {
    if (Array.isArray(value)) return value.map((item) => visit(item))
    if (!value || typeof value !== 'object') return value
    if (key === 'params') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([paramKey]) => SAFE_PANEL_PARAM_KEYS.has(paramKey))
          .map(([paramKey, paramValue]) => [paramKey, visit(paramValue)])
      )
    }
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, visit(child, childKey)])
    )
  }
  // Pinia 会把 state 中的 Dockview JSON 包装成 Vue Proxy。structuredClone
  // 无法处理 Proxy，拖动区域后会在真正写入 localStorage 前抛错。visit 本身
  // 已经逐层创建普通对象和数组，因此直接遍历即可得到安全的独立副本。
  return visit(raw)
}

export const useLayoutStore = defineStore('studioLayout', {
  state: () => ({
    projectId: '',
    preset: 'default',
    phase: 'uninitialized',
    selectedResource: null,
    inspectorDismissed: false,
    dockLayout: null,
    shell: sanitizeShell({}, 'default'),
    error: ''
  }),
  getters: {
    inspectorAvailable: (state) =>
      !state.inspectorDismissed && supportsInspector(state.selectedResource)
  },
  actions: {
    preferredPreset(projectId) {
      const value = window.localStorage.getItem(preferredPresetKey(projectId))
      return STUDIO_PRESETS.includes(value) ? value : 'default'
    },
    rememberPreset(projectId, preset) {
      if (!projectId || !STUDIO_PRESETS.includes(preset)) return false
      window.localStorage.setItem(preferredPresetKey(projectId), preset)
      return true
    },
    beginRestore(projectId, preset = 'default') {
      this.projectId = projectId
      this.preset = STUDIO_PRESETS.includes(preset) ? preset : 'default'
      this.phase = 'restoring'
      this.error = ''
      this.shell = sanitizeShell({}, this.preset)
      this.dockLayout = null
      this.rememberPreset(projectId, this.preset)
    },
    load(projectId = this.projectId, preset = this.preset) {
      this.beginRestore(projectId, preset)
      const raw = window.localStorage.getItem(storageKey(projectId, this.preset))
      if (!raw) return null
      try {
        const saved = JSON.parse(raw)
        if (saved.version !== LAYOUT_VERSION || !saved.layout) {
          throw new Error('布局版本不兼容')
        }
        this.shell = sanitizeShell(saved.shell, this.preset)
        this.dockLayout = sanitizeLayout(saved.layout)
        return this.dockLayout
      } catch (error) {
        this.phase = 'invalid'
        this.error = error.message || '布局损坏'
        return null
      }
    },
    save(layout, { projectId = this.projectId, preset = this.preset } = {}) {
      if (!projectId || !layout) return false
      this.phase = 'saving'
      this.dockLayout = sanitizeLayout(layout)
      window.localStorage.setItem(
        storageKey(projectId, preset),
        JSON.stringify({
          version: LAYOUT_VERSION,
          preset,
          layout: this.dockLayout,
          shell: sanitizeShell(this.shell, preset)
        })
      )
      this.phase = 'ready'
      return true
    },
    persistShell() {
      if (!this.projectId || !this.dockLayout) return false
      return this.save(this.dockLayout)
    },
    updateShell(patch, { persist = true } = {}) {
      this.shell = sanitizeShell({ ...this.shell, ...patch }, this.preset)
      if (persist) this.persistShell()
    },
    selectPrimary(view) {
      if (!PRIMARY_VIEWS.has(view)) return false
      this.updateShell({ primaryVisible: true, primaryView: view })
      return true
    },
    revealBottom(tab = this.shell.bottomTab) {
      if (!BOTTOM_TABS.has(tab)) return false
      this.updateShell({ bottomVisible: true, bottomTab: tab })
      return true
    },
    revealInspector(focus = true) {
      if (!supportsInspector(this.selectedResource)) return false
      this.inspectorDismissed = false
      this.updateShell({ secondaryVisible: true, ...(focus ? { secondaryTab: 'inspector' } : {}) })
      return true
    },
    closeInspector() {
      this.inspectorDismissed = true
      if (this.shell.secondaryTab === 'inspector')
        this.updateShell({ secondaryTab: 'conversation' })
    },
    markReady() {
      this.phase = 'ready'
    },
    select(resource) {
      const changed =
        this.selectedResource?.resourceType !== resource?.resourceType ||
        this.selectedResource?.resourceId !== resource?.resourceId
      this.selectedResource = resource
        ? {
            projectId: resource.projectId || this.projectId,
            resourceType: resource.resourceType || '',
            resourceId: resource.resourceId || '',
            title: resource.title || '',
            robotId: resource.robotId || '',
            source: resource.source || ''
          }
        : null
      if (changed) this.inspectorDismissed = false
      // 状态同步只更新选中对象；用户点击对象后调用 revealInspector 显示详情。
      // 这样实时刷新不会反复抢走对话焦点，没有属性的对象仍会关闭 Inspector。
      if (!this.inspectorAvailable && this.shell.secondaryTab === 'inspector') {
        this.updateShell({ secondaryTab: 'conversation' })
      }
    },
    reset(projectId = this.projectId, preset = this.preset) {
      window.localStorage.removeItem(storageKey(projectId, preset))
      this.phase = 'uninitialized'
      this.error = ''
      this.shell = sanitizeShell({}, preset)
      this.dockLayout = null
      this.selectedResource = null
      this.inspectorDismissed = false
    },
    clearProject() {
      this.projectId = ''
      this.phase = 'uninitialized'
      this.selectedResource = null
      this.inspectorDismissed = false
      this.dockLayout = null
      this.shell = sanitizeShell({}, 'default')
    }
  }
})
