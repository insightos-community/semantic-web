import { describe, expect, it } from 'vitest'
import {
  robotHasSkill,
  robotSkillGroups,
  robotSkillStatus,
  visibleRobotSkills
} from '@/robot/skillCatalog'

const realPackage = {
  name: 'capture',
  version: '0.4.0-alpha.1',
  applicable_models: ['R1PRO'],
  skill_kind: 'robot'
}
const simPackage = { ...realPackage, version: '0.4.0-alpha.2' }
const packages = [realPackage, simPackage]
const real = {
  robot_id: 'real',
  display_name: '星海图 R1Pro 真机',
  model: 'R1PRO',
  installed_skills: [realPackage]
}
const sim = {
  robot_id: 'sim',
  display_name: 'R1Pro 模拟器',
  model: 'R1PRO',
  desired_skills: [simPackage]
}

describe('Robot Skill instance catalog', () => {
  it('same-model robots only see their exact assigned versions by default', () => {
    expect(visibleRobotSkills(packages, real)).toEqual([realPackage])
    expect(visibleRobotSkills(packages, sim)).toEqual([simPackage])
    expect(robotHasSkill(real, simPackage)).toBe(false)
  })
  it('keeps failed and disabled installs visible and supports explicit package browsing', () => {
    const failed = {
      ...real,
      installed_skills: [{ ...realPackage, status: 'failed', enabled: false }]
    }
    expect(visibleRobotSkills(packages, failed)).toEqual([realPackage])
    expect(visibleRobotSkills(packages, real, true)).toEqual(packages)
    expect(visibleRobotSkills(packages, { robot_id: 'new', model: 'R1PRO' })).toEqual([])
    expect(visibleRobotSkills(packages, { model: 'OTHER' }, true)).toEqual([])
  })
  it('groups names and versions by real bindings, including shared and unassigned packages', () => {
    const shared = { ...sim, installed_skills: [realPackage] }
    const unassigned = { ...simPackage, name: 'new-skill' }
    const groups = robotSkillGroups(
      [...packages, unassigned, { name: 'agent', skill_kind: 'agent' }],
      [real, shared]
    )
    expect(groups).toHaveLength(3)
    expect(groups[0].category).toContain('星海图 R1Pro 真机')
    expect(groups[0].items).toEqual([realPackage])
    expect(groups[1].category).toContain('R1Pro 模拟器')
    expect(groups[1].items).toEqual(packages)
    expect(groups[2].items).toEqual([unassigned])
  })
  it('preserves actual state when the published model declaration changes', () => {
    expect(
      visibleRobotSkills([{ ...realPackage, applicable_models: ['OTHER'] }], real)
    ).toHaveLength(1)
  })
  it('collapses healthy retained versions after upgrade without hiding failed or active versions', () => {
    const old = { ...realPackage, status: 'installed', enabled: false }
    const upgraded = {
      ...real,
      desired_skills: [{ ...simPackage, enabled: true }],
      installed_skills: [old, { ...simPackage, status: 'installed', enabled: true }]
    }
    expect(robotSkillStatus(upgraded, realPackage)).toBe('retained')
    expect(robotSkillStatus(upgraded, simPackage)).toBe('installed')
    expect(visibleRobotSkills(packages, upgraded)).toEqual([simPackage])
    expect(visibleRobotSkills(packages, upgraded, true)).toEqual(packages)
    // Retained copies are still attributed to their actual robot in the full library.
    expect(robotHasSkill(upgraded, realPackage)).toBe(true)
    expect(robotSkillGroups(packages, [upgraded])[0].items).toEqual(packages)
    for (const change of [{ status: 'failed' }, { enabled: true }, { status: undefined }]) {
      const abnormal = { ...upgraded, installed_skills: [{ ...old, ...change }] }
      expect(visibleRobotSkills(packages, abnormal)).toEqual(packages)
    }
  })
  it.each([
    [undefined, undefined, 'not_installed'],
    [undefined, { enabled: false, status: 'installed' }, 'retained'],
    [undefined, { enabled: true, status: 'installed' }, 'degraded'],
    [undefined, { enabled: false, status: 'failed' }, 'failed'],
    [{ enabled: true }, undefined, 'pending'],
    [{ enabled: true }, { enabled: false, status: 'installed' }, 'pending'],
    [{ enabled: false }, { enabled: true, status: 'installed' }, 'pending'],
    [{ enabled: true }, { enabled: true, status: 'failed' }, 'failed'],
    [{ enabled: true }, { enabled: true, status: 'installed' }, 'installed'],
    [{ enabled: false }, { enabled: false, status: 'installed' }, 'disabled']
  ])('classifies desired %j and actual %j as %s', (desired, installed, expected) => {
    const robot = {
      ...real,
      desired_skills: desired ? [{ ...realPackage, ...desired }] : [],
      installed_skills: installed ? [{ ...realPackage, ...installed }] : []
    }
    expect(robotSkillStatus(robot, realPackage)).toBe(expected)
    if (desired || installed)
      expect(visibleRobotSkills(packages, robot)).toEqual(
        expected === 'retained' ? [] : [realPackage]
      )
  })
})
