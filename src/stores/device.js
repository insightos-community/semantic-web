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

import { defineStore } from 'pinia'
import * as devicesApi from '@/api/devices'
import {
  normalizeRobotRuntimeInstance,
  runtimeAllowsRobotExecution,
  runtimeInstanceFromRobot
} from '@/devices/runtimeState'

const snapshotRequests = new WeakMap()

// Runtime revision 只在同一个 instance_id 内递增。Robot 重启后新实例从 1
// 开始，不能被旧实例 stopped 的高 revision 遮盖；迟到的旧实例事件也不能
// 复活旧状态。created_at 是实例代次，updated_at 仅兼容缺少创建时间的旧响应。
const selectRuntime = (current, incoming, authoritative = false) => {
  if (!incoming) return current || null
  if (!current) return incoming
  if (current.instance_id === incoming.instance_id)
    return Number(incoming.revision) > Number(current.revision) ? incoming : current
  const currentTime = Date.parse(current.created_at || current.updated_at)
  const incomingTime = Date.parse(incoming.created_at || incoming.updated_at)
  if (Number.isFinite(currentTime) && Number.isFinite(incomingTime))
    return incomingTime > currentTime ? incoming : current
  // 无法比较代次时，只有完整设备响应可建立新身份；无时序的增量不猜测。
  return authoritative ? incoming : current
}

const normalizeRobot = (robot) => {
  if (!robot?.robot_id) return null
  return {
    progress: null,
    current_run: null,
    installed_skills: [],
    desired_skills: [],
    abilities: [],
    ...robot,
    pilot: { status: 'offline', ...(robot.pilot || {}) },
    ability_framework: { status: 'offline', ...(robot.ability_framework || {}) },
    runtime_instance: normalizeRobotRuntimeInstance(runtimeInstanceFromRobot(robot), robot.robot_id)
  }
}

