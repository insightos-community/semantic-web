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
  <section class="bottom-panel" data-testid="studio-bottom-panel">
    <header class="bottom-tabs" role="tablist" aria-label="底部面板">
      <div class="panel-label">面板</div>
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :class="{ active: tab.id === activeTab }"
        :aria-selected="tab.id === activeTab"
        @click="activate(tab.id)"
      >
        {{ tab.label }}
        <span v-if="tab.count">{{ tab.count }}</span>
      </button>
      <div class="tabs-spacer" />
      <el-tooltip content="关闭底部面板" effect="dark" :show-after="500" placement="top">
        <button class="icon-button" type="button" @click="$emit('close')">
          <Close />
        </button>
      </el-tooltip>
    </header>
    <div class="scope-bar" data-testid="execution-scope">
      <button
        type="button"
        :class="{ active: scope.mode === 'current' }"
        @click="scope.followCurrent()"
      >
        当前运行
      </button>
      <RunHistoryPicker :items="history" @select="selectHistory" />
      <span
        >{{ scope.mode === 'history' ? '已固定记录' : '当前运行 / 最近结果' }} · {{ title }}</span
      >
      <small v-if="loading">正在读取执行记录…</small>
      <button type="button" :disabled="loading" @click="refresh">刷新记录</button>
    </div>
    <div class="bottom-content">
      <ActivityPanel v-if="activeTab === 'activity'" />
      <InteractionsPanel v-else-if="activeTab === 'interactions'" />
      <ResultsPanel v-else-if="activeTab === 'artifacts'" />
      <LogsPanel v-else-if="activeTab === 'logs'" />
      <ProblemsPanel v-else />
    </div>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, provide, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import RunHistoryPicker from './RunHistoryPicker.vue'
import { useInteractionsStore } from '@/stores/interactions'
import { useLayoutStore } from '@/stores/layout'
import { ACTIVE_ROBOT_EXECUTION_STATUSES, useRobotStore } from '@/stores/robot'
import { useWorkflowStore } from '@/stores/workflow'
import { ACTIVE_RUN_STATUSES, useRunsStore } from '@/stores/runs'
import { createExecutionEvidence, executionEvidenceKey } from '@/studio/executionEvidence'

