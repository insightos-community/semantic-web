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
  <section class="current-work" data-testid="studio-current-work">
    <button type="button" class="work-summary" @click="inspect">
      <i class="sf-status-dot" :data-status="statusTone" />
      <span class="work-copy">
        <span class="work-heading">
          <strong>{{ displayed ? label : '当前没有执行' }}</strong>
          <span v-if="displayed" class="work-state">{{ stateLabel }}</span>
          <span v-if="displayed && !current" class="work-recent">最近结果</span>
          <span v-if="displayed?.kind === 'workflow'" class="work-tasks">
            {{
              progress.taskTotal === null
                ? 'Task 进度待同步'
                : `Task ${progress.taskCompleted}/${progress.taskTotal} 已完成`
            }}
          </span>
          <span v-if="displayed" class="work-title" :title="title">{{ title }}</span>
        </span>
        <span
          v-if="current && (progress.subtask || progress.skill || progress.stage)"
          class="work-progress"
        >
          <span v-if="progress.subtask" :title="progress.subtask.goal || progress.subtask.id">
            SubTask {{ progress.subtaskPosition }}/{{ progress.subtaskTotal }}
          </span>
          <span v-if="progress.skill" :title="progress.skill">Skill {{ progress.skill }}</span>
          <span v-if="progress.stage" :title="progress.stage">Stage {{ progress.stage }}</span>
          <span v-if="progress.parallelExecutions > 1"
            >{{ progress.parallelExecutions }} 个技能并行</span
          >
        </span>
      </span>
    </button>
    <span class="work-actions">
      <el-button
        v-if="work.items.length > 1"
        size="small"
        text
        @click="layout.selectPrimary('run')"
      >
        {{ work.items.length }} 项进行中
      </el-button>
      <el-button size="small" text @click="layout.selectPrimary('run')">执行历史</el-button>
      <el-button v-if="current" size="small" @click="inspect">详情</el-button>
      <el-button v-else-if="displayed" size="small" @click="inspect">查看结果</el-button>
      <el-button v-if="current" size="small" type="danger" plain :loading="stopping" @click="stop">
        {{ stopLabel }}
      </el-button>
    </span>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useWorkflowStore, workflowStopMode } from '@/stores/workflow'
import { useRobotStore } from '@/stores/robot'
import { useRunsStore } from '@/stores/runs'
import { useProjectStore } from '@/stores/project'
import { useLayoutStore } from '@/stores/layout'
import { useUiStore } from '@/stores/ui'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { useDeviceStore } from '@/stores/device'
import { currentProjectWork, projectWorkProgress } from '@/studio/currentWork'
import { openStudioPanel } from '@/studio/panelService'
import { stopWorkflowFromUI } from '@/studio/stopWorkflow'

