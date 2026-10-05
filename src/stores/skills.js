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

// 技能库域（R11 前端技能库页）：清单加载 + category/tags 筛选 + 详情按需拉取。
// 契约以 internal/server/http/handlers/skills.go 为准：清单条目
// {name, category, description, when_to_use}（服务端已按 category/name 排序），
// 详情 {name, category, description, when_to_use, body, extensions?}。
// 技能是慢变数据（服务端热更颗粒度为文件变更），页面不做轮询：
// 首屏 load 一次，详情随点选拉取。
import { defineStore } from 'pinia'
import * as skillsApi from '@/api/skills'

// groupSkills 把已排序的技能清单按 category 分组（保序：服务端排序即
// 组间 category 升序、组内 name 升序）。返回 [{category, items}]。
// 纯函数导出供单测。
export function groupSkills(skills) {
  const groups = []
  const byCategory = new Map()
  for (const sk of skills) {
    const category = sk.category || 'general'
    let group = byCategory.get(category)
    if (!group) {
      group = { category, items: [] }
      byCategory.set(category, group)
      groups.push(group)
    }
    group.items.push(sk)
  }
  return groups
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

// skillTags 以标准 category 为基础，同时兼容未来的原生 tags 扩展字段。
export function skillTags(skill) {
  return [...new Set([skill.category || 'general', ...normalizeTags(skill.tags)].filter(Boolean))]
}

export function filterSkills(skills, { query = '', category = 'all', tags = [] } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return (skills || []).filter((skill) => {
    const itemTags = skillTags(skill)
    if (category !== 'all' && (skill.category || 'general') !== category) return false
    if (tags.length && !tags.every((tag) => itemTags.includes(tag))) return false
    if (!normalizedQuery) return true
    return [skill.name, skill.description, skill.when_to_use, skill.category, ...itemTags]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
  })
}

export const useSkillsStore = defineStore('skills', {
  state: () => ({
    skills: [], // 技能清单摘要（服务端已排序）
    robotSkills: [], // Server Robot Skill Registry 中已发布的可执行包
    loading: false, // 首屏清单加载态
    error: '', // 清单加载错误（首屏展示用）
    activeName: '', // 当前选中技能名（空 = 未选中）
    activeKind: '', // agent = 上下文 Skill；robot = 只能通过 robot.run 执行
    activeVersion: '', // Robot Skill 当前精确版本，详情失败时仍保持左栏选择
    detail: null, // 当前技能详情（含 body/extensions）
    detailLoading: false, // 详情拉取态
    detailError: '', // 详情拉取错误
    resource: null, // 当前按需读取的 scripts/references/assets 文本资源
    resourceLoading: false, // 资源正文加载态
    resourceError: '' // 资源读取错误
  }),
  getters: {
    // groups 技能清单的 category 分组视图（左栏渲染用）
    groups: (s) => groupSkills(s.skills),
    catalogSkills: (s) => [
      ...s.skills.map((skill) => ({
        ...skill,
        skill_kind: 'agent',
        catalog_id: `agent:${skill.name}`
      })),
      ...s.robotSkills.map((skill) => ({
        ...skill,
        category: 'robot_skill',
        skill_kind: 'robot',
        catalog_id: `robot:${skill.name}@${skill.version}`,
        when_to_use: '由 Robot Agent 通过 robot.run 在已安装并启用此版本的 Robot 上执行'
      }))
    ]
  },
  actions: {
    // load 拉取技能清单：首屏置 loading、失败写 error 并原样抛出（页面统一提示）。
    // 重新加载后清空选中与详情，避免详情与清单快照不一致。
    async load() {
      this.loading = true
      try {
        const [data, robotData] = await Promise.all([
          skillsApi.listSkills(),
          typeof skillsApi.listRobotSkills === 'function'
            ? skillsApi.listRobotSkills()
            : Promise.resolve({ skills: [] })
        ])
        this.skills = Array.isArray(data?.skills) ? data.skills : []
        this.robotSkills = Array.isArray(robotData?.skills) ? robotData.skills : []
        this.error = ''
        this.activeName = ''
        this.activeKind = ''
        this.activeVersion = ''
        this.detail = null
        this.detailError = ''
        this.resource = null
        this.resourceError = ''
      } catch (e) {
        this.error = e.message || '技能库加载失败'
        throw e
      } finally {
        this.loading = false
      }
    },
    // select 选中技能并拉取详情：选中态立即切换（左栏高亮不等待网络），
    // 失败写 detailError 由右栏展示；同名重复点选不重复请求。
    async select(name) {
      if (!name || (name === this.activeName && (this.detail || this.detailLoading))) return
      this.activeName = name
      this.activeKind = 'agent'
      this.activeVersion = ''
      this.detail = null
      this.detailError = ''
      this.resource = null
      this.resourceError = ''
      this.detailLoading = true
      try {
        const data = await skillsApi.getSkill(name)
        // 慢响应竞态：返回时选中项已切换则丢弃过期详情
        if (this.activeName === name) {
          this.detail = data?.skill || null
        }
      } catch (e) {
        if (this.activeName === name) {
          this.detailError = e.message || '技能详情加载失败'
        }
      } finally {
        if (this.activeName === name) {
          this.detailLoading = false
        }
      }
    },
    async selectCatalog(catalogID) {
      if (String(catalogID).startsWith('robot:')) {
        const skill = this.robotSkills.find(
          (item) => `robot:${item.name}@${item.version}` === catalogID
        )
        if (!skill) return
        this.activeName = skill.name
        this.activeKind = 'robot'
        this.activeVersion = skill.version
        this.detail = null
        this.detailError = ''
        this.resource = null
        this.resourceError = ''
        this.detailLoading = true
        try {
          const data = await skillsApi.getRobotSkill(skill.name, skill.version)
          if (
            this.activeKind === 'robot' &&
            this.activeName === skill.name &&
            this.robotSkills.some(
              (item) => item.name === skill.name && item.version === skill.version
            )
          ) {
            this.detail = data?.skill || null
            if (!this.detail) this.detailError = 'Robot Skill 详情响应缺少 skill'
          }
        } catch (error) {
          if (this.activeKind === 'robot' && this.activeName === skill.name) {
            this.detail = null
            this.detailError = error.message || 'Robot Skill 详情加载失败'
          }
        } finally {
          if (this.activeKind === 'robot' && this.activeName === skill.name) {
            this.detailLoading = false
          }
        }
        return
      }
      const name = String(catalogID).replace(/^agent:/, '')
      await this.select(name)
    },
    // loadResource 按需读取当前技能的单个文本资源。详情只携带资源清单，
    // scripts/reference 正文只有用户点击时才进入浏览器。
    async loadResource(path) {
      const skillName = this.activeName
      const skillKind = this.activeKind
      const skillVersion = this.detail?.version || this.activeVersion
      if (!skillName || !path) return
      if (this.resource?.resource?.path === path) return
      this.resourceLoading = true
      this.resourceError = ''
      try {
        const data =
          skillKind === 'robot'
            ? await skillsApi.getRobotSkillResource(skillName, skillVersion, path)
            : await skillsApi.getSkillResource(skillName, path)
        // 用户可能在请求期间切换技能；过期资源不能覆盖新技能详情。
        if (this.activeName === skillName && this.activeKind === skillKind) {
          this.resource = data || null
        }
      } catch (error) {
        if (this.activeName === skillName && this.activeKind === skillKind) {
          this.resource = null
          this.resourceError = error.message || '技能资源读取失败'
        }
      } finally {
        if (this.activeName === skillName && this.activeKind === skillKind) {
          this.resourceLoading = false
        }
      }
    }
  }
})
