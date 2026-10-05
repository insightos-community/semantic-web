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
  <section class="results-panel">
    <header>
      <button v-if="sourceTab" type="button" @click="returnToSource">返回来源</button>
      <b>本次结果</b><span class="result-title" :title="title">{{ title }}</span>
      <button type="button" :disabled="exporting || !selection" @click="exportRecords">
        {{ exporting ? '正在收集记录与证据…' : '导出本次记录与证据' }}
      </button>
    </header>
    <p v-if="exportMessage" role="status">{{ exportMessage }}</p>
    <article v-for="item in resultItems" :key="item.id" class="result-item">
      <header>
        <b :title="item.title">{{ item.title }}</b
        ><DeviceStatus :status="item.status" />
        <small v-if="item.total != null">{{ item.completed }}/{{ item.total }} 步完成</small
        ><span v-else>耗时 {{ durationLabel(item.value) }}</span>
        <button type="button" @click="inspectResult(item)">查看详情</button>
      </header>
      <dl v-if="item.target.object || item.target.target">
        <dt v-if="item.target.object">对象</dt>
        <dd v-if="item.target.object">{{ item.target.object }}</dd>
        <dt v-if="item.target.target">目标</dt>
        <dd v-if="item.target.target">
          {{ item.target.target }}{{ item.target.layer ? ' · ' + item.target.layer : '' }}
        </dd>
      </dl>
      <p v-if="item.summary">{{ item.summary }}</p>
      <p v-if="item.failure" class="error">失败原因：{{ item.failure }}</p>
      <div v-if="item.artifacts.length" class="evidence-grid" aria-label="最终阶段证据">
        <ArtifactCard
          v-for="artifact in item.artifacts"
          :key="artifact.id"
          :artifact="artifact"
          :deletable="false"
          large-preview
        />
      </div>
      <p v-else class="empty">暂无最终阶段图像。</p>
    </article>
    <p v-if="!resultItems.length" class="empty">所选运行尚无结果回报。</p>
    <p v-for="missing in missingRecords" :key="missing" class="range-note">{{ missing }}</p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { useExecutionEvidence } from '@/studio/executionEvidence'
import { useRobotStore } from '@/stores/robot'
import { buildRobotStageView } from '@/robot/executionViewAdapter'
import { durationLabel, recordText } from '@/robot/executionRecords'
import { createExecutionExport } from '@/robot/exportExecution'
import { objectTarget, finalStageEvidence } from '@/studio/executionProcess'
import { useLayoutStore } from '@/stores/layout'

const {
  selection,
  title,
  workflowView,
  executions,
  runs,
  pendingPages,
  sourceTab,
  returnToSource
} = useExecutionEvidence()
const layout = useLayoutStore()
const robots = useRobotStore()
const exporting = ref(false)
const exportMessage = ref('')
const resultItems = computed(() => {
  if (workflowView.value)
    return (workflowView.value.tasks || []).map((task) => {
      const children = executions.value.filter(
        (execution) =>
          execution.task_id === task.id ||
          (task.subtasks || []).some((step) => step.execution_ref === execution.id)
      )
      const latest = [...children]
        .sort(
          (a, b) =>
            (Date.parse(a.started_at || a.created_at || '') || 0) -
            (Date.parse(b.started_at || b.created_at || '') || 0)
        )
        .at(-1)
      return {
        id: task.id,
        executionId: latest?.id,
        type: 'task',
        title: task.title || task.goal || task.id,
        status: task.status,
        value: task,
        completed: (task.subtasks || []).filter((step) => step.status === 'completed').length,
        total: task.subtasks?.length || 0,
        target: objectTarget(task.input),
        summary: task.result_summary || task.result?.summary || '',
        failure:
          task.status === 'failed'
            ? task.reason ||
              task.result?.error?.message ||
              latest?.error?.message ||
              '执行失败，详情见原始记录'
            : '',
        artifacts: finalStageEvidence(latest).artifacts
      }
    })
  if (executions.value.length)
    return executions.value.map((execution) => ({
      id: execution.id,
      executionId: execution.id,
      type: 'robot_execution',
      title: execution.skill_name || '独立执行',
      status: execution.status,
      value: execution,
      target: objectTarget(execution.input),
      summary: execution.result?.summary || '',
      failure:
        execution.status === 'failed'
          ? execution.error?.message ||
            execution.result?.error?.message ||
            '执行失败，详情见原始记录'
          : '',
      artifacts: finalStageEvidence(execution).artifacts
    }))
  return runs.value.slice(0, 1).map((run) => ({
    id: run.id,
    type: 'run',
    title: run.agent_name || run.agent_id || 'Agent 请求',
    status: run.status,
    value: run,
    target: {},
    summary: run.result?.summary || '',
    failure: run.status === 'failed' ? recordText(run.error || run.reason) : '',
    artifacts: []
  }))
})

