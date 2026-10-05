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

import { expect, test } from '@playwright/test'
import { installStudioSimulationFixture } from './helpers/studioSimulation'

test.beforeEach(async ({ page }) => {
  await installStudioSimulationFixture(page)
  await page.addInitScript(() => {
    localStorage.setItem(
      'session',
      JSON.stringify({
        token: 'fixture-token',
        user: { id: 'fixture-user', name: 'Fixture User' },
        currentTeam: null
      })
    )
  })
  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
})

test('点击物品自动显示 Inspector，再次点击同一物品也能从对话打开详情', async ({ page }) => {
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await expect(page.getByTestId('studio-conversation-sidebar')).toBeVisible()
  await expect(page.getByRole('button', { name: '执行历史', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '场景', exact: true }).click()
  await expect(page.locator('.studio-tab')).toHaveCount(1)
  await page.locator('.scene-toolbar').getByRole('button', { name: '地图', exact: true }).click()
  await page.locator('.map-tree').getByText('托盘 A', { exact: true }).click()
  await expect(page.getByTestId('studio-conversation-sidebar')).not.toBeVisible()
  await expect(page.getByTestId('studio-bottom-panel')).toHaveCount(0)
  await expect(page.getByTestId('studio-context-inspector')).toBeVisible()
  const inspector = page.getByTestId('studio-context-inspector')
  expect(await inspector.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.screenshot({
    path: '.output/studio-e2e/inspector-map.png',
    fullPage: true,
    animations: 'disabled'
  })
  await page
    .getByTestId('studio-tools-sidebar')
    .getByRole('tab', { name: '对话', exact: true })
    .click()
  await expect(page.getByTestId('studio-conversation-sidebar')).toBeVisible()
  await page.locator('.map-tree').getByText('托盘 A', { exact: true }).click()
  await expect(inspector).toBeVisible()
  await page.getByLabel('切换右侧工具区').click()
  await expect(inspector).not.toBeVisible()
  await page.locator('.map-tree').getByText('托盘 A', { exact: true }).click()
  await expect(inspector).toBeVisible()
  await page
    .getByTestId('studio-tools-sidebar')
    .getByRole('tab', { name: '对话', exact: true })
    .click()
  await page.screenshot({ path: '.output/studio-e2e/workbench-overview.png', fullPage: true })
})

test('相同实例状态更新不重载 Viewer，generation 改变才加载新现场', async ({ page }) => {
  let loads = 0
  await page.route('**/viewer-scene', (route) => {
    loads += 1
    return route.fulfill({
      json: {
        viewer_scene: {
          generation: loads === 1 ? 1 : 2,
          scene_revision: 'test',
          content_url: '/fixture-viewer.gltf',
          dynamic_node_order: [],
          cameras: [],
          pose_stream_url: 'ws://127.0.0.1/fixture-pose'
        }
      }
    })
  })
  await page.route('**/fixture-viewer.gltf*', (route) =>
    route.fulfill({
      json: {
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [] }],
        nodes: []
      }
    })
  )
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    const simulation = useSimulationStore()
    simulation.$patch({
      instance: { instance_id: 'viewer-stable', generation: 1, state: 'running' },
      sceneSnapshot: { instance_id: 'viewer-stable', generation: 1 },
      runtime: { state: 'ready' }
    })
  })
  await page.locator('.scene-toolbar').getByRole('button', { name: '现场', exact: true }).click()
  await expect.poll(() => loads).toBe(1)
  await expect(page.locator('.viewer-stats')).toBeVisible()
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    const { nextTick } = await import('/node_modules/.vite/deps/vue.js')
    const simulation = useSimulationStore()
    for (let index = 0; index < 30; index++) {
      simulation.instance = {
        ...simulation.instance,
        sim_time: index,
        state: index % 2 ? 'running' : 'paused'
      }
      await nextTick()
    }
  })
  expect(loads).toBe(1)
  // Stage evidence and Inspector resize the dock without changing the scene.
  // A resize must repaint the cleared drawing buffer in the same callback.
  const canvas = page.locator('.physics-canvas')
  const before = await canvas.elementHandle()
  await page.setViewportSize({ width: 1280, height: 850 })
  await expect.poll(() => canvas.evaluate((node) => node.width > 0 && node.height > 0)).toBe(true)
  expect(await canvas.evaluate((node, old) => node === old, before)).toBe(true)
  expect(loads).toBe(1)
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    useSimulationStore().$patch({
      instance: { instance_id: 'viewer-stable', generation: 2, state: 'running' },
      sceneSnapshot: { instance_id: 'viewer-stable', generation: 2 }
    })
  })
  await expect.poll(() => loads).toBe(2)
})

