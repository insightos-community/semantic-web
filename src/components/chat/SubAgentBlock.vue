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
  <!-- 委派块（R14，17-web-ui-design §6.1 时间线卡片）：SubAgent 委派过程呈现。
       数据契约（chat store _applySubAgent 产出，与本组件共享同一响应式对象）：
       { id, agentName(成员实例 id，如 query-1), agentRole(角色名，角色色用),
         task, status(running/done), result(delta 流式聚合 → result 定稿全文), ts }
       running：头部状态点转圈 + 流式明细实时展开；done：状态点转绿、
       结果区默认折叠（点击头部展开结果全文）。 -->
  <div class="subagent-block" :class="`is-${delegation.status}`">
    <div class="block-bar" :style="{ background: accentColor }" />
    <div class="block-main">
      <el-tooltip
        :content="isRunning ? '委派执行中' : expanded ? '收起结果' : '展开结果'"
        effect="dark"
        :show-after="500"
        placement="top"
      >
        <button type="button" class="block-head" @click="onToggle">
          <el-icon class="status-icon" :class="{ 'is-loading': isRunning }">
            <Loading v-if="isRunning" />
            <CircleCheckFilled v-else />
          </el-icon>
          <span class="head-route" :style="{ color: accentColor }">
            Leader → {{ delegation.agentName }}
          </span>
          <el-tooltip
            :content="delegation.task"
            :disabled="!delegation.task"
            effect="dark"
            :show-after="500"
            placement="top"
          >
            <span class="head-task">{{ taskSummary }}</span>
          </el-tooltip>
          <span class="head-time">{{ timeText }}</span>
          <el-icon v-if="!isRunning" class="head-arrow" :class="{ expanded }">
            <ArrowDown />
          </el-icon>
        </button>
      </el-tooltip>
      <div v-if="bodyVisible" class="block-body">
        <div class="subagent-content">
          <div v-if="delegation.tools?.length" class="subagent-tools">
            <ToolCallBlock
              v-for="call in delegation.tools"
              :key="call.id || call.name"
              :call="call"
            />
          </div>
          <details v-if="delegation.reasoning" class="subagent-reasoning">
            <summary>模型推理过程</summary>
            <pre>{{ delegation.reasoning }}</pre>
          </details>
          <MessageBubbleText :text="delegation.result || '（暂无产出）'" />
        </div>
        <span v-if="isRunning" class="stream-cursor" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ArrowDown, CircleCheckFilled, Loading } from '@element-plus/icons-vue'
import MessageBubbleText from '@/components/chat/MessageBubbleText.vue'
import ToolCallBlock from '@/components/chat/ToolCallBlock.vue'
import { roleColor } from '@/stores/agents'

const props = defineProps({
  delegation: { type: Object, required: true }
})

const expanded = ref(false) // done 后结果区默认折叠，点击头部展开

const isRunning = computed(() => props.delegation.status === 'running')

// running 时正文常开（流式明细实时可见）；done 后按 expanded 折叠
const bodyVisible = computed(() => isRunning.value || expanded.value)

function onToggle() {
  if (isRunning.value) return // 执行中不可折叠（流式明细是进行中状态的一部分）
  expanded.value = !expanded.value
}

// 任务摘要：task 随 subagent.result 才到达，执行中显示占位
const taskSummary = computed(() => props.delegation.task || '任务执行中…')

// 角色色（--sf-role-* 令牌；未定义的角色由 CSS var fallback 落灰，见 roleColor）
const accentColor = computed(() =>
  roleColor(props.delegation.agentRole || props.delegation.agentName)
)

const timeText = computed(() => {
  const d = new Date(props.delegation.ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})
</script>

<style scoped lang="scss">
.subagent-block {
  display: flex;
  gap: var(--sf-space-3);
  padding: var(--sf-space-2) 0;
}

.block-bar {
  flex: none;
  width: 3px;
  border-radius: var(--sf-radius-sm);
}

.block-main {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-secondary);
  overflow: hidden;
}

.block-head {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  width: 100%;
  padding: var(--sf-space-2) var(--sf-space-3);
  border: none;
  background: transparent;
  font-size: var(--sf-font-sm);
  cursor: pointer;

  &:hover {
    background: var(--sf-bg-hover);
  }

  .is-running & {
    cursor: default;
  }
}

.status-icon {
  flex: none;
  color: var(--sf-text-disabled);

  &.is-loading {
    animation: subagent-spin 1s linear infinite;
  }

  .is-done & {
    color: var(--sf-success);
  }
}

@keyframes subagent-spin {
  to {
    transform: rotate(360deg);
  }
}

.head-route {
  flex: none;
  font-weight: 520;
}

.head-task {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  color: var(--sf-text-secondary);
}

.head-time {
  flex: none;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.head-arrow {
  flex: none;
  color: var(--sf-text-disabled);
  transition: transform 0.15s ease;

  &.expanded {
    transform: rotate(180deg);
  }
}

.block-body {
  display: flex;
  align-items: flex-end;
  gap: var(--sf-space-1);
  padding: var(--sf-space-2) var(--sf-space-3);
  border-top: 1px solid var(--sf-border-light);
}

.subagent-content {
  flex: 1;
  min-width: 0;
}

.subagent-tools {
  margin-bottom: var(--sf-space-2);
}

.subagent-reasoning {
  margin-bottom: var(--sf-space-2);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);

  pre {
    white-space: pre-wrap;
  }
}

// 流式中闪烁光标（与 MessageRow 同一动效）
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
</style>
