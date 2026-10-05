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
  <div class="agents-view">
    <header class="page-hero">
      <div>
        <p class="eyebrow">AGENT ROSTER</p>
        <h1 class="sf-page-title">Agent 工作台</h1>
        <p class="sf-page-subtitle">
          选择 Agent，查看角色、模型、工具权限与可用技能。Project 绑定进一步限定本项目可用的 Agent
          技能。
        </p>
      </div>
      <div class="hero-stats">
        <div>
          <strong>{{ agents.agents.length }}</strong
          ><span>实例</span>
        </div>
        <div>
          <strong>{{ agents.runningCount }}</strong
          ><span>运行中</span>
        </div>
        <div>
          <strong>{{ modelCount }}</strong
          ><span>模型端点</span>
        </div>
      </div>
      <el-button :loading="refreshing" :icon="Refresh" @click="onRefresh">刷新目录</el-button>
    </header>

    <el-alert
      v-if="agents.error"
      class="error-alert"
      type="error"
      :title="agents.error"
      show-icon
      closable
    />

    <div v-loading="agents.loading" class="agent-workspace">
      <aside class="agent-catalog">
        <div class="panel-heading">
          <span>Team · {{ session.teamName }}</span>
          <span class="poll-hint">30s 自动刷新</span>
        </div>
        <EmptyState
          v-if="!agents.loading && agents.agents.length === 0"
          description="暂无 Team 成员"
        />
        <template v-else>
          <AgentCard
            v-for="agent in agents.agents"
            :key="agent.id"
            :agent="agent"
            :selected="agent.id === selectedId"
            @select="selectedId = agent.id"
          />
        </template>
      </aside>

      <main v-if="selectedAgent" class="agent-detail">
        <section class="detail-identity">
          <span class="role-avatar" :style="{ background: roleColor(selectedAgent.role) }">
            {{ selectedAgent.role?.slice(0, 1).toUpperCase() }}
          </span>
          <div class="identity-copy">
            <div class="identity-title">
              <h2>{{ selectedAgent.id }}</h2>
              <span class="status-pill">
                <i :style="{ background: agentStatusMeta(selectedAgent.status).color }" />
                {{ agentStatusMeta(selectedAgent.status).label }}
              </span>
            </div>
            <p>{{ selectedAgent.description || '该角色暂未提供职责描述。' }}</p>
            <div class="tag-row">
              <el-tag effect="plain">{{ selectedAgent.role }}</el-tag>
              <el-tag effect="plain" type="info">{{ selectedAgent.mode }}</el-tag>
              <el-tag v-if="selectedAgent.default_inherited" effect="plain" type="success">
                继承系统 Default
              </el-tag>
              <el-tag v-if="selectedAgent.long_term_memory" effect="plain" type="success">
                长期记忆
              </el-tag>
            </div>
          </div>
        </section>

        <section class="detail-grid">
          <article class="detail-card model-card">
            <div class="card-title">
              <div>
                <p class="eyebrow">MODEL</p>
                <h3>模型策略</h3>
              </div>
              <el-button text type="primary" @click="ui.openSettings('models')">
                <span>连接模型服务</span>
              </el-button>
            </div>
            <el-form label-position="top" class="model-form">
              <el-form-item label="主模型">
                <el-select
                  v-model="modelDraft.model"
                  filterable
                  placeholder="选择模型端点"
                  @change="markModelDraftDirty"
                >
                  <el-option
                    :label="`继承系统 Default（${inheritedModelLabel}）`"
                    :value="INHERIT_DEFAULT"
                  />
                  <el-option
                    v-for="endpoint in modelEndpoints"
                    :key="endpoint.name"
                    :label="endpointLabel(endpoint)"
                    :value="endpoint.name"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="思考深度">
                <el-select v-model="modelDraft.reasoningEffort" @change="markModelDraftDirty">
                  <el-option label="自动（由当前模型决定）" value="auto" />
                  <el-option label="低" value="low" />
                  <el-option label="中" value="medium" />
                  <el-option label="高" value="high" />
                </el-select>
              </el-form-item>
              <el-form-item label="思考过程">
                <el-select v-model="modelDraft.reasoningVisibility" @change="markModelDraftDirty">
                  <el-option label="自动（展示服务商返回内容）" value="auto" />
                  <el-option label="显示" value="show" />
                  <el-option label="隐藏" value="hide" />
                </el-select>
              </el-form-item>
              <div class="model-actions">
                <span>
                  此处保存 Agent Profile，只影响后续新会话。已有会话使用创建时的模型快照，
                  需要在对话右侧 Agent 面板中显式切换。
                </span>
                <el-button
                  type="primary"
                  :loading="agents.savingModels === selectedAgent.id"
                  :disabled="!modelEndpoints.length"
                  @click="onSaveModels"
                >
                  保存模型策略
                </el-button>
              </div>
            </el-form>
            <dl class="metric-list">
              <div>
                <dt>最大轮次</dt>
                <dd>{{ selectedAgent.max_turns || '--' }}</dd>
              </div>
              <div>
                <dt>上下文预算</dt>
                <dd>{{ formatTokens(selectedAgent.context_tokens) }}</dd>
              </div>
              <div>
                <dt>当前活动</dt>
                <dd>{{ selectedAgent.activity || '--' }}</dd>
              </div>
            </dl>
          </article>

          <article class="detail-card">
            <div class="card-title">
              <div>
                <p class="eyebrow">TOOLS</p>
                <h3>工具访问范围</h3>
              </div>
              <el-tag :type="selectedAgent.tool_search ? 'primary' : 'info'" effect="plain">
                {{ selectedAgent.tool_search ? '动态检索' : '全量直通' }}
              </el-tag>
            </div>
            <div class="capability-section">
              <span class="field-label">命名空间</span>
              <div class="chip-list">
                <code v-for="item in selectedAgent.tool_namespaces || []" :key="item">{{
                  item
                }}</code>
                <span v-if="!selectedAgent.tool_namespaces?.length" class="empty-inline">无</span>
              </div>
            </div>
            <div class="capability-section">
              <span class="field-label">常驻工具</span>
              <div class="chip-list">
                <code v-for="item in selectedAgent.pinned_tools || []" :key="item">{{ item }}</code>
                <span v-if="!selectedAgent.pinned_tools?.length" class="empty-inline">无</span>
              </div>
            </div>
            <div class="capability-section">
              <span class="field-label">人工审批</span>
              <div class="chip-list warning">
                <code v-for="item in selectedAgent.approval_required || []" :key="item">{{
                  item
                }}</code>
                <span v-if="!selectedAgent.approval_required?.length" class="empty-inline">无</span>
              </div>
            </div>
          </article>

          <article class="detail-card skills-card">
            <div class="card-title">
              <div>
                <p class="eyebrow">SKILLS</p>
                <h3>Agent 技能</h3>
              </div>
              <span class="scope-badge">{{ selectedAgent.role }}</span>
            </div>
            <p class="card-description">当前 Agent 可使用的技能。</p>
            <div class="skill-list">
              <span
                v-for="skill in selectedAgent.agent_skill_names || selectedAgent.skill_names || []"
                :key="skill"
                >{{ skill }}</span
              >
              <span
                v-if="!(selectedAgent.agent_skill_names || selectedAgent.skill_names)?.length"
                class="empty-inline"
                >暂无技能</span
              >
            </div>
            <section v-if="selectedAgent.robot_skill_names?.length" class="robot-skills">
              <h4>Robot 执行技能</h4>
              <div class="skill-list">
                <span v-for="skill in selectedAgent.robot_skill_names" :key="skill">{{
                  skill
                }}</span>
              </div>
            </section>
          </article>
        </section>
      </main>

      <EmptyState v-else class="detail-empty" description="选择一个 Agent 查看详情" />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import AgentCard from '@/components/agents/AgentCard.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import { agentStatusMeta, roleColor, useAgentsStore } from '@/stores/agents'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const agents = useAgentsStore()
