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

// 认证域 API（session store 数据源，17-web-ui-design §8）。
// 后端契约（internal/server/auth/handlers.go）：
// - POST /auth/login    {username,password} → {token, expires_at}；无 user/me 端点，
//   用户标识由登录用户名回填（见 stores/session.js login 动作）
// - POST /auth/refresh  Bearer 旧 token → {token, expires_at}（401 单飞重放见 api/request.js）
// - POST /auth/logout   Bearer → {ok:true}
import request from './request'

export function login(username, password) {
  return request.post('/auth/login', { username, password })
}

export function refresh() {
  return request.post('/auth/refresh')
}

export function logout() {
  return request.post('/auth/logout')
}
