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

// 设置域（R3 设置页 v1）：生效配置快照（服务端已掩码）/ base_hash 乐观锁 / 托管密钥。
// 安全纪律：配置树与密钥清单一律来自服务端掩码响应，前端不持有、不打印明文；
// 密钥明文仅经 saveKey 透传一次（PUT 请求体），不落 store。
import { defineStore } from 'pinia'
import * as settingsApi from '@/api/settings'

// 热重载白名单（pkg/config doc.go，以代码为准）：
// llm.* / log.level / agents.profiles_dir 即时热应用；其余段保存后需重启生效。
function isHotPath(path) {
  return (
    path === 'llm' ||
    path.startsWith('llm.') ||
    path === 'log.level' ||
    path === 'agents.profiles_dir'
  )
}

// reloadHint 按 PATCH 返回的变更键清单（叶子路径）生成"已热应用/需重启"提示。
// 纯函数导出供单测。
export function reloadHint(changed) {
  if (!Array.isArray(changed) || changed.length === 0) return ''
  const hot = changed.filter((p) => isHotPath(p))
  const cold = changed.filter((p) => !isHotPath(p))
  if (cold.length === 0) return `配置已热应用（${hot.join('、')}），无需重启`
  if (hot.length === 0) return `配置已保存，以下项需重启后生效：${cold.join('、')}`
  return `配置已热应用（${hot.join('、')}）；以下项需重启后生效：${cold.join('、')}`
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    config: null, // 掩码后的生效配置树（GET /settings 响应的 settings）
    configPath: '', // 当前 Server 启动指定的唯一配置读写目标
    keySources: {}, // 端点实际凭据来源：{端点名: env|store|none}，不含任何密钥值
    runtimeDefaults: {}, // GET /settings 的 runtime_defaults，不进 PATCH
    baseHash: '', // 当前快照哈希（PATCH 乐观锁凭据）
    keys: [], // 托管密钥清单（值已掩码）：[{name, key_value, updated_at}]
    loading: false,
    saving: false,
    reloadedHint: '' // PATCH 成功后的热应用/需重启提示（reloadHint 文案）
  }),
  getters: {
    // providers 把 llm.providers 映射展开为卡片列表（name 提升为字段）
    providers: (s) => {
      const map = s.config?.llm?.providers
      if (!map || typeof map !== 'object') return []
      return Object.entries(map)
        .map(([name, p]) => ({ name, ...(p || {}) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    // services 以 service 字段聚合自动生成的端点；旧配置没有 service 时
    // 退回端点名，保证升级后仍可见且可继续设为默认。
    services() {
      const groups = new Map()
      for (const provider of this.providers) {
        const id = provider.service || provider.name
        if (!groups.has(id)) groups.set(id, { id, providers: [] })
        groups.get(id).providers.push(provider)
      }
      return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id))
    },
    defaultProvider: (s) => s.config?.llm?.default || '',
    // generalSections 通用页只读段：server/log/store（掩码后的树片段，原样展示）
    generalSections: (s) => {
      const cfg = s.config || {}
      return ['server', 'log', 'store']
        .filter((k) => cfg[k] && typeof cfg[k] === 'object')
        .map((k) => ({ name: k, data: cfg[k] }))
    }
  },
  actions: {
    // load 拉取生效配置快照（掩码树 + base_hash）
    async load() {
      this.loading = true
      try {
        const data = await settingsApi.getSettings()
        this.config = data.settings || null
        this.baseHash = data.base_hash || ''
        this.configPath = data.config_path || ''
        this.keySources = data.key_sources || {}
        this.runtimeDefaults = data.runtime_defaults || {}
      } finally {
        this.loading = false
      }
    },
    // save 以当前 baseHash 应用 merge patch；成功更新快照并生成热应用提示。
    // 409 乐观锁冲突：自动重取最新快照（下次保存即可重试），抛友好提示。
    async save(patch) {
      this.saving = true
      try {
        const data = await settingsApi.patchSettings(this.baseHash, patch)
        this.config = data.settings || null
        this.baseHash = data.base_hash || this.baseHash
        this.configPath = data.config_path || this.configPath
        this.keySources = data.key_sources || {}
        this.runtimeDefaults = data.runtime_defaults || this.runtimeDefaults
        this.reloadedHint = reloadHint(data.changed)
        return data.changed || []
      } catch (e) {
        if (settingsApi.isSettingsConflict(e)) {
          await this.load().catch(() => {})
          const err = new Error('配置已被他人修改，请刷新')
          err.code = e.code
          err.status = e.status
          throw err
        }
        throw e
      } finally {
        this.saving = false
      }
    },
    // setDefaultProvider patch 构造辅助：切换全局默认模型（llm 段属热重载白名单）
    setDefaultProvider(name) {
      return this.save({ llm: { default: name } })
    },
    // updateProviderOptions patch 构造辅助：按端点提交调用参数（options 子对象）。
    // 服务端 MergeTree 递归深合并：只提交 options 键即可保留端点其余字段与
    // 真实凭据（掩码值绝不能回传）；值为 null 的键按 RFC 7386 语义删除该参数。
    updateProviderOptions(name, options) {
      return this.save({ llm: { providers: { [name]: { options } } } })
    },
    // configureService 一次登记服务支持的端点，再把 Token 按 serviceId 托管。
    // 明文只透传一次，不进入 Pinia state。配置与密钥目前是两个后端请求，
    // 第二步失败时用 configSaved 告知页面端点已成功热应用。
    async configureService({ serviceId, providers, keyValue = '', defaultName = '' }) {
      const llm = { providers }
      if (defaultName) llm.default = defaultName
      const changed = await this.save({ llm })
      if (keyValue) {
        try {
          await this.saveKey(serviceId, keyValue)
        } catch (error) {
          error.configSaved = true
          throw error
        }
      }
      return changed
    },
    // 兼容旧调用方；新设置页统一使用 configureService。
    configureProvider({ name, provider, keyValue = '', setDefault = false }) {
      return this.configureService({
        serviceId: provider.service || name,
        providers: { [name]: provider },
        keyValue,
        defaultName: setDefault ? name : ''
      })
    },
    // removeProvider 通过 RFC 7386 null 删除端点；删除当前默认端点时，在同一
    // PATCH 中优先切换到 mock，否则选择剩余端点的第一个，避免配置短暂指向
    // 不存在的默认项。若是服务的最后一个端点，同时清理该服务托管 Token。
    async removeProvider(name) {
      const provider = this.providers.find((item) => item.name === name)
      if (!provider) return
      const serviceId = provider.service || provider.name
      const isLastServiceEndpoint =
        this.providers.filter((item) => (item.service || item.name) === serviceId).length === 1
      const remaining = this.providers.filter((item) => item.name !== name)
      if (remaining.length === 0) {
        const error = new Error('至少需要保留一个模型端点')
        error.code = 'LAST_PROVIDER_DELETE'
        throw error
      }
      const llm = { providers: { [name]: null } }
      if (name === this.defaultProvider) {
        llm.default = remaining.find((item) => item.name === 'mock')?.name || remaining[0].name
      }
      await this.save({ llm })
      if (isLastServiceEndpoint && this.keys.some((item) => item.name === serviceId)) {
        try {
          await this.removeKey(serviceId)
        } catch (error) {
          error.configSaved = true
          throw error
        }
      }
    },
    async loadKeys() {
      const data = await settingsApi.listKeys()
      this.keys = data.keys || []
    },
    // refreshKeySources 只重取安全的来源枚举，不替换配置树或 baseHash。
    // 密钥写入与配置 PATCH 是两个请求，分离刷新可避免并发响应覆盖新快照。
    async refreshKeySources() {
      const data = await settingsApi.getSettings()
      this.keySources = data?.key_sources || {}
    },
    // saveKey 新建/轮换托管密钥（明文仅透传请求体），成功后重拉掩码清单
    async saveKey(name, keyValue) {
      await settingsApi.putKey(name, keyValue)
      // 注册表缓存已由后端清空；并行重拉掩码清单和实际来源，使页面能立即
      // 区分“前端 Token 生效”与“环境变量仍优先”的情况。
      await Promise.all([this.loadKeys(), this.refreshKeySources()])
    },
    async removeKey(name) {
      await settingsApi.deleteKey(name)
      this.keys = this.keys.filter((k) => k.name !== name)
      await this.refreshKeySources()
    }
  }
})
