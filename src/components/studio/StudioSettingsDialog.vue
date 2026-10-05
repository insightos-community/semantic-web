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
  <el-dialog
    class="studio-settings-dialog"
    :model-value="open"
    width="min(1080px, 92vw)"
    top="5vh"
    destroy-on-close
    append-to-body
    @close="$emit('close')"
  >
    <template #header>
      <div class="studio-settings-title">
        <b>设置</b>
      </div>
    </template>
    <div class="studio-settings-shell">
      <nav aria-label="设置分类">
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          :class="{ active: section === item.id }"
          @click="section = item.id"
        >
          <component :is="item.icon" />
          <span
            ><b>{{ item.label }}</b
            ><small>{{ item.description }}</small></span
          >
        </button>
      </nav>
      <main>
        <section v-if="section === 'project'" class="studio-project-settings">
          <p class="eyebrow">PROJECT</p>
          <h2>{{ project.currentProject?.name || '当前 Project' }}</h2>
          <dl>
            <div>
              <dt>Project ID</dt>
              <dd>{{ projectId }}</dd>
            </div>
            <div>
              <dt>工作区</dt>
              <dd>{{ project.currentProject?.workspace_root || '未设置' }}</dd>
            </div>
            <div>
              <dt>模式</dt>
              <dd>{{ project.currentProject?.mode || 'development' }}</dd>
            </div>
          </dl>
          <el-button type="primary" plain @click="$emit('open-memory')">
            编辑 Project Memory
          </el-button>
        </section>
        <SettingsView v-else-if="section === 'models'" embedded initial-section="llm" />
        <RuntimeInstallationsSettings v-else-if="section === 'simulation'" />
        <section v-else class="studio-appearance-settings">
          <p class="eyebrow">APPEARANCE</p>
          <h2>外观与工作区</h2>
          <div class="studio-setting-row">
            <span><b>主题</b><small>立即应用到当前 Studio</small></span>
            <el-segmented v-model="theme" :options="themeOptions" />
          </div>
          <div class="studio-setting-row">
            <span><b>工作区布局</b><small>恢复当前 Project 的默认区域比例</small></span>
            <el-button @click="$emit('reset-layout')">重置布局</el-button>
          </div>
        </section>
      </main>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Brush, Connection, Cpu, FolderOpened } from '@element-plus/icons-vue'
import RuntimeInstallationsSettings from '@/components/settings/RuntimeInstallationsSettings.vue'
import SettingsView from '@/views/SettingsView.vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  open: { type: Boolean, default: false },
  initialSection: { type: String, default: 'project' },
  projectId: { type: String, required: true }
})
defineEmits(['close', 'open-memory', 'reset-layout'])

const project = useProjectStore()
const ui = useUiStore()
const section = ref(props.initialSection)
const sections = [
  { id: 'project', label: '当前 Project', description: '上下文与工作区', icon: FolderOpened },
  { id: 'models', label: '模型服务', description: '模型与默认设置', icon: Connection },
  { id: 'simulation', label: '仿真 Runtime', description: '安装状态与诊断', icon: Cpu },
  { id: 'appearance', label: '外观', description: '主题与布局', icon: Brush }
]
const themeOptions = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
]
const theme = computed({ get: () => ui.theme, set: (value) => ui.setTheme(value) })

watch(
  () => [props.open, props.initialSection],
  ([isOpen, initial]) => {
    if (isOpen) section.value = initial || 'project'
  }
)
</script>

<style lang="scss">
.studio-settings-dialog {
  --el-dialog-bg-color: var(--sf-bg-primary);

  .el-dialog__body {
    padding: 0;
  }
}

.studio-settings-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  color: var(--sf-text-primary);

  b {
    font-size: 18px;
  }

  small {
    color: var(--sf-text-muted);
  }
}

.studio-settings-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: min(680px, 78vh);
  border-top: 1px solid var(--sf-border-light);

  > nav {
    padding: 16px 10px;
    border-right: 1px solid var(--sf-border-light);
    background: var(--sf-bg-secondary);

    button {
      display: flex;
      width: 100%;
      gap: 10px;
      padding: 11px 12px;
      border: 0;
      border-radius: 8px;
      color: var(--sf-text-secondary);
      background: transparent;
      text-align: left;
      cursor: pointer;

      svg {
        width: 18px;
        margin-top: 2px;
      }

      span {
        display: grid;
        gap: 3px;
      }

      small {
        color: var(--sf-text-muted);
      }

      &.active {
        color: var(--sf-brand);
        background: var(--sf-brand-soft);
      }
    }
  }

  > main {
    min-width: 0;
    overflow: auto;
  }
}

.studio-project-settings,
.studio-appearance-settings {
  max-width: 760px;
  padding: 28px 34px;
  color: var(--sf-text-primary);

  > p:not(.eyebrow) {
    color: var(--sf-text-secondary);
  }

  dl {
    display: grid;
    gap: 10px;
    margin: 24px 0;
  }

  dl div,
  .studio-setting-row {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 15px 16px;
    border: 1px solid var(--sf-border-light);
    border-radius: 8px;
    background: var(--sf-bg-secondary);
  }

  dt,
  small {
    color: var(--sf-text-muted);
  }

  dd {
    margin: 0;
    word-break: break-all;
  }
}

.studio-setting-row {
  align-items: center;
  margin-top: 12px;

  span {
    display: grid;
    gap: 4px;
  }
}

@media (max-width: 760px) {
  .studio-settings-shell {
    grid-template-columns: 1fr;
  }

  .studio-settings-shell > nav {
    display: flex;
    border-right: 0;
    overflow: auto;

    button {
      min-width: 150px;
    }
  }
}
</style>
