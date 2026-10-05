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
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { installStudioSimulationFixture } from './helpers/studioSimulation'
import { recordedPlaceEvidence } from '../fixtures/studioRecordedEvidence'

// 本文件只验证浏览器记录链路。PNG 是测试响应，不计入 Robot 物理验收证据。
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNksAAAAASUVORK5CYII=',
  'base64'
)

test.beforeEach(async ({ page }) => {
  await installStudioSimulationFixture(page)
  await page.route('**/api/v1/chat/artifacts/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: png })
  )
  await page.route('**/api/v1/traces/**/spans', (route) => route.fulfill({ json: { spans: [] } }))
  await page.route('**/api/v1/skills', (route) => route.fulfill({ json: { skills: [] } }))
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
  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
  await page.addScriptTag({
    type: 'module',
    content: `
    import { deviceFixture } from '/src/fixtures/deviceFixture.js';
    import { studioFixture } from '/src/fixtures/studioFixture.js';
    window.__evidenceFixture = deviceFixture;
    window.__evidenceStudioFixture = studioFixture;
  `
  })
  await page.waitForFunction(() => Boolean(window.__evidenceFixture))
  await page.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const robots = pinia._s.get('robotExecutions')
    const layout = pinia._s.get('studioLayout')
    const scope = pinia._s.get('executionScope')
    const deviceFixture = window.__evidenceFixture
    const execution = {
      id: 'evidence-browser-run',
      project_id: 'proj-v020-demo',
      robot_id: 'fixture-robot',
      skill_name: '浏览器证据测试',
      skill_version: 'test',
      status: 'failed',
      stage: 'grasp',
      revision: 100,
      created_at: '2026-09-07T01:00:00Z',
      updated_at: '2026-09-07T01:01:00Z',
      input: { target: { object_ref: 'test-object' } },
      result: { placed: false },
      artifact_refs: ['artifact://browser-test-image'],
      artifact_sync: [
        {
          server_artifact_id: 'browser-test-image',
          status: 'synced',
          media_type: 'image/png',
          summary: '测试阶段采样',
          size_bytes: 68
        }
      ]
    }
    const events = [
      {
        execution_id: execution.id,
        sequence: 1,
        type: 'stage.started',
        created_at: '2026-09-07T01:00:00Z',
        payload: { stage: 'grasp', summary: '抓取测试阶段' }
      },
      ...Array.from({ length: 600 }, (_, index) => ({
        execution_id: execution.id,
        sequence: index + 2,
        type: 'feedback.emitted',
        payload: {
          stage: 'grasp',
          action_id: 'grasp-action',
          feedback: { sequence: index + 2, phase: 'running', message: `连续反馈 ${index + 1}` }
        }
      })),
      {
        execution_id: execution.id,
        sequence: 602,
        type: 'observation.emitted',
        created_at: '2026-09-07T01:00:59Z',
        payload: {
          stage: 'grasp',
          observation: {
            id: 'test-observation',
            type: 'rgb',
            artifact_refs: ['artifact://browser-test-image'],
            value: { grip_force_n: 18.5 }
          }
        }
      },
      {
        execution_id: execution.id,
        sequence: 603,
        type: 'stage.failed',
        payload: {
          stage: 'grasp',
          error: { message: '测试原始错误全文', diagnostic: '定位字段：工具接触不足' },
          summary: '抓取测试失败'
        }
      }
    ]
    window.__evidencePageCalls = []
    const original = deviceFixture.getExecution.bind(deviceFixture)
    deviceFixture.getExecution = async (id, after = 0) => {
      if (id !== execution.id) return original(id, after)
      window.__evidencePageCalls.push(after)
      const page = events.filter((item) => item.sequence > after).slice(0, 500)
      return {
        execution,
        events: page,
        has_more: (page.at(-1)?.sequence || after) < 603,
        next_sequence: page.at(-1)?.sequence || after
      }
    }
    robots.upsert(execution)
    scope.inspectExecution(execution.id)
    layout.revealBottom('activity')
  })
  await expect(page.getByTestId('execution-scope')).toContainText('已固定记录')
})

