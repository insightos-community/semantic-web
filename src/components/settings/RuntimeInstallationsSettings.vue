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
  <section class="runtime-settings">
    <header>
      <div>
        <p class="eyebrow">SIMULATION RUNTIMES</p>
        <h2>仿真运行环境</h2>
        <p>管理已安装的环境，查看连接状态与诊断结果。</p>
        <details class="install-hint">
          <summary>添加运行环境</summary>
          <p>
            CLI 安装使用 <code>semantic install runtime &lt;pack@version&gt;</code>， 然后执行
            <code>semantic runtime doctor --all</code>。
          </p>
        </details>
      </div>
      <div>
        <el-button type="primary" :disabled="!project.currentProjectId" @click="importOpen = true"
          >导入 Runtime 包</el-button
        >
        <el-button :loading="loading" @click="reloadCatalog">刷新安装目录</el-button>
      </div>
    </header>

    <ProjectImportDialog
      v-model="importOpen"
      :project-id="project.currentProjectId"
      :editable="project.currentProject?.mode === 'development'"
      @imported="load"
    />
    <el-alert
      v-if="restartRequired"
      type="warning"
      show-icon
      :closable="false"
      title="安装启用状态已保存；请重启 Semantic Server 后再启动新启用的 Runtime。"
    />
    <p v-if="loading && !installations.length" role="status">正在读取 Runtime 安装…</p>
    <el-alert v-else-if="error" type="error" :title="error" :closable="false" show-icon />
    <el-empty
      v-else-if="!loading && installations.length === 0"
      description="未登记 Runtime 安装"
    />

    <div v-else class="runtime-list">
      <article v-for="item in installations" :key="item.installation_id" class="runtime-card">
        <div class="runtime-heading">
          <div>
            <strong>{{ item.name || item.installation_id }}</strong>
            <span>{{ item.engine }} / {{ item.loader }}</span>
          </div>
          <div class="runtime-state">
            <el-tag :type="statusType(item.status)" effect="plain">{{ statusLabel(item) }}</el-tag>
            <el-switch
              :model-value="item.enabled"
              :loading="pending(item.installation_id, 'enabled')"
              active-text="启用"
              inactive-text="停用"
              @change="(value) => setEnabled(item, value)"
            />
          </div>
        </div>

        <dl>
          <div>
            <dt>Installation</dt>
            <dd>{{ item.installation_id }}</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd>{{ item.profile_id }}</dd>
          </div>
          <div>
            <dt>启动方式</dt>
            <dd>{{ launchModeLabel(item.launch_mode) }}</dd>
          </div>
          <div>
            <dt>已安装版本</dt>
            <dd>{{ item.installed_version || '未声明' }}</dd>
          </div>
          <div>
            <dt>Runtime Pack</dt>
            <dd>{{ runtimePackLabel(item) }}</dd>
          </div>
        </dl>

        <el-tag v-if="item.development" size="small" type="info">开发环境</el-tag>
        <p v-if="item.diagnostic" class="diagnostic">{{ item.diagnostic }}</p>
        <div class="capabilities">
          <el-tag v-if="item.capabilities?.viewer" size="small">Viewer</el-tag>
          <el-tag v-if="item.capabilities?.editable_scene" size="small">场景编辑</el-tag>
          <el-tag v-if="item.capabilities?.scene_reset" size="small">Reset</el-tag>
          <el-tag v-if="item.capabilities?.scene_step" size="small">单步</el-tag>
          <el-tag v-if="item.capabilities?.native_evaluator" size="small">Evaluator</el-tag>
          <el-tag
            v-for="robot in item.capabilities?.robot_models || []"
            :key="robot"
            size="small"
            type="info"
          >
            {{ robot }}
          </el-tag>
        </div>

        <div class="runtime-actions">
          <el-button
            size="small"
            :loading="pending(item.installation_id, 'probe')"
            :disabled="!item.enabled"
            @click="probe(item)"
          >
            诊断连接
          </el-button>
          <el-button
            size="small"
            type="primary"
            plain
            :loading="pending(item.installation_id, 'start')"
            :disabled="!item.enabled"
            @click="startTest(item)"
          >
            启动测试
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :loading="pending(item.installation_id, 'stop')"
            :disabled="item.launch_mode === 'remote'"
            @click="stop(item)"
          >
            停止受管进程
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :loading="pending(item.installation_id, 'uninstall')"
            @click="uninstall(item)"
            >卸载 Runtime</el-button
          >
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import * as simulationApi from '@/api/simulation'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import ProjectImportDialog from '@/components/studio/ProjectImportDialog.vue'

const ui = useUiStore()
const project = useProjectStore()
const importOpen = ref(false)
async function reloadCatalog() {
  try {
    await simulationApi.reloadRuntimeResources()
    restartRequired.value = false
    await load()
  } catch (err) {
    error.value = err.message
  }
}
const installations = ref([])
const loading = ref(false)
const error = ref('')
const restartRequired = ref(false)
const operations = ref(new Set())

const operationKey = (id, operation) => `${id}:${operation}`
const pending = (id, operation) => operations.value.has(operationKey(id, operation))

function setPending(id, operation, active) {
  const next = new Set(operations.value)
  const key = operationKey(id, operation)
  if (active) next.add(key)
  else next.delete(key)
  operations.value = next
}

