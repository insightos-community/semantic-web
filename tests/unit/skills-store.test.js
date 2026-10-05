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

// skills store（R11 前端技能库页）：清单加载 / category 分组 / 详情按需拉取 /
// 空态与竞态（契约以 internal/server/http/handlers/skills.go 为准）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/skills', () => ({
  listSkills: vi.fn(),
  listRobotSkills: vi.fn(),
  getSkill: vi.fn(),
  getSkillResource: vi.fn(),
  getRobotSkill: vi.fn(),
  getRobotSkillResource: vi.fn()
}))

import * as skillsApi from '@/api/skills'
import { filterSkills, groupSkills, skillTags, useSkillsStore } from '@/stores/skills'

// GET /skills 响应形态（服务端已按 category 升序分组、组内 name 升序）
const skillList = () => ({
  skills: [
    {
      name: 'pick-place',
      category: 'embodied',
      description: '抓取放置任务的执行流程',
      when_to_use: '需要控制机械臂时'
    },
    {
      name: 'artifact-usage',
      category: 'general',
      description: '产物存取规范',
      when_to_use: '保存/读取产物时'
    },
    {
      name: 'echo-guide',
      category: 'general',
      description: '链路探测与时间查询规范',
      when_to_use: '回显或查时间时'
    }
  ]
})

// GET /skills/{name} 响应形态（含正文与扩展字段透传）
const skillDetail = (name) => ({
  skill: {
    name,
    category: 'general',
    description: '链路探测与时间查询规范',
    when_to_use: '回显或查时间时',
    body: '# 链路探测\n\n正文内容',
    extensions: { goal: '验证链路' },
    resources: [
      { path: 'scripts/check.py', kind: 'scripts', media_type: 'text/x-python', size: 12 },
      { path: 'references/usage.md', kind: 'references', media_type: 'text/markdown', size: 20 }
    ]
  }
})

