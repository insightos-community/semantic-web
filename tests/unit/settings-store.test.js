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

// settings store（R3 设置页 v1）：快照加载（掩码呈现）/ PATCH 乐观锁与 409 /
// 热应用提示 / 托管密钥 CRUD（契约以 internal/server/http/handlers/settings.go 为准）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/settings', () => ({
  getSettings: vi.fn(),
  patchSettings: vi.fn(),
  listKeys: vi.fn(),
  putKey: vi.fn(),
  deleteKey: vi.fn(),
  isSettingsConflict: (err) => err?.code === 'SETTINGS_CONFLICT'
}))

import * as settingsApi from '@/api/settings'
import { MODEL_PROVIDER_PRESETS, createProviderDraft, modelPreset } from '@/config/modelPresets'
import { reloadHint, useSettingsStore } from '@/stores/settings'

// 掩码后的配置树（服务端 MaskTree 输出形态，以 settings.go 为准）
const tree = (over = {}) => ({
  server: { http_addr: ':8080', ws_addr: ':8081' },
  log: { level: 'info' },
  store: { driver: 'sqlite', sqlite_path: '.output/semantic.db' },
  llm: {
    default: 'deepseek-chat',
    providers: {
      'deepseek-chat': {
        component: 'openai',
        base_url: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        api_key: 'sk-abc***', // 服务端掩码值（MaskSecret：前 6 字符 + ***）
        capabilities: ['text', 'tool_call']
      },
      mock: { component: 'mock', model: 'mock', capabilities: ['text', 'tool_call'] }
    }
  },
  ...over
})

const snapshot = (hash = 'hash-1', over = {}) => ({
  settings: tree(over),
  base_hash: hash,
  config_path: '/home/test/.semantic/configs/semantic-server.yaml',
  key_sources: { 'deepseek-chat': 'store', mock: 'none' }
})

const keyRows = () => [
  { name: 'deepseek-chat', key_value: 'sk-abc***', updated_at: '2026-08-04T08:00:00Z' }
]

describe('settings store · 快照加载（掩码呈现）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load：写入掩码配置树与 base_hash，loading 复位', async () => {
    settingsApi.getSettings.mockResolvedValue(snapshot('hash-1'))
    const settings = useSettingsStore()

    await settings.load()

    expect(settings.baseHash).toBe('hash-1')
    expect(settings.configPath).toBe('/home/test/.semantic/configs/semantic-server.yaml')
    expect(settings.keySources).toEqual({ 'deepseek-chat': 'store', mock: 'none' })
    expect(settings.loading).toBe(false)
    // 掩码值原样呈现，前端不可能得到明文
    expect(settings.config.llm.providers['deepseek-chat'].api_key).toBe('sk-abc***')
    expect(settings.defaultProvider).toBe('deepseek-chat')
    expect(settings.providers.map((p) => p.name)).toEqual(['deepseek-chat', 'mock'])
    expect(settings.generalSections.map((s) => s.name)).toEqual(['server', 'log', 'store'])
    expect(settings.runtimeDefaults).toEqual({})
  })

  it('load 保存 runtime_defaults，PATCH 响应没有时保留原值', async () => {
    settingsApi.getSettings.mockResolvedValue({
      ...snapshot('hash-1'),
      runtime_defaults: { openai: { timeout_seconds: 300, max_tokens: 16384 } }
    })
    settingsApi.patchSettings.mockResolvedValue({
      settings: tree(),
      base_hash: 'hash-2',
      config_path: '/home/test/.semantic/configs/semantic-server.yaml',
      key_sources: { 'deepseek-chat': 'store', mock: 'none' },
      changed: ['llm.default']
    })
    const settings = useSettingsStore()
    await settings.load()
    expect(settings.runtimeDefaults.openai.max_tokens).toBe(16384)
    await settings.save({ llm: { default: 'mock' } })
    expect(settings.runtimeDefaults.openai.max_tokens).toBe(16384)
  })

  it('load 失败：loading 复位且错误原样抛出', async () => {
    settingsApi.getSettings.mockRejectedValue(new Error('网络异常'))
    const settings = useSettingsStore()

    await expect(settings.load()).rejects.toThrow('网络异常')
    expect(settings.loading).toBe(false)
    expect(settings.config).toBeNull()
  })
})

