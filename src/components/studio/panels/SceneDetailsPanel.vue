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
  <section class="scene-details-panel">
    <header>
      <div>
        <span>{{ scene?.engine || 'simulation' }} / {{ scene?.loader || 'unknown' }}</span>
        <h2>{{ scene?.name || reference?.catalog_scene_id || '场景详情' }}</h2>
      </div>
      <div class="scene-visual">
        <button
          v-if="scene?.preview"
          class="scene-preview-button"
          type="button"
          aria-label="预览场景"
          @click="
            showPreview({
              name: scene.name,
              preview: scene.preview,
              description: scene.description
            })
          "
        >
          <ScenePreviewImage :src="scene.preview" :alt="scene.name" :zoom-enabled="false" />
          <span>预览场景</span>
        </button>
        <el-tag> 场景模板 </el-tag>
      </div>
    </header>

    <details v-if="reference && scene" class="scene-metadata">
      <summary>场景信息</summary>
      <p class="preview-description">{{ scene.description }}</p>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="Project 版本">
          {{ reference.scene_version }}
        </el-descriptions-item>
        <el-descriptions-item label="Runtime">
          {{ scene.compatible_runtime_profile }}
        </el-descriptions-item>
        <el-descriptions-item label="来源">{{ scene.source }}</el-descriptions-item>
        <el-descriptions-item label="Robot">
          {{ version?.robot_models?.join('、') || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="能力">
          {{ version?.capabilities?.join('、') || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="评测">
          {{ version?.evaluation ? version.evaluation.evaluation_kind : '此版本不提供评测' }}
        </el-descriptions-item>
      </el-descriptions>
    </details>

    <section v-if="reference && !isActiveTarget" class="runtime-selection">
      <div>
        <h3>运行环境</h3>
      </div>
      <el-alert v-if="store.loading" title="正在读取运行环境…" type="info" :closable="false" />
      <el-alert
        v-else-if="store.error"
        :title="`运行环境读取失败：${store.error}`"
        type="error"
        :closable="false"
      />
      <el-alert
        v-else-if="!availableRuntimeInstallations.length"
        title="尚无可用运行环境"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-button
        v-if="!store.loading && !store.error && !availableRuntimeInstallations.length"
        size="small"
        @click="ui.openSettings('simulation')"
      >
        配置运行环境
      </el-button>
      <el-select
        v-else-if="availableRuntimeInstallations.length"
        v-model="runtimeInstallationId"
        :disabled="Boolean(store.instance) && sameScene"
        placeholder="选择本次启动使用的 Runtime"
      >
        <el-option
          v-for="installation in availableRuntimeInstallations"
          :key="installation.installation_id"
          :value="installation.installation_id"
          :label="`${installation.name || installation.installation_id} · ${installation.status || 'offline'}`"
        />
      </el-select>
      <small v-if="preferredRuntimeInstallation">
        Project 偏好：{{
          preferredRuntimeInstallation.name || preferredRuntimeInstallation.installation_id
        }}
      </small>
    </section>

    <section class="variants">
      <h3>布局与初始状态</h3>
      <div class="preview-actions">
        <el-button :loading="previewBusy" @click="preparePreviews">更新任务信息与预览</el-button>
        <el-button v-if="previewBusy" @click="cancelPreviews">取消预览生成</el-button>
        <small role="status">{{
          previewMessage ||
          scene?.preview_preparation?.message ||
          '点击预览查看大图和详情；选择初态不会改变当前现场。'
        }}</small>
      </div>
      <div class="variant-grid">
        <article
          v-for="variant in version?.variants || []"
          :key="variant.variant_id"
          class="variant-card"
          :class="{ selected: variantId === variant.variant_id }"
        >
          <button
            v-if="variant.preview"
            class="variant-image"
            type="button"
            :aria-label="`预览 ${variant.name}`"
            @click="showPreview(variant)"
          >
            <ScenePreviewImage :src="variant.preview" :alt="variant.name" :zoom-enabled="false" />
            <span>预览</span>
          </button>
          <div v-else class="variant-image preview-placeholder">暂无预览</div>
          <button
            class="variant-copy"
            type="button"
            :aria-pressed="variantId === variant.variant_id"
            @click="variantId = variant.variant_id"
          >
            <b>{{ variant.name }}</b>
            <small>{{
              variant.variant_id === 'init-0'
                ? '默认初态'
                : variant.kind === 'init_state'
                  ? '初始布局'
                  : '场景布局'
            }}</small>
            <span class="selection-label">{{
              variantId === variant.variant_id ? '已选择' : '选择'
            }}</span>
          </button>
        </article>
      </div>
    </section>

    <el-dialog
      v-model="previewOpen"
      :title="previewDetails?.name || '场景预览'"
      append-to-body
      width="min(760px, 92vw)"
      @closed="previewDetails = null"
    >
      <template v-if="previewDetails">
        <div class="detail-preview">
          <ScenePreviewImage
            :src="previewDetails.preview"
            :alt="previewDetails.name"
            :zoom-enabled="false"
          />
        </div>
        <h4>任务</h4>
        <p>{{ scene?.name }}</p>
        <h4>详细信息</h4>
        <p class="preview-description">
          {{ previewDetails.description || '上游未提供更多说明。' }}
        </p>
        <el-button v-if="previewDetails.variant_id" type="primary" @click="selectPreview"
          >选择此初态</el-button
        >
      </template>
    </el-dialog>

    <details class="layout-options">
      <summary>Layout 设置</summary>
      <div class="layout-option-actions">
        <el-button
          v-if="canAuthorLayout"
          :loading="creatingLayout"
          @click="deriveLayout('copy_variant')"
        >
          复制 Layout
        </el-button>
        <el-button
          v-if="canAuthorLayout"
          :loading="creatingLayout"
          @click="deriveLayout('empty_layout')"
        >
          创建空白 Layout
        </el-button>
        <label
          >随机种子 <el-input-number v-model="seed" :min="0" controls-position="right"
        /></label>
      </div>
    </details>
    <footer>
      <el-button
        v-if="!isActiveTarget"
        type="primary"
        :disabled="!reference || !variantId || !runtimeSelectionReady || store.sceneTransitioning"
        :loading="starting"
        @click="start"
      >
        {{ startActionLabel }}
      </el-button>
      <template v-else>
        <el-button type="primary" @click="openViewer">查看现场</el-button>
        <el-button v-if="version?.evaluation" @click="openEvaluation">查看评测</el-button>
      </template>
    </footer>
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import request from '@/api/request'
import ScenePreviewImage from '@/components/simulation/ScenePreviewImage.vue'
import { ElMessageBox } from 'element-plus'
import { useSimulationStore } from '@/stores/simulation'
import { useLayoutStore } from '@/stores/layout'
import { useUiStore } from '@/stores/ui'
import { openStudioPanel } from '@/studio/panelService'

const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const store = useSimulationStore()
const layout = useLayoutStore()
const ui = useUiStore()
const variantId = ref('')
const runtimeInstallationId = ref('')
const seed = ref(0)
const starting = ref(false)
const creatingLayout = ref(false)
const previewBusy = ref(false)
const previewMessage = ref('')
const previewDetails = ref(null)
const previewOpen = ref(false)
function showPreview(details) {
  previewDetails.value = details
  previewOpen.value = true
}
function selectPreview() {
  variantId.value = previewDetails.value.variant_id
  previewOpen.value = false
}
let previewTimer
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(previewTimer)
})
async function preparePreviews() {
  if (!scene.value) return
  previewBusy.value = true
  previewMessage.value = '已提交预览准备，当前现场保持运行'
  try {
    await request.post(
      `/projects/${store.projectId}/scene-previews/${encodeURIComponent(scene.value.scene_id)}`
    )
    if (!disposed) previewTimer = setTimeout(pollPreviews, 1500)
  } catch (error) {
    previewMessage.value = error.message
    previewBusy.value = false
  }
}
async function pollPreviews() {
  try {
    await store.refreshSceneResources()
    const status = scene.value?.preview_preparation
    if (status) previewMessage.value = status.message
    if (status && ['ready', 'failed', 'cancelled', 'unavailable'].includes(status.state)) {
      previewBusy.value = false
      return
    }
    if (!disposed) previewTimer = setTimeout(pollPreviews, 1500)
  } catch (error) {
    previewMessage.value = error.message
    previewBusy.value = false
  }
}
async function cancelPreviews() {
  await request.post(
    `/projects/${store.projectId}/scene-previews/${encodeURIComponent(scene.value.scene_id)}/cancel`
  )
}
const reference = computed(() =>
  store.projectScenes.find((item) => item.project_scene_id === props.panelParams.resourceId)
)
const scene = computed(() =>
  reference.value ? store.catalogById(reference.value.catalog_scene_id) : null
)
const version = computed(() =>
  scene.value?.versions?.find((item) => item.version === reference.value?.scene_version)
)
const canAuthorLayout = computed(() => version.value?.authoring?.mode === 'layout_only')
const availableRuntimeInstallations = computed(() =>
  store.compatibleRuntimeInstallations.filter(
    (item) => item.profile_id === scene.value?.compatible_runtime_profile && item.enabled !== false
  )
)
const preferredRuntimeInstallation = computed(() =>
  availableRuntimeInstallations.value.find(
    (item) => item.installation_id === store.runtimePreference.preferred_runtime_installation_id
  )
)
const activeCatalogSceneId = computed(
  () => store.catalogSceneId || store.instance?.catalog_scene_id || ''
)
const sameScene = computed(() =>
  Boolean(
    store.instance &&
    !store.runtimeInterrupted &&
    !['stopped', 'failed'].includes(store.instance.state) &&
    reference.value &&
    activeCatalogSceneId.value === reference.value.catalog_scene_id
  )
)
const isActiveTarget = computed(
  () =>
    sameScene.value &&
    ['running', 'paused'].includes(store.instance?.state) &&
    store.instance?.layout === variantId.value
)
const runtimeSelectionReady = computed(() => {
  if (sameScene.value && store.instance) return true
  return availableRuntimeInstallations.value.some(
    (item) => item.installation_id === runtimeInstallationId.value
  )
})
const startActionLabel = computed(() => {
  if (store.sceneTransitioning) return '场景正在加载或切换…'
  if (store.runtimeInterrupted) return '清理中断场景并启动'
  if (store.instance?.state === 'failed') return '清理失败场景并启动'
  return sameScene.value
    ? '切换到此 Layout'
    : store.instance
      ? '停止当前场景并启动'
      : '启动此 Layout'
})
watch(
  () => reference.value?.project_scene_id,
  () => {
    // 预览刷新只替换目录数据，不能把用户选中的初态重置为默认初态。
    const value = reference.value
    variantId.value =
      (sameScene.value ? store.instance?.layout : '') ||
      value?.default_variant_id ||
      version.value?.variants?.[0]?.variant_id ||
      ''
  },
  { immediate: true }
)
watch(
  [availableRuntimeInstallations, preferredRuntimeInstallation],
  ([installations, preferred]) => {
    if (installations.some((item) => item.installation_id === runtimeInstallationId.value)) return
    runtimeInstallationId.value =
      preferred?.installation_id ||
      (installations.length === 1 ? installations[0].installation_id : '')
  },
  { immediate: true }
)

async function start() {
  if (starting.value || store.sceneTransitioning) return
  starting.value = true
  try {
    if (store.runtimeInterrupted) {
      await ElMessageBox.confirm(
        '上一次场景已中断。清理后将重启所选 Layout，当前场景中的物体位置将重置。',
        '清理中断场景并启动',
        {
          type: 'warning',
          confirmButtonText: '清理并启动'
        }
      )
      await store.recoverInterruptedRuntime()
      await store.startProjectScene(reference.value, {
        variant_id: variantId.value,
        runtime_installation_id: runtimeInstallationId.value,
        seed: seed.value
      })
    } else if (store.instance) {
      await ElMessageBox.confirm(
        sameScene.value
          ? '切换会 stop/hold 当前 Robot，停止旧实例并创建新的 generation。'
          : '当前有另一场景正在运行。切换会 stop/hold Robot、关闭旧 Viewer/Sensor 并停止旧实例。',
        sameScene.value ? '切换 Layout' : '切换运行场景',
        {
          type: 'warning',
          confirmButtonText: sameScene.value ? '切换' : '停止并启动'
        }
      )
      if (sameScene.value) {
        await store.switchVariant(variantId.value, seed.value)
      } else {
        await store.operate('stop')
        await store.startProjectScene(reference.value, {
          variant_id: variantId.value,
          runtime_installation_id: runtimeInstallationId.value,
          seed: seed.value
        })
      }
    } else {
      await store.startProjectScene(reference.value, {
        variant_id: variantId.value,
        runtime_installation_id: runtimeInstallationId.value,
        seed: seed.value
      })
    }
    // Viewer 流由面板异步创建，不能把场景切换按钮锁在流连接等待中。
    // 这里先打开面板；画面未就绪时面板自行显示连接状态。
    openViewer()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ui.notify({ type: 'error', message: error.message || '场景启动失败' })
  } finally {
    starting.value = false
  }
}

async function deriveLayout(initialization) {
  if (!reference.value || !canAuthorLayout.value) return
  const title = initialization === 'empty_layout' ? '创建空白 Layout' : '复制官方 Layout'
  try {
    const { value } = await ElMessageBox.prompt('输入 Project Layout 名称', title, {
      inputValue:
        initialization === 'empty_layout'
          ? '新布局'
          : `${version.value?.variants?.find((item) => item.variant_id === variantId.value)?.name || 'Layout'} 副本`,
      inputValidator: (text) => Boolean(text?.trim()) || '名称不能为空'
    })
    creatingLayout.value = true
    const document = await store.createProjectLayoutDraft(reference.value, {
      name: value.trim(),
      source_variant_id: variantId.value,
      initialization
    })
    layout.select({
      resourceType: 'scene_document',
      resourceId: document.id,
      title: `${document.name} · ${document.layout_name}`
    })
    openStudioPanel('scene-editor', {
      resourceType: 'scene_document',
      resourceId: document.id
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ui.notify({ type: 'error', message: error.message || '创建 Project Layout 失败' })
  } finally {
    creatingLayout.value = false
  }
}

function openViewer() {
  if (store.instance) {
    layout.select({
      resourceType: 'scene_instance',
      resourceId: store.instance.instance_id,
      title: 'Scene Instance'
    })
    layout.revealInspector()
  }
  openStudioPanel('physics-viewer', {
    resourceId: store.instance?.instance_id,
    inspectorResourceType: 'scene_instance',
    inspectorResourceId: store.instance?.instance_id,
    inspectorTitle: 'Scene Instance'
  })
}

function openEvaluation() {
  openStudioPanel('evaluation-result', { resourceId: store.instance?.instance_id })
}
</script>

<style scoped>
.runtime-selection {
  display: grid;
  grid-template-columns: minmax(220px, 0.7fr) minmax(300px, 1fr);
  align-items: center;
  gap: 18px;
  margin: 20px 0;
  padding: 18px;
  border: 1px solid var(--sf-border-subtle);
  border-radius: 12px;
  background: var(--sf-bg-secondary);
}
.runtime-selection span,
.runtime-selection small {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.runtime-selection h3 {
  margin: 4px 0;
}
.runtime-selection p {
  margin: 0;
  color: var(--sf-text-secondary);
}
.runtime-selection .el-select {
  width: 100%;
}
@media (max-width: 900px) {
  .runtime-selection {
    grid-template-columns: 1fr;
  }
}
.scene-details-panel {
  height: 100%;
  padding: 20px;
  overflow: auto;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
}
.scene-details-panel > header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
}
.scene-visual {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-direction: column;
}
.scene-preview-button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--sf-brand);
  cursor: pointer;
}
.scene-preview-button :deep(img) {
  display: block;
  width: 220px;
  aspect-ratio: 1;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  object-fit: contain;
}
header span,
header p {
  color: var(--sf-text-secondary);
  white-space: pre-line;
}
.preview-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
header h2 {
  margin: 4px 0;
  font-size: 20px;
}
header p {
  font-size: 13px;
  line-height: 1.6;
  max-width: 600px;
}
.scene-metadata > summary,
.layout-options > summary {
  padding: 10px 0;
  color: var(--sf-text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.layout-options {
  margin-top: 18px;
}
.layout-option-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.variants {
  margin-top: 24px;
}
.variant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}
.variant-card {
  display: grid;
  padding: 0;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-primary);
  text-align: left;
  overflow: hidden;
}
.variant-card.selected {
  border-color: var(--sf-brand);
  background: var(--sf-brand-soft);
}
.variant-grid span,
.variant-grid small {
  color: var(--sf-text-secondary);
}
.variant-image {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  display: block;
  padding: 0;
  border: 0;
  cursor: pointer;
  background: var(--sf-bg-tertiary);
}
.variant-image :deep(img) {
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  display: block;
  border-bottom: 1px solid var(--sf-border-light);
  object-fit: contain;
}
.variant-image > span {
  position: absolute;
  bottom: 8px;
  right: 8px;
  padding: 3px 9px;
  border-radius: 4px;
  background: var(--sf-bg-secondary);
  color: var(--sf-brand);
  font-size: 12px;
}
.preview-placeholder {
  display: grid;
  place-items: center;
  color: var(--sf-text-secondary);
  cursor: default;
}
.variant-copy {
  position: relative;
  display: flex;
  gap: 2px;
  padding: 12px;
  flex-direction: column;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.variant-copy .selection-label {
  position: absolute;
  right: 12px;
  top: 12px;
  font-size: 12px;
  color: var(--sf-brand);
}
.detail-preview {
  display: block;
  width: min(100%, 540px);
  aspect-ratio: 1;
  object-fit: contain;
  margin: auto;
}
.detail-preview :deep(img) {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
}
.preview-description {
  white-space: pre-line;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.scene-details-panel > footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
