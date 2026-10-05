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

import { readonly, ref } from 'vue'

// Studio 的面板正文由各自领域 Store 管理，但“这个标签能否安全关闭”属于
// Dock 层职责。这里仅登记保存/放弃回调，不保存正文，避免布局持久化时把
// SceneDocument、Memory 等业务内容写进 localStorage。
const guards = new Map()
const revision = ref(0)
let closeRequester = null

function touch() {
  revision.value += 1
}

export const panelGuardRevision = readonly(revision)

export function notifyPanelGuardChanged() {
  touch()
}

export function registerPanelGuard(panelId, guard) {
  if (!panelId || !guard) return () => {}
  guards.set(panelId, guard)
  touch()
  return () => {
    if (guards.get(panelId) === guard) {
      guards.delete(panelId)
      touch()
    }
  }
}

export function panelIsDirty(panelId) {
  const guard = guards.get(panelId)
  return Boolean(guard && (typeof guard.isDirty === 'function' ? guard.isDirty() : guard.dirty))
}

export function dirtyPanelIds(panelIds) {
  return [...new Set(panelIds)].filter(panelIsDirty)
}

export async function savePanels(panelIds) {
  const failures = []
  for (const panelId of panelIds) {
    const guard = guards.get(panelId)
    if (!guard?.save) continue
    try {
      await guard.save()
    } catch (error) {
      failures.push({ panelId, error })
    }
  }
  touch()
  if (failures.length) {
    const error = new Error(`以下页面保存失败：${failures.map((item) => item.panelId).join('、')}`)
    error.failures = failures
    throw error
  }
}

export async function discardPanels(panelIds) {
  for (const panelId of panelIds) {
    const guard = guards.get(panelId)
    if (guard?.discard) await guard.discard()
  }
  touch()
}

export function setPanelCloseRequester(requester) {
  closeRequester = typeof requester === 'function' ? requester : null
}

export function clearPanelCloseRequester(requester) {
  if (!requester || closeRequester === requester) closeRequester = null
}

export function requestPanelClose(panelIds, options = {}) {
  return closeRequester ? closeRequester(panelIds, options) : Promise.resolve(false)
}
