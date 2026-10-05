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

import * as projectsApi from '@/api/projects'
import { useProjectStore } from '@/stores/project'
import { useConversationStore } from '@/stores/conversation'
import { useRunsStore } from '@/stores/runs'
import { useInteractionsStore } from '@/stores/interactions'
import { useMemoryStore } from '@/stores/memory'
import { useChatStore } from '@/stores/chat'
import { useArtifactsStore } from '@/stores/artifacts'
import { useSimulationStore } from '@/stores/simulation'
import { useWorkflowStore } from '@/stores/workflow'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useRobotStore } from '@/stores/robot'
import { useArtifactSyncStore } from '@/stores/artifactSync'

export async function loadStudioSnapshot(projectId, { shouldApply = () => true } = {}) {
  const project = useProjectStore()
  const conversations = useConversationStore()
  const runs = useRunsStore()
  const interactions = useInteractionsStore()
  const memory = useMemoryStore()
  const workflow = useWorkflowStore()
  const semanticMap = useSemanticMapStore()
  const robot = useRobotStore()
  const artifactSync = useArtifactSyncStore()

  const simulation = useSimulationStore()
  project.beginSnapshot(projectId)
  try {
    const response = await projectsApi.getStudioSnapshot(projectId)
    // 测试替身和迁移期 Server 可能仍把 Snapshot 包在 snapshot 字段内；
    // 真实 API 适配器已经解包，这里再做一次无副作用保护。
    const snapshot = response?.snapshot || response
    // Project 路由可能在请求返回前已经切换。任何 Store 写入都必须发生在
    // generation 校验之后，避免迟到的旧 Snapshot 覆盖新 Project。
    if (!shouldApply()) return null
    if (snapshot?.project?.id !== projectId) {
      throw new Error('Studio Snapshot 与当前 Project 不匹配')
    }
    project.hydrateSnapshot(snapshot)
    conversations.hydrate(projectId, snapshot.conversations || [])
    runs.hydrate(projectId, snapshot.runs || [])
    interactions.hydrate(projectId, snapshot.pending_interactions || snapshot.interactions || [])
    memory.hydrateMeta(
      projectId,
      snapshot.memory || {
        revision: snapshot.memory_revision,
        updated_at: snapshot.memory_updated_at
      }
    )
    workflow.hydrate(projectId, snapshot)
    semanticMap.hydrate(projectId, snapshot)
    robot.hydrate(projectId, snapshot.robot_executions || [])
    artifactSync.hydrateExecutions(snapshot.robot_executions || [])
    // 仿真资源与 Project 核心 Snapshot 分开恢复。Runtime 清单损坏或启动失败
    // 只能让 Simulation 显示诊断，不能阻断 Conversation、Memory 等项目功能。
    try {
      await simulation.hydrate(projectId)
    } catch {
      // Store 已保存具体错误和问题记录，Studio 壳继续可用。
    }
    return snapshot
  } catch (error) {
    if (!shouldApply()) return null
    project.failSnapshot(error)
    throw error
  }
}

export function clearStudioState() {
  // Studio 只允许一条 Project 业务连接。切换 Project 前先关闭旧 Chat WS，
  // 再清空所有 Project 业务数据，避免消息和 Artifact 在新 Project 中短暂可见。
  useChatStore().clearProjectData()
  useArtifactsStore().$reset()
  useConversationStore().$reset()
  useRunsStore().$reset()
  useInteractionsStore().$reset()
  useMemoryStore().$reset()
  useWorkflowStore().clear()
  useSemanticMapStore().clear()
  useRobotStore().clear()
  useArtifactSyncStore().clear()
  useSimulationStore().$reset()
  useProjectStore().clearCurrent()
}