// 历史过程按页读取；结果所用的最后一次 Execution 必须读到末页，才能拿到
// 最后 Stage 的 Observation。只补本页展示的执行，不替用户展开其它步骤的全文。
watch(
  () =>
    resultItems.value
      .filter((item) => item.executionId)
      .map(({ executionId: id }) => {
        const page = robots.eventPages[id]
        return `${id}:${page?.loaded}:${page?.cursor}:${page?.hasMore}:${page?.error}:${robots.detailLoading(id)}`
      })
      .join('|'),
  () => {
    for (const { executionId: id } of resultItems.value) {
      if (!id || robots.detailLoading(id)) continue
      const page = robots.eventPages[id]
      if (page?.error || (page?.loaded && !page.hasMore)) continue
      robots.loadDetail(id, { more: !!page?.loaded })
    }
  },
  { immediate: true }
)
function inspectResult(item) {
  layout.select({
    resourceType: item.type,
    resourceId: item.id,
    title: item.title,
    source: 'studio-evidence'
  })
  layout.revealInspector()
}

function executionRefs(execution) {
  return [
    ...(execution.artifact_refs || []),
    ...(execution.artifact_sync || [])
      .filter((item) => item.server_artifact_id)
      .map((item) => `artifact://${item.server_artifact_id}`)
  ]
}
const missingRecords = computed(() => [
  ...pendingPages.value.map((item) => `${item.id}：执行日志尚未全部读取，导出时会继续读取。`),
  ...executions.value
    .filter((item) => robots.eventPages[item.id]?.error)
    .map((item) => `${item.id}：${robots.eventPages[item.id].error}`),
  ...runs.value
    .filter((item) => robots.traceErrors[item.id])
    .map((item) => `${item.id}：${robots.traceErrors[item.id]}`),
  ...executions.value.flatMap((item) =>
    (item.artifact_sync || [])
      .filter((record) => record.status !== 'synced')
      .map((record) => `${item.id}：${record.summary || record.local_artifact_id} ${record.status}`)
  )
])
async function exportRecords() {
  exporting.value = true
  exportMessage.value = ''
  // 点击时固定身份，下载期间切换面板也不能混入另一轮。
  const executionIds = executions.value.map((item) => item.id)
  const selectedRuns = JSON.parse(JSON.stringify(runs.value))
  const selectedScope = { ...selection.value }
  const selectedTitle = title.value
  const selectedWorkflow = workflowView.value
    ? JSON.parse(JSON.stringify(workflowView.value))
    : null
  try {
    await Promise.allSettled(executionIds.map((id) => robots.loadDetail(id)))
    const selectedExecutions = executionIds.map((id) => robots.byId(id)).filter(Boolean)
    const refs = new Map()
    for (const execution of selectedExecutions) {
      for (const stage of [
        { evidence_refs: executionRefs(execution) },
        ...(execution.stages || [])
      ])
        for (const artifact of buildRobotStageView(execution, stage).artifacts)
          refs.set(artifact.id, artifact)
    }
    const missing = selectedExecutions.flatMap((item) => [
      ...(robots.eventPages[item.id]?.hasMore || robots.eventPages[item.id]?.error
        ? [`${item.id}：部分执行事件未读取`]
        : []),
      ...(item.artifact_sync || [])
        .filter((record) => record.status !== 'synced')
        .map((record) => `${record.local_artifact_id}：${record.status}`)
    ])
    for (const run of selectedRuns)
      if (!robots.tracesByRun[run.id])
        missing.push(`${run.id}：${robots.traceErrors[run.id] || 'Trace 尚未读取'}`)
    const { blob, manifest } = await createExecutionExport(
      {
        scope: selectedScope,
        scope_label: selectedTitle,
        workflow: selectedWorkflow,
        executions: selectedExecutions,
        runs: selectedRuns,
        events: Object.fromEntries(executionIds.map((id) => [id, robots.eventsFor(id)])),
        traces: selectedRuns.map((run) => robots.tracesByRun[run.id]).filter(Boolean),
        missing
      },
      [...refs.values()]
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `studio-${selectedScope.id || 'run'}.html`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportMessage.value = manifest.missing.length
      ? `已导出，报告列出 ${manifest.missing.length} 项缺失或未读取记录。`
      : '记录与可读取证据已导出。'
  } catch (error) {
    exportMessage.value = error.message || '导出失败'
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.result-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.result-item {
  border-top: 1px solid var(--sf-border-light);
  padding-bottom: 8px;
}
.result-item header > b {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 10px;
  font-size: 11px;
}
dt {
  color: var(--sf-text-secondary);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.results-panel {
  height: 100%;
  overflow: auto;
  padding: 0 12px 12px;
  background: var(--sf-bg-secondary);
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  font-size: 11px;
}
header > span {
  flex: 1;
}
button {
  padding: 5px 8px;
  border: 1px solid var(--sf-border-light);
  border-radius: 4px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  cursor: pointer;
}
.execution-result,
.task-results article {
  border-top: 1px solid var(--sf-border-light);
  padding: 8px 0;
}
.task-results article > b {
  margin-right: 10px;
}
p,
details,
.stage-results {
  font-size: 11px;
  color: var(--sf-text-secondary);
}
.stage-results {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
summary {
  cursor: pointer;
  margin: 6px 0;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 11px;
}
.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.error {
  color: var(--sf-danger);
}
</style>
