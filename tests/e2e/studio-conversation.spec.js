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

const restoredChoice = {
  id: 'interaction-restored-choice',
  project_id: 'proj-v020-demo',
  conversation_id: 'conv-v020-demo',
  run_id: 'run-v020-004',
  type: 'single_select',
  ui_kind: 'single_select',
  status: 'pending',
  resource_revision: 3,
  source_revision: 7,
  question: '请确认本轮目标托盘列',
  candidates: [
    { value: 'column-a', label: '目标 A 列' },
    { value: 'column-b', label: '目标 B 列' }
  ],
  response_schema: {
    type: 'object',
    required: ['target_column'],
    properties: {
      target_column: { type: 'string', enum: ['column-a', 'column-b'] }
    }
  },
  created_at: '2026-08-08T08:04:01Z'
}

test('Snapshot 已有待答选择：刷新与历史打开都恢复侧栏唯一问题卡', async ({ page }) => {
  // 仅替换 fixture 的 Snapshot 数据，不注入消息行。保留真实 bootstrap →
  // interaction hydrate → Conversation REST 恢复顺序，刷新后仍重复同一路径。
  await page.route('**/src/fixtures/studioFixture.js', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `\n
      const snapshotBeforeInteractionTest = studioFixture.getSnapshot.bind(studioFixture);
      studioFixture.getSnapshot = async (...args) => {
        const response = await snapshotBeforeInteractionTest(...args);
        response.snapshot.pending_interactions.push(${JSON.stringify(restoredChoice)});
        return response;
      };
    `
    })
  })
  await page.reload()
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  const card = sidebar.locator('#interaction-interaction-restored-choice')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('请确认本轮目标托盘列')
  await expect(card.getByRole('radio', { name: '目标 A 列' })).toBeVisible()
  await expect(card.getByRole('radio', { name: '目标 B 列' })).toBeVisible()
  await card.locator('label.el-radio').filter({ hasText: '目标 B 列' }).click()
  await expect(card.getByRole('button', { name: '提交选择' })).toBeEnabled()
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(card).toHaveCount(0)
  await sidebar.getByRole('button', { name: '选择历史对话', exact: true }).click()
  await sidebar
    .getByRole('dialog', { name: '选择对话', exact: true })
    .locator('[data-conversation-id="conv-v020-demo"]')
    .click()
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('请确认本轮目标托盘列')
  await page.reload()
  await expect(card).toHaveCount(1)
  await expect(card.getByRole('radio', { name: '目标 A 列' })).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.output/studio-e2e/interaction-question-restored.png' })
})

test('实时 interaction.ask 事件在侧栏插入完整选择卡，重复事件不增加卡片', async ({ page }) => {
  await page.evaluate(
    async (choice) => {
      const { createStudioSubscription } = await import('/src/studio/subscription.js')
      const subscription = createStudioSubscription({
        projectId: 'proj-v020-demo',
        afterSequence: 10
      })
      const event = {
        id: 'evt-live-choice',
        project_id: 'proj-v020-demo',
        conversation_id: 'conv-v020-demo',
        resource_type: 'interaction',
        resource_id: choice.id,
        resource_revision: 3,
        sequence: 11,
        type: 'interaction.requested',
        occurred_at: choice.created_at,
        payload: { ...choice, interaction_id: choice.id }
      }
      subscription.applyEvent(event)
      subscription.applyEvent(event)
    },
    { ...restoredChoice, id: 'interaction-live-choice' }
  )
  const card = page
    .getByTestId('studio-conversation-sidebar')
    .locator('#interaction-interaction-live-choice')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('请确认本轮目标托盘列')
  await expect(card.getByRole('radio', { name: '目标 B 列' })).toBeVisible()
  await expect(card.getByRole('button', { name: '提交选择' })).toBeDisabled()
})

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

async function showHistory(page) {
  await page.getByRole('button', { name: '选择历史对话' }).click()
  await page
    .getByRole('dialog', { name: '选择对话' })
    .getByRole('button', { name: '查看全部历史' })
    .click()
}

