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
  <aside class="primary-sidebar" data-testid="studio-primary-sidebar">
    <header class="sidebar-header">
      <strong>{{ viewMeta.title }}</strong>
      <el-tooltip content="关闭主侧栏" effect="dark" :show-after="500" placement="bottom">
        <button type="button" aria-label="关闭主侧栏" @click="$emit('close')">
          <Close />
        </button>
      </el-tooltip>
    </header>

    <div class="sidebar-content">
      <template v-if="view === 'explorer'">
        <section class="project-card">
          <span>项目</span>
          <strong>{{ project.currentProject?.name || '未选择 Project' }}</strong>
          <small>{{ project.currentProject?.mode === 'running' ? '运行模式' : '开发模式' }}</small>
          <el-button :disabled="!project.currentProject?.id" @click="showImports = true">
            <span>导入项目内容</span>
          </el-button>
        </section>
        <ProjectImportDialog
          v-model="showImports"
          :project-id="project.currentProject?.id || ''"
          :editable="project.currentProject?.mode === 'development'"
          @imported="simulation.refreshSceneResources()"
        />
        <section class="sidebar-section project-setup">
          <h3>运行准备</h3>
          <button
            class="nav-row"
            type="button"
            @click="openEditor('scene-workspace', { viewMode: 'setup' })"
          >
            <Monitor />
            <span
              ><b>场景与 Layout</b><small>{{ projectSceneLabel }}</small></span
            >
            <ArrowRight />
          </button>
          <button class="nav-row" type="button" @click="ui.openSettings('simulation')">
            <Tools />
            <span
              ><b>运行环境</b><small>{{ runtimeLabel }}</small></span
            >
            <ArrowRight />
          </button>
          <button class="nav-row" type="button" @click="ui.openSettings('models')">
            <Cpu />
            <span><b>模型服务</b><small>连接与模型选择</small></span>
            <ArrowRight />
          </button>
        </section>
        <section class="sidebar-section">
          <div class="section-heading"><h3>项目 Robot</h3></div>
          <button
            v-for="robot in projectRobots"
            :key="robot.robot_id"
            class="nav-row"
            type="button"
            @click="openRobot(robot)"
          >
            <Cpu /><span
              ><b>{{ robot.display_name || robot.robot_id }}</b
              ><small class="robot-status-line"
                ><DeviceStatus :status="robot.pilot?.status || 'not_reported'" /> ·
                <DeviceStatus :status="robot.status || 'not_reported'" /></small></span
            ><ArrowRight />
          </button>
          <button
            v-if="!projectRobots.length"
            class="nav-row"
            type="button"
            @click="layout.selectPrimary('robots')"
          >
            <Cpu /><span><b>连接设备</b><small>查看可用 Robot</small></span
            ><ArrowRight />
          </button>
        </section>
        <ProjectAgentSkillResources compact />
        <section class="project-resources">
          <h3>项目资料</h3>
          <section class="sidebar-section project-resource-links">
            <button
              class="nav-row"
              type="button"
              @click="openEditor('memory')"
              @dblclick="openEditor('memory', { preview: false })"
            >
              <Document />
              <span><b>Project Memory</b><small>项目说明与长期信息</small></span>
              <ArrowRight />
            </button>
            <button class="nav-row" type="button" @click="openBottom('artifacts')">
              <FolderOpened />
              <span><b>运行文件与证据</b><small>查看所选运行的结果</small></span>
              <ArrowRight />
            </button>
          </section>
        </section>
      </template>

      <template v-else-if="view === 'scene'">
        <ProjectSimulationSceneResources />
      </template>

      <template v-else-if="view === 'conversation'">
        <section class="sidebar-section conversation-section">
          <div class="section-heading">
            <h3>会话</h3>
            <el-tooltip
              content="新建 Conversation"
              effect="dark"
              :show-after="500"
              placement="bottom"
            >
              <button type="button" @click="createConversation">
                <Plus />
              </button>
            </el-tooltip>
          </div>
          <div class="conversation-filter" role="tablist" aria-label="Conversation 列表范围">
            <button
              type="button"
              role="tab"
              :aria-selected="conversationScope === 'active'"
              :class="{ active: conversationScope === 'active' }"
              @click="switchConversationScope('active')"
            >
              进行中 {{ conversation.items.length }}
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="conversationScope === 'archived'"
              :class="{ active: conversationScope === 'archived' }"
              @click="switchConversationScope('archived')"
            >
              已归档 {{ conversation.archivedItems.length }}
            </button>
          </div>
          <div v-for="item in visibleConversations" :key="item.id" class="conversation-item">
            <button
              type="button"
              class="conversation-row"
              :class="{ active: item.id === conversation.currentId, archived: item.archived_at }"
              @click="selectConversation(item)"
            >
              <ChatDotRound />
              <span>
                <b>{{ item.title || '未命名 Conversation' }}</b>
                <small>
                  {{
                    item.archived_at
                      ? `归档于 ${formatTime(item.archived_at)}`
                      : formatTime(item.updated_at)
                  }}
                </small>
              </span>
            </button>
            <el-tooltip
              v-if="conversationScope === 'active'"
              :content="`归档 ${item.title || 'Conversation'}`"
              effect="dark"
              :show-after="500"
              placement="left"
            >
              <button
                type="button"
                class="conversation-action"
                :aria-label="`归档 ${item.title || 'Conversation'}`"
                @click.stop="archiveConversation(item)"
              >
                <FolderDelete />
              </button>
            </el-tooltip>
          </div>
          <div v-if="visibleConversations.length === 0" class="empty-state">
            <ChatDotRound />
            <b>
              {{ conversationScope === 'active' ? '还没有 Conversation' : '没有已归档对话' }}
            </b>
            <span>
              {{
                conversationScope === 'active'
                  ? '新建一个 Conversation 开始与 Leader 协作。'
                  : '归档后的 Conversation 会保留在这里，可打开查看历史。'
              }}
            </span>
            <el-button
              v-if="conversationScope === 'active'"
              size="small"
              type="primary"
              @click="createConversation"
            >
              新建
            </el-button>
          </div>
        </section>
      </template>

      <template v-else-if="view === 'builder'">
        <section class="sidebar-section">
          <h3>构建资源</h3>
          <button
            v-for="item in builderResources"
            :key="item.type"
            class="nav-row"
            type="button"
            @click="openEditor(item.type)"
            @dblclick="openEditor(item.type, { preview: false })"
          >
            <component :is="item.icon" />
            <span
              ><b>{{ item.label }}</b
              ><small>{{ item.description }}</small></span
            >
            <ArrowRight />
          </button>
        </section>
      </template>

      <template v-else-if="view === 'simulation'">
        <SimulationSidebar />
      </template>

      <template v-else-if="view === 'map'">
        <section class="sidebar-section">
          <h3>地图空间</h3>
          <button
            v-for="item in mapKinds"
            :key="item.id"
            type="button"
            class="nav-row"
            :class="{ active: semanticMap.activeMapId === item.id }"
            @click="selectMap(item.id)"
          >
            <Location />
            <span
              ><b>{{ item.label }}</b
              ><small>{{ mapSummary(item.id) }}</small></span
            >
            <ArrowRight />
          </button>
        </section>
        <section class="sidebar-section">
          <div class="section-heading">
            <h3>当前地图版本的实体</h3>
            <el-tooltip content="打开地图" effect="dark" :show-after="500" placement="left">
              <button type="button" @click="openEditor('map')">
                <ArrowRight />
              </button>
            </el-tooltip>
          </div>
          <button
            v-for="entity in visibleMapEntities"
            :key="entity.id"
            type="button"
            class="nav-row"
            :class="{ active: selectedEntityId === entity.id }"
            @click="openMapEntity(entity)"
          >
            <Aim />
            <span
              ><b>{{ entity.name || entity.id }}</b
              ><small>{{ entity.type }} · {{ entity.status }}</small></span
            >
            <ArrowRight />
          </button>
          <div v-if="!visibleMapEntities.length" class="empty-state compact">当前地图没有实体</div>
        </section>
      </template>

      <template v-else-if="view === 'robots'">
        <section class="sidebar-section">
          <div class="section-heading">
            <h3>项目设备</h3>
            <el-tooltip content="刷新 Robot 目录" effect="dark" :show-after="500" placement="left">
              <button type="button" @click="reloadDevices">
                <Refresh />
              </button>
            </el-tooltip>
          </div>
          <p v-if="devices.snapshotStatus === 'loading' && !devices.robots.length" role="status">
            正在读取设备状态…
          </p>
          <p v-else-if="devices.snapshotStatus === 'error'" role="alert">{{ devices.error }}</p>
          <p v-else-if="devices.stale" role="status">连接中断或状态待核对，请刷新设备目录。</p>
          <article v-for="robot in projectRobots" :key="robot.robot_id" class="robot-entry">
            <button
              type="button"
              class="nav-row robot-row"
              :class="{ active: selectedRobotId === robot.robot_id }"
              @click="openRobot(robot)"
            >
              <Cpu />
              <span>
                <b>{{ robot.display_name || robot.robot_id }}</b>
                <small>{{ robot.model }} · {{ robot.backend }}</small>
                <small class="robot-status-line"
                  >连接 <DeviceStatus :status="robot.pilot?.status"
                /></small>
                <small class="robot-status-line"
                  >Robot 执行服务
                  <DeviceStatus
                    :status="devices.runtimeForRobot(robot.robot_id)?.status || 'not_reported'"
                /></small>
                <small>{{ robotWorkLabel(robot) }}</small>
              </span>
              <ArrowRight />
            </button>
            <el-button
              v-if="robotWork(robot) || robot.current_execution_id"
              size="small"
              text
              :aria-label="`查看 ${robot.display_name || robot.robot_id} 当前执行`"
              @click="inspectRobotWork(robot)"
            >
              查看执行
            </el-button>
          </article>
          <div
            v-if="!projectRobots.length && devices.snapshotStatus === 'ready'"
            class="empty-state compact"
          >
            当前项目尚未连接 Robot
          </div>
        </section>

        <section v-if="availableRobots.length" class="sidebar-section">
          <h3>其他可用设备</h3>
          <article v-for="robot in availableRobots" :key="robot.robot_id" class="robot-entry">
            <button
              type="button"
              class="nav-row robot-row"
              :class="{ active: selectedRobotId === robot.robot_id }"
              @click="openRobot(robot)"
            >
              <Cpu />
              <span>
                <b>{{ robot.display_name || robot.robot_id }}</b>
                <small class="robot-status-line"
                  >连接 <DeviceStatus :status="robot.pilot?.status"
                /></small>
                <small class="robot-status-line"
                  >Runtime
                  <DeviceStatus
                    :status="devices.runtimeForRobot(robot.robot_id)?.status || 'not_reported'"
                /></small>
                <small>{{ robotWorkLabel(robot) }}</small>
              </span>
              <ArrowRight />
            </button>
            <el-button
              v-if="robotWork(robot) || robot.current_execution_id"
              size="small"
              text
              :aria-label="`查看 ${robot.display_name || robot.robot_id} 当前执行`"
              @click="inspectRobotWork(robot)"
            >
              查看执行
            </el-button>
          </article>
        </section>

        <section class="sidebar-section">
          <button class="nav-row" type="button" @click="openDeviceCenter">
            <Monitor />
            <span>
              <b>Server 设备中心</b>
              <small>跨 Project 查看全部 Pilot 与 Robot</small>
            </span>
            <ArrowRight />
          </button>
        </section>
      </template>

      <template v-else>
        <section class="sidebar-section workflow-history-section">
          <div class="section-heading">
            <h3>流程记录</h3>
            <el-tooltip
              effect="dark"
              :show-after="500"
              content="刷新 Workflow 历史"
              placement="left"
            >
              <button type="button" :disabled="workflow.loading" @click="reloadWorkflows">
                <Refresh />
              </button>
            </el-tooltip>
          </div>
          <input
            v-model="workflowQuery"
            class="history-search"
            placeholder="搜索流程"
            aria-label="搜索流程"
          />
          <button
            v-for="item in visibleWorkflows"
            :key="item.id"
            type="button"
            class="nav-row workflow-row"
            :class="{ active: selectedWorkflowId === item.id }"
            :title="item.goal"
            @click="openWorkflow(item)"
            @dblclick="openWorkflowDocument(item)"
          >
            <i class="sf-status-dot" :data-status="workflowStatusMeta(item).dot" />
            <span>
              <b>{{ item.goal || shortId(item.id) }}</b>
              <small>
                {{ workflowStatusMeta(item).label }} ·
                {{ formatTime(item.updated_at || item.created_at) }}
              </small>
            </span>
            <ArrowRight />
          </button>
          <div v-if="workflow.items.length === 0" class="empty-state compact">
            当前 Project 还没有 Workflow。
          </div>
        </section>
        <section class="sidebar-section run-section">
          <div class="section-heading">
            <h3>Agent 请求</h3>
            <el-tooltip content="刷新 Runs" effect="dark" :show-after="500" placement="left">
              <button type="button" :disabled="runs.loading" @click="reloadRuns">
                <Refresh />
              </button>
            </el-tooltip>
          </div>
          <div
            v-for="run in visibleRuns"
            :key="run.id"
            class="run-row"
            :class="{ active: selectedRunId === run.id }"
            role="button"
            tabindex="0"
            @click="selectRun(run)"
            @keydown.enter="selectRun(run)"
            @keydown.space.prevent="selectRun(run)"
          >
            <i class="sf-status-dot" :data-status="statusMeta(run.status).dot" />
            <span>
              <b>{{ statusMeta(run.status).label }}</b>
              <small
                >{{ shortId(run.id) }} · {{ run.agent_id || run.agent_name || 'leader' }}</small
              >
            </span>
            <el-tooltip
              v-if="run.trace_id"
              content="在 Editor 中打开 Trace"
              effect="dark"
              :show-after="500"
              placement="left"
            >
              <button class="row-action" type="button" @click.stop="openTrace(run)">
                <DataAnalysis />
              </button>
            </el-tooltip>
          </div>
          <div v-if="visibleRuns.length === 0" class="empty-state compact">
            <VideoPlay />
            <span>暂无独立 Agent 请求</span>
          </div>
        </section>
        <section class="sidebar-section run-actions">
          <h3>执行输出</h3>
          <button class="nav-row" type="button" @click="openBottom('activity')">
            <Monitor />
            <span><b>执行过程</b><small>任务、步骤与阶段证据</small></span>
            <ArrowRight />
          </button>
          <button class="nav-row" type="button" @click="openBottom('interactions')">
            <Bell />
            <span
              ><b>待处理请求</b><small>{{ interactions.pending.length }} 个待处理</small></span
            >
            <ArrowRight />
          </button>
        </section>
      </template>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  Bell,
  ChatDotRound,
  Close,
  Collection,
  Cpu,
  DataAnalysis,
  Document,
  FolderDelete,
  FolderOpened,
  Aim,
  Location,
  Monitor,
  Plus,
  Refresh,
  Tools,
  VideoPlay
} from '@element-plus/icons-vue'
import { requestConversationArchive } from '@/studio/conversationActions'
import { currentProjectWork } from '@/studio/currentWork'
import { runningProjectScene } from '@/studio/sceneWorkspace'
import { useExecutionScopeStore } from '@/stores/executionScope'
import ProjectSimulationSceneResources from '@/components/studio/ProjectSimulationSceneResources.vue'
import ProjectAgentSkillResources from '@/components/studio/ProjectAgentSkillResources.vue'
import ProjectImportDialog from '@/components/studio/ProjectImportDialog.vue'
import SimulationSidebar from '@/components/studio/SimulationSidebar.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { useSimulationStore } from '@/stores/simulation'
import { useConversationStore } from '@/stores/conversation'
import { useInteractionsStore } from '@/stores/interactions'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useRunsStore } from '@/stores/runs'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useUiStore } from '@/stores/ui'
import { useDeviceStore } from '@/stores/device'
import { useRobotStore } from '@/stores/robot'
import { useWorkflowStore } from '@/stores/workflow'
import { openStudioPanel } from '@/studio/panelService'

