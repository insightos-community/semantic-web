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

let router = null

export function setStudioPanelOpener(next) {
  router = typeof next === 'function' ? next : null
}

export function clearStudioPanelOpener() {
  router = null
}

// 所有入口都经过 StudioView 的区域路由。调用方只表达“打开什么”，不能再
// 根据当前 Dock 焦点猜测应该放到中央、底部还是侧栏。
export function openStudioPanel(panelType, params = {}) {
  return router ? router(panelType, params) !== false : false
}
