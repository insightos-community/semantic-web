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
  <aside class="workbench-inspector">
    <header class="inspector-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.count">{{ tab.count }}</span>
      </button>
    </header>

    <div v-if="activeTab === 'runtime'" class="inspector-scroll">
      <section class="summary-grid">
        <div>
          <strong>{{ runState.label }}</strong
          ><span>运行状态</span>
        </div>
        <div>
          <strong>{{ toolCalls.length }}</strong
          ><span>工具调用</span>
        </div>
        <div>
          <strong>{{ delegations.length }}</strong
          ><span>Agent 委派</span>
        </div>
        <div>
          <strong>{{ totalTokens }}</strong
          ><span>Tokens</span>
        </div>
      </section>

      <section class="inspector-section">
        <header>
          <span>当前运行</span><i class="sf-status-dot" :data-status="runState.dot" />
        </header>
        <div class="property-list">
          <div>
            <span>会话</span><b>{{ chat.currentSession?.title || '未选择' }}</b>
          </div>
          <div>
            <span>主 Agent</span><b>{{ currentAgent?.id || 'leader' }}</b>
          </div>
          <div>
            <span>Agent 配置</span><b>{{ currentAgent?.model || '未配置' }}</b>
          </div>
          <div>
            <span>{{ actualModelLabel }}</span>
            <b :class="{ 'is-fallback': latestModel?.fallback }">{{ actualModel }}</b>
          </div>
          <div>
            <span>推理策略</span><b>{{ reasoningPolicy }}</b>
          </div>
        </div>
      </section>

      <section class="inspector-section execution-section">
        <header>
          <span>执行权限</span>
          <small>{{ executionStatus }}</small>
        </header>
        <label class="execution-control">
          <span>审批模式</span>
          <el-select
            :model-value="execution.mode"
            size="small"
            :disabled="executionDisabled"
            @change="onExecutionModeChange"
          >
            <el-option label="逐次询问" value="ask" />
            <el-option label="沙箱自动" value="auto" />
            <el-option label="完全访问" value="full" />
          </el-select>
        </label>
        <label class="execution-control">
          <span>宿主执行</span>
          <el-switch
            :model-value="execution.host_execution_enabled"
            :disabled="executionDisabled || !execution.host_execution_allowed"
            inline-prompt
            active-text="开"
            inactive-text="关"
            @change="onHostExecutionChange"
          />
        </label>
        <p class="execution-help">
          {{ executionHelp }}
        </p>
      </section>

      <section class="inspector-section">
        <header><span>执行活动</span><small>按归属记录</small></header>
        <div v-if="recentActivity.length === 0" class="empty-note">本会话尚无工具或委派活动</div>
        <div v-for="item in recentActivity" :key="item.id" class="activity-item">
          <i :class="`kind-${item.kind}`" />
          <div>
            <b>{{ item.name }}</b
            ><span>{{ item.owner }} · {{ item.status }}</span>
          </div>
        </div>
      </section>

      <section v-if="chat.alerts.length" class="inspector-section">
        <header>
          <span>最近告警</span><small>{{ chat.alerts.length }}</small>
        </header>
        <div
          v-for="alert in chat.alerts.slice(0, 5)"
          :key="alert.id"
          class="alert-item"
          :class="`is-${alert.importance}`"
        >
          <b>{{ alert.agentName }}</b
          ><span>{{ alert.text }}</span>
        </div>
      </section>
    </div>

    <div v-else-if="activeTab === 'agents'" class="inspector-scroll">
      <section class="inspector-section agents-section">
        <header>
          <span>Agent 状态</span><small>{{ agents.agents.length }} 个实例</small>
        </header>
        <div v-if="agents.agents.length === 0" class="empty-note">当前为单 Leader 模式</div>
        <div v-for="agent in agents.agents" :key="agent.id" class="agent-card">
          <span class="agent-avatar" :style="{ '--agent-color': roleColor(agent.role) }">
            {{ agent.id.slice(0, 1).toUpperCase() }}
          </span>
          <div class="agent-copy">
            <b>{{ agent.id }}</b>
            <span
              >{{ agent.role }} ·
              {{ sessionModel(agent.id)?.model || agent.model || '未配置模型' }}</span
            >
            <small>{{ modelSourceLabel(sessionModel(agent.id)) }}</small>
          </div>
          <span class="agent-status"
            ><i :style="{ background: statusMeta(agent.status).color }" />{{
              statusMeta(agent.status).label
            }}</span
          >
          <div class="agent-model-control">
            <el-select
              :model-value="sessionModel(agent.id)?.endpoint_id || agent.model || ''"
              size="small"
              filterable
              :disabled="
                !chat.currentSessionId ||
                sessionModel(agent.id)?.busy ||
                agents.savingSessionAgent === agent.id
              "
              @change="onSessionModelChange(agent.id, $event)"
            >
              <el-option
                v-for="endpoint in settings.providers"
                :key="endpoint.name"
                :label="endpointLabel(endpoint)"
                :value="endpoint.name"
              />
            </el-select>
            <el-select
              :model-value="sessionModel(agent.id)?.reasoning_effort || 'auto'"
              size="small"
              :disabled="
                !chat.currentSessionId ||
                sessionModel(agent.id)?.busy ||
                !sessionModel(agent.id)?.supports_reasoning_effort ||
                agents.savingSessionAgent === agent.id
              "
              @change="onSessionEffortChange(agent.id, $event)"
            >
              <el-option label="自动" value="auto" />
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
            </el-select>
          </div>
        </div>
      </section>
      <p class="boundary-note">
        会话模型是创建时快照。切换只在当前会话空闲时生效，不会修改 Agent Profile 或其他会话。
      </p>
    </div>

    <div v-else class="inspector-scroll">
      <section class="inspector-section">
        <header>
          <span>Artifact</span>
          <el-button text size="small" :loading="artifactStore.loading" @click="loadArtifacts">
            刷新
          </el-button>
        </header>
        <div class="artifact-register">
          <el-input
            v-model="artifactPath"
            size="small"
            placeholder="工作区相对路径，如 .semantic-output/report.json"
            @keydown.enter.prevent="registerArtifact"
          />
          <el-input v-model="artifactSummary" size="small" placeholder="摘要（可选）" />
          <el-button
            size="small"
            type="primary"
            :loading="artifactStore.registering"
            :disabled="!artifactPath.trim() || !chat.currentSession?.project_id"
            @click="registerArtifact"
          >
            登记文件
          </el-button>
        </div>
        <div v-if="artifactStore.items.length === 0" class="empty-note">
          图片上传或工作区文件显式登记后，会在这里形成稳定引用
        </div>
        <ArtifactCard
          v-for="artifact in artifacts"
          :key="artifact.id"
          :artifact="artifact"
          :deleting="artifactStore.deletingId === artifact.id"
          @delete="deleteArtifact(artifact)"
        />
      </section>
      <p class="boundary-note">
        普通命令输出仍留在 Project workspace；只有需要进入对话、跨 Agent/会话使用或长期保存时才登记
        Artifact。
      </p>
    </div>
  </aside>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { agentStatusMeta, roleColor, useAgentsStore } from '@/stores/agents'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import { useArtifactsStore } from '@/stores/artifacts'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useRunsStore } from '@/stores/runs'

