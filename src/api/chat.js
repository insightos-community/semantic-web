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

// 对话域 API（chat store 数据源，17-web-ui-design §8）。
// 后端契约（internal/server/http/handlers/chat.go，以代码为准）：
// - GET  /chat/sessions        → {sessions:[{id,project_id,title,created_at,updated_at}]}（最近活跃倒序）
// - POST /chat/sessions {title?} → 201 {session:{...}}；消息发送走 WS /ws/chat
// - GET  /chat/sessions/{id}/messages?page=&page_size=
//     → {messages:[{id,role(user|assistant),content,created_at}], page, page_size, total}
//     按 id 升序（≈时间序）；page 从 1 开始，page_size 默认 50、上限 200。
//     注意：后端无 before 游标——"加载更早"用页码向页首回退实现
//    （升序分页的页窗对尾部追加稳定，新消息只影响末页页码）。
import request from './request'

const fixtureEnabled = () => import.meta.env.VITE_STUDIO_FIXTURES === 'true'

export function listSessions() {
  return request.get('/chat/sessions')
}

export function createSession(payload = {}) {
  return request.post('/chat/sessions', payload)
}

export function deleteSession(sessionId) {
  return request.delete(`/chat/sessions/${sessionId}`)
}

export function uploadAttachment(file) {
  const data = new FormData()
  data.append('file', file)
  return request.post('/chat/attachments', data)
}

export function getAttachment(id) {
  return request.get(`/chat/attachments/${id}`, { responseType: 'blob' })
}

export function listMessages(sessionId, { page = 1, pageSize = 50 } = {}) {
  if (fixtureEnabled()) {
    return Promise.resolve({ messages: [], page, page_size: pageSize, total: 0 })
  }
  return request.get(`/chat/sessions/${sessionId}/messages`, {
    params: { page, page_size: pageSize }
  })
}

// 读取当前会话的执行模式、宿主开关与 Server 硬开关。
export function getSessionExecution(sessionId) {
  if (fixtureEnabled()) {
    return Promise.resolve({
      execution: {
        session_id: sessionId,
        mode: 'ask',
        host_execution_enabled: false,
        host_execution_allowed: false,
        busy: false
      }
    })
  }
  return request.get(`/chat/sessions/${sessionId}/host-execution`)
}

// mode 与 enabled 必须一次提交，避免 Runner 在两次请求之间读取半更新策略。
export function updateSessionExecution(sessionId, { mode, enabled }) {
  return request.put(`/chat/sessions/${sessionId}/host-execution`, { mode, enabled })
}

// 列出当前用户可管理的 Artifact 元数据，文件本体按需读取。
export function listArtifacts({ page = 1, pageSize = 100 } = {}) {
  if (fixtureEnabled()) {
    return Promise.resolve({ artifacts: [], page, page_size: pageSize, total: 0 })
  }
  return request.get('/chat/artifacts', { params: { page, page_size: pageSize } })
}

// 从 Project workspace 相对路径显式登记稳定 ArtifactRef。
export function registerWorkspaceArtifact(payload) {
  return request.post('/chat/artifacts/register', payload)
}

// 通过 Axios 注入 Bearer Token 读取本体，组件再创建短期 blob URL。
export function getArtifact(id) {
  return request.get(`/chat/artifacts/${id}`, { responseType: 'blob' })
}

export function deleteArtifact(id, { force = false } = {}) {
  return request.delete(`/chat/artifacts/${id}`, { params: { force } })
}
