#!/usr/bin/env node
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

// Read-only inspection of an existing isolated round. No model calls, approvals,
// scene controls, mocked routes, or injected application state.
import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    session: { type: 'string' },
    round: { type: 'string', default: '1' },
    'web-base': { type: 'string' }
  }
})
if (!args.session || !/^\d+$/.test(args.round)) throw new Error('Provide --session and --round')
if ((await stat(args.session)).mode & 0o077) throw new Error('Session must be private')
const session = JSON.parse(await readFile(args.session, 'utf8'))
if (args['web-base']) session.web_base = args['web-base']
for (const base of [session.http_base, session.web_base]) {
  const url = new URL(base)
  if (url.hostname !== '127.0.0.1' || ['8080', '8081', '8090', '3000'].includes(url.port))
    throw new Error('Only isolated loopback candidates are allowed')
}
const dir = path.join(session.output, 'rounds', args.round.padStart(2, '0'))
const round = JSON.parse(await readFile(path.join(dir, 'round.json'), 'utf8'))
if (round.project_id !== session.project_id || !round.workflow_id)
  throw new Error('An existing Workflow in this test Project is required')
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } })
const prefix = `inspection-${Date.now()}`
const report = {
  workflow_id: round.workflow_id,
  web_base: session.web_base,
  image_checks: [],
  page_errors: []
}
await context.addInitScript(
  (token) =>
    localStorage.setItem(
      'session',
      JSON.stringify({ token, user: { id: 'admin', name: 'admin' }, currentTeam: null })
    ),
  session.token
)
const page = await context.newPage()
page.on('pageerror', (error) => report.page_errors.push(error.message))
const projectBase = `/api/v1/projects/${encodeURIComponent(session.project_id)}`
const get = async (endpoint) => {
  const response = await context.request.get(session.http_base + endpoint, {
    headers: { Authorization: `Bearer ${session.token}` }
  })
  if (!response.ok()) throw new Error(`Read failed: ${endpoint}, ${response.status()}`)
  return response.json()
}
const screenshot = (name) => page.screenshot({ path: path.join(dir, `${prefix}-${name}.png`) })
try {
  const executions = ((await get(projectBase + '/robot-executions')).executions || []).filter(
    (item) => item.workflow_id === round.workflow_id && item.status === 'completed'
  )
  const execution = executions.find((item) =>
    (item.artifact_sync || []).some((artifact) => artifact.status === 'synced')
  )
  if (!execution) throw new Error('No completed Execution has synchronized image evidence yet')
  report.execution_id = execution.id
  report.skill_name = execution.skill_name
  await page.goto(
    `${session.web_base}/projects/${session.project_id}/studio?execution_id=${execution.id}&panel=activity`
  )
  await expect(page.locator('.status-bar')).toContainText('Server 已连接', { timeout: 60_000 })
  const panel = page.getByTestId('studio-bottom-panel')
  const timeline = panel.getByTestId('studio-stage-timeline')
  await expect(timeline).toHaveAttribute('data-execution-id', execution.id, { timeout: 60_000 })
  await expect(timeline).toHaveAttribute('data-layout', 'horizontal')
  // Load this Execution's complete history through the user-visible pagination.
  for (let batch = 0; batch < 50; batch++) {
    const load = panel.getByRole('button', { name: '加载后续阶段与记录' })
    if (!(await load.isVisible())) break
    await load.click()
    await page.waitForTimeout(500)
  }
  const stages = await timeline
    .locator('.stage-axis button')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.stage))
  for (const [index, stage] of stages.entries()) {
    const button = timeline.locator('.stage-axis button').nth(index)
    await button.click()
    await expect(button).toHaveAttribute('aria-current', 'step')
    const cardCount = await timeline.locator('.stage-images .artifact-resource-card').count()
    if (!cardCount) continue
    const images = timeline.locator('.stage-images img')
    await expect(images).toHaveCount(cardCount, { timeout: 30_000 })
    await expect
      .poll(
        () => images.evaluateAll((nodes) => nodes.every((n) => n.complete && n.naturalWidth > 1)),
        {
          timeout: 30_000
        }
      )
      .toBeTruthy()
    report.image_checks.push({
      stage,
      images: await images.evaluateAll((nodes) =>
        nodes.map((node) => ({
          label: node.alt,
          width: node.naturalWidth,
          height: node.naturalHeight
        }))
      )
    })
    await screenshot(`stage-${stage}`)
  }
  if (!report.image_checks.length) throw new Error('Synced evidence did not render in any Stage')
  const visibleStage = report.image_checks[0].stage
  await timeline.locator('.stage-axis button').nth(stages.indexOf(visibleStage)).click()
  await timeline.getByRole('button', { name: '阶段属性', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Inspector', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await screenshot('stage-inspector')
  await timeline.getByRole('button', { name: '阶段日志', exact: true }).click()
  await expect(panel.getByLabel('日志显示内容')).toHaveValue('key')
  report.key_log_rows = await panel.locator('.log-row').count()
  await screenshot('stage-logs')
  await panel.getByLabel('查看运行历史').selectOption(`workflow:${round.workflow_id}`)
  await panel.getByRole('tab', { name: '结果', exact: true }).click()
  const workflow = (await get(projectBase + `/workflows/${round.workflow_id}/view`)).workflow_view
  await expect(panel.locator('.result-item')).toHaveCount(workflow.tasks.length)
  const refresh = panel.getByRole('button', { name: '刷新记录', exact: true })
  await expect(refresh).toBeEnabled({ timeout: 60_000 })
  const resultImages = async () => {
    const cards = panel.locator('.evidence-grid .artifact-resource-card.large-preview')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    const images = cards.locator('img')
    await expect(images).toHaveCount(count, { timeout: 30_000 })
    await expect
      .poll(() =>
        images.evaluateAll((nodes) => nodes.every((node) => node.complete && node.naturalWidth > 1))
      )
      .toBeTruthy()
    return count
  }
  report.result_images_before_refresh = await resultImages()
  await screenshot('results-before-refresh')
  await refresh.click()
  await expect(refresh).toBeEnabled({ timeout: 60_000 })
  report.result_images_after_refresh = await resultImages()
  report.result_cards = await panel.locator('.result-item').evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.innerText.slice(0, 500),
      cards: node.querySelectorAll('.artifact-resource-card').length
    }))
  )
  expect(report.result_cards.every((item) => item.cards > 0)).toBe(true)
  report.execution_views = await page.evaluate((workflowId) => {
    const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s
    return (stores.get('robotExecutions')?.executions || [])
      .filter((item) => item.workflow_id === workflowId)
      .map((item) => ({
        id: item.id,
        task_id: item.task_id,
        skill: item.skill_name,
        stage: item.stage,
        started_at: item.started_at,
        created_at: item.created_at,
        stages: (item.stages || []).map((stage) => stage.name),
        observations: item.observations?.length,
        artifacts: item.artifact_sync?.length
      }))
  }, round.workflow_id)
  await screenshot('results-after-refresh')
  expect(report.page_errors).toEqual([])
  report.status = 'passed_read_only_ui_checks'
} catch (error) {
  report.status = 'failed'
  report.error = error.message
  await screenshot('failure').catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(path.join(dir, `${prefix}.json`), JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600
  })
  await browser.close()
  console.log(JSON.stringify(report))
}