const chat = useChatStore()
const agents = useAgentsStore()
const settings = useSettingsStore()
const ui = useUiStore()
const artifactStore = useArtifactsStore()
const runs = useRunsStore()
const activeTab = ref('runtime')
const artifactPath = ref('')
const artifactSummary = ref('')
const statusMeta = agentStatusMeta

const assistantMessages = computed(() => chat.messages.filter((item) => item.role === 'assistant'))
const toolCalls = computed(() => assistantMessages.value.flatMap((item) => item.toolCalls || []))
const delegations = computed(() =>
  assistantMessages.value.flatMap((item) => item.delegations || [])
)
const artifacts = computed(() => artifactStore.items)
const totalTokens = computed(() =>
  assistantMessages.value.reduce((sum, item) => sum + Number(item.usage?.total_tokens || 0), 0)
)
const currentAgent = computed(
  () => agents.agents.find((item) => item.id === 'leader') || agents.agents[0] || null
)
const latestAssistant = computed(() => assistantMessages.value.at(-1) || null)
const activeRun = computed(() => runs.activeForConversation(chat.currentSessionId))
const latestModel = computed(() => latestAssistant.value?.modelResolution || null)
const actualModelLabel = computed(() => (activeRun.value ? '本轮实际模型' : '最近实际模型'))
const actualModel = computed(() => {
  if (!latestModel.value) return activeRun.value ? '等待模型响应' : '尚无运行记录'
  const name = latestModel.value.resolved_model || latestModel.value.resolved_endpoint || '未知'
  return latestModel.value.fallback ? `${name}（已回退）` : name
})
const reasoningPolicy = computed(() => {
  const policy = latestAssistant.value?.reasoningPolicy
  if (!policy?.effort && !policy?.visibility) return '自动'
  return `${policy.effort || '继承'} / ${policy.visibility || '继承'}`
})
const execution = computed(
  () =>
    chat.currentExecution || {
      mode: 'ask',
      host_execution_enabled: false,
      host_execution_allowed: false,
      busy: false
    }
)
const executionDisabled = computed(
  () =>
    !chat.currentSessionId ||
    execution.value.busy ||
    Boolean(activeRun.value) ||
    chat.executionSavingSession === chat.currentSessionId
)
const executionStatus = computed(() => {
  if (chat.executionLoadingSession === chat.currentSessionId) return '读取中'
  if (chat.executionSavingSession === chat.currentSessionId) return '保存中'
  if (executionDisabled.value && chat.currentSessionId) return '运行中锁定'
  return execution.value.host_execution_allowed ? 'Server 已允许宿主' : 'Server 仅允许沙箱'
})
const executionHelp = computed(() => {
  if (!execution.value.host_execution_allowed) {
    return 'Server 未开启宿主执行；当前会话只能使用 Docker 沙箱。'
  }
  if (execution.value.mode === 'ask') return 'Docker 与宿主命令均会先请求批准。'
  if (execution.value.mode === 'auto') return 'Docker 自动执行，宿主命令仍会请求批准。'
  return '本会话跳过普通执行审批；宿主执行仍需单独开启。'
})
const runState = computed(() => {
  if (!chat.currentSessionId) return { label: '未选择', dot: 'idle' }
  if (activeRun.value) {
    const meta = {
      queued: ['排队中', 'starting'],
      running: ['运行中', 'warning'],
      waiting_input: ['等待输入', 'warning'],
      cancelling: ['停止中', 'danger']
    }[activeRun.value.status]
    return { label: meta?.[0] || activeRun.value.status, dot: meta?.[1] || 'warning' }
  }
  return { label: '待命', dot: 'success' }
})
const recentActivity = computed(() => {
  const tools = toolCalls.value.map((item) => ({
    id: `tool-${item.id || item.name}`,
    kind: 'tool',
    name: item.name,
    owner: item.agentName || 'Leader',
    status: item.status === 'running' ? '运行中' : '完成'
  }))
  const agents = delegations.value.map((item) => ({
    id: `agent-${item.id}`,
    kind: 'agent',
    name: item.agentName || 'SubAgent',
    owner: 'Leader 委派',
    status: item.status === 'running' ? '运行中' : '完成'
  }))
  return [...tools, ...agents].slice(-8).reverse()
})
const tabs = computed(() => [
  { id: 'runtime', label: '运行', count: recentActivity.value.length },
  { id: 'agents', label: 'Agent', count: agents.agents.length },
  { id: 'artifacts', label: 'Artifact', count: artifacts.value.length }
])

