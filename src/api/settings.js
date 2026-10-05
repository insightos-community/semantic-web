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

// 设置域 API（settings store 数据源）。
// 后端契约（internal/server/http/handlers/settings.go，以代码为准）：
// - GET    /settings             → {settings:<掩码配置树>, base_hash, config_path,
//                                   key_sources:{端点名:env|store|none},
//                                   runtime_defaults:{openai:{timeout_seconds,max_tokens},
//                                                     claude:{max_tokens}}}
//     runtime_defaults 与配置树平行，不进 yaml / PATCH；空 options 时消费侧仍用这些值
//     config_path 是当前 Server 启动实例唯一的配置读写目标
// - PATCH  /settings {base_hash, patch}（RFC 7386 merge patch，键名同 yaml）
//     → {settings, base_hash, config_path, key_sources, changed:[叶子路径]}；
//       乐观锁冲突 409 SETTINGS_CONFLICT，
//       校验失败 400（message 聚合全部位置），写回未启用 503 SETTINGS_UNAVAILABLE
// - GET    /settings/keys        → {keys:[{name, key_value(掩码), updated_at}]}（名称升序）
// - PUT    /settings/keys/{name} {key_value} → {ok:true}；name 优先为模型服务 ID，兼容端点名，
//     key_value ≥ 8 字符（明文仅出现在本请求体，服务端不落日志/审计）
// - DELETE /settings/keys/{name} → 204；不存在 404 SETTINGS_KEY_NOT_FOUND
import request from './request'

export function getSettings() {
  if (import.meta.env.VITE_STUDIO_FIXTURES === 'true') {
    return Promise.resolve({
      settings: {},
      base_hash: 'fixture',
      config_path: 'fixture://settings',
      key_sources: {},
      runtime_defaults: {
        openai: { timeout_seconds: 300, max_tokens: 16384 },
        claude: { max_tokens: 16384 }
      }
    })
  }
  return request.get('/settings')
}

export function patchSettings(baseHash, patch) {
  return request.patch('/settings', { base_hash: baseHash, patch })
}

export function listKeys() {
  return request.get('/settings/keys')
}

export function putKey(name, keyValue) {
  return request.put(`/settings/keys/${encodeURIComponent(name)}`, { key_value: keyValue })
}

export function deleteKey(name) {
  return request.delete(`/settings/keys/${encodeURIComponent(name)}`)
}

// isSettingsConflict 判定 base_hash 乐观锁冲突（409 SETTINGS_CONFLICT）：
// 调用方应重新 GET 快照（拿到最新 base_hash）后再允许用户重试。
export function isSettingsConflict(err) {
  return err?.code === 'SETTINGS_CONFLICT'
}
