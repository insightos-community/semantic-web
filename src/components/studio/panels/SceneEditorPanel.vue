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
  <section class="scene-editor-panel">
    <header>
      <div>
        <b>{{ editor?.name || '场景草稿' }}</b>
        <span v-if="editor"
          >{{ editor.status }} · r{{ editor.revision }} · v{{ editor.version }}</span
        >
      </div>
      <div class="actions">
        <el-button
          size="small"
          :disabled="!editor || readonly || !dirty"
          :loading="saving"
          @click="save"
        >
          保存
        </el-button>
        <el-button size="small" :disabled="!editor || readonly" @click="validate">校验</el-button>
        <el-button size="small" :disabled="!editor || readonly" @click="build">构建</el-button>
        <el-button
          v-if="!readonly"
          size="small"
          type="primary"
          :disabled="!editor"
          @click="publish"
        >
          发布不可修改版本
        </el-button>
        <el-button v-else size="small" @click="fork">创建新版本草稿</el-button>
        <el-button size="small" plain @click="exitEditor">退出编辑</el-button>
      </div>
    </header>
    <el-alert
      v-if="store.validation && !store.validation.valid"
      title="场景校验未通过"
      type="error"
      :closable="false"
    >
      <template #default>
        <ul>
          <li v-for="issue in store.validation.issues" :key="issue.code + issue.node_id">
            {{ issue.message }}
          </li>
        </ul>
      </template>
    </el-alert>
    <SceneEditor
      v-if="editor"
      :document="editor"
      :asset-catalog="store.assetCatalog"
      :readonly="readonly"
      :selected-node-id="
        store.editorContext?.document_id === editor.id ? store.editorContext.selected_id : ''
      "
      @change="onEditorChange"
      @select="selectNode"
    />
    <div v-else class="empty">场景草稿不存在或尚未加载。</div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import * as simulationApi from '@/api/simulation'
import SceneEditor from '@/components/simulation/SceneEditor.vue'
import { diffSceneDocuments } from '@/domain/simulation'
import { useLayoutStore } from '@/stores/layout'
import { useSceneEditorSessionStore } from '@/stores/sceneEditorSessions'
import { useSimulationStore } from '@/stores/simulation'
import { useUiStore } from '@/stores/ui'
import { openStudioPanel } from '@/studio/panelService'
import { makePanelId } from '@/studio/panelRegistry'
import {
  notifyPanelGuardChanged,
  registerPanelGuard,
  requestPanelClose
} from '@/studio/panelLifecycle'

const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const store = useSimulationStore()
const layout = useLayoutStore()
const editorSessions = useSceneEditorSessionStore()
const ui = useUiStore()
const editor = ref(null)
const saved = ref(null)
const saving = ref(false)
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)))
const panelId = computed(() => makePanelId('scene-editor', props.panelParams.resourceId || ''))
let unregisterGuard = null
const source = computed(() =>
  store.documents.find((document) => document.id === props.panelParams.resourceId)
)
const readonly = computed(() => editor.value?.status === 'published')
const dirty = computed(() =>
  editorSessions.isDirty(editor.value?.id || props.panelParams.resourceId)
)

watch(
  source,
  (document) => {
    const session = editorSessions.open(document, panelId.value)
    editor.value = clone(session?.document)
    saved.value = clone(session?.saved_document)
    store.setEditorContext(editor.value)
  },
  { immediate: true }
)

function onEditorChange(value) {
  const next = clone(value)
  if (!editor.value) {
    editor.value = next
    editorSessions.update(next?.id, next)
    return
  }
  // 保持同一个响应式对象引用，避免子编辑器把每次拖拽误判成一份新的
  // Server 文档并重建 Three.js 场景、清空选择和 TransformControls。
  Object.assign(editor.value, next)
  store.setEditorContext(editor.value, store.editorContext?.selected_id)
  editorSessions.update(editor.value.id, editor.value)
}