test('横向Stage、分页全文、反馈原位更新与真实鉴权图片', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.getByRole('button', { name: '切换主题', exact: true }).click()
  const panel = page.getByTestId('studio-bottom-panel')
  const timeline = panel.getByTestId('studio-stage-timeline')
  await expect(timeline).toHaveAttribute('data-layout', 'horizontal')
  await expect(panel.getByTestId('robot-execution-timeline')).toHaveCount(0)
  await expect(panel.getByTestId('stage-feedback')).toHaveCount(0)
  await panel.getByRole('button', { name: '加载后续阶段与记录' }).click()
  await panel.locator('.stage-axis button').last().click()
  const inspector = page.getByTestId('robot-stage-inspector')
  await expect(inspector).toContainText('连续反馈 600')
  await expect(inspector).toContainText('18.50 N')
  await expect(timeline).not.toContainText('18.50 N')
  const image = timeline.locator('.artifact-preview img')
  await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth)).toBe(1)
  await expect(image).toBeVisible()
  expect(await page.evaluate(() => window.__evidencePageCalls)).toEqual([0, 500])
  expect(
    await panel
      .locator('.activity-panel')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  ).toBe(true)
  await page.screenshot({
    path: '.output/studio-evidence-e2e/horizontal-stage-evidence.png',
    fullPage: true
  })
  await image.click()
  const preview = page.getByRole('dialog')
  await expect(preview.locator('img')).toBeVisible()
  await preview.getByRole('button', { name: '放大', exact: true }).click()
  await expect(preview).toContainText('125%')
  await page.screenshot({
    path: '.output/studio-evidence-e2e/image-lightbox-dark.png',
    fullPage: true
  })
  await page.keyboard.press('Escape')
  await expect(preview).not.toBeVisible()
})

test('日志默认关键摘要，完整搜索可找到已收起的running原文', async ({ page }) => {
  const panel = page.getByTestId('studio-bottom-panel')
  await panel.getByRole('button', { name: '加载后续阶段与记录' }).click()
  await panel.getByRole('tab', { name: /日志/ }).click()
  await expect(panel.getByLabel('日志显示内容')).toHaveValue('key')
  await expect(panel.locator('.log-row')).not.toContainText(['连续反馈 600'])
  await expect(panel).toContainText('抓取测试失败')
  await panel.getByLabel('搜索日志全文').fill('连续反馈 1"')
  await expect(panel.locator('.log-row')).toHaveCount(1)
  await panel.locator('.log-row summary').click()
  await expect(panel.locator('pre')).toContainText('连续反馈 1')
  await page.screenshot({ path: '.output/studio-evidence-e2e/semantic-log-fulltext.png' })
})