function replaceInstallation(value) {
  if (!value?.installation_id) return
  const index = installations.value.findIndex(
    (item) => item.installation_id === value.installation_id
  )
  if (index < 0) installations.value.push(value)
  else installations.value.splice(index, 1, value)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await simulationApi.listRuntimeInstallations()
    installations.value = response.runtime_installations || []
  } catch (err) {
    error.value = err.message || 'Runtime 安装清单加载失败'
  } finally {
    loading.value = false
  }
}

async function run(item, operation, request, successMessage) {
  setPending(item.installation_id, operation, true)
  try {
    const response = await request(item.installation_id)
    ui.notify({ type: 'success', message: successMessage(response) })
    await load()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Runtime 操作失败' })
    await load()
  } finally {
    setPending(item.installation_id, operation, false)
  }
}

const probe = (item) =>
  run(
    item,
    'probe',
    simulationApi.probeRuntimeInstallation,
    (response) => `连接正常：${response.runtime?.state || 'ready'}`
  )

const startTest = (item) =>
  run(
    item,
    'start',
    simulationApi.testRuntimeInstallation,
    (response) => `Runtime 测试成功：${response.runtime?.state || 'ready'}`
  )

const stop = (item) =>
  run(item, 'stop', simulationApi.stopRuntimeInstallation, (response) =>
    response.managed_process_stopped ? '受管 Runtime 已停止' : '当前没有 Framework 启动的进程'
  )

async function uninstall(item) {
  try {
    await ElMessageBox.confirm(
      '卸载此 Runtime 的安装环境？独立场景包、模型和项目历史会保留。请先停止受管进程并解除项目安装偏好。',
      '卸载 Runtime',
      { type: 'warning' }
    )
  } catch {
    return
  }
  await run(
    item,
    'uninstall',
    simulationApi.uninstallRuntime,
    () => 'Runtime 已卸载，独立场景和模型保留'
  )
}

// 启用状态是管理员清单的一部分。二次确认用于避免停用正在被 Project
// 引用的安装；Server 仍会先回收受管进程，再原子写回唯一的 enabled 字段。
async function setEnabled(item, enabled) {
  try {
    await ElMessageBox.confirm(
      enabled
        ? `启用 ${item.name || item.installation_id}？保存后需要重启 Server 才能参与新启动。`
        : `停用 ${item.name || item.installation_id}？已有 Project 绑定不会改变，但该 Runtime 将不能启动。`,
      enabled ? '启用 Runtime' : '停用 Runtime',
      { type: enabled ? 'info' : 'warning', confirmButtonText: '确认', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  setPending(item.installation_id, 'enabled', true)
  try {
    const response = await simulationApi.setRuntimeInstallationEnabled(
      item.installation_id,
      enabled
    )
    replaceInstallation(response.runtime_installation)
    restartRequired.value ||= Boolean(response.server_restart_required)
    ui.notify({ type: 'success', message: enabled ? 'Runtime 已启用' : 'Runtime 已停用' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '保存 Runtime 状态失败' })
  } finally {
    setPending(item.installation_id, 'enabled', false)
  }
}

function statusType(status) {
  if (status === 'ready') return 'success'
  if (['failed', 'offline'].includes(status)) return 'danger'
  if (['starting', 'stopping'].includes(status)) return 'warning'
  return 'info'
}

function statusLabel(item) {
  if (!item.enabled) return '已停用'
  return (
    { ready: '就绪', offline: '离线', failed: '异常', starting: '启动中', stopping: '停止中' }[
      item.status
    ] ||
    item.status ||
    '未连接'
  )
}

function launchModeLabel(mode) {
  return (
    { uv: 'uv 受管进程', process: '本地受管进程', container: '容器', remote: '远程' }[mode] || mode
  )
}

function runtimePackLabel(item) {
  if (item.development) return '源码开发安装'
  if (!item.pack_id) return item.launch_mode === 'remote' ? '远程注册' : '未声明'
  return item.pack_id + '@' + (item.pack_version || '—')
}

onMounted(load)
</script>

<style scoped lang="scss">
.runtime-settings {
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
  overflow-wrap: anywhere;

  > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 16px;

    h2,
    p {
      margin: 0 0 6px;
    }

    p:not(.eyebrow) {
      color: var(--sf-text-secondary);
      line-height: 1.6;
    }
  }
}

.runtime-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.runtime-card {
  padding: 22px;
  border: 1px solid var(--sf-border-light);
  border-radius: 11px;
  background: var(--sf-bg-secondary);
}

.runtime-heading,
.runtime-state,
.runtime-actions,
.capabilities {
  display: flex;
  align-items: center;
  gap: 9px;
}

.runtime-heading {
  justify-content: space-between;

  > div:first-child {
    display: grid;
    gap: 4px;

    span {
      color: var(--sf-text-muted);
      font-size: 12px;
    }
  }
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 20px;
  margin: 15px 0;

  div {
    display: grid;
    gap: 3px;
  }

  dt {
    color: var(--sf-text-muted);
    font-size: 11px;
  }

  dd {
    margin: 0;
    color: var(--sf-text-primary);
    word-break: break-all;
  }
}

.diagnostic {
  padding: 8px 10px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--sf-danger) 12%, transparent);
  color: var(--sf-danger);
}

.capabilities {
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.runtime-actions {
  padding-top: 12px;
  border-top: 1px solid var(--sf-border-light);
}

@media (max-width: 720px) {
  .runtime-heading,
  .runtime-actions {
    align-items: stretch;
    flex-direction: column;
  }

  dl {
    grid-template-columns: 1fr;
  }
}
</style>
