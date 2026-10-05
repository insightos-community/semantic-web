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

test('设备中心展示多个 Pilot，详情页按阶段展示执行并同步 Artifact', async ({ page }) => {
  await page.goto('/devices')
  const devices = page.getByTestId('devices-page')
  await expect(devices).toContainText('2/3 个 Pilot 在线')
  await expect(devices).toContainText('R1 Pro · 拆码垛仿真')
  await expect(devices).toContainText('R1 Pro · 真机 001')
  await expect(devices).toContainText('R1 Pro · 实验室 002')
  await expect(devices).toContainText('按阶段展示进度')
  await expect(devices).not.toContainText('0%')
  await expect(devices).toContainText('Robot Runtime 可执行')
  await expect(page.getByTestId('robot-runtime-r1pro-sim-001')).toContainText('Robot 已可执行')
  await expect(page.getByTestId('robot-runtime-r1pro-lab-002')).toContainText(
    '等待 Server 确认 Robot 可执行'
  )
  await expect(page.getByTestId('robot-runtime-r1pro-lab-002')).toContainText(
    'Robot SDK Backend 初始化失败'
  )

  await devices.getByRole('button', { name: '添加 Pilot' }).click()
  const enrollment = page.getByRole('dialog', { name: '将 Pilot 加入 Semantic Server' })
  await expect(enrollment).toContainText('ABCD12')
  await expect(enrollment).toContainText('semantic-robot-instance start')
  await expect(enrollment).not.toContainText('accessToken')
  await enrollment.getByRole('button', { name: '完成' }).click()

  await devices.getByRole('button', { name: /R1 Pro · 拆码垛仿真/u }).click()
  const detail = page.getByTestId('device-detail')
  await expect(detail).toContainText('grasp-object')
  await detail.getByRole('tab', { name: '配置', exact: true }).click()
  await expect(detail).toContainText('坐标系 Frames')
  await expect(detail).toContainText('技能期望与实际安装')
  await detail.getByRole('tab', { name: '概览', exact: true }).click()
  await detail.locator('summary').filter({ hasText: '传感与证据' }).click()
  await expect(detail).toContainText('抓取目标 RGB 证据')
  await expect(detail).toContainText('上传中')
  await expect(detail).toContainText('artifact://art-rgb-001')
  await expect(detail).toContainText('front-rgbd')
  await expect(detail).toContainText('接触与夹持力')

  await detail.getByRole('tab', { name: '技能与基础调试', exact: true }).click()
  await expect(detail).toContainText('semantic-navigation')

  await detail.getByRole('tab', { name: 'Ability 基础调试' }).click()
  await detail.locator('.ability-contract summary').click()
  await expect(detail).toContainText('sim-navigation-1')
  await expect(detail).toContainText('semantic_abilities.navigation.VerifyArrivalInput')
  await expect(detail).toContainText('到达位姿允许的最大位置误差')
  await expect(detail.getByRole('button', { name: '启动调试' })).toBeDisabled()
})

test('停止请求显示 Server 返回的 stopping，Project Studio 可打开同一时间线', async ({ page }) => {
  await page.goto('/devices/r1pro-sim-001?tab=execution')
  const device = page.getByTestId('device-detail')
  await device.getByRole('tab', { name: '技能与基础调试', exact: true }).click()
  await device.locator('.skills-grid article').filter({ hasText: 'grasp-object' }).first().click()
  const timeline = device.locator('.robot-skill-debug-panel')
  await timeline.getByRole('button', { name: '安全停止', exact: true }).click()
  await expect(timeline).toContainText('停止中')
  await expect(timeline).not.toContainText('已停止')

  await page.getByRole('button', { name: '设备中心' }).click()
  await expect(page.getByTestId('device-row-r1pro-sim-001')).toContainText('停止中')
  await expect(page.getByTestId('device-row-r1pro-real-001')).toContainText('空闲')
  await expect(page.getByTestId('robot-runtime-r1pro-real-001')).toContainText('Robot 已可执行')

  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
  await page.evaluate(async () => {
    const { openStudioPanel } = await import('/src/studio/panelService.js')
    openStudioPanel('runtime')
  })
  const debugTimeline = page.getByTestId('studio-execution-timeline')
  await expect(debugTimeline).toHaveAttribute('data-layout', 'horizontal')
  await expect(debugTimeline).toContainText('grasp-object')
  await expect(debugTimeline).toContainText('闭合夹爪并观察接触')
  await expect(debugTimeline).toContainText('Feedback / Observation')
  const stageInspector = page.getByTestId('robot-stage-inspector')
  await debugTimeline.locator('.stage-column').filter({ hasText: '闭合夹爪并观察接触' }).click()
  await expect(stageInspector).toContainText('Action / Ability')
  await expect(stageInspector).toContainText('左侧检测到接触，右侧继续闭合')
  await debugTimeline.locator('.stage-column').filter({ hasText: '观测抓取目标' }).click()
  await expect(stageInspector).toContainText('box-17 位姿，置信度 0.94')
  await expect(stageInspector).toContainText('2026/8/10 09:15:00')
  await expect(page.getByTestId('studio-context-inspector')).toContainText('Robot Skill Stage')
})

test('Project Studio 设备入口留在三栏工作区，并显式提供 Server 设备中心', async ({ page }) => {
  await page.goto('/projects/proj-v020-demo/studio')
  await page.locator('.activity-bar').getByRole('button', { name: '设备', exact: true }).click()

  await expect(page).toHaveURL(/\/projects\/proj-v020-demo\/studio$/u)
  const sidebar = page.getByTestId('studio-primary-sidebar')
  await expect(sidebar).toContainText('项目设备')
  await expect(sidebar).toContainText('Server 设备中心')
  await sidebar.locator('.robot-row').filter({ hasText: 'R1 Pro · 拆码垛仿真' }).click()
  const devicePanel = page.locator('.robot-device-panel')
  await expect(devicePanel).toContainText('AbilityFramework')
  await devicePanel.getByRole('button', { name: '执行记录', exact: true }).click()
  await expect(page.getByTestId('execution-scope')).toContainText('已固定记录')
  await expect(devicePanel).toBeVisible()
})
