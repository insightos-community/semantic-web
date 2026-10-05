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
  <section class="runs-panel">
    <header>
      <b>Agent 运行记录</b>
      <span>{{ filteredRuns.length }} 条 · 状态来自 Server</span>
      <el-button size="small" text :loading="runs.loading" @click="reload">刷新</el-button>
    </header>
    <div v-if="filteredRuns.length === 0" class="empty">当前 Conversation 暂无 Run</div>
    <button
      v-for="run in filteredRuns"
      :key="run.id"
      type="button"
      class="run-row"
      @click="openTrace(run)"
    >
      <i class="sf-status-dot" :data-status="statusMeta(run.status).dot" />
      <span class="run-copy"
        ><b
          >{{ run.agent_name || run.agent_id || 'Agent' }} ·
          {{ run.kind === 'task' ? 'Task 执行' : '对话' }}</b
        ><small>{{ run.model || '模型未上报' }} · {{ formatTime(run.started_at) }}</small></span
      >
      <span class="status">{{ statusMeta(run.status).label }}</span>
      <span class="trace">{{ durationLabel(run) }}</span>
      <span>查看调用</span>
      <el-button
        v-if="activeStatuses.has(run.status)"
        size="small"
        text
        type="danger"
        :loading="runs.cancellingId === run.id"
        @click.stop="cancel(run)"
      >
        停止
      </el-button>
    </button>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { ACTIVE_RUN_STATUSES, useRunsStore } from '@/stores/runs'
import { useConversationStore } from '@/stores/conversation'
import { openStudioPanel } from '@/studio/panelService'
import { useUiStore } from '@/stores/ui'
import { durationLabel } from '@/robot/executionRecords'

const runs = useRunsStore()
const conversation = useConversationStore()
const ui = useUiStore()
const activeStatuses = ACTIVE_RUN_STATUSES
const filteredRuns = computed(() =>
  runs.items.filter(
    (run) => !conversation.currentId || run.conversation_id === conversation.currentId
  )
)

const labels = {
  queued: ['排队中', 'starting'],
  running: ['运行中', 'warning'],
  waiting_input: ['等待输入', 'warning'],
  cancelling: ['停止中', 'danger'],
  completed: ['已完成', 'success'],
  failed: ['失败', 'danger'],
  cancelled: ['已取消', 'stopped']
}
const statusMeta = (status) => ({
  label: labels[status]?.[0] || status,
  dot: labels[status]?.[1] || 'idle'
})

function openTrace(run) {
  openStudioPanel('trace', { resourceType: 'trace', resourceId: run.trace_id || '', runId: run.id })
}
function formatTime(value) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '时间未上报'
}

async function cancel(run) {
  try {
    await runs.cancel(run.id)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Run 停止失败' })
  }
}

function reload() {
  runs.load(runs.projectId, conversation.currentId).catch((error) => {
    ui.notify({ type: 'error', message: error.message || 'Run 刷新失败' })
  })
}
</script>

<style scoped lang="scss">
.runs-panel {
  height: 100%;
  overflow: auto;
  background: var(--sf-bg-secondary);

  > header,
  .run-row {
    display: grid;
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto auto;
    gap: 10px;
    min-height: 48px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--sf-border-light);
  }

  > header {
    display: flex;
    position: sticky;
    z-index: 1;
    top: 0;
    background: var(--sf-bg-secondary);

    span {
      flex: 1;
      color: var(--sf-text-disabled);
      font-size: 11px;
    }
  }
}

.run-row {
  width: 100%;
  border-top: 0;
  border-right: 0;
  border-left: 0;
  background: transparent;
  color: var(--sf-text-secondary);
  font-size: 11px;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--sf-bg-hover);
  }
}

.run-id,
.trace {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-id {
  color: var(--sf-text-primary);
  font-family: ui-monospace, monospace;
}
.run-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.run-copy b,
.run-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-copy b {
  font-size: 12px;
  color: var(--sf-text-primary);
}
.run-copy small {
  color: var(--sf-text-secondary);
}

.empty {
  padding: 24px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: center;
}
</style>