describe('settings store · save（PATCH 乐观锁）', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    settingsApi.getSettings.mockResolvedValue(snapshot('hash-1'))
    const settings = useSettingsStore()
    await settings.load()
  })

  it('setDefaultProvider：以当前 baseHash 提交 merge patch，成功后更新快照与 hash', async () => {
    const next = tree()
    next.llm.default = 'mock'
    settingsApi.patchSettings.mockResolvedValue({
      settings: next,
      base_hash: 'hash-2',
      config_path: '/tmp/runtime/semantic-server.yaml',
      changed: ['llm.default']
    })
    const settings = useSettingsStore()

    const changed = await settings.setDefaultProvider('mock')

    expect(settingsApi.patchSettings).toHaveBeenCalledWith('hash-1', { llm: { default: 'mock' } })
    expect(changed).toEqual(['llm.default'])
    expect(settings.baseHash).toBe('hash-2')
    expect(settings.defaultProvider).toBe('mock')
    expect(settings.configPath).toBe('/tmp/runtime/semantic-server.yaml')
    expect(settings.saving).toBe(false)
    // llm 段属热重载白名单 → 已热应用提示
    expect(settings.reloadedHint).toContain('已热应用')
    expect(settings.reloadedHint).toContain('llm.default')
  })

  it('save 非白名单段：提示需重启生效', async () => {
    settingsApi.patchSettings.mockResolvedValue({
      settings: tree(),
      base_hash: 'hash-2',
      changed: ['server.http_addr']
    })
    const settings = useSettingsStore()

    await settings.save({ server: { http_addr: ':9090' } })

    expect(settings.reloadedHint).toContain('需重启后生效')
    expect(settings.reloadedHint).toContain('server.http_addr')
  })

  it('409 SETTINGS_CONFLICT：自动重取最新快照后抛"配置已被他人修改，请刷新"', async () => {
    const conflict = new Error('配置快照已被并发修改，请重新 GET 获取最新 base_hash 后重试')
    conflict.code = 'SETTINGS_CONFLICT'
    conflict.status = 409
    settingsApi.patchSettings.mockRejectedValue(conflict)
    // 冲突后重取到他人写入的新快照（hash 已变）
    settingsApi.getSettings.mockResolvedValue(snapshot('hash-9'))
    const settings = useSettingsStore()

    await expect(settings.setDefaultProvider('mock')).rejects.toMatchObject({
      code: 'SETTINGS_CONFLICT',
      message: '配置已被他人修改，请刷新'
    })
    expect(settings.baseHash).toBe('hash-9') // 已刷新，下次保存可重试
    expect(settings.saving).toBe(false)
  })

  it('save 其他错误（如 400 校验失败）：原样抛出，不触发重取', async () => {
    const badRequest = new Error('llm.default 不在 providers 清单中')
    badRequest.code = 'BAD_REQUEST'
    settingsApi.patchSettings.mockRejectedValue(badRequest)
    const settings = useSettingsStore()
    const calls = settingsApi.getSettings.mock.calls.length

    await expect(settings.save({ llm: { default: 'ghost' } })).rejects.toMatchObject({
      code: 'BAD_REQUEST'
    })
    expect(settingsApi.getSettings.mock.calls.length).toBe(calls) // 未额外 GET
    expect(settings.saving).toBe(false)
  })

  it('updateProviderOptions：只提交 options 子对象（深合并保留端点其余字段）', async () => {
    settingsApi.patchSettings.mockResolvedValue({
      settings: tree(),
      base_hash: 'hash-2',
      changed: ['llm.providers.deepseek-chat.options.timeout_seconds']
    })
    const settings = useSettingsStore()

    await settings.updateProviderOptions('deepseek-chat', {
      timeout_seconds: 300,
      max_tokens: null
    })

    expect(settingsApi.patchSettings).toHaveBeenCalledWith('hash-1', {
      llm: {
        providers: { 'deepseek-chat': { options: { timeout_seconds: 300, max_tokens: null } } }
      }
    })
    expect(settings.reloadedHint).toContain('已热应用')
  })

  it('configureService：一次登记服务端点，再按服务 ID 透传 Token', async () => {
    const next = tree()
    next.llm.default = 'gpt-5.6'
    next.llm.providers['gpt-5.6'] = {
      service: 'openai',
      component: 'openai',
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-5.6',
      capabilities: ['text', 'tool_call']
    }
    next.llm.providers['gpt-5.6-terra'] = {
      ...next.llm.providers['gpt-5.6'],
      model: 'gpt-5.6-terra'
    }
    settingsApi.patchSettings.mockResolvedValue({
      settings: next,
      base_hash: 'hash-2',
      changed: ['llm.default', 'llm.providers.gpt-5.6']
    })
    settingsApi.putKey.mockResolvedValue({ ok: true })
    settingsApi.listKeys.mockResolvedValue({
      keys: [{ name: 'openai', key_value: 'sk-new***', updated_at: '2026-08-04T09:00:00Z' }]
    })
    settingsApi.getSettings.mockResolvedValue({
      key_sources: { 'gpt-5.6': 'store', 'gpt-5.6-terra': 'store', mock: 'none' }
    })
    const settings = useSettingsStore()

    await settings.configureService({
      serviceId: 'openai',
      providers: {
        'gpt-5.6': next.llm.providers['gpt-5.6'],
        'gpt-5.6-terra': next.llm.providers['gpt-5.6-terra']
      },
      keyValue: 'sk-plaintext-new',
      defaultName: 'gpt-5.6'
    })

    expect(settingsApi.patchSettings).toHaveBeenCalledWith('hash-1', {
      llm: {
        default: 'gpt-5.6',
        providers: {
          'gpt-5.6': next.llm.providers['gpt-5.6'],
          'gpt-5.6-terra': next.llm.providers['gpt-5.6-terra']
        }
      }
    })
    expect(settingsApi.putKey).toHaveBeenCalledWith('openai', 'sk-plaintext-new')
    expect(settings.defaultProvider).toBe('gpt-5.6')
    expect(JSON.stringify(settings.$state)).not.toContain('sk-plaintext-new')
    expect(settings.keys[0].key_value).toBe('sk-new***')
    expect(settings.keySources['gpt-5.6']).toBe('store')
  })

  it('configureProvider：Token 保存失败时标记端点已保存，避免误报整体失败', async () => {
    settingsApi.patchSettings.mockResolvedValue({
      settings: tree(),
      base_hash: 'hash-2',
      changed: ['llm.providers.deepseek-chat.model']
    })
    settingsApi.putKey.mockRejectedValue(new Error('密钥库暂不可用'))
    const settings = useSettingsStore()

    await expect(
      settings.configureProvider({
        name: 'deepseek-chat',
        provider: tree().llm.providers['deepseek-chat'],
        keyValue: 'sk-not-stored'
      })
    ).rejects.toMatchObject({ message: '密钥库暂不可用', configSaved: true })
    expect(JSON.stringify(settings.$state)).not.toContain('sk-not-stored')
  })

  it('removeProvider：以 null 删除非默认端点', async () => {
    const next = tree()
    delete next.llm.providers.mock
    settingsApi.patchSettings.mockResolvedValue({
      settings: next,
      base_hash: 'hash-2',
      config_path: '/home/test/.semantic/configs/semantic-server.yaml',
      changed: ['llm.providers.mock']
    })
    const settings = useSettingsStore()

    await settings.removeProvider('mock')

    expect(settingsApi.patchSettings).toHaveBeenCalledWith('hash-1', {
      llm: { providers: { mock: null } }
    })
    expect(settings.providers.some((provider) => provider.name === 'mock')).toBe(false)
  })

  it('removeProvider：删除服务最后一个端点时同步清理服务 Token', async () => {
    const settings = useSettingsStore()
    const current = tree()
    current.llm.default = 'mock'
    current.llm.providers['deepseek-chat'].service = 'deepseek'
    settings.config = current
    settings.keys = [{ name: 'deepseek', key_value: 'sk-old***' }]

    const next = tree()
    next.llm.default = 'mock'
    delete next.llm.providers['deepseek-chat']
    settingsApi.patchSettings.mockResolvedValue({
      settings: next,
      base_hash: 'hash-2',
      changed: ['llm.providers.deepseek-chat']
    })
    settingsApi.deleteKey.mockResolvedValue(undefined)
    settingsApi.getSettings.mockResolvedValue({ key_sources: { mock: 'none' } })

    await settings.removeProvider('deepseek-chat')

    expect(settingsApi.patchSettings).toHaveBeenCalledWith('hash-1', {
      llm: { providers: { 'deepseek-chat': null } }
    })
    expect(settingsApi.deleteKey).toHaveBeenCalledWith('deepseek')
    expect(settings.keys).toEqual([])
  })
  it('removeProvider：删除默认端点时在同一请求中自动切换到 mock', async () => {
    const settings = useSettingsStore()
    const next = tree()
    next.llm.default = 'mock'
    delete next.llm.providers['deepseek-chat']
    settingsApi.patchSettings.mockResolvedValue({
      settings: next,
      base_hash: 'hash-2',
      changed: ['llm.default', 'llm.providers.deepseek-chat']
    })

    await settings.removeProvider('deepseek-chat')

    expect(settingsApi.patchSettings).toHaveBeenCalledWith('hash-1', {
      llm: { default: 'mock', providers: { 'deepseek-chat': null } }
    })
    expect(settings.defaultProvider).toBe('mock')
  })
})