test('项目技能管理展示可绑定列表，并可原位打开技能正文', async ({ page }) => {
  await expect(page.getByText('项目资源', { exact: true })).toHaveCount(0)
  await page.route('**/api/v1/skills', (route) =>
    route.fulfill({
      json: { skills: [{ name: 'fixture-agent-skill', description: '搬运任务分解' }] }
    })
  )
  await page.route('**/api/v1/skills/fixture-agent-skill', (route) =>
    route.fulfill({
      json: {
        skill: {
          name: 'fixture-agent-skill',
          description: '搬运任务分解',
          body: '# 测试技能\n先核对目标再生成计划。'
        }
      }
    })
  )
  await page.route('**/api/v1/projects/proj-v020-demo/bindings', (route) =>
    route.fulfill({ json: { bindings: { agent_ids: [], skill_names: ['fixture-agent-skill'] } } })
  )
  await page.reload()
  const section = page.getByTestId('project-agent-skills')
  await section.getByRole('button', { name: '管理', exact: true }).click()
  await expect(section.getByRole('checkbox')).toHaveCount(1)
  await section.getByRole('button', { name: 'fixture-agent-skill', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('先核对目标再生成计划')
  await page.screenshot({ path: '.output/studio-e2e/project-skill-detail-20260908.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('计划批准范围格式化并限制在文档宽度内', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.evaluate(async () => {
    const { studioFixture } = await import('/src/fixtures/studioFixture.js')
    const { openStudioPanel } = await import('/src/studio/panelService.js')
    const scope = {
      robot_ids: ['robot-fixture'],
      allowed_skills: ['semantic-navigation', 'grasp-object', 'place-object'],
      objects: Array.from({ length: 12 }, (_, i) => `tote-large-layer-3-row-1-column-${i}`)
    }
    studioFixture.getPlanProposal = async () => ({
      plan_proposal: {
        id: 'plan-long-scope',
        revision: 1,
        goal: '搬运来源托盘的顶层箱体',
        status: 'ready',
        approved_scope: scope,
        structured_plan: { tasks: [] },
        document_markdown:
          '# 搬运计划\n\n## 批准范围\n\n```json\n' + JSON.stringify(scope) + '\n```'
      }
    })
    openStudioPanel('plan-document', { resourceId: 'plan-long-scope' })
  })
  const plan = page.locator('.plan-document')
  await expect(plan.locator('pre')).toContainText('column-11')
  expect(await plan.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  expect(await plan.locator('pre').innerText()).toContain('\n  "robot_ids"')
  await page.screenshot({ path: '.output/studio-e2e/plan-scope-20260908.png' })
})

test('单个场景 Tab 置顶后仍可见，刷新和取消置顶保留页面', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tab = page.locator('.studio-tab').filter({ hasText: '场景' })
  await expect(page.locator('.studio-tab')).toHaveCount(1)
  await tab.click({ button: 'right' })
  await page.getByText('置顶', { exact: true }).click()
  await expect(tab.getByTitle('已置顶')).toBeVisible()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await page.reload()
  await expect(tab.getByTitle('已置顶')).toBeVisible()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await tab.click({ button: 'right' })
  await page.getByText('取消置顶', { exact: true }).click()
  await expect(tab.getByTitle('已置顶')).toHaveCount(0)
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  expect(errors).toEqual([])
})

test('预览替换、双击保留、置顶和刷新恢复', async ({ page }) => {
  const sidebar = page.getByTestId('studio-primary-sidebar')
  await page.locator('.activity-bar').getByTitle('Agents', { exact: true }).click()
  const resource = (name) =>
    sidebar.locator('.nav-row').filter({ has: page.getByText(name, { exact: true }) })
  const tab = (name) => page.locator('.studio-tab').filter({ hasText: name.replace(/s$/, '') })
  await resource('Agents').click()
  await expect(tab('Agents')).toHaveClass(/is-preview/)
  await resource('Skills').click()
  await expect(tab('Agents')).toHaveCount(0)
  await expect(page.locator('.studio-tab')).toHaveCount(2)
  await tab('Skills').dblclick()
  await expect(tab('Skills')).not.toHaveClass(/is-preview/)
  await resource('Tools').click()
  await expect(page.locator('.studio-tab')).toHaveCount(3)
  await page.reload()
  await expect(tab('Skills')).toBeVisible()
  await expect(tab('Tools')).toHaveCount(0)
  await tab('Skills').click({ button: 'right' })
  await page.getByText('置顶', { exact: true }).click()
  await expect(tab('Skills').getByTitle('已置顶')).toBeVisible()
  if (!(await sidebar.isVisible()))
    await page.locator('.activity-bar').getByTitle('Agents', { exact: true }).click()
  await resource('Tools').click()
  await tab('Skills').click({ button: 'right' })
  await page.getByText('关闭未置顶页面', { exact: true }).click()
  await expect(page.locator('.studio-tab')).toHaveCount(2)
  await expect(page.locator('.studio-tab').filter({ hasText: '场景' })).toBeVisible()
  await page.reload()
  await expect(tab('Skills').getByTitle('已置顶')).toBeVisible()
})

test('场景固定保留，关闭按钮、中键、快捷键与批量关闭均不移除现场', async ({ page }) => {
  const scene = page.locator('.studio-tab').filter({ hasText: '场景' })
  await expect(scene.getByRole('button', { name: '关闭标签' })).toHaveCount(0)
  await scene.click({ button: 'middle' })
  await expect(scene).toBeVisible()
  await scene.click()
  await page.keyboard.press('Control+F4')
  await expect(scene).toBeVisible()
  await scene.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '关闭当前', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k')
  await page.keyboard.press('Control+w')
  await expect(scene).toBeVisible()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
})

test('失效历史现场回到配置，地图仍可查看，布局控件已收敛', async ({ page }) => {
  const scene = page.getByTestId('scene-workspace')
  await expect(scene.locator('.scene-details-panel')).toBeVisible()
  await expect(scene.getByRole('button', { name: '现场', exact: true })).toBeDisabled()
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    const store = useSimulationStore()
    store.instance = { instance_id: 'old', state: 'running', generation: 2 }
    store.sceneSnapshot = { instance_id: 'old', generation: 2 }
    store.recovery = { derived_state: 'interrupted', message: '运行环境已断开' }
  })
  await expect(scene.locator('.scene-details-panel')).toBeVisible()
  await expect(scene).toContainText('运行环境已断开')
  await expect(scene.locator('.viewer-toolbar')).toHaveCount(0)
  await scene.getByRole('button', { name: '地图', exact: true }).click()
  await expect(scene.locator('.map-panel')).toBeVisible()
  await expect(page.locator('.studio-topbar .preset-control')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '浮动当前 Editor' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '刷新状态', exact: true })).toBeVisible()
  await expect(page.locator('.activity-bar').getByTitle('Conversations')).toHaveCount(0)
})

