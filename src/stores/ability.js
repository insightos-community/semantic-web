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

const MANAGEMENT_TASKS = new Set(['GetExecution', 'StopExecution'])

export function normalizeAbility(ability = {}) {
  const tasks = Array.isArray(ability.tasks) ? ability.tasks : []
  const healthy =
    ability.healthy === true ||
    ['standby', 'running', 'ready'].includes(
      String(ability.state || ability.status || '').toLowerCase()
    )
  const actions = Array.isArray(ability.actions)
    ? ability.actions.map((item) => (typeof item === 'string' ? item : item?.type)).filter(Boolean)
    : []
  const debugTasks = (
    Array.isArray(ability.debug_tasks)
      ? ability.debug_tasks
      : tasks.filter((name) => !MANAGEMENT_TASKS.has(name))
  ).map((task) => (typeof task === 'string' ? { name: task, fields: [] } : { fields: [], ...task }))
  return {
    ...ability,
    package: ability.package || ability.ability_name || '—',
    status:
      ability.status || (healthy ? 'ready' : String(ability.state || 'unknown').toLowerCase()),
    health: ability.health || (healthy ? 'healthy' : 'degraded'),
    actions,
    debug_tasks: debugTasks
  }
}

export const useAbilityStore = defineStore('abilities', {
  state: () => ({
    byRobot: {},
    debugExecutions: {},
    selectedInstanceId: '',
    runningOperations: []
  }),
  getters: {
    forRobot: (state) => (robotId) => state.byRobot[robotId] || [],
    debugForRobot: (state) => (robotId) =>
      Object.values(state.debugExecutions).filter((item) => item.robot_id === robotId),
    isOperating: (state) => (key) => state.runningOperations.includes(key)
  },
  actions: {
    hydrateRobot(robotId, abilities = []) {
      const normalized = abilities.map(normalizeAbility)
      this.byRobot = { ...this.byRobot, [robotId]: normalized }
      if (!normalized.some((item) => item.instance_id === this.selectedInstanceId)) {
        this.selectedInstanceId = normalized[0]?.instance_id || ''
      }
    },
    applyDebugEvent(event) {
      const debug = event?.payload?.debug
      if (!debug?.id) return false
      const current = this.debugExecutions[debug.id]
      const revision = Number(event.resource_revision || debug.revision || 0)
      if (current && revision && revision <= Number(current.revision || 0)) return false
      this.debugExecutions = {
        ...this.debugExecutions,
        [debug.id]: { ...current, ...debug, revision: revision || debug.revision }
      }
      return true
    },
    async startDebug(robotId, instanceId, taskName, input) {
      const key = `start:${robotId}:${instanceId}`
      if (this.runningOperations.includes(key)) return null
      this.runningOperations.push(key)
      try {
        const response = await devicesApi.startAbilityDebug(robotId, instanceId, {
          task_name: taskName,
          input
        })
        const debug = response?.debug_execution
        if (debug?.id) {
          this.debugExecutions = { ...this.debugExecutions, [debug.id]: debug }
        }
        return debug || null
      } finally {
        this.runningOperations = this.runningOperations.filter((item) => item !== key)
      }
    },
    async stopDebug(robotId, debugId) {
      const key = `stop:${debugId}`
      if (this.runningOperations.includes(key)) return null
      this.runningOperations.push(key)
      try {
        const response = await devicesApi.stopAbilityDebug(robotId, debugId)
        const debug = response?.debug_execution
        if (debug?.id) {
          this.debugExecutions = {
            ...this.debugExecutions,
            [debug.id]: { ...this.debugExecutions[debug.id], ...debug }
          }
        }
        return debug || null
      } finally {
        this.runningOperations = this.runningOperations.filter((item) => item !== key)
      }
    },
    clear() {
      this.$reset()
    }
  }
})
