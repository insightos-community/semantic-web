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
  <section class="simulation-resources" data-testid="project-simulation-scenes">
    <div class="section-heading">
      <h3>项目场景</h3>
      <el-tooltip content="从全局目录添加兼容场景" effect="dark" :show-after="500" placement="top">
        <button type="button" data-testid="open-scene-catalog" @click="openCatalog">
          <Plus />
          添加
        </button>
      </el-tooltip>
    </div>

    <div class="scene-service-state">
      <span>仿真 Runtime <DeviceStatus :status="store.runtime?.state || 'offline'" /></span>
      <span>场景实例 <DeviceStatus :status="store.instance?.state || 'stopped'" /></span>
    </div>
    <div class="profile-card">
      <span class="profile-label">默认运行环境类型</span>
      <template v-if="store.hasRuntimeProfile && !editingProfile">
        <b>{{ profileName }}</b>
        <button type="button" class="profile-edit" @click="editProfile">更改</button>
      </template>
      <template v-else>
        <el-select v-model="profileId" size="small" placeholder="选择默认 Profile" clearable>
          <el-option
            v-for="item in store.runtimeProfiles"
            :key="item.runtime_profile_id"
            :label="`${item.name || item.runtime_profile_id} · ${item.engine}/${item.loader}`"
            :value="item.runtime_profile_id"
          />
        </el-select>
        <div class="profile-actions">
          <el-button size="small" :disabled="!profileId" @click="saveProfile"> 保存 </el-button>
          <el-button
            v-if="store.hasRuntimeProfile"
            size="small"
            text
            @click="editingProfile = false"
          >
            取消
          </el-button>
        </div>
      </template>
    </div>

    <div
      v-for="reference in store.projectScenes"
      :key="reference.project_scene_id"
      class="resource-row"
      role="button"
      tabindex="0"
      @click="openScene(reference)"
      @keydown.enter="openScene(reference)"
    >
      <ResourceThumbnail
        :src="sceneFor(reference)?.preview"
        :alt="(sceneFor(reference)?.name || reference.catalog_scene_id) + ' 场景预览'"
      />
      <span>
        <b :title="sceneFor(reference)?.name">{{
          sceneFor(reference)?.name || reference.catalog_scene_id
        }}</b>
        <small>
          {{ reference.catalog_scene_id }} ·
          {{ variantName(reference) }}
        </small>
      </span>
      <ArrowRight />
      <el-button
        v-if="project.currentProject?.mode === 'development'"
        size="small"
        text
        @click.stop="removeScene(reference)"
        >移除</el-button
      >
    </div>
    <div v-if="!store.projectScenes.length" class="empty-scene-state">
      <p class="empty-note">尚未添加场景</p>
      <el-button
        type="primary"
        plain
        size="small"
        data-testid="browse-compatible-scenes"
        @click="openCatalog"
      >
        浏览场景（{{ compatibleCatalog.length }}）
      </el-button>
    </div>

    <details class="layout-authoring">
      <summary>自定义 Layout · {{ documentScenes.length }}</summary>

      <article v-for="scene in documentScenes" :key="scene.sceneId" class="scene-group">
        <header>
          <button type="button" class="scene-title" @click="openDocument(scene.primary)">
            <b>{{ scene.name }}</b>
            <small>{{ scene.layouts.length }} 个 Layout · {{ scene.statusLabel }}</small>
          </button>
          <div class="scene-actions">
            <el-tooltip
              content="复制当前 Project Layout"
              effect="dark"
              :show-after="500"
              placement="top"
            >
              <button type="button" @click="createLayout(scene)">复制 Layout</button>
            </el-tooltip>
            <el-tooltip
              content="导出全部已发布 Layout"
              effect="dark"
              :show-after="500"
              placement="top"
            >
              <span class="tooltip-reference">
                <button type="button" :disabled="!scene.hasPublished" @click="exportPackage(scene)">
                  导出
                </button>
              </span>
            </el-tooltip>
          </div>
        </header>
        <div v-for="layoutItem in scene.layouts" :key="layoutItem.layoutId" class="layout-row">
          <button type="button" class="layout-main" @click="openDocument(layoutItem.document)">
            <ResourceThumbnail
              :src="layoutItem.document.preview"
              :alt="(layoutItem.document.layout_name || 'Layout') + ' 预览'"
              :fallback-icon="EditPen"
            />
            <span>
              <b>{{ layoutItem.document.layout_name || 'Default' }}</b>
              <small>
                {{
                  layoutItem.document.status === 'published'
                    ? `已发布 v${layoutItem.document.version}`
                    : `草稿 r${layoutItem.document.revision}`
                }}
                <template v-if="layoutItem.historyCount > 1">
                  · {{ layoutItem.historyCount }} 个历史版本
                </template>
              </small>
            </span>
          </button>
          <div v-if="layoutItem.document.status !== 'published'" class="layout-actions">
            <button type="button" @click="renameLayout(layoutItem.document)">重命名</button>
            <button
              type="button"
              :disabled="scene.layouts.length < 2"
              @click="deleteLayout(layoutItem.document)"
            >
              删除
            </button>
          </div>
        </div>
      </article>
      <p v-if="!documentScenes.length" class="empty-note">尚无自定义 Layout</p>
    </details>

    <el-dialog v-model="catalogOpen" title="添加兼容场景" width="min(1040px, 94vw)" append-to-body>
      <el-alert
        v-if="!compatibleCatalog.length"
        title="当前 Project Runtime 没有兼容的目录场景"
        type="info"
        :closable="false"
      />
      <SceneBrowser
        :scenes="compatibleCatalog"
        :model-value="selectedSceneId"
        @select="selectCatalogScene"
      />
      <p v-if="selectedScene" class="catalog-selection">
        <b>当前选择：</b>{{ selectedScene.name }}
      </p>
      <el-form v-if="selectedScene" label-position="top" class="catalog-form">
        <el-form-item label="发布版本">
          <el-select v-model="selectedVersion">
            <el-option
              v-for="version in selectedScene.versions"
              :key="version.version"
              :label="version.version"
              :value="version.version"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="默认 Layout / Init State">
          <el-select v-model="selectedVariant">
            <el-option
              v-for="variant in selectedVersionRecord?.variants || []"
              :key="variant.variant_id"
              :label="variant.name"
              :value="variant.variant_id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catalogOpen = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedScene || !selectedVariant" @click="addScene">
          添加到 Project
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import SceneBrowser from '@/components/simulation/SceneBrowser.vue'
import { computed, ref } from 'vue'
import { ArrowRight, EditPen, Plus } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import ResourceThumbnail from '@/components/studio/ResourceThumbnail.vue'
import { useLayoutStore } from '@/stores/layout'
import { useSimulationStore } from '@/stores/simulation'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { openStudioPanel } from '@/studio/panelService'
import { removeProjectScene } from '@/api/simulation'

