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

import request from './request'
import { deviceFixture } from '@/fixtures/deviceFixture'

const fixtureEnabled = () =>
  import.meta.env.VITE_DEVICE_FIXTURES === 'true' || import.meta.env.VITE_STUDIO_FIXTURES === 'true'
const segment = (value) => encodeURIComponent(value)

export async function getDeviceSnapshot() {
  const response = fixtureEnabled()
    ? await deviceFixture.getSnapshot()
    : await request.get('/devices/snapshot')
  return response?.snapshot || response
}

export function createPilotEnrollment() {
  if (fixtureEnabled()) return deviceFixture.createPilotEnrollment()
  return request.post('/pilot-enrollments')
}

export function getDevice(robotId) {
  if (fixtureEnabled()) return deviceFixture.getDevice(robotId)
  return request.get(`/devices/${segment(robotId)}`)
}

export function listProjectRobotExecutions(projectId) {
  if (fixtureEnabled()) return deviceFixture.listProjectExecutions(projectId)
  return request.get(`/projects/${segment(projectId)}/robot-executions`)
}

export function getRobotExecution(executionId, afterSequence = 0) {
  if (fixtureEnabled()) return deviceFixture.getExecution(executionId, afterSequence)
  return request.get(`/robot-executions/${segment(executionId)}`, {
    params: { after_sequence: Math.max(0, Number(afterSequence) || 0) }
  })
}

export function stopRobotExecution(robotId, executionId) {
  if (fixtureEnabled()) return deviceFixture.stopRobot(robotId, executionId)
  return request.post(`/devices/${segment(robotId)}/stop`, { execution_id: executionId })
}

export function startRobotSkillExecution(projectId, robotId, payload) {
  if (fixtureEnabled()) return deviceFixture.startRobotSkillExecution(projectId, robotId, payload)
  return request.post(
    `/projects/${segment(projectId)}/robots/${segment(robotId)}/skill-executions`,
    payload
  )
}

export function installRobotSkill(robotId, { name, version }) {
  if (fixtureEnabled()) return deviceFixture.installSkill(robotId, name, version)
  return request.post(
    `/devices/${segment(robotId)}/skills/${segment(name)}/${segment(version)}/install`
  )
}

export function setRobotSkillEnabled(robotId, { name, version, enabled }) {
  if (fixtureEnabled()) return deviceFixture.setSkillEnabled(robotId, name, version, enabled)
  const action = enabled ? 'enable' : 'disable'
  return request.post(
    `/devices/${segment(robotId)}/skills/${segment(name)}/${segment(version)}/${action}`
  )
}

export function uninstallRobotSkill(robotId, { name, version }) {
  if (fixtureEnabled()) return deviceFixture.uninstallSkill(robotId, name, version)
  return request.delete(`/devices/${segment(robotId)}/skills/${segment(name)}/${segment(version)}`)
}

export function startAbilityDebug(robotId, instanceId, payload) {
  if (fixtureEnabled()) return deviceFixture.startAbilityDebug(robotId, instanceId, payload)
  return request.post(`/devices/${segment(robotId)}/abilities/debug`, {
    ability_instance_id: instanceId,
    ...payload
  })
}

export function stopAbilityDebug(robotId, debugId) {
  if (fixtureEnabled()) return deviceFixture.stopAbilityDebug(robotId, debugId)
  return request.post(`/devices/${segment(robotId)}/abilities/debug/${segment(debugId)}/stop`)
}

export function subscribeDeviceFixture(options) {
  return deviceFixture.subscribe(options)
}

export function usingDeviceFixtures() {
  return fixtureEnabled()
}