async function installHierarchy(page) {
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    const { useWorkflowStore } = await import('/src/stores/workflow.js')
    const { useExecutionScopeStore } = await import('/src/stores/executionScope.js')
    const { useLayoutStore } = await import('/src/stores/layout.js')
    const robots = useRobotStore()
    const workflow = {
      id: 'hierarchy-workflow',
      project_id: 'proj-v020-demo',
      status: 'running',
      goal: '长Workflow：只在所选SubTask展示真实阶段和证据。'.repeat(12)
    }
    const tasks = Array.from({ length: 4 }, (_, taskIndex) => ({
      id: 'task-' + taskIndex,
      workflow_id: workflow.id,
      position: taskIndex,
      status: taskIndex === 3 ? 'running' : 'completed',
      goal: '任务 ' + (taskIndex + 1) + ' 的完整目标说明。'.repeat(12),
      input: {
        object_ref: 'fixture-object-' + taskIndex,
        target_ref: 'fixture-target-' + taskIndex
      },
      subtasks: Array.from({ length: 4 }, (_, stepIndex) => {
        const index = taskIndex * 4 + stepIndex
        return {
          id: 'step-' + index,
          task_id: 'task-' + taskIndex,
          position: stepIndex,
          goal: '业务步骤 ' + (index + 1),
          status: index === 15 ? 'running' : 'completed',
          execution_ref: 'hierarchy-exec-' + index
        }
      })
    }))
    const view = { workflow, tasks }
    const workflows = useWorkflowStore()
    workflows.items.push(workflow)
    workflows.views[workflow.id] = view
    const originalView = window.__evidenceStudioFixture.getWorkflowView.bind(
      window.__evidenceStudioFixture
    )
    window.__evidenceStudioFixture.getWorkflowView = async (id) =>
      id === workflow.id ? { workflow_view: view } : originalView(id)
    for (let index = 0; index < 16; index++) {
      const id = 'hierarchy-exec-' + index
      const reference = 'pilot-artifact://fixture-pilot/local-' + index
      const formal = 'artifact://stage-image-' + index
      const execution = {
        id,
        workflow_id: workflow.id,
        task_id: 'task-' + Math.floor(index / 4),
        subtask_id: 'step-' + index,
        project_id: workflow.project_id,
        skill_name: '技能 ' + (index + 1),
        status: index === 15 ? 'running' : 'completed',
        stage: 'finish',
        created_at: new Date(Date.UTC(2026, 8, 7, 2, index)).toISOString(),
        stages: [
          { name: 'observe', label: '观察目标', status: 'completed' },
          { name: 'approach', label: '接近目标', status: 'completed' },
          {
            name: 'finish',
            label: '最终核对',
            status: index === 15 ? 'running' : 'completed',
            expectation: '核对本次目标',
            observation: '已收到真实传感器回报',
            evidence_refs: [reference, formal, reference]
          }
        ],
        artifact_sync: [
          {
            execution_id: id,
            pilot_instance_id: 'fixture-pilot',
            local_artifact_id: 'local-' + index,
            server_artifact_id: 'stage-image-' + index,
            status: 'synced',
            media_type: 'image/png',
            summary: '步骤 ' + (index + 1) + ' 证据'
          }
        ],
        observations: [
          {
            id: 'obs-' + index,
            stage: 'finish',
            evidence_refs: [formal],
            occurred_at: '2026-09-07T02:30:00Z'
          }
        ]
      }
      robots.upsert(execution)
      robots.eventPages[id] = { loaded: true, hasMore: false, cursor: 0 }
    }
    const scope = useExecutionScopeStore()
    scope.inspectWorkflow(workflow.id)
    useLayoutStore().updateShell({ bottomHeight: 400 })
  })
}

test('十六步骤形成Task→SubTask层级，只呈现选中步骤横向Stage和去重图片', async ({ page }) => {
  await installHierarchy(page)
  const panel = page.getByTestId('studio-bottom-panel')
  await expect(panel.locator('.task-group')).toHaveCount(4)
  await expect(panel.locator('.subtask-row')).toHaveCount(16)
  await expect(panel.getByTestId('studio-stage-timeline')).toHaveCount(1)
  await expect(panel.getByTestId('studio-stage-timeline')).toHaveAttribute(
    'data-execution-id',
    'hierarchy-exec-15'
  )
  await expect(panel.locator('.stage-axis button')).toHaveCount(3)
  await expect(panel.locator('.stage-images img')).toHaveCount(1)
  await expect(panel.locator('.stage-images img')).toBeInViewport()
  await expect(panel.locator('.run-row')).toHaveCount(0)
  await expect(panel.getByTestId('robot-execution-timeline')).toHaveCount(0)
  await panel.locator('[data-subtask-id="step-2"]').click()
  await expect(panel.getByTestId('studio-stage-timeline')).toHaveAttribute(
    'data-execution-id',
    'hierarchy-exec-2'
  )
  await panel.locator('.stage-axis [data-stage="observe"]').click()
  await expect(panel).toContainText('本阶段暂无图像采集记录')
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  await panel.getByRole('tab', { name: '过程', exact: true }).click()
  await expect(panel.locator('.stage-axis [data-stage="observe"]')).toHaveAttribute(
    'aria-current',
    'step'
  )
  expect(
    await panel
      .locator('.activity-panel')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  ).toBe(true)
  await panel.locator('.stage-axis [data-stage="finish"]').click()
  await expect
    .poll(() =>
      panel.locator('.stage-images img').evaluate((node) => node.complete && node.naturalWidth)
    )
    .toBe(1)
  await page.screenshot({
    path: '.output/studio-evidence-e2e/task-subtask-stage-hierarchy.png',
    fullPage: true
  })
})

