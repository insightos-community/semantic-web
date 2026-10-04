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
