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

// 结构化交互记录 API（chat store 审批卡刷新恢复数据源，R19）。
// 后端契约（internal/server/http/handlers/interactions.go，以代码为准）：
// - GET /interactions?session_id=&status=&page=&page_size=
//     → {interactions:[{id, session_id, agent, type, status, payload, reply,
//       run_id, created_at, answered_at, expired_at}], page, page_size, total}
//     按创建时间倒序；status 取值 pending/answered/expired/cancelled（非法 400）；
//     payload 为 JSON 对象（interaction_id/type/question/risk/timeout_ts，
//     结构以 internal/interaction/service.go RequestPayload 为准）；
//     page_size 默认 50、上限 100。
import request from './request'

export function listInteractions({ sessionId, status, page = 1, pageSize = 100 } = {}) {
  if (import.meta.env.VITE_STUDIO_FIXTURES === 'true') {
    return Promise.resolve({ interactions: [], page, page_size: pageSize, total: 0 })
  }
  return request.get('/interactions', {
    params: { session_id: sessionId, status, page, page_size: pageSize }
  })
}

export async function getProjectInteraction(projectId, interactionId) {
  if (import.meta.env.VITE_STUDIO_FIXTURES === 'true') {
    const { studioFixture } = await import('@/fixtures/studioFixture')
    return studioFixture.getInteraction(projectId, interactionId)
  }
  const project = encodeURIComponent(projectId)
  const interaction = encodeURIComponent(interactionId)
  const response = await request.get('/projects/' + project + '/interactions/' + interaction)
  return response?.interaction || response
}
