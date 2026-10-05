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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import RobotExecutionsPanel from '@/components/studio/panels/RobotExecutionsPanel.vue'
import { useRobotStore } from '@/stores/robot'
import ElementPlus, { ElMessageBox } from 'element-plus'
import StudioContextInspector from '@/components/studio/StudioContextInspector.vue'
import { useWorkflowStore } from '@/stores/workflow'
import { useLayoutStore } from '@/stores/layout'

vi.mock('@/components/studio/StudioExecutionTimeline.vue', () => ({
  default: {
    props: ['execution'],
    render() {
      return h('div', { class: 'test-timeline' }, this.execution?.id || 'empty')
    }
  }
}))

let app
let host
beforeEach(() => {
  setActivePinia(createPinia())
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
})

describe('固定历史页面', () => {
  it('Inspector 的现场确认按钮弹出确认并终结所选 Workflow，不误操作当前流程', async () => {
    const workflow = useWorkflowStore()
    workflow.hydrate('p1', {
      workflow_view: { workflow: { id: 'wf-current', project_id: 'p1', status: 'running' } }
    })
    workflow.cacheView({
      workflow: {
        id: 'wf-unknown',
        project_id: 'p1',
        status: 'paused',
        reason: 'execution_state_unknown'
      },
      tasks: [
        {
          id: 'task-unknown',
          workflow_id: 'wf-unknown',
          status: 'paused',
          waiting_reason: 'execution_state_unknown',
          assigned_robot_id: 'robot-1'
        }
      ],
      subtasks: [
        {
          id: 'sub-unknown',
          task_id: 'task-unknown',
          status: 'paused',
          execution_ref: 'rex-unknown'
        }
      ]
    })
    useLayoutStore().select({ resourceType: 'task', resourceId: 'task-unknown' })
    const prompt = vi
      .spyOn(ElMessageBox, 'prompt')
      .mockResolvedValue({ value: ' 已在现场确认保持 ' })
    const confirm = vi.spyOn(workflow, 'confirmStop').mockResolvedValue(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StudioContextInspector, { embedded: true })
    app.use(ElementPlus)
    app.mount(host)
    await nextTick()
    const button = [...host.querySelectorAll('button')].find((node) =>
      node.textContent.includes('确认现场安全并终结')
    )
    expect(button).toBeDefined()
    button.click()
    await nextTick()
    await nextTick()
    expect(prompt).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledWith('wf-unknown', '已在现场确认保持')
    expect(workflow.workflow.id).toBe('wf-current')
  })

  it('历史详情显示自己的 Task 和 Workflow，停止不会误操作当前 Workflow', async () => {
    const workflow = useWorkflowStore()
    const history = {
      workflow: { id: 'wf-old', project_id: 'p1', status: 'stopped', goal: '旧工作流' },
      tasks: [{ id: 'task-old', workflow_id: 'wf-old', goal: '旧任务', status: 'stopped' }]
    }
    workflow.hydrate('p1', {
      workflow_view: {
        workflow: { id: 'wf-current', project_id: 'p1', status: 'running', goal: '当前工作流' },
        tasks: [
          { id: 'task-current', workflow_id: 'wf-current', goal: '当前任务', status: 'running' }
        ]
      }
    })
    workflow.cacheView(history)
    useLayoutStore().select({ resourceType: 'task', resourceId: 'task-old' })
    const transition = vi.spyOn(workflow, 'transitionById').mockResolvedValue(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StudioContextInspector, { embedded: true })
    app.use(ElementPlus)
    app.mount(host)
    await nextTick()
    expect(host.textContent).toContain('旧工作流')
    expect(host.textContent).toContain('旧任务')
    expect(host.textContent).not.toContain('当前工作流')
    const stop = () =>
      [...host.querySelectorAll('button')].find((node) => node.textContent.trim() === '停止')
    expect(stop()).toBeUndefined()
    workflow.cacheView({
      ...history,
      workflow: { ...history.workflow, status: 'paused', reason: 'user_paused' }
    })
    await nextTick()
    stop().click()
    await nextTick()
    expect(transition).toHaveBeenCalledWith('wf-old', 'stop')
    expect(workflow.workflow.id).toBe('wf-current')
  })

  it('两个 Execution 页面分别绑定自己的 ID，不跟随全局选择', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [
      { id: 'rex-old', project_id: 'p1', status: 'completed' },
      { id: 'rex-new', project_id: 'p1', status: 'running' }
    ])
    vi.spyOn(robots, 'select').mockImplementation(async (id) => {
      robots.selectedExecutionId = id
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({
      render() {
        return h('div', [
          h(RobotExecutionsPanel, { panelParams: { resourceId: 'rex-old' } }),
          h(RobotExecutionsPanel, { panelParams: { resourceId: 'rex-new' } }),
          h(RobotExecutionsPanel, { panelParams: { resourceId: 'rex-missing' } })
        ])
      }
    })
    app.mount(host)
    await nextTick()
    expect(robots.selectedExecutionId).toBe('rex-new')
    expect([...host.querySelectorAll('.test-timeline')].map((el) => el.textContent)).toEqual([
      'rex-old',
      'rex-new',
      'empty'
    ])
  })
})