test('分屏中单 Tab 置顶不删除编辑器组', async ({ page }) => {
  await page.evaluate(() => {
    const dock = document.querySelector('.studio-dock').__vueParentComponent.exposed
    const scene = dock.openPanel('scene-workspace')
    dock.openPanel('memory', { tabMode: 'kept' }, { referencePanel: scene.id, direction: 'right' })
  })
  const tab = page.locator('.studio-tab').filter({ hasText: 'Memory' })
  await expect(page.getByLabel('Project Memory Markdown')).toBeVisible()
  await tab.click({ button: 'right' })
  await page.getByText('置顶', { exact: true }).click()
  await expect(tab.getByTitle('已置顶')).toBeVisible()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await expect(page.getByLabel('Project Memory Markdown')).toBeVisible()
  await page.reload()
  await expect(tab.getByTitle('已置顶')).toBeVisible()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await expect(page.getByLabel('Project Memory Markdown')).toBeVisible()
  await page.screenshot({ path: '.output/studio-e2e/pinned-split.png' })
})

test('编辑预览页后自动保留，关闭仍提示保存', async ({ page }) => {
  await page.getByRole('button', { name: /Project Memory/ }).click()
  await page.getByLabel('Project Memory Markdown').fill('# 未保存的验收内容')
  const memory = page.locator('.studio-tab').filter({ hasText: 'Memory' })
  await expect(memory).not.toHaveClass(/is-preview/)
  await page.locator('.activity-bar').getByTitle('Agents', { exact: true }).click()
  await page
    .getByTestId('studio-primary-sidebar')
    .locator('.nav-row')
    .filter({ hasText: 'Agents' })
    .click()
  await expect(memory).toBeVisible()
  await memory.getByLabel('关闭标签').click()
  await expect(page.getByRole('dialog')).toContainText('未保存修改')
  await page.getByRole('button', { name: '全部放弃并关闭' }).click()
  await expect(memory).toHaveCount(0)
})

