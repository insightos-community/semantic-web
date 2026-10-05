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

// Studio fixture 的场景准备信息；仅验证页面，不伪造运行或物理执行证据。
import { Buffer } from 'node:buffer'

const fixturePNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNksAAAAASUVORK5CYII=',
  'base64'
)

export async function installStudioSimulationFixture(page) {
  const profile = {
    runtime_profile_id: 'fixture-runtime',
    name: 'Fixture Runtime',
    engine: 'mujoco',
    loader: 'fixture'
  }
  const scene = {
    scene_id: 'fixture-scene',
    name: '测试场景',
    engine: 'mujoco',
    loader: 'fixture',
    compatible_runtime_profile: profile.runtime_profile_id,
    source: 'browser fixture',
    versions: [
      {
        version: '1.0.0',
        robot_models: [],
        variants: [{ variant_id: 'fixture-layout', name: '测试布局', kind: 'layout' }]
      }
    ]
  }
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body
    // 演示执行自带一张图片；布局用例不应因未实现的fixture资源产生遮挡工具栏
    // 的全局错误。图片错误/重试由独立证据用例显式覆盖，PNG不是物理证据。
    if (path === '/api/v1/chat/artifacts/art-rgb-001' && route.request().method() === 'GET')
      return route.fulfill({ contentType: 'image/png', body: fixturePNG })
    if (path === '/api/v1/skills') body = { skills: [] }
    else if (/^\/api\/v1\/traces\/[^/]+\/spans$/.test(path)) body = { spans: [] }
    else if (path.endsWith('/studio/snapshot')) body = { snapshot: { event_sequence: 0 } }
    else if (path.endsWith('/simulation/snapshot'))
      body = { simulation: { runtime: { state: 'offline' }, instance: null } }
    else if (path.endsWith('/runtime-profiles')) body = { runtime_profiles: [profile] }
    else if (path.endsWith('/runtime-installations')) body = { runtime_installations: [] }
    else if (path.endsWith('/runtime-preference'))
      body = {
        runtime_profile_id: profile.runtime_profile_id,
        compatible_runtime_installations: []
      }
    else if (path.endsWith('/scene-catalog')) body = { scenes: [scene] }
    else if (path.endsWith('/project-scenes'))
      body = {
        project_scenes: [
          {
            project_scene_id: 'fixture-project-scene',
            catalog_scene_id: scene.scene_id,
            scene_version: '1.0.0',
            default_variant_id: 'fixture-layout'
          }
        ]
      }
    else if (path.endsWith('/scene-documents')) body = { documents: [] }
    else if (path.endsWith('/scene-assets')) body = { assets: [] }
    else return route.fallback()
    if (route.request().method() !== 'GET')
      return route.fulfill({ status: 405, json: { error: { message: 'Fixture 不执行场景操作' } } })
    await route.fulfill({ json: body })
  })
}
