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
import * as runsApi from '@/api/runs'

export const RUN_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING_INPUT: 'waiting_input',
  CANCELLING: 'cancelling',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
})

export const ACTIVE_RUN_STATUSES = new Set([
  RUN_STATUS.QUEUED,
  RUN_STATUS.RUNNING,
  RUN_STATUS.WAITING_INPUT,
  RUN_STATUS.CANCELLING
])

export const useRunsStore = defineStore('runs', {
  state: () => ({ projectId: '', items: [], loading: false, cancellingId: '', error: '' }),
  getters: {
    activeForConversation: (state) => (conversationId) =>
      state.items.find(
        (run) =>
          run.conversation_id === conversationId &&
          (!run.kind || run.kind === 'conversation') &&
          ACTIVE_RUN_STATUSES.has(run.status)
      ) || null,
    activeForTask: (state) => (taskId) =>
      state.items.find((run) => run.task_id === taskId && ACTIVE_RUN_STATUSES.has(run.status)) ||
      null,
    byId: (state) => (runId) => state.items.find((run) => run.id === runId) || null
  },
  actions: {
    hydrate(projectId, runs = []) {
      this.projectId = projectId
      this.items = [...runs].sort(
        (a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)
      )
    },
    async load(projectId = this.projectId, conversationId = '') {
      this.loading = true
      try {
        const data = await runsApi.listProjectRuns(projectId, { conversationId })
        this.hydrate(projectId, data?.runs || [])
        return this.items
      } finally {
        this.loading = false
      }
    },
    async cancel(runId, reason = '用户从 Studio 停止') {
      if (!runId || this.cancellingId) return false
      this.cancellingId = runId
      try {
        const data = await runsApi.cancelRun(runId, { reason })
        if (data?.run) this.upsert(data.run)
        return true
      } finally {
        if (this.cancellingId === runId) this.cancellingId = ''
      }
    },
    upsert(run) {
      if (!run?.id) return false
      const index = this.items.findIndex((item) => item.id === run.id)
      const current = index >= 0 ? this.items[index] : null
      if (Number(run.revision || 0) && Number(run.revision) <= Number(current?.revision || 0)) {
        return false
      }
      const next = { ...current, ...run }
      if (index < 0) this.items.unshift(next)
      else this.items.splice(index, 1, next)
      return true
    },
    applyEvent(event) {
      if (event.project_id !== this.projectId || event.resource_type !== 'agent_run') return false
      const current = this.byId(event.resource_id)
      const revision = Number(
        event.resource_revision || event.revision || event.payload?.revision || 0
      )
      if (revision && revision <= Number(current?.revision || 0)) return false
      const status =
        event.payload?.run?.status || event.payload?.status || event.type?.replace(/^run\./u, '')
      return this.upsert({
        ...current,
        ...event.payload?.run,
        id: event.resource_id,
        project_id: this.projectId,
        conversation_id: event.conversation_id || current?.conversation_id,
        trace_id: event.trace_id || current?.trace_id,
        status,
        revision
      })
    },
    clear() {
      this.projectId = ''
      this.items = []
      this.error = ''
    }
  }
})