const props = defineProps({
  view: { type: String, default: 'conversation' }
})
defineEmits(['close'])

const project = useProjectStore()
const showImports = ref(false)
const conversation = useConversationStore()
const runs = useRunsStore()
const interactions = useInteractionsStore()
const simulation = useSimulationStore()
const semanticMap = useSemanticMapStore()
const layout = useLayoutStore()
const ui = useUiStore()
const devices = useDeviceStore()
const robotExecutions = useRobotStore()
const workflow = useWorkflowStore()
const router = useRouter()
const conversationScope = ref('active')
const workflowQuery = ref('')
const visibleWorkflows = computed(() =>
  workflow.items.filter(
    (item) =>
      !workflowQuery.value.trim() ||
      `${item.goal || ''} ${item.id}`
        .toLowerCase()
        .includes(workflowQuery.value.trim().toLowerCase())
  )
)
const projectSceneLabel = computed(() => {
  const current = runningProjectScene(simulation)
  // 项目可以包含多个场景；现场存在时侧栏也跟随它，目录第一项只作未运行时的入口。
  if (simulation.instance && !current)
    return `${simulation.instance.scene_key} · ${simulation.instance.layout}`
  const reference = current || simulation.projectScenes[0]
  if (!reference) return '添加场景并选择 Layout'
  const scene = simulation.catalogById(reference.catalog_scene_id)
  const variant = simulation.instance?.layout || reference.default_variant_id || '选择 Layout'
  return `${scene?.name || reference.catalog_scene_id} · ${variant}`
})
const runtimeLabel = computed(() => {
  const preferred = simulation.runtimePreference.preferred_runtime_installation_id
  const installation = simulation.runtimeInstallations.find(
    (item) => item.installation_id === preferred
  )
  return (
    installation?.name ||
    (simulation.runtimeInstallations.length ? '选择或管理已安装环境' : '安装运行环境')
  )
})

