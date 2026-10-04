import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { installStudioSimulationFixture } from './helpers/studioSimulation'

test('项目上传、目录扫描结果及长路径布局', async ({ page }) => {
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
  const items = []
  await page.route('**/api/v1/projects/*/components', (route) =>
    route.fulfill({ json: { robots: [] } })
  )
  // 这里只验证真实 Web 组件交互；包解析、发布与后台扫描由 Go 集成测试覆盖。
  await page.route('**/api/v1/projects/*/imports**', async (route) => {
    if (route.request().method() === 'POST') {
      items.push({
        id: 'upload-1',
        kind: 'robot_skill',
        name: '测试抓取技能',
        filename: 'skill.zip',
        version: '0.1.0-dev.1234567890abcdef',
        status: 'imported'
      })
      return route.fulfill({ json: { item: items[0] } })
    }
    return route.fulfill({
      json: {
        directory:
          '/home/wwy/workspace/semantic/semantic-framework/.output/workspaces/项目测试导入目录/imports',
        items
      }
    })
  })
  await page.goto('/projects/proj-v020-demo/studio')
  await expect(page.locator('.status-bar')).toContainText('Server 已连接')
  if (!(await page.getByRole('button', { name: '导入项目内容', exact: true }).isVisible())) {
    await page.getByRole('button', { name: '项目', exact: true }).click()
  }
  await page.getByRole('button', { name: '导入项目内容', exact: true }).click()
  const dialog = page.getByTestId('project-import-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('项目测试导入目录/imports')
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'skill.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('fixture')
  })
  await expect(dialog).toContainText('已登记到 Robot Skill 库')
  await expect(dialog).toContainText('0.1.0-dev.1234567890abcdef')
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({
    path: '.output/studio-e2e/project-import.png',
    fullPage: true,
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 780, height: 900 })
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
})
