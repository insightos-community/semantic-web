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

// 底部记录范围独立于对话和 Inspector；历史只在用户明确选择时切换。
export const useExecutionScopeStore = defineStore('executionScope', {
  state: () => ({
    mode: 'current',
    executionId: '',
    workflowId: '',
    runId: '',
    logEventId: '',
    currentSelection: null,
    expandedExecutions: {},
    processFocus: null,
    navigationOrigin: null
  }),
  actions: {
    inspectExecution(id) {
      this.$patch({
        mode: 'history',
        executionId: id,
        workflowId: '',
        runId: '',
        logEventId: '',
        processFocus: null,
        navigationOrigin: null
      })
    },
    inspectWorkflow(id) {
      this.$patch({
        mode: 'history',
        executionId: '',
        workflowId: id,
        runId: '',
        logEventId: '',
        processFocus: null,
        navigationOrigin: null
      })
    },
    inspectRun(id) {
      this.$patch({
        mode: 'history',
        executionId: '',
        workflowId: '',
        runId: id,
        logEventId: '',
        processFocus: null,
        navigationOrigin: null
      })
    },
    followCurrent() {
      this.$patch({
        mode: 'current',
        executionId: '',
        workflowId: '',
        runId: '',
        logEventId: '',
        processFocus: null,
        navigationOrigin: null
      })
    },
    focusProcess(focus) {
      this.processFocus = { ...focus }
    },
    rememberSource(tab, scopeKey) {
      this.navigationOrigin = {
        tab,
        scopeKey,
        focus: this.processFocus ? { ...this.processFocus } : null,
        logEventId: this.logEventId
      }
    },
    returnToSource(scopeKey) {
      const origin = this.navigationOrigin
      this.navigationOrigin = null
      if (!origin || origin.scopeKey !== scopeKey) return ''
      this.processFocus = origin.focus
      this.logEventId = origin.logEventId
      return origin.tab
    }
  }
})
