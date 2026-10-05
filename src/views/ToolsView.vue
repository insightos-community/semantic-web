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
  <div class="tools-view">
    <header class="page-hero">
      <div>
        <p class="eyebrow">TOOL CATALOG</p>
        <h1 class="sf-page-title">工具目录</h1>
        <p class="sf-page-subtitle">
          {{
            scope === 'effective'
              ? '查看当前会话 Agent 真正可调用的工具。'
              : '查看 Server 已安装的全局工具目录。'
          }}
        </p>
      </div>
      <div class="hero-stats">
        <div>
          <strong>{{ stats.total }}</strong
          ><span>工具</span>
        </div>
        <div>
          <strong>{{ stats.mcp }}</strong
          ><span>MCP</span>
        </div>
        <div :class="{ 'is-bad': stats.unhealthy > 0 }">
          <strong>{{ stats.unhealthy }}</strong
          ><span>异常</span>
        </div>
      </div>
      <div class="scope-controls">
        <el-radio-group v-model="scope" size="small">
          <el-radio-button value="effective" :disabled="!chat.currentSessionId">
            当前会话
          </el-radio-button>
          <el-radio-button value="installed">全局已安装</el-radio-button>
        </el-radio-group>
        <el-select
          v-if="scope === 'effective'"
          v-model="activeAgentId"
          size="small"
          placeholder="选择 Agent"
        >
          <el-option
            v-for="agent in availableAgents"
            :key="agent.id"
            :label="`${agent.id} · ${agent.role}`"
            :value="agent.id"
          />
        </el-select>
      </div>
      <el-button :icon="Refresh" :loading="refreshing" @click="onRefresh">刷新目录</el-button>
    </header>

    <div class="tools-workspace">
      <SideList width="340px">
        <template #title>工具</template>
        <template #actions>
          <span class="result-count">{{ filteredTools.length }} / {{ catalog.length }}</span>
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
        <ToolList :groups="filteredGroups" :active-key="tools.activeKey" @select="tools.select" />
        <template #footer>
          <span class="catalog-hint">{{ catalogHint }}</span>
        </template>
      </SideList>

      <section class="tools-content">
        <el-alert
          v-if="activeError"
          class="error-alert"
          type="error"
          :title="activeError"
          show-icon
          closable
        />
        <el-alert
          v-else-if="scope === 'installed'"
          class="scope-alert"
          type="info"
          title="全局目录表示工具已经安装，不代表当前 Agent 或会话已经启用。"
          show-icon
          :closable="false"
        />
        <div v-loading="activeLoading" class="content-body">
          <EmptyState
            v-if="!activeLoading && catalog.length === 0 && !activeError"
            :description="emptyDescription"
          />
          <EmptyState
            v-else-if="!activeLoading && filteredTools.length === 0"
            description="没有符合当前搜索与筛选条件的工具"
          />
          <ToolDetail v-else-if="activeVisibleTool" :tool="activeVisibleTool" />
          <EmptyState v-else description="从左侧选择一个工具查看详情" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
