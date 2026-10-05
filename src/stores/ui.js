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

// UI 偏好域（17-web-ui-design §8）：主题 / 侧栏开合 / 全局通知。
// 仅主题与侧栏偏好持久化；通知为运行时状态。
import { defineStore } from 'pinia'
import { toast } from 'vue3-toastify'

let noticeSeq = 0

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: 'light',
    sidebarCollapsed: false,
    settingsDialog: { open: false, section: 'project' },
    notifications: [] // { id, type, message, ts }
  }),
  actions: {
    setTheme(theme) {
      this.theme = theme
      document.documentElement.classList.toggle('dark', theme === 'dark')
    },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },
    openSettings(section = 'project') {
      this.settingsDialog = { open: true, section }
    },
    closeSettings() {
      this.settingsDialog = { ...this.settingsDialog, open: false }
    },
    notify({ type = 'info', message = '', duration = 3000 } = {}) {
      noticeSeq += 1
      const item = { id: noticeSeq, type, message, ts: Date.now() }
      this.notifications.push(item)
      if (typeof toast[type] === 'function') {
        toast[type](message, { autoClose: duration })
      }
      return item
    },
    dismiss(id) {
      this.notifications = this.notifications.filter((n) => n.id !== id)
    }
  },
  persist: {
    pick: ['theme', 'sidebarCollapsed']
  }
})
