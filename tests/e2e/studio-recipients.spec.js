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
  await page.addInitScript(() =>
    localStorage.setItem(
      'session',
      JSON.stringify({ token: 'fixture-token', user: { id: 'fixture-user', name: 'Fixture User' } })
    )
  )
  await installStudioSimulationFixture(page)
  await page.route('**/api/v1/chat/sessions/*/agents', (route) =>
    route.fulfill({
      json: {
        agents: [],
        recipients: [
          { id: 'leader', role: 'leader', status: 'idle' },
          { id: 'robot:fixture-arm', robot_id: 'fixture-arm', role: 'robot', status: 'running' },
          { id: 'query-1', role: 'query', status: 'idle' }
        ]
      }
    })
  )
  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
})

test('@ 目录搜索选择、跨 Agent 对话和历史返回保留草稿', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  const input = sidebar.getByLabel('对话消息')
  await input.fill('查看当前任务')
  await input.press('End')
  await input.press('@')
  await expect(sidebar.getByLabel('搜索 Agent')).toBeFocused()
  await sidebar.getByLabel('搜索 Agent').fill('fixture-arm')
  await expect(sidebar.getByRole('option')).toHaveCount(1)
  await sidebar.getByLabel('搜索 Agent').press('Enter')
  await expect(sidebar.getByLabel('选择接收 Agent')).toContainText('fixture-arm')
  await expect(input).toHaveValue('查看当前任务')
  await input.press('Enter')
  await expect(sidebar).toContainText('robot:fixture-arm 已收到：查看当前任务')
  await expect(sidebar.locator('.send-btn')).toHaveAttribute('title', '发送（Enter）')

  await input.fill('保留这段草稿')
  await sidebar.getByLabel('选择接收 Agent').click()
  await sidebar.getByLabel('搜索 Agent').fill('query')
  await sidebar.getByRole('option').click()
  await expect(input).toHaveValue('保留这段草稿')
  await sidebar.getByRole('button', { name: '返回对话列表' }).click()
  await sidebar.locator('.history-row').first().click()
  await expect(input).toHaveValue('保留这段草稿')
  await expect(sidebar.getByLabel('选择接收 Agent')).toContainText('query-1')
  await input.press('Enter')
  await expect(sidebar).toContainText('query-1 已收到：保留这段草稿')
  await page.screenshot({ path: '.output/studio-e2e/conversation-recipients.png' })
})

test('后台 Workflow 执行时可以发普通对话，模式不自动改变', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  const input = sidebar.getByLabel('对话消息')
  await expect(input).toBeEnabled()
  const mode = await sidebar.locator('.mode-btn').textContent()
  const work = await page.getByTestId('studio-current-work').textContent()
  await input.fill('现在做到哪一步了')
  await input.press('Enter')
  await expect(sidebar).toContainText('leader 已收到：现在做到哪一步了')
  await expect(sidebar.locator('.mode-btn')).toHaveText(mode)
  await expect(page.getByTestId('studio-current-work')).toContainText(work.trim().split('\n')[0])
})
