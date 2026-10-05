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
  <div class="pilot-enrollment">
    <el-button type="primary" plain :loading="creating" @click="open">添加 Pilot</el-button>

    <el-dialog v-model="visible" title="将 Pilot 加入 Semantic Server" width="620px" append-to-body>
      <div v-if="enrollment" class="enrollment-content">
        <p class="description">
          加入码只用于第一次配对。Pilot
          成功加入后会把专用连接凭据保存在本地，后续启动不再需要加入码。
        </p>
        <div class="join-code">
          <span>一次性加入码</span>
          <strong>{{ enrollment.code }}</strong>
          <small>有效期至 {{ expiresAt }}</small>
        </div>
        <div class="command-block">
          <header>
            <span>在 Robot 主机执行</span>
            <el-button text size="small" @click="copyCommand">复制命令</el-button>
          </header>
          <code>{{ command }}</code>
        </div>
        <el-alert
          type="info"
          :closable="false"
          title="启动器会通过局域网发现 Server，并自动启动 AbilityFramework、七类 Ability、Pilot，再由 Server 对账并下发期望 Robot Skill。"
        />
      </div>
      <template #footer>
        <el-button @click="visible = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { createPilotEnrollment } from '@/api/devices'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const visible = ref(false)
const creating = ref(false)
const enrollment = ref(null)
const command = computed(() =>
  enrollment.value
    ? `semantic-robot-instance start --config /etc/semantic/robots/<robot-id>/robot-deployment.yaml --join-code ${enrollment.value.code}`
    : ''
)
const expiresAt = computed(() => {
  const value = enrollment.value?.expires_at
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('zh-CN', { hour12: false })
    : '5 分钟后'
})

async function open() {
  creating.value = true
  try {
    const response = await createPilotEnrollment()
    enrollment.value = response?.enrollment || null
    if (!enrollment.value?.code) throw new Error('加入码响应不完整')
    visible.value = true
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '创建 Pilot 加入码失败' })
  } finally {
    creating.value = false
  }
}

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(command.value)
    ui.notify({ type: 'success', message: '启动命令已复制' })
  } catch {
    ui.notify({ type: 'error', message: '浏览器无法访问剪贴板，请手动复制命令' })
  }
}
</script>

<style scoped lang="scss">
.pilot-enrollment {
  display: inline-flex;
}
.enrollment-content {
  display: grid;
  gap: 16px;
}
.description {
  margin: 0;
  color: var(--sf-text-secondary);
  line-height: 1.7;
}
.join-code {
  display: grid;
  padding: 18px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-secondary);
  text-align: center;
  gap: 6px;
}
.join-code span,
.join-code small {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.join-code strong {
  color: var(--sf-role-robot);
  font-family: ui-monospace, monospace;
  font-size: 30px;
  letter-spacing: 0.14em;
}
.command-block {
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-primary);
}
.command-block header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-bottom: 1px solid var(--sf-border-light);
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.command-block code {
  display: block;
  padding: 14px;
  overflow-x: auto;
  color: var(--sf-text-primary);
  font-size: 11px;
  line-height: 1.7;
  white-space: nowrap;
}
</style>
