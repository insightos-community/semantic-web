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
  <div class="studio-shell">
    <header class="studio-topbar">
      <el-tooltip effect="dark" :show-after="500" content="返回 Project Hub" placement="bottom">
        <button type="button" class="brand-button" @click="goHub">
          <span>S</span>
        </button>
      </el-tooltip>
      <div class="project-context">
        <small>Semantic Studio · Project</small>
        <b>{{ project.currentProject?.name || projectId }}</b>
      </div>
      <span class="mode-chip">
        {{ project.currentProject?.mode === 'running' ? '运行模式' : '开发模式' }}
      </span>
      <span v-if="project.isFixture" class="fixture-chip">FIXTURE</span>
      <div class="topbar-spacer" />

      <div class="layout-controls" aria-label="布局控制">
        <el-tooltip effect="dark" :show-after="500" content="切换主侧栏" placement="bottom">
          <button
            type="button"
            :class="{ active: layout.shell.primaryVisible }"
            :aria-pressed="layout.shell.primaryVisible"
            aria-label="切换主侧栏"
            @click="toggleRegion('primary')"
          >
            <i class="layout-glyph is-primary" />
          </button>
        </el-tooltip>
        <el-tooltip effect="dark" :show-after="500" content="切换底部面板" placement="bottom">
          <button
            type="button"
            :class="{ active: layout.shell.bottomVisible }"
            :aria-pressed="layout.shell.bottomVisible"
            aria-label="切换底部面板"
            @click="toggleRegion('bottom')"
          >
            <i class="layout-glyph is-bottom" />
          </button>
        </el-tooltip>
        <el-tooltip effect="dark" :show-after="500" content="切换右侧工具区" placement="bottom">
          <button
            type="button"
            :class="{ active: layout.shell.secondaryVisible }"
            :aria-pressed="layout.shell.secondaryVisible"
            aria-label="切换右侧工具区"
            @click="toggleRegion('secondary')"
          >
            <i class="layout-glyph is-secondary" />
          </button>
        </el-tooltip>
      </div>

      <el-tooltip effect="dark" :show-after="500" content="打开对话" placement="bottom">
        <button
          type="button"
          class="topbar-icon-button"
          aria-label="打开对话"
          @click="routePanel('conversation')"
        >
          <ChatDotRound />
        </button>
      </el-tooltip>
      <el-tooltip effect="dark" :show-after="500" content="刷新状态" placement="bottom">
        <button
          type="button"
          class="topbar-icon-button"
          aria-label="刷新状态"
          :disabled="refreshingState"
          @click="refreshState"
        >
          <RefreshRight />
        </button>
      </el-tooltip>
      <el-tooltip
        effect="dark"
        :show-after="500"
        :content="ui.theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'"
        placement="bottom"
      >
        <button type="button" class="topbar-icon-button" aria-label="切换主题" @click="toggleTheme">
          <Sunny v-if="ui.theme === 'dark'" />
          <Moon v-else />
        </button>
      </el-tooltip>
      <el-tooltip effect="dark" :show-after="500" content="停止生成" placement="bottom">
        <span class="tooltip-reference">
          <el-button
            size="small"
            type="danger"
            plain
            :disabled="!activeRun"
            :loading="runs.cancellingId === activeRun?.id"
            @click="stopRun"
          >
            停止生成
          </el-button>
        </span>
      </el-tooltip>
    </header>

    <div class="studio-body">
      <aside class="activity-bar" aria-label="Studio 活动栏">
        <template v-for="item in activities" :key="item.view">
          <el-tooltip effect="dark" :content="item.label" :show-after="500" placement="right">
            <button
              type="button"
              :class="{
                active:
                  !item.route &&
                  layout.shell.primaryVisible &&
                  layout.shell.primaryView === item.view
              }"
              :aria-pressed="
                item.route
                  ? undefined
                  : layout.shell.primaryVisible && layout.shell.primaryView === item.view
              "
              @click="activateActivity(item)"
            >
              <component :is="item.icon" />
              <span>{{ item.short }}</span>
              <em v-if="item.view === 'run' && interactions.pending.length">
                {{ interactions.pending.length }}
              </em>
            </button>
          </el-tooltip>
        </template>
        <el-tooltip effect="dark" :show-after="500" content="当前 Project 设置" placement="right">
          <button class="settings-button" type="button" @click="openProjectSettings">
            <Setting />
            <span>设置</span>
          </button>
        </el-tooltip>
      </aside>

      <div v-if="project.snapshotStatus === 'loading'" class="bootstrap-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <b>正在恢复 Project 工作区</b>
        <span>正在加载…</span>
      </div>
      <div v-else-if="project.snapshotStatus === 'error'" class="bootstrap-state error">
        <b>Project 状态加载失败</b>
        <span>{{ project.error }}</span>
        <el-button size="small" @click="bootstrap(projectId)">重试</el-button>
      </div>

      <div v-else-if="project.snapshotStatus === 'ready'" ref="regionHost" class="studio-regions">
        <StudioPrimarySidebar
          v-if="layout.shell.primaryVisible"
          :view="layout.shell.primaryView"
          :style="{ width: `${layout.shell.primaryWidth}px` }"
          @close="toggleRegion('primary', false)"
        />
        <div
          v-if="layout.shell.primaryVisible"
          class="region-resizer is-vertical"
          role="separator"
          tabindex="0"
          aria-label="调整主侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin="240"
          aria-valuemax="420"
          :aria-valuenow="layout.shell.primaryWidth"
          @pointerdown="startResize('primary', $event)"
          @keydown="resizeWithKeyboard('primary', $event)"
        />

        <section class="editor-column">
          <main class="studio-workspace">
            <StudioDock
              :key="projectId"
              ref="dock"
              :project-id="projectId"
              :initial-preset="selectedPreset"
              @layout-ready="onLayoutReady"
              @active-panel="onActivePanel"
              @panels-closed="onPanelsClosed"
            />
          </main>
          <StudioCurrentWork />
          <div
            v-if="layout.shell.bottomVisible"
            class="region-resizer is-horizontal"
            role="separator"
            tabindex="0"
            aria-label="调整底部面板高度"
            aria-orientation="horizontal"
            aria-valuemin="180"
            aria-valuemax="520"
            :aria-valuenow="layout.shell.bottomHeight"
            @pointerdown="startResize('bottom', $event)"
            @keydown="resizeWithKeyboard('bottom', $event)"
          />
          <StudioBottomPanel
            v-if="layout.shell.bottomVisible"
            :style="{ height: `${layout.shell.bottomHeight}px` }"
            @close="toggleRegion('bottom', false)"
          />
        </section>

        <div
          v-if="toolsVisible"
          class="region-resizer is-vertical is-secondary"
          role="separator"
          tabindex="0"
          aria-label="调整右侧工具区宽度"
          aria-orientation="vertical"
          aria-valuemin="320"
          aria-valuemax="640"
          :aria-valuenow="layout.shell.secondaryWidth"
          @pointerdown="startResize('secondary', $event)"
          @keydown="resizeWithKeyboard('secondary', $event)"
        />
        <StudioToolsSidebar
          v-show="toolsVisible"
          :style="{ width: `${layout.shell.secondaryWidth}px` }"
          @conversation-host="sidebarConversationHost = $event"
          @close-conversation="closeConversation"
        />
        <div
          v-show="maximizedConversation"
          ref="maximizedConversationHost"
          class="maximized-conversation"
          data-testid="maximized-conversation"
        />
        <!-- 对话实例始终由工作区持有；Tab、全屏和侧栏只是不同显示位置。 -->
        <div class="conversation-parking">
          <Teleport :to="conversationTarget" :disabled="!conversationTarget">
            <StudioConversationSidebar
              v-show="layout.shell.conversationOpen"
              ref="conversationView"
              :key="projectId"
              :maximized="maximizedConversation"
              :location="layout.shell.conversationLocation"
              @maximize="maximizedConversation = !maximizedConversation"
              @move="moveConversation"
              @close="closeConversation"
            />
          </Teleport>
        </div>
      </div>
    </div>

    <footer class="status-bar">
      <span><i class="sf-status-dot" :data-status="connectionDot" />{{ connectionText }}</span>
      <span>Conversation：{{ conversation.current?.title || '未选择' }}</span>
      <span>Run：{{ activeRun?.id || '无活动 Run' }}</span>
      <span class="status-spacer" />
      <span v-if="project.stale" class="stale">正在同步状态</span>
      <span>{{ activePanel?.title || 'Editor' }}</span>
      <span>v0.5.0-dev</span>
    </footer>
    <StudioSettingsDialog
      :project-id="projectId"
      :open="ui.settingsDialog.open"
      :initial-section="ui.settingsDialog.section"
      @close="closeSettings"
      @open-memory="openProjectMemory"
      @reset-layout="dock?.resetCurrentPreset()"
    />
    <!-- 离开 Project 确认弹窗：与归档 Project、移除 Robot Skill 等确认弹窗同款 -->
    <el-dialog
      v-model="leaveDialog"
      title="离开 Project"
      width="520px"
      align-center
      class="leave-project-dialog"
      :close-on-click-modal="false"
    >
      <div class="leave-confirm-body">
        <div class="leave-icon">
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <mask
              id="mask0_3200_87342"
              style="mask-type: alpha"
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="200"
              height="200"
            >
              <rect width="200" height="200" fill="#FAFAFA" />
            </mask>
            <g mask="url(#mask0_3200_87342)">
              <path
                d="M89.7615 43.7483C94.441 36.0935 105.559 36.0935 110.238 43.7483L166.78 136.241C171.669 144.237 165.914 154.5 156.542 154.5H43.458C34.0861 154.5 28.3314 144.237 33.2196 136.241L89.7615 43.7483Z"
                fill="#FC8A18"
              />
              <path
                d="M84.6426 40.6191C91.6618 29.1369 108.338 29.1369 115.357 40.6191L171.899 133.111C179.232 145.106 170.6 160.5 156.542 160.5H43.458C29.4001 160.5 20.7684 145.106 28.1006 133.111L84.6426 40.6191Z"
                stroke="#FC8A18"
                stroke-opacity="0.1"
                stroke-width="12"
              />
              <rect x="92" y="124" width="16" height="16" rx="8" fill="#FAFAFA" />
              <path
                d="M97.7245 116C95.6259 116 93.8842 114.378 93.7346 112.285L90.3061 64.285C90.1407 61.9695 91.9745 60 94.2959 60L105.704 60C108.025 60 109.859 61.9695 109.694 64.285L106.265 112.285C106.116 114.378 104.374 116 102.276 116L97.7245 116Z"
                fill="#FAFAFA"
              />
              <path
                d="M142 35L143.018 39.9818L148 41L143.018 42.0182L142 47L140.982 42.0182L136 41L140.982 39.9818L142 35Z"
                fill="#FC8A18"
              />
              <path
                d="M149.5 50L149.924 52.0757L152 52.5L149.924 52.9243L149.5 55L149.076 52.9243L147 52.5L149.076 52.0757L149.5 50Z"
                fill="#FC8A18"
              />
              <path
                d="M16 107L17.1879 112.812L23 114L17.1879 115.188L16 121L14.8121 115.188L9 114L14.8121 112.812L16 107Z"
                fill="#FC8A18"
              />
            </g>
          </svg>
        </div>
        <p class="leave-confirm-title">离开 Project 并返回项目列表？</p>
        <p class="leave-confirm-desc">当前工作将在后台继续运行。</p>
      </div>
      <template #footer>
        <el-button size="large" @click="leaveDialog = false">留在这里</el-button>
        <el-button size="large" type="primary" :loading="leaving" @click="confirmLeave">
          后台运行并离开
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  provide,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChatDotRound,
  Connection,
  Cpu,
  Files,
  Loading,
  Moon,
  RefreshRight,
  Setting,
  Sunny,
  Monitor,
  VideoPlay
} from '@element-plus/icons-vue'
import StudioBottomPanel from '@/components/studio/StudioBottomPanel.vue'
import StudioConversationSidebar from '@/components/studio/StudioConversationSidebar.vue'
import StudioToolsSidebar from '@/components/studio/StudioToolsSidebar.vue'
import { conversationSurfaceKey } from '@/studio/conversationSurface'
import StudioCurrentWork from '@/components/studio/StudioCurrentWork.vue'
import StudioDock from '@/components/studio/StudioDock.vue'
import StudioPrimarySidebar from '@/components/studio/StudioPrimarySidebar.vue'
import StudioSettingsDialog from '@/components/studio/StudioSettingsDialog.vue'
import { createDeviceSubscription } from '@/devices/subscription'
import { clearStudioState, loadStudioSnapshot } from '@/studio/bootstrap'
import { createStudioSubscription } from '@/studio/subscription'
import { clearStudioPanelOpener, setStudioPanelOpener } from '@/studio/panelService'
import { useProjectStore } from '@/stores/project'
import { useSimulationStore } from '@/stores/simulation'
import { useConversationStore } from '@/stores/conversation'
import { useRunsStore } from '@/stores/runs'
import { useInteractionsStore } from '@/stores/interactions'
import { useLayoutStore } from '@/stores/layout'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useUiStore } from '@/stores/ui'
import { useAbilityStore } from '@/stores/ability'
import { useDeviceStore } from '@/stores/device'
import { useWorkflowStore } from '@/stores/workflow'
import { useRobotStore } from '@/stores/robot'
import { useArtifactSyncStore } from '@/stores/artifactSync'
import { useExecutionScopeStore } from '@/stores/executionScope'