test('离开工作区保留后台工作，不调用场景释放', async ({ page }) => {
  const releases = []
  page.on('request', (request) => {
    if (request.url().includes('/runtime/release')) releases.push(request.url())
  })
  await page.getByTitle('返回 Project Hub').click()
  const leave = page.getByRole('button', { name: '后台运行并离开' })
  await expect(leave).toBeVisible()
  await page.getByRole('button', { name: '留在这里' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await page.getByTitle('返回 Project Hub').click()
  await leave.click()
  await expect(page).toHaveURL(/\/projects$/)
  expect(releases).toEqual([])
})

test('活动栏包含 Agents，左侧导航退出对话最大化', async ({ page }) => {
  const activity = page.locator('.activity-bar')
  await expect(activity.locator(':scope > button')).toHaveCount(6)
  await expect(activity.getByTitle('Semantic Map')).toHaveCount(0)
  await page.getByRole('button', { name: '最大化对话' }).click()
  await expect(page.getByRole('button', { name: '更多工具' })).toHaveCount(0)
  await activity.getByTitle('Agents', { exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Simulation', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Semantic Map', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await activity.getByTitle('场景', { exact: true }).click()
  await expect(page.getByTestId('maximized-conversation')).not.toBeVisible()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('项目场景')
  await page.getByRole('button', { name: '最大化对话' }).click()
  await activity.getByTitle('设备').click()
  await expect(page.getByTestId('maximized-conversation')).not.toBeVisible()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('项目设备')
})

test('设备显示连接、就绪与当前工作，事件自动刷新且查看执行留在场景', async ({ page }) => {
  await page.evaluate(async () => {
    const { useDeviceStore } = await import('/src/stores/device.js')
    const { useRobotStore } = await import('/src/stores/robot.js')
    const { createDeviceSubscription } = await import('/src/devices/subscription.js')
    const store = useDeviceStore()
    store.upsert({
      robot_id: 'ui-robot',
      project_id: 'proj-v020-demo',
      display_name: '验收 Robot',
      status: 'busy',
      revision: 1,
      pilot: { status: 'online' },
      runtime_instance: {
        instance_id: 'ui-runtime',
        robot_id: 'ui-robot',
        revision: 1,
        status: 'ready'
      }
    })
    useRobotStore().upsert({
      id: 'ui-execution',
      project_id: 'proj-v020-demo',
      robot_id: 'ui-robot',
      skill_name: '检查传感器',
      status: 'running',
      revision: 1
    })
    window.__deviceSubscription = createDeviceSubscription({
      afterSequence: store.lastEventSequence
    })
  })
  await page.locator('.activity-bar').getByTitle('设备').click()
  const entry = page.locator('.robot-entry').filter({ hasText: '验收 Robot' })
  await expect(entry).toContainText('在线')
  await expect(entry).toContainText('就绪')
  await expect(entry).toContainText('当前工作：检查传感器')
  await entry.locator('.robot-row').click()
  await expect(page.getByTestId('robot-device-panel')).toContainText('验收 Robot')
  await expect(
    page.getByTestId('robot-device-panel').getByRole('tab', { name: '配置', exact: true })
  ).toBeVisible()
  await expect(page.locator('.studio-tab')).toHaveCount(2)
  await page.evaluate(async () => {
    const { useDeviceStore } = await import('/src/stores/device.js')
    window.__deviceSubscription.applyEvent({
      sequence: useDeviceStore().lastEventSequence + 1,
      resource_type: 'robot_runtime_instance',
      resource_revision: 2,
      payload: {
        runtime_instance: {
          robot_id: 'ui-robot',
          instance_id: 'ui-runtime',
          status: 'degraded',
          revision: 2
        }
      }
    })
  })
  await expect(entry).toContainText('部分异常')
  await page.locator('.studio-tab').filter({ hasText: '场景' }).click()
  await entry.getByRole('button', { name: '查看 验收 Robot 当前执行' }).click()
  await expect(page.getByTestId('studio-bottom-panel')).toBeVisible()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  expect(
    await page.evaluate(async () => {
      const { useExecutionScopeStore } = await import('/src/stores/executionScope.js')
      return useExecutionScopeStore().executionId
    })
  ).toBe('ui-execution')
})

async function seedCurrentWorkflow(page) {
  await page.evaluate(async () => {
    const { useWorkflowStore } = await import('/src/stores/workflow.js')
    const { useRobotStore } = await import('/src/stores/robot.js')
    const { useRunsStore } = await import('/src/stores/runs.js')
    const { useDeviceStore } = await import('/src/stores/device.js')
    const projectId = 'proj-v020-demo'
    const workflows = useWorkflowStore()
    workflows.items = []
    workflows.views = {}
    workflows.applyView({
      workflow: {
        id: 'wf-current',
        project_id: projectId,
        status: 'running',
        revision: 1,
        goal: '搬运来源当前顶层周转箱到对应目标列，放稳并恢复行走姿态',
        started_at: '2026-09-07T10:00:00Z'
      },
      tasks: [
        { id: 'task-done', status: 'completed', assigned_robot_id: 'ui-robot' },
        { id: 'task-active', status: 'running', assigned_robot_id: 'ui-robot' }
      ],
      subtasks: [
        { id: 'sub-nav', task_id: 'task-active', position: 0, status: 'completed' },
        {
          id: 'sub-grasp',
          task_id: 'task-active',
          position: 1,
          status: 'running',
          goal: '抓取来源当前顶层周转箱',
          execution_ref: 'rex-current',
          spec: { skill_name: 'grasp-object' }
        },
        { id: 'sub-place', task_id: 'task-active', position: 2, status: 'pending' }
      ]
    })
    useRunsStore().hydrate(projectId, [
      {
        id: 'task-plan',
        kind: 'task_planning',
        workflow_id: 'wf-current',
        task_id: 'task-active',
        status: 'running'
      },
      {
        id: 'task-run',
        kind: 'task_execution',
        workflow_id: 'wf-current',
        task_id: 'task-active',
        status: 'running'
      }
    ])
    useRobotStore().hydrate(projectId, [
      {
        id: 'rex-current',
        project_id: projectId,
        robot_id: 'ui-robot',
        workflow_id: 'wf-current',
        task_id: 'task-active',
        subtask_id: 'sub-grasp',
        run_id: 'task-run',
        status: 'running',
        revision: 1,
        skill_name: 'grasp-object',
        stage: 'grasp'
      }
    ])
    useDeviceStore().upsert({
      robot_id: 'ui-robot',
      project_id: projectId,
      display_name: '当前工作 Robot',
      status: 'busy',
      revision: 1,
      pilot: { status: 'online' },
      runtime_instance: { status: 'ready' }
    })
  })
}

test('工作条按 Workflow 去重，真实 Task / SubTask / Skill / Stage 随事件更新', async ({ page }) => {
  await seedCurrentWorkflow(page)
  const work = page.getByTestId('studio-current-work')
  await expect(work).toContainText('Task 1/2 已完成')
  await expect(work).toContainText('SubTask 2/3')
  await expect(work).toContainText('Skill grasp-object')
  await expect(work).toContainText('Stage grasp')
  await expect(work.getByRole('button', { name: /项进行中/ })).toHaveCount(0)
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    useRobotStore().applyEvent({
      project_id: 'proj-v020-demo',
      resource_type: 'robot_execution',
      resource_id: 'rex-current',
      type: 'stage.started',
      execution_sequence: 501,
      payload: { stage: 'prepare_transport', summary: '整理搬运姿态' }
    })
  })
  await expect(work).toContainText('Stage prepare_transport')
  await page.evaluate(async () => {
    const { useRunsStore } = await import('/src/stores/runs.js')
    useRunsStore().upsert({
      id: 'independent-query',
      kind: 'conversation',
      status: 'running',
      agent_id: 'robot:ui-robot'
    })
  })
  await expect(work.getByRole('button', { name: '2 项进行中' })).toBeVisible()
  await page.locator('.activity-bar').getByTitle('设备').click()
  const device = page.locator('.robot-entry').filter({ hasText: '当前工作 Robot' })
  await expect(device).toContainText('当前工作：搬运来源当前顶层周转箱')
  await page.evaluate(async () => {
    const { useExecutionScopeStore } = await import('/src/stores/executionScope.js')
    const { useConversationStore } = await import('/src/stores/conversation.js')
    useExecutionScopeStore().inspectWorkflow('wf-history')
    useConversationStore().currentId = 'history-conversation'
  })
  await expect(work).toContainText('Stage prepare_transport')
  await expect(device).toContainText('当前工作：搬运来源当前顶层周转箱')
  expect(await work.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: '.output/studio-e2e/current-work-progress.png' })
  await page.setViewportSize({ width: 1600, height: 1000 })
  await expect(work).toContainText('Stage prepare_transport')
  expect(await work.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: '.output/studio-e2e/current-work-progress-wide.png' })
})

