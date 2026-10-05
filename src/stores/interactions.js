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
import { getProjectInteraction } from '@/api/interactions'
import { sendStudioCommand } from '@/studio/commandGateway'
import { useChatStore } from '@/stores/chat'

function deriveResult(result, status, reply) {
  if (result) return result
  if (reply?.approved === true) return 'approved'
  if (reply?.approved === false) return 'rejected'
  if (status === 'expired' || status === 'cancelled') return status
  return ''
}

function objectValue(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function normalizeInteraction(row = {}) {
  const payload = objectValue(row.payload)
  const embedded = objectValue(payload.interaction)
  const data = objectValue(payload.data)
  const value = { ...row, ...embedded }
  const fields = Array.isArray(data.fields) ? data.fields : []
  const status = value.status || payload.status || 'pending'
  const reply = value.reply ?? payload.reply ?? null
  const kind = value.kind || payload.kind || payload.type || value.type || 'confirm'
  const resourceRevision = Number(
    value.resource_revision ?? value.resourceRevision ?? value.revision ?? 0
  )
  const sourceRevision = Number(
    value.source_revision ??
      value.sourceRevision ??
      value.state_revision ??
      value.stateRevision ??
      0
  )
  return {
    ...value,
    sessionId: value.sessionId || value.conversation_id || value.session_id || '',
    runId: value.runId || value.run_id || '',
    agentName: value.agentName || value.agent || 'leader',
    targetAgentId: value.targetAgentId || value.target_agent_id || '',
    workflowId: value.workflowId || value.workflow_id || payload.workflow_id || '',
    taskId: value.taskId || value.task_id || payload.task_id || '',
    source: value.source || payload.source || 'agent',
    kind,
    uiKind:
      value.uiKind || value.ui_kind || payload.ui_kind || (kind === 'confirm' ? 'confirm' : 'form'),
    resourceRevision,
    sourceRevision,
    stateRevision: sourceRevision,
    question: value.question || value.prompt || payload.question || payload.prompt || '',
    description: value.description || payload.description || data.description || '',
    data,
    action: value.action || payload.action || data.action || '',
    allowOther:
      value.allowOther ?? value.allow_other ?? payload.allow_other ?? data.allow_other ?? true,
    schema: objectValue(value.response_schema || payload.response_schema || value.schema),
    // interaction.ask 的实时协议把选项同时放在 candidates 与 data.fields 中；
    // REST 恢复又可能只有顶层 response_schema。这里统一成渲染器所需的
    // options，避免动态字段名退回旧的 {value: ...} 提交契约。
    options:
      value.options ||
      payload.options ||
      data.options ||
      value.candidates ||
      payload.candidates ||
      fields[0]?.options ||
      [],
    candidates: value.candidates || payload.candidates || data.candidates || [],
    initialValue:
      value.initialValue ??
      value.initial_value ??
      payload.initial_value ??
      data.initial_value ??
      null,
    risk: value.risk || payload.risk || data.risk || '',
    timeoutTs: value.timeoutTs || value.timeout_ts || payload.timeout_ts || 0,
    ts: value.ts || value.created_at || new Date().toISOString(),
    status,
    reply,
    result: deriveResult(value.result || payload.result || '', status, reply)
  }
}

export const useInteractionsStore = defineStore('interactions', {
  state: () => ({
    projectId: '',
    records: {},
    drafts: {},
    collapsedIds: [],
    submittingIds: [],
    submitErrors: {}
  }),
  getters: {
    pending: (state) =>
      Object.values(state.records).filter((record) => record.status === 'pending'),
    isSubmitting: (state) => (id) => state.submittingIds.includes(id),
    isCollapsed: (state) => (id) => state.collapsedIds.includes(id)
  },
  actions: {
    hydrate(projectId, rows = []) {
      this.projectId = projectId
      this.records = {}
      this.drafts = {}
      this.collapsedIds = []
      this.submittingIds = []
      for (const row of rows) {
        const record = normalizeInteraction(row)
        if (record.id) this.records[record.id] = record
      }
      this.syncChatStore()
    },
    async submit(interactionId, response) {
      const record = this.records[interactionId]
      if (!record || record.status !== 'pending' || this.isSubmitting(interactionId)) return false
      this.submittingIds.push(interactionId)
      delete this.submitErrors[interactionId]
      const sent = sendStudioCommand('interaction.reply', {
        interaction_id: interactionId,
        expected_state_revision: record.stateRevision,
        response
      })
      if (!sent) {
        this.submittingIds = this.submittingIds.filter((id) => id !== interactionId)
        await this.reconcile(interactionId)
        this.submitErrors[interactionId] = '连接不可用，已对账当前状态，请重试'
        return false
      }
      return true
    },
    async cancel(interactionId) {
      const record = this.records[interactionId]
      if (!record || record.status !== 'pending' || this.isSubmitting(interactionId)) return false
      this.submittingIds.push(interactionId)
      delete this.submitErrors[interactionId]
      const sent = sendStudioCommand('interaction.cancel', {
        interaction_id: interactionId,
        expected_state_revision: record.stateRevision
      })
      if (!sent) {
        this.submittingIds = this.submittingIds.filter((id) => id !== interactionId)
        await this.reconcile(interactionId)
        this.submitErrors[interactionId] = '连接不可用，已对账当前状态，请重试'
        return false
      }
      return true
    },
    collapse(interactionId) {
      if (!this.collapsedIds.includes(interactionId)) this.collapsedIds.push(interactionId)
    },
    expand(interactionId) {
      this.collapsedIds = this.collapsedIds.filter((id) => id !== interactionId)
    },
    setDraft(interactionId, value) {
      if (!this.records[interactionId] || this.records[interactionId].status !== 'pending') return
      if (value === undefined) {
        delete this.drafts[interactionId]
        return
      }
      this.drafts[interactionId] = JSON.parse(JSON.stringify(value))
    },
    clearDraft(interactionId) {
      delete this.drafts[interactionId]
    },
    async reconcile(interactionId) {
      try {
        const current = normalizeInteraction(
          await getProjectInteraction(this.projectId, interactionId)
        )
        if (current.id) this.records[current.id] = current
        if (current.status !== 'pending') {
          this.submittingIds = this.submittingIds.filter((id) => id !== interactionId)
          this.collapsedIds = this.collapsedIds.filter((id) => id !== interactionId)
          delete this.drafts[interactionId]
        }
        this.syncChatStore()
        return current
      } catch {
        return this.records[interactionId] || null
      }
    },
    failSubmissions(message = 'Interaction 应答失败') {
      for (const id of this.submittingIds) {
        this.submitErrors[id] = message + '；正在对账当前状态'
        this.reconcile(id)
      }
      this.submittingIds = []
    },
    applyEvent(event) {
      if (event.project_id !== this.projectId || event.resource_type !== 'interaction') return false
      const id = event.resource_id || event.payload?.interaction_id
      if (!id) return false
      const current = this.records[id]
      const revision = Number(
        event.resource_revision || event.revision || event.payload?.revision || 0
      )
      if (revision && revision <= Number(current?.resourceRevision || 0)) return false
      const payload = event.payload || {}
      let status = payload.status || payload.interaction?.status || current?.status || 'pending'
      if (event.type === 'interaction.resolved' || event.type === 'interaction.answered') {
        status = payload.status || 'answered'
      }
      const record = normalizeInteraction({
        ...current,
        ...payload,
        ...payload.interaction,
        payload,
        id,
        project_id: this.projectId,
        conversation_id: event.conversation_id || current?.conversation_id,
        run_id: event.run_id || current?.run_id,
        status,
        revision,
        resource_revision: revision,
        created_at: event.occurred_at || current?.created_at
      })
      this.records[id] = record
      if (status !== 'pending') {
        this.submittingIds = this.submittingIds.filter((item) => item !== id)
        this.collapsedIds = this.collapsedIds.filter((item) => item !== id)
        delete this.submitErrors[id]
        delete this.drafts[id]
      }
      this.syncChatStore()
      return true
    },
    syncChatStore() {
      const chat = useChatStore()
      for (const row of Object.values(this.records)) {
        const record = normalizeInteraction(row)
        // Conversation 消息行与 Interaction Center 共享同一份完整协议记录。
        // 过去只同步 confirm 所需的几个字段，导致表单在消息位置退化成审批卡。
        const chatRecord = {
          ...record,
          status: record.status === 'pending' ? 'pending' : 'resolved',
          result: record.result || (record.reply?.approved ? 'approved' : ''),
          repliedAt: 0
        }
        chat.interactionsById[record.id] = chatRecord
        if (
          chatRecord.status === 'pending' &&
          !chat.pendingInteractions.some((item) => item.id === record.id)
        ) {
          chat.pendingInteractions.push(chatRecord)
        }
        if (chatRecord.status !== 'pending') {
          chat.pendingInteractions = chat.pendingInteractions.filter(
            (item) => item.id !== record.id
          )
        }
      }
    },
    clear() {
      this.projectId = ''
      this.records = {}
      this.drafts = {}
      this.collapsedIds = []
      this.submittingIds = []
      this.submitErrors = {}
    }
  }
})
