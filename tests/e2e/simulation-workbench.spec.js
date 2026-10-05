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

const png1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function minimalViewerGLB() {
  const document = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0', generator: 'semantic-web-e2e' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        {
          name: 'semantic-z-up-root',
          rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
          children: [],
          extras: { coordinate_frame: 'z_up_right_handed' }
        }
      ]
    })
  )
  const paddedLength = Math.ceil(document.length / 4) * 4
  const glb = Buffer.alloc(12 + 8 + paddedLength, 0x20)
  glb.write('glTF', 0)
  glb.writeUInt32LE(2, 4)
  glb.writeUInt32LE(glb.length, 8)
  glb.writeUInt32LE(paddedLength, 12)
  glb.write('JSON', 16)
  document.copy(glb, 20)
  return glb
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ encodedFrame }) => {
      localStorage.setItem(
        'session',
        JSON.stringify({
          token: 'e2e-token',
          user: { id: 'qa', name: 'qa' },
          currentTeam: null
        })
      )

      const pack = (frameMetadata, payload) => {
        const metadata = new TextEncoder().encode(JSON.stringify(frameMetadata))
        const packet = new Uint8Array(4 + metadata.length + payload.length)
        new DataView(packet.buffer).setUint32(0, metadata.length, false)
        packet.set(metadata, 4)
        packet.set(payload, 4 + metadata.length)
        return packet.buffer
      }

      const raw = atob(encodedFrame)
      const image = Uint8Array.from(raw, (value) => value.charCodeAt(0))
      const makeRGBPacket = () =>
        pack(
          {
            stream: 'sensor',
            sensor_id: 'front_rgb',
            kind: 'rgb',
            sequence: 1,
            generation: 1,
            media_type: 'image/png',
            encoding: 'png',
            width: 1,
            height: 1
          },
          image
        )
      const makeDepthPacket = (generation, sequence, values) => {
        const payload = new Uint8Array(values.length * 4)
        const view = new DataView(payload.buffer)
        values.forEach((value, index) => view.setFloat32(index * 4, value, true))
        return pack(
          {
            stream: 'sensor',
            sensor_id: 'front_depth',
            kind: 'depth',
            sequence,
            generation,
            media_type: 'application/octet-stream',
            encoding: 'float32-le',
            width: 2,
            height: 2
          },
          payload
        )
      }

      class FakeSocket {
        static OPEN = 1

        constructor(url) {
          this.url = url
          this.readyState = FakeSocket.OPEN
          this.binaryType = 'blob'
          queueMicrotask(() => {
            this.onopen?.({})
            const href = String(url)
            if (!href.includes('/ws/simulation-stream')) return
            if (href.includes('sensor_id=front_depth')) {
              // 同一轮到达的旧帧应被“最新帧覆盖”丢弃；之后到达的错误
              // generation 帧也不能覆盖已经显示的有效画面。
              this.onmessage?.({ data: makeDepthPacket(1, 2, [0.2, 0.3, 0.4, 0.5]) })
              this.onmessage?.({ data: makeDepthPacket(1, 4, [0.1, 0.2, 0.4, 0.8]) })
              setTimeout(() => {
                this.onmessage?.({ data: makeDepthPacket(0, 99, [1, 1, 1, 1]) })
              }, 0)
              return
            }
            if (href.includes('sensor_id=front_rgb')) {
              this.onmessage?.({ data: makeRGBPacket() })
            }
          })
        }
        addEventListener(type, listener) {
          this[`on${type}`] = listener
        }

        removeEventListener(type, listener) {
          if (this[`on${type}`] === listener) this[`on${type}`] = null
        }

        close() {
          if (this.readyState !== FakeSocket.OPEN) return
          this.readyState = 3
          this.onclose?.({ code: 1000 })
        }
      }

      window.WebSocket = FakeSocket
    },
    { encodedFrame: png1x1 }
  )
})