defineEmits(['close'])
const layout = useLayoutStore()
const robots = useRobotStore()
const workflow = useWorkflowStore()
const runs = useRunsStore()
const evidence = createExecutionEvidence()
provide(executionEvidenceKey, evidence)
const { scope, title, executions, workflowId, loading, problems } = evidence
const traceRefresh = setInterval(() => {
  for (const run of evidence.runs.value)
    if (ACTIVE_RUN_STATUSES.has(run.status)) robots.loadRunTrace(run)
}, 5000)
onBeforeUnmount(() => clearInterval(traceRefresh))
const interactions = useInteractionsStore()
const ActivityPanel = defineAsyncComponent(
  () => import('@/components/studio/panels/ActivityPanel.vue')
)
const ResultsPanel = defineAsyncComponent(
  () => import('@/components/studio/panels/ExecutionResultsPanel.vue')
)
const InteractionsPanel = defineAsyncComponent(
  () => import('@/components/studio/panels/InteractionsPanel.vue')
)
const LogsPanel = defineAsyncComponent(() => import('@/components/studio/panels/LogsPanel.vue'))
const ProblemsPanel = defineAsyncComponent(
  () => import('@/components/studio/panels/ProblemsPanel.vue')
)
const activeTab = computed(() => layout.shell.bottomTab)
const tabs = computed(() => [
  { id: 'activity', label: '过程', count: 0 },
  { id: 'logs', label: '日志', count: evidence.events.value.length },
  { id: 'problems', label: '问题', count: problems.value.length },
  { id: 'artifacts', label: '结果', count: 0 },
  ...(interactions.pending.length || activeTab.value === 'interactions'
    ? [{ id: 'interactions', label: '待处理', count: interactions.pending.length }]
    : [])
])
const history = computed(() => [
  ...workflow.items.map((item) => ({
    kind: 'workflow',
    id: item.id,
    title: item.goal || item.id,
    status: item.status,
    time: item.created_at || item.updated_at,
    label: `${item.goal || item.id} · ${item.status}`
  })),
  ...robots.executions
    .filter((item) => !item.workflow_id)
    .map((item) => ({
      kind: 'execution',
      id: item.id,
      title: item.skill_name || item.id,
      status: item.status,
      time: item.created_at || item.updated_at,
      label: `${item.skill_name || item.id} · ${item.status} · ${item.id}`
    })),
  ...runs.items
    .filter((item) => !item.workflow_id && (!item.kind || item.kind === 'conversation'))
    .map((item) => ({
      kind: 'run',
      id: item.id,
      title: item.agent_name || item.agent_id || item.id,
      status: item.status,
      time: item.started_at,
      label: `Agent Run · ${item.id} · ${item.status}`
    }))
])
function selectHistory(value) {
  const separator = value.indexOf(':')
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (kind === 'execution') scope.inspectExecution(id)
  else if (kind === 'workflow') scope.inspectWorkflow(id)
  else scope.inspectRun(id)
}
async function refresh() {
  await Promise.allSettled([
    ...executions.value.map((item) => robots.loadDetail(item.id)),
    ...evidence.runs.value.map((item) => robots.loadRunTrace(item)),
    ...(workflowId.value ? [workflow.loadView(workflowId.value, { refresh: true })] : [])
  ])
}
watch(
  () => executions.value.map((item) => item.id).join(','),
  () => {
    for (const item of executions.value) {
      if (!robots.eventPages[item.id]?.loaded)
        // 单次 Robot 执行需要读到终态阶段，不能只读首 500 条后把末阶段
        // 显示为“暂无图像”。多 Task 的历史 Workflow 仍按需分页加载。
        robots.loadDetail(item.id, {
          allPages:
            executions.value.length === 1 || ACTIVE_ROBOT_EXECUTION_STATUSES.has(item.status)
        })
    }
  },
  { immediate: true }
)
watch(
  workflowId,
  (id) => {
    if (id) workflow.loadView(id).catch(() => {})
  },
  { immediate: true }
)
watch(
  () => evidence.runs.value.map((item) => `${item.id}:${item.status}`).join(','),
  () => {
    for (const item of evidence.runs.value) robots.loadRunTrace(item)
  },
  { immediate: true }
)

function activate(tab) {
  layout.revealBottom(tab)
}
</script>

<style scoped lang="scss">
.bottom-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg) var(--sf-radius-lg) 0 0;
  overflow: hidden;
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.bottom-tabs {
  display: flex;
  align-items: center;
  height: 40px;
  flex: none;
  gap: 2px;
  padding: 0 8px;
  border-bottom: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);

  .panel-label {
    margin: 0 8px 0 4px;
    color: var(--sf-text-disabled);
    font-size: 11px;
    font-weight: 380;
    letter-spacing: 0.09em;
  }

  button {
    display: flex;
    align-items: center;
    position: relative;
    height: 32px;
    gap: 6px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--sf-radius-md);
    background: transparent;
    color: var(--sf-text-secondary);
    font-size: 12px;
    cursor: pointer;

    span {
      min-width: 17px;
      padding: 1px 5px;
      border-radius: 999px;
      background: var(--sf-bg-tertiary);
      color: var(--sf-text-disabled);
      font-size: 11px;
      text-align: center;
    }

    &:hover {
      background: var(--sf-bg-hover);
      color: var(--sf-text-primary);
    }

    &.active {
      color: var(--sf-brand);
      font-weight: 520;

      &::after {
        position: absolute;
        right: 9px;
        bottom: -4px;
        left: 9px;
        height: 2px;
        border-radius: 4px;
        background: var(--sf-brand);
        content: '';
      }
    }
  }

  .tabs-spacer {
    flex: 1;
  }

  .icon-button {
    display: grid;
    width: 28px;
    padding: 0;
    place-items: center;

    svg {
      width: 14px;
    }
  }
}

.bottom-content {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.scope-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 3px 10px;
  border-bottom: 1px solid var(--sf-border-light);
  color: var(--sf-text-secondary);
  font-size: 11px;
  button,
  select {
    max-width: 260px;
    padding: 4px 6px;
    border: 1px solid var(--sf-border-light);
    border-radius: 4px;
    background: var(--sf-bg-secondary);
    color: inherit;
    font-size: 11px;
  }
  .active {
    color: var(--sf-brand);
  }
  > span {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}
</style>
