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
  <div class="settings-view" :class="{ embedded }">
    <header v-if="!embedded" class="page-hero">
      <div>
        <p class="eyebrow">SYSTEM CONTROL</p>
        <h1 class="sf-page-title">系统设置</h1>
        <p class="sf-page-subtitle">统一连接模型服务、管理自动生成的端点与运行配置。</p>
      </div>
      <div class="hero-state">
        <span class="state-dot" />
        <span>{{ settings.providers.length }} 个模型端点</span>
        <code>{{ settings.defaultProvider || '未设置默认' }}</code>
      </div>
    </header>

    <div class="settings-workspace">
      <aside class="settings-nav">
        <div class="panel-heading">配置分组</div>
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          :class="{ 'is-active': activeSection === item.id }"
          @click="activeSection = item.id"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.hint }}</small>
        </button>
      </aside>

      <main class="settings-content">
        <el-alert
          v-if="settings.reloadedHint"
          class="reload-hint"
          type="success"
          :title="settings.reloadedHint"
          show-icon
          closable
          @close="settings.reloadedHint = ''"
        />
        <div v-if="activeSection !== 'simulation' && settings.configPath" class="config-target">
          <span>当前配置文件</span>
          <code>{{ settings.configPath }}</code>
          <small>本页所有配置修改都会写入 Server 启动时指定的这一文件</small>
        </div>

        <div v-loading="activeSection !== 'simulation' && settings.loading" class="content-body">
          <template v-if="activeSection === 'llm'">
            <section class="section-card provider-builder">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">QUICK CONNECT</p>
                  <h2>连接模型服务</h2>
                  <p>选择厂商和模型，在同一表单中填写 Token；保存后模型注册表会热更新。</p>
                </div>
                <span class="security-note">Token 仅发送一次，不进入前端状态</span>
              </div>

              <div class="preset-grid">
                <button
                  v-for="preset in MODEL_PROVIDER_PRESETS"
                  :key="preset.id"
                  type="button"
                  class="preset-card"
                  :class="{
                    'is-active': draft.presetId === preset.id,
                    'is-connected': isServiceConnected(preset.id)
                  }"
                  @click="choosePreset(preset.id)"
                >
                  <div class="preset-title">
                    <strong>{{ preset.shortLabel }}</strong>
                    <el-tooltip
                      content="Token 已配置"
                      effect="dark"
                      :show-after="500"
                      placement="top"
                    >
                      <i v-if="isServiceConnected(preset.id)" />
                    </el-tooltip>
                  </div>
                  <span>{{
                    isServiceConnected(preset.id)
                      ? '已连接'
                      : preset.models.length
                        ? `${preset.models.length} 个常用模型`
                        : '自定义端点'
                  }}</span>
                </button>
              </div>

              <el-form
                ref="providerForm"
                :model="draft"
                :rules="providerRules"
                label-position="top"
                class="provider-form"
              >
                <el-form-item v-if="draft.presetId === 'custom'" label="服务标识" prop="serviceId">
                  <el-input v-model="draft.serviceId" placeholder="例如 company-gateway" />
                  <span class="field-help">Token 按服务标识保存，同服务端点自动共享。</span>
                </el-form-item>
                <el-form-item v-if="draft.presetId === 'custom'" label="模型 ID" prop="model">
                  <el-input v-model="draft.model" placeholder="例如 my-chat-model" />
                </el-form-item>
                <el-form-item
                  v-if="selectedPreset.regions?.length"
                  class="region-field"
                  label="服务区域"
                >
                  <el-select v-model="draft.regionId" @change="onRegionChange">
                    <el-option
                      v-for="region in selectedPreset.regions"
                      :key="region.id"
                      :label="region.label"
                      :value="region.id"
                    />
                  </el-select>
                  <span class="field-help">区域必须与 Token 的签发站点一致，否则会返回 401。</span>
                </el-form-item>
                <el-form-item class="base-url-field" label="Base URL" prop="baseUrl">
                  <el-input v-model="draft.baseUrl" placeholder="https://example.com/v1" />
                </el-form-item>
                <el-form-item class="token-field" label="API Token（可选）">
                  <el-input
                    v-model="draft.token"
                    type="password"
                    show-password
                    autocomplete="new-password"
                    :placeholder="tokenPlaceholder"
                  />
                  <span class="field-help">留空保留当前 Token；该服务的全部端点共享此凭据。</span>
                </el-form-item>
              </el-form>

              <div v-if="selectedPreset.models.length" class="endpoint-preview">
                <span>保存后自动生成</span>
                <code v-for="model in selectedPreset.models" :key="model">{{ model }}</code>
              </div>

              <div class="preset-note">
                <span>{{ selectedPreset.label }}</span>
                {{ selectedPreset.note }}
              </div>
              <div class="form-actions">
                <el-checkbox v-model="draft.setDefault">同时设为全局默认模型</el-checkbox>
                <el-button
                  type="primary"
                  :loading="settings.saving || providerSubmitting"
                  @click="onSaveProvider"
                >
                  连接服务并生成端点
                </el-button>
              </div>
            </section>

            <section class="section-card">
              <div class="section-heading compact">
                <div>
                  <p class="eyebrow">CONNECTED SERVICES</p>
                  <h2>已连接服务与端点</h2>
                </div>
              </div>
              <EmptyState
                v-if="!settings.loading && settings.providers.length === 0"
                description="暂无模型端点配置"
              />
              <div v-else class="service-list">
                <section
                  v-for="service in settings.services"
                  :key="service.id"
                  class="service-group"
                >
                  <div class="service-heading">
                    <div>
                      <strong>{{ serviceLabel(service.id) }}</strong>
                      <span>{{ service.providers.length }} 个端点</span>
                    </div>
                    <el-tag :type="serviceCredentialState(service).type" effect="plain">
                      {{ serviceCredentialState(service).label }}
                    </el-tag>
                  </div>
                  <div class="provider-grid">
                    <ProviderCard
                      v-for="provider in service.providers"
                      :key="provider.name"
                      :provider="provider"
                      :key-source="settings.keySources[provider.name] || 'none'"
                      :runtime-defaults="settings.runtimeDefaults"
                      :is-default="provider.name === settings.defaultProvider"
                      :setting="settingDefault === provider.name"
                      :removing="removingProvider === provider.name"
                      :saving-options="savingOptions === provider.name"
                      @set-default="onSetDefault"
                      @remove="onRemoveProvider"
                      @save-options="onSaveOptions"
                    />
                  </div>
                </section>
              </div>
            </section>
          </template>

          <RuntimeInstallationsSettings v-else-if="activeSection === 'simulation'" />

          <template v-else>
            <section class="section-card">
              <div class="section-heading compact">
                <div>
                  <p class="eyebrow">RUNTIME SNAPSHOT</p>
                  <h2>只读运行配置</h2>
                  <p>server、store 等非热重载项修改后需重启；敏感字段由服务端掩码。</p>
                </div>
              </div>
              <div class="general-grid">
                <article v-for="section in settings.generalSections" :key="section.name">
                  <h3>{{ section.name }}</h3>
                  <pre>{{ formatSection(section.data) }}</pre>
                </article>
              </div>
            </section>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ProviderCard from '@/components/settings/ProviderCard.vue'