const viewMeta = computed(
  () =>
    ({
      explorer: { title: '项目' },
      scene: { title: '场景' },
      conversation: { title: 'Conversations' },
      simulation: { title: 'Simulation' },
      builder: { title: 'Agents' },
      map: { title: 'Semantic Map' },
      run: { title: '运行' },
      robots: { title: '设备' }
    })[props.view] || { title: 'Explorer' }
)
const builderResources = [
  { type: 'agents', label: 'Agents', description: '角色、模型与运行配置', icon: Cpu },
  { type: 'skills', label: 'Skills', description: '可复用的工作方法', icon: Collection },
  { type: 'tools', label: 'Tools', description: '工具目录与可用状态', icon: Tools }
]
const visibleRuns = computed(() => runs.items.filter((run) => !run.workflow_id && !run.task_id))
const visibleConversations = computed(() =>
  conversationScope.value === 'archived' ? conversation.archivedItems : conversation.items
)
const selectedRunId = computed(() =>
  layout.selectedResource?.resourceType === 'run' ? layout.selectedResource.resourceId : ''
)
const selectedWorkflowId = computed(() =>
  layout.selectedResource?.resourceType === 'workflow' ? layout.selectedResource.resourceId : ''
)
const selectedEntityId = computed(() =>
  layout.selectedResource?.resourceType === 'map_entity' ? layout.selectedResource.resourceId : ''
)
const selectedRobotId = computed(() =>
  layout.selectedResource?.resourceType === 'robot' ? layout.selectedResource.resourceId : ''
)
const projectRobotIds = computed(() => {
  const ids = new Set(
    robotExecutions.executions
      .filter(
        (execution) => !execution.project_id || execution.project_id === project.currentProjectId
      )
      .map((execution) => execution.robot_id)
  )
  for (const robot of devices.robots) {
    if (robot.project_id === project.currentProjectId) ids.add(robot.robot_id)
  }
  for (const robot of simulation.robots) ids.add(robot.robot_id || robot.id)
  return ids
})
const projectRobots = computed(() =>
  devices.robots.filter((robot) => projectRobotIds.value.has(robot.robot_id))
)
const availableRobots = computed(() =>
  devices.robots.filter((robot) => !projectRobotIds.value.has(robot.robot_id))
)
const executionScope = useExecutionScopeStore()
function robotWork(robot) {
  return currentProjectWork({
    projectId: project.currentProjectId,
    robotId: robot.robot_id,
    workflows: [
      ...new Map(
        [
          ...workflow.items,
          ...(workflow.workflow ? [{ ...workflow.workflow, tasks: workflow.tasks }] : [])
        ].map((item) => [item.id, item])
      ).values()
    ],
    executions: robotExecutions.executions,
    runs: runs.items,
    devices: devices.robots
  }).current
}
function robotWorkLabel(robot) {
  const work = robotWork(robot)
  if (work)
    return `当前工作：${work.value.goal || work.value.skill_name || work.value.title || 'Agent 请求'}`
  if (robot.current_execution_id || robot.status === 'busy') return '正在同步当前工作'
  return robot.status === 'stopping' ? '正在停止' : '当前没有工作'
}
function inspectRobotWork(robot) {
  const work = robotWork(robot)
  if (work?.kind === 'workflow') executionScope.inspectWorkflow(work.value.id)
  else if (work?.kind === 'run') executionScope.inspectRun(work.value.id)
  else executionScope.inspectExecution(work?.value.id || robot.current_execution_id)
  openStudioPanel('activity')
}
const visibleMapEntities = computed(() =>
  semanticMap.entities.filter((item) => item.status !== 'removed')
)
const mapKinds = [
  { id: 'simulation_map', label: 'Simulation Map' },
  { id: 'real_map', label: 'Real Map' }
]
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
  label: labels[status]?.[0] || status || '未知',
  dot: labels[status]?.[1] || 'idle'
})
const workflowStatusMeta = (item) => {
  if (item.status === 'paused' && item.reason === 'execution_state_unknown') {
    return { label: '执行状态未知', dot: 'danger' }
  }
  return (
    {
      pending: { label: '待执行', dot: 'idle' },
      running: { label: '运行中', dot: 'warning' },
      paused: { label: '已暂停', dot: 'stopped' },
      stopping: { label: '停止中', dot: 'danger' },
      completed: { label: '已完成', dot: 'success' },
      failed: { label: '失败', dot: 'danger' },
      stopped: { label: '已停止', dot: 'stopped' }
    }[item.status] || { label: item.status || '未知', dot: 'idle' }
  )
}