test('场景草稿构建后可运行、控制、重置并在刷新后恢复', async ({ page }) => {
  const now = '2026-08-09T00:00:00Z'
  const browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  const nativeScene = {
    scene_key: 'depalletizing',
    name: '拆码垛',
    runtime_profile_id: 'native-mujoco',
    layouts: ['layout001', 'layout002', 'layout003']
  }
  const runtimeInstallation = {
    installation_id: 'local-native-mujoco',
    profile_id: 'native-mujoco',
    name: 'Native MuJoCo',
    engine: 'mujoco',
    loader: 'native',
    launch_mode: 'uv',
    installed_version: '0.4.0-dev',
    enabled: true,
    status: 'ready',
    capabilities: {
      editable_scene: true,
      native_evaluator: false,
      viewer: true,
      viewer_camera_modes: ['free', 'fixed'],
      scene_step: true,
      scene_reset: true,
      robot_commands: true
    }
  }
  const catalogScene = {
    scene_id: 'native-depalletizing',
    name: '拆码垛场景',
    description: 'R1 Pro 三套拆码垛布局',
    tags: ['depalletizing'],
    engine: 'mujoco',
    loader: 'native',
    source: 'mujoco_asset',
    compatible_runtime_profile: 'native-mujoco',
    preview: '/simulation-previews/depalletizing-r1pro.svg',
    versions: [
      {
        version: 'asset-v1',
        robot_models: ['r1_pro_chassis'],
        capabilities: ['viewer', 'rgb', 'depth', 'contact'],
        authoring: {
          mode: 'layout_only',
          template_ref: 'authoring/scene-template.json',
          asset_catalog_version: '1.0.0',
          allowed_asset_tags: ['depalletizing-compatible'],
          locked_nodes: ['robot-r1'],
          preview_camera: { mode: 'fixed', camera: 'overview' }
        },
        variants: ['layout001', 'layout002', 'layout003'].map((layout) => ({
          variant_id: layout,
          name: layout,
          kind: 'layout',
          description: `固定布局 ${layout}`,
          preview: `/simulation-previews/depalletizing-r1pro-${layout}.svg`,
          authoring_ref: `authoring/${layout}.json`
        }))
      }
    ]
  }
  const projectScene = {
    project_scene_id: 'project-scene-e2e',
    project_id: 'proj-v020-demo',
    catalog_scene_id: catalogScene.scene_id,
    scene_version: 'asset-v1',
    default_variant_id: 'layout001'
  }
  const assetCatalog = [
    {
      catalog_id: 'r1-pro-chassis',
      label: 'R1 Pro',
      node_kind: 'robot',
      tags: ['depalletizing-compatible'],
      asset: {
        id: 'robot-r1-pro-chassis-v1',
        asset_key: 'robot/r1_pro_chassis/config/r1_pro_chassis.xml',
        kind: 'robot',
        metadata: { model: 'r1_pro_chassis' }
      },
      preview: {
        shape: 'box',
        size: [0.8, 0.55, 1.2],
        color: '#315cec',
        placeholder: true
      },
      default_properties: { model: 'r1_pro_chassis', sensor_names: ['camera'] }
    },
    {
      catalog_id: 'box',
      label: 'Box',
      node_kind: 'object',
      tags: ['depalletizing-compatible'],
      asset: {
        id: 'object-box-v1',
        asset_key: 'assets/objects/box.xml',
        kind: 'object',
        metadata: { model: 'box', category: 'box' }
      },
      preview: { shape: 'box', size: [0.5, 0.5, 0.5], color: '#d89b45', placeholder: false },
      default_properties: {
        model: 'box',
        category: 'box',
        size: [0.5, 0.5, 0.5],
        mass: 0.5,
        static: false,
        interactive: true,
        material: { rgba: [0.85, 0.55, 0.2, 1] },
        collision: { enabled: true, friction: [1, 0.005, 0.0001] }
      }
    }
  ]
  const robot = {
    robot_id: 'r1-pro-001',
    model: 'r1_pro_chassis',
    kind: 'mobile_manipulator',
    coordinate_frame: 'world',
    sdk_package: 'semantic-robot-sdk-r1pro',
    backend_profile: 'native-mujoco',
    joint_names: ['left_arm_joint1', 'right_arm_joint1'],
    end_effectors: ['left', 'right'],
    grippers: ['left', 'right'],
    capabilities: {
      commands: ['joint_trajectory', 'base_trajectory', 'gripper_command', 'stop', 'hold'],
      sensors: ['rgb', 'depth', 'contact'],
      frames: ['world', 'base_link', 'left_ee', 'right_ee']
    }
  }
  const sensors = [
    { sensor_id: 'front_rgb', kind: 'rgb', frame_id: 'camera_front', encoding: 'jpeg' },
    {
      sensor_id: 'front_depth',
      kind: 'depth',
      frame_id: 'camera_front',
      encoding: 'float32-le'
    },
    { sensor_id: 'left_contact', kind: 'contact', frame_id: 'left_gripper', encoding: 'json' }
  ]
  const documents = []
  let activeInstance = null
  let builtScene = null
  let sdkCommand = null

  const documentTemplate = (name) => ({
    id: 'doc-e2e',
    project_id: 'proj-v020-demo',
    name,
    description: '从公共拆码垛 Layout 派生',
    scene_id: 'project-scene-native-depalletizing',
    layout_id: 'layout-project-e2e',
    layout_name: name,
    scene_kind: 'scene_document',
    revision: 1,
    status: 'draft',
    version: 0,
    preview: '/simulation-previews/depalletizing-r1pro-layout001.svg',
    authoring: {
      mode: 'layout_only',
      source_scene_id: catalogScene.scene_id,
      source_scene_version: 'asset-v1',
      source_variant_id: 'layout001',
      template_ref: 'authoring/scene-template.json',
      asset_catalog_version: '1.0.0',
      allowed_asset_tags: ['depalletizing-compatible'],
      locked_nodes: ['robot-r1']
    },
    assets: [assetCatalog[0].asset],
    nodes: [
      {
        id: 'robot-r1',
        name: 'R1 Pro',
        kind: 'robot',
        asset_id: assetCatalog[0].asset.id,
        parent_id: null,
        transform: {
          position: [0, 0, 0],
          quaternion_xyzw: [0, 0, 0, 1],
          scale: [1, 1, 1]
        },
        properties: { model: 'r1_pro_chassis' }
      }
    ],
    regions: [],
    physics: { gravity_m_s2: [0, 0, -9.81], timestep_seconds: 0.002 },
    extensions: {},
    created_at: now,
    updated_at: now
  })

  const validateDocumentFixture = (document) => {
    const issues = []
    const problem = (nodeId, field, message) =>
      issues.push({ level: 'error', node_id: nodeId || undefined, field, message })
    const releasedAssets = new Map(assetCatalog.map((entry) => [entry.asset.id, entry.asset]))
    const documentAssets = new Map(document.assets.map((asset) => [asset.id, asset]))
    for (const asset of document.assets) {
      const released = releasedAssets.get(asset.id)
      if (!released || JSON.stringify(released) !== JSON.stringify(asset)) {
        problem('', `assets.${asset.id}`, '资产描述不在已发布目录中')
      }
    }
    const allNodes = [...document.nodes, ...document.regions]
    const nodeIds = new Set()
    for (const node of allNodes) {
      if (nodeIds.has(node.id)) problem(node.id, 'id', '节点 ID 重复')
      nodeIds.add(node.id)
      if (!['group', 'object', 'robot', 'camera', 'light', 'region'].includes(node.kind)) {
        problem(node.id, 'kind', `不支持独立 ${node.kind} 节点`)
      }
      if (node.asset_id && !documentAssets.has(node.asset_id)) {
        problem(node.id, 'asset_id', '节点引用的资产不存在')
      }
      if (['robot', 'object'].includes(node.kind) && !node.asset_id) {
        problem(node.id, 'asset_id', 'Robot 和 Object 必须通过 AttachAsset 使用发布资产')
      }
      const transform = node.transform || {}
      const quaternion = transform.quaternion_xyzw || []
      const scale = transform.scale || []
      if (quaternion.length !== 4 || Math.abs(Math.hypot(...quaternion.map(Number)) - 1) > 1e-6) {
        problem(node.id, 'transform.quaternion_xyzw', '姿态必须是归一化 xyzw 四元数')
      }
      if (scale.length !== 3 || scale.some((value) => Number(value) <= 0)) {
        problem(node.id, 'transform.scale', '缩放必须是三个大于零的数值')
      }
    }
    for (const region of document.regions) {
      if (region.kind !== 'region') problem(region.id, 'kind', 'regions 只能包含 Region')
    }
    if (!document.nodes.some((node) => node.kind === 'robot')) {
      problem('', 'nodes', '可运行场景至少需要一台 Robot')
    }
    return { valid: issues.length === 0, issues }
  }

  const applyOperationsFixture = (current, operations) => {
    const next = JSON.parse(JSON.stringify(current))
    const allNodes = () => [...next.nodes, ...next.regions]
    const findNode = (nodeId) => allNodes().find((node) => node.id === nodeId)
    for (const operation of operations) {
      if (['CreateNode', 'AddRobot', 'AddCamera'].includes(operation.type)) {
        next.nodes.push(operation.node)
        continue
      }
      if (operation.type === 'AddRegion') {
        next.regions.push(operation.node)
        continue
      }
      if (operation.type === 'AttachAsset') {
        const released = assetCatalog.find((entry) => entry.asset.id === operation.asset_id)?.asset
        if (!released || JSON.stringify(released) !== JSON.stringify(operation.asset)) {
          throw new Error(`AttachAsset 使用了未发布资产：${operation.asset_id}`)
        }
        if (!next.assets.some((asset) => asset.id === released.id)) {
          next.assets.push(operation.asset)
        }
        const node = findNode(operation.node_id)
        if (!node) throw new Error(`AttachAsset 节点不存在：${operation.node_id}`)
        node.asset_id = operation.asset_id
        continue
      }
      if (operation.type === 'DeleteNode') {
        next.nodes = next.nodes.filter((node) => node.id !== operation.node_id)
        next.regions = next.regions.filter((node) => node.id !== operation.node_id)
        continue
      }
      const node = findNode(operation.node_id)
      if (!node) throw new Error(`场景操作节点不存在：${operation.node_id}`)
      if (operation.type === 'MoveNode') node.parent_id = operation.parent_id || null
      if (operation.type === 'SetTransform') node.transform = operation.transform
      if (operation.type === 'SetProperty') {
        if (operation.property === 'name') node.name = operation.value
        else if (operation.property === 'properties') node.properties = operation.value
        else node.properties[operation.property] = operation.value
      }
    }
    next.revision += 1
    next.updated_at = now
    return { document: next, validation: validateDocumentFixture(next) }
  }

  const snapshot = () => ({
    simulation: {
      project_id: 'proj-v020-demo',
      revision: 1,
      profiles: [{ runtime_profile_id: 'native-mujoco', name: 'Native MuJoCo' }],
      runtimes: [
        {
          runtime_id: 'runtime-e2e',
          runtime_profile_id: 'native-mujoco',
          state: 'ready',
          backend: 'mujoco'
        }
      ],
      scenes: builtScene ? [nativeScene, builtScene] : [nativeScene],
      instance: activeInstance,
      robots: activeInstance ? [robot] : []
    }
  })

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/api/v1/system/healthz') return json(200, { status: 'ok' })
    if (path.endsWith('/studio/snapshot') && method === 'GET') {
      return json(200, {
        snapshot: {
          project: {
            id: 'e2e',
            name: 'Simulation E2E',
            mode: 'development',
            revision: 1,
            is_active: true
          },
          conversations: [],
          runs: [],
          pending_interactions: [],
          event_sequence: 0
        }
      })
    }
    if (path === '/api/v1/simulation/runtime-installations' && method === 'GET') {
      return json(200, { runtime_installations: [runtimeInstallation] })
    }
    if (path.endsWith('/simulation/runtime-preference') && method === 'GET') {
      return json(200, {
        runtime_profile_id: runtimeInstallation.profile_id,
        preferred_runtime_installation_id: runtimeInstallation.installation_id,
        compatible_runtime_installations: [runtimeInstallation]
      })
    }
    if (path === '/api/v1/simulation/scene-catalog' && method === 'GET') {
      return json(200, { scenes: [catalogScene] })
    }
    if (path.endsWith('/simulation/project-scenes') && method === 'GET') {
      return json(200, { project_scenes: [projectScene] })
    }
    if (path.endsWith('/simulation/runtime/ensure') && method === 'POST') {
      return json(200, {
        runtime: {
          runtime_id: 'runtime-e2e',
          runtime_profile_id: 'native-mujoco',
          state: 'ready'
        }
      })
    }
    if (path.endsWith('/simulation/snapshot') && method === 'GET') return json(200, snapshot())
    if (path.endsWith('/simulation/runtime-profiles') && method === 'GET') {
      return json(200, {
        runtime_profiles: [
          {
            runtime_profile_id: 'native-mujoco',
            name: 'Native MuJoCo',
            scene_types: ['scene-document'],
            supports_authoring: true
          }
        ]
      })
    }
    if (path.endsWith('/simulation/scenes') && method === 'GET') {
      return json(200, { scenes: builtScene ? [nativeScene, builtScene] : [nativeScene] })
    }
    if (path.endsWith('/simulation/scene-assets') && method === 'GET') {
      return json(200, { assets: assetCatalog })
    }
    if (path.endsWith('/simulation/scene-documents') && method === 'GET') {
      return json(200, { documents })
    }
    if (path.endsWith('/simulation/scene-documents') && method === 'POST') {
      const body = request.postDataJSON()
      expect(body.runtime_installation_id).toBe(runtimeInstallation.installation_id)
      const document = documentTemplate(body.name)
      documents.unshift(document)
      return json(201, { document })
    }
    if (
      path.endsWith('/simulation/project-scenes/project-scene-e2e/layout-drafts') &&
      method === 'POST'
    ) {
      const body = request.postDataJSON()
      if (!['copy_variant', 'empty_layout'].includes(body.initialization)) {
        return json(400, { error: { message: '不支持的 Layout 初始化方式' } })
      }
      const document = documentTemplate(body.name)
      document.authoring.source_variant_id = body.source_variant_id
      if (body.initialization === 'empty_layout') {
        document.nodes = document.nodes.filter((node) => node.id === 'robot-r1')
      }
      documents.unshift(document)
      return json(201, { scene_document: document })
    }
    if (path.endsWith('/simulation/scene-documents/doc-e2e/operations') && method === 'POST') {
      const body = request.postDataJSON()
      const current = documents[0]
      if (body.revision !== current.revision) {
        return json(409, { error: { message: '场景草稿 revision 已变化' } })
      }
      try {
        const { document, validation } = applyOperationsFixture(current, body.operations)
        if (!validation.valid) return json(409, { validation })
        documents.splice(0, documents.length, document)
        return json(200, { document })
      } catch (error) {
        return json(409, { error: { message: error.message } })
      }
    }
    if (path.endsWith('/scene-documents/doc-e2e/validate')) {
      const validation = validateDocumentFixture(documents[0])
      return json(200, { validation })
    }
    if (path.endsWith('/scene-documents/doc-e2e/build')) {
      const validation = validateDocumentFixture(documents[0])
      if (!validation.valid) return json(409, { validation })
      builtScene = {
        scene_key: 'project-e2e-build-e2e',
        name: 'E2E Scene',
        runtime_profile_id: 'native-mujoco',
        layouts: ['version-1']
      }
      return json(201, {
        runtime_bundle: {
          runtime_bundle_id: 'runtime-bundle-e2e',
          document_id: 'doc-e2e',
          revision: documents[0].revision,
          scene_version: 1,
          scene_key: builtScene.scene_key,
          runtime_profile_id: 'native-mujoco',
          document: documents[0],
          validation,
          created_at: now
        },
        runtime_result: {
          runtime_bundle_id: 'runtime-bundle-e2e',
          scene_key: builtScene.scene_key,
          runtime_scene_key: builtScene.scene_key,
          runtime_profile_id: 'native-mujoco',
          valid: validation.valid,
          issues: validation.issues,
          descriptor: builtScene
        }
      })
    }
    if (path.endsWith('/scene-documents/doc-e2e/publish') && method === 'POST') {
      const body = request.postDataJSON()
      const current = documents[0]
      const validation = validateDocumentFixture(current)
      if (!validation.valid || body.revision !== current.revision || !builtScene) {
        return json(409, { validation })
      }
      const document = {
        ...current,
        status: 'published',
        version: current.version + 1,
        revision: current.revision + 1,
        updated_at: now
      }
      documents.splice(0, documents.length, document)
      return json(200, { document })
    }
    if (path.endsWith('/scene-documents/doc-e2e/fork') && method === 'POST') {
      const body = request.postDataJSON()
      const current = documents[0]
      if (current.status !== 'published') {
        return json(409, { error: { message: '只有已发布场景可以创建新草稿' } })
      }
      const document = {
        ...JSON.parse(JSON.stringify(current)),
        id: 'doc-e2e-v2',
        name: body.name,
        status: 'draft',
        revision: 1,
        updated_at: now
      }
      documents.unshift(document)
      return json(201, { document })
    }
    if (
      path.endsWith('/simulation/project-scenes/project-scene-e2e/instances') &&
      method === 'POST'
    ) {
      const body = request.postDataJSON()
      activeInstance = {
        instance_id: 'instance-e2e',
        catalog_scene_id: catalogScene.scene_id,
        scene_version: projectScene.scene_version,
        scene_key: nativeScene.scene_key,
        layout: body.variant_id,
        variant_id: body.variant_id,
        generation: 1,
        runtime_id: 'runtime-e2e',
        runtime_profile_id: runtimeInstallation.profile_id,
        state: 'running',
        sim_time: 0
      }
      return json(201, { instance: activeInstance })
    }
    if (path.endsWith('/instances/instance-e2e') && method === 'GET') {
      return json(200, { instance: activeInstance })
    }
    if (path.endsWith('/instances/instance-e2e/snapshot')) {
      return json(200, {
        snapshot: {
          scene_key: activeInstance.scene_key,
          instance_id: activeInstance.instance_id,
          generation: activeInstance.generation,
          coordinate_frame: 'world',
          robots: [robot],
          objects: [{ source_id: 'box-001', name: 'Box 001', category: 'box', pose: {} }],
          regions: [{ source_id: 'target', name: 'Target', category: 'region', pose: {} }],
          sensors,
          observed_at: now
        }
      })
    }
    if (path.endsWith('/instances/instance-e2e/robots')) return json(200, { robots: [robot] })
    if (path.endsWith('/robots/r1-pro-001/state')) {
      return json(200, {
        state: {
          robot_id: robot.robot_id,
          generation: activeInstance.generation,
          base_pose: {
            position: [0, 0, 0.01],
            quaternion_xyzw: [0, 0, 0, 1],
            frame_id: 'world'
          },
          joints: {
            left_arm_joint1: { position: 0, velocity: 0 },
            right_arm_joint1: { position: 0, velocity: 0 }
          },
          end_effectors: {},
          grippers: { left: 0.04, right: 0.04 },
          in_hold: false
        }
      })
    }
    if (path.endsWith('/robots/r1-pro-001/sensors')) return json(200, { sensors })
    if (path.endsWith('/instances/instance-e2e/viewer-scene/content')) {
      return route.fulfill({
        status: 200,
        contentType: 'model/gltf-binary',
        body: minimalViewerGLB()
      })
    }
    if (path.endsWith('/instances/instance-e2e/viewer-scene')) {
      return json(200, {
        viewer_scene: {
          // stop 与 Vue watcher 同一轮发生时，已经发出的只读请求仍可以完成；
          // Store 随后会按 instance=null 丢弃该场景，不产生控制或资源重建。
          generation: activeInstance?.generation || 2,
          scene_revision: 'fixture-scene-v1',
          coordinate_frame: 'world',
          content_url:
            '/api/v1/projects/proj-v020-demo/simulation/instances/instance-e2e/viewer-scene/content',
          pose_stream_url: 'ws://127.0.0.1/ws/simulation-pose?instance_id=instance-e2e',
          dynamic_node_order: [],
          cameras: [
            {
              camera_id: 'camera-front',
              name: '固定相机',
              position: [3, -4, 2],
              quaternion_xyzw: [0, 0, 0, 1],
              fovy: 45
            }
          ]
        }
      })
    }
    const operation = path.match(/\/instances\/instance-e2e\/(pause|resume|step|reset|stop)$/)?.[1]
    if (operation && method === 'POST') {
      if (operation === 'stop') {
        const stopped = { ...activeInstance, state: 'stopped' }
        activeInstance = null
        return json(200, { instance: stopped })
      }
      if (operation === 'pause') activeInstance = { ...activeInstance, state: 'paused' }
      if (operation === 'resume') activeInstance = { ...activeInstance, state: 'running' }
      if (operation === 'step')
        activeInstance = { ...activeInstance, sim_time: activeInstance.sim_time + 0.002 }
      if (operation === 'reset')
        activeInstance = {
          ...activeInstance,
          generation: activeInstance.generation + 1,
          state: 'running',
          sim_time: 0
        }
      return json(200, { instance: activeInstance })
    }
    if (path.endsWith('/robots/r1-pro-001/hold')) {
      const body = request.postDataJSON()
      sdkCommand = {
        command_id: `hold-${activeInstance.generation}`,
        robot_id: robot.robot_id,
        scene_generation: body.scene_generation,
        type: 'hold',
        status: 'succeeded',
        updated_at: now
      }
      return json(200, { command: sdkCommand })
    }
    if (path.match(/\/robots\/r1-pro-001\/commands\/[^/]+\/stop$/) && method === 'POST') {
      sdkCommand = { ...sdkCommand, status: 'cancelled', updated_at: now }
      return json(200, { command: sdkCommand })
    }
    if (path.match(/\/robots\/r1-pro-001\/commands\/[^/]+$/) && method === 'GET') {
      sdkCommand = { ...sdkCommand, status: 'running', updated_at: now }
      return json(200, { command: sdkCommand })
    }
    if (path.endsWith('/robots/r1-pro-001/commands')) {
      const body = request.postDataJSON()
      sdkCommand = { ...body, robot_id: robot.robot_id, status: 'accepted', updated_at: now }
      return json(202, { command: sdkCommand })
    }
    return json(404, { error: { code: 'NOT_FOUND', message: `未模拟 ${method} ${path}` } })
  })

  await page.goto('/projects/proj-v020-demo/studio?activity=explorer')
  await expect(page.getByText('v0.2 演示项目', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('project-simulation-scenes')).toBeVisible()

  // 普通用户不能创建任意空白场景；必须从公共 native 模板派生 Project Layout。
  const sceneResources = page.getByTestId('project-simulation-scenes')
  await sceneResources.getByRole('button', { name: /拆码垛场景/ }).click()
  await expect(page.getByText('公共只读场景 · 可派生 Layout')).toBeVisible()
  await page.getByRole('button', { name: '基于此 Layout 创建项目副本', exact: true }).click()
  const prompt = page.locator('.el-message-box')
  await prompt.locator('input').fill('E2E Layout')
  await prompt.getByRole('button', { name: 'OK' }).click()
  await expect(prompt).toBeHidden()
  await expect(page.getByText('E2E Layout', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('优先显示登记素材', { exact: false })).toBeVisible()

  const editorHost = page.locator('.three-host')
  const lockedRobotNode = page.getByRole('button', { name: 'R1 Pro robot 模板锁定' })
  await expect(lockedRobotNode).toBeVisible()
  await page.getByTestId('studio-editor').getByRole('button', { name: '素材', exact: true }).click()
  const boxAsset = page.locator('.asset-drawer button').filter({ hasText: 'Box' })
  await boxAsset.dispatchEvent('dragstart')
  await editorHost.dispatchEvent('drop')
  await expect(lockedRobotNode).toBeVisible()
  await expect(page.getByRole('button', { name: /Box \d+ object/ })).toBeVisible()

  const editorPanel = page.getByTestId('studio-editor')
  await editorPanel.getByRole('button', { name: '构建', exact: true }).click()
  await editorPanel.getByRole('button', { name: '发布不可修改版本', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建新版本草稿', exact: true })).toBeVisible()

  // 已发布目录场景从 Project 资源详情启动；启动时自动 Ensure Runtime。
  await sceneResources.getByRole('button', { name: /拆码垛场景/ }).click()
  await expect(page.getByText('R1 Pro 三套拆码垛布局')).toBeVisible()
  await expect(page.locator('.scene-visual img')).toHaveAttribute(
    'src',
    '/simulation-previews/depalletizing-r1pro.svg'
  )
  await expect(page.locator('.variant-grid img')).toHaveCount(3)
  await page.getByRole('button', { name: '启动此 Layout', exact: true }).click()
  await expect(page.getByRole('tab', { name: /Physics Viewer/ })).toBeVisible()
  const viewerCanvas = page.locator('.physics-scene-viewer canvas')
  await expect(viewerCanvas).toBeVisible()
  const viewerBox = await viewerCanvas.boundingBox()
  expect(viewerBox).not.toBeNull()
  await page.mouse.move(viewerBox.x + 100, viewerBox.y + 100)
  await page.mouse.down()
  await page.mouse.move(viewerBox.x + 180, viewerBox.y + 140)
  await page.mouse.up()
  await page.mouse.wheel(0, -120)
  await expect(page.locator('.viewer-hint')).toContainText('左键旋转')
  // Three.js OrbitControls 完全在浏览器本地工作，不再向 Runtime 发送相机控制。

  await page.locator('.viewer-toolbar .el-select').filter({ hasText: '自由相机' }).click()
  await page.getByRole('option', { name: '固定相机' }).click()
  await expect(page.locator('.viewer-hint')).toContainText('固定相机')

  // 运行信息只在 Simulation 活动栏；多路传感器使用中央 Sensor Viewer。
  await page.getByRole('button', { name: '仿真', exact: true }).click()
  await expect(page.getByText('当前场景实例')).toBeVisible()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('layout001 · g1 · running')
  await page.getByRole('button', { name: 'Sensor Viewer', exact: true }).click()
  expect(browserErrors).toEqual([])
  await expect(page.getByAltText('rgb 传感器画面')).toHaveAttribute('src', /^blob:/)
  const depthCanvas = page.getByRole('img', { name: 'depth 传感器画面' })
  await expect(depthCanvas).toHaveAttribute('width', '2')
  await expect(depthCanvas).toHaveAttribute('height', '2')
  const depthTile = page.locator('.camera-tile').filter({ hasText: 'front_depth' })
  await expect(depthTile).toContainText('#4')
  await expect(depthTile).toContainText('0.10000–0.80000 raw')
  await expect(depthTile).toContainText('2×2')
  const depthPixels = await depthCanvas.evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, 2, 2).data
    return { first: [...pixels.slice(0, 4)], last: [...pixels.slice(12, 16)] }
  })
  expect(depthPixels.first[3]).toBe(255)
  expect(depthPixels.last[3]).toBe(255)
  expect(depthPixels.first).not.toEqual(depthPixels.last)
  await expect(depthTile).not.toContainText('#99')
  await page.getByRole('tab', { name: /Physics Viewer/ }).click()

  const topbar = page.locator('.viewer-toolbar')
  await topbar.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(topbar.getByRole('button', { name: '继续', exact: true })).toBeEnabled()
  await topbar.getByRole('button', { name: '单步', exact: true }).click()
  await topbar.getByRole('button', { name: '继续', exact: true }).click()
  await topbar.getByRole('button', { name: '重置', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '重置' }).click()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('layout001 · g2 · running')

  // 低层 SDK 只从开发模式下的 Robot Inspector 打开，不占用统一底部面板。
  await page.getByRole('button', { name: /r1-pro-001/ }).click()
  await page.getByRole('button', { name: 'Robot SDK Debug', exact: true }).click()
  const sdkPanel = page.locator('.sdk-debug-panel')
  await sdkPanel.getByRole('button', { name: '发送轨迹', exact: true }).click()
  await expect(sdkPanel).toContainText('accepted')
  await sdkPanel.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(sdkPanel).toContainText('running')
  await sdkPanel.getByRole('button', { name: '停止', exact: true }).click()
  await expect(sdkPanel).toContainText('cancelled')

  await page.reload()
  await page.getByRole('button', { name: '仿真', exact: true }).click()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('layout001 · g2 · running')
  await page.getByRole('button', { name: 'Physics Viewer', exact: true }).click()
  await expect(page.locator('.physics-scene-viewer canvas')).toBeVisible()

  const refreshedToolbar = page.locator('.viewer-toolbar')
  await refreshedToolbar.getByRole('button', { name: '停止场景', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '停止' }).click()
  await expect(page.getByText('没有运行中的场景。从 Project 场景详情页启动。')).toBeVisible()

  await page.getByRole('button', { name: '资源', exact: true }).click()
  // stop 后活动槽位必须立即释放；无需刷新 Project 即可启动另一 Layout。
  await sceneResources.getByRole('button', { name: /拆码垛场景/ }).click()
  await page.locator('.variant-grid button').nth(1).click()
  await page.getByRole('button', { name: '启动此 Layout', exact: true }).click()
  await expect(page.getByRole('tab', { name: /Physics Viewer/ })).toBeVisible()
  await page.getByRole('button', { name: '仿真', exact: true }).click()
  await expect(page.getByTestId('studio-primary-sidebar')).toContainText('layout002 · g1 · running')
  await page.getByRole('button', { name: '资源', exact: true }).click()

  // 编辑草稿与 Runtime 生命周期独立；场景运行时仍可继续创建下一版草稿。
  await sceneResources
    .getByRole('button', { name: /E2E Layout/ })
    .first()
    .click()
  await page.getByRole('button', { name: '创建新版本草稿', exact: true }).click()
  const forkPrompt = page.locator('.el-message-box')
  await forkPrompt.locator('input').fill('E2E Layout v2')
  await forkPrompt.getByRole('button', { name: 'OK' }).click()
  await expect(forkPrompt).toBeHidden()
  await expect(page.getByText('E2E Layout v2', { exact: true }).first()).toBeVisible()

  expect(browserErrors).toEqual([])
})
test('Runtime 离线时显示 interrupted、禁用控制，并由正常快照恢复', async ({ page }) => {
  let interrupted = true
  const mutatingCalls = []
  const instance = {
    instance_id: 'instance-interrupted',
    scene_key: 'depalletizing',
    layout: 'layout001',
    generation: 4,
    runtime_id: 'runtime-interrupted',
    runtime_profile_id: 'native-mujoco',
    state: 'running',
    sim_time: 12.5
  }
  const robot = {
    robot_id: 'r1-pro-001',
    model: 'r1pro',
    capabilities: { commands: ['joint_trajectory'], sensors: ['rgb'] }
  }
  const runtimeInstallation = {
    installation_id: 'local-native-mujoco',
    profile_id: 'native-mujoco',
    name: 'Native MuJoCo',
    engine: 'mujoco',
    loader: 'native',
    launch_mode: 'uv',
    enabled: true,
    status: interrupted ? 'offline' : 'ready',
    capabilities: { viewer: true, editable_scene: true, robot_commands: true }
  }

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (!['GET', 'HEAD'].includes(method)) mutatingCalls.push(`${method} ${path}`)

    if (path === '/api/v1/system/healthz') return json(200, { status: 'ok' })
    if (path.endsWith('/studio/snapshot')) {
      return json(200, {
        snapshot: {
          project: {
            id: 'e2e',
            name: 'Interrupted E2E',
            mode: 'development',
            revision: 1,
            is_active: true
          },
          conversations: [],
          runs: [],
          pending_interactions: [],
          event_sequence: 0
        }
      })
    }
    if (path === '/api/v1/simulation/runtime-installations') {
      return json(200, {
        runtime_installations: [
          { ...runtimeInstallation, status: interrupted ? 'offline' : 'ready' }
        ]
      })
    }
    if (path.endsWith('/simulation/runtime-preference')) {
      return json(200, {
        runtime_profile_id: runtimeInstallation.profile_id,
        preferred_runtime_installation_id: runtimeInstallation.installation_id,
        compatible_runtime_installations: [
          { ...runtimeInstallation, status: interrupted ? 'offline' : 'ready' }
        ]
      })
    }
    if (path === '/api/v1/simulation/scene-catalog') return json(200, { scenes: [] })
    if (path.endsWith('/simulation/project-scenes')) {
      return json(200, { project_scenes: [] })
    }
    if (path.endsWith('/simulation/snapshot')) {
      return json(200, {
        simulation: {
          project_id: 'proj-v020-demo',
          revision: 9,
          runtimes: [
            {
              runtime_id: 'runtime-interrupted',
              runtime_profile_id: 'native-mujoco',
              state: interrupted ? 'offline' : 'ready',
              capabilities: { viewer: false }
            }
          ],
          scenes: [{ scene_key: 'depalletizing', layouts: ['layout001'] }],
          instance,
          robots: interrupted ? [] : [robot],
          ...(interrupted
            ? {
                recovery: 'runtime_offline',
                recovery_info: {
                  code: 'runtime_offline',
                  derived_state: 'interrupted',
                  message: 'Runtime 当前不可连接，场景实例状态无法继续确认',
                  last_known_state: 'running'
                }
              }
            : {})
        }
      })
    }
    if (path.endsWith('/simulation/runtime-profiles')) {
      return json(200, {
        runtime_profiles: [
          {
            runtime_profile_id: 'native-mujoco',
            name: 'Native MuJoCo',
            capabilities: { viewer: false }
          }
        ]
      })
    }
    if (path.endsWith('/simulation/scene-documents')) return json(200, { documents: [] })
    if (path.endsWith('/simulation/scene-assets')) return json(200, { assets: [] })
    if (path.endsWith('/instances/instance-interrupted/snapshot')) {
      return json(200, {
        snapshot: {
          scene_key: 'depalletizing',
          instance_id: instance.instance_id,
          generation: instance.generation,
          coordinate_frame: 'world',
          robots: [robot],
          objects: [],
          regions: [],
          sensors: []
        }
      })
    }
    if (path.endsWith('/instances/instance-interrupted/robots')) {
      return json(200, { robots: [robot] })
    }
    if (path.endsWith('/robots/r1-pro-001/state')) {
      return json(200, { state: { robot_id: robot.robot_id, generation: 4 } })
    }
    if (path.endsWith('/robots/r1-pro-001/sensors')) return json(200, { sensors: [] })
    return json(404, { error: { message: `未模拟 ${method} ${path}` } })
  })

  await page.goto('/projects/proj-v020-demo/studio?activity=simulation')

  const sidebar = page.getByTestId('studio-primary-sidebar')
  await expect(sidebar).toContainText('Runtime 当前不可连接')
  await expect(sidebar).toContainText('layout001 · g4 · interrupted')
  await expect(sidebar.getByRole('button', { name: '同步地图', exact: true })).toBeDisabled()
  await sidebar.getByRole('button', { name: 'Physics Viewer', exact: true }).click()
  const viewer = page.locator('.physics-scene-viewer')
  await expect(viewer).toContainText('Runtime 中断')
  await expect(viewer.getByRole('button', { name: '暂停', exact: true })).toBeDisabled()
  await expect(viewer.getByRole('button', { name: '重置', exact: true })).toBeDisabled()
  await expect(viewer.getByRole('button', { name: '停止场景', exact: true })).toBeDisabled()
  expect(mutatingCalls).toEqual([])

  interrupted = false
  await page.reload()

  await expect(sidebar).not.toContainText('Runtime 当前不可连接')
  await expect(sidebar).toContainText('layout001 · g4 · running')
  await expect(sidebar.getByRole('button', { name: '同步地图', exact: true })).toBeEnabled()
  expect(mutatingCalls).toEqual([])
})
