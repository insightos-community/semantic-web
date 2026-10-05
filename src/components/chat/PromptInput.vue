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
  <!-- Enter 发送 / Shift+Enter 换行；生成期间保留草稿，停止是独立动作。 -->
  <div
    class="prompt-input"
    :class="{ 'is-dragging': dragging, 'is-readonly': readOnly, 'is-compact': compact }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <div v-if="dragging" class="drop-overlay">
      <span>释放以添加图片</span>
      <small>支持一次拖入多张，最多 4 张</small>
    </div>
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      multiple
      :disabled="readOnly"
      @change="onFiles"
    />
    <div v-if="!compact" class="composer-meta">
      <span class="agent-pill"><i class="agent-dot" />{{ scopeLabel }}</span>
      <span class="scope-intent">{{ modeLabel }}</span>
      <ReasoningControl
        v-model:effort="reasoningEffort"
        v-model:visibility="reasoningVisibility"
        :disabled="readOnly"
      />
      <span class="composer-spacer" />
      <span>{{ readOnly ? props.readOnlyReason : '拖入 / 粘贴图片 · Enter 发送' }}</span>
    </div>
    <div v-if="attachments.length" class="attachment-strip">
      <div v-for="(item, index) in attachments" :key="item.id" class="attachment-chip">
        <img :src="item.previewUrl" :alt="item.name" />
        <span>{{ item.name }}</span>
        <el-tooltip content="移除图片" effect="dark" :show-after="500" placement="top">
          <button type="button" @click="removeAttachment(index)">×</button>
        </el-tooltip>
      </div>
    </div>
    <div v-if="mapBinding" class="map-reference-strip" data-testid="chat-map-binding">
      <span>
        <Location />
        <b>{{ mapSelectionLabel }}</b>
        <small>{{ mapBinding.map_id }} · generation {{ mapBinding.generation }}</small>
      </span>
      <el-tooltip content="移除地图引用" effect="dark" :show-after="500" placement="top">
        <button type="button" @click="clearMapSelection">×</button>
      </el-tooltip>
    </div>
    <div class="composer-body">
      <el-dropdown
        v-if="isConversationScope"
        placement="top-start"
        trigger="click"
        :disabled="readOnly"
        @command="selectMode"
      >
        <el-button
          class="mode-btn"
          text
          :icon="compact ? undefined : Plus"
          :title="`当前：${modeLabel}`"
        >
          <span v-if="compact" class="scope-intent">{{ modeLabel }}</span>
          <ArrowDown v-if="compact" />
        </el-button>
        <template #dropdown>
          <el-dropdown-menu class="conversation-mode-menu">
            <el-dropdown-item command="collaboration">
              <span><b>协作</b><small>与 Agent 对话并使用工具</small></span>
            </el-dropdown-item>
            <el-dropdown-item command="plan">
              <span><b>规划</b><small>生成计划，审阅后执行</small></span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <ConversationRecipient
        v-if="isConversationScope"
        ref="recipientPicker"
        v-model="recipientId"
        class="composer-recipient"
        :session-id="conversationId"
        :disabled="readOnly || noSession"
      />
      <el-tooltip
        v-if="isConversationScope"
        content="引用 Semantic Map 实体"
        effect="dark"
        :show-after="500"
        placement="top"
      >
        <span class="tooltip-reference">
          <el-button
            class="map-btn"
            :icon="Location"
            :disabled="readOnly || noSession"
            text
            @click="openMapSelection"
          />
        </span>
      </el-tooltip>
      <el-button
        class="upload-btn"
        :icon="Paperclip"
        :disabled="readOnly || uploading || attachments.length >= 4"
        title="添加图片（最多 4 张）"
        text
        @click="fileInput?.click()"
      />
      <el-input
        ref="textInput"
        v-model="text"
        aria-label="对话消息"
        type="textarea"
        :autosize="{ minRows: compact ? 2 : 1, maxRows: compact ? 6 : 8 }"
        :placeholder="placeholder"
        :disabled="inputDisabled"
        resize="none"
        @keydown.enter.exact.prevent="onSend"
        @keydown="onTextKeydown"
      />
      <ReasoningControl
        v-if="compact"
        v-model:effort="reasoningEffort"
        v-model:visibility="reasoningVisibility"
        class="compact-reasoning"
        compact
        :disabled="readOnly"
      />
      <el-button
        class="send-btn"
        :class="{ 'is-stop': primaryIsStop }"
        :type="primaryIsStop ? 'danger' : 'primary'"
        :icon="primaryIsStop ? VideoPause : Promotion"
        :disabled="primaryDisabled"
        :title="primaryIsStop ? '停止生成' : '发送（Enter）'"
        circle
        @click="onPrimaryAction"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  ArrowDown,
  Location,
  Paperclip,
  Plus,
  Promotion,
  VideoPause
} from '@element-plus/icons-vue'
import ReasoningControl from './ReasoningControl.vue'
import ConversationRecipient from './ConversationRecipient.vue'
import { CONNECTION_STATUS, useChatStore } from '@/stores/chat'
import { ACTIVE_RUN_STATUSES, useRunsStore } from '@/stores/runs'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useUiStore } from '@/stores/ui'
import { useWorkflowStore } from '@/stores/workflow'
import { openStudioPanel } from '@/studio/panelService'

