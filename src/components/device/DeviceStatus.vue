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
  <span class="device-status" :data-status="statusMeta.tone">
    <i class="sf-status-dot" :data-status="statusMeta.tone" />{{ statusMeta.label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ status: { type: String, default: 'unknown' } })
const labels = {
  connecting: ['连接中', 'starting'],
  online: ['在线', 'success'],
  ready: ['就绪', 'success'],
  streaming: ['采集中', 'running'],
  healthy: ['健康', 'success'],
  idle: ['空闲', 'idle'],
  busy: ['运行中', 'running'],
  running: ['运行中', 'running'],
  queued: ['排队中', 'starting'],
  starting: ['启动中', 'starting'],
  waiting_agent: ['等待 Agent', 'warning'],
  stopping: ['停止中', 'warning'],
  stopped: ['已停止', 'stopped'],
  completed: ['已完成', 'success'],
  succeeded: ['已完成', 'success'],
  degraded: ['部分异常', 'warning'],
  interrupted: ['已中断', 'danger'],
  failed: ['失败', 'danger'],
  offline: ['离线', 'stopped'],
  uploading: ['上传中', 'starting'],
  downloading: ['下载中', 'starting'],
  announced: ['等待同步', 'warning'],
  synced: ['已同步', 'success'],
  installed: ['已安装', 'success'],
  disabled: ['已停用', 'idle'],
  pending: ['等待中', 'idle'],
  not_reported: ['未上报', 'idle'],
  unknown: ['未知', 'idle']
}
const statusMeta = computed(() => {
  const [label, tone] = labels[props.status] || [props.status || '未知', 'idle']
  return { label, tone }
})
</script>

<style scoped>
.device-status {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  gap: 6px;
  color: var(--sf-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.device-status[data-status='danger'] {
  color: var(--sf-danger);
}

.device-status[data-status='warning'] {
  color: var(--sf-warning);
}
</style>
