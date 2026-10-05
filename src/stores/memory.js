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

export const useMemoryStore = defineStore('projectMemory', {
  state: () => ({
    projectId: '',
    content: '',
    revision: 0,
    updatedAt: '',
    loading: false,
    saving: false,
    dirty: false,
    error: ''
  }),
  actions: {
    hydrateMeta(projectId, memory = {}) {
      this.projectId = projectId
      this.revision = Number(memory.revision || 0)
      this.updatedAt = memory.updated_at || ''
    },
    async load(projectId = this.projectId) {
      if (!projectId) return null
      this.loading = true
      this.error = ''
      try {
        const data = await projectsApi.getProjectMemory(projectId)
        const memory = data?.project_memory || data?.memory || {}
        this.projectId = projectId
        this.content = memory.content || ''
        this.revision = Number(memory.revision || 0)
        this.updatedAt = memory.updated_at || ''
        this.dirty = false
        return memory
      } catch (error) {
        this.error = error.message || 'Project Memory 加载失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    edit(content) {
      this.content = String(content ?? '')
      this.dirty = true
    },
    async save() {
      if (!this.projectId || this.saving || !this.dirty) return null
      this.saving = true
      this.error = ''
      try {
        const data = await projectsApi.saveProjectMemory(this.projectId, {
          content: this.content,
          revision: this.revision
        })
        const memory = data?.project_memory || data?.memory || {}
        this.content = memory.content ?? this.content
        this.revision = Number(memory.revision ?? this.revision)
        this.updatedAt = memory.updated_at || this.updatedAt
        this.dirty = false
        return memory
      } catch (error) {
        this.error = error.message || 'Project Memory 保存失败'
        throw error
      } finally {
        this.saving = false
      }
    },
    clear() {
      this.projectId = ''
      this.content = ''
      this.revision = 0
      this.updatedAt = ''
      this.dirty = false
      this.error = ''
    }
  }
})