test('运行进入终态不丢当前图片，显式选中历史步骤不被后续工作抢走', async ({ page }) => {
  await installHierarchy(page)
  const panel = page.getByTestId('studio-bottom-panel')
  await expect(panel.locator('.stage-images img')).toHaveCount(1)
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    useRobotStore().upsert({ id: 'hierarchy-exec-15', status: 'completed' })
  })
  await expect(panel.getByTestId('studio-stage-timeline')).toHaveAttribute(
    'data-execution-id',
    'hierarchy-exec-15'
  )
  await expect(panel.locator('.stage-images img')).toHaveCount(1)
  await expect(panel.locator('.stage-axis [data-stage="finish"]')).toContainText('最后上报：运行中')
  await expect(
    panel.locator('.stage-axis [data-stage="finish"] .device-status[data-status="running"]')
  ).toHaveCount(0)
  await panel.locator('[data-subtask-id="step-1"]').click()
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    useRobotStore().upsert({
      id: 'other-current',
      project_id: 'proj-v020-demo',
      skill_name: '新工作',
      status: 'running'
    })
  })
  await panel.getByRole('tab', { name: '日志', exact: true }).click()
  await panel.getByRole('tab', { name: '过程', exact: true }).click()
  await expect(panel.getByTestId('studio-stage-timeline')).toHaveAttribute(
    'data-execution-id',
    'hierarchy-exec-1'
  )
  await expect(panel.getByTestId('execution-scope')).toContainText('已固定记录')
})

test('当前选中Stage图片晚到自动出现，终态不回滚也不假装其他阶段有图', async ({ page }) => {
  await installHierarchy(page)
  const panel = page.getByTestId('studio-bottom-panel')
  await panel.locator('.stage-axis [data-stage="observe"]').click()
  await expect(panel).toContainText('本阶段暂无图像采集记录')
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    const robots = useRobotStore(),
      execution = robots.byId('hierarchy-exec-15')
    robots.upsert({
      id: execution.id,
      observations: [
        ...execution.observations,
        {
          id: 'late-observation',
          stage: 'observe',
          kind: 'sensor.frame',
          evidence_refs: ['pilot-artifact://fixture-pilot/late-image']
        }
      ]
    })
  })
  await expect(panel).toContainText('本阶段图片已采集，等待同步')
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    const robots = useRobotStore(),
      execution = robots.byId('hierarchy-exec-15')
    robots.upsert({
      id: execution.id,
      status: 'completed',
      artifact_sync: [
        ...execution.artifact_sync,
        {
          execution_id: execution.id,
          pilot_instance_id: 'fixture-pilot',
          local_artifact_id: 'late-image',
          server_artifact_id: 'late-stage-image',
          status: 'synced',
          media_type: 'image/png',
          summary: '晚到的阶段图'
        }
      ]
    })
  })
  await expect(panel.locator('.stage-axis [data-stage="observe"]')).toHaveAttribute(
    'aria-current',
    'step'
  )
  await expect
    .poll(() =>
      panel.locator('.stage-images img').evaluate((node) => node.complete && node.naturalWidth)
    )
    .toBe(1)
  await expect(panel.locator('.stage-images img')).toHaveCount(1)
  await expect(panel.getByTestId('studio-stage-timeline')).toHaveAttribute(
    'data-execution-id',
    'hierarchy-exec-15'
  )
})