const route = useRoute()
const router = useRouter()
const simulation = useSimulationStore()
const project = useProjectStore()
const conversation = useConversationStore()
const runs = useRunsStore()
const interactions = useInteractionsStore()
const layout = useLayoutStore()
const semanticMap = useSemanticMapStore()
const ui = useUiStore()
const abilities = useAbilityStore()
const devices = useDeviceStore()
const workflows = useWorkflowStore()
const robots = useRobotStore()
const artifactSync = useArtifactSyncStore()
const executionScope = useExecutionScopeStore()
const dock = ref(null)
const regionHost = ref(null)
const editorConversationHost = shallowRef(null)
const sidebarConversationHost = shallowRef(null)
const maximizedConversationHost = shallowRef(null)
const maximizedConversation = ref(false)
const conversationView = ref(null)
let movingConversation = false
provide(conversationSurfaceKey, { editor: editorConversationHost })
const toolsVisible = computed(
  () =>
    layout.shell.secondaryVisible &&
    (layout.inspectorAvailable ||
      (layout.shell.conversationOpen && layout.shell.conversationLocation === 'sidebar'))
)
const conversationTarget = computed(() =>
  maximizedConversation.value
    ? maximizedConversationHost.value
    : layout.shell.conversationLocation === 'editor'
      ? editorConversationHost.value
      : sidebarConversationHost.value
)
watch(
  () => [
    conversationTarget.value,
    toolsVisible.value,
    layout.shell.secondaryTab,
    layout.shell.conversationOpen
  ],
  async () => {
    conversationView.value?.captureViewport()
    await nextTick()
    conversationView.value?.restoreViewport()
  },
  { flush: 'pre' }
)
watch(editorConversationHost, (node) => {
  if (node) layout.updateShell({ conversationLocation: 'editor', conversationOpen: true })
})
const selectedPreset = ref('default')
const refreshingState = ref(false)
const activePanel = ref(null)
const projectId = computed(() => String(route.params.projectId || ''))
let subscription = null
let deviceSubscription = null
let bootstrapGeneration = 0
let reconciling = false
let reconcilingDevices = false
let deviceGeneration = 0
let deviceRetryTimer = null
let resizing = null