const store = useSimulationStore()
const layout = useLayoutStore()
const ui = useUiStore()
const project = useProjectStore()
const profileId = ref('')
const editingProfile = ref(false)
const catalogOpen = ref(false)
const selectedSceneId = ref('')
const selectedVersion = ref('')
const selectedVariant = ref('')

const boundProfileId = computed(
  () =>
    store.runtimePreference.runtime_profile_id ||
    store.runtime?.runtime_profile_id ||
    store.selectedRuntimeProfileId ||
    ''
)
const profileName = computed(() => {
  const profile = store.runtimeProfiles.find(
    (item) => item.runtime_profile_id === boundProfileId.value
  )
  return profile?.name || boundProfileId.value
})
const compatibleCatalog = computed(() => {
  if (!boundProfileId.value) return store.sceneCatalog
  return store.sceneCatalog.filter(
    (scene) => scene.compatible_runtime_profile === boundProfileId.value
  )
})
const selectedScene = computed(() =>
  compatibleCatalog.value.find((scene) => scene.scene_id === selectedSceneId.value)
)
const selectedVersionRecord = computed(() =>
  selectedScene.value?.versions?.find((version) => version.version === selectedVersion.value)
)

const documentScenes = computed(() => {
  const scenes = new Map()
  for (const document of store.documents) {
    const sceneId = document.scene_id || `scene-${document.id}`
    if (!scenes.has(sceneId)) {
      scenes.set(sceneId, {
        sceneId,
        name: document.name,
        documents: [],
        layoutsById: new Map()
      })
    }
    const scene = scenes.get(sceneId)
    scene.documents.push(document)
    const layoutId = document.layout_id || 'layout-default'
    if (!scene.layoutsById.has(layoutId)) scene.layoutsById.set(layoutId, [])
    scene.layoutsById.get(layoutId).push(document)
  }
  return [...scenes.values()]
    .map((scene) => {
      const layouts = [...scene.layoutsById.entries()].map(([layoutId, records]) => {
        records.sort(compareDocuments)
        return { layoutId, document: records[0], historyCount: records.length }
      })
      layouts.sort((left, right) =>
        String(left.document.layout_name || '').localeCompare(
          String(right.document.layout_name || ''),
          'zh-CN'
        )
      )
      const primary =
        layouts.find((item) => item.document.status === 'draft')?.document || layouts[0]?.document
      const hasPublished = scene.documents.some((document) => document.status === 'published')
      return {
        ...scene,
        layouts,
        primary,
        hasPublished,
        statusLabel: hasPublished ? '含已发布版本' : '仅草稿'
      }
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name), 'zh-CN'))
})