function openEditor(type, params = {}) {
  openStudioPanel(type, params)
}

function openRobot(robot) {
  layout.select({
    projectId: project.currentProjectId,
    resourceType: 'robot',
    resourceId: robot.robot_id,
    title: robot.display_name || robot.robot_id
  })
  openEditor('robot-device', {
    resourceType: 'robot',
    resourceId: robot.robot_id,
    title: robot.display_name || robot.robot_id
  })
}

async function reloadDevices() {
  try {
    await devices.loadSnapshot()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot 目录刷新失败' })
  }
}

function openDeviceCenter() {
  router.push('/devices')
}

function openBottom(tab) {
  openStudioPanel(tab)
}

async function selectMap(mapId) {
  try {
    await semanticMap.switchMap(mapId)
    openEditor('map')
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '地图加载失败' })
  }
}

function openMapEntity(entity) {
  semanticMap.select({ kind: 'entity', entity_id: entity.id })
  layout.select({
    projectId: project.currentProjectId,
    resourceType: 'map_entity',
    resourceId: entity.id,
    title: entity.name || entity.id
  })
  openEditor('map', {
    inspectorResourceType: 'map_entity',
    inspectorResourceId: entity.id,
    inspectorTitle: entity.name || entity.id
  })
}

function mapSummary(mapId) {
  const snapshot = semanticMap.snapshots[mapId]
  const summary = semanticMap.summaries.find((item) => item.map_id === mapId)
  const generation = snapshot?.generation || summary?.generation || '-'
  const count = snapshot?.entities?.filter((item) => item.status !== 'removed').length
  return '地图版本 ' + generation + ' · ' + (count ?? summary?.entity_count ?? 0) + ' 个实体'
}