const activities = [
  { view: 'explorer', label: '项目', short: '项目', icon: Files },
  { view: 'scene', label: '场景', short: '场景', icon: Monitor },
  // Studio 中的入口表达“当前 Project 使用和观察哪些 Robot”，因此留在同一
  // 三栏工作区。跨 Project 的 Pilot/Robot 总览仍由 /devices 全局设备中心负责，
  // 两者复用同一 Store 与 Server 连接，不复制设备状态。
  { view: 'robots', label: '设备', short: '设备', icon: Connection },
  { view: 'run', label: '运行', short: '运行', icon: VideoPlay },
  { view: 'builder', label: 'Agents', short: 'Agents', icon: Cpu }
]

const activeRun = computed(() => runs.activeForConversation(conversation.currentId))
const connectionDot = computed(() => {
  if (project.connectionStatus === 'online') return 'success'
  if (project.connectionStatus === 'connecting' || project.connectionStatus === 'reconnecting') {
    return 'warning'
  }
  return 'danger'
})
const connectionText = computed(
  () =>
    ({
      online: 'Server 已连接',
      connecting: '连接中',
      reconnecting: '正在重连',
      offline: 'Server 离线'
    })[project.connectionStatus] || project.connectionStatus
)

async function bootstrap(id) {
  if (!id) return
  maximizedConversation.value = false
  const generation = ++bootstrapGeneration
  deviceGeneration += 1
  reconcilingDevices = false
  deviceSubscription?.stop()
  deviceSubscription = null
  executionScope.followCurrent()
  subscription?.stop()
  subscription = null
  clearStudioState()
  try {
    const snapshot = await loadStudioSnapshot(id, {
      shouldApply: () => generation === bootstrapGeneration && projectId.value === id
    })
    if (!snapshot) return
    selectedPreset.value = layout.preferredPreset(id)
    void refreshDeviceCatalog()
  } catch (error) {
    if (generation === bootstrapGeneration) {
      ui.notify({ type: 'error', message: error.message || 'Studio 状态恢复失败' })
    }
  }
}

