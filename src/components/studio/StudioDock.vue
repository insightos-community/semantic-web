<!--
Copyright 2026 InsightOS
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<template>
  <div
    ref="host"
    class="studio-dock"
    :class="ui.theme === 'dark' ? 'dockview-theme-dark' : 'dockview-theme-light'"
    data-testid="studio-editor"
  >
    <DockviewVue
      class="dockview-root"
      style="width: 100%; height: 100%"
      :components="dockComponents"
      :default-tab-component="StudioTab"
      :get-tab-context-menu-items="getTabContextMenuItems"
      @ready="onReady"
    />
  </div>
</template>

<script setup>
import { markRaw, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { DockviewVue } from 'dockview-vue'
import { ElMessageBox } from 'element-plus'
import StudioPanelHost from '@/components/studio/StudioPanelHost.vue'
import StudioTab from '@/components/studio/StudioTab.vue'
import { useLayoutStore } from '@/stores/layout'
import { useUiStore } from '@/stores/ui'
import { makePanelId, panelTitle } from '@/studio/panelRegistry'
import {
  clearPanelCloseRequester,
  dirtyPanelIds,
  discardPanels,
  panelIsDirty,
  panelGuardRevision,
  savePanels,
  setPanelCloseRequester
} from '@/studio/panelLifecycle'
import { panelsForPreset } from '@/studio/presets'
import {
  closeableTabs,
  editorTabMode,
  persistentEditorLayout,
  permanentEditor,
  replaceablePreview
} from '@/studio/editorTabs'

const props = defineProps({
  projectId: { type: String, required: true },
  initialPreset: { type: String, default: 'default' }
})
const emit = defineEmits(['layout-ready', 'active-panel', 'panels-closed'])
const layout = useLayoutStore()
const ui = useUiStore()
const dockComponents = { studioPanel: markRaw(StudioPanelHost) }
const host = shallowRef(null)
const api = shallowRef(null)
let layoutListener = null
let activeListener = null
let addedListener = null
let removedListener = null
const parameterListeners = new Map()
let saveTimer = null
let readyFrame = 0
let restoring = false
let resizeObserver = null
let closeChordAt = 0

function addPanel(type, params = {}, position) {
  if (!api.value) return null
  const resourceId = params.resourceId || ''
  const id = makePanelId(type, type === 'scene-workspace' ? '' : resourceId)
  const existing = api.value.getPanel(id)
  if (existing) {
    if (type === 'scene-workspace')
      existing.api.updateParameters({
        resourceId: resourceId || existing.params?.resourceId || '',
        viewMode: params.viewMode || existing.params?.viewMode || ''
      })
    if (params.preview === false || params.tabMode)
      setTabMode(existing, editorTabMode(type, params))
    existing.api.setActive()
    return existing
  }
  const tabMode = editorTabMode(type, params)
  const targetGroup = position ? null : api.value.activeGroup
  const previous =
    tabMode === 'preview' && targetGroup
      ? replaceablePreview(panelsInGroup(targetGroup), panelIsDirty)
      : null
  const options = {
    id,
    component: 'studioPanel',
    title: panelTitle(type, resourceId),
    params: {
      panelType: type,
      projectId: props.projectId,
      resourceType: params.resourceType || '',
      resourceId,
      viewMode: params.viewMode || '',
      runId: params.runId || '',
      tabMode,
      inspectorResourceType: params.inspectorResourceType || '',
      inspectorResourceId: params.inspectorResourceId || '',
      inspectorTitle: params.inspectorTitle || ''
    }
  }
  if (position) options.position = position
  const panel = api.value.addPanel(options)
  // 先打开新页面再移除旧预览，保留编辑器组的位置和尺寸。未保存页面由
  // guard 提升为保留页，不参与预览替换，也不触发保存确认打断浏览。
  if (previous && previous.group === panel.group) api.value.removePanel(previous)
  // 打开面板是低频、离散的用户操作，必须在返回前把新的 Dock 结构写入本地布局。
  // 拖拽和尺寸变化继续使用防抖保存；但若这里也等待定时器，用户紧接着刷新
  // 页面时，浏览器不保证 Vue 的卸载钩子有机会执行，刚打开的运行面板就会丢失。
  // restore/applyDefault 期间 restoring=true，saveNow 会主动跳过，不会覆盖待恢复布局。
  saveNow()
  return panel
}

function setTabMode(panel, mode) {
  panel.api.updateParameters({ tabMode: mode })
  // 单 Tab（或已经在首位）无需移动。Dockview 移动时会先移除页面，
  // 单 Tab 组会因此被销毁，随后插回已脱离布局的组，导致页面不可见。
  if (mode === 'pinned' && panelsInGroup(panel.group).indexOf(panel) > 0) {
    panel.api.moveTo({ group: panel.group, index: 0, skipSetActive: !panel.api.isActive })
  }
  saveNow()
}

watch(panelGuardRevision, () => {
  for (const panel of api.value?.panels || []) {
    if (panel.params?.tabMode === 'preview' && panelIsDirty(panel.id)) setTabMode(panel, 'kept')
  }
})

function existingPanels(panelIds) {
  if (!api.value) return []
  return [...new Set(panelIds)].map((panelId) => api.value.getPanel(panelId)).filter(Boolean)
}

async function resolveDirtyPanels(panels, reason = 'close') {
  const dirtyIds = dirtyPanelIds(panels.map((panel) => panel.id))
  if (!dirtyIds.length) return true
  const names = dirtyIds.map((panelId) => api.value?.getPanel(panelId)?.title || panelId)
  try {
    await ElMessageBox({
      title: reason === 'project-exit' ? '退出 Project 前保存修改' : '关闭未保存页面',
      message: `以下页面有未保存修改：${names.join('、')}`,
      type: 'warning',
      showCancelButton: true,
      distinguishCancelAndClose: true,
      confirmButtonText: '全部保存并关闭',
      cancelButtonText: '全部放弃并关闭',
      closeOnClickModal: false
    })
    await savePanels(dirtyIds)
    if (dirtyPanelIds(dirtyIds).length) throw new Error('保存后仍存在未提交修改')
    return true
  } catch (actionOrError) {
    if (actionOrError === 'cancel') {
      await discardPanels(dirtyIds)
      return true
    }
    if (actionOrError !== 'close') {
      ui.notify({
        type: 'error',
        message: actionOrError?.message || '页面保存失败，已取消关闭'
      })
    }
    return false
  }
}

async function requestClosePanels(panelIds, { reason = 'close', remove = true } = {}) {
  const panels = existingPanels(panelIds).filter((panel) => !remove || !permanentEditor(panel))
  if (!panels.length) return true
  if (!(await resolveDirtyPanels(panels, reason))) return false
  if (remove) {
    for (const panel of panels) {
      if (api.value?.getPanel(panel.id)) api.value.removePanel(panel)
    }
    saveNow()
    emit(
      'panels-closed',
      panels.map((panel) => ({ ...panel.params }))
    )
  }
  return true
}

function panelsInGroup(group) {
  return Array.isArray(group?.panels) ? group.panels : []
}

function getTabContextMenuItems({ panel, group }) {
  const groupPanels = panelsInGroup(group)
  const index = groupPanels.findIndex((item) => item.id === panel.id)
  const otherIds = closeableTabs(groupPanels)
    .filter((item) => item.id !== panel.id)
    .map((item) => item.id)
  const rightIds =
    index < 0 ? [] : closeableTabs(groupPanels.slice(index + 1)).map((item) => item.id)
  const savedIds = closeableTabs(groupPanels)
    .filter((item) => !panelIsDirty(item.id))
    .map((item) => item.id)
  const allIds = closeableTabs(api.value?.panels || []).map((item) => item.id)
  return [
    {
      label: '保留打开',
      disabled: panel.params?.tabMode !== 'preview',
      action: () => setTabMode(panel, 'kept')
    },
    {
      label: panel.params?.tabMode === 'pinned' ? '取消置顶' : '置顶',
      action: () => setTabMode(panel, panel.params?.tabMode === 'pinned' ? 'kept' : 'pinned')
    },
    {
      label: '关闭当前',
      disabled: permanentEditor(panel),
      action: () => void requestClosePanels([panel.id])
    },
    {
      label: '关闭其他',
      disabled: !otherIds.length,
      action: () => void requestClosePanels(otherIds)
    },
    {
      label: '关闭右侧',
      disabled: !rightIds.length,
      action: () => void requestClosePanels(rightIds)
    },
    {
      label: '关闭已保存',
      disabled: !savedIds.length,
      action: () => void requestClosePanels(savedIds)
    },
    {
      label: '关闭未置顶页面',
      disabled: !allIds.length,
      action: () => void requestClosePanels(allIds)
    }
  ]
}

function applyDefault(preset) {
  restoring = true
  api.value.clear()
  for (const type of panelsForPreset(preset)) {
    addPanel(type)
  }
  if (!api.value.getPanel('scene-workspace')) addPanel('scene-workspace')
  restoring = false
  layout.markReady()
  saveNow()
}

function restorePreset(preset) {
  layout.preset = preset
  const saved = layout.load(props.projectId, preset)
  if (!saved || !Object.keys(saved.panels || {}).length) {
    applyDefault(preset)
    return
  }
  try {
    restoring = true
    api.value.fromJSON(saved)
    // 场景是 Project 的固定工作页；旧布局关闭过它也在原工作区补回。
    if (!api.value.getPanel('scene-workspace')) addPanel('scene-workspace')
    // 旧默认布局将对话固定在中央；升级时移到右侧，保留其他用户页面和分屏。
    const oldConversation = api.value.getPanel('conversation')
    if (preset !== 'focus' && oldConversation && !oldConversation.params?.tabMode) {
      addPanel('scene-workspace')
      api.value.removePanel(oldConversation)
      layout.updateShell(
        { secondaryVisible: true, primaryView: 'explorer', secondaryWidth: 420 },
        { persist: false }
      )
    }
    layout.markReady()
  } catch {
    layout.reset(props.projectId, preset)
    applyDefault(preset)
  } finally {
    restoring = false
  }
  saveNow()
}

function saveNow() {
  if (!api.value || restoring) return
  layout.save(persistentEditorLayout(api.value.toJSON()))
}

function scheduleSave() {
  if (restoring) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 120)
}