test('Workflow 结束原位保留结果，Leader 收尾不抢占，历史固定时新运行仍更新工作条', async ({
  page
}) => {
  await seedCurrentWorkflow(page)
  await page.evaluate(async () => {
    const { useWorkflowStore } = await import('/src/stores/workflow.js')
    const { useRobotStore } = await import('/src/stores/robot.js')
    const { useRunsStore } = await import('/src/stores/runs.js')
    const store = useWorkflowStore()
    for (const subtask of [...store.tasks[1].subtasks]) {
      store.applyEvent({
        project_id: 'proj-v020-demo',
        resource_type: 'subtask',
        payload: { subtask: { ...subtask, status: 'completed', revision: 2 } }
      })
    }
    store.applyEvent({
      project_id: 'proj-v020-demo',
      resource_type: 'task',
      payload: { task: { ...store.tasks[1], status: 'completed', revision: 2 } }
    })
    store.applyEvent({
      project_id: 'proj-v020-demo',
      resource_type: 'workflow',
      payload: {
        workflow: {
          ...store.workflow,
          status: 'completed',
          revision: 2,
          ended_at: '2026-09-07T10:01:00Z'
        }
      }
    })
    useRobotStore().upsert({ id: 'rex-current', status: 'completed', revision: 2 })
    useRunsStore().upsert({
      id: 'leader-summary',
      kind: 'conversation',
      workflow_id: 'wf-current',
      status: 'running',
      agent_id: 'leader',
      started_at: '2026-09-07T10:01:01Z'
    })
  })
  const work = page.getByTestId('studio-current-work')
  await expect(work).toContainText('Workflow')
  await expect(work).toContainText('最近结果')
  await expect(work).toContainText('Task 2/2 已完成')
  await expect(work.getByRole('button', { name: '停止执行' })).toHaveCount(0)
  await expect(work).not.toContainText('Stage')
  await work.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(
    page.getByTestId('studio-bottom-panel').getByRole('tab', { name: '结果' })
  ).toHaveAttribute('aria-selected', 'true')
  expect(
    await page.evaluate(async () => {
      const { useExecutionScopeStore } = await import('/src/stores/executionScope.js')
      return useExecutionScopeStore().workflowId
    })
  ).toBe('wf-current')
  await page.screenshot({ path: '.output/studio-e2e/current-work-result.png' })
  await page.evaluate(async () => {
    const { useWorkflowStore } = await import('/src/stores/workflow.js')
    useWorkflowStore().applyView({
      workflow: {
        id: 'wf-next',
        project_id: 'proj-v020-demo',
        status: 'running',
        goal: '下一轮真实工作',
        started_at: '2026-09-07T10:02:00Z'
      },
      tasks: [{ id: 'task-next', status: 'pending', assigned_robot_id: 'ui-robot' }]
    })
  })
  await expect(work).toContainText('下一轮真实工作')
  await expect(work).toContainText('Task 0/1 已完成')
  await expect(work.getByRole('button', { name: '停止执行' })).toBeVisible()
  expect(
    await page.evaluate(async () => {
      const { useExecutionScopeStore } = await import('/src/stores/executionScope.js')
      return {
        mode: useExecutionScopeStore().mode,
        workflowId: useExecutionScopeStore().workflowId
      }
    })
  ).toEqual({ mode: 'history', workflowId: 'wf-current' })
})

