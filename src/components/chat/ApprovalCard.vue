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
  <!-- confirm 审批卡（docs/api/ws.md interaction 频道；payload 字段以
       internal/interaction/service.go RequestPayload 为准）。
       pending：问题文本 + risk 徽标（high/critical 用 danger 色）+ 倒计时 + 批准/拒绝；
       resolved：结果徽标（已批准/已拒绝/已超时/已取消，含刷新后 REST 恢复的历史行）。
       倒计时仅本地展示：耗尽置灰禁用按钮，但不主动判超时——超时以服务端为准
       （默认 300s 按拒绝处理），卡片出队由应答或 message.done 对账驱动。 -->
  <div
    class="approval-card"
    :class="{ 'is-resolved': isResolved, 'is-faded': fadedShown }"
    :data-risk="interaction.risk || 'unknown'"
  >
    <div class="card-head">
      <el-tag size="small" :type="riskTagType" effect="plain" class="risk-tag">
        风险 {{ riskText }}
      </el-tag>
      <span class="card-agent">{{ interaction.agentName }} 请求审批</span>
      <span v-if="isPending && hasDeadline && !countdownOut" class="card-countdown">
        剩余 {{ remainText }}
      </span>
      <span v-else-if="isPending && countdownOut" class="card-countdown is-out">已超时</span>
      <el-tag v-if="isResolved" size="small" :type="resultTagType" effect="plain">
        {{ resultText }}
      </el-tag>
    </div>
    <div class="card-question">{{ interaction.question }}</div>
    <div v-if="isPending" class="card-actions">
      <el-button
        type="primary"
        size="small"
        :disabled="countdownOut || submitting"
        :loading="submitting && acting === 'approve'"
        @click="onReply(true)"
      >
        批准
      </el-button>
      <el-button
        size="small"
        :disabled="countdownOut || submitting"
        :loading="submitting && acting === 'reject'"
        @click="onReply(false)"
      >
        拒绝
      </el-button>
      <span v-if="countdownOut" class="expired-tip">已超时，等待服务端按拒绝处理</span>
      <span v-else-if="submitting" class="submitting-tip">提交中，等待 Server 确认…</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useInteractionsStore } from '@/stores/interactions'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  interaction: { type: Object, required: true } // chat store 的审批记录（响应式共享）
})

const chat = useChatStore()
const interactions = useInteractionsStore()
const ui = useUiStore()

const acting = ref('') // 'approve' | 'reject'（点击后 loading 防重复）
const now = ref(Date.now())
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const isPending = computed(() => props.interaction.status === 'pending')
const isResolved = computed(() => !isPending.value)
const managedByStudio = computed(() => Boolean(interactions.records[props.interaction.id]))
const submitting = computed(() =>
  managedByStudio.value ? interactions.isSubmitting(props.interaction.id) : Boolean(acting.value)
)

const hasDeadline = computed(() => props.interaction.timeoutTs > 0)
const remainMs = computed(() => Math.max(0, props.interaction.timeoutTs * 1000 - now.value))
// 本地倒计时耗尽：仅置灰提示，不判超时（服务端为准，卡片待对账出队）
const countdownOut = computed(() => isPending.value && hasDeadline.value && remainMs.value <= 0)
// 灰化展示：本地倒计时耗尽，或已终结且结果为已超时/已取消（含 REST 恢复的历史行）
const fadedShown = computed(
  () =>
    countdownOut.value ||
    (isResolved.value &&
      (props.interaction.result === 'expired' || props.interaction.result === 'cancelled'))
)

const remainText = computed(() => {
  const total = Math.ceil(remainMs.value / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
})

const RISK_TEXT = { low: '低', medium: '中', high: '高', critical: '严重' }
const riskText = computed(
  () => RISK_TEXT[props.interaction.risk] || props.interaction.risk || '未知'
)
const riskTagType = computed(() => {
  const r = props.interaction.risk
  if (r === 'high' || r === 'critical') return 'danger'
  if (r === 'medium') return 'warning'
  if (!r) return 'warning'
  return 'info'
})

const RESULT_TEXT = {
  approved: '已批准',
  rejected: '已拒绝',
  expired: '已超时',
  cancelled: '已取消'
}
const resultText = computed(() => RESULT_TEXT[props.interaction.result] || '已终结')
const resultTagType = computed(() => {
  const r = props.interaction.result
  if (r === 'approved') return 'success'
  if (r === 'rejected') return 'danger'
  return 'info'
})

async function onReply(approved) {
  if (submitting.value || countdownOut.value) return
  acting.value = approved ? 'approve' : 'reject'
  const ok = managedByStudio.value
    ? await interactions.submit(props.interaction.id, { approved })
    : chat.replyInteraction(props.interaction.id, approved)
  if (!ok) {
    acting.value = ''
    ui.notify({ type: 'error', message: '应答失败：连接不可用或交互已终结' })
  }
}
</script>

<style scoped lang="scss">
.approval-card {
  position: relative;
  padding: var(--sf-space-3);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);

  &::before {
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: -1px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--sf-warning);
    content: '';
  }

  &[data-risk='low']::before {
    background: var(--sf-info);
  }

  &[data-risk='high']::before,
  &[data-risk='critical']::before {
    background: var(--sf-danger);
  }

  &.is-resolved {
    border-color: var(--sf-border-light);

    &::before {
      background: var(--sf-text-disabled);
    }
  }

  &.is-faded {
    opacity: 0.65;
  }
}

.card-head {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  margin-bottom: var(--sf-space-2);
}

.card-agent {
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}

.card-countdown {
  margin-left: auto;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  font-variant-numeric: tabular-nums;

  &.is-out {
    color: var(--sf-danger);
  }
}

.card-head :deep(.el-tag) {
  margin-left: auto;
}

.card-head .risk-tag {
  margin-left: 0;
}

.card-question {
  margin-bottom: var(--sf-space-3);
  color: var(--sf-text-primary);
  font-size: var(--sf-font-sm);
  line-height: 1.5;
  word-break: break-word;
}

.is-resolved .card-question {
  margin-bottom: 0;
  color: var(--sf-text-secondary);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
}

.expired-tip {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.submitting-tip {
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}
</style>
