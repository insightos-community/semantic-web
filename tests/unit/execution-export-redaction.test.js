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

import { expect, it } from 'vitest'
import { redactExecutionRecord } from '@/robot/exportExecution'

it('诊断导出脱敏嵌套凭据和日志，保持非敏感执行信息', () => {
  const input = {
    execution_id: 'execution',
    authorization: 'Bearer secret-value',
    input: { api_key: 'private-value', count: 4 },
    logs: [
      'Authorization: Bearer raw-key',
      'url?access_token=url-key&after_sequence=10',
      'password: local-secret'
    ]
  }
  const output = redactExecutionRecord(input)
  expect(output.execution_id).toBe('execution')
  expect(output.input.count).toBe(4)
  expect(JSON.stringify(output)).not.toMatch(
    /secret-value|private-value|raw-key|url-key|local-secret/u
  )
  expect(input.input.api_key).toBe('private-value')
})