async function selectConversation(item) {
  try {
    await conversation.select(item.id)
    layout.select({
      projectId: project.currentProjectId,
      resourceType: 'conversation',
      resourceId: item.id,
      title: item.title
    })
    openEditor('conversation')
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Conversation 打开失败' })
  }
}

async function createConversation() {
  try {
    conversationScope.value = 'active'
    const created = await conversation.create()
    if (created) await selectConversation(created)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Conversation 创建失败' })
  }
}

async function switchConversationScope(scope) {
  conversationScope.value = scope
  if (scope !== 'archived') return
  try {
    await conversation.load(project.currentProjectId, { includeArchived: true })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '已归档 Conversation 加载失败' })
  }
}

async function archiveConversation(item) {
  if (await requestConversationArchive(item)) {
    if (
      layout.selectedResource?.resourceType === 'conversation' &&
      layout.selectedResource.resourceId === item.id
    ) {
      layout.select(null)
    }
    conversationScope.value = 'archived'
  }
}

function selectRun(run) {
  layout.select({
    projectId: project.currentProjectId,
    resourceType: 'run',
    resourceId: run.id,
    title: `Run ${shortId(run.id)}`
  })
  executionScope.inspectRun(run.id)
  openBottom('activity')
}

function openTrace(run) {
  selectRun(run)
  openEditor('trace', { resourceType: 'trace', resourceId: run.trace_id, runId: run.id })
}

