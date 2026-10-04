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
