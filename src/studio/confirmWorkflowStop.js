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

import { h } from 'vue'
import { ElMessageBox } from 'element-plus'

// Both Inspector and Workflow details must confirm the inspected workflow,
// never whichever workflow becomes current while the dialog is open.
export async function confirmWorkflowStop(workflow, ui, workflowId, tasks) {
  const affected = tasks.flatMap((task) =>
    (task.subtasks || [])
      .filter(
        (item) => item.execution_ref && !['completed', 'failed', 'stopped'].includes(item.status)
      )
      .map((item) => `${task.assigned_robot_id || '未知 Robot'} · ${item.execution_ref}`)
  )
  let reason
  try {
    const result = await ElMessageBox.prompt(
      h('div', { class: 'operator-confirm-content' }, [
        h('p', '请再次确认以下 Robot 已经停止并处于安全保持状态：'),
        h(
          'ul',
          (affected.length ? affected : ['未找到 Execution 记录（将保留缺失记录诊断）']).map(
            (item) => h('li', { key: item }, item)
          )
        ),
        h('p', '填写现场确认原因：')
      ]),
      '确认现场安全并终结 Workflow',
      {
        type: 'warning',
        confirmButtonText: '确认安全并终结',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：现场急停已释放，底盘和机械臂均处于保持状态',
        inputValidator: (value) => String(value || '').trim().length > 0 || '必须填写确认原因'
      }
    )
    reason = String(result.value || '').trim()
    if (!reason) return
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ui.notify({ type: 'error', message: error?.message || '无法打开安全确认窗口' })
    }
    return
  }
  try {
    await workflow.confirmStop(workflowId, reason)
    ui.notify({ type: 'success', message: 'Workflow 已按现场安全确认终结' })
  } catch (error) {
    ui.notify({ type: 'error', message: workflow.error || error.message || 'Workflow 终结失败' })
  }
}
