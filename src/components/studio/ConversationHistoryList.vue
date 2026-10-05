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
  <section class="conversation-history" data-testid="conversation-history">
    <div class="history-controls">
      <el-input
        ref="searchInput"
        v-model="search"
        placeholder="搜索对话"
        aria-label="搜索对话"
        :prefix-icon="Search"
        clearable
        @keydown.down.prevent="focusRow(0)"
      />
      <div class="history-filters" role="tablist" aria-label="对话范围">
        <button
          type="button"
          role="tab"
          :aria-selected="scope === 'active'"
          @click="scope = 'active'"
        >
          最近
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="scope === 'archived'"
          @click="scope = 'archived'"
        >
          已归档
        </button>
        <button
          type="button"
          class="history-refresh"
          aria-label="刷新历史"
          title="刷新历史"
          :disabled="loading"
          @click="refresh"
        >
          <Refresh />
        </button>
      </div>
    </div>
    <p v-if="error || selectionError" class="history-error" role="alert">
      {{ error || selectionError }}
    </p>
    <div ref="rows" class="history-list">
      <div v-for="(item, index) in filtered" :key="item.id" class="history-item">
        <button
          type="button"
          class="history-row"
          :data-conversation-id="item.id"
          :class="{ 'is-current': item.id === conversation.currentId }"
          :aria-current="item.id === conversation.currentId ? 'true' : undefined"
          :title="item.title || '未命名对话'"
          :disabled="selecting"
          @click="$emit('select', item.id)"
          @keydown.down.prevent="focusRow(index + 1)"
          @keydown.up.prevent="focusRow(index - 1)"
        >
          <ChatDotRound /><span>{{ item.title || '未命名对话' }}</span>
          <time :datetime="item.updated_at || item.created_at" :title="absoluteTime(item)">{{
            relativeTime(item)
          }}</time>
        </button>
        <button
          v-if="scope === 'active'"
          type="button"
          class="history-archive"
          :aria-label="`归档 ${item.title || '未命名对话'}`"
          title="归档对话"
          :disabled="Boolean(archivingId) || selecting"
          @click.stop="archive(item)"
        >
          <Delete />
        </button>
      </div>
      <div v-if="!filtered.length" class="history-empty">
        {{
          loading
            ? '正在加载…'
            : search
              ? '未找到匹配的对话'
              : scope === 'archived'
                ? '暂无已归档对话'
                : '还没有对话'
        }}
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChatDotRound, Delete, Refresh, Search } from '@element-plus/icons-vue'
import { useConversationStore } from '@/stores/conversation'
import { requestConversationArchive } from '@/studio/conversationActions'
defineProps({ selecting: Boolean, selectionError: { type: String, default: '' } })
defineEmits(['select'])
const conversation = useConversationStore()
const searchInput = ref(null)
const rows = ref(null)
const search = ref('')
const scope = ref('active')
const loading = ref(false)
const error = ref('')
const archivingId = ref('')
async function archive(item) {
  if (archivingId.value) return
  archivingId.value = item.id
  try {
    await requestConversationArchive(item)
  } finally {
    archivingId.value = ''
  }
}
const now = ref(Date.now())
const filtered = computed(() =>
  (scope.value === 'archived' ? conversation.archivedItems : conversation.items).filter((item) =>
    (item.title || '未命名对话')
      .toLocaleLowerCase()
      .includes(search.value.trim().toLocaleLowerCase())
  )
)
async function refresh() {
  if (!conversation.projectId || loading.value) return
  loading.value = true
  error.value = ''
  now.value = Date.now()
  try {
    await conversation.load(conversation.projectId, { includeArchived: true })
  } catch (err) {
    error.value = err.message || '加载对话历史失败'
  } finally {
    loading.value = false
  }
}
function focusRow(index) {
  if (index < 0) {
    searchInput.value?.focus()
    return
  }
  rows.value?.querySelectorAll('.history-row')[index]?.focus()
}
function absoluteTime(item) {
  const date = new Date(item.updated_at || item.created_at)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false })
}
function relativeTime(item) {
  const timestamp = new Date(item.updated_at || item.created_at).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const minutes = Math.max(0, Math.floor((now.value - timestamp) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return minutes + ' 分钟前'
  if (minutes < 1440) return Math.floor(minutes / 60) + ' 小时前'
  if (minutes < 10080) return Math.floor(minutes / 1440) + ' 天前'
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
onMounted(refresh)
defineExpose({ focus: () => searchInput.value?.focus(), refresh })
</script>
<style scoped lang="scss">
.conversation-history {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.history-controls {
  padding: 16px 14px 0;
  :deep(.el-input__wrapper) {
    background: var(--sf-bg-secondary);
    border-radius: 7px;
    box-shadow: 0 0 0 1px var(--sf-border-light);
  }
  :deep(.el-input__inner) {
    font-size: 14px;
  }
}
.history-filters {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0 8px;
  > button {
    border: 0;
    padding: 5px 0;
    font-size: 13px;
    background: transparent;
    color: var(--sf-text-secondary);
    cursor: pointer;
    &[aria-selected='true'] {
      color: var(--sf-text-primary);
      box-shadow: 0 2px var(--sf-brand);
    }
  }
  .history-refresh {
    margin-left: auto;
    width: 28px;
    height: 28px;
    padding: 5px;
  }
}
.history-list {
  flex: 1;
  min-height: 0;
  padding: 4px 8px 16px;
  overflow-y: auto;
}
.history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--sf-text-primary);
  text-align: left;
  cursor: pointer;
  &:hover {
    background: var(--sf-bg-hover);
  }
  &.is-current {
    background: var(--sf-bg-secondary);
  }
  > svg {
    width: 16px;
    flex: none;
    color: var(--sf-text-secondary);
  }
  > span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    line-height: 1.5;
  }
  time {
    flex: none;
    font-size: 12px;
    color: var(--sf-text-secondary);
  }
}
.history-item {
  display: flex;
  align-items: center;
  min-width: 0;
  .history-row {
    flex: 1;
    min-width: 0;
  }
  &:hover .history-archive,
  &:focus-within .history-archive {
    opacity: 1;
    pointer-events: auto;
  }
}
.history-archive {
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 5px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  &:hover,
  &:focus-visible {
    background: var(--sf-bg-hover);
    color: var(--sf-text-primary);
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  svg {
    width: 16px;
    height: 16px;
  }
}
.history-empty {
  padding: 48px 16px;
  text-align: center;
  color: var(--sf-text-secondary);
  font-size: 14px;
}
.history-error {
  margin: 8px 14px;
  color: var(--sf-danger);
  font-size: 13px;
}
</style>
