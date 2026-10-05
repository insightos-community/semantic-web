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
  <section class="plan-document">
    <header>
      <div>
        <span>PLAN PROPOSAL · REVISION {{ proposal?.revision || 0 }}</span>
        <h1>{{ proposal?.goal || '计划文档' }}</h1>
        <p>审阅目标、任务和完成条件。</p>
      </div>
      <el-tag :type="statusMeta.type" effect="plain">{{ statusMeta.label }}</el-tag>
    </header>

    <div v-if="error" class="empty">{{ error }}</div>
    <div v-else-if="!proposal" class="empty">{{ loading ? '正在加载计划…' : '未找到计划' }}</div>
    <template v-else>
      <section class="scope-grid">
        <div>
          <span>批准范围</span>
          <dl v-if="proposal.approved_scope" class="approval-fields">
            <template v-for="(value, key) in proposal.approved_scope" :key="key">
              <dt>{{ scopeFieldLabel(key) }}</dt>
              <dd>
                <div
                  v-if="
                    Array.isArray(value) &&
                    value.every((item) => item === null || typeof item !== 'object')
                  "
                  class="scope-chips"
                >
                  <code v-for="(item, index) in value" :key="index">{{ item }}</code>
                  <span v-if="!value.length">无附加限制</span>
                </div>
                <details v-else-if="value && typeof value === 'object'">
                  <summary>查看详情</summary>
                  <pre>{{ JSON.stringify(value, null, 2) }}</pre>
                </details>
                <span v-else>{{ value }}</span>
              </dd>
            </template>
          </dl>
          <b v-else>{{ scopeLabel }}</b>
        </div>
        <div>
          <span>完成条件</span>
          <b>{{ criteriaLabel }}</b>
        </div>
      </section>

      <!-- Markdown 只用于向用户展示；执行始终读取 proposal.structured_plan。 -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article class="markdown-body" v-html="documentHtml" />

      <section class="todo-section">
        <header>
          <div>
            <span>LEADER TASK TODO</span>
            <h2>批准后逐项推进</h2>
          </div>
          <b>{{ tasks.length }} 项</b>
        </header>
        <div class="todo-list">
          <article v-for="(task, index) in tasks" :key="task.id || index">
            <i class="todo-box" aria-hidden="true" />
            <div>
              <b>{{ task.goal || task.title || task.id }}</b>
              <small>
                {{ task.required_role || '未声明角色' }}
                <template v-if="task.required_capabilities?.length">
                  · {{ task.required_capabilities.join('、') }}
                </template>
              </small>
            </div>
            <span>{{ dependencyLabel(task) }}</span>
          </article>
        </div>
      </section>

      <footer v-if="proposal.status === 'ready'">
        <p>需要调整时，在对话中说明。</p>
        <div>
          <el-button
            v-if="proposal.status === 'ready'"
            type="primary"
            :loading="workflow.action === 'approve'"
            @click="approve"
          >
            批准并执行
          </el-button>
          <el-button
            type="danger"
            plain
            :loading="workflow.action === 'discard_proposal'"
            @click="discard"
          >
            放弃计划
          </el-button>
        </div>
      </footer>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { renderMarkdown } from '@/utils/markdown'
import { openStudioPanel } from '@/studio/panelService'