import RuntimeInstallationsSettings from '@/components/settings/RuntimeInstallationsSettings.vue'
import { MODEL_PROVIDER_PRESETS, createProviderDraft, modelPreset } from '@/config/modelPresets'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  initialSection: { type: String, default: 'llm' }
})
const settings = useSettingsStore()
const ui = useUiStore()
const sections = [
  { id: 'llm', label: '模型服务', hint: '服务、Token 与端点' },
  { id: 'simulation', label: '仿真 Runtime', hint: '安装、诊断与受管进程' },
  { id: 'general', label: '通用', hint: '运行配置' }
]
const activeSection = ref(props.initialSection)
const settingDefault = ref('') // 正在设为默认的端点名；空串表示无请求
const removingProvider = ref('') // 正在删除的端点名；用于阻止重复提交并定位 loading
const savingOptions = ref('') // 正在保存调用参数的端点名；用于按钮 loading 与防重复提交
const providerSubmitting = ref(false)
const providerForm = ref(null)
const draft = reactive(createProviderDraft())
const providerRules = {
  serviceId: [
    { required: true, message: '请输入服务标识', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9._-]+$/,
      message: '仅支持字母、数字、点、下划线和连字符',
      trigger: 'blur'
    }
  ],
  model: [{ required: true, message: '请选择或输入模型 ID', trigger: 'change' }],
  baseUrl: [{ required: true, message: '请输入 OpenAI-compatible Base URL', trigger: 'blur' }]
}
const selectedPreset = computed(() => modelPreset(draft.presetId))
const tokenPlaceholder = computed(() => {
  const found = settings.keys.find((item) => item.name === draft.serviceId)
  return found ? `已配置 ${found.key_value}；输入新值可轮换` : '输入厂商 API Token'
})

onMounted(async () => {
  try {
    await Promise.all([settings.load(), settings.loadKeys()])
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '设置加载失败' })
  }
})

function choosePreset(id) {
  Object.assign(draft, createProviderDraft(id))
  providerForm.value?.clearValidate()
}

