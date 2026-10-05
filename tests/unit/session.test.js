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

// session store 登录/退出动作（F2：auth API 写态/清态语义）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn()
}))

import * as authApi from '@/api/auth'
import { useSessionStore } from '@/stores/session'

describe('session store · 登录态动作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('login 成功：写入 token 并以登录用户名回填 user', async () => {
    authApi.login.mockResolvedValue({ token: 't-123', expires_at: '2026-08-04T00:00:00Z' })
    const session = useSessionStore()

    const data = await session.login('admin', 'admin123')

    expect(authApi.login).toHaveBeenCalledWith('admin', 'admin123')
    expect(session.token).toBe('t-123')
    expect(session.user).toEqual({ id: 'admin', name: 'admin' })
    expect(session.isLoggedIn).toBe(true)
    expect(session.userName).toBe('admin')
    expect(data.token).toBe('t-123')
  })

  it('login 失败：原样抛错（err.code 供页面分支）且不落任何登录态', async () => {
    const err = new Error('用户名或密码错误')
    err.code = 'AUTH_INVALID_CREDENTIALS'
    authApi.login.mockRejectedValue(err)
    const session = useSessionStore()

    await expect(session.login('admin', 'wrong')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS'
    })
    expect(session.token).toBe('')
    expect(session.user).toBeNull()
    expect(session.isLoggedIn).toBe(false)
  })

  it('logout：通知后端注销并清空登录态', async () => {
    authApi.logout.mockResolvedValue({ ok: true })
    const session = useSessionStore()
    session.setAuth({ token: 't-1', user: { id: 'admin', name: 'admin' } })
    session.setTeam({ id: 'team-1', name: 'T1' })

    await session.logout()

    expect(authApi.logout).toHaveBeenCalledTimes(1)
    expect(session.token).toBe('')
    expect(session.user).toBeNull()
    expect(session.currentTeam).toBeNull()
    expect(session.isLoggedIn).toBe(false)
  })

  it('logout：后端不可达/注销失败也照常清态', async () => {
    authApi.logout.mockRejectedValue(new Error('网络异常'))
    const session = useSessionStore()
    session.setAuth({ token: 't-1', user: { id: 'admin', name: 'admin' } })

    await expect(session.logout()).resolves.toBeUndefined()
    expect(session.token).toBe('')
    expect(session.user).toBeNull()
  })

  it('logout：未登录时不调注销 API', async () => {
    const session = useSessionStore()
    await session.logout()
    expect(authApi.logout).not.toHaveBeenCalled()
  })

  it('clearAuth：同步清态（401 刷新失败兜底，不触达 API）', () => {
    const session = useSessionStore()
    session.setAuth({ token: 't-1', user: { id: 'a', name: 'a' } })

    session.clearAuth()

    expect(session.token).toBe('')
    expect(session.user).toBeNull()
    expect(authApi.logout).not.toHaveBeenCalled()
  })
})
