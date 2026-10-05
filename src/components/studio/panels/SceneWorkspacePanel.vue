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
  <section class="scene-workspace" data-testid="scene-workspace">
    <header class="scene-toolbar">
      <button
        type="button"
        class="project-scene-picker"
        aria-label="选择项目场景"
        @click="scenePickerOpen = true"
      >
        <span class="picker-image"
          ><ScenePreviewImage
            v-if="selectedCatalog?.preview"
            :src="selectedCatalog.preview"
            :alt="selectedCatalog.name"
            :zoom-enabled="false"
        /></span>
        <span class="picker-copy"
          ><b :title="selectedCatalog?.name">{{ selectedCatalog?.name || '选择场景' }}</b
          ><small
            >{{ selectedCatalog?.scene_id || '项目场景' }} ·
            {{ store.projectScenes.length }} 个场景</small
          ></span
        >
        <span class="picker-action">切换⌄</span>
      </button>
      <el-button size="small" :type="view === 'setup' ? 'primary' : ''" @click="view = 'setup'">
        场景配置
      </el-button>
      <el-button
        size="small"
        :disabled="!liveAvailable"
        :type="view === 'live' ? 'primary' : ''"
        @click="view = 'live'"
      >
        现场
      </el-button>
      <el-button size="small" :type="view === 'map' ? 'primary' : ''" @click="view = 'map'">
        地图
      </el-button>
      <el-button
        size="small"
        :disabled="!store.sensors.length"
        :type="view === 'sensors' ? 'primary' : ''"
        @click="view = 'sensors'"
      >
        传感器
      </el-button>
      <div class="spacer" />
      <el-button size="small" @click="ui.openSettings('simulation')">运行环境</el-button>
    </header>
    <el-dialog
      v-model="scenePickerOpen"
      title="选择项目场景"
      width="min(1040px, 94vw)"
      append-to-body
    >
      <SceneBrowser
        :scenes="projectSceneChoices"
        :model-value="selectedSceneId"
        @select="chooseProjectScene"
      />
      <p class="picker-note">选择后查看场景配置；当前运行现场保持不变。</p>
    </el-dialog>
    <div v-if="view !== 'setup' && store.instance" class="running-scene" role="status">
      <b>当前现场</b>
      <span :title="runningSceneName">{{ runningSceneName }}</span>
      <code>{{ store.instance.scene_key }} · {{ store.instance.layout }}</code>
    </div>
    <div v-if="store.loading && !liveAvailable" class="scene-preparation-state" role="status">
      正在读取场景与运行环境…
    </div>
    <div
      v-else-if="store.error && !store.projectScenes.length"
      class="scene-preparation-state"
      role="alert"
    >
      <b>场景准备信息加载失败</b>
      <span>{{ store.error }}</span>
      <el-button size="small" @click="reloadPreparation">重试</el-button>
    </div>
    <div v-else-if="view === 'setup'" class="scene-setup">
      <div v-if="store.instance?.state === 'starting'" class="scene-notice" role="status">
        正在加载场景与 Robot…
      </div>
      <div v-else-if="store.runtimeInterrupted || store.error" class="scene-notice" role="status">
        <span>{{ store.recoveryDiagnostic || store.error }}</span>
        <el-button size="small" @click="reloadPreparation">重新连接</el-button>
      </div>
      <SceneDetailsPanel
        v-if="selectedSceneId"
        :key="selectedSceneId"
        :panel-params="{ resourceId: selectedSceneId }"
      />
      <ProjectSimulationSceneResources v-else />
    </div>
    <PhysicsViewerPanel v-else-if="view === 'live'" />
    <MapPanel v-else-if="view === 'map'" />
    <SensorViewerPanel v-else-if="view === 'sensors'" />
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import {
  hasLiveScene,
  sceneWorkspaceView,
  runningProjectScene,
  sceneSelectionAfterRefresh
} from '@/studio/sceneWorkspace'
import { useSimulationStore } from '@/stores/simulation'
import { useUiStore } from '@/stores/ui'
import ProjectSimulationSceneResources from '@/components/studio/ProjectSimulationSceneResources.vue'
import SceneDetailsPanel from './SceneDetailsPanel.vue'
import SceneBrowser from '@/components/simulation/SceneBrowser.vue'
import ScenePreviewImage from '@/components/simulation/ScenePreviewImage.vue'