test('面板内历史搜索、取消保留草稿，正文可返回会话列表', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  const tabs = await page.locator('.studio-tab').count()
  const currentWork = await page.getByTestId('studio-current-work').textContent()
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(sidebar.getByRole('button', { name: '返回对话列表' })).toBeVisible()
  await sidebar.getByLabel('对话消息').fill('第一份草稿')
  await sidebar.getByRole('button', { name: '选择对话', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择对话' })
  expect(
    await picker.evaluate((node) =>
      Boolean(node.closest('[data-testid="studio-conversation-sidebar"]'))
    )
  ).toBe(true)
  const area = await sidebar.boundingBox()
  const popup = await picker.boundingBox()
  expect(popup.x).toBeGreaterThanOrEqual(area.x)
  expect(popup.x + popup.width).toBeLessThanOrEqual(area.x + area.width)
  await expect(page.locator('.el-overlay:visible')).toHaveCount(0)
  await expect(picker.locator('.history-row').first()).toContainText('新对话')
  await picker.getByLabel('搜索对话').fill('不存在的对话')
  await expect(picker).toContainText('未找到匹配的对话')
  await page.keyboard.press('Escape')
  await expect(sidebar.getByRole('button', { name: '选择对话', exact: true })).toBeFocused()
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('第一份草稿')

  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('')
  await sidebar.getByLabel('对话消息').fill('第二份草稿')
  await sidebar.getByRole('button', { name: '返回对话列表' }).click()
  await expect(sidebar.getByRole('button', { name: /返回|反馈/ })).toHaveCount(0)
  await expect(sidebar.getByLabel('对话消息')).not.toBeVisible()
  await sidebar.getByLabel('搜索对话').fill('新对话')
  await expect(sidebar.locator('.history-row')).toHaveCount(2)
  await sidebar.locator('.history-row').nth(1).click()
  await expect(sidebar.getByRole('button', { name: '返回对话列表' })).toBeVisible()
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('第一份草稿')
  await expect(page.locator('.studio-tab')).toHaveCount(tabs)
  await expect(page.getByTestId('studio-current-work')).toBeVisible()
  await expect(page.getByTestId('studio-current-work')).toHaveText(currentWork)
})

test('历史包含可搜索的已归档对话，选择后只读展示', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  const archiveRow = sidebar
    .getByRole('dialog', { name: '选择对话' })
    .locator('.history-item')
    .first()
  await archiveRow.hover()
  await archiveRow.getByRole('button', { name: '归档 新对话' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '归档', exact: true }).click()
  await showHistory(page)
  await sidebar.getByRole('tab', { name: '已归档', exact: true }).click()
  await expect(sidebar.locator('.history-row')).toHaveCount(1)
  await sidebar.locator('.history-row').click()
  await expect(sidebar.locator('.conversation-state')).toHaveText('已归档')
  await expect(sidebar.getByLabel('对话消息')).toBeDisabled()
  await expect(sidebar.locator('.send-btn')).toBeDisabled()
})

