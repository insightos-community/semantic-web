import { describe, expect, it } from 'vitest'
import { subtaskProgressLabel } from '../../src/studio/subtaskProgress'

describe('SubTask evidence labels', () => {
  it('distinguishes a completed plan from a completed movement', () => {
    expect(
      subtaskProgressLabel({ status: 'completed', result: { result: { completion: 'planned' } } })
    ).toContain('尚未执行运动')
    expect(
      subtaskProgressLabel({ status: 'completed', result: { result: { completion: 'executed' } } })
    ).toBe('执行完成')
  })
  it('shows agent preparation separately from robot execution', () => {
    expect(subtaskProgressLabel({ status: 'running' })).toContain('尚无机器人执行记录')
    expect(subtaskProgressLabel({ status: 'running', execution_ref: 'rex-live' })).toBe('正在执行')
  })
  it('keeps failure and recovery visible without inventing success', () => {
    expect(subtaskProgressLabel({ status: 'paused', reason: 'recovery_running' })).toBe(
      '正在重新编排'
    )
    expect(subtaskProgressLabel({ status: 'failed', reason: 'replaced_after_failure' })).toContain(
      '失败记录'
    )
    expect(subtaskProgressLabel({ status: 'completed' })).toBe('调用完成 · 详情见执行结果')
  })
})
