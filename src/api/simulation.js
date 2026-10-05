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

// 仿真工作区 API。Studio 始终只连接 Semantic Server，Runtime 地址不会暴露给页面。
import request from './request'

const root = (projectId) => `/projects/${encodeURIComponent(projectId)}/simulation`

export const listRuntimeInstallations = () => request.get('/simulation/runtime-installations')
export const reloadRuntimeResources = () => request.post('/simulation/runtime-installations/reload')
export const uninstallRuntime = (id) =>
  request.delete(`/simulation/runtime-installations/${encodeURIComponent(id)}`)

export const probeRuntimeInstallation = (installationId) =>
  request.post(`/simulation/runtime-installations/${encodeURIComponent(installationId)}/probe`)

export const testRuntimeInstallation = (installationId) =>
  request.post(`/simulation/runtime-installations/${encodeURIComponent(installationId)}/start-test`)

export const stopRuntimeInstallation = (installationId) =>
  request.post(`/simulation/runtime-installations/${encodeURIComponent(installationId)}/stop`)

export const setRuntimeInstallationEnabled = (installationId, enabled) =>
  request.put(`/simulation/runtime-installations/${encodeURIComponent(installationId)}/enabled`, {
    enabled: Boolean(enabled)
  })

export const listSceneCatalog = (projectId = '', params = {}) =>
  request.get('/simulation/scene-catalog', {
    params: { ...params, ...(projectId ? { project_id: projectId } : {}) }
  })

export const getProjectRuntimePreference = (projectId) =>
  request.get(`${root(projectId)}/runtime-preference`)

export const setProjectRuntimePreference = (projectId, runtimeProfileId, installationId = '') =>
  request.put(`${root(projectId)}/runtime-preference`, {
    runtime_profile_id: runtimeProfileId,
    preferred_runtime_installation_id: installationId
  })

export const ensureProjectRuntime = (projectId) =>
  request.post(`${root(projectId)}/runtime/ensure`, undefined, { timeout: 120_000 })

export const recoverInterruptedRuntime = (projectId, instanceId) =>
  request.post(`${root(projectId)}/runtime/recover-interrupted`, {
    instance_id: instanceId
  })

export const releaseProjectRuntime = (projectId) =>
  request.post(`${root(projectId)}/runtime/release`)

export const listProjectScenes = (projectId) => request.get(`${root(projectId)}/project-scenes`)
export const removeProjectScene = (projectId, referenceId) =>
  request.delete(`${root(projectId)}/project-scenes/${encodeURIComponent(referenceId)}`)

export const addProjectScene = (projectId, payload) =>
  request.post(`${root(projectId)}/project-scenes`, payload)

export const createProjectLayoutDraft = (projectId, projectSceneId, payload) =>
  request.post(
    `${root(projectId)}/project-scenes/${encodeURIComponent(projectSceneId)}/layout-drafts`,
    payload
  )

export const startProjectScene = (projectId, projectSceneId, payload) =>
  request.post(
    `${root(projectId)}/project-scenes/${encodeURIComponent(projectSceneId)}/instances`,
    payload,
    // 首次启动 native MuJoCo 时 Server 可能需要先拉起受管 Runtime 进程。
    // 这里只放宽创建请求的传输超时；场景和 Robot 的就绪仍由状态事件确认。
    { timeout: 120_000 }
  )

export const switchProjectSceneVariant = (projectId, instanceId, payload) =>
  request.post(
    `${root(projectId)}/instances/${encodeURIComponent(instanceId)}/switch-variant`,
    payload,
    { timeout: 120_000 }
  )

export const getProjectStudioSnapshot = (projectId) =>
  request.get(`/projects/${encodeURIComponent(projectId)}/studio/snapshot`)

export const listRuntimeProfiles = (projectId) => request.get(`${root(projectId)}/runtime-profiles`)

export const ensureRuntime = (projectId, profileId) =>
  request.post(
    `${root(projectId)}/runtime/ensure?runtime_profile_id=${encodeURIComponent(profileId)}`,
    undefined,
    { timeout: 120_000 }
  )
export const getSimulationSnapshot = (projectId) => request.get(`${root(projectId)}/snapshot`)
export const listScenes = (projectId) => request.get(`${root(projectId)}/scenes`)

export const startScene = (projectId, sceneKey, payload) =>
  request.post(`${root(projectId)}/scenes/${encodeURIComponent(sceneKey)}/instances`, payload, {
    timeout: 120_000
  })

export const getSceneInstance = (projectId, instanceId) =>
  request.get(`${root(projectId)}/instances/${encodeURIComponent(instanceId)}`)