const props = defineProps({
  compact: { type: Boolean, default: false },
  readOnlyReason: { type: String, default: '' },
  sendScope: { type: Object, default: null }
})
const chat = useChatStore()
const runs = useRunsStore()
const semanticMap = useSemanticMapStore()
const ui = useUiStore()
const workflow = useWorkflowStore()

const textInput = ref(null)
const fileInput = ref(null)
const dragging = ref(false)
let dragDepth = 0
const reasoningEffort = ref(readPreference('sf-chat-reasoning-effort', 'auto'))
const reasoningVisibility = ref(readPreference('sf-chat-reasoning-visibility', 'auto'))
const selectedMode = ref('collaboration')
const recipientPicker = ref(null)

const resolvedScope = computed(
  () =>
    props.sendScope || {
      type: 'conversation',
      conversation_id: chat.currentSessionId,
      target_agent_id: 'leader',
      intent: 'message'
    }
)
const scopeLabel = computed(() => {
  const scope = resolvedScope.value
  const target = scope.type === 'task' ? scope.target_agent_id || 'Task Agent' : recipientId.value
  return scope.type === 'task' ? 'Task · ' + target : 'Conversation · ' + target
})
const isConversationScope = computed(() => resolvedScope.value.type === 'conversation')
const conversationId = computed(
  () => resolvedScope.value.conversation_id || chat.currentSessionId || ''
)
// 返回历史只切换视图；切换对话时按会话和发送对象保留各自的草稿。
// 附件上传也绑定发起时的草稿，避免上传过程中切换会话后把图片送到另一会话。
const drafts = new Map()
let disposed = false
const draft = computed(() => {
  const scope = resolvedScope.value
  const key = JSON.stringify([
    conversationId.value,
    scope.type,
    scope.task_id,
    scope.type === 'task' ? scope.target_agent_id : ''
  ])
  if (!drafts.has(key)) drafts.set(key, reactive({ text: '', attachments: [], uploading: false }))
  return drafts.get(key)
})
const text = computed({
  get: () => draft.value.text,
  set: (value) => {
    draft.value.text = value
  }
})
const attachments = computed({
  get: () => draft.value.attachments,
  set: (value) => {
    draft.value.attachments = value
  }
})
const uploading = computed(() => draft.value.uploading)
const recipientId = computed({
  get: () =>
    draft.value.recipientId ||
    window.localStorage.getItem(`semantic-studio:recipient:${conversationId.value}`) ||
    resolvedScope.value.target_agent_id ||
    'leader',
  set: (value) => {
    draft.value.recipientId = value
    window.localStorage.setItem(`semantic-studio:recipient:${conversationId.value}`, value)
    nextTick(() => textInput.value?.focus())
  }
})
function onTextKeydown(event) {
  if (event.key !== '@' || !isConversationScope.value || event.isComposing) return
  event.preventDefault()
  recipientPicker.value?.show()
}
const mapSelectionPurpose = computed(() => `chat:${conversationId.value}`)
const mapBinding = computed(() => {
  const selection = semanticMap.selection
  if (
    !conversationId.value ||
    semanticMap.selectionPurpose !== mapSelectionPurpose.value ||
    !semanticMap.selectionValid ||
    !['entity', 'region'].includes(selection?.kind)
  ) {
    return null
  }

  // 对话只把 Server 管理的 map/generation/entity 引用交给 Agent。实体位姿、
  // 属性和名称只是当前地图快照的展示数据，不能被复制进消息后长期充当事实；
  // 后端会在实际规划或执行时按这组稳定引用读取同 generation 的正式实体。
  return {
    map_id: selection.map_id,
    generation: Number(selection.generation),
    selections: [{ kind: selection.kind, entity_id: selection.entity_id }]
  }
})
const mapSelectionLabel = computed(() => {
  const entityId = semanticMap.selection?.entity_id
  const entity = entityId ? semanticMap.entityById(entityId) : null
  return entity?.name || entity?.display_name || entityId || 'Semantic Map 实体'
})
const scopedProposal = computed(() =>
  workflow.proposal?.conversation_id === conversationId.value ? workflow.proposal : null
)
const effectiveMode = computed(() => {
  if (!isConversationScope.value) return 'task'
  return selectedMode.value
})
const modeLabel = computed(
  () =>
    ({
      collaboration: '协作',
      plan: '规划',
      execution: '执行中',
      task: resolvedScope.value.intent
    })[effectiveMode.value] || resolvedScope.value.intent
)

