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

// request.js 401 单飞刷新 + 原请求重放链路（14-frontend-api §3）
// 后端契约：refresh 无独立 refresh_token，Bearer 旧 token 换新 token；
// /auth/* 请求自身的 401 不再触发刷新（防递归）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/router', () => ({ default: { push: vi.fn() } }))

vi.mock('axios', () => {
  // 伪 axios 实例：本身可调用（重放 request(config)），另带 get/post/拦截器注册表
  const instance = vi.fn()
  instance.defaults = { baseURL: '/api/v1' }
  instance.get = vi.fn()
  instance.post = vi.fn()
  instance.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() }
  }
  return { default: { create: vi.fn(() => instance), post: vi.fn() } }
})

import axios from 'axios'
import router from '@/router'
import '@/api/request' // 副作用：在 mock 实例上注册拦截器
import { useSessionStore } from '@/stores/session'

const api = axios.create() // 与 request.js 内部同一个 mock 实例
// 响应拦截器的拒绝处理器（第二个参数），模块加载时注册一次
const onRejected = api.interceptors.response.use.mock.calls[0][1]

function err401(config, body = { code: 'AUTH_TOKEN_EXPIRED', message: '访问令牌已过期' }) {
  return { response: { status: 401, data: { error: body } }, config }
}

describe('request · 401 刷新重放', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('401 → 刷新成功（写新 token）→ 重放原请求', async () => {
    const session = useSessionStore()
    session.setAuth({ token: 'old-token', user: { id: 'admin', name: 'admin' } })
    api.post.mockResolvedValue({ token: 'new-token', expires_at: '2026-08-04T00:00:00Z' })
    api.mockResolvedValue({ replayed: true })

    const result = await onRejected(err401({ url: '/chat/sessions', method: 'get' }))

    expect(api.post).toHaveBeenCalledWith('/auth/refresh')
    expect(session.token).toBe('new-token')
    expect(session.user).toEqual({ id: 'admin', name: 'admin' }) // 用户信息保留
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/chat/sessions', _retried: true })
    )
    expect(result).toEqual({ replayed: true })
  })

  it('并发 401 共享同一次 refresh（单飞队列）', async () => {
    const session = useSessionStore()
    session.setAuth({ token: 'old-token', user: { id: 'a', name: 'a' } })
    let resolveRefresh
    api.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        })
    )
    api.mockResolvedValue({ replayed: true })

    const p1 = onRejected(err401({ url: '/chat/sessions' }))
    const p2 = onRejected(err401({ url: '/system/ping' }))
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    resolveRefresh({ token: 'new-token' })

    await expect(p1).resolves.toEqual({ replayed: true })
    await expect(p2).resolves.toEqual({ replayed: true })
    expect(api.post).toHaveBeenCalledTimes(1) // 只刷新一次
    expect(api).toHaveBeenCalledTimes(2) // 两个原请求各自重放
    expect(session.token).toBe('new-token')
  })

  it('refresh 失败：清空登录态并跳 /login，错误码透传', async () => {
    const session = useSessionStore()
    session.setAuth({ token: 'dead-token', user: { id: 'a', name: 'a' } })
    api.post.mockRejectedValue({
      response: {
        status: 401,
        data: { error: { code: 'AUTH_TOKEN_EXPIRED', message: '访问令牌已过期' } }
      }
    })

    await expect(onRejected(err401({ url: '/chat/sessions' }))).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED'
    })
    expect(session.token).toBe('')
    expect(session.user).toBeNull()
    expect(router.push).toHaveBeenCalledWith('/login')
  })

  it('认证请求自身的 401 不触发 refresh（如登录密码错误）', async () => {
    await expect(
      onRejected(
        err401(
          { url: '/auth/login' },
          { code: 'AUTH_INVALID_CREDENTIALS', message: '用户名或密码错误' }
        )
      )
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
    expect(api.post).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('已重放过的请求再次 401 不再 refresh（防循环）', async () => {
    await expect(
      onRejected(err401({ url: '/chat/sessions', _retried: true }))
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('非 401 错误直接按统一格式解析，不触发 refresh', async () => {
    await expect(
      onRejected({ response: { status: 500, data: null }, config: { url: '/x' } })
    ).rejects.toMatchObject({ code: 'HTTP_500', status: 500 })
    expect(api.post).not.toHaveBeenCalled()
  })
})