test('归档仅在会话行悬停或聚焦时出现，取消保留草稿，确认后只读', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByLabel('对话消息').fill('归档不丢草稿')
  await expect(
    sidebar.locator('.conversation-heading').getByRole('button', { name: /归档/ })
  ).toHaveCount(0)
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  const picker = page.getByRole('dialog', { name: '选择对话' })
  const row = picker.locator('.history-item').first()
  const archive = row.getByRole('button', { name: '归档 新对话', exact: true })
  await expect(archive).toHaveCSS('opacity', '0')
  await row.hover()
  await expect(archive).toHaveCSS('opacity', '1')
  await picker.getByLabel('搜索对话').hover()
  await expect(archive).toHaveCSS('opacity', '0')
  await picker.getByLabel('搜索对话').focus()
  await page.keyboard.press('ArrowDown')
  await expect(row.locator('.history-row')).toBeFocused()
  await expect(archive).toHaveCSS('opacity', '1')
  await page.keyboard.press('Tab')
  await expect(archive).toBeFocused()
  await page.keyboard.press('Enter')
  await page
    .getByRole('dialog', { name: '归档对话' })
    .getByRole('button', { name: '取消', exact: true })
    .click()
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('归档不丢草稿')
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  await row.hover()
  await archive.click()
  await page
    .getByRole('dialog', { name: '归档对话' })
    .getByRole('button', { name: '归档', exact: true })
    .click()
  await expect(sidebar.locator('.conversation-state')).toHaveText('已归档')
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('归档不丢草稿')
  await expect(sidebar.getByLabel('对话消息')).toBeDisabled()
  await expect(sidebar.getByRole('button', { name: '归档当前对话' })).toHaveCount(0)
  await sidebar.getByRole('button', { name: '返回对话列表' }).click()
  await sidebar.getByRole('tab', { name: '已归档', exact: true }).click()
  await expect(sidebar.locator('.history-row')).toHaveCount(1)
  await page.screenshot({ path: '.output/studio-e2e/conversation-archive-history.png' })
})

test('完整历史和快捷历史都可归档，不会打开另一段对话', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByRole('button', { name: '返回对话列表' }).click()
  const row = sidebar.locator('.history-item').first()
  await expect(row.locator('.history-archive')).toHaveCSS('opacity', '0')
  await row.hover()
  await expect(row.locator('.history-archive')).toHaveCSS('opacity', '1')
  await sidebar.getByRole('button', { name: '归档 新对话', exact: true }).click()
  await page
    .getByRole('dialog', { name: '归档对话' })
    .getByRole('button', { name: '归档', exact: true })
    .click()
  await expect(sidebar.getByRole('heading', { name: '对话历史', exact: true })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: '归档 新对话', exact: true })).toHaveCount(0)
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  const picker = page.getByRole('dialog', { name: '选择对话' })
  await picker.locator('.history-row').first().hover()
  await expect(picker.getByRole('button', { name: '归档 新对话', exact: true })).toBeVisible()
  await page.screenshot({ path: '.output/studio-e2e/conversation-archive-picker.png' })
  await picker.getByRole('button', { name: '归档 新对话', exact: true }).click()
  await page
    .getByRole('dialog', { name: '归档对话' })
    .getByRole('button', { name: '归档', exact: true })
    .click()
  await expect(sidebar.locator('.conversation-state')).toHaveText('已归档')
})

test('有活动工作时归档失败保留会话和草稿，不停止工作', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  const work = await page.getByTestId('studio-current-work').textContent()
  await sidebar.getByLabel('对话消息').fill('活动工作期间的草稿')
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  const picker = page.getByRole('dialog', { name: '选择对话' })
  await picker.locator('.history-row').first().hover()
  await picker.locator('.history-archive').first().click()
  await page
    .getByRole('dialog', { name: '归档对话' })
    .getByRole('button', { name: '归档', exact: true })
    .click()
  await expect(
    page.getByText('请先结束当前运行并处理待回复请求，再归档 Conversation', { exact: true })
  ).toBeVisible()
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('活动工作期间的草稿')
  await expect(sidebar.locator('.conversation-state')).not.toHaveText('已归档')
  await expect(page.getByTestId('studio-current-work')).toHaveText(work)
})

test('历史页与快捷历史使用同一个归档图标，仅随本行悬停或聚焦显示', async ({ page }) => {
  await showHistory(page)
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  const item = sidebar.locator('.history-item').first()
  const archive = item.locator('.history-archive')
  await expect(archive).toHaveCSS('opacity', '0')
  await item.hover()
  await expect(archive).toHaveCSS('opacity', '1')
  const icon = await archive.locator('svg').innerHTML()
  await page.locator('.activity-bar').hover()
  await expect(archive).toHaveCSS('opacity', '0')
  await item.locator('.history-row').focus()
  await expect(archive).toHaveCSS('opacity', '1')
  await page.keyboard.press('Tab')
  await expect(archive).toBeFocused()
  await page.getByRole('button', { name: '选择历史对话' }).click()
  const historyIcon = page
    .getByRole('dialog', { name: '选择对话' })
    .locator('.history-archive svg')
    .first()
  await expect(historyIcon).toHaveJSProperty('innerHTML', icon)
})