test('刷新仅有终态 Workflow 摘要时按 ID 恢复结果，不误判活动或阻止场景重置', async ({ page }) => {
  // 全局设备快照与 Project 快照属于同一个已结束现场，不能仍补入演示活动执行。
  await page.route('**/src/fixtures/deviceFixture.js', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
      executions.length = 0;
      devices.forEach(device => {
        device.current_execution_id = '';
        if (device.status === 'busy') device.status = 'idle';
      });
    `
    })
  })
  await page.route('**/src/fixtures/studioFixture.js', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
      const snapshotBeforeTerminalTest = studioFixture.getSnapshot.bind(studioFixture);
      let terminalView;
      studioFixture.getSnapshot = async (...args) => {
        const response = await snapshotBeforeTerminalTest(...args);
        terminalView = response.snapshot.workflow_view;
        terminalView.workflow.status = 'completed';
        terminalView.tasks.forEach(task => task.status = 'completed');
        terminalView.subtasks.forEach(subtask => subtask.status = 'completed');
        response.snapshot.workflows = [terminalView.workflow];
        response.snapshot.workflow_view = null;
        response.snapshot.runs = [];
        response.snapshot.robot_executions = [];
        response.snapshot.pending_interactions = [];
        // 快照已包含完整终态，旧演示事件不得在其后重新回放为活动。
        response.snapshot.event_sequence = 100000;
        return response;
      };
      studioFixture.getWorkflowView = async (id) => {
        if (id !== terminalView.workflow.id) throw new Error('Unexpected workflow ID');
        return { workflow_view: terminalView };
      };
      studioFixture.listRuns = async () => ({ runs: [] });
    `
    })
  })
  let instance = {
    instance_id: 'terminal-reset-fixture',
    generation: 1,
    state: 'running',
    runtime_profile_id: 'fixture-runtime'
  }
  let resets = 0
  await page.route('**/simulation/snapshot', (route) =>
    route.fulfill({
      json: {
        simulation: { runtime: { state: 'ready', runtime_profile_id: 'fixture-runtime' }, instance }
      }
    })
  )
  await page.route('**/simulation/instances/terminal-reset-fixture/**', (route) => {
    const operation = new URL(route.request().url()).pathname.split('/').at(-1)
    if (operation === 'reset' && route.request().method() === 'POST') {
      resets += 1
      instance = { ...instance, generation: instance.generation + 1 }
      return route.fulfill({ json: { instance } })
    }
    if (operation === 'snapshot')
      return route.fulfill({
        json: { snapshot: { generation: instance.generation, objects: [], robots: [] } }
      })
    if (operation === 'robots') return route.fulfill({ json: { robots: [] } })
    return route.fulfill({
      status: 503,
      json: { error: { message: '此用例仅验证终态恢复与重置' } }
    })
  })
  await page.reload()
  const work = page.getByTestId('studio-current-work')
  await expect(work).toContainText('最近结果')
  await expect(work).toContainText('Task 2/2 已完成')
  await expect(work.getByRole('button', { name: '查看结果' })).toBeVisible()
  await expect(work.getByRole('button', { name: '停止执行' })).toHaveCount(0)
  expect(
    await page.evaluate(async () => {
      const { useWorkflowStore } = await import('/src/stores/workflow.js')
      return useWorkflowStore().active
    })
  ).toBeNull()
  await page.locator('.viewer-toolbar').getByRole('button', { name: '重置', exact: true }).click()
  await page
    .getByRole('dialog', { name: '重置场景' })
    .getByRole('button', { name: '重置', exact: true })
    .click()
  await expect(page.getByText('场景已重置，可开始下一轮', { exact: true })).toBeVisible()
  expect(resets).toBe(1)
  await expect(work).toContainText('最近结果')
  await page.screenshot({ path: '.output/studio-e2e/current-work-result-refreshed.png' })
})

