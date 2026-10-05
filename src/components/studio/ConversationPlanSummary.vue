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
  <article v-if="proposal" class="plan-summary-message" data-testid="plan-proposal-summary">
    <div class="plan-icon"><List /></div>
    <div class="plan-copy">
      <span v-if="visible">PLAN PROPOSAL · REVISION {{ proposal.revision }}</span>
      <span v-else>ACTIVE PLAN · {{ sourceConversationTitle }}</span>
      <b>{{ proposal.goal }}</b>
      <small>来源：{{ sourceConversationTitle }}</small>
      <small>Robot：{{ robotLabel }}</small>
      <small>完成条件：{{ criteriaLabel }}</small>
      <small v-if="!visible">当前 Project 的计划正在另一个 Conversation 中讨论。</small>
      <small v-else class="task-preview">
        {{ tasks.length }} 个主要 Task ·
        {{ taskPreview || '批准后才创建 Workflow' }}
      </small>
      <small v-if="workflow.error" class="is-error" role="alert">{{ workflow.error }}</small>
    </div>
    <div class="plan-actions">
      <el-button v-if="!visible" size="small" @click="returnToConversation">返回规划对话</el-button>
      <el-button v-else size="small" @click="openDocument">查看计划</el-button>
      <el-button
        v-if="visible && proposal.status === 'ready'"
        size="small"
        type="primary"
        :loading="workflow.action === 'approve'"
        @click="approve"
      >
        批准并执行
      </el-button>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { List } from '@element-plus/icons-vue'
import { useConversationStore } from '@/stores/conversation'
import { useLayoutStore } from '@/stores/layout'
import { useWorkflowStore } from '@/stores/workflow'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { openStudioPanel } from '@/studio/panelService'

const conversation = useConversationStore()
const layout = useLayoutStore()
const workflow = useWorkflowStore()
const scope = useExecutionScopeStore()
const proposal = computed(() => workflow.proposal)
const tasks = computed(() => workflow.proposalTasks)
const robotLabel = computed(() => {
  const ids = [
    ...new Set([
      ...(proposal.value?.approved_scope?.robot_ids || []),
      ...tasks.value.flatMap((task) => task.resource_requirements?.robot_ids || [])
    ])
  ]
  return (
    ids.join('、') ||
    (tasks.value.some((task) => task.required_role === 'robot')
      ? '批准后按所需能力分配'
      : '无需 Robot')
  )
})
const criteriaLabel = computed(() => {
  const criteria = proposal.value?.structured_plan?.completion_criteria
  if (Array.isArray(criteria)) return criteria.join('；') || '按各 Task 的完成条件验收'
  if (criteria && typeof criteria === 'object')
    return Object.entries(criteria)
      .map(([key, value]) => `${key}：${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join('；')
  return criteria || '按各 Task 的完成条件验收'
})
const taskPreview = computed(() => {
  const labels = tasks.value
    .slice(0, 2)
    .map((item) => item.title || item.goal || item.id)
    .filter(Boolean)
  return labels.length ? `TODO：${labels.join('；')}` : ''
})
const sourceConversationTitle = computed(
  () =>
    conversation.items.find((item) => item.id === proposal.value?.conversation_id)?.title ||
    proposal.value?.conversation_id ||
    '规划对话'
)
const visible = computed(
  () =>
    proposal.value &&
    !['approved', 'discarded'].includes(proposal.value.status) &&
    proposal.value.conversation_id === conversation.currentId
)

async function returnToConversation() {
  await conversation.select(proposal.value.conversation_id)
}

function openDocument() {
  openStudioPanel('plan-document', {
    resourceId: proposal.value.id
  })
}

async function approve() {
  try {
    if (await workflow.approveProposal()) {
      scope.followCurrent()
      layout.revealBottom('activity')
    }
  } catch {
    // Store 保存原始批准错误，计划卡原位显示并允许重新审阅。
  }
}
</script>

<style scoped lang="scss">
.plan-summary-message {
  display: grid;
  align-items: center;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 12px;
  margin: 14px 0 4px;
  padding: 12px 14px;
  border: 1px solid var(--sf-border-light);
  border-left: 3px solid var(--sf-brand);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-secondary);
}

.plan-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
}

.plan-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;

  > span {
    color: var(--sf-brand);
    font-size: 11px;
    font-weight: 380;
    letter-spacing: 0.08em;
  }

  > b {
    color: var(--sf-text-primary);
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  > small {
    color: var(--sf-text-secondary);
    overflow-wrap: anywhere;
  }

  .is-error {
    color: var(--sf-danger);
  }

  .task-preview {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.plan-actions {
  grid-column: 2 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