function openWorkflow(item) {
  layout.select({
    projectId: project.currentProjectId,
    resourceType: 'workflow',
    resourceId: item.id,
    title: item.goal || `Workflow ${shortId(item.id)}`
  })
  executionScope.inspectWorkflow(item.id)
  openBottom('activity')
}

function openWorkflowDocument(item) {
  openEditor('workflow-run', {
    resourceType: 'workflow',
    resourceId: item.id,
    title: item.goal || `Workflow ${shortId(item.id)}`
  })
}

function reloadWorkflows() {
  workflow.loadHistory(project.currentProjectId).catch((error) => {
    ui.notify({ type: 'error', message: error.message || 'Workflow 历史刷新失败' })
  })
}

function reloadRuns() {
  runs.load(runs.projectId).catch((error) => {
    ui.notify({ type: 'error', message: error.message || 'Run 刷新失败' })
  })
}

function shortId(value) {
  const id = String(value || '')
  return id.length > 15 ? `${id.slice(0, 12)}…` : id
}

function formatTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

watch(
  [() => props.view, () => project.currentProjectId],
  ([view, projectId]) => {
    if (view === 'run' && projectId) reloadWorkflows()
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.primary-sidebar {
  display: flex;
  height: calc(100% - 16px);
  margin: 8px 0 8px 8px;
  border: 0;
  border-radius: var(--sf-radius-lg);
  overflow: hidden;
  min-width: 0;
  flex-direction: column;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--sf-border) 40%, transparent);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 0 12px 0 16px;

  strong {
    font-size: 15px;
    line-height: 1.35;
  }

  button {
    display: grid;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--sf-radius-md);
    background: transparent;
    color: var(--sf-text-secondary);
    cursor: pointer;
    place-items: center;

    &:hover {
      background: var(--sf-bg-hover);
      color: var(--sf-brand);
    }

    svg {
      width: 15px;
    }
  }
}

