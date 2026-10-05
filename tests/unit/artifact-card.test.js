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

// @vitest-environment jsdom
// Artifact 卡片通过鉴权 API 按需获取文件本体；本用例重点防止图片请求完成后
// 因 Blob URL 生命周期竞争而一直停留在“加载中”。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('@/api/chat', () => ({
  getArtifact: vi.fn()
}))

import * as chatApi from '@/api/chat'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'

function mountCard(artifact) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const app = createApp(ArtifactCard, { artifact })
  app.use(createPinia())
  app.use(ElementPlus)
  app.mount(target)
  return { app, target }
}

describe('ArtifactCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:artifact-preview')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    })
  })

  it('图片加载完成后展示预览，并在组件卸载时释放 Blob URL', async () => {
    chatApi.getArtifact.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { app, target } = mountCard({
      id: 'art-image',
      media_type: 'image/png',
      size: 5,
      summary: '现场图片'
    })

    await vi.waitFor(() => {
      expect(target.querySelector('img')?.getAttribute('src')).toBe('blob:artifact-preview')
    })
    expect(chatApi.getArtifact).toHaveBeenCalledWith('art-image')
    expect(target.textContent).not.toContain('加载中')

    app.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:artifact-preview')
  })

  it('只有正式引用无MIME时按鉴权响应识别图像，迟到旧图片不覆盖当前证据', async () => {
    let resolveOld
    chatApi.getArtifact.mockImplementation((id) =>
      id === 'old'
        ? new Promise((resolve) => {
            resolveOld = resolve
          })
        : Promise.resolve(new Blob(['new'], { type: 'image/png' }))
    )
    const artifact = ref({ id: 'old', media_type: 'image/png' })
    const target = document.createElement('div')
    const app = createApp({ render: () => h(ArtifactCard, { artifact: artifact.value }) })
    app.use(createPinia())
    app.use(ElementPlus)
    app.mount(target)
    artifact.value = { id: 'new', media_type: '', summary: '新阶段图像' }
    await nextTick()
    await vi.waitFor(() => expect(target.querySelector('img')?.alt).toBe('新阶段图像'))
    expect(chatApi.getArtifact).toHaveBeenCalledWith('new')
    resolveOld(new Blob(['old'], { type: 'image/png' }))
    await nextTick()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(target.querySelector('img')?.alt).toBe('新阶段图像')
    app.unmount()
  })

  it('同一图片的父级对象和摘要更新不打断加载或重建Blob', async () => {
    let resolveImage
    chatApi.getArtifact.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImage = resolve
        })
    )
    const artifact = ref({ id: 'stable-image', media_type: 'image/jpeg', summary: '初始摘要' })
    const target = document.createElement('div')
    const app = createApp({ render: () => h(ArtifactCard, { artifact: artifact.value }) })
    app.use(createPinia())
    app.use(ElementPlus)
    app.mount(target)
    for (let index = 0; index < 20; index++) {
      artifact.value = { ...artifact.value, summary: `反馈 ${index}` }
      await nextTick()
    }
    expect(chatApi.getArtifact).toHaveBeenCalledTimes(1)
    resolveImage(new Blob(['image'], { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(target.querySelector('img')).not.toBeNull())
    for (let index = 0; index < 20; index++) {
      artifact.value = { ...artifact.value, captured_at: String(index) }
      await nextTick()
      expect(target.querySelector('img')?.getAttribute('src')).toBe('blob:artifact-preview')
    }
    expect(chatApi.getArtifact).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    app.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})