describe('skills store · 清单加载', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    skillsApi.listRobotSkills.mockResolvedValue({ skills: [] })
  })

  it('load：写入清单，loading 复位，groups 按 category 分组', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    const skills = useSkillsStore()

    await skills.load()

    expect(skills.loading).toBe(false)
    expect(skills.error).toBe('')
    expect(skills.skills).toHaveLength(3)
    expect(skills.groups.map((g) => g.category)).toEqual(['embodied', 'general'])
    expect(skills.groups[0].items.map((s) => s.name)).toEqual(['pick-place'])
    expect(skills.groups[1].items.map((s) => s.name)).toEqual(['artifact-usage', 'echo-guide'])
  })

  it('统一目录展示 Robot Skill，并从发布包拉取 SKILL.md 与资源详情', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    skillsApi.listRobotSkills.mockResolvedValue({
      skills: [
        {
          name: 'grasp-object',
          version: '0.1.0',
          category: 'robot_skill',
          description: '抓取并验证持物状态',
          applicable_models: ['r1pro']
        }
      ]
    })
    skillsApi.getRobotSkill.mockResolvedValue({
      skill: {
        name: 'grasp-object',
        version: '0.1.0',
        category: 'robot_skill',
        description: '抓取并验证持物状态',
        body: '# 抓取物体\n\n通过观测、候选与独立验证完成抓取。',
        resources: [
          { path: 'scripts/skill.py', kind: 'scripts', media_type: 'text/x-python', size: 20 }
        ],
        required_actions: [{ type: 'perception.locate_object', schema_version: 1 }]
      }
    })
    const skills = useSkillsStore()

    await skills.load()
    const robotSkill = skills.catalogSkills.find((item) => item.skill_kind === 'robot')
    expect(robotSkill.catalog_id).toBe('robot:grasp-object@0.1.0')
    expect(robotSkill.when_to_use).toContain('robot.run')

    await skills.selectCatalog(robotSkill.catalog_id)
    expect(skills.activeKind).toBe('robot')
    expect(skills.detail.body).toContain('独立验证')
    expect(skills.detail.resources[0].path).toBe('scripts/skill.py')
    expect(skillsApi.getRobotSkill).toHaveBeenCalledWith('grasp-object', '0.1.0')
    expect(skillsApi.getSkill).not.toHaveBeenCalled()
  })

  it('Robot Skill 详情 404 时真实展示接口错误而不伪造详情', async () => {
    skillsApi.listSkills.mockResolvedValue({ skills: [] })
    skillsApi.listRobotSkills.mockResolvedValue({
      skills: [{ name: 'grasp-object', version: '0.1.0', description: '抓取并验证持物状态' }]
    })
    const error = new Error('请求失败（HTTP 404）')
    error.status = 404
    skillsApi.getRobotSkill.mockRejectedValue(error)
    const skills = useSkillsStore()

    await skills.load()
    const robotSkill = skills.catalogSkills.find((item) => item.skill_kind === 'robot')
    await skills.selectCatalog(robotSkill.catalog_id)

    expect(skills.detail).toBeNull()
    expect(skills.detailError).toBe('请求失败（HTTP 404）')
  })

  it('load 失败：loading 复位、error 落态且错误原样抛出', async () => {
    skillsApi.listSkills.mockRejectedValue(new Error('网络异常，请稍后重试'))
    const skills = useSkillsStore()

    await expect(skills.load()).rejects.toThrow('网络异常，请稍后重试')
    expect(skills.loading).toBe(false)
    expect(skills.error).toBe('网络异常，请稍后重试')
    expect(skills.skills).toEqual([])
  })

  it('load 空清单（无技能形态）：skills 为空数组、groups 为空（空态由页面渲染）', async () => {
    skillsApi.listSkills.mockResolvedValue({ skills: [] })
    const skills = useSkillsStore()

    await skills.load()

    expect(skills.skills).toEqual([])
    expect(skills.groups).toEqual([])
    expect(skills.error).toBe('')
  })

  it('load 重新加载：清空选中与详情（避免详情与清单快照不一致）', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    skillsApi.getSkill.mockResolvedValue(skillDetail('echo-guide'))
    const skills = useSkillsStore()
    await skills.load()
    await skills.select('echo-guide')
    expect(skills.detail).not.toBeNull()

    await skills.load()

    expect(skills.activeName).toBe('')
    expect(skills.detail).toBeNull()
  })
})

describe('skills store · 分组纯函数', () => {
  it('groupSkills：按 category 分组保序，缺省 category 回填 general', () => {
    const groups = groupSkills([
      { name: 'b', category: 'general' },
      { name: 'a', category: 'embodied' },
      { name: 'c' }
    ])
    // 保序分组：出现的先后顺序成组（排序由服务端负责）
    expect(groups.map((g) => g.category)).toEqual(['general', 'embodied'])
    expect(groups[0].items.map((s) => s.name)).toEqual(['b', 'c'])
    expect(groups[1].items.map((s) => s.name)).toEqual(['a'])
  })

  it('groupSkills：空清单返回空数组', () => {
    expect(groupSkills([])).toEqual([])
  })

  it('filterSkills：搜索、分类和标签可组合筛选', () => {
    const list = [
      ...skillList().skills,
      {
        name: 'vision-check',
        category: 'embodied',
        description: '查看相机图片',
        when_to_use: '机器人视觉分析',
        tags: ['vision', 'camera']
      }
    ]

    expect(filterSkills(list, { query: '相机' }).map((skill) => skill.name)).toEqual([
      'vision-check'
    ])
    expect(filterSkills(list, { category: 'general' })).toHaveLength(2)
    expect(filterSkills(list, { tags: ['embodied', 'vision'] }).map((skill) => skill.name)).toEqual(
      ['vision-check']
    )
  })

  it('skillTags：category 是基础标签并兼容原生 tags', () => {
    expect(skillTags({ category: 'embodied', tags: ['vision', 'camera'] })).toEqual([
      'embodied',
      'vision',
      'camera'
    ])
  })
})