const workflow = useWorkflowStore()
const scope = useExecutionScopeStore()
const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const error = ref('')
const loading = ref(false)
// 固定页面始终查看自己的 Proposal，切换对话或生成新计划不替换旧页内容。
const proposal = computed(() =>
  props.panelParams.resourceId
    ? workflow.proposalById(props.panelParams.resourceId)
    : workflow.proposal
)
watch(
  () => props.panelParams.resourceId,
  async (id) => {
    if (!id) return
    loading.value = true
    error.value = ''
    try {
      await workflow.loadProposal(id)
    } catch (err) {
      error.value = err.message || '加载计划失败'
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)
const plan = computed(() => proposal.value?.structured_plan || {})
const tasks = computed(() => (Array.isArray(plan.value.tasks) ? plan.value.tasks : []))
const dependencies = computed(() =>
  Array.isArray(plan.value.dependencies) ? plan.value.dependencies : []
)
const documentHtml = computed(() =>
  renderMarkdown(
    (proposal.value?.document_markdown || '').replace(
      /```json\s*\n([\s\S]*?)\n```/g,
      (block, json) => {
        try {
          return '```json\n' + JSON.stringify(JSON.parse(json), null, 2) + '\n```'
        } catch {
          return block
        }
      }
    )
  )
)
const scopeLabel = computed(() =>
  valueLabel(proposal.value?.approved_scope?.constraints, '无附加约束')
)
const criteriaLabel = computed(() =>
  valueLabel(plan.value.completion_criteria, '由 Task 完成条件汇总')
)
const scopeFieldLabel = (key) =>
  ({
    robot_ids: '机器人',
    allowed_skills: '允许技能',
    objects: '搬运对象',
    constraints: '附加约束',
    regions: '目标区域',
    robot_models: '机器人型号',
    backends: '执行后端'
  })[key] || key
const statusMeta = computed(
  () =>
    ({
      ready: { label: '待批准', type: 'primary' },
      approved: { label: '已批准', type: 'success' },
      discarded: { label: '已放弃', type: 'info' }
    })[proposal.value?.status] || { label: '未知', type: 'info' }
)

function valueLabel(value, fallback) {
  if (Array.isArray(value)) return value.length ? value.join('；') : fallback
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`)
    return entries.length ? entries.join('；') : fallback
  }
  return value ? String(value) : fallback
}

function dependencyLabel(task) {
  const ids = dependencies.value
    .filter((edge) => (edge.task_id || edge.to) === task.id)
    .map((edge) => edge.depends_on_task_id || edge.depends_on || edge.from)
    .filter(Boolean)
  return ids.length ? `依赖 ${ids.join('、')}` : '可直接开始'
}

async function approve() {
  try {
    const started = await workflow.approveProposal(proposal.value)
    if (started) {
      scope.followCurrent()
      openStudioPanel('activity')
    }
  } catch (err) {
    error.value = err.message || '批准计划失败'
  }
}

async function discard() {
  try {
    await workflow.discardProposal(proposal.value)
  } catch (err) {
    error.value = err.message || '放弃计划失败'
  }
}
</script>

<style scoped lang="scss">
.plan-document {
  box-sizing: border-box;
  min-width: 0;
  overflow-wrap: anywhere;
  height: 100%;
  overflow: auto;
  padding: 24px clamp(16px, 2vw, 32px) 48px;
  background: var(--sf-bg-primary);
}
.markdown-body :deep(pre) {
  max-width: 100%;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.markdown-body :deep(code) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.markdown-body :deep(table) {
  display: block;
  overflow: auto;
  max-width: 100%;
}

.plan-document > header,
.todo-section > header,
.plan-document > footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.plan-document > header span,
.todo-section header span {
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.1em;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  margin-top: 5px;
  color: var(--sf-text-primary);
  font-size: 26px;
}

.plan-document > header p,
.plan-document > footer p {
  margin-top: 7px;
  color: var(--sf-text-secondary);
}

.scope-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  margin: 24px 0;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
}
.approval-fields {
  margin: 0;
  min-width: 0;
}
.approval-fields dt {
  color: var(--sf-text-secondary);
  margin: 10px 0 5px;
  font-size: 12px;
}
.approval-fields dd {
  margin: 0;
  min-width: 0;
  font-size: 12px;
}
.approval-fields pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.scope-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.scope-chips code {
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--sf-bg-tertiary);
  overflow-wrap: anywhere;
}
.markdown-body :deep(h1) {
  font-size: 24px;
  line-height: 1.5;
}

.scope-grid > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 16px 18px;
  border-right: 1px solid var(--sf-border-light);

  &:last-child {
    border-right: none;
  }
  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
  b {
    color: var(--sf-text-primary);
    font-size: 12px;
    line-height: 1.6;
  }
}

.markdown-body,
.todo-section {
  padding: 22px 24px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-secondary);
}

.todo-section {
  margin-top: 18px;
}
.todo-section h2 {
  margin-top: 4px;
  font-size: 17px;
}
.todo-list {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}
.todo-list article {
  display: grid;
  align-items: center;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-tertiary);
}
.todo-box {
  width: 13px;
  height: 13px;
  border: 1px solid var(--sf-border-strong);
  border-radius: 4px;
}
.todo-list article div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.todo-list article small,
.todo-list article > span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.plan-document > footer {
  align-items: center;
  margin-top: 18px;
}
.plan-document > footer > div {
  display: flex;
  gap: 8px;
}
.empty {
  padding: 60px;
  color: var(--sf-text-disabled);
  text-align: center;
}
</style>