// onRegionChange 把 MiniMax 区域选择映射为官方兼容端点；Base URL 仍可由
// 用户继续编辑，以兼容企业网关或代理地址。
function onRegionChange(regionId) {
  const region = selectedPreset.value.regions?.find((item) => item.id === regionId)
  if (region) draft.baseUrl = region.baseUrl
}

async function onSaveProvider() {
  if (providerSubmitting.value) return
  try {
    await providerForm.value?.validate()
  } catch {
    return
  }
  providerSubmitting.value = true
  const serviceId = draft.serviceId.trim()
  const models = selectedPreset.value.models.length
    ? selectedPreset.value.models
    : [draft.model.trim()]
  const providers = Object.fromEntries(
    models.map((model) => [
      model,
      {
        service: serviceId,
        // 绝大多数厂商使用 OpenAI 兼容驱动；原生服务由预设显式覆盖。
        component: selectedPreset.value.component || 'openai',
        base_url: draft.baseUrl.trim(),
        model,
        capabilities: [
          'text',
          'tool_call',
          ...(selectedPreset.value.visionModels.includes(model) ? ['image'] : []),
          ...(selectedPreset.value.reasoningModels.includes(model) ? ['reasoning_effort'] : [])
        ]
      }
    ])
  )
  try {
    await settings.configureService({
      serviceId,
      providers,
      keyValue: draft.token.trim(),
      defaultName: draft.setDefault ? models[0] : ''
    })
    draft.token = ''
    ui.notify({ type: 'success', message: `${selectedPreset.value.label} 已连接，端点已热应用` })
  } catch (error) {
    const prefix = error.configSaved ? '模型端点已保存，但 Token 保存失败：' : ''
    ui.notify({
      type: error.configSaved ? 'warning' : 'error',
      message: prefix + (error.message || '保存失败')
    })
  } finally {
    providerSubmitting.value = false
  }
}

async function onSetDefault(name) {
  if (settingDefault.value) return
  settingDefault.value = name
  try {
    await settings.setDefaultProvider(name)
    ui.notify({ type: 'success', message: `默认模型已切换为 ${name}` })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '保存失败' })
  } finally {
    settingDefault.value = ''
  }
}

// onRemoveProvider 删除端点；当前默认端点由 Store 原子切换到替代项，服务的
// 最后一个端点删除后还会清理对应的前端托管 Token。
async function onRemoveProvider(name) {
  if (removingProvider.value) return
  removingProvider.value = name
  try {
    await settings.removeProvider(name)
    ui.notify({ type: 'success', message: `端点 ${name} 已删除` })
  } catch (error) {
    ui.notify({
      type: error.configSaved ? 'warning' : 'error',
      message: error.configSaved
        ? `端点已删除，但服务 Token 清理失败：${error.message}`
        : error.message || '删除端点失败'
    })
  } finally {
    removingProvider.value = ''
  }
}

// onSaveOptions 保存端点调用参数：只提交 options 子对象（服务端深合并保留
// 端点其余字段与真实凭据），成功后快照更新会让 ProviderCard 草稿自动复位。
async function onSaveOptions({ name, options }) {
  if (savingOptions.value) return
  savingOptions.value = name
  try {
    await settings.updateProviderOptions(name, options)
    ui.notify({ type: 'success', message: `端点 ${name} 调用参数已热应用` })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '保存参数失败' })
  } finally {
    savingOptions.value = ''
  }
}

function isServiceConnected(id) {
  return settings.keys.some((item) => item.name === id)
}

// serviceCredentialState 汇总服务下各端点的实际凭据来源。环境变量优先于
// 前端托管 Token，因此即使数据库中已有 Token，也必须按 key_sources 显示 env。
function serviceCredentialState(service) {
  if (service.providers.every((provider) => provider.component === 'mock')) {
    return { type: 'info', label: '内置，无需凭据' }
  }
  const sources = service.providers.map((provider) => settings.keySources[provider.name] || 'none')
  if (sources.includes('env')) return { type: 'warning', label: '环境变量凭据生效' }
  if (sources.includes('store')) return { type: 'success', label: '前端 Token 生效' }
  return { type: 'info', label: '未配置有效凭据' }
}

function serviceLabel(id) {
  return modelPreset(id).id === id ? modelPreset(id).label : id
}

function formatSection(data) {
  return JSON.stringify(data, null, 2)
}
</script>

<style scoped lang="scss">
.settings-view {
  height: 100%;
  padding: 18px;
  overflow: auto;
}

