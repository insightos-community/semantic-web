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
  <div class="chat-view">
    <header class="workbench-toolbar">
      <div class="workspace-context">
        <span class="context-mark">W</span>
        <div>
          <b>Embodied Agent Workbench</b>
          <span>对话运行与调试</span>
        </div>
        <i />
        <span class="context-agent">{{ leaderSummary }}</span>
      </div>
      <div class="layout-switch" aria-label="工作台布局">
        <span>布局</span>
        <el-tooltip
          v-for="item in layoutOptions"
          :key="item.id"
          :content="item.description"
          effect="dark"
          :show-after="500"
          placement="bottom"
        >
          <button
            type="button"
            :class="{ active: layoutMode === item.id }"
            @click="setLayout(item.id)"
          >
            {{ item.label }}
          </button>
        </el-tooltip>
      </div>
    </header>

    <div
      class="workspace-grid"
      :class="`is-${layoutMode}`"
      :style="{
        '--session-pane-width': `${sessionPaneWidth}px`,
        '--inspector-pane-width': `${inspectorPaneWidth}px`
      }"
    >
      <!-- 左栏：会话列表（SideList 统一容器；只列 ChatSession，最近活跃倒序） -->
      <SideList v-if="layoutMode !== 'focus'" :width="`${sessionPaneWidth}px`">
        <template #title>会话</template>
        <template #actions>
          <el-tooltip content="新建对话" effect="dark" :show-after="500" placement="top">
            <el-button size="small" text :icon="Plus" :loading="creating" @click="onCreateSession">
              新建
            </el-button>
          </el-tooltip>
        </template>
        <EmptyState v-if="chat.sessions.length === 0" description="暂无会话，点击右上角新建" />
        <ul v-else class="session-list">
          <li
            v-for="s in chat.sessions"
            :key="s.id"
            :class="{ active: s.id === chat.currentSessionId }"
            @click="onSelectSession(s.id)"
          >
            <span class="session-title">{{ s.title || s.id }}</span>
            <span class="session-time">{{ formatTime(s.updated_at) }}</span>
            <el-tooltip content="归档会话" effect="dark" :show-after="500" placement="top">
              <el-button
                class="session-delete"
                text
                :icon="Delete"
                aria-label="归档会话"
                @click.stop="onDeleteSession(s)"
              />
            </el-tooltip>
          </li>
        </ul>
      </SideList>

      <div
        v-if="layoutMode !== 'focus'"
        class="pane-resizer"
        role="separator"
        aria-label="调整会话列表宽度"
        @pointerdown="startResize('session', $event)"
      />

      <!-- 中栏：消息流 + 输入区（有待应答审批时输入区上方置顶最新一张审批卡） -->
      <section class="chat-main">
        <div class="pane-header">
          <div class="conversation-heading">
            <span class="conversation-kicker">AGENT WORKSPACE</span>
            <strong>{{ chat.currentSession?.title || '新对话' }}</strong>
          </div>
          <div class="conversation-status">
            <span class="status-copy">{{ statusText }}</span>
            <i
              class="sf-status-dot"
              :data-status="chat.connectionStatus === CONNECTION_STATUS.ONLINE ? 'success' : 'idle'"
            />
          </div>
        </div>
        <MessageStream />
        <transition name="el-fade-in">
          <div v-if="chat.currentPendingInteraction" class="pinned-approval">
            <ApprovalCard :interaction="chat.currentPendingInteraction" />
          </div>
        </transition>
        <PromptInput />
      </section>

      <div
        v-if="layoutMode === 'debug'"
        class="pane-resizer"
        role="separator"
        aria-label="调整检查器宽度"
        @pointerdown="startResize('inspector', $event)"
      />

      <WorkbenchInspector v-if="layoutMode === 'debug'" />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import EmptyState from '@/components/base/EmptyState.vue'
import SideList from '@/components/base/SideList.vue'
import ApprovalCard from '@/components/chat/ApprovalCard.vue'
import MessageStream from '@/components/chat/MessageStream.vue'
import PromptInput from '@/components/chat/PromptInput.vue'
import WorkbenchInspector from '@/components/chat/WorkbenchInspector.vue'
import { CONNECTION_STATUS, useChatStore } from '@/stores/chat'
import { useAgentsStore } from '@/stores/agents'
import { useUiStore } from '@/stores/ui'

const chat = useChatStore()
const agents = useAgentsStore()
const ui = useUiStore()

