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
import { diffSceneDocuments } from '@/domain/simulation'

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)))

function createSession(document, originPanel = '') {
  const saved = clone(document)
  return {
    document_id: document.id,
    document: clone(document),
    saved_document: saved,
    saved_revision: Number(document.revision || 0),
    selection: '',
    history: [clone(document)],
    history_index: 0,
    dirty: false,
    validation: null,
    build_status: 'idle',
    origin_panel: originPanel
  }
}

/**
 * Scene Editor 的领域会话按 document_id 保存，不绑定某个 Vue 组件实例。
 *
 * Dock 面板移动、Inspector 选择、运行其他 Layout 或恢复工作区时，编辑器组件可能
 * 重新挂载；会话 Store 保留草稿、选择与历史，避免把 Server 旧文档覆盖到未保存内容。
 */
export const useSceneEditorSessionStore = defineStore('sceneEditorSessions', {
  state: () => ({ sessions: {} }),
  getters: {
    sessionFor: (state) => (documentId) => state.sessions[documentId] || null,
    isDirty: (state) => (documentId) => Boolean(state.sessions[documentId]?.dirty)
  },
  actions: {
    open(document, originPanel = '') {
      if (!document?.id) return null
      let session = this.sessions[document.id]
      if (!session) {
        session = createSession(document, originPanel)
        this.sessions[document.id] = session
        return session
      }
      if (originPanel) session.origin_panel = originPanel
      const incomingRevision = Number(document.revision || 0)
      if (!session.dirty && incomingRevision >= session.saved_revision) {
        this.markSaved(document.id, document)
      }
      return session
    },
    update(documentId, document) {
      const session = this.sessions[documentId]
      if (!session || !document) return null
      const next = clone(document)
      session.document = next
      session.dirty = diffSceneDocuments(session.saved_document, next).length > 0
      const previous = session.history[session.history_index]
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        session.history = session.history.slice(0, session.history_index + 1)
        session.history.push(clone(next))
        if (session.history.length > 100) session.history.shift()
        session.history_index = session.history.length - 1
      }
      return session
    },
    markSaved(documentId, document) {
      const session = this.sessions[documentId]
      if (!session || !document) return null
      session.document = clone(document)
      session.saved_document = clone(document)
      session.saved_revision = Number(document.revision || 0)
      session.dirty = false
      session.history = [clone(document)]
      session.history_index = 0
      return session
    },
    discard(documentId) {
      const session = this.sessions[documentId]
      if (!session) return null
      session.document = clone(session.saved_document)
      session.dirty = false
      session.history = [clone(session.document)]
      session.history_index = 0
      return session
    },
    select(documentId, nodeId) {
      const session = this.sessions[documentId]
      if (session) session.selection = nodeId || ''
    },
    setValidation(documentId, validation) {
      const session = this.sessions[documentId]
      if (session) session.validation = clone(validation)
    },
    setBuildStatus(documentId, status) {
      const session = this.sessions[documentId]
      if (session) session.build_status = status || 'idle'
    },
    close(documentId) {
      delete this.sessions[documentId]
    },
    clear() {
      this.sessions = {}
    }
  }
})