// 内容直接注入 fixture 的浏览器 store，覆盖长引用、思考、代码和工具卡；
// 这里只验收呈现和导航，不把模拟回复当作 DeepSeek / Robot 执行证据。
async function sampleMessages(page) {
  await page
    .getByTestId('studio-conversation-sidebar')
    .getByRole('button', { name: '新建对话', exact: true })
    .click()
  await page.evaluate(async () => {
    const { useChatStore } = await import('/src/stores/chat.js')
    const { useConversationStore } = await import('/src/stores/conversation.js')
    const chat = useChatStore()
    const conversation = useConversationStore()
    conversation.upsert({ ...conversation.current, title: 'layout001 · 一层周转箱拆垛' })
    chat.messagesBySession[chat.currentSessionId] = {
      loaded: true,
      earliestPage: 1,
      total: 3,
      list: [
        {
          id: 'user-layout',
          role: 'user',
          text: '检查 layout001 的箱体和目标托盘，生成可审阅的搬运计划。',
          ts: Date.now(),
          status: 'done'
        },
        {
          id: 'activity-layout',
          role: 'assistant',
          agentRole: 'system',
          systemActivity: true,
          text:
            '已读取当前场景，Robot r1_pro_tote_gripper-1 在线。来源和目标引用：component://' +
            'very-long-stable-object-reference-'.repeat(6),
          activity: { taskId: 'fixture-task' },
          ts: Date.now(),
          status: 'done'
        },
        {
          id: 'agent-layout',
          role: 'assistant',
          agentRole: 'leader',
          text:
            '已识别 **4 个顶层箱体**，按对应目标列规划搬运。\n\n| 对象 | 目标列 |\n| --- | --- |\n| tote-large-l3-r1-c1 | pallet-b-slot-r1-c1 |\n\n```json\n{"object_ref":"' +
            'stable-reference-'.repeat(12) +
            '"}\n```\n\n计划准备好后，可查看详情并批准执行。',
          reasoning: '先读取当前 Map，确认可访问的顶层箱体，再核对目标列。'.repeat(50),
          toolCalls: [
            {
              id: 'query-1',
              name: 'map_query',
              status: 'done',
              args: { map_id: 'simulation_map' },
              result: { count: 4 }
            }
          ],
          ts: Date.now(),
          status: 'streaming'
        }
      ]
    }
  })
}

test('Inspector 后台刷新不抢对话，取消或无属性对象自动关闭', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByLabel('对话消息').fill('保留这份输入')
  const selectResource = (resource) =>
    page.evaluate(async (resource) => {
      const { useLayoutStore } = await import('/src/stores/layout.js')
      useLayoutStore().select(resource)
    }, resource)
  await selectResource({ resourceType: 'trace', resourceId: 'trace-fixture', title: '调试记录' })
  const tools = page.getByTestId('studio-tools-sidebar')
  await expect(tools.getByRole('tab', { name: 'Inspector', exact: true })).toBeVisible()
  await expect(sidebar).toBeVisible()
  await expect(page.getByTestId('studio-bottom-panel')).toHaveCount(0)
  await tools.getByRole('tab', { name: 'Inspector', exact: true }).click()
  await expect(page.getByTestId('studio-context-inspector')).toContainText('调试记录')
  await expect(sidebar).not.toBeVisible()
  await selectResource({ resourceType: 'trace', resourceId: 'trace-second', title: '第二条记录' })
  await expect(tools.getByRole('tab')).toHaveCount(2)
  await expect(page.getByTestId('studio-context-inspector')).toContainText('第二条记录')
  await selectResource({ resourceType: 'agents', resourceId: '', title: 'Agent 列表' })
  await expect(tools.getByRole('tab', { name: 'Inspector', exact: true })).toHaveCount(0)
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('保留这份输入')
  await selectResource({ resourceType: 'trace', resourceId: 'trace-third' })
  await tools.getByRole('tab', { name: 'Inspector', exact: true }).click()
  await selectResource(null)
  await expect(tools.getByRole('tab', { name: 'Inspector', exact: true })).toHaveCount(0)
  await expect(sidebar).toBeVisible()
})

