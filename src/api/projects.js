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

import request from './request'
import { studioFixture } from '@/fixtures/studioFixture'

const fixtureEnabled = () => import.meta.env.VITE_STUDIO_FIXTURES === 'true'

export function listProjects({ includeArchived = false } = {}) {
  if (fixtureEnabled()) return studioFixture.listProjects({ includeArchived })
  return request.get('/projects', { params: { include_archived: includeArchived } })
}

export function createProject(payload) {
  if (fixtureEnabled()) return studioFixture.createProject(payload)
  return request.post('/projects', payload)
}

export function getProject(projectId) {
  if (fixtureEnabled()) return studioFixture.getProject(projectId)
  return request.get(`/projects/${encodeURIComponent(projectId)}`)
}

export function updateProject(projectId, payload) {
  if (fixtureEnabled()) return studioFixture.updateProject(projectId, payload)
  return request.patch(`/projects/${encodeURIComponent(projectId)}`, payload)
}

// DELETE 的产品语义是归档，Server 不物理删除 Project。
export function archiveProject(projectId, revision) {
  if (fixtureEnabled()) return studioFixture.archiveProject(projectId, revision)
  return request.delete(`/projects/${encodeURIComponent(projectId)}`, {
    data: { revision }
  })
}

export function activateProject(projectId, revision) {
  if (fixtureEnabled()) return studioFixture.activateProject(projectId, revision)
  return request.post(`/projects/${encodeURIComponent(projectId)}/activate`, { revision })
}

export function getProjectMemory(projectId) {
  if (fixtureEnabled()) return studioFixture.getMemory(projectId)
  return request.get(`/projects/${encodeURIComponent(projectId)}/memory`)
}

export function saveProjectMemory(projectId, { content, revision }) {
  if (fixtureEnabled()) return studioFixture.saveMemory(projectId, { content, revision })
  return request.put(`/projects/${encodeURIComponent(projectId)}/memory`, { content, revision })
}

export function getProjectBindings(projectId) {
  if (fixtureEnabled()) return Promise.resolve({ bindings: { agent_ids: [], skill_names: [] } })
  return request.get(`/projects/${encodeURIComponent(projectId)}/bindings`)
}

export function replaceProjectBindings(projectId, { agentIds = [], skillNames = [] }) {
  if (fixtureEnabled()) {
    return Promise.resolve({ bindings: { agent_ids: agentIds, skill_names: skillNames } })
  }
  return request.put(`/projects/${encodeURIComponent(projectId)}/bindings`, {
    agent_ids: agentIds,
    skill_names: skillNames
  })
}

export function listProjectConversations(projectId, { includeArchived = false } = {}) {
  if (fixtureEnabled()) {
    return studioFixture.listConversations(projectId, { includeArchived })
  }
  return request.get(`/projects/${encodeURIComponent(projectId)}/conversations`, {
    params: { include_archived: includeArchived }
  })
}

export function createProjectConversation(projectId, payload = {}) {
  if (fixtureEnabled()) return studioFixture.createConversation(projectId, payload)
  return request.post(`/projects/${encodeURIComponent(projectId)}/conversations`, payload)
}

export function archiveProjectConversation(projectId, conversationId) {
  if (fixtureEnabled()) {
    return studioFixture.archiveConversation(projectId, conversationId)
  }
  return request.delete(
    `/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`
  )
}

export async function getStudioSnapshot(projectId) {
  const response = fixtureEnabled()
    ? await studioFixture.getSnapshot(projectId)
    : await request.get(`/projects/${encodeURIComponent(projectId)}/studio/snapshot`)
  // Framework 使用 { snapshot: {...} } 包装响应。适配器在 API 边界统一
  // 解包，避免页面和各 Store 同时兼容两种形态。
  return response?.snapshot || response
}
