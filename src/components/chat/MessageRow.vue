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
  <!-- 行编排（17-web-ui-design §6.1）：角色色边条 + 徽标 + 时间戳 + 状态。
       interaction 频道行渲染为 ApprovalCard（F4）；delegation 类型行渲染为
       SubAgentBlock 委派块（R14，整块接管行呈现）；tool.result 归并到
       助手行并由 ToolCallBlock 折叠展示。 -->
  <SubAgentBlock v-if="delegationRecord" :delegation="delegationRecord" />
  <template v-else>
    <div
      class="message-row"
      :class="[`is-${kind}`, { 'is-compact': compact }]"
      :style="{ '--row-color': barColor }"
    >
      <div class="row-avatar" :style="{ '--row-color': barColor }">{{ avatarText }}</div>
      <div class="row-main">
        <div class="row-header">
          <span class="row-badge" :style="{ color: barColor, borderColor: barColor }">
            {{ badge }}
          </span>
          <span class="row-time">{{ timeText }}</span>
          <span v-if="message.targetAgentId" class="row-time"
            >→ {{ message.targetAgentId.replace(/^robot:/u, '') }}</span
          >
          <span v-if="message.status === 'error'" class="row-error">
            {{ message.error || '本轮回复失败' }}
          </span>
          <span v-else-if="message.status === 'cancelled'" class="row-cancelled">已中断</span>
          <span v-else-if="message.usage" class="row-usage">{{ usageText }}</span>
          <el-tooltip
            v-if="traceable"
            content="查看本轮运行的链路追踪"
            effect="dark"
            :show-after="500"
            placement="top"
          >
            <span class="row-trace" :class="{ 'is-busy': tracing }" @click="onTrace"> 追踪 </span>
          </el-tooltip>
        </div>
        <details
          v-for="round in message.reasoningRounds?.length
            ? message.reasoningRounds
            : message.reasoning
              ? [{ turn: 0, text: message.reasoning }]
              : []"
          :key="round.turn"
          class="reasoning-block"
          :open="
            message.status === 'streaming' &&
            (!message.reasoningRounds?.length || round === message.reasoningRounds.at(-1))
          "
        >
          <summary>
            思考<span v-if="round.turn"> · 第 {{ round.turn }} 轮</span
            ><span
              v-if="message.status === 'streaming' && round === message.reasoningRounds?.at(-1)"
              >进行中</span
            >
          </summary>
          <ReasoningText :text="round.text" />
        </details>
        <section v-if="hasExecution" class="row-activity">
          <div class="activity-label">
            执行
            <span>{{ executionSummary }}</span>
          </div>
          <SubAgentBlock
            v-for="delegation in message.delegations || []"
            :key="delegation.id"
            :delegation="delegation"
          />
          <ToolCallBlock
            v-for="call in message.toolCalls || []"
            :key="call.id || call.name"
            :call="call"
          />
        </section>
        <AttachmentGallery v-if="message.attachments?.length" :attachments="message.attachments" />
        <!-- interaction 行的消息正文按设计为空，实际内容来自 ApprovalCard。
             必须把 interactionRecord 作为独立渲染条件，否则只会留下头像和
             时间戳，审批按钮虽然存在于 store，却不会出现在对话时间线。 -->
        <div
          v-if="
            interactionRecord ||
            message.text ||
            (message.status === 'streaming' && (!compact || (!message.reasoning && !hasExecution)))
          "
          class="row-body"
        >
          <InteractionShell v-if="studioInteractionRecord" :interaction="studioInteractionRecord" />
          <ApprovalCard v-else-if="interactionRecord" :interaction="interactionRecord" />
          <div v-else-if="message.systemActivity" class="system-activity">
            <div class="system-activity__text">
              <div :class="{ 'activity-preview': longActivity && !activityExpanded }">
                <MessageBubbleText :text="message.text" />
              </div>
              <button
                v-if="longActivity"
                type="button"
                class="activity-expand"
                :aria-expanded="activityExpanded"
                @click="activityExpanded = !activityExpanded"
              >
                {{ activityExpanded ? '收起活动详情' : '展开活动详情' }}
              </button>
              <small v-if="message.activity?.reason">{{ message.activity.reason }}</small>
            </div>
            <button v-if="message.activity?.taskId" type="button" @click="openActivityTask">
              查看 Task
            </button>
          </div>
          <template v-else>
            <MessageBubbleText :text="message.text" />
            <span v-if="message.status === 'streaming'" class="stream-cursor" />
          </template>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup>
import { computed, ref } from 'vue'
import ReasoningText from './ReasoningText.vue'
import { useRouter } from 'vue-router'
import ApprovalCard from '@/components/chat/ApprovalCard.vue'
import InteractionShell from '@/components/interaction/InteractionShell.vue'
import MessageBubbleText from '@/components/chat/MessageBubbleText.vue'
import SubAgentBlock from '@/components/chat/SubAgentBlock.vue'
import ToolCallBlock from '@/components/chat/ToolCallBlock.vue'
import AttachmentGallery from '@/components/chat/AttachmentGallery.vue'
import { useChatStore } from '@/stores/chat'
import { useInteractionsStore } from '@/stores/interactions'
import { useUiStore } from '@/stores/ui'
import { openStudioPanel } from '@/studio/panelService'
import { inspectWorkflowTask } from '@/studio/inspectWorkflow'

