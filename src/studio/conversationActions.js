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

import { ElMessageBox } from 'element-plus'
import { useConversationStore } from '@/stores/conversation'
import { useUiStore } from '@/stores/ui'

export async function requestConversationArchive(item) {
  const conversation = useConversationStore()
  const ui = useUiStore()
  const projectId = conversation.projectId
  if (!item?.id || item.archived || item.archived_at) return false
  try {
    await ElMessageBox.confirm(
      `归档对话“${item.title || '未命名对话'}”？归档后可在“已归档”中查看。`,
      '归档对话',
      { confirmButtonText: '归档', cancelButtonText: '取消' }
    )
  } catch {
    return false
  }
  if (conversation.projectId !== projectId) return false
  try {
    if (!(await conversation.archive(item.id))) return false
    ui.notify({ type: 'success', message: '对话已归档' })
    return true
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '归档失败' })
    return false
  }
}