const creating = ref(false)
const layoutMode = ref(window.localStorage.getItem('sf-chat-layout') || 'debug')
const sessionPaneWidth = ref(readPaneWidth('sf-chat-session-pane', 250, 210, 380))
const inspectorPaneWidth = ref(readPaneWidth('sf-chat-inspector-pane', 310, 260, 480))
let stopResize = null

const layoutOptions = [
  { id: 'debug', label: '调试', description: '会话、对话与运行检查器同时显示' },
  { id: 'dialogue', label: '对话', description: '保留会话列表，隐藏运行检查器' },
  { id: 'focus', label: '专注', description: '只显示当前对话' }
]

const leaderSummary = computed(() => {
  const leader = agents.agents.find((item) => item.id === 'leader') || agents.agents[0]
  return leader ? `${leader.id} · ${leader.model || '未配置模型'}` : 'Leader · 加载中'
})

function setLayout(mode) {
  if (!layoutOptions.some((item) => item.id === mode)) return
  layoutMode.value = mode
  window.localStorage.setItem('sf-chat-layout', mode)
}

onMounted(async () => {
  try {
    await chat.loadSessions()
  } catch (e) {
    ui.notify({ type: 'error', message: `会话列表加载失败：${e.message}` })
  }
  // 刷新后自动选中最近活跃会话（列表已按活跃倒序）：selectSession 内含
  // 审批卡 REST 恢复（R19），刷新前待应答的审批卡随之重建
  if (chat.currentSessionId || chat.sessions.length > 0) {
    try {
      await chat.selectSession(chat.currentSessionId || chat.sessions[0].id)
      await agents.loadSessionAgents(chat.currentSessionId)
    } catch (e) {
      ui.notify({ type: 'error', message: `消息加载失败：${e.message}` })
    }
  }
  // 协作侧栏 Team 状态区：roster 加载 + 30s 轮询（与 Agents 管理页共享
  // 同一定时器，agents store 引用计数协调）
  try {
    await agents.load()
  } catch (e) {
    ui.notify({ type: 'error', message: e.message || 'Team 成员加载失败' })
  }
  agents.startPolling()
})

// 离开对话页（含退出登录跳 /login）：关闭 /ws/chat，避免挂着死 token 空转重连；
// 并释放本页的 roster 轮询引用
onBeforeUnmount(() => {
  stopResize?.()
  chat.closeChat()
  agents.stopPolling()
})

function readPaneWidth(key, fallback, min, max) {
  const value = Number(window.localStorage.getItem(key))
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function startResize(side, event) {
  stopResize?.()
  event.preventDefault()
  const startX = event.clientX
  const startWidth = side === 'session' ? sessionPaneWidth.value : inspectorPaneWidth.value
  const min = side === 'session' ? 210 : 260
  const max = side === 'session' ? 380 : 480
  const storageKey = side === 'session' ? 'sf-chat-session-pane' : 'sf-chat-inspector-pane'
  const onMove = (moveEvent) => {
    const delta = moveEvent.clientX - startX
    const next = startWidth + (side === 'session' ? delta : -delta)
    const width = Math.min(max, Math.max(min, next))
    if (side === 'session') sessionPaneWidth.value = width
    else inspectorPaneWidth.value = width
  }
  const onUp = () => {
    const width = side === 'session' ? sessionPaneWidth.value : inspectorPaneWidth.value
    window.localStorage.setItem(storageKey, String(width))
    stopResize?.()
  }
  document.body.classList.add('sf-pane-resizing')
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
  stopResize = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.classList.remove('sf-pane-resizing')
    stopResize = null
  }
}

async function onSelectSession(id) {
  try {
    await chat.selectSession(id)
    await agents.loadSessionAgents(id)
  } catch (e) {
    ui.notify({ type: 'error', message: `消息加载失败：${e.message}` })
  }
}

