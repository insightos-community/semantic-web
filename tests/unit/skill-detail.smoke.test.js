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
// SkillDetail 资源浏览冒烟：标准目录状态不再显示“待接入”占位，资源文件
// 可选择并在右侧预览服务端按需返回的文本内容。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'

import SkillDetail from '@/components/skills/SkillDetail.vue'

const apps = []

function mountDetail(overrides = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const onSelectResource = vi.fn()
  const skill = {
    name: 'data-profile',
    category: 'data',
    description: '生成数据画像',
    when_to_use: '分析 CSV 时',
    body: '# 数据画像',
    resources: [
      { path: 'scripts/profile.py', kind: 'scripts', media_type: 'text/x-python', size: 512 },
      { path: 'references/schema.md', kind: 'references', media_type: 'text/markdown', size: 128 }
    ]
  }
  const app = createApp(SkillDetail, {
    skill,
    onSelectResource,
    ...overrides
  })
  app.use(ElementPlus)
  app.mount(el)
  apps.push(app)
  return { el, onSelectResource }
}

describe('SkillDetail · 标准资源浏览', () => {
  afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.innerHTML = ''
  })

  it('显示真实资源计数并可选择 scripts/reference 文件', async () => {
    const { el, onSelectResource } = mountDetail()
    expect(el.textContent).toContain('scripts/ · 1 个文件')
    expect(el.textContent).toContain('references/ · 1 个文件')
    expect(el.textContent).toContain('assets/ · 未提供')
    expect(el.textContent).not.toContain('待接入')

    const script = [...el.querySelectorAll('.resource-list button')].find((button) =>
      button.textContent.includes('scripts/profile.py')
    )
    script.click()
    await vi.waitFor(() => expect(onSelectResource).toHaveBeenCalledWith('scripts/profile.py'))
  })

  it('展示按需返回的资源正文', () => {
    const { el } = mountDetail({
      resource: {
        resource: { path: 'scripts/profile.py', kind: 'scripts', size: 18 },
        content: "print('profile')\n"
      }
    })
    expect(el.querySelector('.preview-path')?.textContent).toBe('scripts/profile.py')
    expect(el.querySelector('.resource-preview pre')?.textContent).toContain("print('profile')")
  })
})
