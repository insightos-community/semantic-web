// Agent 目录 API（agents store 数据源）。
// 后端契约（internal/server/http/handlers/agents.go +
// internal/agent/runtime/roster.go，以代码为准）：
// - GET /agents → {agents:[{id, role, mode, status, model, activity?}]}（按 id 升序）
//   status ∈ starting/idle/running/stopped；activity 无活动时缺省（omitempty）
// - GET /chat/sessions/{id}/agents → 当前会话各 Agent 的模型快照
// - PUT /chat/sessions/{id}/agents/{agent_id}/model → 空闲时覆盖当前会话模型
import request from './request'

export function listAgents() {
  return request.get('/agents')
}

export function updateAgentModels(id, payload) {
  return request.put(`/agents/${encodeURIComponent(id)}/models`, payload)
}

export function listSessionAgents(sessionId) {
  return request.get(`/chat/sessions/${encodeURIComponent(sessionId)}/agents`)
}

export function updateSessionAgentModel(sessionId, agentId, payload) {
  return request.put(
    `/chat/sessions/${encodeURIComponent(sessionId)}/agents/${encodeURIComponent(agentId)}/model`,
    payload
  )
}