async function onDeleteSession(session) {
  try {
    await ElMessageBox.confirm(
      `归档会话“${session.title || session.id}”？消息和运行记录不会被物理删除。`,
      '归档会话',
      {
        type: 'warning',
        confirmButtonText: '归档',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  try {
    await chat.deleteSession(session.id)
    agents.clearSessionAgents(session.id)
    if (chat.currentSessionId) await agents.loadSessionAgents(chat.currentSessionId)
    ui.notify({ type: 'success', message: '会话已归档' })
  } catch (e) {
    ui.notify({ type: 'error', message: `归档失败：${e.message}` })
  }
}

async function onCreateSession() {
  if (creating.value) return
  creating.value = true
  try {
    const created = await chat.createSession()
    if (created?.id) await agents.loadSessionAgents(created.id)
  } catch (e) {
    ui.notify({ type: 'error', message: `新建会话失败：${e.message}` })
  } finally {
    creating.value = false
  }
}

// 会话更新时间：当天显示 HH:mm，跨天显示 MM-DD HH:mm
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return hm
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

const statusText = computed(() => {
  const map = {
    [CONNECTION_STATUS.ONLINE]: '已连接',
    [CONNECTION_STATUS.CONNECTING]: '连接中',
    [CONNECTION_STATUS.RECONNECTING]: '重连中',
    [CONNECTION_STATUS.OFFLINE]: '未连接'
  }
  return map[chat.connectionStatus] || chat.connectionStatus
})
</script>

<style scoped lang="scss">
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.workbench-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  flex: none;
  padding: 0 14px;
  border-bottom: 1px solid var(--sf-border-light);
  background: color-mix(in srgb, var(--sf-bg-secondary) 88%, var(--sf-bg-tertiary));
}

.workspace-context {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;

  > div {
    display: flex;
    flex-direction: column;
  }
  b {
    color: var(--sf-text-primary);
    font-size: 12px;
    font-weight: 380;
  }
  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
  > i {
    width: 1px;
    height: 22px;
    background: var(--sf-border-light);
  }
}

.context-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border-radius: 8px;
  background: var(--sf-brand);
  color: #fff !important;
  font-weight: 380;
}

.context-agent {
  overflow: hidden;
  max-width: 230px;
  color: var(--sf-text-secondary) !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-switch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-tertiary);

  > span {
    padding: 0 6px;
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
  button {
    padding: 4px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--sf-text-secondary);
    font-size: 11px;
    cursor: pointer;
    &.active {
      background: var(--sf-bg-secondary);
      color: var(--sf-brand);
      box-shadow: var(--sf-shadow-sm);
    }
  }
}

.workspace-grid {
  display: grid;
  min-height: 0;
  flex: 1;
  gap: 0;
  padding: 9px;
  overflow: hidden;

  &.is-debug {
    grid-template-columns: var(--session-pane-width) 5px minmax(360px, 1fr) 5px var(
        --inspector-pane-width
      );
  }
  &.is-dialogue {
    grid-template-columns: var(--session-pane-width) 5px minmax(360px, 1fr);
  }
  &.is-focus {
    grid-template-columns: minmax(360px, 1fr);
  }
}

.pane-resizer {
  position: relative;
  z-index: 2;
  cursor: col-resize;

  &::after {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: var(--sf-border-light);
    content: '';
    transition: background 0.15s ease;
  }

  &:hover::after {
    background: var(--sf-brand);
  }
}

.chat-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  padding: 0 var(--sf-space-4);
  border-bottom: 1px solid var(--sf-border-light);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
}

.conversation-heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;

  strong {
    overflow: hidden;
    color: var(--sf-text-primary);
    font-size: var(--sf-font-md);
    font-weight: 630;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.conversation-kicker {
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.12em;
}

.conversation-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 5px 9px;
  border: 1px solid var(--sf-border-light);
  border-radius: 999px;
  background: var(--sf-bg-tertiary);
}

.status-copy {
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}

.session-list {
  margin: 0;
  padding: var(--sf-space-2);
  list-style: none;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sf-space-2);
    padding: var(--sf-space-2) var(--sf-space-3);
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--sf-text-secondary);
    cursor: pointer;

    &:hover {
      background: var(--sf-bg-hover);
    }

    &.active {
      border-color: color-mix(in srgb, var(--sf-brand) 22%, var(--sf-border-light));
      background: var(--sf-brand-soft);
      color: var(--sf-text-primary);
    }

    .session-delete {
      width: 24px;
      flex: none;
      opacity: 0;
    }

    &:hover .session-delete,
    &.active .session-delete {
      opacity: 1;
    }
  }
}

@media (max-width: 1180px) {
  .workspace-grid.is-debug {
    grid-template-columns: var(--session-pane-width) 5px minmax(360px, 1fr);
  }

  .workspace-grid.is-debug > .pane-resizer:nth-last-of-type(1),
  .workspace-grid.is-debug > :deep(.workbench-inspector) {
    display: none;
  }
}

.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-time {
  flex: none;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

// 输入区上方置顶的审批卡（有待应答时出现）
.pinned-approval {
  padding: var(--sf-space-2) var(--sf-space-4);
  border-top: 1px solid var(--sf-border-light);
  background: var(--sf-bg-tertiary);
}
</style>