test('场景准备加载、失败和无安装分别显示，原位设置关闭后恢复现场', async ({ page }) => {
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    const store = useSimulationStore()
    store.instance = null
    store.loading = true
  })
  const scene = page.getByTestId('scene-workspace')
  await expect(scene).toContainText('正在读取场景与运行环境')
  await expect(scene.getByText('尚无可用运行环境', { exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    const store = useSimulationStore()
    store.loading = false
    store.error = '连接 Runtime 目录超时'
  })
  await expect(scene.getByRole('alert')).toContainText('连接 Runtime 目录超时')
  await expect(scene.getByText('尚无可用运行环境', { exact: true })).toHaveCount(0)
  await scene.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(scene.getByText('运行环境读取失败：连接 Runtime 目录超时')).toHaveCount(0)
  const url = page.url()
  await scene.getByRole('button', { name: '运行环境', exact: true }).click()
  await expect(page.getByRole('dialog').locator('.runtime-settings')).toBeVisible()
  await page.getByRole('dialog').getByLabel('Close this dialog').click()
  await expect(scene).toBeVisible()
  await expect(page).toHaveURL(url)
})

test('计划卡清楚展示来源与完成条件，批准后保持场景并更新底部执行', async ({ page }) => {
  // 本例只观察新批准的工作；初始演示 Workflow 不是这次计划的前置任务。
  await page.evaluate(async () => {
    const { useWorkflowStore } = await import('/src/stores/workflow.js')
    const store = useWorkflowStore()
    store.items = []
    store.workflow = null
    store.views = {}
    store.tasks = []
  })
  const conversation = page.getByTestId('studio-conversation-sidebar')
  await conversation.getByRole('button', { name: '新建对话', exact: true }).click()
  await conversation.locator('.mode-btn').click()
  await page.getByRole('menuitem').filter({ hasText: '规划' }).click()
  await conversation.getByLabel('对话消息').fill('请先给我计划')
  await conversation.locator('.send-btn').click()
  await expect(conversation).toContainText('请补充期望交付物和验收方式')
  await expect(conversation.locator('.send-btn')).not.toHaveClass(/is-stop/)
  await conversation.getByLabel('对话消息').fill('检查项目，完成条件是自动测试通过')
  await conversation.locator('.send-btn').click()
  const plan = conversation.getByTestId('plan-proposal-summary')
  await expect(plan).toContainText('来源：')
  await expect(plan).toContainText('Robot：无需 Robot')
  await expect(plan).toContainText('完成条件：自动测试通过')
  await expect(plan.getByRole('button', { name: '批准并执行' })).toBeInViewport()
  expect(await plan.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: '.output/studio-e2e/plan-review-in-scene.png' })
  await plan.getByRole('button', { name: '批准并执行' }).click()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await expect(page.locator('.studio-tab')).toHaveCount(1)
  await expect(page.getByTestId('studio-current-work')).toContainText(
    '检查项目，完成条件是自动测试通过'
  )
  await expect(page.getByTestId('studio-bottom-panel')).toBeVisible()
  await expect(plan).toHaveCount(0)
  await page.screenshot({ path: '.output/studio-e2e/plan-approved-in-scene.png' })
})

