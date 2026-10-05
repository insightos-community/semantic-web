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
// SideList 容器冒烟：四个 slot 渲染、折叠/展开交互、collapsible=false、
// 宽度 prop 覆盖。容器不感知业务，只验容器契约本身。
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import ElementPlus from 'element-plus'
import SideList from '@/components/base/SideList.vue'

function mount(comp) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(comp)
  app.use(ElementPlus)
  app.mount(el)
  return { app, el }
}

const fullSlots = {
  components: { SideList },
  template: `
    <SideList>
      <template #title>会话</template>
      <template #actions><button class="act-btn">新建</button></template>
      <template #search><input class="search-input" placeholder="搜索" /></template>
      <ul class="list-body"><li>条目一</li></ul>
      <template #footer><span class="foot">共 1 条</span></template>
    </SideList>`
}

describe('SideList · 容器契约', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('渲染 title/actions/search/列表/footer 全部 slot，默认宽度取 --sf-sidelist-width', () => {
    const { el } = mount(fullSlots)
    const aside = el.querySelector('.sf-side-list')
    expect(aside).toBeTruthy()
    expect(aside.style.width).toBe('var(--sf-sidelist-width)')
    expect(el.querySelector('.side-list-title').textContent).toBe('会话')
    expect(el.querySelector('.act-btn').textContent).toBe('新建')
    expect(el.querySelector('.search-input')).toBeTruthy()
    expect(el.querySelector('.side-list-body').textContent).toContain('条目一')
    expect(el.querySelector('.side-list-footer').textContent).toContain('共 1 条')
  })

  it('折叠：收起后列表区消失、仅剩展开竖轨；展开后恢复', async () => {
    const { el } = mount(fullSlots)
    el.querySelector('.side-list-toggle').click()
    await nextTick()
    const aside = el.querySelector('.sf-side-list')
    expect(aside.classList.contains('is-collapsed')).toBe(true)
    expect(el.querySelector('.side-list-body')).toBeNull()
    expect(el.querySelector('.expand-rail')).toBeTruthy()

    el.querySelector('.expand-rail').click()
    await nextTick()
    expect(el.querySelector('.sf-side-list').classList.contains('is-collapsed')).toBe(false)
    expect(el.querySelector('.side-list-body').textContent).toContain('条目一')
  })

  it('collapsible=false 时不渲染收起按钮；无 search/footer slot 不渲染对应容器', () => {
    const { el } = mount({
      components: { SideList },
      template: `
        <SideList :collapsible="false">
          <template #title>技能库</template>
          <ul><li>仅列表</li></ul>
        </SideList>`
    })
    expect(el.querySelector('.side-list-toggle')).toBeNull()
    expect(el.querySelector('.side-list-search')).toBeNull()
    expect(el.querySelector('.side-list-footer')).toBeNull()
    expect(el.querySelector('.side-list-body').textContent).toContain('仅列表')
  })

  it('width prop 覆盖默认宽度', () => {
    const { el } = mount({
      components: { SideList },
      template: `
        <SideList width="280px">
          <template #title>宽栏</template>
          <ul><li>x</li></ul>
        </SideList>`
    })
    expect(el.querySelector('.sf-side-list').style.width).toBe('280px')
  })
})