describe('skills store · 详情拉取', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    skillsApi.listRobotSkills.mockResolvedValue({ skills: [] })
  })

  it('select：选中态立即切换，详情拉取写入 detail（含正文与扩展字段）', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    let resolveDetail
    skillsApi.getSkill.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve
        })
    )
    const skills = useSkillsStore()
    await skills.load()

    const p = skills.select('echo-guide')
    expect(skills.activeName).toBe('echo-guide') // 高亮不等待网络
    expect(skills.detailLoading).toBe(true)
    expect(skills.detail).toBeNull()

    resolveDetail(skillDetail('echo-guide'))
    await p

    expect(skills.detailLoading).toBe(false)
    expect(skills.detail.name).toBe('echo-guide')
    expect(skills.detail.body).toContain('# 链路探测')
    expect(skills.detail.extensions).toEqual({ goal: '验证链路' })
    expect(skills.detailError).toBe('')
  })

  it('select 同名重复点选：已加载的不重复请求', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    skillsApi.getSkill.mockResolvedValue(skillDetail('echo-guide'))
    const skills = useSkillsStore()
    await skills.load()

    await skills.select('echo-guide')
    await skills.select('echo-guide')

    expect(skillsApi.getSkill).toHaveBeenCalledTimes(1)
  })

  it('select 失败（如 404）：detailError 落态、detail 保持 null', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    const err = new Error('技能不存在: no-such')
    err.code = 'SKILL_NOT_FOUND'
    skillsApi.getSkill.mockRejectedValue(err)
    const skills = useSkillsStore()
    await skills.load()

    await skills.select('no-such')

    expect(skills.detailLoading).toBe(false)
    expect(skills.detail).toBeNull()
    expect(skills.detailError).toBe('技能不存在: no-such')
  })

  it('select 慢响应竞态：返回时选中项已切换则丢弃过期详情', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    let resolveSlow
    skillsApi.getSkill.mockImplementation((name) => {
      if (name === 'echo-guide') {
        return new Promise((resolve) => {
          resolveSlow = resolve
        })
      }
      return Promise.resolve(skillDetail(name))
    })
    const skills = useSkillsStore()
    await skills.load()

    const slow = skills.select('echo-guide')
    await skills.select('artifact-usage') // 快速切换到另一个技能
    resolveSlow(skillDetail('echo-guide')) // 慢响应随后才返回
    await slow

    expect(skills.activeName).toBe('artifact-usage')
    expect(skills.detail.name).toBe('artifact-usage') // 过期详情未覆盖新选中
  })
})

describe('skills store · 资源按需读取', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    skillsApi.listRobotSkills.mockResolvedValue({ skills: [] })
  })

  it('loadResource 只在用户选择后读取脚本正文', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    skillsApi.getSkill.mockResolvedValue(skillDetail('echo-guide'))
    skillsApi.getSkillResource.mockResolvedValue({
      resource: { path: 'scripts/check.py', kind: 'scripts', size: 12 },
      content: "print('ok')\n"
    })
    const skills = useSkillsStore()
    await skills.load()
    await skills.select('echo-guide')

    expect(skillsApi.getSkillResource).not.toHaveBeenCalled()
    await skills.loadResource('scripts/check.py')

    expect(skillsApi.getSkillResource).toHaveBeenCalledWith('echo-guide', 'scripts/check.py')
    expect(skills.resource.content).toBe("print('ok')\n")
    expect(skills.resourceError).toBe('')
  })

  it('loadResource 失败时保留明确错误且不显示旧资源', async () => {
    skillsApi.listSkills.mockResolvedValue(skillList())
    skillsApi.getSkill.mockResolvedValue(skillDetail('echo-guide'))
    skillsApi.getSkillResource.mockRejectedValue(new Error('技能资源不是文本文件'))
    const skills = useSkillsStore()
    await skills.load()
    await skills.select('echo-guide')
    await skills.loadResource('assets/image.png')

    expect(skills.resource).toBeNull()
    expect(skills.resourceError).toBe('技能资源不是文本文件')
    expect(skills.resourceLoading).toBe(false)
  })
})
