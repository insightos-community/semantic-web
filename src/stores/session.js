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

// 登录态域（17-web-ui-design §8）：token / 当前用户 / 当前 Team。
// 唯一持久化 store 之一（pinia-plugin-persistedstate，localStorage）。
// 后端无 me 端点与独立 refresh_token：login 响应仅 {token, expires_at}，
// 用户标识取自登录用户名；refresh 用 Bearer 旧 token 换新（见 api/request.js）。
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'

export const useSessionStore = defineStore('session', {
  state: () => ({
    token: '',
    user: null, // { id, name, avatar? }；后端无 me 端点，登录时以用户名回填 id/name
    currentTeam: null // 占位：{ id, name }，Team 切换在后续里程碑接入
  }),
  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    userName: (s) => s.user?.name || '未登录',
    teamName: (s) => s.currentTeam?.name || '默认 Team'
  },
  actions: {
    setAuth({ token, user = null } = {}) {
      this.token = token || ''
      if (user) this.user = user
    },
    setUser(user) {
      this.user = user
    },
    setTeam(team) {
      this.currentTeam = team
    },
    // 同步清态：request.js 401 刷新失败兜底用（不调 logout API，避免死 token 再打一枪）
    clearAuth() {
      this.token = ''
      this.user = null
      this.currentTeam = null
    },
    // 登录：成功写 token + 用户；失败原样抛错（err.code/message），由页面提示
    async login(username, password) {
      const data = await authApi.login(username, password)
      this.setAuth({ token: data.token, user: { id: username, name: username } })
      return data
    },
    // 退出：尽力通知后端注销（后端不可达/token 已失效也照常清态），再清本地登录态
    async logout() {
      try {
        if (this.token) await authApi.logout()
      } catch {
        // 忽略注销失败：本地清态优先
      }
      this.clearAuth()
    }
  },
  persist: true
})