test('正常稳定承载不是问题，重复warning合并原文，定位与返回不离开Workflow', async ({ page }) => {
  await installHierarchy(page)
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    const robots = useRobotStore()
    const id = 'hierarchy-exec-15'
    robots.appendExecutionEvent(id, {
      sequence: 1,
      type: 'feedback.emitted',
      payload: {
        stage: 'finish',
        feedback: { level: 'info', phase: 'load_stable', error: {}, message: '正常双侧承载稳定' }
      }
    })
    for (let sequence = 2; sequence <= 4; sequence++)
      robots.appendExecutionEvent(id, {
        sequence,
        type: 'feedback.emitted',
        payload: {
          stage: 'approach',
          feedback: {
            level: 'warning',
            phase: 'warning',
            message: '测试真实告警',
            diagnostic: '完整原文-' + sequence
          }
        }
      })
  })
  const panel = page.getByTestId('studio-bottom-panel')
  await panel.getByRole('tab', { name: /问题/ }).click()
  await expect(panel.locator('.problem-row')).toHaveCount(1)
  await expect(panel.locator('.problem-row')).toHaveAttribute('data-level', 'warning')
  await expect(panel).not.toContainText('正常双侧承载稳定')
  await expect(panel).toContainText('重复 3 次')
  const centerBefore = await page
    .locator('.studio-dock')
    .textContent()
    .catch(() => '')
  await panel.getByRole('button', { name: '定位阶段与图片' }).click()
  await expect(panel.getByTestId('execution-scope')).toContainText('已固定记录')
  await expect(panel.locator('.stage-axis [data-stage="approach"]')).toHaveAttribute(
    'aria-current',
    'step'
  )
  await panel.getByRole('button', { name: '返回问题' }).click()
  await expect(panel.locator('.problems-panel')).toBeVisible()
  await panel.getByRole('button', { name: '查看相关日志' }).click()
  await expect(panel.locator('details[open] pre')).toContainText('完整原文-2')
  await expect(panel.locator('details[open] pre')).toContainText('完整原文-4')
  await expect(panel.locator('details[open]')).toContainText('重复 3 次')
  await panel.getByRole('button', { name: '返回来源' }).click()
  await expect(panel.locator('.problems-panel')).toBeVisible()
  if (centerBefore) expect(await page.locator('.studio-dock').textContent()).toBe(centerBefore)
  await page.screenshot({ path: '.output/studio-evidence-e2e/problems-location-return.png' })
})

test('结果只呈完成/对象目标/末阶段证据，不复制阶段过程或全部Run', async ({ page }) => {
  await installHierarchy(page)
  const panel = page.getByTestId('studio-bottom-panel')
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  await expect(panel.locator('.result-item')).toHaveCount(4)
  await expect(panel).toContainText('fixture-object-0')
  await expect(panel).toContainText('fixture-target-3')
  await expect(panel.locator('.stage-results, .execution-timeline, .run-row')).toHaveCount(0)
  await expect(panel.locator('.result-item img')).toHaveCount(4)
  await page.screenshot({ path: '.output/studio-evidence-e2e/final-result-summary.png' })
})

test('真实累计Stage引用形状：只显示本阶段拍摄帧，结果保留末阶段两次采集', async ({ page }) => {
  await installHierarchy(page)
  await page.evaluate(async (recorded) => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    const robots = useRobotStore()
    robots.upsert({
      ...robots.byId(recorded.execution.id),
      ...recorded.execution,
      stages: [],
      observations: []
    })
    for (const event of recorded.events) robots.appendExecutionEvent(recorded.execution.id, event)
    robots.upsert({
      id: 'background-other-workflow',
      project_id: 'proj-v020-demo',
      workflow_id: 'other-workflow',
      skill_name: '后台另一轮',
      status: 'running'
    })
  }, recordedPlaceEvidence('hierarchy-exec-15'))
  const panel = page.getByTestId('studio-bottom-panel')
  const cards = panel.locator('.stage-images .artifact-resource-card')
  await expect(cards).toHaveCount(2)
  for (const [stage, image] of [
    ['observe_target_slot', 2],
    ['approach', 3],
    ['verify_stability', 5]
  ]) {
    await panel.locator(`.stage-axis [data-stage="${stage}"]`).click()
    await expect(cards).toHaveCount(1)
    await expect(cards).toContainText(`hierarchy-exec-15-image-${image}`)
    await expect(cards).toContainText(`阶段：${stage}`)
    await expect
      .poll(() => cards.locator('img').evaluate((node) => node.complete && node.naturalWidth))
      .toBe(1)
  }
  await page.screenshot({
    path: '.output/studio-evidence-e2e/recorded-stage-ownership.png',
    fullPage: true
  })
  await panel.locator('.stage-axis [data-stage="retreat"]').click()
  await expect(cards).toHaveCount(0)
  await expect(panel).toContainText('本阶段暂无图像采集记录')
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  await expect(panel.locator('.result-item')).toHaveCount(4)
  const finalCards = panel.locator('.result-item').last().locator('.artifact-resource-card')
  await expect(finalCards).toHaveCount(2)
  await expect(finalCards.nth(0)).toContainText('hierarchy-exec-15-image-6')
  await expect(finalCards.nth(1)).toContainText('hierarchy-exec-15-image-7')
  await expect(finalCards).toContainText([
    '阶段：restore_travel_posture',
    '阶段：restore_travel_posture'
  ])
  await expect
    .poll(() =>
      finalCards
        .locator('img')
        .evaluateAll((nodes) => nodes.filter((node) => node.complete && node.naturalWidth).length)
    )
    .toBe(2)
  await expect(panel.locator('.results-panel')).not.toContainText('后台另一轮')
  await expect(panel.getByTestId('execution-scope')).toContainText('已固定记录')
  await panel.locator('.results-panel').evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await page.screenshot({
    path: '.output/studio-evidence-e2e/recorded-final-stage-evidence.png',
    fullPage: true
  })
})

