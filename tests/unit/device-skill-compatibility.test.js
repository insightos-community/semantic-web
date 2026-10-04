import { describe, expect, it } from 'vitest'
import { installableRobotSkills } from '@/devices/skillCompatibility'

const action = (type, schema_version = 2) => ({ type, schema_version })
const skill = (name, execute, stop) => ({
  name,
  version: '1.0.0',
  required_actions: [action(execute)],
  stop_actions: [action(stop)]
})
const packages = [
  skill('grasp-object', 'grasp.generate_candidates', 'gripper.hold_object'),
  skill('place-object', 'gripper.release', 'gripper.hold_object'),
  skill('semantic-navigation', 'navigation.follow_route', 'navigation.stop'),
  skill('vla-manipulation', 'vla.execute_policy', 'vla.hold_robot')
]
const robotWith = (model, skills) => ({
  model,
  abilities: [
    {
      selected: true,
      action_details: skills.flatMap((s) => [...s.required_actions, ...s.stop_actions])
    }
  ]
})

describe('设备页 Robot Skill 安装候选', () => {
  it('Franka 只显示 VLA，未声明型号的拆码垛技能也不会混入', () => {
    expect(installableRobotSkills(packages, robotWith('franka_panda', packages.slice(3)))).toEqual([
      packages[3]
    ])
  })

  it('R1 Pro 保留三个拆码垛技能，隐藏不具备动作的 VLA 技能', () => {
    expect(
      installableRobotSkills(packages, robotWith('r1_pro_chassis', packages.slice(0, 3)))
    ).toEqual(packages.slice(0, 3))
  })

  it('使用后端 applicable_models，动作齐全仍须满足型号限制', () => {
    const restricted = { ...packages[3], applicable_models: ['franka_panda'] }
    expect(installableRobotSkills([restricted], robotWith('r1_pro_chassis', [restricted]))).toEqual(
      []
    )
    expect(installableRobotSkills([restricted], robotWith('franka_panda', [restricted]))).toEqual([
      restricted
    ])
  })

  it('缺少停止动作、版本不匹配或只有名称时，不能判为可安装', () => {
    for (const ability of [
      { action_details: [action('vla.execute_policy')] },
      { action_details: [action('vla.execute_policy', 1), action('vla.hold_robot')] },
      { actions: ['vla.execute_policy', 'vla.hold_robot'] }
    ]) {
      expect(
        installableRobotSkills(packages, { model: 'franka_panda', abilities: [ability] })
      ).toEqual([])
    }
  })

  it('未绑定的 Ability 不增加候选；短暂健康状态变化不改变动作兼容性', () => {
    const robot = robotWith('franka_panda', packages)
    robot.abilities[0].selected = false
    expect(installableRobotSkills(packages, robot)).toEqual([])
    robot.abilities[0].selected = true
    robot.abilities[0].healthy = false
    expect(installableRobotSkills(packages, robot)).toEqual(packages)
  })

  it('目录未加载或技能缺少执行/停止契约时不显示安装候选', () => {
    expect(installableRobotSkills(packages, { model: 'franka_panda' })).toEqual([])
    expect(
      installableRobotSkills(
        [
          { name: 'incomplete' },
          { ...packages[3], stop_actions: [] },
          { ...packages[3], required_actions: [] }
        ],
        robotWith('franka_panda', packages)
      )
    ).toEqual([])
  })
})