test('对话最大化、移入中央与其他 Tab 并存，保持唯一实例和草稿', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByLabel('对话消息').fill('移动和最大化都保留')
  await sidebar.getByLabel('对话消息').evaluate((node) => {
    window.__conversationInput = node
  })
  const originalWidth = (await sidebar.boundingBox()).width
  await sidebar.getByRole('button', { name: '最大化对话' }).click()
  await expect(page.getByTestId('maximized-conversation')).toBeVisible()
  expect((await sidebar.boundingBox()).width).toBeGreaterThan(originalWidth + 200)
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  await expect(page.getByRole('dialog', { name: '选择对话' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '选择对话' }).getByLabel('搜索对话')).toBeFocused()
  await page.screenshot({
    path: '.output/studio-e2e/conversation-maximized-picker.png',
    animations: 'disabled'
  })
  await page.keyboard.press('Escape')
  await sidebar.getByRole('button', { name: '恢复对话窗口' }).click()
  await expect(page.getByTestId('maximized-conversation')).not.toBeVisible()
  expect((await sidebar.boundingBox()).width).toBeCloseTo(originalWidth, 0)
  await sidebar.getByRole('button', { name: '移动对话' }).click()
  await page.getByRole('menuitem', { name: '移至中央工作区' }).click()
  await expect(
    page.getByTestId('conversation-editor-host').getByTestId('studio-conversation-sidebar')
  ).toBeVisible()
  await expect(page.locator('.studio-tab')).toHaveCount(2)
  await page.screenshot({ path: '.output/studio-e2e/conversation-editor-tabs.png' })
  await page.locator('.studio-tab').filter({ hasText: '场景' }).click()
  await expect(sidebar).not.toBeVisible()
  await page.locator('.studio-tab').filter({ hasText: '对话' }).click()
  await expect(sidebar.getByLabel('对话消息')).toHaveValue('移动和最大化都保留')
  expect(
    await sidebar.getByLabel('对话消息').evaluate((node) => node === window.__conversationInput)
  ).toBe(true)
  await sidebar.getByRole('button', { name: '移动对话' }).click()
  await page.getByRole('menuitem', { name: '移至右侧工具区' }).click()
  await expect(
    page.getByTestId('studio-tools-sidebar').getByTestId('studio-conversation-sidebar')
  ).toBeVisible()
  await expect(page.locator('.studio-tab')).toHaveCount(1)
  await expect(sidebar).toHaveCount(1)
  expect(
    await sidebar.getByLabel('对话消息').evaluate((node) => node === window.__conversationInput)
  ).toBe(true)
  await sidebar.screenshot({ path: '.output/studio-e2e/conversation-restored.png' })
})

test('阅读长消息时切换 Inspector 和最大化，恢复原阅读位置', async ({ page }) => {
  await sampleMessages(page)
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await page.evaluate(async () => {
    const { useChatStore } = await import('/src/stores/chat.js')
    const chat = useChatStore()
    chat.messagesBySession[chat.currentSessionId].list.push({
      id: 'long-read',
      role: 'assistant',
      status: 'done',
      text: Array.from(
        { length: 80 },
        (_, i) => '第 ' + i + ' 条运行记录：这是用于检查滚动位置的内容。'
      ).join('\n\n'),
      ts: Date.now()
    })
  })
  const stream = sidebar.locator('.message-stream')
  await expect(sidebar).toContainText('第 79 条运行记录')
  await stream.evaluate((node) => {
    node.style.scrollBehavior = 'auto'
    node.scrollTop = 200
    node.dispatchEvent(new Event('scroll'))
  })
  await page.evaluate(async () => {
    const { useLayoutStore } = await import('/src/stores/layout.js')
    useLayoutStore().select({ resourceType: 'trace', resourceId: 'trace-read' })
  })
  const tabs = page.getByTestId('studio-tools-sidebar')
  await tabs.getByRole('tab', { name: 'Inspector', exact: true }).click()
  await tabs.getByRole('tab', { name: '对话', exact: true }).click()
  await expect.poll(() => stream.evaluate((node) => node.scrollTop)).toBeCloseTo(200, 0)
  await sidebar.getByRole('button', { name: '最大化对话' }).click()
  await sidebar.getByRole('button', { name: '恢复对话窗口' }).click()
  await expect.poll(() => stream.evaluate((node) => node.scrollTop)).toBeCloseTo(200, 0)
})