test('历史结果按需读到末页，过程保留分页且不要求用户刷新才拿到末阶段图片', async ({ page }) => {
  const panel = page.getByTestId('studio-bottom-panel')
  await expect(panel.getByTestId('stage-feedback')).toHaveCount(0)
  expect(await page.evaluate(() => window.__evidencePageCalls)).toEqual([0])
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  const image = panel.locator('.result-item img')
  await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth)).toBe(1)
  expect(await page.evaluate(() => window.__evidencePageCalls)).toEqual([0, 500])
  await panel.getByRole('tab', { name: '过程', exact: true }).click()
  await panel.locator('.stage-axis button').last().click()
  await expect(page.getByTestId('robot-stage-inspector')).toContainText('连续反馈 600')
  await expect(panel.getByRole('button', { name: '加载后续阶段与记录' })).toHaveCount(0)
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  await expect(image).toBeVisible()
  expect(await page.evaluate(() => window.__evidencePageCalls)).toEqual([0, 500])
})

test('已恢复问题保留错误和后续验证，定位阶段仍能看到处置记录', async ({ page }) => {
  const panel = page.getByTestId('studio-bottom-panel')
  await panel.getByRole('button', { name: '加载后续阶段与记录' }).click()
  await page.evaluate(async () => {
    const { useRobotStore } = await import('/src/stores/robot.js')
    const store = useRobotStore()
    const id = 'evidence-browser-run'
    const items = [
      [
        'action.terminal',
        { action_type: 'lift', status: 'failed', error: { message: '夹具接触不足' } }
      ],
      ['stage.recovering', { summary: '重新闭合夹具并核对承载' }],
      ['action.terminal', { action_type: 'lift', status: 'succeeded' }],
      ['stage.completed', { summary: '独立验证通过' }]
    ]
    items.forEach(([type, payload], index) =>
      store.appendExecutionEvent(id, {
        execution_id: id,
        sequence: 604 + index,
        type,
        created_at: `2026-09-07T01:02:0${index}Z`,
        payload: { stage: 'grasp', ...payload }
      })
    )
    store.upsert({ ...store.byId(id), status: 'completed', revision: 110 })
  })
  await panel.getByRole('tab', { name: /问题/ }).click()
  const problem = panel
    .locator('.problem-row')
    .filter({ has: page.locator('header > b', { hasText: '夹具接触不足' }) })
  await expect(problem).toContainText('已恢复并验证')
  await expect(problem).toContainText('重新闭合夹具并核对承载')
  await problem.getByRole('button', { name: '定位阶段与图片' }).click()
  await expect(panel.locator('.stage-problem').filter({ hasText: '夹具接触不足' })).toContainText(
    '独立验证通过'
  )
  await page.screenshot({ path: '.output/studio-evidence-e2e/recovered-stage-20260908.png' })
})

