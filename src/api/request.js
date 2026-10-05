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

// axios 统一实例（14-frontend-api §3）：
// - baseURL 固定 /api/v1，经 vite proxy / nginx 反代到 semantic-server
// - 请求拦截注入 Bearer token（token 由 session store 持有）
// - 401 单飞刷新队列：并发 401 共享同一次 refresh，失败清空登录态并跳 /login
// - 统一错误格式 {error:{code,message,details}} → reject(Error)，err.code 供上层分支
import axios from 'axios'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 15000
})

const fixtureMode = import.meta.env.VITE_STUDIO_FIXTURES === 'true'

// 延迟取 store，避免 api → store → api 的模块环依赖
async function getSessionStore() {
  const { useSessionStore } = await import('@/stores/session')
  return useSessionStore()
}

request.interceptors.request.use(async (config) => {
  const session = await getSessionStore()
  if (session.token) {
    config.headers.Authorization = `Bearer ${session.token}`
  }
  return config
})

// 统一错误解析（纯函数，供单测）
export function parseApiError(error) {
  // 幂等：已解析过的 Error（带 code/status、无 response）原样返回，
  // 避免 401 重放链路里 refresh 的拒绝被二次解析成 NETWORK_ERROR
  if (error instanceof Error && error.code && !error.response) return error
  const resp = error?.response
  const body = resp?.data?.error
  if (body) {
    const err = new Error(body.message || body.code || '请求失败')
    err.code = body.code || 'UNKNOWN'
    err.status = resp.status
    err.details = body.details
    return err
  }
  if (resp) {
    const err = new Error(`请求失败（HTTP ${resp.status}）`)
    err.code = `HTTP_${resp.status}`
    err.status = resp.status
    return err
  }
  const err = new Error(error?.message || '网络异常，请稍后重试')
  err.code = 'NETWORK_ERROR'
  return err
}

// ---- 401 刷新队列 ----
let refreshing = null

function ensureRefresh() {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function doRefresh() {
  const session = await getSessionStore()
  try {
    // 后端契约：无独立 refresh_token，Bearer 旧 token 换新 token
    // （走实例让请求拦截器注入当前 token；/auth/* 401 不再递归刷新）
    const data = await request.post('/auth/refresh')
    session.setAuth({ token: data.token, user: session.user })
    return data.token
  } catch (e) {
    session.clearAuth()
    const { default: router } = await import('@/router')
    router.push('/login')
    throw e
  }
}

function isAuthRequest(config) {
  return typeof config?.url === 'string' && config.url.includes('/auth/')
}

request.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { response: resp, config } = error
    // Fixture 登录态只在浏览器本地存在，不能拿 fixture-token 向真实 Server
    // 刷新。Studio 中尚未由样例接管的辅助请求可以失败，但不能因此清空
    // 整个测试会话并跳转登录页；生产构建不会进入此分支。
    if (fixtureMode && resp?.status === 401) {
      return Promise.reject(parseApiError(error))
    }
    if (resp?.status === 401 && config && !config._retried && !isAuthRequest(config)) {
      config._retried = true
      try {
        await ensureRefresh()
        // 重放原请求：请求拦截器会注入刷新后的 token
        return await request(config)
      } catch (e) {
        return Promise.reject(parseApiError(e))
      }
    }
    return Promise.reject(parseApiError(error))
  }
)

export default request