function discard() {
  const session = editorSessions.discard(editor.value?.id)
  editor.value = clone(session?.document || saved.value)
  saved.value = clone(session?.saved_document || saved.value)
  store.setEditorContext(editor.value, session?.selection || '')
  return editor.value
}

function registerGuard() {
  unregisterGuard?.()
  unregisterGuard = registerPanelGuard(panelId.value, {
    isDirty: () => dirty.value,
    save,
    discard
  })
}

watch(panelId, registerGuard, { immediate: true })
watch(dirty, notifyPanelGuardChanged)

async function save() {
  if (!editor.value || readonly.value) return editor.value
  const operations = diffSceneDocuments(saved.value, editor.value)
  if (!operations.length) return editor.value
  saving.value = true
  try {
    const document = await store.applyDocumentOperations(editor.value, operations)
    editor.value = clone(document)
    saved.value = clone(editor.value)
    editorSessions.markSaved(editor.value.id, editor.value)
    return editor.value
  } finally {
    saving.value = false
  }
}

async function validate() {
  await save()
  const result = await store.validateDocument(editor.value.id)
  editorSessions.setValidation(editor.value.id, result)
  return result
}

async function build() {
  const result = await validate()
  if (!result.valid) return null
  editorSessions.setBuildStatus(editor.value.id, 'building')
  try {
    const buildResult = await store.buildDocument(editor.value.id)
    editorSessions.setBuildStatus(editor.value.id, 'succeeded')
    return buildResult
  } catch (error) {
    editorSessions.setBuildStatus(editor.value.id, 'failed')
    ui.notify({ type: 'error', message: error.message || '场景构建失败' })
    return null
  }
}

async function publish() {
  const buildResult = await build()
  if (!buildResult) return
  const document = await store.publishDocument(editor.value)
  editor.value = clone(document)
  saved.value = clone(document)
  editorSessions.markSaved(editor.value.id, editor.value)
}

async function fork() {
  try {
    const { value } = await ElMessageBox.prompt('输入新草稿名称', '创建新版本草稿', {
      inputValue: `${editor.value.name} v${Number(editor.value.version || 0) + 1}`
    })
    const response = await simulationApi.forkSceneDocument(store.projectId, editor.value.id, value)
    store.replaceDocument(response.document)
    openStudioPanel('scene-editor', {
      resourceType: 'scene_document',
      resourceId: response.document.id
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ui.notify({ type: 'error', message: error.message || '新版本草稿创建失败' })
  }
}

async function exitEditor() {
  const projectSceneId = editor.value?.project_scene_id || ''
  const title = editor.value?.name || 'Scene Details'
  const closed = await requestPanelClose([panelId.value], { reason: 'editor-exit' })
  if (!closed || !projectSceneId) return
  layout.select({
    resourceType: 'project_scene',
    resourceId: projectSceneId,
    title
  })
  openStudioPanel('scene-details', {
    resourceType: 'project_scene',
    resourceId: projectSceneId
  })
}

function selectNode(node) {
  editorSessions.select(editor.value?.id, node?.id || '')
  store.setEditorContext(editor.value, node?.id || '')
  store.selected = node ? { type: 'editor-node', value: node } : null
  layout.select(
    node
      ? {
          resourceType: 'scene_editor_node',
          resourceId: node.id,
          title: node.name || node.id
        }
      : null
  )
  layout.revealInspector()
}

onBeforeUnmount(() => {
  unregisterGuard?.()
  store.clearEditorContext(editor.value?.id)
})
</script>

<style scoped>
.scene-editor-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--sf-bg-secondary);
}
.scene-editor-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 13px;
  border-bottom: 1px solid var(--sf-border-light);
}
.scene-editor-panel header > div:first-child {
  display: flex;
  flex-direction: column;
}
.scene-editor-panel header span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.actions {
  display: flex;
  gap: 6px;
}
.scene-editor-panel :deep(.scene-editor) {
  min-height: 0;
  flex: 1;
}
.empty {
  display: grid;
  flex: 1;
  color: var(--sf-text-disabled);
  place-items: center;
}
</style>