export const operateScene = (projectId, instanceId, operation, payload = undefined) =>
  request.post(
    `${root(projectId)}/instances/${encodeURIComponent(instanceId)}/${operation}`,
    payload,
    // 原生 reset/stop 可能清理较大场景；快速读取与暂停/继续保留默认预算。
    ['reset', 'stop'].includes(operation) ? { timeout: 120_000 } : undefined
  )

export const getSceneSnapshot = (projectId, instanceId) =>
  request.get(`${root(projectId)}/instances/${encodeURIComponent(instanceId)}/snapshot`)

export const getViewerScene = (projectId, instanceId) =>
  request.get(`${root(projectId)}/instances/${encodeURIComponent(instanceId)}/viewer-scene`)

export const syncSceneMap = (projectId, instanceId) =>
  request.post(`${root(projectId)}/instances/${encodeURIComponent(instanceId)}/sync-map`)

export const getSceneEvaluation = (projectId, instanceId) =>
  request.get(`${root(projectId)}/instances/${encodeURIComponent(instanceId)}/evaluation`)

export const listRobots = (projectId, instanceId) =>
  request.get(`${root(projectId)}/instances/${encodeURIComponent(instanceId)}/robots`)

export const resolveSourceLink = (projectId, instanceId, params) =>
  request.get(`${root(projectId)}/instances/${encodeURIComponent(instanceId)}/source-links`, {
    params
  })

const robotRoot = (projectId, instanceId, robotId) =>
  `${root(projectId)}/instances/${encodeURIComponent(instanceId)}/robots/${encodeURIComponent(robotId)}`

export const getRobotState = (projectId, instanceId, robotId) =>
  request.get(`${robotRoot(projectId, instanceId, robotId)}/state`)

export const listRobotSensors = (projectId, instanceId, robotId) =>
  request.get(`${robotRoot(projectId, instanceId, robotId)}/sensors`)

export const submitRobotCommand = (projectId, instanceId, robotId, payload) =>
  request.post(`${robotRoot(projectId, instanceId, robotId)}/commands`, payload)

export const getRobotCommand = (projectId, instanceId, robotId, commandId) =>
  request.get(
    `${robotRoot(projectId, instanceId, robotId)}/commands/${encodeURIComponent(commandId)}`
  )

export const stopRobotCommand = (projectId, instanceId, robotId, commandId) =>
  request.post(
    `${robotRoot(projectId, instanceId, robotId)}/commands/${encodeURIComponent(commandId)}/stop`
  )

export const holdRobot = (projectId, instanceId, robotId, sceneGeneration) =>
  request.post(`${robotRoot(projectId, instanceId, robotId)}/hold`, {
    scene_generation: sceneGeneration
  })

export const listSceneAssets = (projectId) => request.get(`${root(projectId)}/scene-assets`)

export const listSceneDocuments = (projectId) => request.get(`${root(projectId)}/scene-documents`)

export const createSceneDocument = (projectId, name) =>
  request.post(`${root(projectId)}/scene-documents`, { name })

export const getSceneDocument = (projectId, documentId) =>
  request.get(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}`)

export const saveSceneDocument = (projectId, documentId, revision, document) =>
  request.put(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}`, {
    revision,
    document
  })

export const applySceneOperations = (projectId, documentId, revision, operations) =>
  request.post(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/operations`, {
    revision,
    operations
  })

export const validateSceneDocument = (projectId, documentId) =>
  request.post(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/validate`)

export const buildSceneDocument = (projectId, documentId) =>
  request.post(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/build`)

export const publishSceneDocument = (projectId, documentId, revision) =>
  request.post(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/publish`, {
    revision
  })

export const forkSceneDocument = (projectId, documentId, name) =>
  request.post(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/fork`, {
    name
  })

export const listDocumentLayouts = (projectId, documentId) =>
  request.get(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/layouts`)

export const createDocumentLayout = (projectId, documentId, name) =>
  request.post(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/layouts`, {
    name
  })

export const renameDocumentLayout = (projectId, documentId, revision, name) =>
  request.patch(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/layout`, {
    revision,
    name
  })

export const deleteDocumentLayout = (projectId, documentId) =>
  request.delete(`${root(projectId)}/scene-documents/${encodeURIComponent(documentId)}/layout`)

export const exportScenePackage = (projectId, sceneId) =>
  request.get(`${root(projectId)}/scenes/${encodeURIComponent(sceneId)}/package`, {
    responseType: 'blob'
  })

export const importScenePackage = (projectId, data) =>
  request.post(`${root(projectId)}/scene-packages/import`, data, {
    headers: { 'Content-Type': 'application/zip' }
  })
