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

// 工具目录 API（tools store 数据源）。
// 后端契约（internal/server/http/handlers/tools.go，以代码为准）：
// - GET /tools → {sources:[{kind, tools:[…]}]}（builtin 组在前，mcp 组在后）
//   - 统一工具形状：{name(<命名空间>.<动作>), namespace, description,
//     risk(low|medium|high|critical), schema?, health(healthy|unavailable)}
//   - mcp 组工具另有 server（来源 server 名）与 updated_at（条目内容最后
//     变化时间）；内置工具无健康概念，health 恒为 healthy（形状统一）
//   - mcp 组含 unavailable 条目（目录页展示失联工具，与 Agent 注入只取
//     healthy 的视图不同）
import request from './request'

export function listTools() {
  return request.get('/tools')
}

// listSessionAgentTools 返回指定会话 Agent 真正装配的工具集。它与全局
// /tools 安装目录不同，会应用 Profile、ToolSearch、SubAgent 和宿主权限。
export function listSessionAgentTools(sessionId, agentId) {
  return request.get(
    `/chat/sessions/${encodeURIComponent(sessionId)}/agents/${encodeURIComponent(agentId)}/tools`
  )
}
