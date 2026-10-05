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

let transport = null

// Studio 的业务命令统一经过 Project 订阅持有的传输层。面板不能自己创建
// WebSocket，否则拖动或关闭面板会意外断开整个 Project 的业务连接。
export function setStudioCommandTransport(next) {
  transport = typeof next === 'function' ? next : null
}

export function clearStudioCommandTransport() {
  transport = null
}

export function hasStudioCommandTransport() {
  return Boolean(transport)
}

export function sendStudioCommand(type, payload = {}) {
  return transport ? transport(type, payload) === true : false
}
