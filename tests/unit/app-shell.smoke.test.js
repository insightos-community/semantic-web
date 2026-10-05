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
// AppShell v2 组件级冒烟：真实路由（memory history）挂载主框架，
// 覆盖顶栏/面包屑/一级侧栏选中态/折叠切换（持久化）/用户卡 popover 退出。
// 布局逻辑正确性只验"能渲染、关键交互元素在位"，像素级验收留手测。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import piniaPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'

vi.mock('@/api/system', () => ({ getHealthz: vi.fn() }))
vi.mock('@/api/auth', () => ({ login: vi.fn(), logout: vi.fn() }))
// ui.notify 走 toast：jsdom 下 stub 掉，避免真实通知组件挂载
vi.mock('vue3-toastify', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  })
}))

import * as systemApi from '@/api/system'
import * as authApi from '@/api/auth'
import AppShell from '@/views/AppShell.vue'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

const stub = (text) => ({ template: `<div class="page-stub">${text}</div>` })

async function mount(path = '/projects') {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const pinia = createPinia()
  pinia.use(piniaPersistedstate)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: stub('登录页'), meta: { public: true, title: '登录' } },
      {
        path: '/',
        component: AppShell,
        children: [
          { path: 'projects', component: stub('Project Hub 页'), meta: { title: 'Project Hub' } },
          { path: 'settings', component: stub('设置页'), meta: { title: '系统设置' } }
        ]
      }
    ]
  })
  const app = createApp({ template: '<router-view />' })
  app.use(pinia)
  app.use(ElementPlus)
  app.use(router)
  router.push(path)
  await router.isReady()
  const session = useSessionStore()
  session.setAuth({ token: 't', user: { id: 'admin', name: 'admin' } })
  app.mount(el)
  return { app, el, router }
}

describe('AppShell v2 · 冒烟挂载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.body.innerHTML = ''
    systemApi.getHealthz.mockResolvedValue({ status: 'ok' })
    authApi.logout.mockResolvedValue({})
  })

  it('渲染顶栏、Project Hub/设置导航、健康点和子路由主区', async () => {
    const { el } = await mount('/projects')
    const text = el.textContent
    expect(text).toContain('Semantic Studio')
    for (const title of ['Project', '系统设置']) {
      expect(text).toContain(title)
    }
    expect(el.querySelector('.breadcrumb').textContent).toContain('Project')
    // 主区渲染子路由 stub
    expect(el.querySelector('.page-stub').textContent).toBe('Project Hub 页')
    // 健康点：poll resolve 后正常（status 四元组 success）
    await vi.waitFor(() => {
      expect(el.textContent).toContain('组件健康 · 正常')
    })
    expect(el.querySelector('.sf-status-dot')?.getAttribute('data-status')).toBe('success')
    // 底部次导航：收起切换 + 用户卡片 + 帮助占位
    expect(el.querySelector('.collapse-toggle')).toBeTruthy()
    expect(el.querySelector('.user-card .user-name').textContent).toBe('admin')
    expect(el.querySelector('.user-avatar').textContent).toBe('A')
  })

  it('选中态在 Project Hub 与系统设置之间切换', async () => {
    const { el, router } = await mount('/projects')
    expect(el.querySelector('.nav-item.is-active').textContent).toContain('Project')
    await router.push('/settings')
    await vi.waitFor(() => {
      expect(el.querySelector('.nav-item.is-active').textContent).toContain('系统设置')
    })
    expect(el.querySelector('.breadcrumb').textContent).toContain('系统设置')
  })

  it('点击导航项跳转对应路由', async () => {
    const { el, router } = await mount('/projects')
    const items = [...el.querySelectorAll('.nav-list .nav-item')]
    items.find((b) => b.textContent.includes('系统设置')).click()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/settings')
    })
    expect(el.querySelector('.page-stub').textContent).toBe('设置页')
  })

  it('折叠切换：184↔72 状态写 ui store 并持久化 localStorage', async () => {
    const { el } = await mount('/projects')
    const ui = useUiStore()
    expect(ui.sidebarCollapsed).toBe(false)
    expect(el.querySelector('.shell-nav').classList.contains('is-collapsed')).toBe(false)

    el.querySelector('.collapse-toggle').click()
    await vi.waitFor(() => {
      expect(ui.sidebarCollapsed).toBe(true)
    })
    expect(el.querySelector('.shell-nav').classList.contains('is-collapsed')).toBe(true)
    // pinia-plugin-persistedstate：ui store pick theme/sidebarCollapsed
    expect(JSON.parse(localStorage.getItem('ui') || '{}').sidebarCollapsed).toBe(true)

    el.querySelector('.collapse-toggle').click()
    await vi.waitFor(() => {
      expect(ui.sidebarCollapsed).toBe(false)
    })
  })

  it('用户卡片 popover：展示用户名，退出登录清态并跳 /login', async () => {
    const { el, router } = await mount('/projects')
    el.querySelector('.user-card').click()
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('退出登录')
    })
    const logoutBtn = [...document.body.querySelectorAll('.el-popover button')].find((b) =>
      b.textContent.includes('退出登录')
    )
    expect(logoutBtn).toBeTruthy()
    logoutBtn.click()
    await vi.waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/login')
    })
    expect(useSessionStore().isLoggedIn).toBe(false)
  })
})