test('阶段与结果详细属性进入Inspector，过程仍固定原Workflow', async ({ page }) => {
  await installHierarchy(page)
  const panel = page.getByTestId('studio-bottom-panel')
  await panel.locator('[data-subtask-id="step-15"]').click()
  const inspector = page.getByTestId('studio-context-inspector')
  await expect(inspector).toContainText('SubTask ID')
  await expect(inspector).toContainText('step-15')
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector('#app')
          .__vue_app__.config.globalProperties.$pinia._s.get('studioLayout').selectedResource
          .resourceType
    )
  ).toBe('subtask')
  await panel.locator('.stage-axis button').last().click()
  await expect(inspector.getByTestId('robot-stage-inspector')).toBeVisible()
  await expect(inspector).toContainText('最终核对')
  const preview = inspector.locator('.stage-artifacts .artifact-preview').first()
  await expect(preview).toBeVisible()
  const previewBox = await preview.boundingBox()
  expect(previewBox.width).toBeGreaterThan(200)
  expect(previewBox.height).toBeGreaterThanOrEqual(150)
  await expect(panel.getByTestId('execution-scope')).toContainText('已固定记录')
  const resource = await page.evaluate(
    () =>
      document
        .querySelector('#app')
        .__vue_app__.config.globalProperties.$pinia._s.get('studioLayout').selectedResource
  )
  expect(resource.resourceType).toBe('robot_stage')
  expect(resource.source).toBe('studio-evidence')
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  await panel.locator('.result-item').first().getByRole('button', { name: '查看详情' }).click()
  await expect(inspector).toContainText('Task ID')
  await expect(inspector).toContainText('task-0')
  await expect(panel.getByTestId('execution-scope')).toContainText('已固定记录')
  await page.screenshot({
    path: '.output/studio-evidence-e2e/evidence-inspector-context.png',
    fullPage: true
  })
})

test('Task 可折叠，运行记录可分类搜索且不重复列出 Workflow 子执行', async ({ page }) => {
  await installHierarchy(page)
  const panel = page.getByTestId('studio-bottom-panel')
  const group = panel.locator('.task-group').first()
  await group.locator('.task-row').click()
  await expect(group.locator('.subtask-row')).toHaveCount(0)
  await group.locator('.task-row').click()
  await expect(group.locator('.subtask-row')).toHaveCount(4)
  await panel.getByRole('button', { name: '查看运行历史' }).click()
  const picker = page.locator('.run-history-picker')
  await expect(picker).toBeVisible()
  await picker.getByLabel('搜索运行记录').fill('does-not-exist')
  await expect(picker).toContainText('暂无匹配记录')
  await picker.getByLabel('搜索运行记录').fill('')
  await picker.getByRole('button', { name: '独立执行', exact: true }).click()
  await expect(picker.locator('.history-list')).not.toContainText('hierarchy-exec')
})

test('独立执行的查看属性指向Execution而不是已有Stage', async ({ page }) => {
  const panel = page.getByTestId('studio-bottom-panel')
  await panel.locator('.subtask-row').first().click()
  const inspector = page.getByTestId('studio-context-inspector')
  await expect(inspector).toContainText('Robot Execution')
  await expect(inspector).toContainText('evidence-browser-run')
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector('#app')
          .__vue_app__.config.globalProperties.$pinia._s.get('studioLayout').selectedResource
          .resourceType
    )
  ).toBe('robot_execution')
  await expect(panel.getByTestId('execution-scope')).toContainText('已固定记录')
})

test('历史范围固定且离线导出保留全文与图片，不混入新运行', async ({ page }) => {
  const panel = page.getByTestId('studio-bottom-panel')
  await page.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    pinia._s.get('conversation').currentId = 'another-chat'
    pinia._s.get('robotExecutions').upsert({
      id: 'another-run',
      project_id: 'proj-v020-demo',
      status: 'running',
      skill_name: '另一轮运行'
    })
  })
  await expect(panel.getByTestId('execution-scope')).toContainText('浏览器证据测试')
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  await expect(panel).toContainText('test-object')
  const downloadPromise = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出本次记录与证据' }).click()
  const download = await downloadPromise
  const html = await readFile(await download.path(), 'utf8')
  expect(html).toContain('evidence-browser-run')
  expect(html).toContain('data:image/png;base64,')
  expect(html).toContain('连续反馈 600')
  expect(html).not.toContain('another-run')
  await expect(panel).toContainText('记录与可读取证据已导出')
})
