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

// v0.2 路由：Project 外只保留 Hub 和全局设置；Project 内统一进入 Studio。
// 旧 Chat/Agent/Skill/Tool/Trace 路由保留兼容入口，但只负责打开对应 Dock 面板。
import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' }
  },
  {
    path: '/',
    component: () => import('@/views/AppShell.vue'),
    children: [
      { path: '', redirect: '/projects' },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/views/ProjectHubView.vue'),
        meta: { title: 'Project Hub' }
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '系统设置' }
      },
      {
        path: 'devices',
        name: 'devices',
        component: () => import('@/views/DevicesView.vue'),
        meta: { title: '设备中心' }
      },
      {
        path: 'devices/:robotId',
        name: 'device-detail',
        component: () => import('@/views/DeviceDetailView.vue'),
        meta: { title: '设备详情' }
      },
      {
        path: 'chat',
        component: () => import('@/views/LegacyStudioRedirect.vue'),
        meta: { title: '对话', studioPanel: 'conversation' }
      },
      {
        path: 'chat/:sessionId/trace/:traceId',
        component: () => import('@/views/LegacyStudioRedirect.vue'),
        meta: { title: 'Trace', studioPanel: 'trace' }
      },
      {
        path: 'agents',
        component: () => import('@/views/LegacyStudioRedirect.vue'),
        meta: { title: 'Agent', studioPanel: 'agents' }
      },
      {
        path: 'skills',
        component: () => import('@/views/LegacyStudioRedirect.vue'),
        meta: { title: '技能库', studioPanel: 'skills' }
      },
      {
        path: 'tools',
        component: () => import('@/views/LegacyStudioRedirect.vue'),
        meta: { title: '工具', studioPanel: 'tools' }
      }
    ]
  },
  {
    path: '/projects/:projectId/studio',
    name: 'studio',
    component: () => import('@/views/StudioView.vue'),
    meta: { title: 'Studio' }
  },
  {
    path: '/projects/:projectId/simulation',
    name: 'simulation',
    redirect: (to) => ({
      name: 'studio',
      params: { projectId: to.params.projectId },
      query: { activity: 'simulation' }
    })
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (to.meta.public) {
    // 已登录访问公开页（/login）直接回主框架
    return session.isLoggedIn ? { path: '/projects' } : true
  }
  if (!session.isLoggedIn) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Semantic Studio` : 'Semantic Studio'
})

export default router
