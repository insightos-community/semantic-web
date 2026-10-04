import { describe, expect, it } from 'vitest'
import { robotSkillDebugTemplate } from '@/robot/skillDebugTemplate'

describe('Robot Skill 人工调试输入', () => {
  it('只使用已发布 SKILL.md 提供的正式输入，不在 Web 猜测业务字段', () => {
    expect(
      JSON.parse(
        robotSkillDebugTemplate({
          extensions: {
            debug_input: {
              object_ref: 'tote-large-smoke',
              target: { target_ref: 'pallet-b-slot-r1-c1' }
            }
          }
        })
      )
    ).toEqual({
      object_ref: 'tote-large-smoke',
      target: { target_ref: 'pallet-b-slot-r1-c1' }
    })
  })

  it('旧包没有调试输入时保留通用 JSON 入口', () => {
    expect(robotSkillDebugTemplate({ extensions: {} })).toBe('{}')
  })
})
