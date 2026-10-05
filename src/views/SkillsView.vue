<!--
Copyright 2026 InsightOS
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<template>
  <div class="skills-view">
    <header class="page-hero">
      <div>
        <p class="eyebrow">SKILL LIBRARY</p>
        <h1 class="sf-page-title">技能库</h1>
        <p class="sf-page-subtitle">
          统一浏览 Agent Skill 与 Robot Skill；运行边界和安装状态始终明确展示。
        </p>
      </div>
      <div class="hero-state">
        <strong>{{ skills.catalogSkills.length }}</strong
        ><span>已加载技能</span>
      </div>
      <el-button :icon="Refresh" :loading="refreshing" @click="onRefresh">刷新技能</el-button>
    </header>

    <div class="skills-workspace">
      <!-- 左栏：技能清单（SideList 统一容器；category 分组 + 选中高亮） -->
      <SideList width="340px">
        <template #title>技能库</template>
        <template #actions>
          <span v-if="skills.catalogSkills.length > 0" class="skill-count">
            {{ filteredSkills.length }} / {{ skills.catalogSkills.length }}
          </span>
        </template>
        <template #search>
          <CatalogFilters
            v-model:search="search"
            v-model:category="category"
            v-model:selected-tags="selectedTags"
            :categories="categories"
            :tags="availableTags"
          />
        </template>
        <SkillList :groups="filteredGroups" :active-id="activeCatalogID" @select="onSelect" />
        <template #footer>
          <span class="catalog-hint">分类与标签可组合筛选</span>
        </template>
      </SideList>

      <!-- 右栏：详情（frontmatter 字段表 + 正文 markdown） -->
      <section class="skills-content">
        <el-alert
          v-if="skills.error"
          class="error-alert"
          type="error"
          :title="skills.error"
          show-icon
          closable
        />

        <div v-loading="skills.loading" class="content-body">
          <!-- 空态：无技能时引导配置 skills.dir -->
          <EmptyState
            v-if="!skills.loading && skills.catalogSkills.length === 0 && !skills.error"
            description="暂无技能：将 SKILL.md 技能目录放入服务端 skills.dir（默认 configs/skills）后刷新页面即可在此浏览；技能是上下文增强项，未配置时服务端按无技能形态运行"
          />
          <EmptyState
            v-else-if="!skills.loading && filteredSkills.length === 0"
            description="没有符合当前搜索与筛选条件的技能"
          />
          <!-- 已加载但未选中（理论上 load 后自动选中首个，兜底占位） -->
          <EmptyState
            v-else-if="!skills.loading && !skills.activeName && skills.catalogSkills.length > 0"
            description="从左侧选择一个技能查看详情"
          />
          <RobotSkillDetail
            v-else-if="skills.activeKind === 'robot'"
            :skill="skills.detail"
            :loading="skills.detailLoading"
            :error="skills.detailError"
            :resource="skills.resource"
            :resource-loading="skills.resourceLoading"
            :resource-error="skills.resourceError"
            @select-resource="onSelectResource"
          />
          <SkillDetail
            v-else-if="skills.activeKind === 'agent' && skills.activeName"
            :skill="skills.detail"
            :loading="skills.detailLoading"
            :error="skills.detailError"
            :resource="skills.resource"
            :resource-loading="skills.resourceLoading"
            :resource-error="skills.resourceError"
            @select-resource="onSelectResource"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
// 技能库页（R11）：左栏技能清单（category 分组、搜索与标签筛选）+ 右栏详情
// （frontmatter 字段表 + 正文 markdown，DOMPurify 管线渲染）。
// 数据源 skills store（GET /api/v1/skills[/name]，契约以 skills.go 为准）；
// 技能是慢变数据不做轮询，首屏加载后自动选中首个技能。
import { computed, onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import CatalogFilters from '@/components/base/CatalogFilters.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import SideList from '@/components/base/SideList.vue'
import SkillDetail from '@/components/skills/SkillDetail.vue'
import SkillList from '@/components/skills/SkillList.vue'
import RobotSkillDetail from '@/components/skills/RobotSkillDetail.vue'
import { useDeviceStore } from '@/stores/device'
import { filterSkills, groupSkills, skillTags, useSkillsStore } from '@/stores/skills'
import { useUiStore } from '@/stores/ui'

const skills = useSkillsStore()
const devices = useDeviceStore()
const ui = useUiStore()
const refreshing = ref(false)
const search = ref('')
const category = ref('all')
const selectedTags = ref([])

const categories = computed(() =>
  [...new Set(skills.catalogSkills.map((skill) => skill.category || 'general'))].sort()
)
const availableTags = computed(() =>
  [...new Set(skills.catalogSkills.flatMap((skill) => skillTags(skill)))].sort()
)
const filteredSkills = computed(() =>
  filterSkills(skills.catalogSkills, {
    query: search.value,
    category: category.value,
    tags: selectedTags.value
  })
)
const filteredGroups = computed(() => groupSkills(filteredSkills.value))
const activeCatalogID = computed(() => {
  if (!skills.activeName) return ''
  if (skills.activeKind === 'robot') {
    return `robot:${skills.activeName}@${skills.activeVersion}`
  }
  return `agent:${skills.activeName}`
})

watch(filteredSkills, (items) => {
  if (items.length && !items.some((skill) => skill.catalog_id === activeCatalogID.value)) {
    skills.selectCatalog(items[0].catalog_id).catch(() => {})
  }
})

onMounted(async () => {
  try {
    await skills.load()
    if (!devices.robots.length) await devices.loadSnapshot().catch(() => {})
  } catch (e) {
    ui.notify({ type: 'error', message: e.message || '技能库加载失败' })
    return
  }
  // 首屏自动选中清单首个技能（服务端已按 category/name 排序）
  const first = skills.catalogSkills[0]
  if (first) {
    skills.selectCatalog(first.catalog_id).catch(() => {})
  }
})

function onSelect(catalogID) {
  skills.selectCatalog(catalogID).catch(() => {})
}

function onSelectResource(path) {
  skills.loadResource(path).catch(() => {})
}

async function onRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await skills.load()
    const first = skills.catalogSkills[0]
    if (first) await skills.selectCatalog(first.catalog_id)
    ui.notify({ type: 'success', message: '技能库已刷新' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '技能库刷新失败' })
  } finally {
    refreshing.value = false
  }
}
</script>

<style scoped lang="scss">
.skills-view {
  height: 100%;
  padding: 18px;
  overflow: auto;
}

.page-hero {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) auto auto;
  align-items: center;
  gap: 24px;
  margin-bottom: 14px;
  padding: 18px 20px;
  border: 1px solid var(--sf-border-light);
  border-left: 3px solid var(--sf-brand);
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.12em;
}

.hero-state {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-left: 20px;
  border-left: 1px solid var(--sf-border-light);

  strong {
    color: var(--sf-text-primary);
    font-size: 20px;
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.skills-workspace {
  display: flex;
  gap: 14px;
  min-height: 540px;
}

.skill-count {
  font-size: var(--sf-font-xs);
  font-weight: 400;
  color: var(--sf-text-disabled);
}

.catalog-hint {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.skills-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 18px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  overflow: hidden;
  box-shadow: var(--sf-shadow-sm);
}

.error-alert {
  margin-bottom: var(--sf-space-4);
}

.content-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 900px) {
  .page-hero {
    grid-template-columns: 1fr auto;
  }

  .hero-state {
    display: none;
  }
}
</style>
