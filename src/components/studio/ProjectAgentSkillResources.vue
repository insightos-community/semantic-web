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
  <section class="agent-skill-resources" data-testid="project-agent-skills">
    <div class="section-heading">
      <h3>Agent 技能</h3>
      <el-button v-if="compact" size="small" text @click="managing = !managing">
        {{ managing ? '收起' : '管理' }}
      </el-button>
      <span v-else>{{ selectedNames.length }} 已绑定</span>
    </div>

    <div v-if="loading" class="resource-state">正在读取 Project 绑定…</div>
    <div v-else-if="error" class="resource-state error">{{ error }}</div>
    <template v-else>
      <div
        v-for="skill in visibleSkills"
        :key="skill.name"
        class="skill-row"
        :title="skill.description || skill.when_to_use"
      >
        <el-checkbox
          v-if="!compact || managing"
          :model-value="selectedNames.includes(skill.name)"
          :disabled="readonly || saving"
          @change="toggle(skill.name, $event)"
        />
        <span>
          <el-button text class="skill-link" @click="showSkill(skill)">{{ skill.name }}</el-button>
          <small>{{ skill.description || skill.when_to_use || 'Agent Skill' }}</small>
          <small v-if="managing || !compact">适用 Agent：{{ agentsForSkill(skill.name) }}</small>
        </span>
      </div>
      <div
        v-if="skills.length && compact && !managing && !selectedNames.length"
        class="resource-state"
      >
        尚未选择 Agent 技能
      </div>
      <div v-if="!skills.length" class="resource-state">暂无 Agent 技能</div>
      <div v-if="!compact || managing" class="binding-actions">
        <small v-if="readonly">切换到开发模式后可调整绑定</small>
        <el-button
          v-else
          size="small"
          type="primary"
          plain
          :loading="saving"
          :disabled="!dirty"
          @click="save"
        >
          保存绑定
        </el-button>
      </div>
    </template>
    <el-dialog
      v-model="detailVisible"
      :title="detail?.name || 'Agent 技能'"
      append-to-body
      width="min(90vw, 760px)"
    >
      <p v-if="detailLoading">正在加载技能…</p>
      <p v-else-if="detailError" role="alert">{{ detailError }}</p>
      <template v-else-if="detail">
        <p>{{ detail.description || detail.when_to_use }}</p>
        <p>关联 Agent：{{ agentsForSkill(detail.name) }}</p>
        <el-checkbox
          :model-value="selectedNames.includes(detail.name)"
          :disabled="readonly || saving"
          @change="toggle(detail.name, $event)"
        >
          绑定到当前项目
        </el-checkbox>
        <el-button size="small" :disabled="readonly || !dirty" :loading="saving" @click="save">
          保存绑定
        </el-button>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <article class="skill-document" v-html="renderMarkdown(detail.body || '')" />
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import * as projectsApi from '@/api/projects'
import * as skillsApi from '@/api/skills'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useAgentsStore } from '@/stores/agents'
import { renderMarkdown } from '@/utils/markdown'

const project = useProjectStore()
const agents = useAgentsStore()
const agentsForSkill = (name) =>
  agents.agents
    .filter((agent) => (agent.agent_skill_names || agent.skill_names || []).includes(name))
    .map((agent) => agent.id)
    .join('、') || '未关联'
const props = defineProps({ compact: Boolean })
const managing = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detail = ref(null)
let detailRequest = 0
async function showSkill(skill) {
  const request = ++detailRequest
  detail.value = skill
  detailVisible.value = true
  detailLoading.value = true
  detailError.value = ''
  agents.load({ silent: true })
  try {
    const response = await skillsApi.getSkill(skill.name)
    if (request === detailRequest) detail.value = response.skill
  } catch (cause) {
    if (request === detailRequest) detailError.value = cause.message || '技能详情加载失败'
  } finally {
    if (request === detailRequest) detailLoading.value = false
  }
}
watch(
  () => managing.value || !props.compact,
  (value) => {
    if (value) agents.load({ silent: true })
  },
  { immediate: true }
)
const ui = useUiStore()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const skills = ref([])
const selectedNames = ref([])
const savedNames = ref([])
const agentIds = ref([])
const visibleSkills = computed(() =>
  props.compact && !managing.value
    ? skills.value.filter((skill) => selectedNames.value.includes(skill.name))
    : skills.value
)

const readonly = computed(() => project.currentProject?.mode === 'running')
const dirty = computed(() => selectedNames.value.join('\0') !== savedNames.value.join('\0'))

function normalized(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))].sort()
}

async function load(projectId) {
  if (!projectId) return
  loading.value = true
  error.value = ''
  try {
    const [catalog, response] = await Promise.all([
      skillsApi.listSkills(),
      projectsApi.getProjectBindings(projectId)
    ])
    skills.value = Array.isArray(catalog?.skills) ? catalog.skills : []
    agentIds.value = normalized(response?.bindings?.agent_ids)
    selectedNames.value = normalized(response?.bindings?.skill_names)
    savedNames.value = [...selectedNames.value]
  } catch (cause) {
    error.value = cause.message || 'Project Agent Skill 加载失败'
  } finally {
    loading.value = false
  }
}

function toggle(name, enabled) {
  const next = new Set(selectedNames.value)
  if (enabled) next.add(name)
  else next.delete(name)
  selectedNames.value = normalized([...next])
}

async function save() {
  saving.value = true
  try {
    const response = await projectsApi.replaceProjectBindings(project.currentProjectId, {
      agentIds: agentIds.value,
      skillNames: selectedNames.value
    })
    selectedNames.value = normalized(response?.bindings?.skill_names)
    savedNames.value = [...selectedNames.value]
    if (response?.project) project.upsert(response.project)
    ui.notify({ type: 'success', message: 'Project Agent Skill 绑定已更新' })
  } catch (cause) {
    ui.notify({ type: 'error', message: cause.message || '保存 Agent Skill 绑定失败' })
  } finally {
    saving.value = false
  }
}

watch(
  () => project.currentProjectId,
  (projectId) => load(projectId),
  { immediate: true }
)
</script>

<style scoped lang="scss">
.skill-link {
  justify-content: flex-start;
  max-width: 100%;
  height: auto;
  padding: 0;
  font-weight: 600;
}
.skill-document {
  overflow-wrap: anywhere;
  :deep(pre) {
    overflow: auto;
    white-space: pre-wrap;
  }
}
.agent-skill-resources {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--sf-border-light);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    margin: 0;
    color: var(--sf-text-primary);
    font-size: 12px;
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.section-description {
  margin: 6px 0 10px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  line-height: 1.5;
}

.skill-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 7px 8px;
  border-radius: var(--sf-radius-md);
  cursor: pointer;

  &:hover {
    background: var(--sf-bg-hover);
  }

  > span {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  b,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  b {
    color: var(--sf-text-primary);
    font-size: 12px;
  }

  small {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.binding-actions {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: flex-end;
  padding-top: 8px;

  small {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

.resource-state {
  padding: 14px 8px;
  color: var(--sf-text-disabled);
  font-size: 11px;

  &.error {
    color: var(--sf-danger);
  }
}
</style>
