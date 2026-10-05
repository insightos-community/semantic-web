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
  <!-- 消息流（17-web-ui-design §6.1）：顶部"加载更早"分页 + 新消息自动跟随。
       TODO(F5)：消息量上量后换虚拟滚动（设计稿 MessageStream=VirtualMessageList），
       Phase 1 按真实分页（50/页）控制渲染量，先不做。 -->
  <div class="message-stream-shell" :class="{ 'is-compact': compact }">
    <div ref="scrollEl" class="message-stream" @scroll.passive="onScroll">
      <div class="message-stream-inner">
        <div v-if="chat.hasEarlier" class="load-earlier">
          <el-button
            size="small"
            text
            :loading="chat.currentBucket?.loadingEarlier"
            @click="onLoadEarlier"
          >
            加载更早
          </el-button>
        </div>
        <ChatWelcome
          v-if="chat.messages.length === 0 && chat.currentSessionId"
          :compact="compact"
          @select="chat.setComposerDraft"
        />
        <EmptyState v-else-if="chat.messages.length === 0" description="请选择或新建会话" />
        <MessageRow v-for="m in chat.messages" :key="m.id" :message="m" :compact="compact" />
        <ConversationPlanSummary />
      </div>
    </div>
    <transition name="el-fade-in">
      <button v-if="showNewTip" class="new-tip" type="button" @click="onJumpLatest">
        有新消息 <span aria-hidden="true">↓</span>
      </button>
    </transition>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ChatWelcome from '@/components/chat/ChatWelcome.vue'
import MessageRow from '@/components/chat/MessageRow.vue'
import ConversationPlanSummary from '@/components/studio/ConversationPlanSummary.vue'
import { useChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'

const chat = useChatStore()
defineProps({ compact: { type: Boolean, default: false } })
const workflow = useWorkflowStore()

const scrollEl = ref(null)
const stickToBottom = ref(true) // 用户停在底部附近时才自动跟随
const showNewTip = ref(false)

const NEAR_BOTTOM_PX = 80
const LOAD_EARLIER_TOP_PX = 60

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
}

function scrollToBottom() {
  const el = scrollEl.value
  if (el?.clientHeight) el.scrollTop = el.scrollHeight
}

function onScroll() {
  const el = scrollEl.value
  if (!el?.clientHeight) return
  stickToBottom.value = isNearBottom(el)
  if (stickToBottom.value) showNewTip.value = false
  // 滚到顶部自动加载更早（与"加载更早"按钮同一路径，store 内防重入）
  if (el.scrollTop < LOAD_EARLIER_TOP_PX && chat.hasEarlier) {
    onLoadEarlier()
  }
}

// 加载更早一页：记录滚动高度，前插后补偿 scrollTop，保持阅读锚点不跳
async function onLoadEarlier() {
  const el = scrollEl.value
  const prevHeight = el?.scrollHeight ?? 0
  const prevTop = el?.scrollTop ?? 0
  const added = await chat.loadEarlierMessages()
  if (added > 0 && el) {
    await nextTick()
    el.scrollTop = prevTop + el.scrollHeight - prevHeight
  }
}

function onJumpLatest() {
  stickToBottom.value = true
  showNewTip.value = false
  scrollToBottom()
}

// 切换组件 Tab 或移动显示位置时，先保存阅读状态，再恢复同一条消息流。
// 隐藏容器的高度为零，不能把它当成“已经滚到底部”而改变跟随行为。
let savedViewport = null
function captureViewport() {
  if (scrollEl.value?.clientHeight)
    savedViewport = { top: scrollEl.value.scrollTop, follow: stickToBottom.value }
}
function restoreViewport() {
  if (!savedViewport || !scrollEl.value?.clientHeight) return
  stickToBottom.value = savedViewport.follow
  if (savedViewport.follow) scrollToBottom()
  else scrollEl.value.scrollTop = savedViewport.top
}
defineExpose({ captureViewport, restoreViewport })

// 新消息到达：贴底则跟随；用户已上翻则不强制拉底，亮"有新消息"浮钮
watch(
  () => chat.messages.length,
  async (next, prev) => {
    if (next === prev) return
    await nextTick()
    if (stickToBottom.value) {
      scrollToBottom()
    } else if (next > prev) {
      showNewTip.value = true
    }
  }
)

// 流式增量：贴底时逐 delta 跟随
watch(
  () => [chat.streaming?.text, chat.streaming?.toolCalls?.length],
  async () => {
    if (!stickToBottom.value) return
    await nextTick()
    scrollToBottom()
  }
)

// 计划是 Conversation 的结构化产物，因此和消息一起出现在滚动流中。新
// revision 或状态变化时沿用“用户位于底部才跟随”的规则，不把用户正在阅读的
// 历史强行拉回底部。
watch(
  () => [workflow.proposal?.id, workflow.proposal?.revision, workflow.proposal?.status],
  async () => {
    await nextTick()
    if (stickToBottom.value) scrollToBottom()
    else showNewTip.value = true
  }
)

// 切会话：复位跟随状态，消息加载完成后落底
watch(
  () => chat.currentSessionId,
  async () => {
    stickToBottom.value = true
    showNewTip.value = false
    await nextTick()
    scrollToBottom()
  }
)
</script>

<style scoped lang="scss">
.message-stream-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 0%, rgba(49, 92, 236, 0.045), transparent 28%),
    var(--sf-bg-primary);
}

.message-stream {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scroll-behavior: smooth;
}

.message-stream-inner {
  width: min(100%, 880px);
  min-height: 100%;
  margin: 0 auto;
  padding: 24px 30px 32px;
}

.load-earlier {
  display: flex;
  justify-content: center;
  padding-bottom: var(--sf-space-2);
}

.new-tip {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  padding: 8px 15px;
  border: none;
  border-radius: 999px;
  background: var(--sf-brand);
  color: #fff;
  font-size: var(--sf-font-sm);
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(49, 92, 236, 0.24);

  &:hover {
    background: var(--sf-brand-hover);
  }
}
.is-compact {
  min-width: 0;
  background: var(--sf-bg-primary);
  .message-stream-inner {
    width: 100%;
    min-width: 0;
    padding: 18px 14px 24px;
  }
  :deep(.plan-summary-message) {
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border-radius: 8px;
  }
  :deep(.plan-icon) {
    width: 26px;
    height: 26px;
  }
  :deep(.plan-copy > span),
  :deep(.plan-copy > small) {
    font-size: 12px;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }
  :deep(.plan-copy > b) {
    font-size: 14px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  :deep(.plan-actions) {
    grid-column: 1 / -1;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  :deep(.plan-actions .el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