const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const store = useSimulationStore()
const ui = useUiStore()
const setupSceneId = ref('')
const scenePickerOpen = ref(false)
const projectSceneChoices = computed(() =>
  store.projectScenes.map((item) => ({
    ...store.catalogById(item.catalog_scene_id),
    scene_id: item.project_scene_id,
    display_id: item.catalog_scene_id
  }))
)
const selectedCatalog = computed(() =>
  store.catalogById(
    store.projectScenes.find((item) => item.project_scene_id === selectedSceneId.value)
      ?.catalog_scene_id
  )
)
function chooseProjectScene(scene) {
  selectedSceneId.value = scene.scene_id
  view.value = 'setup'
  scenePickerOpen.value = false
}
const liveAvailable = computed(() => hasLiveScene(store))
const view = ref(sceneWorkspaceView('', store))
const runningScene = computed(() => runningProjectScene(store))
const runningSceneName = computed(
  () => store.catalogById(runningScene.value?.catalog_scene_id)?.name || store.instance?.scene_key
)
// 下拉选择其他场景进入配置；返回现场时显示真正运行的场景，不暗中切换物理世界。
const selectedSceneId = computed({
  get: () =>
    view.value !== 'setup' && store.instance
      ? runningScene.value?.project_scene_id || ''
      : setupSceneId.value,
  set: (value) => {
    setupSceneId.value = value
  }
})
const PhysicsViewerPanel = defineAsyncComponent(() => import('./PhysicsViewerPanel.vue'))
const MapPanel = defineAsyncComponent(() => import('./MapPanel.vue'))
const SensorViewerPanel = defineAsyncComponent(() => import('./SensorViewerPanel.vue'))
async function reloadPreparation() {
  try {
    await store.hydrate(store.projectId)
  } catch {
    /* 具体错误由 Store 原位展示。 */
  }
}

watch(
  () => props.panelParams.resourceId,
  (requested) => {
    if (requested && store.projectScenes.some((item) => item.project_scene_id === requested)) {
      selectedSceneId.value = requested
    }
  },
  { immediate: true }
)
watch(
  () => store.projectScenes,
  () => {
    selectedSceneId.value = sceneSelectionAfterRefresh(
      selectedSceneId.value,
      props.panelParams.resourceId,
      store
    )
  },
  { immediate: true }
)
// 切换运行实例后使用快照中的场景标识，避免旧选择与现场、初态不一致。
watch(
  () => store.catalogSceneId,
  (catalogSceneId) => {
    const active = store.projectScenes.find((item) => item.catalog_scene_id === catalogSceneId)
    if (active) selectedSceneId.value = active.project_scene_id
  }
)
watch(
  () => props.panelParams,
  ({ viewMode: mode }) => {
    if (mode) view.value = sceneWorkspaceView(mode, store)
  },
  { immediate: true }
)
// 同一个现场窗口跟随实例生命周期；新一轮启动不会创建新的 Editor。
watch([() => store.instance?.instance_id, () => liveAvailable.value], ([, available], previous) => {
  if (available && !previous?.[1]) view.value = 'live'
  else if (!available && view.value !== 'map') view.value = 'setup'
})
</script>

<style scoped>
.scene-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.scene-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--sf-border-light);
}
.project-scene-picker {
  display: flex;
  align-items: center;
  gap: 9px;
  width: min(460px, 100%);
  padding: 5px 9px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  text-align: left;
  cursor: pointer;
}
.picker-image {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  overflow: hidden;
  border-radius: 5px;
  background: var(--sf-bg-tertiary);
}
.picker-image :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.picker-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.picker-copy b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.picker-copy small,
.picker-note {
  font-size: 11px;
  color: var(--sf-text-secondary);
}
.picker-action {
  font-size: 12px;
  color: var(--sf-brand);
}
.scene-toolbar .el-button + .el-button {
  margin-left: 0;
}
.spacer {
  flex: 1;
}
.scene-setup {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.scene-preparation-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  color: var(--sf-text-secondary);
}
.scene-setup > .simulation-resources {
  padding: 16px;
}
.scene-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 16px 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
  font-size: 13px;
}
.running-scene {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--sf-text-secondary);
  border-bottom: 1px solid var(--sf-border-light);
}
.running-scene span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.running-scene code {
  flex-shrink: 0;
}
.scene-workspace > :not(.scene-toolbar):not(.running-scene) {
  flex: 1;
  min-height: 0;
}
</style>