const session = useSessionStore()
const settings = useSettingsStore()
const ui = useUiStore()
const INHERIT_DEFAULT = '__inherit_system_default__'
const refreshing = ref(false)
const selectedId = ref('')
// modelDraftDirty 防止 30 秒 roster 轮询在用户编辑过程中把草稿覆盖回旧值；
// draftAgentId 用于区分“同一 Agent 刷新”和“用户切换到另一个 Agent”。
const modelDraftDirty = ref(false)
const draftAgentId = ref('')
const modelDraft = reactive({
  model: '',
  reasoningEffort: 'auto',
  reasoningVisibility: 'auto'
})

const selectedAgent = computed(
  () => agents.agents.find((agent) => agent.id === selectedId.value) || agents.agents[0] || null
)
const modelEndpoints = computed(() => settings.providers)
const modelCount = computed(() => modelEndpoints.value.length)
const inheritedModelLabel = computed(() => {
  const endpoint = modelEndpoints.value.find((item) => item.name === settings.defaultProvider)
  return endpoint?.model || endpoint?.name || selectedAgent.value?.model || '未配置'
})

watch(
  () => agents.agents,
  (items) => {
    if (!items.some((item) => item.id === selectedId.value)) selectedId.value = items[0]?.id || ''
  },
  { immediate: true }
)