.sidebar-content {
  min-height: 0;
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}

.history-search {
  width: 100%;
  min-width: 0;
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  background: var(--sf-bg-primary);
  color: var(--sf-text-primary);
  font: inherit;
  font-size: 12px;
}

.project-card {
  display: flex;
  flex-direction: column;
  padding: 15px;
  border: 0;
  border-radius: var(--sf-radius-lg);
  background:
    radial-gradient(
      circle at 100% 0%,
      color-mix(in srgb, var(--sf-brand) 14%, transparent),
      transparent 48%
    ),
    var(--sf-bg-tertiary);

  span,
  small {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }

  strong {
    margin: 4px 0;
    font-size: 15px;
  }
}

.sidebar-section {
  margin-top: 18px;

  h3 {
    margin: 0 4px 8px;
    color: var(--sf-text-disabled);
    font-size: 11px;
    letter-spacing: 0.03em;
  }
}

.project-resources {
  margin-top: 18px;

  > h3 {
    margin: 0 4px 8px;
    color: var(--sf-text-secondary);
    font-size: 12px;
  }

  > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 4px;
    border-bottom: 0;
    color: var(--sf-text-primary);
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 380;
    }

    small {
      color: var(--sf-text-disabled);
      font-size: 11px;
    }

    svg {
      width: 14px;
      color: var(--sf-brand);
    }
  }
}