// 工具目录页：左栏按分类直接选择工具并支持搜索/标签筛选，右栏展示
// 选中工具的来源、风险、健康状态和完整 JSON Schema，不再通过来源二级展开。
import { computed, onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import CatalogFilters from '@/components/base/CatalogFilters.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import SideList from '@/components/base/SideList.vue'
import ToolDetail from '@/components/tools/ToolDetail.vue'
import ToolList from '@/components/tools/ToolList.vue'
import { filterTools, groupToolsByCategory, useToolsStore } from '@/stores/tools'
import { useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useUiStore } from '@/stores/ui'

const tools = useToolsStore()
const agents = useAgentsStore()
const chat = useChatStore()
const ui = useUiStore()
const refreshing = ref(false)
const search = ref('')
const category = ref('all')
const selectedTags = ref([])
const scope = ref(chat.currentSessionId ? 'effective' : 'installed')
const activeAgentId = ref('leader')

const availableAgents = computed(() => {
  const snapshots = agents.sessionAgents[chat.currentSessionId] || []
  if (snapshots.length) {
    return snapshots.map((item) => ({ id: item.agent_id, role: item.role || item.agent_id }))
  }
  return agents.agents
})
const catalog = computed(() =>
  scope.value === 'effective' ? tools.effectiveCatalog : tools.catalog
)
const activeLoading = computed(() =>
  scope.value === 'effective' ? tools.effectiveLoading : tools.loading
)
const activeError = computed(() =>
  scope.value === 'effective' ? tools.effectiveError : tools.error
)
const stats = computed(() => ({
  total: catalog.value.length,
  mcp: catalog.value.filter((tool) => tool.sourceKind === 'mcp').length,
  unhealthy: catalog.value.filter((tool) => tool.health === 'unavailable').length
}))
const catalogHint = computed(() =>
  scope.value === 'effective'
    ? '当前结果已应用 Agent、ToolSearch 与会话权限'
    : '点击工具查看安装契约；是否启用请切换到当前会话'
)
const emptyDescription = computed(() =>
  scope.value === 'effective'
    ? '当前 Agent 没有可用工具，或尚未选择有效会话'
    : '暂无工具：内置工具随服务启动注册，MCP 工具由目录对账发现'
)

const categories = computed(() =>
  [...new Set(catalog.value.map((tool) => tool.category).filter(Boolean))].sort()
)
const availableTags = computed(() =>
  [...new Set(catalog.value.flatMap((tool) => tool.tags || []))].sort()
)
const filteredTools = computed(() =>
  filterTools(catalog.value, {
    query: search.value,
    category: category.value,
    tags: selectedTags.value
  })
)
const filteredGroups = computed(() => groupToolsByCategory(filteredTools.value))
const activeVisibleTool = computed(
  () => filteredTools.value.find((tool) => tool.key === tools.activeKey) || null
)

watch(filteredTools, (items) => {
  if (items.length && !items.some((tool) => tool.key === tools.activeKey)) {
    tools.select(items[0].key)
  }
})

watch([scope, activeAgentId], async ([nextScope]) => {
  if (nextScope !== 'effective') {
    selectFirstVisibleTool()
    return
  }
  await loadEffectiveTools()
})

onMounted(async () => {
  try {
    await tools.load()
    if (chat.currentSessionId) {
      if (agents.agents.length === 0) await agents.load()
      await agents.loadSessionAgents(chat.currentSessionId)
      if (!availableAgents.value.some((agent) => agent.id === activeAgentId.value)) {
        activeAgentId.value = availableAgents.value[0]?.id || ''
      }
      if (scope.value === 'effective') await loadEffectiveTools()
    }
    selectFirstVisibleTool()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '工具目录加载失败' })
  }
})

async function onRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    if (scope.value === 'effective') await loadEffectiveTools()
    else await tools.load()
    ui.notify({ type: 'success', message: '工具目录已刷新' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '工具目录刷新失败' })
  } finally {
    refreshing.value = false
  }
}

async function loadEffectiveTools() {
  if (!chat.currentSessionId || !activeAgentId.value) return
  try {
    await tools.loadEffective(chat.currentSessionId, activeAgentId.value)
    selectFirstVisibleTool()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '当前 Agent 工具加载失败' })
  }
}

function selectFirstVisibleTool() {
  if (!catalog.value.some((tool) => tool.key === tools.activeKey)) {
    tools.select(catalog.value[0]?.key || '')
  }
}
</script>

<style scoped lang="scss">
.tools-view {
  height: 100%;
  padding: 18px;
  overflow: auto;
}

.page-hero {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto minmax(220px, auto) auto;
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

.scope-controls {
  display: flex;
  align-items: center;
  gap: 8px;

  .el-select {
    width: 170px;
  }
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.12em;
}

.hero-stats {
  display: flex;

  div {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 0 16px;
    border-left: 1px solid var(--sf-border-light);

    &.is-bad strong {
      color: var(--sf-danger);
    }
  }

  strong {
    color: var(--sf-text-primary);
    font-size: 19px;
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.tools-workspace {
  display: flex;
  gap: 14px;
  min-height: 560px;
}

.result-count,
.catalog-hint {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.tools-content {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  padding: 18px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-l);
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
  overflow: hidden;
}

.error-alert {
  margin-bottom: var(--sf-space-4);
}

.scope-alert {
  margin-bottom: var(--sf-space-4);
}

.content-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

@media (max-width: 900px) {
  .page-hero {
    grid-template-columns: 1fr auto;
  }

  .scope-controls {
    grid-column: 1 / -1;
  }

  .hero-stats {
    display: none;
  }
}
</style>