async function refreshDeviceCatalog() {
  if (reconcilingDevices) return
  reconcilingDevices = true
  const generation = ++deviceGeneration
  const current = () => generation === deviceGeneration
  try {
    const snapshot = await devices.loadSnapshot({ shouldApply: current })
    if (!snapshot || !current()) return
    for (const robot of devices.robots) {
      abilities.hydrateRobot(robot.robot_id, robot.abilities || [])
    }
    const executions = (snapshot.executions || []).filter(
      (execution) => execution.project_id === projectId.value
    )
    for (const execution of executions) robots.upsert(execution)
    artifactSync.mergeExecutions(executions)
  } catch (error) {
    if (current()) ui.notify({ type: 'warning', message: error.message || 'Robot 目录加载失败' })
  } finally {
    if (current()) {
      // 初次快照失败仍建立事件连接；重试与重连继续补查权威状态。
      deviceSubscription?.stop()
      deviceSubscription = createDeviceSubscription({
        afterSequence: devices.lastEventSequence,
        onGap: refreshDeviceCatalog
      }).start()
      reconcilingDevices = false
    }
  }
}

async function reconcileGap() {
  if (reconciling) return
  reconciling = true
  const generation = bootstrapGeneration
  const id = projectId.value
  subscription?.stop()
  subscription = null
  try {
    const snapshot = await loadStudioSnapshot(id, {
      shouldApply: () => generation === bootstrapGeneration && projectId.value === id
    })
    if (!snapshot) return
    startProjectSubscription()
  } catch (error) {
    ui.notify({ type: 'error', message: `状态对账失败：${error.message}` })
  } finally {
    reconciling = false
  }
}

function startProjectSubscription() {
  subscription?.stop()
  subscription = createStudioSubscription({
    projectId: projectId.value,
    afterSequence: project.lastEventSequence,
    onGap: reconcileGap
  }).start()
}

