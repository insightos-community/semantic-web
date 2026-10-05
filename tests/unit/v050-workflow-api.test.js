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

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

vi.mock('@/fixtures/studioFixture', () => ({
  studioFixture: {}
}))

import request from '@/api/request'
import { confirmWorkflowStop, listWorkflows } from '@/api/workflows'

describe('Workflow API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('历史列表显式请求 include_ended=true', async () => {
    request.get.mockResolvedValue({ workflows: [{ id: 'workflow-history' }] })

    const items = await listWorkflows('project-1', true)

    expect(items).toEqual([{ id: 'workflow-history' }])
    expect(request.get).toHaveBeenCalledWith('/projects/project-1/workflows', {
      params: { include_ended: true }
    })
  })

  it('人工终结请求始终携带显式物理确认和原因', async () => {
    request.post.mockResolvedValue({ workflow_view: { workflow: { id: 'workflow-1' } } })

    await confirmWorkflowStop('project-1', 'workflow-1', 7, '现场确认已安全保持')

    expect(request.post).toHaveBeenCalledWith(
      '/projects/project-1/workflows/workflow-1/confirm-stop',
      {
        revision: 7,
        physical_state_confirmed: true,
        reason: '现场确认已安全保持'
      }
    )
  })
})