describe('settings store · 托管密钥 CRUD', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadKeys：写入掩码密钥清单', async () => {
    settingsApi.listKeys.mockResolvedValue({ keys: keyRows() })
    const settings = useSettingsStore()

    await settings.loadKeys()

    expect(settings.keys).toHaveLength(1)
    expect(settings.keys[0]).toMatchObject({ name: 'deepseek-chat', key_value: 'sk-abc***' })
  })

  it('saveKey：PUT 明文（仅请求体透传）后重拉掩码清单', async () => {
    settingsApi.putKey.mockResolvedValue({ ok: true })
    settingsApi.listKeys.mockResolvedValue({ keys: keyRows() })
    settingsApi.getSettings.mockResolvedValue({
      key_sources: { 'deepseek-chat': 'store', mock: 'none' }
    })
    const settings = useSettingsStore()

    await settings.saveKey('deepseek-chat', 'sk-plaintext-12345678')

    expect(settingsApi.putKey).toHaveBeenCalledWith('deepseek-chat', 'sk-plaintext-12345678')
    expect(settingsApi.listKeys).toHaveBeenCalledTimes(1)
    expect(settingsApi.getSettings).toHaveBeenCalledTimes(1)
    // store 中只有服务端回显的掩码值，明文不落态
    expect(settings.keys[0].key_value).toBe('sk-abc***')
    expect(settings.keySources['deepseek-chat']).toBe('store')
    expect(JSON.stringify(settings.keys)).not.toContain('sk-plaintext-12345678')
  })

  it('removeKey：DELETE 成功后从清单移除', async () => {
    settingsApi.listKeys.mockResolvedValue({ keys: keyRows() })
    settingsApi.deleteKey.mockResolvedValue(undefined) // 204 无响应体
    settingsApi.getSettings.mockResolvedValue({
      key_sources: { 'deepseek-chat': 'none', mock: 'none' }
    })
    const settings = useSettingsStore()
    await settings.loadKeys()

    await settings.removeKey('deepseek-chat')

    expect(settingsApi.deleteKey).toHaveBeenCalledWith('deepseek-chat')
    expect(settings.keys).toHaveLength(0)
    expect(settings.keySources['deepseek-chat']).toBe('none')
  })

  it('removeKey 失败（404 不存在）：清单不变且错误原样抛出', async () => {
    const notFound = new Error('托管密钥不存在: ghost')
    notFound.code = 'SETTINGS_KEY_NOT_FOUND'
    settingsApi.deleteKey.mockRejectedValue(notFound)
    const settings = useSettingsStore()
    settings.keys = keyRows()

    await expect(settings.removeKey('ghost')).rejects.toMatchObject({
      code: 'SETTINGS_KEY_NOT_FOUND'
    })
    expect(settings.keys).toHaveLength(1)
  })
})

