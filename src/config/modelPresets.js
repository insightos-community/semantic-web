// Copyright 2026 InsightOS
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// 常用模型服务预设。未声明 component 时使用 OpenAI 兼容驱动；Anthropic
// 等原生服务显式声明 Eino 驱动。保存服务时会自动登记 models 中的全部
// 端点；reasoningModels 只标记确实接受 reasoning_effort 档位的模型。
export const MODEL_PROVIDER_PRESETS = [
  {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    visionModels: ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    reasoningModels: ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    note: '当前接入通用 Chat 与工具调用；Responses 专有能力尚未接线。'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    shortLabel: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    visionModels: [],
    reasoningModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    note: '使用当前 V4 模型标识；同一模型可通过 reasoning_effort 调整思考深度。'
  },
  {
    id: 'qwen',
    label: '通义千问',
    shortLabel: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus'],
    visionModels: [],
    reasoningModels: [],
    note: '默认使用兼容端点；生产环境可替换为 Model Studio Workspace 专属地址。'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
    visionModels: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
    reasoningModels: [],
    note: '使用 Google 的 OpenAI compatibility 接口；该兼容层仍为 Beta。'
  },
  // MiniMax 当前首选 M3；M2.7 系列作为兼容选项保留。视频输入尚未进入
  // Semantic Framework 的 capability 契约，因此这里只登记已经接线的 image。
  {
    id: 'minimax',
    label: 'MiniMax',
    shortLabel: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    // MiniMax 国际区与中国区的密钥不能跨区域使用；地区切换只改变
    // Base URL，不改变 serviceId，因此同一服务始终只托管一份 Token。
    regions: [
      { id: 'global', label: '国际区（minimax.io）', baseUrl: 'https://api.minimax.io/v1' },
      { id: 'cn', label: '中国区（minimaxi.com）', baseUrl: 'https://api.minimaxi.com/v1' }
    ],
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    visionModels: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    reasoningModels: [],
    note: 'MiniMax-M3 是当前原生多模态模型，支持图片和视频输入；框架目前先接入图片能力。M3 的 thinking 是开关而非 reasoning_effort 档位。请选择与 Token 签发账号一致的区域。'
  },
  // Claude 使用 Eino 原生 Anthropic Messages API 驱动；thinking 与
  // reasoning_effort 不是同一套配置，本版本不做含义不准确的自动映射。
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    shortLabel: 'Claude',
    component: 'claude',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
    visionModels: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
    reasoningModels: [],
    note: '使用 Eino 原生 Anthropic Messages API；当前不把 reasoning_effort 映射为 Claude thinking。'
  },
  {
    id: 'custom',
    label: '自定义兼容服务',
    shortLabel: 'Custom',
    baseUrl: '',
    models: [],
    visionModels: [],
    reasoningModels: [],
    note: '适用于实现 OpenAI Chat Completions 协议的私有或代理端点。'
  }
]

// modelPreset 按服务 ID 查找预设；未知 ID 回退到“自定义兼容服务”。
export function modelPreset(id) {
  return MODEL_PROVIDER_PRESETS.find((item) => item.id === id) || MODEL_PROVIDER_PRESETS.at(-1)
}

// createProviderDraft 创建与预设解耦的可编辑表单状态；Token 始终为空，
// 防止切换厂商时把上一家服务的明文 Token 带入新草稿。
export function createProviderDraft(id = 'deepseek') {
  const preset = modelPreset(id)
  const model = preset.models[0] || ''
  const region = preset.regions?.[0]
  return {
    presetId: preset.id,
    serviceId: preset.id === 'custom' ? '' : preset.id,
    model,
    regionId: region?.id || '',
    baseUrl: region?.baseUrl || preset.baseUrl,
    token: '',
    // 连接服务只负责登记端点与凭据，不应悄悄改变系统路由。用户可在端点
    // 卡片中显式设为默认，Agent 也可独立选择自己的主模型。
    setDefault: false
  }
}
