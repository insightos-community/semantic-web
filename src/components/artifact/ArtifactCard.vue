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
  <article class="artifact-resource-card" :class="{ 'large-preview': largePreview && isImage }">
    <button
      v-if="isImage"
      class="artifact-preview"
      type="button"
      :disabled="!blobUrl"
      @click.stop="openPreview"
    >
      <img v-if="blobUrl" :src="blobUrl" :alt="title" />
      <span v-else>{{ loading ? '加载中…' : '预览不可用' }}</span>
    </button>
    <div v-else class="artifact-file-mark">{{ extensionLabel }}</div>
    <div class="artifact-resource-copy">
      <b>{{ title }}</b>
      <span
        >{{ artifact.media_type || 'application/octet-stream' }} ·
        {{ formatSize(artifact.size) }}</span
      >
      <code>{{ workspacePath || artifact.id }}</code>
      <span v-if="artifact.stage">阶段：{{ artifact.stage }}</span>
      <time v-if="artifact.captured_at"
        >采集于
        {{ new Date(artifact.captured_at).toLocaleString('zh-CN', { hour12: false }) }}</time
      >
      <span v-if="loadError" role="alert">{{ loadError }}</span>
    </div>
    <div class="artifact-resource-actions">
      <el-button v-if="loadError" text size="small" @click.stop="ensureBlob">重试</el-button>
      <el-button text size="small" :loading="loading" @click.stop="downloadArtifact">
        下载
      </el-button>
      <el-button
        v-if="deletable"
        text
        size="small"
        type="danger"
        :loading="deleting"
        @click.stop="$emit('delete')"
      >
        删除
      </el-button>
    </div>
  </article>
  <el-dialog
    v-model="previewOpen"
    :title="title"
    width="min(92vw, 1100px)"
    append-to-body
    destroy-on-close
    class="artifact-lightbox"
  >
    <div class="preview-tools">
      <el-button :disabled="zoom <= 0.25" @click="zoomOut">缩小</el-button>
      <el-button @click="zoom = 1">{{ Math.round(zoom * 100) }}%</el-button>
      <el-button :disabled="zoom >= 4" @click="zoom = Math.min(4, zoom + 0.25)">放大</el-button>
    </div>
    <div class="preview-canvas">
      <img v-if="blobUrl" :src="blobUrl" :alt="title" :style="{ width: `${zoom * 100}%` }" />
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as chatApi from '@/api/chat'
import { useUiStore } from '@/stores/ui'
import { evidenceTitle } from '@/robot/stagePresentation'

const props = defineProps({
  artifact: { type: Object, required: true },
  deleting: { type: Boolean, default: false },
  deletable: { type: Boolean, default: true },
  largePreview: { type: Boolean, default: false }
})
defineEmits(['delete'])

const ui = useUiStore()
const previewOpen = ref(false)
const zoom = ref(1)
function zoomOut() {
  zoom.value = Math.max(0.25, zoom.value - 0.25)
}
const title = computed(() => evidenceTitle(props.artifact))
const blobUrl = ref('')
const loading = ref(false)
const loadError = ref('')
const responseMediaType = ref('')
let loadedArtifactId = ''
let loadGeneration = 0

const isImage = computed(() =>
  (props.artifact.media_type || responseMediaType.value).startsWith('image/')
)
const workspacePath = computed(() => props.artifact.metadata?.workspace_path || '')
const extensionLabel = computed(() => {
  const source = workspacePath.value || props.artifact.summary || ''
  const suffix = source.includes('.') ? source.split('.').at(-1) : 'FILE'
  return String(suffix || 'FILE')
    .slice(0, 6)
    .toUpperCase()
})

// 图片进入卡片时立即按鉴权 API 获取；普通文件只在用户点击下载时按需读取，
// 避免 Artifact 列表一次加载多个大文件本体。
watch(
  // Parent projections may create a new object on every execution feedback.
  // Reload only when the actual image identity or MIME changes.
  [() => props.artifact.id, () => props.artifact.media_type],
  async ([id, mediaType]) => {
    // Artifact 切换时让旧请求失效，但释放旧 URL 本身不能修改代次；否则新请求
    // 获取 Blob 后再次释放旧 URL 会把自己误判为过期，并永久停留在加载态。
    loadGeneration += 1
    loading.value = false
    releaseBlobUrl()
    loadedArtifactId = ''
    responseMediaType.value = ''
    loadError.value = ''
    if (id && (!mediaType || mediaType.startsWith('image/'))) await ensureBlob()
  },
  { immediate: true }
)

async function ensureBlob() {
  const id = props.artifact.id
  if (!id) return ''
  if (loadedArtifactId === id && blobUrl.value) return blobUrl.value
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = ''
  try {
    const blob = await chatApi.getArtifact(id)
    if (generation !== loadGeneration) return ''
    releaseBlobUrl()
    responseMediaType.value = blob.type || ''
    blobUrl.value = URL.createObjectURL(blob)
    loadedArtifactId = id
    return blobUrl.value
  } catch (error) {
    if (generation === loadGeneration) {
      loadError.value = error.message || `Artifact ${id} 读取失败`
      ui.notify({ type: 'warning', message: error.message || `Artifact ${id} 读取失败` })
    }
    return ''
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

function openPreview() {
  if (!blobUrl.value) return
  zoom.value = 1
  previewOpen.value = true
}

async function downloadArtifact() {
  const url = await ensureBlob()
  if (!url) return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download =
    workspacePath.value.split('/').at(-1) || props.artifact.summary || props.artifact.id
  anchor.click()
}

function releaseBlobUrl() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  blobUrl.value = ''
}

function formatSize(size) {
  const bytes = Number(size || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

onBeforeUnmount(() => {
  loadGeneration += 1
  releaseBlobUrl()
})
</script>

<style scoped lang="scss">
.artifact-resource-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 9px 0;
  border-bottom: 1px solid var(--sf-border-light);
}

.artifact-preview,
.artifact-file-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-disabled);
  font-size: 9px;
}

.artifact-preview {
  padding: 0;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.artifact-resource-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;

  b,
  span,
  code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  b {
    color: var(--sf-text-secondary);
    font-size: 11px;
  }

  span,
  code {
    color: var(--sf-text-disabled);
    font-size: 9px;
  }
}

.artifact-resource-actions {
  display: flex;
  flex-direction: column;
}
.large-preview {
  grid-template-columns: minmax(0, 1fr) auto;
}
.large-preview .artifact-preview {
  grid-column: 1 / -1;
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
}
.large-preview .artifact-preview img {
  object-fit: contain;
}
.artifact-resource-copy time {
  font-size: 10px;
  color: var(--sf-text-secondary);
}
.preview-tools {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}
.preview-canvas {
  overflow: auto;
  max-height: 72vh;
  background: #10141c;
  border-radius: 8px;
}
.preview-canvas img {
  display: block;
  height: auto;
  max-width: none;
  margin: auto;
}
</style>