function onReady(event) {
  api.value = event.api
  layoutListener = event.api.onDidLayoutChange(scheduleSave)
  // 双击 Tab 保留页面也会改变持久化结果，但不一定改变 Dock 的几何布局。
  // 单独订阅参数变化，确保立即刷新时仍能恢复刚保留的页面。
  addedListener = event.api.onDidAddPanel((panel) => {
    parameterListeners.set(panel.id, panel.api.onDidParametersChange(saveNow))
  })
  removedListener = event.api.onDidRemovePanel((panel) => {
    parameterListeners.get(panel.id)?.dispose()
    parameterListeners.delete(panel.id)
  })
  activeListener = event.api.onDidActivePanelChange(({ panel }) => {
    const params = panel?.params || {}
    emit(
      'active-panel',
      panel
        ? {
            id: panel.id,
            type: params.panelType || String(panel.id).split(':')[0],
            resourceType: params.resourceType || params.panelType || '',
            resourceId: params.resourceId || '',
            title: panel.title || '',
            inspectorResourceType: params.inspectorResourceType || '',
            inspectorResourceId: params.inspectorResourceId || '',
            inspectorTitle: params.inspectorTitle || ''
          }
        : null
    )
  })
  // Dockview ready 可能早于浏览器完成 flex 布局。若在默认的 100×100
  // 尺寸内先建多组面板，面板坐标会被挤到工作区之外。下一帧取得宿主的
  // 实际尺寸并强制布局后再恢复面板，确保所有按钮都可见、可操作。
  readyFrame = requestAnimationFrame(() => {
    if (api.value !== event.api || !host.value) return
    event.api.layout(host.value.clientWidth, host.value.clientHeight, true)
    restorePreset(props.initialPreset)
    event.api.layout(host.value.clientWidth, host.value.clientHeight, true)
    emit('layout-ready')
  })
  resizeObserver = new ResizeObserver(() => {
    if (!api.value || !host.value) return
    api.value.layout(host.value.clientWidth, host.value.clientHeight, true)
  })
  resizeObserver.observe(host.value)
}

