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
  <!-- 协作侧栏（R14）：Team 状态区（roster 成员：角色色点+名称+状态）+
       告警列表（全级别，critical 高亮）。数据源：agents / chat（本组件只渲染，
       roster 加载与轮询由 ChatView 生命周期负责）。 -->
  <aside class="chat-sidebar">
    <div class="pane-header"><span>协作</span></div>

    <!-- Team 状态区：成员清单（角色色点 + 名称 + 状态），数据来自 agents store -->
    <div class="sidebar-section">
      <div class="section-title">Team 状态</div>
      <div v-if="agents.agents.length === 0" class="section-placeholder">
        暂无成员（单 leader 模式或目录未加载）
      </div>
      <div v-for="a in agents.agents" :key="a.id" class="member-row">
        <i class="role-dot" :style="{ background: roleColor(a.role) }" />
        <el-tooltip
          :content="`${a.role} / ${a.mode}`"
          effect="dark"
          :show-after="500"
          placement="top"
        >
          <span class="member-name">{{ a.id }}</span>
        </el-tooltip>
        <el-tooltip
          v-if="a.activity"
          :content="a.activity"
          effect="dark"
          :show-after="500"
          placement="top"
        >
          <span class="member-status">
            <i class="status-dot" :style="{ background: statusMetaOf(a.status).color }" />
            {{ statusMetaOf(a.status).label }}
          </span>
        </el-tooltip>
        <span v-else class="member-status">
          <i class="status-dot" :style="{ background: statusMetaOf(a.status).color }" />
          {{ statusMetaOf(a.status).label }}
        </span>
      </div>
    </div>

    <!-- 告警列表：low/normal/critical 全级别条目（最新在前），critical 高亮 -->
    <div class="sidebar-section">
      <div class="section-title">告警列表</div>
      <div v-if="chat.alerts.length === 0" class="section-placeholder">暂无告警</div>
      <div v-for="al in chat.alerts" :key="al.id" class="alert-row" :class="`is-${al.importance}`">
        <div class="alert-head">
          <el-tag size="small" effect="dark" :type="alertTagType(al.importance)">
            {{ alertLevelText(al) }}
          </el-tag>
          <span class="alert-agent">{{ al.agentName }}</span>
          <span class="alert-time">{{ formatTime(al.ts) }}</span>
        </div>
        <el-tooltip :content="al.text" effect="dark" :show-after="500" placement="top">
          <div class="alert-text">{{ al.text }}</div>
        </el-tooltip>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { agentStatusMeta, roleColor, useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'

const agents = useAgentsStore()
const chat = useChatStore()

const statusMetaOf = agentStatusMeta

// 告警级别徽标：critical 红 / normal 黄 / low 蓝
const TAG_TYPES = { critical: 'danger', normal: 'warning', low: 'info' }
function alertTagType(importance) {
  return TAG_TYPES[importance] || 'info'
}

// 徽标文案：数值级别显示 L<n>（monitor 规则表 1-5），字符串级别原样，缺省按分级
const IMPORTANCE_TEXT = { critical: '严重', normal: '一般', low: '低' }
function alertLevelText(al) {
  if (typeof al.level === 'number') return `L${al.level}`
  if (typeof al.level === 'string' && al.level) return al.level
  return IMPORTANCE_TEXT[al.importance] || '告警'
}

// 告警时间：HH:mm:ss（与消息行时间戳同一格式）
function formatTime(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<style scoped lang="scss">
.chat-sidebar {
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-l);
  overflow-y: auto;
  box-shadow: var(--sf-shadow-sm);
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 58px;
  padding: 0 var(--sf-space-3);
  border-bottom: 1px solid var(--sf-border-light);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
}

.sidebar-section {
  padding: var(--sf-space-3);
  border-bottom: 1px solid var(--sf-border-light);
}

.section-title {
  margin-bottom: var(--sf-space-2);
  color: var(--sf-text-primary);
  font-size: var(--sf-font-sm);
}

.section-placeholder {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

// ---- Team 状态区 ----
.member-row {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  padding: var(--sf-space-1) 0;

  & + .member-row {
    margin-top: var(--sf-space-1);
  }
}

.role-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.member-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sf-text-primary);
  font-size: var(--sf-font-sm);
}

.member-status {
  display: inline-flex;
  align-items: center;
  gap: var(--sf-space-1);
  flex: none;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

// ---- 告警列表 ----
.alert-row {
  padding: var(--sf-space-2);
  border: 1px solid var(--sf-border-light);
  border-left: 3px solid var(--sf-info);
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-tertiary);

  & + .alert-row {
    margin-top: var(--sf-space-2);
  }

  &.is-critical {
    border-left-color: var(--sf-danger);
    background: rgb(224 86 79 / 12%);
  }

  &.is-normal {
    border-left-color: var(--sf-warning);
  }
}

.alert-head {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  margin-bottom: var(--sf-space-1);
}

.alert-agent {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.alert-time {
  flex: none;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  font-variant-numeric: tabular-nums;
}

.alert-text {
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
  word-break: break-all;
}
</style>