onMounted(() => {
  if (!settings.config) settings.load().catch(() => {})
})

// 检查器跟随会话读取执行策略；加载失败只影响权限卡，不阻塞消息历史和 WS。
watch(
  () => chat.currentSessionId,
  async (sessionId) => {
    if (!sessionId) return
    try {
      await chat.loadSessionExecution(sessionId)
    } catch (error) {
      ui.notify({ type: 'warning', message: error.message || '会话执行策略读取失败' })
    }
  },
  { immediate: true }
)

watch(activeTab, (tab) => {
  if (tab === 'artifacts') loadArtifacts()
})

function sessionModel(agentId) {
  return (agents.sessionAgents[chat.currentSessionId] || []).find(
    (item) => item.agent_id === agentId
  )
}

function modelSourceLabel(model) {
  if (!model) return '等待会话快照'
  if (model.source === 'session_override') return `${model.endpoint_id} · 当前会话覆盖`
  if (model.default_inherited) return `${model.endpoint_id} · 系统 Default 快照`
  return `${model.endpoint_id} · Agent Profile 快照`
}

function endpointLabel(endpoint) {
  return endpoint.service
    ? `${endpoint.model || endpoint.name} · ${endpoint.service}`
    : endpoint.model || endpoint.name
}

async function onSessionModelChange(agentId, endpointId) {
  const current = sessionModel(agentId)
  if (!endpointId || endpointId === current?.endpoint_id) return
  const target = settings.providers.find((item) => item.name === endpointId)
  const supportsEffort = target?.capabilities?.includes('reasoning_effort')
  const effort = current?.reasoning_effort || 'auto'
  await confirmAndSaveSessionModel(
    agentId,
    endpointId,
    supportsEffort ? effort : 'auto',
    !supportsEffort && effort !== 'auto'
  )
}

