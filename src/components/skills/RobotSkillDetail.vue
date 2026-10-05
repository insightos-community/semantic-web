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
  <section class="robot-skill-detail">
    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" />

    <div v-loading="loading" class="detail-body">
      <template v-if="skill">
        <header class="detail-header">
          <div>
            <span class="detail-kicker">ROBOT SKILL · v{{ skill.version }}</span>
            <h2>{{ skill.name }}</h2>
            <p>{{ skill.description }}</p>
          </div>
          <div class="header-tags">
            <el-tag effect="plain" :type="hasDocument ? 'success' : 'info'">
              {{ hasDocument ? 'SKILL.md 已加载' : 'SKILL.md 详情不可用' }}
            </el-tag>
            <el-tag effect="plain" type="warning">仅通过 robot.run 执行</el-tag>
          </div>
        </header>

        <div class="package-structure">
          <span class="is-ready"><i />SKILL.md · 语义说明</span>
          <span :class="{ 'is-ready': resourceCount('scripts') > 0 }">
            <i />scripts/ · {{ resourceStatus('scripts') }}
          </span>
          <span :class="{ 'is-ready': resourceCount('references') > 0 }">
            <i />references/ · {{ resourceStatus('references') }}
          </span>
          <span :class="{ 'is-ready': resourceCount('tests') > 0 }">
            <i />tests/ · {{ resourceStatus('tests') }}
          </span>
        </div>

        <section class="boundary-card">
          <b>运行边界</b>
          <p>
            Robot Skill 是由 Robot Agent 选择、经 <code>robot.run</code> 交给指定 Pilot
            的可执行技能。技能库保存和浏览发布版本；下方“Robot
            下发状态”负责把同一版本安装、启用到具体 Robot。它不会作为普通 Agent Skill
            注入上下文，也不会由浏览器直接运行 Python。
          </p>
        </section>

        <section class="field-card">
          <div class="field-row">
            <span>name</span><b>{{ skill.name }}</b>
          </div>
          <div class="field-row">
            <span>category</span><b>{{ skill.category }}</b>
          </div>
          <div class="field-row">
            <span>version</span><b>{{ skill.version }}</b>
          </div>
          <div class="field-row">
            <span>when_to_use</span><b>{{ skill.when_to_use || '—' }}</b>
          </div>
          <div class="field-row">
            <span>适用型号</span><b>{{ models }}</b>
          </div>
          <div class="field-row">
            <span>发布时间</span><b>{{ formatTime(skill.published_at) }}</b>
          </div>
          <div class="field-row wide">
            <span>runtime</span>
            <pre>{{ formatValue(skill.extensions?.runtime) }}</pre>
          </div>
          <div class="field-row wide">
            <span>required_actions</span>
            <div class="action-list">
              <code v-for="item in skill.required_actions" :key="actionKey(item)">
                {{ actionKey(item) }}
              </code>
              <em v-if="!skill.required_actions?.length">未声明</em>
            </div>
          </div>
          <div class="field-row wide">
            <span>stop_actions</span>
            <div class="action-list">
              <code v-for="item in skill.stop_actions" :key="actionKey(item)">
                {{ actionKey(item) }}
              </code>
              <em v-if="!skill.stop_actions?.length">未声明</em>
            </div>
          </div>
        </section>

        <section v-if="hasDocument" class="body-card">
          <!-- SKILL.md 经过项目统一 markdown-it + DOMPurify 管线渲染。 -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="skill-markdown" v-html="bodyHtml" />
        </section>

        <section v-if="resources.length" class="resource-card">
          <header>
            <div><b>技能资源</b><span>发布包内 scripts / references / tests</span></div>
            <span>{{ resources.length }} 个文件</span>
          </header>
          <div class="resource-workspace">
            <nav aria-label="Robot Skill 资源文件">
              <button
                v-for="item in resources"
                :key="item.path"
                type="button"
                :class="{ active: selectedResourcePath === item.path }"
                @click="emit('select-resource', item.path)"
              >
                <span>{{ item.kind }}</span
                ><b>{{ item.path }}</b
                ><em>{{ formatSize(item.size) }}</em>
              </button>
            </nav>
            <div v-loading="resourceLoading" class="resource-preview">
              <el-alert
                v-if="resourceError"
                type="error"
                :title="resourceError"
                show-icon
                :closable="false"
              />
              <template v-else-if="resource">
                <div>{{ resource.resource?.path }}</div>
                <pre><code>{{ resource.content }}</code></pre>
              </template>
              <p v-else>选择左侧文件查看文本内容</p>
            </div>
          </div>
        </section>

        <section class="robots-card">
          <header>
            <div>
              <h3>Robot 期望与实际状态</h3>
              <p>Server 保存期望版本，Pilot 自动安装、启用并持续回报实际目录。</p>
            </div>
            <span>{{ configuredCount }}/{{ compatibleRobots.length }} 已配置</span>
          </header>
          <article v-for="robot in compatibleRobots" :key="robot.robot_id">
            <div class="robot-name">
              <b>{{ robot.display_name || robot.robot_id }}</b>
              <small>{{ robot.robot_id }} · {{ robot.model }} · {{ robot.pilot?.status }}</small>
              <small>期望：{{ desiredLabel(robot) }} · 实际：{{ actualLabel(robot) }}</small>
            </div>
            <DeviceStatus :status="installationStatus(robot)" />
            <div class="robot-actions">
              <el-button
                v-if="!desired(robot)"
                size="small"
                type="primary"
                :loading="operating('install', robot)"
                @click="install(robot)"
              >
                设为期望并下发
              </el-button>
              <template v-else>
                <el-button
                  size="small"
                  :type="desired(robot).enabled ? 'warning' : 'success'"
                  plain
                  :loading="operating('enable', robot)"
                  @click="toggle(robot)"
                >
                  {{ desired(robot).enabled ? '停用' : '启用' }}
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  text
                  :loading="operating('uninstall', robot)"
                  @click="uninstall(robot)"
                >
                  移除期望
                </el-button>
              </template>
            </div>
          </article>
          <p v-if="!compatibleRobots.length" class="empty">Server 当前没有适用此版本的 Robot。</p>
        </section>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { useDeviceStore } from '@/stores/device'