const props = defineProps({
  compact: { type: Boolean, default: false },
  message: { type: Object, required: true }
})

const chat = useChatStore()
const interactions = useInteractionsStore()
const ui = useUiStore()
const router = useRouter()

// ---- "追踪"入口（run 维度）----
// 新消息通过 WS message.done 和 REST 历史直接携带 trace_id，点击时精确下钻。
// 缺少 trace_id 时明确提示不可定位，禁止用完成时间猜测附近 Trace。
const traceable = computed(
  () =>
    props.message.role === 'assistant' &&
    (props.message.status === 'done' || props.message.status === 'error')
)
const tracing = ref(false)
const activityExpanded = ref(false)
const longActivity = computed(
  () => props.message.systemActivity && props.message.text?.length > 160
)
const hasExecution = computed(() =>
  Boolean(props.message.toolCalls?.length || props.message.delegations?.length)
)
const executionSummary = computed(() => {
  const agents = props.message.delegations?.length || 0
  const tools = props.message.toolCalls?.length || 0
  return [agents ? `${agents} 个 SubAgent` : '', tools ? `${tools} 次工具调用` : '']
    .filter(Boolean)
    .join(' · ')
})

async function onTrace() {
  if (tracing.value) return
  tracing.value = true
  try {
    if (props.message.traceId) {
      if (
        openStudioPanel('trace', {
          resourceType: 'trace',
          resourceId: props.message.traceId,
          conversationId: chat.currentSessionId
        })
      ) {
        return
      }
      router.push(`/chat/${chat.currentSessionId}/trace/${props.message.traceId}`)
      return
    }
    ui.notify({ type: 'warning', message: '本条消息没有明确 Trace ID，无法定位链路' })
  } finally {
    tracing.value = false
  }
}

async function openActivityTask() {
  const activity = props.message.activity || {}
  if (!activity.taskId) return
  try {
    await inspectWorkflowTask({
      workflowId: activity.workflowId,
      taskId: activity.taskId,
      title: props.message.text || activity.reason
    })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '无法打开 Task' })
  }
}

// delegation 行：按 delegationId 取委派记录（与 store 共享同一响应式对象）
const delegationRecord = computed(() =>
  props.message.type === 'delegation'
    ? chat.delegationsById[props.message.delegationId] || null
    : null
)

// interaction 行：按 interactionId 取审批记录（与队列/置顶卡共享同一响应式对象）
const interactionRecord = computed(() =>
  props.message.channel === 'interaction'
    ? chat.interactionsById[props.message.interactionId] || null
    : null
)
const studioInteractionRecord = computed(() =>
  props.message.channel === 'interaction'
    ? interactions.records[props.message.interactionId] || null
    : null
)

// 行类别：user（我）/ assistant（Agent 回复）/ system（alert/artifact/interaction 等系统行）
const kind = computed(() => {
  if (props.message.role === 'user') return 'user'
  if (props.message.role === 'assistant') return 'assistant'
  return 'system'
})

// 角色色（--sf-role-* 令牌）：用户用品牌色；Agent 按名字映射，缺省 leader
const ROLE_COLORS = {
  leader: 'var(--sf-role-leader)',
  robot: 'var(--sf-role-robot)',
  monitor: 'var(--sf-role-monitor)',
  map: 'var(--sf-role-map)',
  studio: 'var(--sf-role-studio)'
}

const barColor = computed(() => {
  if (kind.value === 'user') return 'var(--sf-brand)'
  if (props.message.channel === 'interaction') return 'var(--sf-channel-interaction)'
  if (props.message.systemActivity) return 'var(--sf-text-disabled)'
  if (kind.value === 'system' && !props.message.systemActivity) return 'var(--sf-channel-alert)'
  return (
    ROLE_COLORS[props.message.agentRole] ||
    ROLE_COLORS[props.message.agentName?.split(':')[0]] ||
    'var(--sf-role-leader)'
  )
})

const badge = computed(() => {
  if (kind.value === 'user') return '我'
  if (props.message.systemActivity) return `系统活动 · ${props.message.agentName || 'Framework'}`
  return props.message.agentName || (kind.value === 'assistant' ? 'leader' : '系统')
})

const avatarText = computed(() => {
  if (kind.value === 'user') return '我'
  const name = badge.value
  return String(name || '?')
    .slice(0, 1)
    .toUpperCase()
})