test('中央对话 Tab 刷新恢复，历史弹窗支持搜索后键盘选择', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '移动对话' }).click()
  await page.getByRole('menuitem', { name: '移至中央工作区' }).click()
  await expect(page.getByTestId('conversation-editor-host')).toBeVisible()
  await page.reload()
  await expect(
    page.getByTestId('conversation-editor-host').getByTestId('studio-conversation-sidebar')
  ).toBeVisible()
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  const picker = page.getByRole('dialog', { name: '选择对话' })
  await picker.getByLabel('搜索对话').fill('检查工具')
  await picker.getByLabel('搜索对话').press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(picker).not.toBeVisible()
  await expect(sidebar.locator('.conversation-title')).toContainText('检查工具运行链')
})

test('历史浮层不阻挡工作区，点击左侧导航自动退出对话全屏', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  const navigation = page.locator('.activity-bar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByLabel('对话消息').fill('退出全屏后仍保留')
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  await navigation.getByTitle('场景', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: '选择对话' })).not.toBeVisible()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('项目场景')
  // 包含当前已选中的活动栏；全屏退出后必须展开它，不能误当作第二次点击而收起。
  for (const title of ['场景', '项目', 'Agents', '运行', '设备']) {
    await sidebar.getByRole('button', { name: '最大化对话' }).click()
    await navigation.getByTitle(title, { exact: true }).click()
    await expect(page.getByTestId('maximized-conversation')).not.toBeVisible()
    await expect(page.getByTestId('studio-primary-sidebar')).toBeVisible()
    await expect(navigation.getByTitle(title, { exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(sidebar.getByLabel('对话消息')).toHaveValue('退出全屏后仍保留')
  }
  await sidebar.getByRole('button', { name: '最大化对话' }).click()
  await navigation.getByTitle('当前 Project 设置').click()
  await expect(page.getByTestId('maximized-conversation')).not.toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await sidebar.getByRole('button', { name: '最大化对话' }).click()
  await page.getByRole('button', { name: '场景', exact: true }).click()
  await expect(page.getByTestId('maximized-conversation')).not.toBeVisible()
  await expect(page.getByTestId('scene-workspace')).toBeVisible()
})

test('短对话面板中的长历史列表内部滚动，返回入口保留历史筛选', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await sidebar.getByRole('button', { name: '新建对话', exact: true }).click()
  await sidebar.getByRole('button', { name: '选择历史对话' }).click()
  const picker = sidebar.getByRole('dialog', { name: '选择对话' })
  await expect(picker.getByLabel('搜索对话')).toBeFocused()
  await expect(picker.locator('.history-row')).toHaveCount(2)
  await page.evaluate(async () => {
    const { useConversationStore } = await import('/src/stores/conversation.js')
    const store = useConversationStore()
    for (let i = 0; i < 30; i++) {
      store.upsert({
        id: `history-scroll-${i}`,
        project_id: store.projectId,
        title: `长列表测试 ${i}`,
        created_at: new Date().toISOString()
      })
    }
  })
  await expect(picker.locator('.history-row')).toHaveCount(32)
  const area = await sidebar.boundingBox()
  const bounds = await picker.boundingBox()
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height)
  expect(
    await picker.locator('.history-list').evaluate((node) => node.scrollHeight > node.clientHeight)
  ).toBe(true)
  await expect(picker.getByRole('button', { name: '查看全部历史' })).toBeInViewport()
  await picker.getByRole('button', { name: '查看全部历史' }).click()
  await sidebar.getByLabel('搜索对话').fill('检查工具')
  await sidebar.locator('.history-row').click()
  await sidebar.getByRole('button', { name: '返回对话列表' }).click()
  await expect(sidebar.getByLabel('搜索对话')).toHaveValue('检查工具')
})

