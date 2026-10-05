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

export const PROJECT_MODE = Object.freeze({
  DEVELOPMENT: 'development',
  RUNNING: 'running'
})

const normalizeProject = (project) =>
  project
    ? {
        ...project,
        archived: project.archived === true || Boolean(project.archived_at)
      }
    : null

export const useProjectStore = defineStore('project', {
  state: () => ({
    items: [],
    currentProjectId: '',
    loading: false,
    snapshotStatus: 'idle',
    connectionStatus: 'offline',
    stale: false,
    lastSnapshotAt: '',
    lastEventSequence: 0,
    lastEventId: '',
    error: ''
  }),
  getters: {
    currentProject: (state) =>
      state.items.find((project) => project.id === state.currentProjectId) || null,
    activeProject: (state) =>
      state.items.find((project) => project.is_active && !project.archived) || null,
    isFixture: () => import.meta.env.VITE_STUDIO_FIXTURES === 'true'
  },
  actions: {
    async load({ includeArchived = false } = {}) {
      this.loading = true
      this.error = ''
      try {
        const data = await projectsApi.listProjects({ includeArchived })
        this.items = Array.isArray(data?.projects) ? data.projects.map(normalizeProject) : []
        return this.items
      } catch (error) {
        this.error = error.message || 'Project 加载失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async create(name, runtimePreference = {}) {
      const data = await projectsApi.createProject({
        name: String(name || '').trim(),
        runtime_profile_id: String(runtimePreference.runtimeProfileId || '').trim(),
        preferred_runtime_installation_id: String(
          runtimePreference.preferredInstallationId || ''
        ).trim()
      })
      const project = normalizeProject(data?.project)
      if (project) this.upsert(project)
      return project || null
    },
    async rename(projectId, name) {
      const project = this.items.find((item) => item.id === projectId)
      const data = await projectsApi.updateProject(projectId, {
        name: String(name || '').trim(),
        revision: project?.revision
      })
      const updated = normalizeProject(data?.project)
      if (updated) this.upsert(updated)
      return updated
    },
    async archive(projectId, { includeArchived = false } = {}) {
      const project = this.items.find((item) => item.id === projectId)
      const data = await projectsApi.archiveProject(projectId, project?.revision)
      const archived = normalizeProject(data?.project)
      if (archived) this.upsert(archived)
      else this.items = this.items.filter((item) => item.id !== projectId)
      // 归档活动 Project 时，Server 会选择新的活动 Project。重新拉取列表，
      // 确保 Hub 不保留 archived_at 项，也不继续显示旧的 is_active 状态。
      await this.load({ includeArchived })
      return archived
    },
    async activate(projectId) {
      const project = this.items.find((item) => item.id === projectId)
      const data = await projectsApi.activateProject(projectId, project?.revision)
      const activated = normalizeProject(data?.project)
      if (activated) {
        this.items = this.items.map((item) => ({
          ...item,
          is_active: item.id === projectId,
          ...(item.id === projectId ? activated : {})
        }))
      }
      return activated
    },
    beginSnapshot(projectId) {
      this.currentProjectId = projectId
      this.snapshotStatus = 'loading'
      this.error = ''
    },
    hydrateSnapshot(snapshot) {
      if (!snapshot?.project?.id) throw new Error('Studio Snapshot 缺少 Project')
      this.currentProjectId = snapshot.project.id
      this.upsert(snapshot.project)
      this.lastEventSequence = Number(snapshot.event_sequence || 0)
      this.lastEventId = ''
      this.lastSnapshotAt = new Date().toISOString()
      this.snapshotStatus = 'ready'
      this.stale = false
    },
    failSnapshot(error) {
      this.snapshotStatus = 'error'
      this.error = error?.message || 'Studio 状态恢复失败'
    },
    setConnectionStatus(status) {
      this.connectionStatus = status
      this.stale = status !== 'online' && this.snapshotStatus === 'ready'
    },
    advanceEventCursor(sequence, eventId = '') {
      const next = Number(sequence || 0)
      if (next > this.lastEventSequence) this.lastEventSequence = next
      if (eventId) this.lastEventId = eventId
    },
    upsert(project) {
      const next = normalizeProject(project)
      if (!next?.id) return
      const index = this.items.findIndex((item) => item.id === next.id)
      if (index < 0) this.items.push(next)
      else this.items.splice(index, 1, { ...this.items[index], ...next })
    },
    applyEvent(event) {
      if (event.project_id !== this.currentProjectId) return false
      const current = this.currentProject
      const revision = Number(
        event.resource_revision || event.revision || event.payload?.revision || 0
      )
      if (revision && revision <= Number(current?.revision || 0)) return false
      if (event.payload?.project) this.upsert(event.payload.project)
      else if (current && event.resource_type === 'project') {
        this.upsert({ ...current, ...event.payload, revision: revision || current.revision })
      }
      return true
    },
    clearCurrent() {
      this.currentProjectId = ''
      this.snapshotStatus = 'idle'
      this.connectionStatus = 'offline'
      this.stale = false
      this.lastSnapshotAt = ''
      this.lastEventSequence = 0
      this.lastEventId = ''
      this.error = ''
    }
  }
})
