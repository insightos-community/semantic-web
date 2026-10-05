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
  <section class="conversation-panel" :class="{ 'is-embedded': embedded }">
    <header v-if="!embedded" class="panel-toolbar">
      <div>
        <span>当前会话</span>
        <strong>
          {{ conversation.current?.title || '请选择 Conversation' }}
          <el-tag v-if="conversation.currentArchived" size="small" type="info">已归档</el-tag>
        </strong>
      </div>
      <div class="run-state">
        <i class="sf-status-dot" :data-status="runMeta.dot" />
        {{ runMeta.label }}
      </div>
    </header>
    <MessageStream ref="stream" :compact="embedded" />
    <PromptInput
      :compact="embedded"
      :read-only-reason="conversation.currentArchived ? '已归档 · 只读' : ''"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import MessageStream from '@/components/chat/MessageStream.vue'
import PromptInput from '@/components/chat/PromptInput.vue'
import { useConversationStore } from '@/stores/conversation'
import { useRunsStore } from '@/stores/runs'
import { useUiStore } from '@/stores/ui'

const conversation = useConversationStore()
const stream = ref(null)
defineExpose({
  captureViewport: () => stream.value?.captureViewport(),
  restoreViewport: () => stream.value?.restoreViewport()
})
defineProps({ embedded: { type: Boolean, default: false } })
const runs = useRunsStore()
const ui = useUiStore()

const activeRun = computed(() => runs.activeForConversation(conversation.currentId))
const runMeta = computed(() => {
  if (!conversation.currentId) return { label: '未选择', dot: 'idle' }
  if (conversation.currentArchived) return { label: '只读历史', dot: 'stopped' }
  const labels = {
    queued: ['排队中', 'starting'],
    running: ['运行中', 'warning'],
    waiting_input: ['等待输入', 'warning'],
    cancelling: ['停止中', 'danger'],
    completed: ['已完成', 'success'],
    failed: ['失败', 'danger'],
    cancelled: ['已取消', 'stopped']
  }
  const value = activeRun.value ? labels[activeRun.value.status] : ['待命', 'success']
  return { label: value?.[0] || activeRun.value?.status, dot: value?.[1] || 'idle' }
})

async function select(id) {
  if (!id) return
  try {
    await conversation.select(id)
  } catch (error) {
    ui.notify({ type: 'error', message: `Conversation 恢复失败：${error.message}` })
  }
}

onMounted(() => select(conversation.currentId))
watch(() => conversation.currentId, select)
</script>

<style scoped lang="scss">
.conversation-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: var(--sf-bg-primary);
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  flex: none;
  padding: 0 14px;
  border-bottom: 0;
  background: var(--sf-bg-secondary);

  > div:first-child {
    display: flex;
    flex-direction: column;
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
    font-weight: 380;
    letter-spacing: 0.03em;
  }

  strong {
    color: var(--sf-text-primary);
    font-size: 12px;
  }
}

.run-state {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sf-text-secondary);
  font-size: 11px;
  font-weight: 380;
}

.conversation-waiting {
  display: grid;
  flex: none;
  gap: 8px;
  padding: 0 18px 10px;
}
.is-embedded .conversation-waiting {
  padding: 0 12px;
  max-height: 32%;
  overflow-y: auto;
}
</style>