test('历史页与 Inspector 切换保留搜索条件，关闭对话后可重新打开', async ({ page }) => {
  const sidebar = page.getByTestId('studio-conversation-sidebar')
  await showHistory(page)
  await sidebar.getByLabel('搜索对话').fill('检查')
  await page.evaluate(async () => {
    const { useLayoutStore } = await import('/src/stores/layout.js')
    useLayoutStore().select({ resourceType: 'trace', resourceId: 'trace-history' })
  })
  const tools = page.getByTestId('studio-tools-sidebar')
  await tools.getByRole('tab', { name: 'Inspector', exact: true }).click()
  await tools.getByRole('tab', { name: '对话', exact: true }).click()
  await expect(sidebar.getByLabel('搜索对话')).toHaveValue('检查')
  await expect(sidebar.getByRole('button', { name: /返回|反馈/ })).toHaveCount(0)
  await tools.getByRole('button', { name: '关闭当前组件' }).click()
  await expect(sidebar).not.toBeVisible()
  await page.getByRole('button', { name: '打开对话', exact: true }).click()
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByLabel('搜索对话')).toHaveValue('检查')
})

for (const uiKind of ['single_select', 'multi_select']) {
  for (const width of [320, 420, 640]) {
    test(`Interaction 长选项 ${uiKind} ${width}px：换行、对齐且不撑宽气泡`, async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 1000 })
      await sampleMessages(page)
      await page.evaluate(
        async ({ width, uiKind }) => {
          const { useChatStore } = await import('/src/stores/chat.js')
          const { useInteractionsStore } = await import('/src/stores/interactions.js')
          const { useLayoutStore } = await import('/src/stores/layout.js')
          const chat = useChatStore()
          useLayoutStore().updateShell({ secondaryWidth: width })
          useInteractionsStore().hydrate('proj-v020-demo', [
            {
              id: 'long-choice',
              ui_kind: uiKind,
              status: 'pending',
              agent_name: 'leader',
              conversation_id: chat.currentSessionId,
              question: '请确认本轮执行针对的场景状态（决定搬哪一层、放到目标托盘的哪一层）',
              allow_other: true,
              options: [
                {
                  value: 'reset',
                  label:
                    '场景已重置：pallet-a 仍满载 3 层，本次把当前最上层 l3 的 4 个周转箱搬到目标托盘 pallet-b 的对应槽位。'
                },
                {
                  value: 'continue',
                  label: '延续上一轮：pallet-a 最上层现为 l2，搬到 pallet-b 对应列。'
                },
                { value: 'reference', label: 'component://' + 'very-long-reference-'.repeat(12) }
              ]
            }
          ])
          chat.messagesBySession[chat.currentSessionId].list = [
            {
              id: 'long-choice-message',
              channel: 'interaction',
              interactionId: 'long-choice',
              role: 'assistant',
              agentRole: 'leader',
              agentName: 'leader',
              ts: Date.now(),
              status: 'done'
            }
          ]
        },
        { width, uiKind }
      )
      const sidebar = page.getByTestId('studio-conversation-sidebar')
      const card = sidebar.locator('#interaction-long-choice')
      await expect(card).toBeVisible()
      const choices = card.locator(uiKind === 'single_select' ? '.el-radio' : '.el-checkbox')
      await expect(choices).toHaveCount(3)
      await choices.first().click()
      await expect(choices.first()).toHaveClass(/is-checked/u)
      await expect(card.getByRole('button', { name: '提交选择' })).toBeEnabled()
      const metrics = await card.evaluate((el) => {
        const options = [...el.querySelectorAll('.el-radio, .el-checkbox')]
        return {
          overflow: [
            el,
            el.closest('.row-body'),
            el.closest('.row-main'),
            el.closest('.message-stream'),
            ...options
          ].map((node) => node.scrollWidth - node.clientWidth),
          starts: options.map((node) => node.getBoundingClientRect().left),
          widths: options.map((node) => node.getBoundingClientRect().width),
          wraps: [...el.querySelectorAll('.el-radio__label, .el-checkbox__label')].map(
            (node) =>
              node.getBoundingClientRect().height > parseFloat(getComputedStyle(node).lineHeight)
          )
        }
      })
      expect(metrics.overflow.every((value) => value <= 1)).toBe(true)
      expect(Math.max(...metrics.starts) - Math.min(...metrics.starts)).toBeLessThan(1)
      expect(Math.max(...metrics.widths) - Math.min(...metrics.widths)).toBeLessThan(1)
      expect(metrics.wraps[0]).toBe(true)
      expect(metrics.wraps[2]).toBe(true)
    })
  }
}