export const useDeviceStore = defineStore('devices', {
  state: () => ({
    robots: [],
    runtimeInstances: {},
    skillPackages: [],
    snapshotStatus: 'idle',
    connectionStatus: 'offline',
    stale: false,
    lastEventSequence: 0,
    lastSnapshotAt: '',
    error: '',
    operationKeys: []
  }),
  getters: {
    byId: (state) => (robotId) => state.robots.find((robot) => robot.robot_id === robotId) || null,
    onlineCount: (state) =>
      state.robots.filter((robot) => ['online', 'degraded'].includes(robot.pilot?.status)).length,
    busyCount: (state) =>
      state.robots.filter((robot) => ['busy', 'stopping', 'interrupted'].includes(robot.status))
        .length,
    runtimeForRobot: (state) => (robotId) => state.runtimeInstances[robotId] || null,
    executableRuntimeCount: (state) =>
      Object.values(state.runtimeInstances).filter(runtimeAllowsRobotExecution).length,
    runtimeAttentionCount: (state) =>
      Object.values(state.runtimeInstances).filter(
        (runtime) => !runtimeAllowsRobotExecution(runtime) && runtime.status !== 'stopped'
      ).length,
    isOperating: (state) => (key) => state.operationKeys.includes(key)
  },
  actions: {
    async loadSnapshot({ shouldApply = () => true } = {}) {
      const request = {}
      snapshotRequests.set(this, request)
      const current = () => snapshotRequests.get(this) === request && shouldApply()
      this.snapshotStatus = 'loading'
      this.error = ''
      try {
        const snapshot = await devicesApi.getDeviceSnapshot()
        if (!current()) return null
        this.hydrate(snapshot)
        return snapshot
      } catch (error) {
        if (!current()) return null
        this.snapshotStatus = 'error'
        this.error = error.message || '设备状态加载失败'
        throw error
      }
    },
    hydrate(snapshot) {
      const sequence = Number(snapshot?.event_sequence || 0)
      // HTTP 查询可能比正在接收的事件更旧，不能回退连接、占用和 Runtime 状态。
      if (sequence < this.lastEventSequence) {
        this.snapshotStatus = 'ready'
        return false
      }
      const previous = new Map(this.robots.map((robot) => [robot.robot_id, robot]))
      this.robots = Array.isArray(snapshot?.robots)
        ? snapshot.robots
            .map((robot) => {
              const current = previous.get(robot.robot_id)
              const next = normalizeRobot(
                Number(current?.revision || 0) > Number(robot.revision || 0) ? current : robot
              )
              if (next)
                next.runtime_instance = selectRuntime(
                  this.runtimeInstances[robot.robot_id],
                  normalizeRobotRuntimeInstance(robot.runtime_instance, robot.robot_id),
                  true
                )
              return next
            })
            .filter(Boolean)
        : []
      this.runtimeInstances = Object.fromEntries(
        this.robots
          .filter((robot) => robot.runtime_instance)
          .map((robot) => [robot.robot_id, robot.runtime_instance])
      )
      this.skillPackages = Array.isArray(snapshot?.skill_packages) ? snapshot.skill_packages : []
      this.lastEventSequence = sequence
      this.lastSnapshotAt = new Date().toISOString()
      this.snapshotStatus = 'ready'
      this.stale = false
      this.error = ''
      return true
    },
    async loadDevice(robotId) {
      const response = await devicesApi.getDevice(robotId)
      if (response?.device) this.upsert(response.device)
      if (Array.isArray(response?.skill_packages)) this.skillPackages = response.skill_packages
      return response
    },
    upsert(robot) {
      if (!robot?.robot_id) return false
      const index = this.robots.findIndex((item) => item.robot_id === robot.robot_id)
      const current = index < 0 ? null : this.robots[index]
      const olderRobot = robot.revision && Number(robot.revision) < Number(current?.revision || 0)
      const next = normalizeRobot(
        olderRobot
          ? current
          : current
            ? {
                ...current,
                ...robot,
                ...(Object.hasOwn(robot, 'current_execution_id') &&
                !Object.hasOwn(robot, 'current_run')
                  ? { current_run: null, run_id: '', conversation_id: '' }
                  : {}),
                pilot: { ...current.pilot, ...(robot.pilot || {}) },
                ability_framework: {
                  ...current.ability_framework,
                  ...(robot.ability_framework || {})
                },
                installed_skills: robot.installed_skills ?? current.installed_skills,
                desired_skills: robot.desired_skills ?? current.desired_skills,
                abilities: robot.abilities ?? current.abilities
              }
            : robot
      )
      next.runtime_instance = selectRuntime(
        this.runtimeInstances[robot.robot_id],
        normalizeRobotRuntimeInstance(robot.runtime_instance, robot.robot_id),
        !olderRobot
      )
      if (index < 0) this.robots.push(next)
      else this.robots.splice(index, 1, next)
      if (next.runtime_instance) this.runtimeInstances[next.robot_id] = next.runtime_instance
      else delete this.runtimeInstances[next.robot_id]
      return true
    },
    applyRobotEvent(event) {
      const payload = event?.payload || {}
      const robotId = payload.robot?.robot_id || payload.robot_id || payload.pilot?.robot_id
      const current = this.byId(robotId)
      if (!current && !payload.robot?.robot_id) return false
      const revision = Number(event.resource_revision || payload.robot?.revision || 0)
      if (current && revision && revision <= Number(current.revision || 0)) return false
      return this.upsert({
        ...(payload.robot || current),
        robot_id: robotId,
        ...(payload.pilot ? { pilot: payload.pilot } : {}),
        revision: revision || payload.robot?.revision || current?.revision
      })
    },
    applyRuntimeEvent(event) {
      const payload = event?.payload || {}
      const raw = payload.runtime_instance
      const robotId = raw?.robot_id || payload.robot_id || event?.robot_id || ''
      const runtime = normalizeRobotRuntimeInstance(raw, robotId)
      if (!robotId || !runtime) return false
      const current = this.runtimeInstances[robotId]
      const revision = Number(event?.resource_revision || runtime.revision || 0)
      const next = selectRuntime(current, { ...runtime, revision })
      if (next === current) return false
      this.runtimeInstances[robotId] = next
      if (this.byId(robotId)) this.upsert({ robot_id: robotId, runtime_instance: next })
      return true
    },
    setConnectionStatus(status) {
      const previous = this.connectionStatus
      this.connectionStatus = status
      // Initial WebSocket connection follows a fresh HTTP snapshot, not a data gap.
      // Only losing an established stream makes that snapshot stale.
      if (this.snapshotStatus === 'ready' && previous === 'online' && status !== 'online')
        this.stale = true
    },
    advanceSequence(sequence) {
      const next = Number(sequence || 0)
      if (next > this.lastEventSequence) this.lastEventSequence = next
    },
    async withOperation(key, operation) {
      if (this.operationKeys.includes(key)) return null
      this.operationKeys.push(key)
      try {
        return await operation()
      } finally {
        this.operationKeys = this.operationKeys.filter((item) => item !== key)
      }
    },
    async installSkill(robotId, skill) {
      const key = `install:${robotId}:${skill.name}:${skill.version}`
      return this.withOperation(key, async () => {
        const response = await devicesApi.installRobotSkill(robotId, skill)
        if (response?.robot) this.upsert(response.robot)
        return response?.desired_skill || null
      })
    },
    async setSkillEnabled(robotId, skill, enabled) {
      const key = `enable:${robotId}:${skill.name}:${skill.version}`
      return this.withOperation(key, async () => {
        const response = await devicesApi.setRobotSkillEnabled(robotId, { ...skill, enabled })
        if (response?.robot) this.upsert(response.robot)
        return response?.desired_skill || null
      })
    },
    async uninstallSkill(robotId, skill) {
      const key = `uninstall:${robotId}:${skill.name}:${skill.version}`
      return this.withOperation(key, async () => {
        const response = await devicesApi.uninstallRobotSkill(robotId, skill)
        if (response?.robot) this.upsert(response.robot)
        return response?.removed === true
      })
    },
    clear() {
      snapshotRequests.delete(this)
      this.$reset()
    }
  }
})