test('场景重置与停止显示真实请求等待，失败可重试且不重复提交', async ({ page }) => {
  // 以独立的模拟 Server 状态驱动真实 Store.operate；不从 Pinia 反读响应，
  // 也不覆盖 Store action，确保 stop 之后的所有补查都返回同一终态。
  let instance = {
    instance_id: 'control-fixture',
    generation: 1,
    state: 'running',
    runtime_profile_id: 'fixture-runtime'
  }
  let pendingOperation
  const operations = []
  await page.route('**/simulation/snapshot', async (route) => {
    await route.fulfill({
      json: {
        simulation: {
          runtime: { state: 'ready', runtime_profile_id: 'fixture-runtime' },
          instance
        }
      }
    })
  })
  await page.route('**/simulation/instances/control-fixture/**', async (route) => {
    const operation = new URL(route.request().url()).pathname.split('/').at(-1)
    if (route.request().method() === 'POST' && ['reset', 'stop'].includes(operation)) {
      operations.push(operation)
      pendingOperation = route
      return
    }
    if (operation === 'snapshot')
      return route.fulfill({
        json: { snapshot: { generation: instance.generation, objects: [], robots: [] } }
      })
    if (operation === 'robots') return route.fulfill({ json: { robots: [] } })
    return route.fulfill({ status: 503, json: { error: { message: '此用例仅检查操作请求状态' } } })
  })
  async function finishOperation(operation) {
    await expect.poll(() => Boolean(pendingOperation)).toBe(true)
    instance =
      operation === 'stop'
        ? { ...instance, state: 'stopped' }
        : { ...instance, generation: instance.generation + 1 }
    const route = pendingOperation
    pendingOperation = null
    await route.fulfill({ json: { instance } })
  }
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    await useSimulationStore().hydrate('proj-v020-demo')
  })
  const toolbar = page.locator('.viewer-toolbar')
  await toolbar.getByRole('button', { name: '重置', exact: true }).click()
  await page
    .getByRole('dialog', { name: '重置场景' })
    .getByRole('button', { name: '重置', exact: true })
    .click()
  await expect(toolbar).toContainText('正在重置场景')
  await expect(toolbar.getByRole('button', { name: '重置', exact: true })).toBeDisabled()
  await expect(toolbar.getByRole('button', { name: '停止场景', exact: true })).toBeDisabled()
  await expect.poll(() => Boolean(pendingOperation)).toBe(true)
  await pendingOperation.fulfill({
    status: 409,
    json: { error: { code: 'RESET_CONFIRMATION_FAILED', message: '重置状态确认失败' } }
  })
  pendingOperation = null
  await expect(page.getByText('重置状态确认失败', { exact: true })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: '重置', exact: true })).toBeEnabled()
  await toolbar.getByRole('button', { name: '重置', exact: true }).click()
  await page
    .getByRole('dialog', { name: '重置场景' })
    .getByRole('button', { name: '重置', exact: true })
    .click()
  await expect(toolbar).toContainText('正在重置场景')
  await finishOperation('reset')
  await expect(page.getByText('场景已重置，可开始下一轮', { exact: true })).toBeVisible()
  await toolbar.getByRole('button', { name: '停止场景', exact: true }).click()
  await page
    .getByRole('dialog', { name: '停止场景' })
    .getByRole('button', { name: '停止', exact: true })
    .click()
  await expect(toolbar).toContainText('正在停止场景')
  await finishOperation('stop')
  await expect(page.getByText('场景已停止', { exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const { useSimulationStore } = await import('/src/stores/simulation.js')
    await useSimulationStore().hydrate('proj-v020-demo')
  })
  expect(operations).toEqual(['reset', 'reset', 'stop'])
  await expect(
    page.getByTestId('scene-workspace').getByRole('button', { name: '启动此 Layout', exact: true })
  ).toBeVisible()
})