async function switchPreset(preset) {
  if (!api.value || preset === layout.preset) return false
  const ids = api.value.panels.map((panel) => panel.id)
  if (!(await requestClosePanels(ids, { reason: 'preset-switch', remove: false }))) return false
  saveNow()
  restorePreset(preset)
  return true
}

async function resetCurrentPreset() {
  if (!api.value) return false
  const ids = api.value.panels.map((panel) => panel.id)
  if (!(await requestClosePanels(ids, { reason: 'layout-reset', remove: false }))) return false
  layout.reset(props.projectId, layout.preset)
  applyDefault(layout.preset)
  return true
}

function floatActivePanel() {
  const panel = api.value?.activePanel
  if (panel) api.value.addFloatingGroup(panel)
}

function hasDirtyPanels() {
  return Boolean(api.value?.panels?.some((panel) => panelIsDirty(panel.id)))
}

function prepareCloseAll(reason = 'project-exit') {
  const ids = api.value?.panels?.map((panel) => panel.id) || []
  return requestClosePanels(ids, { reason, remove: false })
}

function handleKeyboardClose(event) {
  const modifier = event.ctrlKey || event.metaKey
  if (modifier && event.key === 'F4') {
    event.preventDefault()
    const panelId = api.value?.activePanel?.id
    if (panelId) void requestClosePanels([panelId], { reason: 'shortcut' })
    return
  }
  if (modifier && event.key.toLowerCase() === 'k') {
    closeChordAt = Date.now()
    return
  }
  if (!modifier || Date.now() - closeChordAt > 1500) return
  closeChordAt = 0
  if (event.key.toLowerCase() === 'u') {
    event.preventDefault()
    const groupPanels = panelsInGroup(api.value?.activeGroup)
    void requestClosePanels(
      closeableTabs(groupPanels)
        .filter((panel) => !panelIsDirty(panel.id))
        .map((panel) => panel.id),
      { reason: 'shortcut' }
    )
  }
  if (event.key.toLowerCase() === 'w') {
    event.preventDefault()
    void requestClosePanels(
      closeableTabs(api.value?.panels || []).map((panel) => panel.id),
      {
        reason: 'shortcut'
      }
    )
  }
}