function compareDocuments(left, right) {
  if (left.status !== right.status) return left.status === 'draft' ? -1 : 1
  if (Number(left.version || 0) !== Number(right.version || 0)) {
    return Number(right.version || 0) - Number(left.version || 0)
  }
  return String(right.updated_at || '').localeCompare(String(left.updated_at || ''))
}

const sceneFor = (reference) => store.catalogById(reference.catalog_scene_id)

function variantName(reference) {
  const scene = sceneFor(reference)
  const version = scene?.versions?.find((item) => item.version === reference.scene_version)
  return (
    version?.variants?.find((item) => item.variant_id === reference.default_variant_id)?.name ||
    reference.default_variant_id
  )
}

function selectCatalogScene(scene) {
  selectedSceneId.value = scene.scene_id
  selectedVersion.value = scene.versions?.[0]?.version || ''
  selectedVariant.value = scene.versions?.[0]?.variants?.[0]?.variant_id || ''
}

async function openCatalog() {
  try {
    await store.refreshSceneResources()
  } catch (error) {
    // 离线目录若刷新失败，仍保留 hydrate 时最后一次成功结果供浏览。
    ui.notify({
      type: 'warning',
      message: error.message || '场景目录刷新失败，正在显示上次加载结果'
    })
  }
  catalogOpen.value = true
}

function editProfile() {
  profileId.value = boundProfileId.value
  editingProfile.value = true
}

async function saveProfile() {
  try {
    await store.setRuntimePreference(profileId.value)
    editingProfile.value = false
    ui.notify({ type: 'success', message: '默认 Runtime Profile 已保存' })
    await store.refreshSceneResources()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Runtime Profile 保存失败' })
  }
}

async function addScene() {
  try {
    const reference = await store.addCatalogScene(
      selectedScene.value,
      selectedVersion.value,
      selectedVariant.value
    )
    catalogOpen.value = false
    openScene(reference)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '添加场景失败' })
  }
}

async function removeScene(reference) {
  try {
    await ElMessageBox.confirm('移除此项目的场景引用？已安装场景包和历史记录会保留。', '移除场景', {
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await removeProjectScene(store.projectId, reference.project_scene_id)
    await store.hydrate(store.projectId)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '移除场景失败' })
  }
}

function openScene(reference) {
  const scene = sceneFor(reference)
  layout.select({
    resourceType: 'project_scene',
    resourceId: reference.project_scene_id,
    title: scene?.name || reference.catalog_scene_id
  })
  openStudioPanel('scene-details', {
    resourceType: 'project_scene',
    resourceId: reference.project_scene_id
  })
}

async function createLayout(scene) {
  try {
    const { value } = await ElMessageBox.prompt('输入新 Layout 名称', '复制 Layout', {
      inputValue: `Layout ${scene.layouts.length + 1}`,
      inputValidator: (text) => Boolean(text?.trim()) || '名称不能为空'
    })
    openDocument(await store.createLayout(scene.primary, value))
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ui.notify({ type: 'error', message: error.message || '创建 Layout 失败' })
  }
}

async function renameLayout(document) {
  try {
    const { value } = await ElMessageBox.prompt('输入 Layout 名称', '重命名 Layout', {
      inputValue: document.layout_name || 'Default',
      inputValidator: (text) => Boolean(text?.trim()) || '名称不能为空'
    })
    await store.renameLayout(document, value)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ui.notify({ type: 'error', message: error.message || '重命名 Layout 失败' })
  }
}

