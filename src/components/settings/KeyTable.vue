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
  <el-table :data="keys" class="key-table" empty-text="暂无托管密钥，点击右上角新建">
    <el-table-column prop="name" label="名称（模型端点）" min-width="180" />
    <el-table-column label="密钥（掩码）" min-width="140">
      <template #default="{ row }">
        <code class="masked-value">{{ row.key_value }}</code>
      </template>
    </el-table-column>
    <el-table-column label="更新时间" min-width="170">
      <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
    </el-table-column>
    <el-table-column label="操作" width="130" align="right">
      <template #default="{ row }">
        <el-button size="small" text type="primary" @click="$emit('edit', row)">编辑</el-button>
        <el-button size="small" text type="danger" @click="$emit('delete', row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
// 托管密钥表格：只展示服务端掩码值（如 sk-abc***），前端绝无原文；
// 编辑/删除经事件上抛（删除的二次确认由 SettingsView 负责）。
defineProps({
  keys: { type: Array, default: () => [] } // [{name, key_value(掩码), updated_at}]
})

defineEmits(['edit', 'delete'])

function formatTime(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString()
}
</script>

<style scoped lang="scss">
.key-table {
  background: var(--sf-bg-secondary);
}

.masked-value {
  font-family: monospace;
  font-size: var(--sf-font-sm);
  color: var(--sf-text-secondary);
}
</style>