const workflows = useWorkflowStore()
const robots = useRobotStore()
const runs = useRunsStore()
const scope = useExecutionScopeStore()
const devices = useDeviceStore()
const project = useProjectStore()
const layout = useLayoutStore()
const ui = useUiStore()
const stopping = ref(false)
const workflowViews = computed(() => ({
  ...workflows.views,
  ...(workflows.workflow
    ? {
        [workflows.workflow.id]: { workflow: workflows.workflow, tasks: workflows.tasks }
      }
    : {})
}))
const work = computed(() =>
  currentProjectWork({
    projectId: project.currentProjectId,
    workflows: [
      ...new Map(
        [...workflows.items, ...(workflows.workflow ? [workflows.workflow] : [])].map((item) => [
          item.id,
          { ...item, tasks: workflowViews.value[item.id]?.tasks }
        ])
      ).values()
    ],
    executions: robots.executions,
    runs: runs.items,
    devices: devices.robots
  })
)
const current = computed(() => work.value.current)
const displayed = computed(() => current.value || work.value.recent)
const title = computed(
  () =>
    displayed.value?.value.goal ||
    displayed.value?.value.skill_name ||
    displayed.value?.value.title ||
    'Agent 对话'
)
const progress = computed(() =>
  projectWorkProgress(displayed.value, {
    workflowViews: workflowViews.value,
    executions: robots.executions
  })
)
// 历史列表 / Snapshot 可能只有摘要；按展示的业务 ID 补查，不切换当前 Workflow。
watch(
  () => (displayed.value?.kind === 'workflow' ? displayed.value.value.id : ''),
  async (id) => {
    if (id && !workflowViews.value[id]) {
      try {
        await workflows.loadView(id)
      } catch {
        // 保留真实状态，并明确显示“进度待同步”，不把缺失 Task 当成 0/0。
      }
    }
  },
  { immediate: true }
)
const label = computed(() =>
  displayed.value?.kind === 'run' && displayed.value.value.robot_id
    ? 'Robot 请求'
    : { workflow: 'Workflow', execution: '技能调试', run: 'Agent' }[displayed.value?.kind]
)
// 顶栏停止按钮与 Workflow 详情面板共用同一套停止语义：物理状态未知时普通 stop
// 无法收敛，按钮必须直接引导人工安全确认，而不是反复发一个会被回退的 stop。
const stopMode = computed(() =>
  current.value?.kind === 'workflow' ? workflowStopMode(current.value.value) : ''
)
const stopLabel = computed(() => {
  const item = current.value
  if (!item) return ''
  if (item.kind === 'run') return item.value.robot_id ? '停止请求' : '停止生成'
  if (item.kind === 'workflow') {
    if (stopMode.value === 'unknown') return '确认停止'
    if (stopMode.value === 'retry') return '重试停止'
    return '停止执行'
  }
  // 技能调试执行沿用原有的重试提示，不改变既有交互文案。
  return ['stopping', 'interrupted'].includes(item.value.status) ? '重试停止' : '停止执行'
})
const statusTone = computed(() =>
  ['paused', 'interrupted', 'failed', 'stopped', 'cancelled', 'canceled'].includes(
    displayed.value?.value.status
  )
    ? 'warning'
    : current.value
      ? 'running'
      : 'idle'
)
const stateLabel = computed(
  () =>
    ({
      pending: '等待执行',
      queued: '排队中',
      starting: '启动中',
      running: '执行中',
      paused: '已暂停',
      waiting_agent: '等待 Agent',
      waiting_input: '等待输入',
      stopping: '停止中',
      interrupted: '停止待确认',
      cancelling: '停止中',
      completed: '已完成',
      failed: '失败',
      stopped: '已停止',
      cancelled: '已取消',
      canceled: '已取消'
    })[displayed.value?.value.status] || ''
)

function inspect() {
  const item = displayed.value
  if (!item) return layout.selectPrimary('run')
  if (item.kind === 'workflow') scope.inspectWorkflow(item.value.id)
  else if (item.kind === 'execution') scope.inspectExecution(item.value.id)
  else scope.inspectRun(item.value.id)
  openStudioPanel(current.value ? 'activity' : 'artifacts')
}

async function stop() {
  const item = current.value
  if (!item || stopping.value) return
  stopping.value = true
  try {
    if (item.kind === 'workflow') {
      await stopWorkflowFromUI(workflows, ui, item.value.id, currentWorkflowTasks(item.value.id), {
        view: workflowViews.value[item.value.id]
      })
    } else if (item.kind === 'execution') await robots.stop(item.value)
    else await runs.cancel(item.value.id)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '停止失败' })
  } finally {
    stopping.value = false
  }
}

// 人工安全确认弹框需要列出受影响的 Robot Execution；优先用当前视图，其次退回
// store 中已缓存的 Task 列表，避免因列表尚未同步而漏报现场。
function currentWorkflowTasks(workflowId) {
  return (
    workflowViews.value[workflowId]?.tasks ||
    workflows.tasks.filter((task) => task.workflow_id === workflowId)
  )
}
</script>

<style scoped>
.current-work {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  flex-shrink: 0;
  padding: 4px 10px;
  border-top: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);
}
.work-summary {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: min(100%, 300px);
  gap: 8px;
  padding: 4px 0;
  border: 0;
  color: var(--sf-text-secondary);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.work-copy {
  flex: 1;
  min-width: 0;
}
.work-heading,
.work-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.work-heading strong,
.work-state,
.work-tasks,
.work-recent {
  flex-shrink: 0;
}
.work-recent {
  color: var(--sf-text-muted);
}
.work-progress {
  flex-wrap: wrap;
  margin-top: 3px;
  color: var(--sf-text-primary);
}
.work-progress > span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current-work .el-button + .el-button {
  margin-left: 0;
}
.work-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-left: auto;
}
</style>
