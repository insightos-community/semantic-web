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
    window.localStorage.setItem(
      'session',
      JSON.stringify({
        token: 'fixture-token',
        user: { id: 'fixture-user', name: 'Fixture User' },
        currentTeam: null
      })
    )
  })
})

test('Project Hub 打开 Studio，布局保存并在刷新后恢复', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.getByText('打开一个 Project')).toBeVisible()
  await expect(page.getByText('当前为 v0.2 Fixture 模式')).toBeVisible()
  await expect(page.getByText('v0.2 演示项目')).toBeVisible()

  await page.getByRole('button', { name: '打开 Studio' }).click()
  await expect(page).toHaveURL(/\/projects\/proj-v020-demo\/studio/u)
  await expect(page.locator('.studio-topbar')).toContainText('v0.2 演示项目')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await expect(
    page.getByTestId('studio-primary-sidebar').locator('.sidebar-header strong')
  ).toHaveText('项目')
  await expect(page.getByTestId('studio-conversation-sidebar')).toBeVisible()

  const primaryWidth = await page
    .getByTestId('studio-primary-sidebar')
    .evaluate((node) => Math.round(node.getBoundingClientRect().width))
  const conversationWidth = await page
    .getByTestId('studio-conversation-sidebar')
    .evaluate((node) => Math.round(node.getBoundingClientRect().width))
  expect(primaryWidth).toBeGreaterThanOrEqual(275)
  expect(primaryWidth).toBeLessThanOrEqual(285)
  expect(conversationWidth).toBeGreaterThanOrEqual(415)
  expect(conversationWidth).toBeLessThanOrEqual(425)

  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(window.localStorage).some((key) =>
          key.startsWith('semantic-studio:layout:v2:proj-v020-demo:default')
        )
      )
    )
    .toBe(true)

  const primarySeparator = page.getByRole('separator', { name: '调整主侧栏宽度' })
  const separatorBox = await primarySeparator.boundingBox()
  expect(separatorBox).not.toBeNull()
  await page.mouse.move(separatorBox.x + 2, separatorBox.y + 40)
  await page.mouse.down()
  await page.mouse.move(separatorBox.x + 42, separatorBox.y + 40, { steps: 4 })
  await page.mouse.up()
  await expect
    .poll(() =>
      page
        .getByTestId('studio-primary-sidebar')
        .evaluate((node) => Math.round(node.getBoundingClientRect().width))
    )
    .toBeGreaterThanOrEqual(315)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = window.localStorage.getItem(
          'semantic-studio:layout:v2:proj-v020-demo:default'
        )
        return saved ? JSON.parse(saved).shell.primaryWidth : 0
      })
    )
    .toBeGreaterThanOrEqual(315)

  await page.reload()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
  await expect
    .poll(() =>
      page
        .getByTestId('studio-primary-sidebar')
        .evaluate((node) => Math.round(node.getBoundingClientRect().width))
    )
    .toBeGreaterThanOrEqual(315)
})

test('Memory 明确编辑保存，区域按钮只改变对应工作区', async ({ page }) => {
  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')

  await page.getByRole('button', { name: /Project Memory/u }).click()
  const editor = page.getByLabel('Project Memory Markdown')
  await expect(editor).toBeVisible()
  const revisionLabel = page.locator('.memory-panel .actions > span')
  const beforeRevision = Number((await revisionLabel.textContent())?.match(/\d+/u)?.[0] || 0)
  await editor.fill('# Project Memory\n\n- E2E 明确保存。\n')
  await page.locator('.memory-panel').getByRole('button', { name: '保存', exact: true }).click()
  await expect(revisionLabel).toHaveText(`revision ${beforeRevision + 1}`)

  await page.getByLabel('切换底部面板').click()
  await expect(page.getByTestId('studio-bottom-panel')).toBeVisible()
  await expect(
    page.getByTestId('studio-bottom-panel').getByRole('tab', { name: '过程', exact: true })
  ).toBeVisible()
  await page.getByLabel('切换底部面板').click()
  await expect(page.getByTestId('studio-bottom-panel')).toHaveCount(0)

  await page.locator('.activity-bar').getByTitle('运行', { exact: true }).click()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('流程记录')
  await expect(page.locator('.dv-tab').filter({ hasText: 'Runs' })).toHaveCount(0)
})

test('Conversation 归档后仍可从已归档列表只读查看', async ({ page }) => {
  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')

  await page.getByRole('tab', { name: '对话', exact: true }).click()
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(sidebar.locator('.conversation-title')).toHaveText('新对话')
  await sidebar.getByRole('button', { name: '选择历史对话', exact: true }).click()
  const picker = sidebar.getByRole('dialog', { name: '选择对话', exact: true })
  await picker.getByRole('textbox', { name: '搜索对话', exact: true }).fill('新对话')
  const newConversation = picker.locator('.history-row').filter({ hasText: '新对话' }).first()
  await expect(newConversation).toBeVisible()
  const conversationId = await newConversation.getAttribute('data-conversation-id')
  expect(conversationId).toBeTruthy()
  const row = picker.locator('.history-item').filter({
    has: page.locator(`.history-row[data-conversation-id="${conversationId}"]`)
  })
  await row.hover()
  await row.getByRole('button', { name: '归档 新对话', exact: true }).click()
  await page
    .getByRole('dialog', { name: '归档对话', exact: true })
    .getByRole('button', { name: '归档', exact: true })
    .click()

  await expect(picker).not.toBeVisible()
  await sidebar.getByRole('button', { name: '选择历史对话', exact: true }).click()
  await picker.getByRole('tab', { name: '已归档', exact: true }).click()
  const archived = picker.locator(`.history-row[data-conversation-id="${conversationId}"]`)
  await expect(picker.locator('.history-row')).toHaveCount(1)
  await expect(archived).toBeVisible()
  await archived.click()
  await expect(
    page.locator('.conversation-heading .conversation-state').filter({ hasText: '已归档' })
  ).toHaveText('已归档')
  await expect(page.locator('.conversation-panel textarea')).toBeDisabled()
  await expect(page.locator('.conversation-panel textarea')).toHaveAttribute(
    'placeholder',
    '已归档 · 只读'
  )
})
