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
  <section class="problems-panel">
    <header>
      <button v-if="sourceTab" type="button" @click="returnToSource">返回来源</button><b>问题定位</b
      ><span>执行异常、待决策问题与安全停止状态</span>
    </header>
    <p v-if="!problems.length" class="empty">已读取记录中没有发现问题。</p>
    <article
      v-for="problem in problems"
      :key="problem.id"
      class="problem-row"
      :data-level="problem.level"
    >
      <header>
        <b>{{ problem.message }}</b
        ><span v-if="problem.count > 1">重复 {{ problem.count }} 次</span>
      </header>
      <p>
        {{ executionName(problem)
        }}<template v-if="problem.stage"> · {{ stageTitle({ name: problem.stage }) }}</template>
      </p>
      <p class="location-title">{{ locationTitle(problem) }}</p>
      <details class="location">
        <summary>运行标识</summary>
        <p>
          {{ problem.workflowId || '独立运行' }} / {{ problem.taskId || 'Agent 请求' }} /
          {{ problem.subtaskId || problem.executionId || problem.runId }}
        </p>
      </details>
      <el-tag size="small" :type="problem.resolution === 'recovered' ? 'success' : 'warning'">
        {{ problem.resolutionLabel || '待确认' }}
      </el-tag>
      <details v-if="problem.recovery?.length" class="recovery-history" open>
        <summary>后续处置与验证</summary>
        <ol>
          <li v-for="record in problem.recovery" :key="record.id">
            <time>{{ new Date(record.at).toLocaleTimeString() }}</time
            ><el-button text size="small" @click="showLogs(record)">{{ record.message }}</el-button>
          </li>
        </ol>
      </details>
      <details>
        <summary>原始错误</summary>
        <pre>{{ recordText(problem.details) }}</pre>
      </details>
      <div class="actions">
        <el-button size="small" :icon="Tickets" @click="showLogs(problem)">查看相关日志</el-button
        ><el-button v-if="problem.executionId" size="small" :icon="Aim" @click="showStage(problem)">
          定位阶段与图片
        </el-button>
      </div>
    </article>
    <p v-if="pendingPages.length" class="empty">
      仍有未读取的执行日志；加载后可继续检查更晚发生的问题。
    </p>
  </section>
</template>

<script setup>
import { useExecutionEvidence } from '@/studio/executionEvidence'
import { recordText } from '@/robot/executionRecords'
import { stageTitle } from '@/robot/stagePresentation'
import { Tickets, Aim } from '@element-plus/icons-vue'

const { executions, tasks, problems, pendingPages, sourceTab, locateRecord, returnToSource } =
  useExecutionEvidence()
function locationTitle(problem) {
  for (const [index, task] of tasks.value.entries()) {
    const subtask = task.subtasks.find((step) =>
      step.executions.some((execution) => execution.id === problem.executionId)
    )
    if (subtask) return `Task ${index + 1} · ${task.title} → ${subtask.title}`
  }
  return problem.executionId ? '独立 Robot 执行' : 'Agent 请求'
}
const executionName = (problem) =>
  executions.value.find((item) => item.id === problem.executionId)?.skill_name || 'Agent 请求'
function showLogs(problem) {
  locateRecord(problem, 'problems', 'logs')
}
function showStage(problem) {
  locateRecord(problem, 'problems')
}
</script>

<style scoped>
.location {
  overflow-wrap: anywhere;
}
.recovery-history {
  margin: 12px 0;
}
.recovery-history ol {
  padding-left: 20px;
}
.recovery-history li {
  margin: 4px 0;
}
.recovery-history .el-button {
  white-space: normal;
  height: auto;
  text-align: left;
}
.problems-panel {
  height: 100%;
  overflow: auto;
  background: var(--sf-bg-secondary);
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  font-size: 11px;
}
header span,
.problem-row p,
.empty {
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.problem-row {
  padding: 10px 12px;
  border-top: 1px solid var(--sf-border-light);
}
.problem-row header {
  padding: 0;
  color: var(--sf-danger);
}
.problem-row[data-level='warning'] header {
  color: var(--sf-warning);
}
summary {
  cursor: pointer;
  font-size: 11px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 11px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.problems-panel > header > button {
  border: 1px solid var(--sf-border-light);
  border-radius: 4px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  padding: 5px 8px;
  cursor: pointer;
}
.problem-row :deep(.artifact-resource-card) {
  max-width: 360px;
}
.empty {
  padding: 10px 12px;
}
</style>