onMounted(() => window.addEventListener('keydown', handleKeyboardClose))

onBeforeUnmount(() => {
  cancelAnimationFrame(readyFrame)
  clearTimeout(saveTimer)
  saveNow()
  layoutListener?.dispose()
  activeListener?.dispose()
  addedListener?.dispose()
  removedListener?.dispose()
  for (const listener of parameterListeners.values()) listener.dispose()
  parameterListeners.clear()
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeyboardClose)
  clearPanelCloseRequester(requestClosePanels)
})

setPanelCloseRequester(requestClosePanels)

defineExpose({
  openPanel: addPanel,
  closePanel: (panelId) => requestClosePanels([panelId]),
  switchPreset,
  resetCurrentPreset,
  floatActivePanel,
  hasDirtyPanels,
  prepareCloseAll
})
</script>

<style scoped>
.studio-dock {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  overflow: hidden;
  background: var(--sf-bg-primary);
  box-shadow: var(--sf-shadow-sm);
}

.studio-dock.dockview-theme-light {
  --dv-activegroup-visiblepanel-tab-color: var(--sf-text-primary);
  --dv-activegroup-hiddenpanel-tab-color: var(--sf-text-secondary);
  --dv-inactivegroup-visiblepanel-tab-color: var(--sf-text-secondary);
  --dv-inactivegroup-hiddenpanel-tab-color: var(--sf-text-disabled);
}

