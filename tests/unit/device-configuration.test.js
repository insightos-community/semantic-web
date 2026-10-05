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

import { describe, expect, it } from 'vitest'
import { safeDeviceRecord } from '@/devices/configuration'
describe('设备安全配置复制', () => {
  it('递归隐藏对象/数组/camelCase凭据并保留坐标与当前状态', () => {
    const record = {
      sdk: {
        providers: [
          {
            apiKey: 'do-not-copy',
            accessToken: 'bearer-value',
            headers: { Authorization: 'Bearer secret-header' }
          }
        ]
      },
      pilot: { client_secret: 'private-client' },
      frames: { base: 'robot/base', offset: [0, 1, 2] },
      safety: { speed: 0.2 }
    }
    const result = safeDeviceRecord(record)
    expect(JSON.stringify(result)).not.toMatch(
      /do-not-copy|bearer-value|secret-header|private-client/
    )
    expect(result.frames).toEqual(record.frames)
    expect(result.safety).toEqual(record.safety)
    expect(record.sdk.providers[0].apiKey).toBe('do-not-copy')
  })
  it('URL认证、查询凭据及嵌套JSON字符串不会进入剪贴板', () => {
    const result = safeDeviceRecord({
      endpoint: 'https://operator:private-pass@host:9000/api?token=private-token&mode=safe',
      json: '{"clientSecret":"private-value","frame":"world"}',
      note: 'Authorization: Bearer private-auth'
    })
    expect(JSON.stringify(result)).not.toMatch(
      /private-pass|private-token|private-value|private-auth/
    )
    expect(result.endpoint).toContain('mode=safe')
    expect(result.json).toContain('world')
  })
})
