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
  <button
    type="button"
    class="agent-card"
    :class="{ 'is-selected': selected }"
    @click="$emit('select', agent.id)"
  >
    <div class="card-head">
      <!-- 角色徽标：--sf-role-* 令牌色（未定义的角色回退灰，见 roleColor） -->
      <span class="role-badge" :style="{ background: badgeColor }">{{ roleInitial }}</span>
      <div class="head-text">
        <div class="agent-id">{{ agent.id }}</div>
        <div class="tag-row">
          <el-tag size="small" effect="plain">{{ agent.role }}</el-tag>
          <el-tag size="small" effect="plain" type="info">{{ agent.mode }}</el-tag>
        </div>
      </div>
      <el-tooltip
        :content="`状态：${statusMeta.label}`"
        effect="dark"
        :show-after="500"
        placement="top"
      >
        <span class="status">
          <i class="status-dot" :style="{ background: statusMeta.color }" />
          {{ statusMeta.label }}
        </span>
      </el-tooltip>
    </div>

    <div class="card-meta">
      <div class="meta-row">
        <span class="meta-label">当前活动</span>
        <span class="meta-value">{{ agent.activity || '--' }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">模型</span>
        <span class="meta-value">
          {{ agent.model || '--' }}{{ agent.default_inherited ? ' · Default' : '' }}
        </span>
      </div>
    </div>
  </button>
</template>

<script setup>
// Team 成员卡：角色徽标（角色色令牌）+ id/role/mode + 状态点 + 当前活动 + 模型名。
// 只渲染不发请求；状态/角色色映射取 agents store 的纯函数（与单测同源）。
import { computed } from 'vue'
import { agentStatusMeta, roleColor } from '@/stores/agents'

const props = defineProps({
  agent: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

defineEmits(['select'])

const statusMeta = computed(() => agentStatusMeta(props.agent.status))
const badgeColor = computed(() => roleColor(props.agent.role))
const roleInitial = computed(() => (props.agent.role || '?').slice(0, 1).toUpperCase())
</script>

<style scoped lang="scss">
.agent-card {
  width: 100%;
  margin-bottom: 8px;
  padding: 13px;
  background: var(--sf-bg-secondary);
  border: 1px solid transparent;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--sf-border);
    background: var(--sf-bg-hover);
  }

  &.is-selected {
    border-color: color-mix(in srgb, var(--sf-brand) 28%, var(--sf-border));
    background: var(--sf-brand-soft);
    box-shadow: inset 3px 0 0 var(--sf-brand);
  }
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: var(--sf-space-3);
  margin-bottom: var(--sf-space-3);
}

.role-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: var(--sf-radius-md);
  color: #fff;
  font-size: var(--sf-font-lg);
  font-weight: 630;
}

.head-text {
  flex: 1;
  min-width: 0;
}

.agent-id {
  font-size: var(--sf-font-md);
  font-weight: 520;
  color: var(--sf-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-row {
  display: flex;
  gap: var(--sf-space-2);
  margin-top: var(--sf-space-1);
}

.status {
  display: inline-flex;
  align-items: center;
  gap: var(--sf-space-1);
  flex: none;
  font-size: var(--sf-font-sm);
  color: var(--sf-text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.card-meta {
  display: flex;
  flex-direction: column;
  gap: var(--sf-space-1);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  font-size: var(--sf-font-sm);
}

.meta-label {
  flex: none;
  width: 64px;
  color: var(--sf-text-disabled);
}

.meta-value {
  color: var(--sf-text-secondary);
}
</style>