async function onSessionEffortChange(agentId, effort) {
  const current = sessionModel(agentId)
  if (!current?.endpoint_id || effort === current.reasoning_effort) return
  await confirmAndSaveSessionModel(agentId, current.endpoint_id, effort, false)
}

// full 是当前会话的显式高权限选择；即使 Server 允许宿主执行，也必须由用户
// 在本会话再次确认，且不会跨会话继承。
async function onExecutionModeChange(mode) {
  if (!chat.currentSessionId || mode === execution.value.mode) return
  if (mode === 'full') {
    try {
      await ElMessageBox.confirm(
        '完全访问会跳过当前会话中的普通执行审批，但不会突破 Server 宿主硬开关。是否继续？',
        '开启完全访问',
        { type: 'warning', confirmButtonText: '仅本会话开启', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }
  await saveExecution(mode, execution.value.host_execution_enabled)
}

async function onHostExecutionChange(enabled) {
  if (!chat.currentSessionId || enabled === execution.value.host_execution_enabled) return
  if (enabled) {
    try {
      await ElMessageBox.confirm(
        '宿主执行可直接访问当前 Project workspace，并使用本机工具链。该授权仅对当前会话生效。',
        '开启宿主执行',
        { type: 'warning', confirmButtonText: '仅本会话开启', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }
  await saveExecution(execution.value.mode, enabled)
}

async function saveExecution(mode, enabled) {
  try {
    await chat.saveSessionExecution(chat.currentSessionId, { mode, enabled })
    ui.notify({ type: 'success', message: '当前会话执行策略已更新' })
  } catch (error) {
    const message =
      error.code === 'SESSION_BUSY'
        ? '当前会话仍在运行，结束后才能修改执行策略'
        : error.message || '执行策略更新失败'
    ui.notify({ type: 'error', message })
    await chat.loadSessionExecution(chat.currentSessionId).catch(() => {})
  }
}

async function loadArtifacts() {
  try {
    await artifactStore.load()
  } catch (error) {
    ui.notify({ type: 'warning', message: error.message || 'Artifact 列表加载失败' })
  }
}

async function registerArtifact() {
  const projectId = chat.currentSession?.project_id
  const path = artifactPath.value.trim()
  if (!projectId || !path) return
  try {
    const artifact = await artifactStore.register({
      projectId,
      path,
      summary: artifactSummary.value.trim()
    })
    if (artifact) {
      artifactPath.value = ''
      artifactSummary.value = ''
      ui.notify({ type: 'success', message: '工作区文件已登记为 Artifact' })
    }
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Artifact 登记失败' })
  }
}

async function deleteArtifact(artifact) {
  try {
    await ElMessageBox.confirm(
      `确定删除“${artifact.summary || artifact.id}”吗？`,
      '删除 Artifact',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await artifactStore.remove(artifact.id)
    ui.notify({ type: 'success', message: 'Artifact 已删除' })
  } catch (error) {
    if (error.code !== 'ARTIFACT_REFERENCED') {
      ui.notify({ type: 'error', message: error.message || 'Artifact 删除失败' })
      return
    }
    try {
      await ElMessageBox.confirm(
        `${error.message}。强制删除后，历史消息会保留引用并显示文件缺失。`,
        'Artifact 正在被引用',
        { type: 'error', confirmButtonText: '强制删除本体', cancelButtonText: '保留' }
      )
      await artifactStore.remove(artifact.id, { force: true })
      ui.notify({ type: 'success', message: 'Artifact 本体已强制删除，历史引用已保留' })
    } catch (confirmError) {
      // 用户取消确认不需要错误提示；真正的第二次请求失败仍应告知。
      if (confirmError instanceof Error) {
        ui.notify({ type: 'error', message: confirmError.message || 'Artifact 强制删除失败' })
      }
    }
  }
}

// 有历史时先明确告知用户：跨模型切换继续复用同一历史，但新模型需要在
// 下一轮重新读取上下文；不支持原 effort 的端点会显式恢复 auto。
async function confirmAndSaveSessionModel(agentId, endpointId, effort, effortReset) {
  if (!chat.currentSessionId) return
  if (chat.messages.length > 0) {
    const extra = effortReset ? '目标端点不支持当前思考档位，将恢复为自动。' : ''
    try {
      await ElMessageBox.confirm(
        `新配置从下一轮生效，并继续使用当前历史。新模型会重新读取上下文。${extra}`,
        '切换会话模型',
        { type: 'warning', confirmButtonText: '继续切换', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }
  try {
    await agents.saveSessionAgentModel(chat.currentSessionId, agentId, endpointId, effort)
    ui.notify({ type: 'success', message: `${agentId} 的会话模型已更新` })
  } catch (error) {
    const message =
      error.code === 'SESSION_BUSY'
        ? '当前会话仍在运行，请等待模型或工具调用结束后再切换'
        : error.message || '会话模型切换失败'
    ui.notify({ type: 'error', message })
    await agents.loadSessionAgents(chat.currentSessionId).catch(() => {})
  }
}
</script>

<style scoped lang="scss">
.workbench-inspector {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.inspector-tabs {
  display: flex;
  height: 48px;
  flex: none;
  padding: 0 10px;
  border-bottom: 1px solid var(--sf-border-light);

  button {
    position: relative;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: var(--sf-text-disabled);
    font-size: var(--sf-font-xs);
    cursor: pointer;

    &.active {
      color: var(--sf-text-primary);

      &::after {
        position: absolute;
        right: 9px;
        bottom: -1px;
        left: 9px;
        height: 2px;
        background: var(--sf-brand);
        content: '';
      }
    }

    span {
      margin-left: 3px;
      color: var(--sf-text-disabled);
    }
  }
}

.inspector-scroll {
  min-height: 0;
  overflow-y: auto;
}

.execution-section {
  .execution-control {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: var(--sf-space-3);

    > span {
      color: var(--sf-text-secondary);
      font-size: var(--sf-font-xs);
    }

    :deep(.el-select) {
      width: 132px;
    }
  }

  .execution-help {
    margin: 8px 0 0;
    color: var(--sf-text-disabled);
    font-size: 11px;
    line-height: 1.55;
  }
}

.artifact-register {
  display: grid;
  gap: 7px;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 9px;
  background: var(--sf-bg-tertiary);
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  padding: 1px;
  background: var(--sf-border-light);

  div {
    display: flex;
    min-height: 70px;
    flex-direction: column;
    justify-content: center;
    padding: 12px;
    background: var(--sf-bg-secondary);
  }

  strong {
    color: var(--sf-text-primary);
    font-size: 18px;
  }
  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.inspector-section {
  padding: 14px;
  border-bottom: 1px solid var(--sf-border-light);

  > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 11px;
    color: var(--sf-text-primary);
    font-size: var(--sf-font-sm);

    small {
      color: var(--sf-text-disabled);
      font-size: 10px;
    }
  }
}

.property-list {
  display: grid;
  gap: 8px;

  div {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 8px;
    font-size: 11px;
  }
  span {
    color: var(--sf-text-disabled);
  }
  b {
    overflow: hidden;
    color: var(--sf-text-secondary);
    font-weight: 380;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.property-list .is-fallback {
  color: var(--sf-warning);
}

.activity-item,
.agent-card,
.artifact-card {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 0;
}

.activity-item {
  i {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--sf-brand);
  }
  i.kind-agent {
    background: var(--sf-role-monitor);
  }
  div {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }
  b {
    overflow: hidden;
    color: var(--sf-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  span {
    color: var(--sf-text-disabled);
    font-size: 10px;
  }
}

.agent-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: color-mix(in srgb, var(--agent-color) 14%, transparent);
  color: var(--agent-color);
  font-size: 11px;
  font-weight: 380;
}

.agent-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  b {
    color: var(--sf-text-primary);
    font-size: 11px;
  }
  span {
    overflow: hidden;
    color: var(--sf-text-disabled);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    overflow: hidden;
    color: var(--sf-text-disabled);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.agent-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sf-text-disabled);
  font-size: 10px;
  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
}

.agent-card {
  flex-wrap: wrap;
}

.agent-model-control {
  display: grid;
  width: calc(100% - 39px);
  grid-template-columns: minmax(0, 1fr) 78px;
  gap: 6px;
  margin-left: 39px;

  :deep(.el-select) {
    min-width: 0;
  }
}

.artifact-card {
  color: inherit;
  text-decoration: none;
  img {
    width: 46px;
    height: 38px;
    border-radius: 7px;
    object-fit: cover;
    background: var(--sf-bg-tertiary);
  }
  > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }
  b {
    overflow: hidden;
    color: var(--sf-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    color: var(--sf-text-disabled);
    font-size: 10px;
  }
}

.alert-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 0;
  b {
    color: var(--sf-warning);
    font-size: 10px;
  }
  span {
    color: var(--sf-text-secondary);
    font-size: 11px;
  }

  &.is-critical {
    padding-left: 8px;
    border-left: 2px solid var(--sf-danger);
  }
  &.is-normal {
    padding-left: 8px;
    border-left: 2px solid var(--sf-warning);
  }
  &.is-low {
    padding-left: 8px;
    border-left: 2px solid var(--sf-info);
  }
}

.empty-note,
.boundary-note {
  color: var(--sf-text-disabled);
  font-size: 11px;
  line-height: 1.55;
}

.boundary-note {
  margin: 12px 14px;
  padding: 10px;
  border: 1px dashed var(--sf-border);
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
}
</style>
