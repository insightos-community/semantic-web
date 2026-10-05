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

import { defineStore } from 'pinia'
import * as projectsApi from '@/api/projects'
import { useChatStore } from '@/stores/chat'

export const useConversationStore = defineStore('conversation', {
  state: () => ({
    projectId: '',
    items: [],
    archivedItems: [],
    currentId: '',
    loading: false,
    error: ''
  }),
  getters: {
    current: (state) =>
      [...state.items, ...state.archivedItems].find((item) => item.id === state.currentId) || null,
    currentArchived() {
      return Boolean(this.current?.archived || this.current?.archived_at)
    }
  },
  actions: {
    hydrate(projectId, conversations = [], { includeArchived = false } = {}) {
      this.projectId = projectId
      const sorted = [...conversations].sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      )
      this.items = sorted.filter((item) => !item.archived && !item.archived_at)
      if (includeArchived) {
        this.archivedItems = sorted.filter((item) => item.archived || item.archived_at)
      } else {
        this.archivedItems = []
      }
      const currentExists = [...this.items, ...this.archivedItems].some(
        (item) => item.id === this.currentId
      )
      if (!currentExists) {
        this.currentId = this.items[0]?.id || ''
      }
      const chat = useChatStore()
      chat.setSessions(this.items)
      chat.currentSessionId = this.currentId
    },
    async load(projectId, { includeArchived = false } = {}) {
      this.loading = true
      this.error = ''
      try {
        const data = await projectsApi.listProjectConversations(projectId, {
          includeArchived
        })
        this.hydrate(projectId, data?.conversations || [], { includeArchived })
        return includeArchived ? [...this.items, ...this.archivedItems] : this.items
      } catch (error) {
        this.error = error.message || 'Conversation 加载失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async create(title = '') {
      if (!this.projectId) throw new Error('请先打开 Project')
      const data = await projectsApi.createProjectConversation(
        this.projectId,
        title ? { title } : {}
      )
      const conversation = data?.conversation || data?.session
      if (conversation) {
        this.upsert(conversation)
        await this.select(conversation.id)
      }
      return conversation || null
    },
    async select(conversationId, { loadMessages = true } = {}) {
      if (![...this.items, ...this.archivedItems].some((item) => item.id === conversationId))
        return false
      this.currentId = conversationId
      const chat = useChatStore()
      // Project Studio 已持有唯一业务连接，这里只恢复消息与 Interaction，绝不
      // 因切换 Dock 面板创建第二条 /ws/chat。
      await chat.selectSession(conversationId, { connect: false, loadMessages })
      return true
    },
    async archive(conversationId) {
      if (!this.projectId || !this.items.some((item) => item.id === conversationId)) {
        return null
      }
      const projectId = this.projectId
      const data = await projectsApi.archiveProjectConversation(projectId, conversationId)
      if (this.projectId !== projectId) return null
      const archived = data?.conversation || null
      this.moveToArchive(conversationId, archived)
      return archived
    },
    moveToArchive(conversationId, archived = null) {
      const current = this.items.find((item) => item.id === conversationId)
      const previousArchived = this.archivedItems.find((item) => item.id === conversationId)
      if (!current && !previousArchived && !archived) return false
      const value = {
        ...previousArchived,
        ...current,
        ...archived,
        id: conversationId,
        project_id: this.projectId,
        archived: true,
        archived_at: archived?.archived_at || current?.archived_at || new Date().toISOString()
      }
      this.items = this.items.filter((item) => item.id !== conversationId)
      const archivedIndex = this.archivedItems.findIndex((item) => item.id === conversationId)
      if (archivedIndex < 0) this.archivedItems.unshift(value)
      else this.archivedItems.splice(archivedIndex, 1, value)
      // 正在查看的会话归档后保持原内容，以只读状态展示；归档其他会话
      // 也不影响当前会话的生成状态或草稿。
      const chat = useChatStore()
      chat.setSessions(this.items)
      chat.currentSessionId = this.currentId
      if (this.currentId === conversationId) {
        chat.streaming = null
        chat.sending = false
      }
      return true
    },
    upsert(conversation) {
      if (!conversation?.id || conversation.project_id !== this.projectId) return
      const index = this.items.findIndex((item) => item.id === conversation.id)
      if (index < 0) this.items.unshift(conversation)
      else this.items.splice(index, 1, { ...this.items[index], ...conversation })
      this.items.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      useChatStore().setSessions(this.items)
    },
    applyEvent(event) {
      if (event.project_id !== this.projectId || event.resource_type !== 'conversation')
        return false
      const incoming = {
        ...(event.payload?.conversation || event.payload),
        id: event.payload?.conversation?.id || event.payload?.id || event.resource_id
      }
      if (!incoming?.id) return false
      const current =
        this.items.find((item) => item.id === incoming.id) ||
        this.archivedItems.find((item) => item.id === incoming.id)
      const revision = Number(event.resource_revision || event.revision || incoming.revision || 0)
      if (revision && revision <= Number(current?.revision || 0)) return false
      if (
        event.type === 'conversation.archived' ||
        incoming.archived === true ||
        Boolean(incoming.archived_at)
      ) {
        return this.moveToArchive(incoming.id, {
          ...current,
          ...incoming,
          project_id: this.projectId,
          revision
        })
      }
      this.upsert({ ...current, ...incoming, project_id: this.projectId, revision })
      return true
    },
    clear() {
      this.projectId = ''
      this.items = []
      this.archivedItems = []
      this.currentId = ''
      this.error = ''
      const chat = useChatStore()
      chat.setSessions([])
      chat.currentSessionId = ''
    }
  }
})