async function onLayoutReady() {
  startProjectSubscription()
  await nextTick()
  if (conversation.current) {
    layout.select({
      projectId: projectId.value,
      resourceType: 'conversation',
      resourceId: conversation.current.id,
      title: conversation.current.title
    })
  }
  const activity = String(route.query.activity || '')
  const panel = String(route.query.panel || '')
  const resourceId = String(route.query.resource_id || '')
  const executionId = String(route.query.execution_id || '')
  if (executionId) executionScope.inspectExecution(executionId)
  if (activity) openPrimary(activity)
  if (panel) routePanel(panel, { resourceId, resourceType: panel })
}

function routePanel(type, params = {}) {
  maximizedConversation.value = false
  if (type === 'conversation') {
    const location =
      params.viewMode === 'editor'
        ? 'editor'
        : params.viewMode === 'sidebar'
          ? 'sidebar'
          : layout.shell.conversationLocation
    void moveConversation(location)
    return true
  }
  if (type === 'scene-details')
    return Boolean(dock.value?.openPanel('scene-workspace', { ...params, viewMode: 'setup' }))
  if (type === 'physics-viewer' && params.viewMode !== 'editor')
    return Boolean(dock.value?.openPanel('scene-workspace', { viewMode: 'live' }))
  if (type === 'sensor-viewer' && params.viewMode !== 'editor')
    return Boolean(dock.value?.openPanel('scene-workspace', { viewMode: 'sensors' }))
  if (type === 'explorer') return layout.selectPrimary('explorer')
  if (type === 'simulation') return openPrimary('scene')
  if (type === 'map' && params.viewMode !== 'editor')
    return Boolean(dock.value?.openPanel('scene-workspace', { ...params, viewMode: 'map' }))
  if (type === 'runs') return layout.selectPrimary('run')
  if (type === 'inspector') {
    layout.revealInspector(true)
    return true
  }
  if (['activity', 'interactions', 'artifacts', 'logs', 'problems'].includes(type)) {
    if (params.resourceId) {
      layout.select({
        resourceType: type === 'artifacts' ? 'artifact' : type.slice(0, -1),
        resourceId: params.resourceId,
        title: params.title
      })
    }
    return layout.revealBottom(type)
  }
  if (params.inspectorResourceType) {
    layout.select({
      resourceType: params.inspectorResourceType,
      resourceId: params.inspectorResourceId || params.resourceId || '',
      title: params.inspectorTitle || params.title
    })
    layout.revealInspector()
  } else if (type === 'trace' && params.resourceId) {
    layout.select({
      resourceType: 'trace',
      resourceId: params.resourceId,
      title: `Trace ${params.resourceId}`
    })
  } else if (type === 'memory') {
    layout.select({ resourceType: 'memory', resourceId: projectId.value, title: 'Project Memory' })
  } else if (type !== 'conversation') {
    layout.select({ resourceType: type, resourceId: params.resourceId || '', title: params.title })
  }
  return Boolean(dock.value?.openPanel(type, params))
}

function openProjectMemory() {
  ui.closeSettings()
  routePanel('memory')
}

function onActivePanel(panel) {
  activePanel.value = panel
  if (!panel) return
  if (panel.inspectorResourceType) {
    layout.select({
      projectId: projectId.value,
      resourceType: panel.inspectorResourceType,
      resourceId: panel.inspectorResourceId || panel.resourceId || '',
      title: panel.inspectorTitle || panel.title
    })
    return
  }
  if (
    ['conversation', 'workflow-run'].includes(panel.type) &&
    ['task', 'subtask', 'workflow'].includes(layout.selectedResource?.resourceType)
  ) {
    // 点「查看 Task」后 Conversation / Workflow Tab 仍可能处于激活态；
    // 不要把 Task / SubTask 选择覆盖回去，否则 Inspector 会空掉或退回会话。
    return
  }
  if (panel.type === 'conversation' && conversation.current) {
    layout.select({
      resourceType: 'conversation',
      resourceId: conversation.current.id,
      title: conversation.current.title
    })
    return
  }
  if (panel.type === 'trace' && panel.resourceId) {
    layout.select({
      resourceType: 'trace',
      resourceId: panel.resourceId,
      title: panel.title
    })
    return
  }
  if (panel.type === 'memory') {
    layout.select({ resourceType: 'memory', resourceId: projectId.value, title: 'Project Memory' })
    return
  }
  if (panel.type === 'map') {
    // 地图面板中的实体/区域选择比“当前打开的是地图”更具体。激活 Tab 时
    // 不覆盖它，否则用户点击物品后右侧 Inspector 会退回空泛的地图信息。
    if (layout.selectedResource?.resourceType === 'map_entity') return
    layout.select({
      projectId: projectId.value,
      resourceType: 'semantic_map',
      resourceId: semanticMap.activeMapId,
      title: semanticMap.activeMapId === 'real_map' ? 'Real Map' : 'Simulation Map'
    })
    return
  }
  layout.select({
    projectId: projectId.value,
    resourceType: panel.resourceType || panel.type,
    resourceId: panel.resourceId || '',
    title: panel.title || panel.type
  })
}

