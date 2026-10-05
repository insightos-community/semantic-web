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
  <article
    :id="`interaction-${interaction.id}`"
    class="interaction-shell"
    :class="{ 'is-compact': compact }"
    :data-kind="interaction.uiKind"
  >
    <template v-if="compact">
      <div class="compact-summary">
        <el-tag size="small" effect="plain" :type="resolvedTagType">{{ compactLabel }}</el-tag>
        <span>{{ interaction.question || '需要用户输入' }}</span>
        <el-button v-if="isPending" text size="small" @click="interactions.expand(interaction.id)">
          继续处理
        </el-button>
      </div>
    </template>
    <template v-else>
      <header>
        <div>
          <small>{{ sourceLabel }}</small>
          <b>{{ interaction.question || '需要用户输入' }}</b>
        </div>
        <el-tag size="small" effect="plain">{{ kindLabel }}</el-tag>
      </header>
      <p v-if="interaction.description">{{ interaction.description }}</p>
      <component
        :is="renderer"
        v-if="renderer"
        :interaction="interaction"
        :disabled="submitting"
        @submit="submit"
      />
      <div v-else class="unsupported">请升级 Studio 以处理 {{ interaction.uiKind }} 请求。</div>
      <footer>
        <div v-if="isPending" class="secondary-actions">
          <el-button text size="small" :disabled="submitting" @click="later">稍后处理</el-button>
          <el-button v-if="canSkip" text size="small" :disabled="submitting" @click="skip">
            跳过
          </el-button>
          <el-button v-if="canCancel" text size="small" :disabled="submitting" @click="cancel">
            取消询问
          </el-button>
        </div>
        <span v-if="submitting">处理中，等待 Server 确认…</span>
        <span v-else-if="error" class="error">{{ error }}</span>
      </footer>
    </template>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { getInteractionRenderer } from './rendererRegistry'
import { useInteractionsStore } from '@/stores/interactions'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  interaction: { type: Object, required: true }
})
const interactions = useInteractionsStore()
const ui = useUiStore()
const renderer = computed(() => getInteractionRenderer(props.interaction.uiKind))
const submitting = computed(() => interactions.isSubmitting(props.interaction.id))
const isPending = computed(() => props.interaction.status === 'pending')
const compact = computed(() => !isPending.value || interactions.isCollapsed(props.interaction.id))
const isConfirm = computed(
  () => props.interaction.uiKind === 'confirm' || props.interaction.kind === 'confirm'
)
const requiredFields = computed(() =>
  Array.isArray(props.interaction.schema?.required) ? props.interaction.schema.required : []
)
const canSkip = computed(() => !isConfirm.value && requiredFields.value.length === 0)
const canCancel = computed(() => !isConfirm.value)
const error = computed(() => interactions.submitErrors[props.interaction.id] || '')
const sourceLabel = computed(() => {
  if (props.interaction.taskId) return 'Task · ' + props.interaction.taskId
  if (props.interaction.workflowId) return 'Workflow · ' + props.interaction.workflowId
  return 'Agent · ' + props.interaction.agentName
})
const kindLabel = computed(() => {
  if (props.interaction.action === 'enter_plan') return '规划建议'
  return (
    {
      confirm: '确认',
      form: '表单',
      parameter: '参数',
      single_select: '单选',
      multi_select: '多选',
      image_select: '图片',
      file_select: '文件',
      map_select: '地图'
    }[props.interaction.uiKind] || props.interaction.uiKind
  )
})
const compactLabel = computed(() => {
  if (isPending.value) return '待处理'
  return (
    {
      approved: '已确认',
      rejected: '已拒绝',
      expired: '已过期',
      cancelled: '已取消'
    }[props.interaction.result] || '已回答'
  )
})
const resolvedTagType = computed(() => {
  if (isPending.value) return 'warning'
  if (props.interaction.result === 'approved') return 'success'
  if (props.interaction.result === 'rejected') return 'danger'
  return 'info'
})

async function submit(answer) {
  const ok = await interactions.submit(props.interaction.id, answer)
  if (!ok) ui.notify({ type: 'error', message: 'Interaction 未送达，请检查连接后重试' })
}

function later() {
  interactions.collapse(props.interaction.id)
}

async function skip() {
  if (!canSkip.value) return
  await submit({})
}

async function cancel() {
  const ok = await interactions.cancel(props.interaction.id)
  if (!ok) ui.notify({ type: 'error', message: 'Interaction 取消请求未送达，请检查连接后重试' })
}
</script>

<style scoped lang="scss">
.interaction-shell {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);

  > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    div {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
    }

    small {
      color: var(--sf-text-disabled);
      font-size: 9px;
    }

    b {
      color: var(--sf-text-primary);
      font-size: 12px;
      line-height: 1.5;
    }
  }

  > p {
    margin: 8px 0;
    color: var(--sf-text-secondary);
    font-size: 11px;
    line-height: 1.5;
  }

  > footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 18px;
    margin-top: 9px;
    color: var(--sf-text-disabled);
    font-size: 9px;

    .error {
      color: var(--sf-danger);
    }
  }
}

.interaction-shell.is-compact {
  padding: 8px 10px;
  box-shadow: none;
}

.compact-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  span {
    overflow: hidden;
    flex: 1;
    color: var(--sf-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.secondary-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}

.unsupported {
  margin-top: 10px;
  padding: 10px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-tertiary);
  color: var(--sf-warning);
  font-size: 11px;
}
</style>