describe('reloadHint · 热应用/需重启提示', () => {
  it('全白名单 → 已热应用', () => {
    expect(reloadHint(['llm.default'])).toBe('配置已热应用（llm.default），无需重启')
    expect(reloadHint(['log.level', 'agents.profiles_dir'])).toContain('无需重启')
  })

  it('全非白名单 → 需重启', () => {
    expect(reloadHint(['server.http_addr'])).toBe(
      '配置已保存，以下项需重启后生效：server.http_addr'
    )
  })

  it('混合 → 两段都提示', () => {
    const hint = reloadHint(['llm.default', 'store.sqlite_path'])
    expect(hint).toContain('已热应用（llm.default）')
    expect(hint).toContain('需重启后生效：store.sqlite_path')
  })

  it('空清单 → 空提示', () => {
    expect(reloadHint([])).toBe('')
    expect(reloadHint(undefined)).toBe('')
  })
})

describe('模型厂商预设', () => {
  it('覆盖常用兼容厂商并生成不含 Token 的独立表单草稿', () => {
    expect(MODEL_PROVIDER_PRESETS.map((preset) => preset.id)).toEqual([
      'openai',
      'deepseek',
      'qwen',
      'gemini',
      'minimax',
      'anthropic',
      'custom'
    ])
    expect(modelPreset('openai').models).toContain('gpt-5.6')
    expect(modelPreset('gemini').models).toContain('gemini-3.6-flash')
    expect(modelPreset('minimax')).toMatchObject({
      models: expect.arrayContaining(['MiniMax-M3']),
      visionModels: expect.arrayContaining(['MiniMax-M3']),
      regions: [
        expect.objectContaining({ id: 'global', baseUrl: 'https://api.minimax.io/v1' }),
        expect.objectContaining({ id: 'cn', baseUrl: 'https://api.minimaxi.com/v1' })
      ]
    })
    expect(createProviderDraft('minimax')).toMatchObject({
      serviceId: 'minimax',
      model: 'MiniMax-M3',
      regionId: 'global',
      baseUrl: 'https://api.minimax.io/v1',
      token: '',
      setDefault: false
    })
    expect(modelPreset('anthropic')).toMatchObject({
      component: 'claude',
      baseUrl: 'https://api.anthropic.com',
      models: expect.arrayContaining(['claude-sonnet-5'])
    })
    expect(createProviderDraft('deepseek')).toMatchObject({
      serviceId: 'deepseek',
      model: 'deepseek-v4-pro',
      token: ''
    })
  })
})
