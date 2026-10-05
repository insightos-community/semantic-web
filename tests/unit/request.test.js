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

// request.js 统一错误格式解析（14-frontend-api §3）
import { describe, expect, it } from 'vitest'
import { parseApiError } from '@/api/request'

describe('parseApiError', () => {
  it('解析统一错误格式 {error:{code,message,details}}', () => {
    const err = parseApiError({
      response: {
        status: 404,
        data: { error: { code: 'TASK_NOT_FOUND', message: 'task missing', details: { id: 't-1' } } }
      }
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('task missing')
    expect(err.code).toBe('TASK_NOT_FOUND')
    expect(err.status).toBe(404)
    expect(err.details).toEqual({ id: 't-1' })
  })

  it('message 缺失时回退到 code', () => {
    const err = parseApiError({
      response: { status: 403, data: { error: { code: 'FORBIDDEN' } } }
    })
    expect(err.message).toBe('FORBIDDEN')
    expect(err.code).toBe('FORBIDDEN')
  })

  it('HTTP 错误但无标准 error 体时按状态码兜底', () => {
    const err = parseApiError({ response: { status: 500, data: null } })
    expect(err.code).toBe('HTTP_500')
    expect(err.status).toBe(500)
    expect(err.message).toContain('500')
  })

  it('网络层错误（无 response）归为 NETWORK_ERROR', () => {
    const err = parseApiError(new Error('timeout of 15000ms exceeded'))
    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.message).toContain('timeout')
  })

  it('幂等：已解析过的 Error（带 code、无 response）原样返回', () => {
    const parsed = parseApiError({
      response: {
        status: 401,
        data: { error: { code: 'AUTH_TOKEN_EXPIRED', message: '访问令牌已过期' } }
      }
    })
    expect(parseApiError(parsed)).toBe(parsed)
  })
})