function switchPrimary(view) {
  if (view === 'scene') {
    openPrimary(view)
    return
  }
  // 全屏时侧栏只是被覆盖，点击同一个活动栏入口应恢复它，而不是将它收起。
  if (maximizedConversation.value) {
    openPrimary(view)
    return
  }
  if (layout.shell.primaryVisible && layout.shell.primaryView === view) {
    layout.updateShell({ primaryVisible: false })
    return
  }
  layout.selectPrimary(view)
}

function openPrimary(view) {
  maximizedConversation.value = false
  if (view === 'conversation') return routePanel('conversation')
  if (view === 'simulation' || view === 'map') {
    dock.value?.openPanel('scene-workspace', view === 'map' ? { viewMode: 'map' } : {})
    view = 'scene'
  } else if (view === 'scene') dock.value?.openPanel('scene-workspace')
  layout.selectPrimary(view)
  return true
}

function openProjectSettings() {
  maximizedConversation.value = false
  ui.openSettings('project')
}

function closeSettings() {
  const refreshRuntime = ui.settingsDialog.section === 'simulation'
  ui.closeSettings()
  if (refreshRuntime) void simulation.hydrate(projectId.value).catch(() => {})
}

function activateActivity(item) {
  switchPrimary(item.view)
}

function toggleRegion(region, force) {
  maximizedConversation.value = false
  const key = `${region}Visible`
  layout.updateShell({ [key]: typeof force === 'boolean' ? force : !layout.shell[key] })
}

async function moveConversation(location) {
  movingConversation = true
  maximizedConversation.value = false
  try {
    layout.updateShell({
      conversationLocation: location,
      conversationOpen: true,
      secondaryTab: 'conversation',
      secondaryVisible: location === 'sidebar' ? true : layout.shell.secondaryVisible
    })
    if (location === 'editor') dock.value?.openPanel('conversation', { preview: false })
    else await dock.value?.closePanel('conversation')
  } finally {
    movingConversation = false
  }
}

async function closeConversation() {
  maximizedConversation.value = false
  if (layout.shell.conversationLocation === 'editor') await dock.value?.closePanel('conversation')
  layout.updateShell({ conversationOpen: false })
}

async function refreshState() {
  if (refreshingState.value) return
  refreshingState.value = true
  try {
    await Promise.all([reconcileGap(), refreshDeviceCatalog()])
  } finally {
    refreshingState.value = false
  }
}

function toggleTheme() {
  ui.setTheme(ui.theme === 'dark' ? 'light' : 'dark')
}

function startResize(region, event) {
  if (!regionHost.value) return
  event.preventDefault()
  resizing = region
  document.body.classList.add('is-resizing-studio')
  window.addEventListener('pointermove', resizeRegion)
  window.addEventListener('pointerup', stopResize, { once: true })
}

function resizeRegion(event) {
  if (!resizing || !regionHost.value) return
  const rect = regionHost.value.getBoundingClientRect()
  if (resizing === 'primary') {
    layout.updateShell({ primaryWidth: event.clientX - rect.left }, { persist: false })
  } else if (resizing === 'secondary') {
    layout.updateShell({ secondaryWidth: rect.right - event.clientX }, { persist: false })
  } else {
    layout.updateShell({ bottomHeight: rect.bottom - event.clientY }, { persist: false })
  }
}

function stopResize() {
  window.removeEventListener('pointermove', resizeRegion)
  document.body.classList.remove('is-resizing-studio')
  resizing = null
  layout.persistShell()
}

function resizeWithKeyboard(region, event) {
  const step = event.shiftKey ? 40 : 16
  let delta = 0
  if (region === 'primary') {
    if (event.key === 'ArrowLeft') delta = -step
    if (event.key === 'ArrowRight') delta = step
    if (delta) layout.updateShell({ primaryWidth: layout.shell.primaryWidth + delta })
  } else if (region === 'secondary') {
    if (event.key === 'ArrowLeft') delta = step
    if (event.key === 'ArrowRight') delta = -step
    if (delta) layout.updateShell({ secondaryWidth: layout.shell.secondaryWidth + delta })
  } else {
    if (event.key === 'ArrowUp') delta = step
    if (event.key === 'ArrowDown') delta = -step
    if (delta) layout.updateShell({ bottomHeight: layout.shell.bottomHeight + delta })
  }
  if (delta) event.preventDefault()
}

async function stopRun() {
  if (!activeRun.value) return
  try {
    await runs.cancel(activeRun.value.id)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Run 停止失败' })
  }
}

const leaveDialog = ref(false)
const leaving = ref(false)

async function goHub() {
  try {
    if ((await dock.value?.prepareCloseAll('project-exit')) === false) return
    if (simulation.instance || workflows.active || robots.active.length || activeRun.value) {
      leaveDialog.value = true
      return
    }
    await router.push('/projects')
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '离开 Project 失败' })
  }
}

async function confirmLeave() {
  if (leaving.value) return
  leaving.value = true
  try {
    await router.push('/projects')
    leaveDialog.value = false
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '离开 Project 失败' })
  } finally {
    leaving.value = false
  }
}

