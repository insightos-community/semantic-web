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
  await page.addInitScript(() =>
    localStorage.setItem(
      'session',
      JSON.stringify({
        token: 'fixture-token',
        user: { id: 'fixture-user', name: 'Fixture User' },
        currentTeam: null
      })
    )
  )
  await page.route('**/api/v1/skills', (route) => route.fulfill({ json: { skills: [] } }))
  await page.route('**/api/v1/traces/**/spans', (route) => route.fulfill({ json: { spans: [] } }))
  await page.route('**/api/v1/robot-skills/*/*', (route) =>
    route.fulfill({
      json: { skill: { name: 'grasp-object', version: '0.5.0', content: '# test' } }
    })
  )
  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
})

async function openPanel(page, type, params) {
  await page.evaluate(
    async ({ type, params }) => {
      const { openStudioPanel } = await import('/src/studio/panelService.js')
      openStudioPanel(type, params)
    },
    { type, params }
  )
}

test('中央 Robot 详情完整配置与就地调试，不依赖 Inspector', async ({ page }) => {
  await openPanel(page, 'robot-device', { resourceId: 'r1pro-sim-001' })
  const panel = page.getByTestId('robot-device-panel')
  await expect(panel.getByRole('tab', { name: '配置', exact: true })).toBeVisible()
  await panel.getByRole('tab', { name: '配置', exact: true }).click()
  for (const label of [
    'SDK 与连接',
    'Providers',
    '坐标系 Frames',
    '安全限制 Safety',
    'Pilot',
    '技能期望与实际安装'
  ])
    await expect(panel).toContainText(label)
  await expect(panel.getByRole('button', { name: '复制安全配置' })).toBeVisible()
  await page.screenshot({ path: '.output/studio-professional-configuration.png' })
  await panel.getByRole('tab', { name: '技能与基础调试', exact: true }).click()
  await panel.locator('.skills-grid article').filter({ hasText: 'grasp-object' }).first().click()
  await expect(panel.locator('.robot-skill-debug-panel')).toBeVisible()
  await expect(
    panel.locator('.robot-skill-debug-panel').getByRole('button', { name: '启动调试' })
  ).toBeDisabled()
  await panel.getByRole('tab', { name: 'Ability 基础调试' }).click()
  await expect(panel.locator('.ability-debug-panel')).toBeVisible()
  await expect(panel.locator('.ability-contract')).not.toHaveAttribute('open', '')
  await expect(
    panel.locator('.ability-debug-panel').getByRole('button', { name: '启动调试' })
  ).toBeDisabled()
  expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await panel.locator('.ability-debug-panel').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.output/studio-professional-debug.png' })
  await panel.getByRole('button', { name: '执行记录', exact: true }).click()
  await expect(page.getByTestId('execution-scope')).toContainText('已固定记录')
  await expect(panel).toBeVisible()
})

test('设备独立详情保持三组配置调试，执行查看转到所属 Project 底部', async ({ page }) => {
  await page.goto('/devices/r1pro-sim-001')
  const panel = page.getByTestId('device-detail')
  await expect(panel.getByRole('tab')).toHaveCount(3)
  await panel.getByRole('tab', { name: '配置', exact: true }).click()
  await expect(panel.getByTestId('device-configuration')).toBeVisible()
  await panel.getByRole('tab', { name: '概览', exact: true }).click()
  await panel.getByRole('button', { name: '查看执行时间线' }).click()
  await expect(page).toHaveURL(/\/projects\/proj-v020-demo\/studio\?panel=activity&execution_id=/)
  await expect(page.getByTestId('execution-scope')).toContainText('已固定记录')
})

test('Workflow 长目标折叠、Task 与 SubTask 保留真实完成数', async ({ page }) => {
  await page.evaluate(async () => {
    const { studioFixture } = await import('/src/fixtures/studioFixture.js')
    const original = studioFixture.getWorkflowView.bind(studioFixture)
    const view = {
      workflow: {
        id: 'professional-workflow',
        project_id: 'proj-v020-demo',
        status: 'completed',
        goal: '将当前可访问来源周转箱搬到对应目标并恢复行走姿态。'.repeat(24),
        created_at: '2026-09-07T01:00:00Z',
        updated_at: '2026-09-07T01:04:00Z'
      },
      tasks: [
        { id: 'professional-task', goal: '实际任务完整目标。'.repeat(25), status: 'completed' }
      ],
      subtasks: [
        {
          id: 'sub1',
          task_id: 'professional-task',
          title: '导航到来源',
          status: 'completed',
          kind: 'robot_skill'
        },
        {
          id: 'sub2',
          task_id: 'professional-task',
          title: '抓取并验证',
          status: 'completed',
          kind: 'robot_skill'
        }
      ]
    }
    studioFixture.getWorkflowView = async (id) =>
      id === view.workflow.id ? { workflow_view: view } : original(id)
  })
  await openPanel(page, 'workflow-run', { resourceId: 'professional-workflow' })
  const panel = page.locator('.workflow-run')
  await expect(panel).toContainText('Task 1/1 已完成')
  await expect(panel).toContainText('2/2 SubTask 已完成')
  await expect(panel.locator('h1')).not.toContainText('。'.repeat(2))
  expect((await panel.locator('h1').textContent()).length).toBeLessThan(60)
  await expect(panel.locator('.full-goal').first()).not.toHaveAttribute('open', '')
  expect(
    await panel.locator(':scope > header').evaluate((node) => node.getBoundingClientRect().height)
  ).toBeLessThan(155)
  await page.screenshot({ path: '.output/studio-professional-workflow.png' })
  await panel.locator('.full-goal').first().locator('summary').click()
  await expect(panel.locator('.full-goal').first().locator('p')).toContainText('恢复行走姿态')
  await panel.getByRole('button', { name: '查看执行记录' }).click()
  await expect(page.getByTestId('execution-scope')).toContainText('已固定记录')
})

