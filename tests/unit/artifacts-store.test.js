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

// Artifact Store 验证元数据按需管理，不把文件 Blob 放进全局响应式状态。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/chat', () => ({
  listArtifacts: vi.fn(),
  registerWorkspaceArtifact: vi.fn(),
  deleteArtifact: vi.fn()
}))

import * as chatApi from '@/api/chat'
import { useArtifactsStore } from '@/stores/artifacts'

describe('artifacts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('加载 Artifact 元数据列表', async () => {
    chatApi.listArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', summary: '报告' }] })
    const store = useArtifactsStore()

    await store.load()

    expect(chatApi.listArtifacts).toHaveBeenCalledWith({ page: 1, pageSize: 200 })
    expect(store.items).toEqual([{ id: 'art-1', summary: '报告' }])
    expect(store.loading).toBe(false)
  })

  it('使用 Project 相对路径登记并置顶新 Artifact', async () => {
    chatApi.registerWorkspaceArtifact.mockResolvedValue({
      artifact: { id: 'art-new', summary: '画像报告' }
    })
    const store = useArtifactsStore()
    store.items = [{ id: 'art-old' }]

    const artifact = await store.register({
      projectId: 'proj-1',
      path: '.semantic-output/profile.json',
      mediaType: 'application/json',
      summary: '画像报告'
    })

    expect(chatApi.registerWorkspaceArtifact).toHaveBeenCalledWith({
      project_id: 'proj-1',
      path: '.semantic-output/profile.json',
      media_type: 'application/json',
      summary: '画像报告'
    })
    expect(artifact.id).toBe('art-new')
    expect(store.items.map((item) => item.id)).toEqual(['art-new', 'art-old'])
  })

  it('普通删除与强制删除使用明确的 force 参数', async () => {
    chatApi.deleteArtifact.mockResolvedValue(undefined)
    const store = useArtifactsStore()
    store.items = [{ id: 'art-1' }, { id: 'art-2' }]

    await store.remove('art-1')
    await store.remove('art-2', { force: true })

    expect(chatApi.deleteArtifact).toHaveBeenNthCalledWith(1, 'art-1', { force: false })
    expect(chatApi.deleteArtifact).toHaveBeenNthCalledWith(2, 'art-2', { force: true })
    expect(store.items).toEqual([])
  })
})