watch(
  selectedAgent,
  (agent) => {
    const agentChanged = draftAgentId.value !== (agent?.id || '')
    if (!agentChanged && modelDraftDirty.value) return
    syncModelDraft(agent)
  },
  { immediate: true }
)

// syncModelDraft 只用后端 roster 的已保存值重置表单；调用后草稿恢复为干净态。
function syncModelDraft(agent) {
  draftAgentId.value = agent?.id || ''
  modelDraft.model = agent?.default_inherited ? INHERIT_DEFAULT : agent?.model || ''
  modelDraft.reasoningEffort = agent?.reasoning_effort || 'auto'
  modelDraft.reasoningVisibility = agent?.reasoning_visibility || 'auto'
  modelDraftDirty.value = false
}

// markModelDraftDirty 标记用户已经主动修改模型策略，后台轮询不得覆盖草稿。
function markModelDraftDirty() {
  modelDraftDirty.value = true
}

function onVisibilityChange() {
  if (document.hidden) {
    agents.stopPolling()
  } else {
    agents.load({ silent: true }).catch(() => {})
    agents.startPolling()
  }
}

onMounted(async () => {
  try {
    await Promise.all([agents.load(), settings.load()])
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Agent 目录加载失败' })
  }
  agents.startPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  agents.stopPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

async function onRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await agents.load({ silent: true })
  } finally {
    refreshing.value = false
  }
}

async function onSaveModels() {
  if (!selectedAgent.value) return
  const expectedAgentID = selectedAgent.value.id
  const expectedModel = modelDraft.model === INHERIT_DEFAULT ? '' : modelDraft.model
  try {
    await agents.saveModels(expectedAgentID, {
      model: expectedModel,
      reasoning_effort: modelDraft.reasoningEffort,
      reasoning_visibility: modelDraft.reasoningVisibility
    })
    const savedAgent = agents.agents.find((agent) => agent.id === expectedAgentID)
    const inheritedAsExpected = expectedModel === '' && savedAgent?.default_inherited
    if (!inheritedAsExpected && savedAgent?.model !== expectedModel) {
      throw new Error(`保存校验失败：后端当前模型为 ${savedAgent?.model || '未知'}`)
    }
    syncModelDraft(savedAgent)
    ui.notify({
      type: 'success',
      message: inheritedAsExpected
        ? `${expectedAgentID} 的新会话将继承系统 Default`
        : `${expectedAgentID} 的新会话将使用 ${expectedModel}`
    })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '模型策略保存失败' })
  }
}

