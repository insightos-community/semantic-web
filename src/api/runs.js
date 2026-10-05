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

export function listProjectRuns(projectId, { conversationId, page = 1, pageSize = 100 } = {}) {
  if (fixtureEnabled()) return studioFixture.listRuns(projectId, { conversationId, page, pageSize })
  return request.get(`/projects/${encodeURIComponent(projectId)}/runs`, {
    params: { conversation_id: conversationId, page, page_size: pageSize }
  })
}

export function getRun(runId) {
  if (fixtureEnabled()) return studioFixture.getRun(runId)
  return request.get(`/runs/${encodeURIComponent(runId)}`)
}

// 已有 Project 持久事件按 Run 精确查询；只读，不重放任何执行命令。
export function getRunEvents(runId, { afterSequence = 0, limit = 100 } = {}) {
  return request.get(`/runs/${encodeURIComponent(runId)}/events`, {
    params: { after_sequence: afterSequence, limit }
  })
}

// 取消必须定位明确 Run，不能再用“当前会话最近一次运行”猜测。
export function cancelRun(runId, payload = {}) {
  if (fixtureEnabled()) return studioFixture.cancelRun(runId, payload)
  return request.post(`/runs/${encodeURIComponent(runId)}/cancel`, payload)
}