import { useUiStore } from '@/stores/ui'
import { renderMarkdown } from '@/utils/markdown'
import 'highlight.js/styles/github-dark.css'

const props = defineProps({
  skill: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  resource: { type: Object, default: null },
  resourceLoading: { type: Boolean, default: false },
  resourceError: { type: String, default: '' }
})
const emit = defineEmits(['select-resource'])
const devices = useDeviceStore()
const ui = useUiStore()
const resources = computed(() =>
  Array.isArray(props.skill?.resources) ? props.skill.resources : []
)
const hasDocument = computed(() => typeof props.skill?.body === 'string')
const bodyHtml = computed(() => renderMarkdown(props.skill?.body || ''))
const selectedResourcePath = computed(() => props.resource?.resource?.path || '')
const compatibleRobots = computed(() =>
  devices.robots.filter(
    (robot) =>
      !props.skill?.applicable_models?.length || props.skill.applicable_models.includes(robot.model)
  )
)
const models = computed(() => props.skill?.applicable_models?.join('、') || '未限制 Robot 型号')
const configuredCount = computed(
  () => compatibleRobots.value.filter((robot) => Boolean(desired(robot))).length
)
const desired = (robot) =>
  robot.desired_skills?.find(
    (item) => item.name === props.skill?.name && item.version === props.skill?.version
  )
const installation = (robot) =>
  robot.installed_skills?.find(
    (item) => item.name === props.skill?.name && item.version === props.skill?.version
  )
const operating = (operation, robot) =>
  devices.isOperating(`${operation}:${robot.robot_id}:${props.skill.name}:${props.skill.version}`)
const installationStatus = (robot) => {
  const target = desired(robot)
  const current = installation(robot)
  if (!target) return current ? 'degraded' : 'not_installed'
  if (current?.status === 'failed') return 'failed'
  if (!current || current.enabled !== target.enabled || current.status !== 'installed')
    return 'pending'
  return current.enabled ? 'installed' : 'disabled'
}
const desiredLabel = (robot) => {
  const target = desired(robot)
  if (!target) return '未配置'
  return target.enabled ? `v${target.version} · 启用` : `v${target.version} · 停用`
}
const actualLabel = (robot) => {
  const current = installation(robot)
  if (!current) return desired(robot) ? '等待 Pilot 对账' : '未安装'
  if (current.status === 'failed') return current.error || '安装失败'
  return current.enabled ? '已安装并启用' : '已安装，未启用'
}