async function deleteLayout(document) {
  try {
    await ElMessageBox.confirm(
      `删除草稿 Layout“${document.layout_name}”？已发布历史不会被删除。`,
      '删除 Layout',
      { type: 'warning', confirmButtonText: '删除' }
    )
    await store.deleteLayout(document)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ui.notify({ type: 'error', message: error.message || '删除 Layout 失败' })
  }
}

async function exportPackage(scene) {
  try {
    const blob = await store.exportScenePackage(scene.sceneId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeFilename(scene.name)}.semantic-scene.zip`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Scene Package 导出失败' })
  }
}

function safeFilename(value) {
  return (
    String(value || 'scene')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '') || 'scene'
  )
}

function openDocument(document) {
  if (!document) return
  layout.select({
    resourceType: 'scene_document',
    resourceId: document.id,
    title: `${document.name} · ${document.layout_name || 'Default'}`
  })
  openStudioPanel('scene-editor', {
    resourceType: 'scene_document',
    resourceId: document.id
  })
}
</script>

<style scoped>
.scene-service-state {
  display: grid;
  gap: 8px;
  padding: 12px 0;
  font-size: 12px;
}
.scene-service-state > span {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.simulation-resources {
  margin-top: 18px;
}
.profile-card {
  position: relative;
  display: grid;
  gap: 7px;
  margin-bottom: 14px;
  padding: 10px;
  border: 1px solid var(--sf-border-subtle);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.profile-card b {
  color: var(--sf-text-primary);
  font-size: 12px;
}
.profile-label {
  color: var(--sf-text-disabled);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.profile-edit {
  position: absolute;
  top: 8px;
  right: 8px;
  border: 0;
  background: transparent;
  color: var(--sf-brand);
  cursor: pointer;
}
.profile-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.empty-scene-state {
  display: grid;
  gap: 8px;
  justify-items: start;
  padding: 4px 7px 12px;
}
.empty-scene-state .empty-note {
  margin: 0;
}
.section-heading,
.resource-row,
.scene-group > header,
.layout-row,
.layout-main {
  display: flex;
  align-items: center;
}
.section-heading,
.scene-group > header {
  justify-content: space-between;
}
.section-heading h3 {
  margin: 0 4px 8px;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.section-hint {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.heading-actions,
.scene-actions,
.layout-actions {
  display: flex;
  gap: 5px;
}
.section-heading button,
.scene-actions button,
.layout-actions button {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--sf-brand);
  font-size: 11px;
  cursor: pointer;
}
button:disabled {
  color: var(--sf-text-disabled);
  cursor: not-allowed;
}
.resource-row,
.layout-main {
  width: 100%;
  min-height: 44px;
  gap: 10px;
  padding: 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  text-align: left;
  cursor: pointer;
}
.resource-row:hover,
.layout-main:hover {
  background: var(--sf-bg-hover);
  color: var(--sf-text-primary);
}
.resource-row > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}
.resource-row > svg:last-child {
  width: 13px;
  height: 13px;
  flex-basis: 13px;
}
.resource-thumbnail {
  width: 52px;
  height: 36px;
  flex: 0 0 52px;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  object-fit: cover;
}
.resource-row > span,
.layout-main > span {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.resource-row small,
.layout-main small,
.binding-card span,
.empty-note,
.scene-title small {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.resource-row b {
  white-space: normal;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.resource-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 16px;
  gap: 8px;
  align-items: start;
}
.resource-row :deep(.resource-thumbnail) {
  width: 52px;
  height: 52px;
}
.resource-row > .el-button {
  grid-column: 2 / 4;
  justify-self: end;
}
.resource-row > span {
  min-width: 0;
}
.resource-row small {
  overflow-wrap: anywhere;
}
.authoring-heading {
  margin-top: 14px;
}
.binding-card {
  display: flex;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  flex-direction: column;
}
.scene-group {
  margin: 6px 0;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  overflow: hidden;
}
.scene-group > header {
  padding: 7px;
  background: var(--sf-bg-tertiary);
}
.scene-title {
  display: flex;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--sf-text-primary);
  text-align: left;
  cursor: pointer;
  flex-direction: column;
}
.layout-row {
  border-top: 1px solid var(--sf-border-light);
}
.layout-actions {
  padding-right: 6px;
}
.catalog-selection {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: break-word;
}
.catalog-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}
</style>
