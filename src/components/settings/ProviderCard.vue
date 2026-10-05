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
  <el-card class="provider-card" :class="{ 'is-default': isDefault }" shadow="never">
    <div class="card-head">
      <span class="provider-name">{{ provider.name }}</span>
      <el-tag v-if="isDefault" type="success" size="small" effect="dark">默认</el-tag>
    </div>
    <div class="provider-meta">
      <div class="meta-row">
        <span class="meta-label">模型</span>
        <span class="meta-value">{{ provider.model || '--' }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Base URL</span>
        <span class="meta-value break-all">{{ provider.base_url || '（内置）' }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">驱动</span>
        <span class="meta-value">{{ provider.component || '--' }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">凭据</span>
        <span class="meta-value" :class="`key-source-${keySource}`">{{ keySourceLabel }}</span>
      </div>
    </div>
    <div class="capability-list">
      <el-tag v-for="c in capabilities" :key="c" size="small" effect="plain">{{ c }}</el-tag>
      <span v-if="capabilities.length === 0" class="no-cap">无 capabilities</span>
    </div>
    <div v-if="showParams" class="params-block">
      <button type="button" class="params-toggle" @click="paramsExpanded = !paramsExpanded">
        <span>调用参数{{ dirtyCount ? '（有未保存修改）' : '' }}</span>
        <span class="toggle-caret">{{ paramsExpanded ? '收起' : '展开' }}</span>
      </button>
      <div v-show="paramsExpanded" class="params-form">
        <div v-if="showTimeout" class="param-field">
          <label>请求超时（秒）</label>
          <el-input-number
            v-model="draft.timeout_seconds"
            :min="1"
            :step="30"
            controls-position="right"
            :placeholder="timeoutPlaceholder"
          />
          <p class="param-hint">覆盖整次 HTTP 请求（含流式读取），不是聊天栏的推理档位。</p>
        </div>
        <div class="param-field">
          <label>单次生成上限（tokens）</label>
          <el-input-number
            v-model="draft.max_tokens"
            :min="1"
            :step="512"
            controls-position="right"
            :placeholder="maxTokensPlaceholder"
          />
        </div>
        <div class="param-field">
          <label>温度（可选）</label>
          <el-input-number
            v-model="draft.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            controls-position="right"
            placeholder="服务默认"
          />
        </div>
        <div v-if="showReasoning" class="param-field">
          <label>思考深度（可选）</label>
          <el-select v-model="draft.reasoning_effort" clearable placeholder="模型默认">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
          </el-select>
        </div>
        <div class="params-actions">
          <span class="params-help">{{ paramsHelp }}</span>
          <el-button
            size="small"
            type="primary"
            :disabled="dirtyCount === 0"
            :loading="savingOptions"
            @click="onSaveOptions"
          >
            保存参数
          </el-button>
        </div>
      </div>
    </div>
    <div class="card-actions">
      <el-button
        class="default-btn"
        size="small"
        :type="isDefault ? 'info' : 'primary'"
        :disabled="isDefault || removing"
        :loading="setting"
        @click="$emit('set-default', provider.name)"
      >
        {{ isDefault ? '当前默认' : '设为默认' }}
      </el-button>
      <el-popconfirm
        :title="
          isDefault
            ? `确定删除默认端点 ${provider.name}？系统会同时切换默认模型。`
            : `确定删除端点 ${provider.name}？`
        "
        confirm-button-text="删除"
        cancel-button-text="取消"
        @confirm="$emit('remove', provider.name)"
      >
        <template #reference>
          <el-button
            class="remove-btn"
            size="small"
            type="danger"
            plain
            :disabled="setting"
            :loading="removing"
          >
            删除
          </el-button>
        </template>
      </el-popconfirm>
    </div>
  </el-card>
</template>

<script setup>
// 单个 LLM provider 展示卡：名称/模型/base_url/驱动/实际凭据来源/capabilities 徽标 +
// 当前 default 高亮；默认端点也允许删除，由 Store 在同一 PATCH 中安全选择
// 替代默认项。组件只渲染不发请求，“设为默认”和“删除”都经事件上抛给
// SettingsView，由页面负责并发状态、确认反馈和 API 调用。
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps({
  provider: { type: Object, required: true }, // {name, model, base_url?, component?, capabilities?, options?}
  keySource: { type: String, default: 'none' }, // env / store / none；不包含任何密钥值
  isDefault: { type: Boolean, default: false },
  setting: { type: Boolean, default: false }, // 正在提交"设为默认"（按钮 loading）
  removing: { type: Boolean, default: false }, // 当前卡片正在删除（删除按钮 loading）
  savingOptions: { type: Boolean, default: false }, // 当前卡片正在保存调用参数
  runtimeDefaults: { type: Object, default: () => ({}) }
})

// 组件不直接修改 store，确保确认弹窗与业务请求之间保持单向数据流。
const emit = defineEmits(['set-default', 'remove', 'save-options'])

const capabilities = computed(() =>
  Array.isArray(props.provider.capabilities) ? props.provider.capabilities : []
)

// ---- 调用参数（options）编辑 ----
// 白名单与默认值以 internal/agent/kernel/factory.go 为准；mock 不发起真实
// 请求没有参数；claude 的 options 白名单不含 timeout_seconds。值为 null 的
// 键按 RFC 7386 语义在保存时删除该参数（恢复服务端默认）。
const paramsExpanded = ref(false)
const draft = reactive({
  timeout_seconds: null,
  max_tokens: null,
  temperature: null,
  reasoning_effort: ''
})

const initialOptions = computed(() =>
  props.provider.options && typeof props.provider.options === 'object' ? props.provider.options : {}
)
const showParams = computed(() => props.provider.component && props.provider.component !== 'mock')
const showTimeout = computed(() => props.provider.component === 'openai')
const showReasoning = computed(
  () => props.provider.component === 'openai' && capabilities.value.includes('reasoning_effort')
)
const componentDefaults = computed(
  () => props.runtimeDefaults?.[props.provider.component] || props.runtimeDefaults?.openai || {}
)
const timeoutPlaceholder = computed(() => `默认 ${componentDefaults.value.timeout_seconds ?? 300}`)
const maxTokensPlaceholder = computed(() => `默认 ${componentDefaults.value.max_tokens ?? 16384}`)
const paramsHelp = computed(() => {
  const timeout = componentDefaults.value.timeout_seconds ?? 300
  const tokens = componentDefaults.value.max_tokens ?? 16384
  if (showTimeout.value) {
    return `未写入则运行时使用 ${timeout}s / ${tokens} tokens；打开本页不会自动写入配置。`
  }
  return `未写入则运行时使用 ${tokens} tokens；打开本页不会自动写入配置。Claude 不支持 timeout_seconds。`
})
const visibleKeys = computed(() => {
  const keys = ['max_tokens', 'temperature']
  if (showTimeout.value) keys.unshift('timeout_seconds')
  if (showReasoning.value) keys.push('reasoning_effort')
  return keys
})

// resetDraft 以服务端快照（provider.options）重置草稿；保存成功后快照更新
// 会自动触发，无需组件外干预。
function resetDraft() {
  draft.timeout_seconds = initialOptions.value.timeout_seconds ?? null
  draft.max_tokens = initialOptions.value.max_tokens ?? null
  draft.temperature = initialOptions.value.temperature ?? null
  draft.reasoning_effort = initialOptions.value.reasoning_effort || ''
  paramsExpanded.value = false
}
watch(() => [props.provider.name, props.provider.options], resetDraft, { immediate: true })

function normalize(value) {
  return value === undefined || value === null || value === '' ? null : value
}

// dirtyKeys 只收集发生变化的键：未变化的键不进 patch，避免与深合并语义冲突。
const dirtyKeys = computed(() =>
  visibleKeys.value.filter((key) => {
    const origin = normalize(initialOptions.value[key])
    const current = normalize(draft[key])
    if (origin === null || current === null) return origin !== current
    if (key === 'reasoning_effort') return origin !== current
    return Number(origin) !== Number(current)
  })
)
const dirtyCount = computed(() => dirtyKeys.value.length)

function onSaveOptions() {
  const options = {}
  for (const key of dirtyKeys.value) options[key] = normalize(draft[key])
  emit('save-options', { name: props.provider.name, options })
}

// keySourceLabel 把后端安全返回的来源枚举转成用户可判断优先级的文案。
const keySourceLabel = computed(() => {
  if (props.provider.component === 'mock') return '内置，无需凭据'
  if (props.keySource === 'env') return '环境变量生效'
  if (props.keySource === 'store') return '前端 Token 生效'
  return '未配置有效凭据'
})
</script>

<style scoped lang="scss">
.provider-card {
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  transition: border-color 0.2s ease;

  &.is-default {
    border-color: var(--sf-brand);
  }
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sf-space-3);
}

.provider-name {
  font-size: var(--sf-font-lg);
  font-weight: 520;
  color: var(--sf-text-primary);
}

.provider-meta {
  display: flex;
  flex-direction: column;
  gap: var(--sf-space-1);
  margin-bottom: var(--sf-space-3);
}

.meta-row {
  display: flex;
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

  &.break-all {
    word-break: break-all;
  }
}

.key-source-env {
  color: var(--sf-warning);
}

.key-source-store {
  color: var(--sf-success);
}

.capability-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sf-space-2);
  margin-bottom: var(--sf-space-4);
  min-height: 24px;
}

.no-cap {
  font-size: var(--sf-font-xs);
  color: var(--sf-text-disabled);
}

.params-block {
  margin-bottom: var(--sf-space-3);
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
}

.params-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  cursor: pointer;

  &:hover {
    color: var(--sf-brand);
  }

  .toggle-caret {
    color: var(--sf-text-disabled);
    font-size: 10px;
  }
}

.params-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  padding: 4px 10px 10px;
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    color: var(--sf-text-disabled);
    font-size: 10px;
  }

  .param-hint {
    margin: 0;
    color: var(--sf-text-disabled);
    font-size: 10px;
    line-height: 1.4;
  }

  :deep(.el-input-number),
  :deep(.el-select) {
    width: 100%;
  }
}

.params-actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.params-help {
  color: var(--sf-text-disabled);
  font-size: 10px;
  line-height: 1.4;
}

.card-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
</style>
