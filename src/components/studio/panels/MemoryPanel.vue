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
  <section class="memory-panel">
    <header>
      <div>
        <b>Project Memory</b>
        <span>项目背景与常用信息</span>
      </div>
      <div class="actions">
        <span>revision {{ memory.revision }}</span>
        <el-button size="small" :loading="memory.loading" @click="reload">重新读取</el-button>
        <el-button
          size="small"
          type="primary"
          :loading="memory.saving"
          :disabled="!memory.dirty"
          @click="save"
        >
          保存
        </el-button>
      </div>
    </header>
    <el-alert v-if="memory.error" :title="memory.error" type="error" show-icon :closable="false" />
    <div class="editor-grid">
      <textarea
        :value="memory.content"
        spellcheck="false"
        aria-label="Project Memory Markdown"
        @input="memory.edit($event.target.value)"
      />
      <!-- preview 已经由 utils/markdown 的 DOMPurify 白名单清洗。 -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article class="preview markdown-body" v-html="preview" />
    </div>
    <footer>
      <span v-if="memory.dirty">有未保存修改</span>
      <span v-else>已保存 · {{ updatedText }}</span>
    </footer>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { useMemoryStore } from '@/stores/memory'
import { useUiStore } from '@/stores/ui'
import { makePanelId } from '@/studio/panelRegistry'
import { notifyPanelGuardChanged, registerPanelGuard } from '@/studio/panelLifecycle'

const memory = useMemoryStore()
const ui = useUiStore()
const preview = computed(() => renderMarkdown(memory.content || '*Memory 为空*'))
const updatedText = computed(() => {
  if (!memory.updatedAt) return '尚未更新'
  const date = new Date(memory.updatedAt)
  return Number.isNaN(date.getTime()) ? memory.updatedAt : date.toLocaleString('zh-CN')
})

async function reload() {
  try {
    await memory.load()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Memory 读取失败' })
  }
}

async function save() {
  try {
    await memory.save()
    ui.notify({ type: 'success', message: 'Project Memory 已保存' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Memory 保存失败' })
  }
}

const unregisterGuard = registerPanelGuard(makePanelId('memory'), {
  isDirty: () => memory.dirty,
  save: () => memory.save(),
  discard: () => memory.load()
})
watch(() => memory.dirty, notifyPanelGuardChanged)

onMounted(reload)
onBeforeUnmount(unregisterGuard)
</script>

<style scoped lang="scss">
.memory-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sf-bg-primary);

  > header,
  > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    padding: 9px 12px;
    border-bottom: 1px solid var(--sf-border-light);
    background: var(--sf-bg-secondary);
  }

  > header > div:first-child {
    display: flex;
    flex-direction: column;
  }

  b {
    color: var(--sf-text-primary);
    font-size: 12px;
  }

  span,
  small {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }

  > footer {
    border-top: 1px solid var(--sf-border-light);
    border-bottom: 0;
  }
}

.actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.editor-grid {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 1fr;
  min-height: 0;
}

textarea,
.preview {
  min-width: 0;
  padding: 18px;
  border: 0;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  font:
    12px/1.65 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  resize: none;
  outline: 0;
  overflow: auto;
}

textarea {
  border-right: 1px solid var(--sf-border-light);
}

.preview {
  font-family: inherit;
}
</style>