.studio-dock.dockview-theme-dark {
  --dv-activegroup-visiblepanel-tab-color: var(--sf-text-primary);
  --dv-activegroup-hiddenpanel-tab-color: var(--sf-text-secondary);
  --dv-inactivegroup-visiblepanel-tab-color: var(--sf-text-secondary);
  --dv-inactivegroup-hiddenpanel-tab-color: var(--sf-text-disabled);
}

.dockview-root {
  width: 100%;
  height: 100%;
}

/* Dockview 的“溢出选项卡”弹层渲染在与 .dv-dockview 同级的
 * .dv-popover-anchor（shell 内）里，二者必须同时挂上主题变量，
 * 否则弹层只会继承 dockview 内置深色主题变量，导致亮色下仍发暗。 */
.studio-dock :deep(.dv-dockview),
.studio-dock :deep(.dv-popover-anchor) {
  --dv-activegroup-visiblepanel-tab-background-color: var(--sf-bg-secondary);
  --dv-activegroup-hiddenpanel-tab-background-color: var(--sf-bg-tertiary);
  --dv-inactivegroup-visiblepanel-tab-background-color: var(--sf-bg-tertiary);
  --dv-inactivegroup-hiddenpanel-tab-background-color: var(--sf-bg-tertiary);
  --dv-tab-divider-color: var(--sf-border-light);
  --dv-paneview-header-border-color: var(--sf-border-light);
  --dv-group-view-background-color: var(--sf-bg-primary);
  --dv-tabs-and-actions-container-background-color: var(--sf-bg-tertiary);
  --dv-activegroup-visiblepanel-tab-color: var(--sf-text-primary);
  --dv-activegroup-hiddenpanel-tab-color: var(--sf-text-secondary);
  --dv-inactivegroup-visiblepanel-tab-color: var(--sf-text-secondary);
  --dv-inactivegroup-hiddenpanel-tab-color: var(--sf-text-disabled);
  --dv-separator-border: var(--sf-border);
  --dv-drag-over-background-color: color-mix(in srgb, var(--sf-brand) 18%, transparent);
  font-family: inherit;
}

.studio-dock :deep(.dv-tabs-and-actions-container) {
  position: relative;
  z-index: 10;
  min-height: 40px;
}

.studio-dock :deep(.dv-tab) {
  min-width: 92px;
  font-size: 12px;
}

/* Dockview 内部根节点自带默认深色主题变量。浅色模式下在组件宿主范围内
 * 显式覆盖四种 Tab 状态，避免未选中 Tab 继承白色文字。 */
.studio-dock.dockview-theme-light :deep(.dv-groupview.dv-active-group .dv-tab.dv-inactive-tab),
.studio-dock.dockview-theme-light :deep(.dv-groupview.dv-inactive-group .dv-tab.dv-active-tab) {
  color: var(--sf-text-secondary) !important;
}

.studio-dock.dockview-theme-light :deep(.dv-groupview.dv-inactive-group .dv-tab.dv-inactive-tab) {
  color: var(--sf-text-disabled) !important;
}

.studio-dock.dockview-theme-light :deep(.dv-groupview.dv-active-group .dv-tab.dv-active-tab) {
  color: var(--sf-text-primary) !important;
}
</style>