function modeStorageKey(id) {
  return `semantic-studio:conversation-mode:v1:${id}`
}
function selectMode(mode) {
  if (!['collaboration', 'plan'].includes(mode)) return
  selectedMode.value = mode
  if (conversationId.value) window.localStorage.setItem(modeStorageKey(conversationId.value), mode)
}

function openMapSelection() {
  semanticMap.beginSelection(mapSelectionPurpose.value)
  openStudioPanel('map', { viewMode: 'select', resourceId: mapSelectionPurpose.value })
}

function clearMapSelection() {
  if (semanticMap.selectionPurpose === mapSelectionPurpose.value) semanticMap.clearSelection()
}

watch(
  conversationId,
  (id) => {
    selectedMode.value = id
      ? window.localStorage.getItem(modeStorageKey(id)) || 'collaboration'
      : 'collaboration'
  },
  { immediate: true }
)

function readPreference(key, fallback) {
  return window.localStorage.getItem(key) || fallback
}

watch(
  () => chat.composerDraft,
  async (draft) => {
    if (!draft) return
    text.value = draft
    chat.setComposerDraft('')
    await nextTick()
  }
)

// 生成期间允许编辑草稿；不以发送普通消息隐式取消已有工作。
// sending/streaming 只表示输入传输和文字动画；是否有可停止运行必须读取
// Server 保存的 Run 状态。
const activeRun = computed(() =>
  resolvedScope.value.type === 'task'
    ? runs.activeForTask(resolvedScope.value.task_id)
    : runs.activeForConversation(resolvedScope.value.conversation_id || chat.currentSessionId)
)
const busy = computed(() =>
  Boolean(activeRun.value && ACTIVE_RUN_STATUSES.has(activeRun.value.status))
)
const offline = computed(() => chat.connectionStatus !== CONNECTION_STATUS.ONLINE)
const noSession = computed(() => !(resolvedScope.value.conversation_id || chat.currentSessionId))
const readOnly = computed(() => Boolean(props.readOnlyReason))
watch(readOnly, (value) => {
  if (!value) return
  dragging.value = false
  dragDepth = 0
})

const inputDisabled = computed(() => readOnly.value || noSession.value || offline.value)
const planInput = computed(() => isConversationScope.value && effectiveMode.value === 'plan')
const hasPayload = computed(() =>
  Boolean(text.value.trim() || attachments.value.length || mapBinding.value)
)
const primaryIsStop = computed(() => busy.value)
const sendDisabled = computed(
  () => inputDisabled.value || busy.value || chat.sending || uploading.value || !hasPayload.value
)
const primaryDisabled = computed(() =>
  primaryIsStop.value ? inputDisabled.value : sendDisabled.value
)

const placeholder = computed(() => {
  if (readOnly.value) return props.readOnlyReason
  if (noSession.value) return '请先选择或新建会话'
  if (offline.value) return '连接已断开，等待重连…'
  if (planInput.value && scopedProposal.value) return '继续讨论或调整计划…'
  if (planInput.value) return '描述目标，生成计划…'
  if (busy.value) return 'Agent 正在回复，可先编辑下一条消息…'
  return props.compact ? '输入目标或问题…' : '输入消息，Enter 发送，Shift+Enter 换行'
})

