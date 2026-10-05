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

async function openSceneMap(page, name = 'Simulation Map') {
  await page.locator('.activity-bar').getByTitle('场景', { exact: true }).click()
  const scene = page.getByTestId('scene-workspace')
  await scene.locator('.scene-toolbar').getByRole('button', { name: '地图', exact: true }).click()
  const map = page.getByTestId('semantic-map-panel')
  await map.locator('.map-switch').getByRole('button', { name, exact: true }).click()
  await expect(map.locator('h2')).toHaveText(name)
  return map
}

test.beforeEach(async ({ page }) => {
  await installStudioSimulationFixture(page)
  await page.addInitScript(() => {
    window.localStorage.setItem(
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

test('已批准 Workflow 在中央运行视图展示 Task、SubTask 与 Inspector', async ({ page }) => {
  const map = await openSceneMap(page)
  await map.locator('.map-tree button').filter({ hasText: '托盘 A' }).click()

  await page.getByRole('tab', { name: '对话', exact: true }).click()
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '选择历史对话', exact: true }).click()
  const picker = sidebar.getByRole('dialog', { name: '选择对话', exact: true })
  await picker.getByRole('textbox', { name: '搜索对话', exact: true }).fill('检查工具运行链')
  await picker.locator('.history-row').filter({ hasText: '检查工具运行链' }).click()
  await expect(sidebar.locator('.conversation-title')).toHaveText('检查工具运行链')
  await page.locator('.activity-bar').getByTitle('运行', { exact: true }).click()
  const workflowRow = page
    .getByTestId('studio-primary-sidebar')
    .locator('.workflow-row')
    .filter({ hasText: '分析工作区数据并交付测试报告' })
  await workflowRow.click()
  const execution = page.getByTestId('studio-bottom-panel')
  await expect(execution.getByRole('tab', { name: '过程', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(execution).toContainText('分析工作区数据并交付测试报告')
  await expect(page.locator('.workflow-run')).toHaveCount(0)
  await workflowRow.dblclick()
  const workflow = page.locator('.workflow-run')
  await expect(workflow).toContainText('分析工作区数据并交付测试报告')
  await expect(workflow).toContainText('确认输入文件和地图范围')
  await expect(workflow).toContainText('编写分析程序并运行测试')
  await workflow.locator('.task-node').filter({ hasText: '编写分析程序并运行测试' }).click()
  const inspector = page.getByTestId('studio-context-inspector')
  await page.getByRole('tab', { name: 'Inspector', exact: true }).click()
  await expect(inspector).toContainText('Task')
  await expect(inspector).toContainText('实现程序')
  await expect(inspector).toContainText('运行测试')
})

test('Semantic Map 隔离两张地图并完成人工 Region 与 Relation CRUD', async ({ page }) => {
  const map = await openSceneMap(page, 'Real Map')
  await expect(map).toContainText('当前地图版本没有实体')

  await map.locator('.map-switch').getByRole('button', { name: 'Simulation Map' }).click()
  await expect(map.locator('h2')).toHaveText('Simulation Map')
  await expect(map.locator('.map-tree')).toContainText('托盘 A')
  await map.getByRole('button', { name: '正向 3D' }).click()
  await expect(map.getByRole('button', { name: '正向 3D' })).toHaveClass(/active/u)
  await expect(map.locator('canvas')).toBeVisible()
  await expect(map.locator('.viewport-hint')).toContainText('拖拽平移')
  await expect(map.locator('.viewport-hint')).toContainText('Ctrl+拖拽或右键拖拽旋转')
  await expect(map.getByRole('button', { name: '回到原点' })).toBeVisible()
  await expect(map.getByLabel('地图方向尺')).toContainText('+Y / 北')
  await map.getByRole('button', { name: '2D 顶视' }).click()
  await expect(map.getByRole('button', { name: '2D 顶视' })).toHaveClass(/active/u)

  await map.getByRole('button', { name: '新增区域' }).click()
  const createRegion = page.getByRole('dialog', { name: '新增区域' })
  await expect(createRegion).toContainText('所有坐标和尺寸均使用米')
  await createRegion.getByLabel('名称').fill('测试区域')
  await createRegion.getByLabel('区域用途').fill('验收放置区')
  await createRegion.getByLabel('标签（可选）').fill('qa,drop-zone')
  await createRegion.getByRole('button', { name: '创建并显示在地图' }).click()
  await expect(map.locator('.map-tree')).toContainText('测试区域')

  await map.getByRole('button', { name: '新增关系' }).click()
  const relation = page.getByRole('dialog', { name: '新增人工关系' })
  const formItems = relation.locator('.el-form-item')
  await formItems.nth(0).locator('.el-select').click()
  await page.getByRole('option', { name: '托盘 A' }).click()
  await formItems.nth(1).locator('input').fill('inside')
  await formItems.nth(2).locator('.el-select').click()
  await page.getByRole('option', { name: '测试区域' }).last().click()
  await relation.getByRole('button', { name: '保存关系' }).click()
  await expect(map.locator('.relation-row')).toContainText('inside')

  await map.locator('.relation-row').click()
  const editRelation = page.getByRole('dialog', { name: '编辑人工关系' })
  await editRelation.locator('.el-form-item').nth(1).locator('input').fill('contains')
  await editRelation.getByRole('button', { name: '保存关系' }).click()
  await expect(map.locator('.relation-row')).toContainText('contains')
  await map.locator('.relation-row').click()
  await page
    .getByRole('dialog', { name: '编辑人工关系' })
    .getByRole('button', { name: '移除关系' })
    .click()
  await expect(map.locator('.relation-row')).toHaveCount(0)

  await map.locator('.map-tree button').filter({ hasText: '测试区域' }).click()
  const inspector = page.getByTestId('studio-context-inspector')
  await page.getByRole('tab', { name: 'Inspector', exact: true }).click()
  await expect(inspector).toContainText('测试区域')
  await expect(inspector.getByLabel('区域用途')).toHaveValue('验收放置区')
  await expect(inspector).toContainText('地图版本')
  await expect(inspector).toContainText('关联素材与观测')
  await expect(inspector).not.toContainText('WORKFLOW · REVISION')
  await expect(inspector.locator('.workflow-progress')).toHaveCount(0)
  await expect(map.getByRole('button', { name: '编辑所选' })).toHaveCount(0)
  const inlineName = inspector.getByLabel('名称')
  const orientationX = inspector.getByLabel('姿态 X')
  const orientationW = inspector.getByLabel('姿态 W')
  await expect(inlineName).toHaveValue('测试区域')
  await expect(inlineName).toBeDisabled()
  await expect(orientationX).toHaveValue('0.000000')
  await expect(orientationX).toBeDisabled()
  await expect(orientationW).toHaveValue('1.000000')
  await inspector.getByRole('button', { name: '编辑属性' }).click()
  await expect(inlineName).toBeEnabled()
  await expect(orientationX).toBeEnabled()
  await inlineName.fill('测试放置区域')
  await inspector.getByLabel('区域用途').fill('拆码垛验收区')
  await orientationX.fill('0.6')
  await orientationW.fill('0.8')
  await expect(inspector).toContainText('当前模长 1.0000')
  await inspector.getByRole('button', { name: '保存属性' }).click()
  await expect(map.locator('.map-tree')).toContainText('测试放置区域')
  await expect(inspector.getByLabel('区域用途')).toHaveValue('拆码垛验收区')
  await expect(inlineName).toBeDisabled()
  await expect(orientationX).toHaveValue('0.600000')
  await expect(orientationW).toHaveValue('0.800000')
  await expect(orientationX).toBeDisabled()
  await inspector.getByRole('button', { name: '移除所选' }).click()
  await page
    .getByRole('dialog', { name: '移除地图对象' })
    .getByRole('button', { name: '移除' })
    .click()
  await expect(map.locator('.map-tree')).not.toContainText('测试区域')
})

test('Bottom Interaction Center 通过 Renderer 提交并等待 Server 事件确认', async ({ page }) => {
  await page.getByLabel('切换底部面板').click()
  const bottom = page.getByTestId('studio-bottom-panel')
  await bottom.getByRole('tab', { name: /待处理/u }).click()
  await expect(bottom).toContainText('是否继续执行演示工具？')
  await bottom
    .locator('.interaction-card')
    .getByRole('button', { name: '确认', exact: true })
    .click()
  await expect(bottom).toContainText('0 个等待用户输入')
  await expect(bottom.locator('.interaction-card')).toHaveCount(0)
})

test('规划模式在同一 Conversation 内多轮澄清，批准 Proposal 后才创建 Workflow', async ({
  page
}) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: '新建 Project' }).click()
  const createProject = page.getByRole('dialog', { name: '新建 Project' })
  await createProject.getByRole('textbox', { name: /Project 名称/u }).fill('v0.3 Plan 入口验收')
  await createProject.getByRole('button', { name: '创建并打开', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/proj-fixture-\d+\/studio/u)
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')

  await page.getByTitle('新建对话').click()
  const conversation = page.locator('.conversation-panel')
  await expect(page.locator('.conversation-heading')).toContainText('新对话')
  await conversation.locator('textarea').fill('请先帮我制定计划，不要直接执行')
  await conversation.locator('.send-btn').click()
  await expect(conversation).toContainText('leader 已收到：请先帮我制定计划，不要直接执行')
  await expect(conversation.locator('.send-btn')).not.toHaveClass(/is-stop/)
  await expect(conversation.getByTestId('plan-proposal-summary')).toHaveCount(0)

  await conversation.locator('.mode-btn').click()
  await page.getByRole('menuitem').filter({ hasText: '规划' }).click()
  await expect(conversation.locator('.scope-intent')).toHaveText('规划')
  await conversation.locator('textarea').fill('请先分析这个目标并告诉我还缺少什么信息')
  await conversation.locator('.send-btn').click()
  await expect(conversation).toContainText('请补充期望交付物和验收方式')
  await expect(conversation.getByTestId('plan-proposal-summary')).toHaveCount(0)

  await conversation.locator('textarea').fill('交付一个 Developer Task，验收要求为自动测试通过')
  await conversation.locator('.send-btn').click()
  const plan = conversation.getByTestId('plan-proposal-summary')
  await expect(plan).toContainText('PLAN PROPOSAL · REVISION 1')
  await expect(plan).toContainText('实现并验证目标')
  await plan.getByRole('button', { name: '查看计划' }).click()
  const document = page.locator('.plan-document')
  await expect(conversation).toBeVisible()
  await expect(document).toContainText('LEADER TASK TODO')
  await expect(document).toContainText('实现并验证目标')
  await document.getByRole('button', { name: '批准并执行' }).click()
  await expect(document).toBeVisible()
  await expect(document).toContainText('已批准')
  await expect(page.locator('.workflow-run')).toHaveCount(0)
  await expect(page.getByTestId('studio-bottom-panel')).toContainText('实现并验证目标')
  await expect(conversation.getByTestId('plan-proposal-summary')).toHaveCount(0)
})

test('Project 内设置使用 Studio 模态窗口且不离开当前项目', async ({ page }) => {
  const studioUrl = page.url()
  await page.locator('.activity-bar').getByTitle('当前 Project 设置').click()
  const settings = page.getByRole('dialog').filter({ hasText: '当前 Project' })
  await expect(settings).toBeVisible()
  await expect(settings).toContainText('当前 Project')
  await expect(settings).toContainText('proj-v020-demo')
  expect(page.url()).toBe(studioUrl)
  await settings.getByRole('button', { name: '模型服务' }).click()
  await expect(settings).toContainText('连接模型服务')
  expect(page.url()).toBe(studioUrl)
})

test('Agent 继承系统 Default 时在主模型选择框显示实际默认模型', async ({ page }) => {
  await page.route('**/api/v1/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'developer-1',
            role: 'developer',
            mode: 'worker',
            status: 'idle',
            model: 'deepseek-v4-flash',
            default_inherited: true,
            max_turns: 20,
            context_tokens: 120000
          }
        ]
      }
    })
  })
  await page.route('**/api/v1/settings', async (route) => {
    await route.fulfill({
      json: {
        settings: {
          llm: {
            default: 'deepseek-default',
            providers: {
              'deepseek-default': {
                service: 'deepseek',
                model: 'deepseek-v4-flash',
                base_url: 'https://example.invalid/v1'
              }
            }
          }
        },
        base_hash: 'fixture-hash',
        key_sources: { 'deepseek-default': 'env' }
      }
    })
  })

  await page.locator('.activity-bar').getByTitle('Agents', { exact: true }).click()
  await page
    .getByTestId('studio-primary-sidebar')
    .locator('.nav-row')
    .filter({ hasText: 'Agents' })
    .click()
  const agents = page.locator('.agents-view')
  await expect(agents).toContainText('developer-1')
  await expect(
    agents.locator('.model-card .el-select').first().locator('.el-select__placeholder')
  ).toContainText('继承系统 Default（deepseek-v4-flash）')
})

test('浅色与深色主题的 Dock Tab 使用相反且可读的文字颜色', async ({ page }) => {
  await page
    .getByTestId('studio-primary-sidebar')
    .locator('.nav-row')
    .filter({ hasText: 'Project Memory' })
    .click()
  const dock = page.getByTestId('studio-editor')
  const activeTab = dock.locator('.dv-tab.dv-active-tab').first()
  const inactiveTab = dock.locator('.dv-tab.dv-inactive-tab').first()
  await expect(dock).toHaveClass(/dockview-theme-light/u)
  await expect(inactiveTab).toBeVisible()
  expect(await activeTab.evaluate((node) => getComputedStyle(node).color)).toBe('rgb(21, 25, 38)')
  expect(await inactiveTab.evaluate((node) => getComputedStyle(node).color)).toBe(
    'rgb(110, 113, 130)'
  )

  await page.getByLabel('切换主题').click()
  await expect(dock).toHaveClass(/dockview-theme-dark/u)
  expect(await activeTab.evaluate((node) => getComputedStyle(node).color)).toBe(
    'rgb(242, 243, 250)'
  )
  expect(await inactiveTab.evaluate((node) => getComputedStyle(node).color)).toBe(
    'rgb(184, 191, 210)'
  )
})