for (const width of [320, 420, 640]) {
  test(`侧栏 ${width}px：正文和输入不横向溢出，思考可展开`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await sampleMessages(page)
    await page.evaluate(async (width) => {
      const { useLayoutStore } = await import('/src/stores/layout.js')
      useLayoutStore().updateShell({ secondaryWidth: width })
    }, width)
    const sidebar = page.getByTestId('studio-conversation-sidebar')
    await expect(sidebar.locator('.reasoning-block')).toHaveAttribute('open')
    await sidebar.locator('.reasoning-block summary').click()
    await expect(sidebar.locator('.reasoning-block')).not.toHaveAttribute('open')
    const dimensions = await sidebar.evaluate((el) => {
      const query = (selector) => el.querySelector(selector)
      return {
        width: el.clientWidth,
        overflow: [
          el,
          query('.message-stream'),
          query('.message-stream-inner'),
          query('.prompt-input')
        ].map((node) => node.scrollWidth - node.clientWidth),
        inputWidth: query('textarea').getBoundingClientRect().width,
        font: getComputedStyle(query('.bubble-text')).fontSize,
        inputFont: getComputedStyle(query('textarea')).fontSize,
        timestampFont: getComputedStyle(query('.row-time')).fontSize,
        inputBottom: query('textarea').getBoundingClientRect().bottom,
        toolbarTop: query('.send-btn').getBoundingClientRect().top
      }
    })
    expect(dimensions.overflow.every((value) => value <= 1)).toBe(true)
    expect(dimensions.inputWidth).toBeGreaterThan(dimensions.width - 60)
    expect(dimensions.font).toBe('14px')
    expect(dimensions.inputFont).toBe('14px')
    expect(dimensions.timestampFont).toBe('12px')
    expect(dimensions.toolbarTop).toBeGreaterThanOrEqual(dimensions.inputBottom)
    await sidebar.screenshot({ path: `.output/studio-e2e/conversation-${width}.png` })
    await page.getByLabel('切换主题').click()
    await sidebar.screenshot({ path: `.output/studio-e2e/conversation-dark-${width}.png` })
    await sidebar.getByRole('button', { name: '选择历史对话' }).click()
    const picker = sidebar.getByRole('dialog', { name: '选择对话' })
    await expect(picker.getByLabel('搜索对话')).toBeFocused()
    const bounds = await picker.boundingBox()
    const area = await sidebar.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(area.x)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height)
    await sidebar.screenshot({ path: `.output/studio-e2e/conversation-picker-${width}.png` })
    await page.keyboard.press('Escape')
    await sidebar.locator('.reasoning-block summary').click()
    await expect(sidebar.locator('.reasoning-block')).toHaveAttribute('open')
    await showHistory(page)
    await expect(sidebar.locator('.history-row').first()).toContainText('新对话')
    await sidebar.screenshot({ path: `.output/studio-e2e/conversation-history-${width}.png` })
  })
}