function onPanelsClosed(panels) {
  if (!movingConversation && panels.some((panel) => panel.panelType === 'conversation')) {
    maximizedConversation.value = false
    layout.updateShell({ conversationOpen: false })
  }
  const running = panels.some(
    (panel) =>
      (panel.panelType === 'scene-workspace' && simulation.instance) ||
      (panel.panelType === 'workflow-run' &&
        [...workflows.items, workflows.workflow]
          .filter(Boolean)
          .some(
            (item) =>
              item.id === panel.resourceId &&
              ['pending', 'running', 'paused', 'stopping'].includes(item.status)
          )) ||
      (panel.panelType === 'runtime' && robots.active.some((item) => item.id === panel.resourceId))
  )
  if (running)
    ui.notify({ type: 'info', message: '工作仍在后台运行，可从“场景”或“执行历史”重新打开。' })
}

function confirmBrowserExit(event) {
  if (
    !simulation.instance &&
    !workflows.active &&
    !robots.active.length &&
    !activeRun.value &&
    !dock.value?.hasDirtyPanels()
  )
    return
  // 浏览器离开只提示；执行生命周期由 Server 和显式停止操作管理。
  event.preventDefault()
  event.returnValue = ''
}

watch(projectId, bootstrap, { immediate: true })

onMounted(() => {
  setStudioPanelOpener(routePanel)
  window.addEventListener('beforeunload', confirmBrowserExit)
  deviceRetryTimer = window.setInterval(() => {
    if (project.snapshotStatus === 'ready' && (devices.stale || devices.snapshotStatus === 'error'))
      void refreshDeviceCatalog()
  }, 5000)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', confirmBrowserExit)
  bootstrapGeneration += 1
  deviceGeneration += 1
  window.clearInterval(deviceRetryTimer)
  subscription?.stop()
  deviceSubscription?.stop()
  stopResize()
  clearStudioPanelOpener()
  clearStudioState()
})

onUnmounted(() => {
  layout.clearProject()
})
</script>

<style scoped lang="scss">
.studio-shell {
  display: flex;
  height: 100vh;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--sf-bg-canvas);
}
.conversation-parking {
  display: none;
}
.maximized-conversation {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--sf-bg-primary);
}

.studio-topbar {
  display: flex;
  align-items: center;
  height: 48px;
  flex: none;
  gap: 9px;
  padding: 0 12px;
  border-bottom: 1px solid var(--sf-border);
  background: color-mix(in srgb, var(--sf-bg-secondary) 94%, var(--sf-brand-soft));
  box-shadow: 0 1px 0 color-mix(in srgb, var(--sf-brand) 5%, transparent);
}

.brand-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px 0 9px;
  flex: none;
  border: 0;
  border-radius: 8px;
  background: var(--sf-bg-hover);
  color: var(--sf-text-primary);
  font-size: 12px;
  font-weight: 450;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  .brand-icon {
    font-size: 14px;
  }

  span {
    white-space: nowrap;
  }

  &:hover {
    background: var(--sf-brand);
    color: #fff;
  }
}

.project-context {
  display: flex;
  min-width: 150px;
  max-width: 300px;
  flex-direction: column;

  small {
    color: var(--sf-text-disabled);
    font-size: 10px;
    font-weight: 380;
    letter-spacing: 0.09em;
  }

  b {
    overflow: hidden;
    color: var(--sf-text-primary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.mode-chip,
.fixture-chip {
  padding: 4px 8px;
  border: 1px solid var(--sf-border-light);
  border-radius: 999px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
  font-size: 11px;
}

.fixture-chip {
  border-color: color-mix(in srgb, var(--sf-warning) 35%, var(--sf-border));
  color: var(--sf-warning);
  font-weight: 520;
}

.topbar-spacer,
.status-spacer {
  flex: 1;
}

.preset-control {
  display: flex;
  align-items: center;
  gap: 7px;

  > span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }

  :deep(.el-select) {
    width: 88px;
  }
}

.layout-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-tertiary);

  button {
    display: grid;
    width: 29px;
    height: 27px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--sf-text-disabled);
    cursor: pointer;
    place-items: center;

    &:hover,
    &.active {
      background: var(--sf-bg-secondary);
      color: var(--sf-brand);
      box-shadow: var(--sf-shadow-sm);
    }
  }
}

.layout-glyph {
  display: block;
  position: relative;
  width: 16px;
  height: 13px;
  border: 1.5px solid currentColor;
  border-radius: 4px;

  &::after {
    position: absolute;
    border-radius: 2px;
    background: currentColor;
    content: '';
  }

  &.is-primary::after {
    top: 1px;
    bottom: 1px;
    left: 3px;
    width: 1.5px;
  }

  &.is-secondary::after {
    top: 1px;
    right: 3px;
    bottom: 1px;
    width: 1.5px;
  }

  &.is-bottom::after {
    right: 1px;
    bottom: 3px;
    left: 1px;
    height: 1.5px;
  }
}

.topbar-icon-button {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  place-items: center;

  &:hover {
    background: var(--sf-bg-hover);
    color: var(--sf-brand);
  }

  svg {
    width: 16px;
  }
}