async function onSend() {
  if (sendDisabled.value) return
  const pending = attachments.value
  const sendScope = {
    ...resolvedScope.value,
    target_agent_id: isConversationScope.value
      ? recipientId.value
      : resolvedScope.value.target_agent_id,
    intent: planInput.value ? 'plan' : resolvedScope.value.intent
  }
  if (mapBinding.value) sendScope.map_binding = mapBinding.value
  const ok = chat.sendChatMessage(text.value, {
    interruptCurrent: false,
    attachments: pending,
    reasoningEffort: reasoningEffort.value,
    reasoningVisibility: reasoningVisibility.value,
    sendScope
  })
  if (ok) {
    window.localStorage.setItem('sf-chat-reasoning-effort', reasoningEffort.value)
    window.localStorage.setItem('sf-chat-reasoning-visibility', reasoningVisibility.value)
    text.value = ''
    // 发送成功后，本地预览地址的所有权随附件对象转交给消息列表。
    // 此处不能立即释放：乐观消息仍会用同一个 blob URL 渲染，过早释放会
    // 先显示“图片加载失败”，直到 REST 对账后重新下载附件才恢复。
    attachments.value = []
    clearMapSelection()
  } else {
    ui.notify({ type: 'error', message: '发送失败：连接不可用' })
  }
}

function onPrimaryAction() {
  if (primaryIsStop.value) onStop()
  else onSend()
}

async function onFiles(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  await addImageFiles(files)
}

function onDragEnter() {
  if (readOnly.value) return
  dragDepth += 1
  dragging.value = true
}

function onDragOver() {
  if (!readOnly.value) dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

async function onDrop(event) {
  dragDepth = 0
  dragging.value = false
  if (!readOnly.value) await addImageFiles([...(event.dataTransfer?.files || [])])
}

async function onPaste(event) {
  if (readOnly.value) return
  const files = [...(event.clipboardData?.items || [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter(Boolean)
  if (!files.length) return
  if (!event.clipboardData?.getData('text/plain')) event.preventDefault()
  await addImageFiles(files)
}

async function addImageFiles(inputFiles) {
  if (readOnly.value) return
  if (uploading.value) {
    ui.notify({ type: 'warning', message: '图片正在上传，请稍后再添加' })
    return
  }
  const imageFiles = inputFiles.filter((file) => /^image\/(jpeg|png|gif|webp)$/u.test(file.type))
  if (imageFiles.length !== inputFiles.length) {
    ui.notify({ type: 'warning', message: '仅支持 JPEG、PNG、GIF 和 WebP 图片' })
  }
  const remaining = 4 - attachments.value.length
  if (remaining <= 0) {
    ui.notify({ type: 'warning', message: '每条消息最多添加 4 张图片' })
    return
  }
  if (imageFiles.length > remaining) {
    ui.notify({ type: 'warning', message: `最多还能添加 ${remaining} 张图片` })
  }
  const files = imageFiles.slice(0, remaining)
  if (!files.length) return
  const owner = draft.value
  owner.uploading = true
  try {
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        ui.notify({ type: 'warning', message: `${file.name} 超过 20MB，已跳过` })
        continue
      }
      const uploaded = await chat.uploadAttachment(file)
      if (disposed) return
      if (uploaded) owner.attachments.push({ ...uploaded, previewUrl: URL.createObjectURL(file) })
    }
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '图片上传失败' })
  } finally {
    owner.uploading = false
  }
}

function removeAttachment(index) {
  const [removed] = attachments.value.splice(index, 1)
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
}

onBeforeUnmount(() => {
  disposed = true
  for (const saved of drafts.values()) {
    for (const item of saved.attachments) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
})

async function onStop() {
  if (!(await chat.cancelCurrentRun())) {
    ui.notify({ type: 'error', message: '中断失败：连接不可用' })
  }
}
</script>

<style scoped lang="scss">
.prompt-input {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0 18px 16px;
  padding: 10px 12px 12px;
  border: 1px solid var(--sf-border);
  border-radius: 14px;
  background: var(--sf-bg-secondary);
  box-shadow: 0 10px 30px rgba(31, 42, 68, 0.09);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &.is-dragging {
    border-color: var(--sf-brand);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--sf-brand) 14%, transparent);
  }

  &.is-readonly {
    background: var(--sf-bg-tertiary);
    box-shadow: none;
  }

  .composer-body {
    display: flex;
    align-items: flex-end;
    gap: var(--sf-space-2);
  }

  :deep(.el-textarea__inner) {
    padding: 8px 10px;
    background: transparent;
    box-shadow: none;
  }
}

