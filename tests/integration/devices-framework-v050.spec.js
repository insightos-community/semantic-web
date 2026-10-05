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

const token = process.env.V050_FRAMEWORK_TOKEN || ''
const expectedRobotId = process.env.V050_EXPECT_ROBOT_ID || ''
const expectedExecutionId = process.env.V050_EXPECT_EXECUTION_ID || ''
const expectedProjectId = process.env.V050_EXPECT_PROJECT_ID || ''

test.skip(!token, '设置 V050_FRAMEWORK_TOKEN 后运行真实 Semantic Server 联调')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ authToken }) => {
      window.localStorage.setItem(
        'session',
        JSON.stringify({
          token: authToken,
          user: { id: 'v050-integration', name: 'v0.5 Integration' },
          currentTeam: null
        })
      )
    },
    { authToken: token }
  )
})

test('真实 Server Snapshot 与设备中心展示双 Robot、Skill 和 Ability', async ({ page }) => {
  const response = await page.request.get('/api/v1/devices/snapshot', {
    headers: { Authorization: `Bearer ${token}` }
  })
  expect(response.ok()).toBe(true)
  const body = await response.json()
  const snapshot = body.snapshot || body
  const robots = Array.isArray(snapshot.robots) ? snapshot.robots : []
  expect(robots.length).toBeGreaterThanOrEqual(2)

  const selected = expectedRobotId
    ? robots.find((robot) => robot.robot_id === expectedRobotId)
    : robots[0]
  expect(selected, 'Snapshot 必须包含目标 Robot').toBeTruthy()
  expect(selected.pilot?.status).toBe('online')
  expect(selected.ability_framework?.status).toBe('ready')
  expect(selected.abilities).toHaveLength(7)
  expect(selected.installed_skills).toHaveLength(3)
  expect(selected.installed_skills.every((skill) => skill.enabled)).toBe(true)

  await page.goto('/devices')
  const row = page.getByTestId(`device-row-${selected.robot_id}`)
  await expect(row).toBeVisible()
  await row.click()
  const detail = page.getByTestId('device-detail')
  await expect(detail).toContainText(selected.robot_id)
  await expect(detail).toContainText('7/7 个实例健康')
  await expect(detail).toContainText(/3\/3\s*Robot Skill 已启用/u)
  await detail.getByRole('tab', { name: /Robot Skill/u }).click()
  await expect(detail).toContainText('grasp-object')
  await expect(detail).toContainText('semantic-navigation')
  await expect(detail).toContainText('place-object')
  await detail.getByRole('tab', { name: /^Ability/u }).click()
  await expect(detail).toContainText(selected.abilities[0].instance_id)
})

test('真实执行时间线展示 Ability、Feedback、Observation 和 Artifact', async ({ page }) => {
  test.skip(!expectedRobotId || !expectedExecutionId || !expectedProjectId, 'Gate 输入不完整')
  const response = await page.request.get(`/api/v1/robot-executions/${expectedExecutionId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  expect(response.ok()).toBe(true)
  const body = await response.json()
  const events = Array.isArray(body.events) ? body.events : []
  const started = events.filter((event) => event.type === 'action.started')
  expect(started.length).toBeGreaterThan(0)
  expect(started.every((event) => event.payload?.ability_instance_id)).toBe(true)
  expect(events.some((event) => event.type === 'feedback.emitted')).toBe(true)
  expect(events.some((event) => event.type === 'observation.recorded')).toBe(true)
  expect(body.execution?.artifact_sync?.some((item) => item.status === 'synced')).toBe(true)
  const synced = body.execution.artifact_sync.find((item) => item.status === 'synced')

  await page.goto(`/devices/${expectedRobotId}?tab=history`)
  const detail = page.getByTestId('device-detail')
  const historyRow = detail.getByRole('button', { name: new RegExp(expectedExecutionId) })
  await expect(historyRow).toBeVisible()
  await historyRow.click()
  const timeline = page.getByTestId('robot-execution-timeline')
  await expect(timeline).toContainText(expectedExecutionId)
  await expect(timeline).toContainText(started[started.length - 1].payload.ability_instance_id)
  const feedback = events.find((event) => event.type === 'feedback.emitted')?.payload?.feedback
  if (feedback?.message) await expect(timeline).toContainText(feedback.message)
  const observation = events.find((event) => event.type === 'observation.recorded')?.payload
    ?.observation
  const observationLabel = observation?.type || observation?.kind
  if (observationLabel) await expect(timeline).toContainText(observationLabel)

  await detail.getByRole('tab', { name: /传感与证据/u }).click()
  await expect(detail).toContainText(expectedExecutionId)
  await expect(detail).toContainText(`artifact://${synced.server_artifact_id}`)

  await page.goto(`/projects/${expectedProjectId}/studio`)
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
  await page.locator('.activity-bar').getByTitle('Run & Debug').click()
  await page
    .getByTestId('studio-primary-sidebar')
    .getByRole('button', { name: /Robot Execution/u })
    .click()
  const executionPanel = page.locator('.robot-executions-panel')
  await executionPanel.getByRole('button', { name: new RegExp(expectedExecutionId) }).click()
  const studioTimeline = page.getByTestId('studio-execution-timeline')
  await expect(studioTimeline).toHaveAttribute('data-layout', 'horizontal')
  await expect(studioTimeline).toContainText(expectedExecutionId)
  await expect(studioTimeline).toContainText(
    started[started.length - 1].payload.ability_instance_id
  )

  await page.reload()
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
  await expect(page.locator('.robot-executions-panel')).toContainText(expectedExecutionId)
  await expect(page.getByTestId('studio-execution-timeline')).toBeVisible()
})
