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
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/workflows', () => ({
  getWorkflowView: vi.fn()
}))
import * as workflowsApi from '@/api/workflows'
import { inspectWorkflowTask } from '@/studio/inspectWorkflow'
import { useLayoutStore } from '@/stores/layout'
import { useWorkflowStore } from '@/stores/workflow'

describe('inspectWorkflowTask', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('缓存终态 Workflow 并打开 Inspector，不将历史记录设为当前工作', async () => {
    workflowsApi.getWorkflowView.mockResolvedValue({
      workflow: {
        id: 'wf-done',
        project_id: 'project-1',
        conversation_id: 'conv-1',
        status: 'completed',
        revision: 3
      },
      tasks: [{ id: 'task-9', title: '抓取', status: 'completed' }],
      subtasks: [{ id: 'sub-1', task_id: 'task-9', position: 1, status: 'completed' }],
      dependencies: []
    })
    const workflow = useWorkflowStore()
    const layout = useLayoutStore()
    workflow.projectId = 'project-1'

    await inspectWorkflowTask({
      workflowId: 'wf-done',
      taskId: 'task-9',
      title: '抓取完成'
    })

    expect(workflow.workflow).toBeNull()
    expect(workflow.views['wf-done'].tasks[0].id).toBe('task-9')
    expect(workflow.views['wf-done'].tasks[0].subtasks).toHaveLength(1)
    expect(layout.selectedResource).toMatchObject({
      resourceType: 'task',
      resourceId: 'task-9'
    })
    expect(layout.shell.secondaryVisible).toBe(true)
    expect(layout.shell.secondaryTab).toBe('inspector')
  })

  it('查看历史 Task 不替换正在执行的 Workflow', async () => {
    const workflow = useWorkflowStore()
    workflow.projectId = 'project-1'
    workflow.applyView({
      workflow: { id: 'active', project_id: 'project-1', status: 'running' },
      tasks: [],
      subtasks: []
    })
    workflowsApi.getWorkflowView.mockResolvedValue({
      workflow: { id: 'old', project_id: 'project-1', status: 'completed' },
      tasks: [{ id: 'old-task' }],
      subtasks: []
    })
    await inspectWorkflowTask({ workflowId: 'old', taskId: 'old-task' })
    expect(workflow.workflow.id).toBe('active')
    expect(workflow.views.old.tasks[0].id).toBe('old-task')
    expect(useLayoutStore().selectedResource.resourceId).toBe('old-task')
  })
})