function resourceCount(kind) {
  return resources.value.filter((item) => item.kind === kind).length
}
function resourceStatus(kind) {
  const count = resourceCount(kind)
  return count ? `${count} 个文件` : '未提供'
}
function actionKey(item) {
  return `${item.type}@${item.schema_version || 1}`
}
function formatValue(value) {
  if (!value) return '—'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
function formatSize(value) {
  const size = Number(value) || 0
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KiB`
}
function formatTime(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('zh-CN', { hour12: false })
    : '—'
}
async function install(robot) {
  try {
    await devices.installSkill(robot.robot_id, props.skill)
    ui.notify({ type: 'success', message: `${props.skill.name} 已设为期望版本，Pilot 将自动对账` })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot Skill 期望状态保存失败' })
  }
}
async function toggle(robot) {
  const target = desired(robot)
  try {
    await devices.setSkillEnabled(robot.robot_id, props.skill, !target.enabled)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot Skill 期望状态修改失败' })
  }
}
async function uninstall(robot) {
  try {
    await devices.uninstallSkill(robot.robot_id, props.skill)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot Skill 期望状态移除失败' })
  }
}
</script>

<style scoped lang="scss">
.robot-skill-detail {
  height: 100%;
  overflow-y: auto;
}
.detail-body {
  min-height: 140px;
}
.detail-header,
.robots-card > header,
.resource-card > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.detail-header {
  padding: 4px 2px 14px;
  border-bottom: 1px solid var(--sf-border-light);
}
.detail-header h2 {
  margin: 4px 0 5px;
  font-size: var(--sf-font-xl);
}
.detail-header p,
.robots-card p {
  margin: 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
  line-height: 1.55;
}
.detail-kicker {
  color: var(--sf-role-robot);
  font-size: var(--sf-font-xs);
  font-weight: 520;
  letter-spacing: 0.12em;
}
.header-tags,
.package-structure,
.action-list,
.robot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.package-structure {
  margin: 14px 0;
}
.package-structure span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--sf-border-light);
  border-radius: 7px;
  color: var(--sf-text-disabled);
  font:
    10px ui-monospace,
    monospace;
}
.package-structure span.is-ready {
  color: var(--sf-success);
}
.package-structure i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.boundary-card {
  padding: 13px 15px;
  border-left: 3px solid var(--sf-role-robot);
  background: var(--sf-brand-soft);
}
.boundary-card p {
  margin: 5px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
  line-height: 1.65;
}
.field-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 14px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  overflow: hidden;
}
.field-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  padding: 11px 13px;
  border-bottom: 1px solid var(--sf-border-light);
}
.field-row:nth-child(odd):not(.wide) {
  border-right: 1px solid var(--sf-border-light);
}
.field-row.wide {
  grid-column: 1 / -1;
}
.field-row > span {
  color: var(--sf-text-disabled);
  font:
    10px ui-monospace,
    monospace;
}
.field-row b,
.field-row pre {
  margin: 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.action-list code {
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-brand);
  font-size: var(--sf-font-xs);
}
.action-list em {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  font-style: normal;
}
.body-card,
.resource-card,
.robots-card {
  margin-top: 14px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-secondary);
}
.body-card {
  padding: 16px;
}
.resource-card {
  overflow: hidden;
}
.resource-card > header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--sf-border-light);
}
.resource-card > header div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.resource-card header span {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.resource-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 34%) minmax(0, 1fr);
  min-height: 260px;
}
.resource-workspace nav {
  padding: 8px;
  border-right: 1px solid var(--sf-border-light);
  background: var(--sf-bg-primary);
}
.resource-workspace button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: 100%;
  gap: 8px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  text-align: left;
  cursor: pointer;
}
.resource-workspace button:hover,
.resource-workspace button.active {
  border-color: var(--sf-brand);
  background: var(--sf-brand-soft);
}
.resource-workspace button span,
.resource-workspace button em {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  font-style: normal;
}
.resource-workspace button b {
  overflow: hidden;
  font:
    10px ui-monospace,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resource-preview {
  min-width: 0;
  padding: 13px;
}
.resource-preview > div {
  margin-bottom: 8px;
  color: var(--sf-text-disabled);
  font:
    10px ui-monospace,
    monospace;
}
.resource-preview pre {
  max-height: 420px;
  margin: 0;
  overflow: auto;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
  white-space: pre-wrap;
}
.resource-preview > p,
.empty {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-sm);
  text-align: center;
}
.robots-card {
  padding: 15px;
}
.robots-card h3 {
  margin: 0 0 4px;
  font-size: var(--sf-font-md);
}
.robots-card > header > span {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.robots-card article {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) 100px auto;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--sf-border-light);
}
.robot-name {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.robot-name small {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
@media (max-width: 900px) {
  .field-card {
    grid-template-columns: 1fr;
  }
  .field-row {
    grid-column: 1 / -1;
    border-right: 0 !important;
  }
  .resource-workspace {
    grid-template-columns: 1fr;
  }
  .resource-workspace nav {
    border-right: 0;
    border-bottom: 1px solid var(--sf-border-light);
  }
}
</style>
