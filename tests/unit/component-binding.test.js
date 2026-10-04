import { describe, expect, it } from 'vitest'
import { modelCompatibilityReason } from '@/utils/componentBinding'

const ability = {
  abilities: [{ role: 'policy', ability_name: 'Arm.V2', model_backends: ['a', 'b'] }]
}
const model = {
  robot_models: ['arm'],
  model_compatibility: {
    role: 'policy',
    ability_name: 'Arm.V2',
    backend: 'a',
    runtime_profiles: ['sim']
  }
}
describe('模型兼容性', () => {
  it('同一接口支持不同名称、权重和推理后端', () => {
    expect(modelCompatibilityReason(model, 'arm', 'sim', [ability])).toBe('')
    expect(
      modelCompatibilityReason(
        {
          ...model,
          name: 'different-weights',
          model_compatibility: { ...model.model_compatibility, backend: 'b' }
        },
        'arm',
        'sim',
        [ability]
      )
    ).toBe('')
  })
  it('区分型号、Runtime、接口和后端不匹配', () => {
    expect(modelCompatibilityReason(model, 'other', 'sim', [ability])).toContain('型号')
    expect(modelCompatibilityReason(model, 'arm', 'other', [ability])).toContain('Runtime')
    expect(modelCompatibilityReason(model, 'arm', 'sim', [])).toContain('Ability')
    expect(
      modelCompatibilityReason(
        { ...model, model_compatibility: { ...model.model_compatibility, backend: 'unknown' } },
        'arm',
        'sim',
        [ability]
      )
    ).toContain('后端')
    expect(modelCompatibilityReason({ robot_models: ['arm'] }, 'arm', 'sim', [ability])).toContain(
      '兼容性声明'
    )
  })
})