const timeText = computed(() => {
  const d = new Date(props.message.ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const usageText = computed(() => {
  const u = props.message.usage
  return u?.total_tokens ? `${u.total_tokens} tokens` : ''
})
</script>

<style scoped lang="scss">
.message-row {
  display: flex;
  gap: var(--sf-space-3);
  padding: 10px 0;

  &.is-user {
    flex-direction: row-reverse;

    .row-header {
      justify-content: flex-end;
    }

    .row-body {
      margin-left: auto;
      background: var(--sf-brand-soft);
    }
  }
}

.row-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--row-color) 13%, var(--sf-bg-secondary));
  color: var(--row-color);
  font-size: var(--sf-font-xs);
  font-weight: 380;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--row-color) 20%, transparent);
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-header {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  margin-bottom: var(--sf-space-1);
}

.row-badge {
  border: none;
  font-size: var(--sf-font-xs);
  font-weight: 520;
  line-height: 20px;
}

.row-time {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.row-usage {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.row-error {
  color: var(--sf-danger);
  font-size: var(--sf-font-xs);
}

.row-cancelled {
  color: var(--sf-warning);
  font-size: var(--sf-font-xs);
}

// R19 "追踪"入口：done/error 的助手行右上角链接
.row-trace {
  margin-left: auto;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  cursor: pointer;

  &:hover {
    color: var(--sf-brand);
  }

  &.is-busy {
    cursor: wait;
    opacity: 0.6;
  }
}

.row-body {
  display: flex;
  align-items: flex-end;
  gap: var(--sf-space-1);
  width: fit-content;
  max-width: min(100%, 760px);
  padding: 11px 14px;
  border: 1px solid var(--sf-border-light);
  border-radius: 4px 14px 14px;
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.system-activity {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  max-width: 100%;

  .activity-preview {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .activity-expand {
    justify-self: start;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--sf-text-secondary);
  }

  &__text {
    display: grid;
    flex: 1;
    gap: 4px;
    min-width: 0;
  }

  small {
    color: var(--sf-text-disabled);
    font-size: var(--sf-font-xs);
  }

  button {
    flex: none;
    padding: 4px 8px;
    border: 1px solid var(--sf-border-light);
    border-radius: 7px;
    background: transparent;
    color: var(--sf-brand);
    font-size: var(--sf-font-xs);
    cursor: pointer;
  }
}

.row-activity {
  max-width: 760px;
  margin-bottom: 8px;
  padding: 9px;
  border: 1px solid var(--sf-border-light);
  border-radius: 11px;
  background: color-mix(in srgb, var(--sf-bg-tertiary) 76%, transparent);
}

.reasoning-block {
  max-width: min(100%, 760px);
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 9px;
  background: var(--sf-bg-tertiary);

  summary {
    color: var(--sf-text-secondary);
    font-size: var(--sf-font-xs);
    cursor: pointer;
  }

  summary span {
    margin-left: 6px;
    color: var(--sf-text-disabled);
  }

  pre {
    margin: 8px 0 0;
    color: var(--sf-text-secondary);
    font-size: var(--sf-font-xs);
    white-space: pre-wrap;
  }
}

.activity-label {
  margin: 0 4px 6px;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

// 流式中闪烁光标
.stream-cursor {
  flex: none;
  width: 8px;
  height: 16px;
  margin-bottom: 3px;
  background: var(--sf-brand);
  animation: cursor-blink 0.9s step-end infinite;
}

@keyframes cursor-blink {
  50% {
    opacity: 0;
  }
}
// 窄侧栏不保留头像专用列；由每条消息的 Agent 名称标明来源。
// 长引用在正文换行，代码块自行滚动，不能把整条对话撑出横向滚动条。
.is-compact {
  margin-bottom: 24px;
  min-width: 0;
  .row-avatar {
    display: grid;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    border-radius: 8px;
  }
  .row-main {
    min-width: 0;
    width: 100%;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--row-color) 25%, var(--sf-border-light));
    border-radius: 12px;
    background: color-mix(in srgb, var(--row-color) 5%, var(--sf-bg-secondary));
  }
  .row-header {
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .row-badge {
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .row-time,
  .row-usage,
  .row-trace {
    color: var(--sf-text-secondary);
  }
  .row-time,
  .row-usage,
  .row-error,
  .row-cancelled,
  .row-trace {
    font-size: 12px;
  }
  .row-body {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  :deep(.bubble-text) {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    font-size: 14px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  :deep(.bubble-text pre) {
    max-width: 100%;
    font-size: 13px;
  }
  :deep(.bubble-text table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
  }
  &.is-user .row-body {
    width: fit-content;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--sf-bg-tertiary);
  }
  .system-activity {
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
    padding-left: 10px;
    border-left: 2px solid var(--sf-border);
  }
  .system-activity__text {
    flex-basis: 100%;
  }
  .system-activity small,
  .system-activity button {
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .reasoning-block {
    padding: 6px 0;
    border: 0;
    background: transparent;
  }
  .reasoning-block summary {
    font-size: 12px;
  }
  .reasoning-block pre {
    max-height: 240px;
    overflow: auto;
    font: inherit;
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .row-activity {
    min-width: 0;
    padding: 8px;
    border-radius: 8px;
    background: transparent;
  }
  .activity-label {
    font-size: 12px;
  }
  :deep(.tool-name) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}
</style>