test('Trace 按 Run 分页显示模型、工具参数结果和错误，不串入其他 Run', async ({ page }) => {
  await page.evaluate(async () => {
    const { studioFixture } = await import('/src/fixtures/studioFixture.js')
    const original = studioFixture.getRun.bind(studioFixture)
    studioFixture.getRun = async (id) =>
      id === 'professional-run'
        ? {
            run: {
              id,
              project_id: 'proj-v020-demo',
              trace_id: 'professional-trace',
              status: 'completed',
              agent_name: '拆码垛 Robot',
              model: 'deepseek-test',
              started_at: '2026-09-07T01:00:00Z',
              ended_at: '2026-09-07T01:00:05Z'
            }
          }
        : original(id)
  })
  await page.route('**/api/v1/traces/professional-trace/spans', (route) =>
    route.fulfill({
      json: {
        spans: [
          {
            id: 1,
            name: 'deepseek-test',
            kind: 'ChatModel',
            duration_ms: 1800,
            started_at: '2026-09-07T01:00:00Z',
            attrs: { status: 'completed', stream_chunks: 23 }
          }
        ]
      }
    })
  )
  await page.route('**/api/v1/metering/traces/professional-trace*', (route) =>
    route.fulfill({ json: { records: [] } })
  )
  await page.route('**/api/v1/runs/professional-run/events*', (route) => {
    const after = new URL(route.request().url()).searchParams.get('after_sequence')
    const tool = (sequence, type, payload) => ({
      id: `event-${sequence}`,
      sequence,
      type,
      ts: `2026-09-07T01:00:0${sequence}Z`,
      payload: { run_id: 'professional-run', call_id: 'call1', name: 'robot.get', ...payload }
    })
    const events =
      after === '0'
        ? [
            tool(1, 'tool.call', { arguments: '{"robot_id":"r1pro-sim-001"}' }),
            tool(2, 'tool.call', {
              run_id: 'other-run',
              call_id: 'other',
              name: '不得显示的其他运行'
            })
          ]
        : [
            tool(3, 'tool.result', { result: '{"status":"idle","current_task":null}' }),
            tool(4, 'tool.call', {
              call_id: 'call2',
              name: 'robot.execute',
              arguments: { skill: 'grasp-object' }
            }),
            tool(5, 'tool.result', {
              call_id: 'call2',
              name: 'robot.execute',
              result: { error: { code: 'ROBOT_BUSY', message: '已有任务占用，未执行' } }
            })
          ]
    return route.fulfill({
      json: { events, has_more: after === '0', next_sequence: after === '0' ? 2 : 5 }
    })
  })
  await openPanel(page, 'trace', { resourceId: 'professional-trace', runId: 'professional-run' })
  const panel = page.getByTestId('trace-explorer')
  await expect(panel).toContainText('deepseek-test')
  await panel.getByRole('button', { name: /robot.get/ }).click()
  await expect(panel.locator('.call-detail')).toContainText('r1pro-sim-001')
  await expect(panel.locator('.call-detail')).toContainText('等待调用返回')
  await panel.getByRole('button', { name: '加载更多调用记录' }).click()
  await expect(panel.locator('.call-detail')).toContainText('current_task')
  await expect(panel).not.toContainText('不得显示的其他运行')
  await panel.getByRole('button', { name: /robot.execute/ }).click()
  await expect(panel.locator('.call-detail')).toContainText('ROBOT_BUSY')
  await expect(panel.locator('.call-detail')).toContainText('grasp-object')
  await panel.locator('.call-detail').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.output/studio-professional-trace.png' })
  await panel.getByRole('button', { name: /deepseek-test/ }).click()
  await expect(panel.locator('.call-detail')).toContainText('此记录未保存输入正文')
})