function endpointLabel(endpoint) {
  return endpoint.service
    ? `${endpoint.model || endpoint.name} · ${endpoint.service}`
    : endpoint.model || endpoint.name
}

function formatTokens(value) {
  if (!value) return '--'
  return value >= 1000 ? `${Math.round(value / 1000)}K tokens` : `${value} tokens`
}
</script>

<style scoped lang="scss">
.agents-view {
  height: 100%;
  padding: 18px;
  overflow: auto;
}

.page-hero {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) auto auto;
  align-items: center;
  gap: 24px;
  margin-bottom: 14px;
  padding: 18px 20px;
  border: 0;
  border-left: 3px solid var(--sf-brand);
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.12em;
}

.hero-stats {
  display: flex;
  align-items: center;

  div {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 0 18px;
    border-left: 1px solid var(--sf-border-light);
  }

  strong {
    color: var(--sf-text-primary);
    font-size: 20px;
  }

  span {
    color: var(--sf-text-disabled);
    font-size: var(--sf-font-xs);
  }
}

.error-alert {
  margin-bottom: 14px;
}

.agent-workspace {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  min-height: 520px;
}

.agent-catalog,
.agent-detail {
  border: 0;
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.agent-catalog {
  padding: 10px;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 12px;
  color: var(--sf-text-primary);
  font-size: var(--sf-font-sm);
  font-weight: 520;
}

.poll-hint {
  color: var(--sf-text-disabled);
  font-size: 11px;
  font-weight: 400;
}

.agent-detail {
  min-width: 0;
  padding: 20px;
}

.detail-identity {
  display: flex;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--sf-border-light);
}

.role-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 12px;
  color: #fff;
  font-size: 19px;
  font-weight: 630;
}

.identity-copy {
  min-width: 0;
  flex: 1;

  p {
    margin: 7px 0 10px;
    color: var(--sf-text-secondary);
    line-height: 1.6;
  }
}

.identity-title,
.card-title,
.tag-row,
.chip-list,
.skill-list {
  display: flex;
  align-items: center;
}

.identity-title {
  gap: 12px;

  h2 {
    margin: 0;
    color: var(--sf-text-primary);
    font-size: var(--sf-font-xl);
  }
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
}

.tag-row,
.chip-list,
.skill-list {
  flex-wrap: wrap;
  gap: 7px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.detail-card {
  min-width: 0;
  padding: 16px;
  border: 0;
  border-radius: 12px;
  background: var(--sf-bg-primary);
}

.card-title {
  justify-content: space-between;
  gap: 12px;

  h3 {
    margin: 0;
    color: var(--sf-text-primary);
    font-size: var(--sf-font-md);
  }
}

.model-form {
  margin-top: 15px;

  :deep(.el-select) {
    width: 100%;
  }
}

.model-card {
  grid-column: 1 / -1;
}

.model-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
    line-height: 1.5;
  }
}

.metric-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;

  div {
    min-width: 0;
    padding: 10px;
    border-radius: 8px;
    background: var(--sf-bg-secondary);
  }

  dt {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }

  dd {
    margin: 5px 0 0;
    overflow: hidden;
    color: var(--sf-text-primary);
    font-size: var(--sf-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.card-description {
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  line-height: 1.6;
}

.capability-section {
  margin-top: 14px;
}

.field-label {
  display: block;
  margin-bottom: 7px;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.chip-list code,
.skill-list span {
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-secondary);
  font-size: 11px;
}

.chip-list.warning code {
  color: var(--sf-warning);
}

.skills-card {
  grid-column: 1 / -1;
}

.scope-badge {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
  font-size: 11px;
}

.empty-inline {
  color: var(--sf-text-disabled) !important;
  background: transparent !important;
}

.detail-empty {
  border: 0;
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
}

@media (max-width: 1050px) {
  .page-hero {
    grid-template-columns: 1fr auto;
  }

  .hero-stats {
    display: none;
  }

  .agent-workspace {
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .skills-card {
    grid-column: auto;
  }
}
</style>