.project-resource-links {
  margin-top: 10px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;

  button {
    display: grid;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--sf-radius-md);
    background: transparent;
    color: var(--sf-text-secondary);
    cursor: pointer;
    place-items: center;

    &:hover {
      background: var(--sf-brand-soft);
      color: var(--sf-brand);
    }

    svg {
      width: 15px;
    }
  }
}

.nav-row,
.conversation-row,
.run-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 36px;
  gap: 10px;
  margin-bottom: 2px;
  padding: 6px 9px;
  border: 0;
  border-radius: var(--sf-radius-md);
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  text-align: left;

  > svg,
  > i {
    width: 17px;
    flex: none;
  }

  > span {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  b {
    overflow: hidden;
    color: var(--sf-text-primary);
    font-size: 12px;
    font-weight: 380;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    overflow: hidden;
    color: var(--sf-text-disabled);
    font-size: 11px;
    font-weight: 380;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    background: var(--sf-bg-hover);
    color: var(--sf-text-primary);
  }

  &.active {
    background: linear-gradient(135deg, var(--sf-brand) 0%, var(--sf-brand-active) 100%);
    color: #fff;

    b,
    small {
      color: #fff;
    }
  }
}

.nav-row > svg:last-child {
  width: 13px;
  color: var(--sf-text-disabled);
}

.conversation-row {
  min-height: 36px;
}

.conversation-filter {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 8px;
  padding: 3px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-tertiary);

  button {
    min-height: 27px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--sf-text-disabled);
    cursor: pointer;
    font-size: 11px;

    &.active {
      background: var(--sf-bg-secondary);
      color: var(--sf-brand);
      box-shadow: var(--sf-shadow-sm);
    }
  }
}

.conversation-item {
  position: relative;

  .conversation-row {
    padding-right: 36px;

    &.archived {
      opacity: 0.72;
    }
  }

  .conversation-action {
    position: absolute;
    top: 10px;
    right: 7px;
    display: grid;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--sf-radius-md);
    background: transparent;
    color: var(--sf-text-disabled);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    place-items: center;

    &:focus-visible,
    &:hover {
      background: color-mix(in srgb, var(--sf-danger) 10%, transparent);
      color: var(--sf-danger);
      opacity: 1;
    }

    svg {
      width: 15px;
    }
  }

  &:hover .conversation-action,
  &:focus-within .conversation-action {
    opacity: 1;
    pointer-events: auto;
  }
}

.robot-entry {
  padding-bottom: 6px;
  > .el-button {
    margin-left: 32px;
  }
  .robot-status-line {
    display: flex;
    align-items: center;
    gap: 7px;
  }
}

.run-row {
  min-height: 49px;

  .row-action {
    display: grid;
    width: 27px;
    height: 27px;
    flex: none;
    border: 0;
    border-radius: var(--sf-radius-md);
    background: transparent;
    color: var(--sf-text-disabled);
    cursor: pointer;
    place-items: center;

    &:hover {
      background: var(--sf-bg-secondary);
      color: var(--sf-brand);
    }

    svg {
      width: 15px;
    }
  }
}

.sidebar-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 18px;
  padding: 11px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-brand-soft);
  color: var(--sf-text-secondary);
  font-size: 11px;
  line-height: 1.55;

  svg {
    width: 15px;
    flex: none;
    margin-top: 1px;
    color: var(--sf-brand);
  }
}

.empty-state {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 7px;
  padding: 34px 14px;
  color: var(--sf-text-disabled);
  text-align: center;

  > svg {
    width: 25px;
  }

  b {
    color: var(--sf-text-secondary);
    font-size: 12px;
  }

  span {
    font-size: 11px;
    line-height: 1.5;
  }

  &.compact {
    padding: 24px 10px;
  }
}
</style>
