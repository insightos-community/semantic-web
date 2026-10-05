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

import { useLayoutStore } from '@/stores/layout'
import { useWorkflowStore } from '@/stores/workflow'

// inspectWorkflowTask 把对话里的「查看 Task」落到 Inspector：加载历史视图，
// 不替换当前工作，也不切换 Editor Tab，避免覆盖正在执行的 Workflow 或 Task 选择。
export async function inspectWorkflowTask({ workflowId, taskId, title } = {}) {
  if (!taskId) return false
  const workflow = useWorkflowStore()
  const layout = useLayoutStore()
  if (workflowId) {
    try {
      await workflow.inspectView(workflowId)
    } catch (error) {
      workflow.error = error.message || 'Workflow 视图加载失败'
      throw error
    }
  }
  layout.select({
    resourceType: 'task',
    resourceId: taskId,
    title: title || taskId
  })
  layout.revealInspector(true)
  return true
}
