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

/* global process */

const enabled = process.env.SEMANTIC_REAL_SIMULATION_E2E === '1'
const installationId = process.env.SEMANTIC_E2E_RUNTIME_INSTALLATION || 'local-native-mujoco'
const headers = (token) => ({ Authorization: `Bearer ${token}` })

async function login(request) {
  const response = await request.post('/api/v1/auth/login', {
    data: {
      username: 'admin',
      password: process.env.SEMANTIC_E2E_PASSWORD || 'test-admin-pass'
    }
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

async function createProject(request, token) {
  const response = await request.post('/api/v1/projects', {
    headers: headers(token),
    data: {
      name: `MuJoCo Visual Link E2E ${Date.now()}`,
      runtime_installation_id: installationId
    }
  })
  expect(response.ok()).toBeTruthy()
  const project = (await response.json()).project
  const activated = await request.post(`/api/v1/projects/${project.id}/activate`, {
    headers: headers(token)
  })
  expect(activated.ok()).toBeTruthy()
  return project
}

async function addPublicScene(request, token, projectId) {
  const catalog = await request.get(
    `/api/v1/simulation/scene-catalog?project_id=${encodeURIComponent(projectId)}`,
    { headers: headers(token) }
  )
  expect(catalog.ok()).toBeTruthy()
  const scene = (await catalog.json()).scenes.find(
    (item) => item.scene_id === 'depalletizing-r1pro'
  )
  expect(scene).toBeTruthy()
  const version = scene.versions[0]
  const variant = version.variants[0]
  const response = await request.post(`/api/v1/projects/${projectId}/simulation/project-scenes`, {
    headers: headers(token),
    data: {
      catalog_scene_id: scene.scene_id,
      scene_version: version.version,
      default_variant_id: variant.variant_id
    }
  })
  expect(response.ok()).toBeTruthy()
  return { scene, variant }
}

async function installSession(page, token) {
  await page.addInitScript(
    ({ value }) => {
      localStorage.setItem(
        'session',
        JSON.stringify({
          token: value,
          user: { id: 'admin', name: 'admin' },
          currentTeam: null
        })
      )
    },
    { value: token }
  )
}

async function selectActivity(page, name) {
  const button = page.getByRole('button', { name, exact: true })
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click()
  await expect(page.getByTestId('studio-primary-sidebar')).toBeVisible()
}

async function stopScene(request, token, projectId, instanceId) {
  if (!instanceId) return
  await request
    .post(`/api/v1/projects/${projectId}/simulation/instances/${instanceId}/stop`, {
      headers: headers(token),
      data: {}
    })
    .catch(() => undefined)
}

test.describe('真实视觉素材与空间选择', () => {
  test.setTimeout(180_000)
  test.skip(!enabled, '只在已启动真实 Framework 和 Plugin 时运行')

  test('Editor/Map 使用 Runtime GLB，Viewer 与 Map 双向选择', async ({ page, request }) => {
    const auth = await login(request)
    const project = await createProject(request, auth.token)
    const catalog = await addPublicScene(request, auth.token, project.id)
    await installSession(page, auth.token)

    let instanceId = ''
    try {
      await page.goto(`/projects/${project.id}/studio?activity=explorer`)
      const resources = page.getByTestId('project-simulation-scenes')
      await expect(resources).toBeVisible()
      await resources.getByRole('button', { name: new RegExp(catalog.scene.name) }).click()

      const r1Visual = page.waitForResponse(
        (response) =>
          response.url().includes('/visual-assets/r1_pro_chassis/3.glb') &&
          response.status() === 200
      )
      await page.getByRole('button', { name: '基于此 Layout 创建项目副本', exact: true }).click()
      const prompt = page.locator('.el-message-box')
      await prompt.locator('input').fill('真实视觉复用 Layout')
      await prompt.getByRole('button', { name: 'OK' }).click()
      await expect(prompt).toBeHidden()
      expect((await r1Visual).headers()['content-type']).toContain('model/gltf-binary')

      const editorHost = page.locator('.scene-editor .three-host')
      await expect(editorHost).toBeVisible()
      await expect
        .poll(
          async () => Number((await editorHost.getAttribute('data-visual-assets-loaded')) || 0),
          { timeout: 60_000 }
        )
        .toBe(6)

      // 编辑器标签不占用 Runtime；保持它打开并从原 Scene Details 启动公共 Layout。
      await page
        .getByRole('tab', { name: /Scene Details/ })
        .first()
        .click()
      await page.getByRole('button', { name: '启动此 Layout', exact: true }).click()
      await expect(page.locator('.viewer-host canvas')).toBeVisible({ timeout: 60_000 })

      const snapshot = async () => {
        const response = await request.get(`/api/v1/projects/${project.id}/simulation/snapshot`, {
          headers: headers(auth.token)
        })
        expect(response.ok()).toBeTruthy()
        return (await response.json()).simulation
      }
      instanceId = (await snapshot()).instance.instance_id

      await selectActivity(page, '仿真')
      await page.getByRole('button', { name: '同步地图', exact: true }).click()
      await selectActivity(page, '地图')
      await page
        .getByTestId('studio-primary-sidebar')
        .getByRole('button', { name: /Simulation Map/ })
        .click()
      const mapTab = page.getByRole('tab', { name: /Semantic Map/ }).first()
      await expect(mapTab).toBeVisible()
      await mapTab.click()
      const mapPanel = page.getByTestId('semantic-map-panel')
      await expect(mapPanel).toBeVisible({ timeout: 30_000 })
      const mapHost = mapPanel.locator('.three-host')
      await expect
        .poll(async () => Number((await mapHost.getAttribute('data-visual-assets-loaded')) || 0), {
          timeout: 60_000
        })
        .toBe(6)

      // Map -> Viewer：Map 选择通过 SourceLink 写入共享 Store，本地 Viewer 直接高亮。
      const boxRow = mapPanel.locator('.map-tree > button').filter({ hasText: 'box-a1' }).first()
      await expect(boxRow).toBeVisible()
      await boxRow.click()
      await page
        .getByRole('tab', { name: /Physics Viewer/ })
        .first()
        .click()
      const viewer = page.locator('.viewer-host')
      await expect(viewer).toHaveAttribute('data-selected-source-id', 'box-a1')

      // Viewer -> Map：在 Three.js 画布本地 Raycaster 离散拾取，不产生 /pick 网络请求。
      const bounds = await viewer.boundingBox()
      expect(bounds).not.toBeNull()
      const points = []
      for (const y of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        for (const x of [0.15, 0.27, 0.39, 0.5, 0.61, 0.73, 0.85]) points.push([x, y])
      }
      let pickedSourceId = ''
      for (const [x, y] of points) {
        await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y)
        pickedSourceId = (await viewer.getAttribute('data-selected-source-id')) || ''
        if (pickedSourceId) break
      }
      expect(pickedSourceId).toBeTruthy()
      await expect(viewer).toHaveAttribute('data-selected-entity-id', /.+/, {
        timeout: 10_000
      })
      await expect(
        page.getByRole('complementary').last().getByRole('heading', { level: 2 })
      ).toBeVisible()
      await page
        .getByRole('tab', { name: /Semantic Map/ })
        .first()
        .click()
      const activeEntity = mapPanel.locator('.map-tree > button.active')
      await expect(activeEntity).toContainText(pickedSourceId)
      const selectedEntityId = await activeEntity.getAttribute('data-entity-id')
      await expect(mapHost).toHaveAttribute('data-selected-entity-id', selectedEntityId)
    } finally {
      await stopScene(request, auth.token, project.id, instanceId)
    }
  })
})