.drop-overlay {
  position: absolute;
  z-index: 5;
  inset: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 3px;
  border: 1px dashed var(--sf-brand);
  border-radius: 11px;
  background: color-mix(in srgb, var(--sf-bg-secondary) 92%, var(--sf-brand));
  pointer-events: none;

  span {
    color: var(--sf-brand);
    font-size: 13px;
    font-weight: 520;
  }

  small {
    color: var(--sf-text-secondary);
    font-size: 10px;
  }
}

.composer-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--sf-text-disabled);
  font-size: 11px;
}

.composer-spacer {
  flex: 1;
}

.agent-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--sf-text-secondary);
  font-weight: 380;
}

.agent-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sf-role-leader);
}

.send-btn {
  flex: none;
  border-radius: 9px;

  &.is-stop {
    border-radius: 50%;
  }
}

.map-btn,
.upload-btn {
  flex: none;
  margin-bottom: 4px;
}

.mode-btn {
  flex: none;
  margin-bottom: 4px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
}

:global(.conversation-mode-menu .el-dropdown-menu__item > span) {
  display: flex;
  max-width: 310px;
  flex-direction: column;
  gap: 2px;
  padding: 3px 0;
}
:global(.conversation-mode-menu .el-dropdown-menu__item b) {
  color: var(--sf-text-primary);
}
:global(.conversation-mode-menu .el-dropdown-menu__item small) {
  color: var(--sf-text-disabled);
  line-height: 1.4;
  white-space: normal;
}

.file-input {
  display: none;
}

.tooltip-reference {
  display: inline-flex;
}

.attachment-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}
.attachment-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 190px;
  padding: 5px 7px;
  border: 1px solid var(--sf-border-light);
  border-radius: 9px;
  background: var(--sf-bg-tertiary);
}
.attachment-chip img {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  object-fit: cover;
}
.attachment-chip span {
  overflow: hidden;
  color: var(--sf-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachment-chip button {
  border: 0;
  background: transparent;
  color: var(--sf-text-disabled);
  cursor: pointer;
}

.map-reference-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--sf-brand) 30%, var(--sf-border-light));
  border-radius: 9px;
  background: color-mix(in srgb, var(--sf-brand) 7%, var(--sf-bg-tertiary));

  > span {
    display: grid;
    min-width: 0;
    grid-template-columns: 16px minmax(0, auto) minmax(0, 1fr);
    align-items: center;
    gap: 7px;
  }

  svg {
    width: 14px;
    color: var(--sf-brand);
  }

  b,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  b {
    color: var(--sf-text-secondary);
    font-size: 11px;
  }

  small {
    color: var(--sf-text-disabled);
    font-size: 9px;
  }

  button {
    border: 0;
    background: transparent;
    color: var(--sf-text-disabled);
    cursor: pointer;
  }
}
.prompt-input.is-compact {
  flex: none;
  min-width: 0;
  margin: 8px 12px 12px;
  padding: 12px;
  border-radius: 12px;
  box-shadow: none;

  .composer-body {
    display: grid;
    grid-template-columns: auto auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px 4px;
  }
  :deep(.el-textarea) {
    grid-row: 2;
    grid-column: 1 / -1;
    min-width: 0;
  }
  :deep(.el-textarea__inner) {
    padding: 2px 4px 8px;
    font-size: 14px;
    line-height: 1.65;
  }
  :deep(.el-dropdown) {
    grid-row: 3;
    grid-column: 1;
  }
  .mode-btn,
  .map-btn,
  .upload-btn {
    height: 28px;
    padding: 5px;
    margin: 0;
    background: transparent;
    font-size: 12px;
  }
  .mode-btn svg {
    width: 12px;
    height: 12px;
    margin-left: 4px;
  }
  .map-btn :deep(.el-icon),
  .upload-btn :deep(.el-icon) {
    font-size: 16px;
  }
  .map-btn {
    grid-row: 3;
    grid-column: 2;
  }
  .upload-btn {
    grid-row: 3;
    grid-column: 3;
  }
  .compact-reasoning {
    grid-row: 3;
    grid-column: 4;
    justify-self: end;
  }
  .send-btn {
    grid-row: 3;
    grid-column: 5;
    width: 28px;
    height: 28px;
    margin: 0;
    border-radius: 50%;
  }
  .attachment-chip span,
  .map-reference-strip b,
  .map-reference-strip small {
    font-size: 12px;
  }
  .composer-recipient {
    grid-row: 1;
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