.studio-body {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.activity-bar {
  display: flex;
  width: 64px;
  flex: none;
  flex-direction: column;
  gap: 10px;
  padding: 10px 6px;
  border-right: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);

  button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    height: 54px;
    flex-direction: column;
    gap: 4px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--sf-text-secondary);
    cursor: pointer;

    svg {
      width: 20px;
      transition:
        fill 120ms ease,
        stroke-width 120ms ease;
    }

    span {
      font-size: 11px;
    }

    em {
      display: grid;
      position: absolute;
      top: 2px;
      right: 1px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border: 2px solid var(--sf-bg-secondary);
      border-radius: 999px;
      background: var(--sf-danger);
      color: white;
      font-size: 10px;
      font-style: normal;
      place-items: center;
    }

    &:hover {
      background: var(--sf-bg-hover);
      color: var(--sf-brand);
    }

    &.active {
      background: linear-gradient(135deg, var(--sf-brand) 0%, var(--sf-brand-active) 100%);
      color: white;
      box-shadow: 0 2px 8px color-mix(in srgb, var(--sf-brand) 12%, transparent);

      svg {
        fill: currentColor;
        stroke-width: 2.2;
      }
    }
  }

  .settings-button {
    margin-top: auto;
  }
}

.studio-regions {
  position: relative;
  display: flex;
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: var(--sf-bg-canvas);
}

.inspector-backdrop {
  display: none;
}

.primary-sidebar,
.context-inspector {
  flex: none;
}

.editor-column {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 8px 8px 0;
}

.studio-workspace {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.region-resizer {
  position: relative;
  z-index: 4;
  flex: none;
  touch-action: none;

  &::after {
    position: absolute;
    border-radius: 4px;
    background: transparent;
    content: '';
    transition: background 120ms ease;
  }

  &:hover::after {
    background: var(--sf-brand);
  }

  &:focus-visible::after {
    background: var(--sf-brand);
  }

  &.is-vertical {
    width: 5px;
    cursor: col-resize;

    &::after {
      top: 0;
      bottom: 0;
      left: 2px;
      width: 1px;
    }
  }

  &.is-horizontal {
    height: 6px;
    cursor: row-resize;

    &::after {
      top: 2px;
      right: 0;
      left: 0;
      height: 1px;
    }
  }
}

.bootstrap-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  color: var(--sf-text-secondary);

  &.error b {
    color: var(--sf-danger);
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.status-bar {
  display: flex;
  align-items: center;
  height: 24px;
  flex: none;
  gap: 16px;
  padding: 0 10px;
  border-top: 1px solid var(--sf-border-light);
  background: color-mix(in srgb, var(--sf-bg-secondary) 88%, var(--sf-brand-soft));
  color: var(--sf-text-secondary);
  font-size: 11px;

  > span {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    max-width: 260px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stale {
    color: var(--sf-warning);
  }
}

@media (max-width: 1100px) {
  .studio-workspace :deep(.dv-tabs-and-actions-container) {
    position: relative;
    z-index: 10;
  }

  .inspector-backdrop {
    display: block;
    position: absolute;
    z-index: 7;
    top: 36px;
    right: 0;
    bottom: 0;
    left: 0;
    border: 0;
    background: color-mix(in srgb, #000 28%, transparent);
    cursor: pointer;
  }

  .context-inspector {
    position: absolute;
    z-index: 8;
    top: 36px;
    right: 0;
    bottom: 0;
    height: calc(100% - 52px);
    box-shadow: var(--sf-shadow-md);
  }

  .region-resizer.is-secondary {
    display: none;
  }

  .preset-control > span,
  .mode-chip,
  .fixture-chip {
    display: none;
  }
}

@media (max-width: 760px) {
  .primary-sidebar {
    position: absolute;
    z-index: 9;
    top: 0;
    bottom: 0;
    left: 0;
    max-width: calc(100vw - 72px);
    height: calc(100% - 16px);
    box-shadow: var(--sf-shadow-md);
  }

  .primary-sidebar + .region-resizer,
  .layout-controls,
  .topbar-icon-button,
  .status-bar > span:nth-child(n + 2):not(:last-child) {
    display: none;
  }

  .project-context {
    min-width: 0;
  }
}

// 离开 Project 确认弹窗：与归档 Project、移除 Robot Skill 等确认弹窗保持同一结构
.leave-project-dialog {
  :deep(.el-dialog__body) {
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .leave-confirm-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 8px 16px 16px;
  }

  .leave-icon {
    width: 96px;
    height: 96px;
    margin-bottom: 24px;

    svg {
      width: 100%;
      height: 100%;
    }
  }

  .leave-confirm-title {
    margin: 0 0 8px;
    color: var(--sf-text-primary);
    font-size: 17px;
    font-weight: 500;
  }

  .leave-confirm-desc {
    margin: 0;
    color: var(--sf-text-secondary);
    font-size: 14px;
    line-height: 1.7;
  }
}
</style>

<style>
body.is-resizing-studio {
  cursor: grabbing;
  user-select: none;
}
</style>
