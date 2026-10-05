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

// dispatcher.js envelope → channel 路由（17-web-ui-design §8）
import { describe, expect, it, vi } from 'vitest'
import { CHANNELS, createDispatcher } from '@/ws/dispatcher'

const envelope = (channel, extra = {}) => ({
  id: `evt-${channel}`,
  ts: '2026-08-03T10:00:00.000Z',
  channel,
  type: 'test.type',
  importance: 'normal',
  payload: {},
  ...extra
})

describe('createDispatcher channel 路由', () => {
  it('按 channel 路由到注册的 handler', () => {
    const onDialogue = vi.fn()
    const onAlert = vi.fn()
    const d = createDispatcher({ dialogue: onDialogue, alert: onAlert })

    const env = envelope('dialogue')
    expect(d.dispatch(env)).toBe(true)
    expect(onDialogue).toHaveBeenCalledTimes(1)
    expect(onDialogue).toHaveBeenCalledWith(env)
    expect(onAlert).not.toHaveBeenCalled()
  })

  it('on() 支持运行时注册新 channel', () => {
    const d = createDispatcher()
    const onTrace = vi.fn()
    d.on('trace', onTrace)
    expect(d.dispatch(envelope('trace'))).toBe(true)
    expect(onTrace).toHaveBeenCalledTimes(1)
  })

  it('未注册 channel 返回 false 且不抛错', () => {
    const d = createDispatcher({ dialogue: vi.fn() })
    expect(d.dispatch(envelope('trace'))).toBe(false)
  })

  it('非法 envelope 安全忽略', () => {
    const d = createDispatcher({ dialogue: vi.fn() })
    expect(d.dispatch(null)).toBe(false)
    expect(d.dispatch({})).toBe(false)
    expect(d.dispatch({ channel: 42 })).toBe(false)
  })

  it('channel 清单与契约一致（14-frontend-api §4.3）', () => {
    expect(CHANNELS).toEqual(['dialogue', 'alert', 'trace', 'artifact', 'interaction'])
  })
})