.settings-view.embedded {
  height: auto;
  padding: 0;
  overflow: visible;

  .settings-workspace {
    display: block;
    min-height: 0;
  }

  .settings-nav {
    display: none;
  }

  .settings-content {
    padding: 22px 26px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
}

.page-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 14px;
  padding: 18px 20px;
  border: 0;
  border-left: 3px solid var(--sf-brand);
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.12em;
}

.hero-state {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);

  code {
    padding: 5px 8px;
    border-radius: 6px;
    background: var(--sf-bg-tertiary);
    color: var(--sf-text-primary);
  }
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sf-success);
}

.settings-workspace {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
  min-height: 560px;
}

.settings-nav,
.settings-content {
  border: 0;
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.settings-nav {
  align-self: start;
  padding: 10px;

  button {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    margin-bottom: 6px;
    padding: 11px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--sf-text-primary);
    text-align: left;
    cursor: pointer;

    small {
      color: var(--sf-text-disabled);
      font-size: 11px;
    }

    &:hover {
      background: var(--sf-bg-hover);
    }

    &.is-active {
      border-color: color-mix(in srgb, var(--sf-brand) 25%, var(--sf-border));
      background: var(--sf-brand-soft);
      color: var(--sf-brand);
    }
  }
}

.panel-heading {
  padding: 6px 10px 12px;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  font-weight: 520;
}

.settings-content {
  min-width: 0;
  padding: 18px;
}

.reload-hint {
  margin-bottom: 14px;
}

.config-target {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 4px 10px;
  margin-bottom: 14px;
  padding: 9px 11px;
  border: 0;
  border-radius: 8px;
  background: var(--sf-bg-primary);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);

  code {
    overflow: hidden;
    color: var(--sf-text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    grid-column: 2;
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.content-body {
  min-height: 420px;
}

.section-card {
  margin-bottom: 14px;
  padding: 18px;
  border: 1px solid var(--sf-border-light);
  border-radius: 12px;
  background: var(--sf-bg-primary);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;

  &.compact {
    align-items: center;
  }

  h2 {
    margin: 0;
    color: var(--sf-text-primary);
    font-size: var(--sf-font-lg);
  }

  p:not(.eyebrow) {
    margin: 6px 0 0;
    color: var(--sf-text-secondary);
    font-size: var(--sf-font-xs);
    line-height: 1.55;
  }
}

.security-note {
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(24, 162, 97, 0.09);
  color: var(--sf-success);
  font-size: 11px;
  white-space: nowrap;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 11px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  text-align: left;
  cursor: pointer;

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }

  &.is-connected {
    border-color: color-mix(in srgb, var(--sf-success) 45%, var(--sf-border));
  }

  &:hover,
  &.is-active {
    border-color: color-mix(in srgb, var(--sf-brand) 45%, var(--sf-border));
  }

  &.is-active {
    background: var(--sf-brand-soft);
    color: var(--sf-brand);
  }
}

.preset-title {
  display: flex;
  align-items: center;
  justify-content: space-between;

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--sf-success);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--sf-success) 13%, transparent);
  }
}

.provider-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;

  :deep(.el-select) {
    width: 100%;
  }
}

.base-url-field {
  grid-column: 1 / -1;
}

.token-field {
  grid-column: 1 / -1;
}

.field-help {
  margin-top: 5px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  line-height: 1.4;
}

.preset-note {
  padding: 9px 11px;
  border-left: 2px solid var(--sf-info);
  background: color-mix(in srgb, var(--sf-info) 6%, transparent);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);

  span {
    margin-right: 8px;
    color: var(--sf-info);
    font-weight: 380;
  }
}

.endpoint-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 10px;

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }

  code {
    padding: 4px 7px;
    border: 1px solid var(--sf-border-light);
    border-radius: 6px;
    background: var(--sf-bg-secondary);
    color: var(--sf-text-secondary);
    font-size: 11px;
  }
}

.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.service-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.service-group {
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
}

.service-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;

  div {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  strong {
    color: var(--sf-text-primary);
    font-size: var(--sf-font-sm);
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.policy-grid,
.general-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.policy-grid article,
.general-grid article {
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
}

.policy-grid strong,
.general-grid h3 {
  margin: 0;
  color: var(--sf-text-primary);
  font-size: var(--sf-font-sm);
}

.policy-grid p {
  margin: 7px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  line-height: 1.55;
}

.general-grid {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  margin-bottom: 0;

  pre {
    margin: 10px 0 0;
    color: var(--sf-text-secondary);
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

@media (max-width: 1050px) {
  .settings-workspace {
    grid-template-columns: 180px minmax(0, 1fr);
  }

  .preset-grid {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }

  .policy-grid {
    grid-template-columns: 1fr;
  }
}
</style>
