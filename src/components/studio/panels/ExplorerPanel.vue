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
  <aside class="explorer-panel">
    <header>
      <span>当前 Project</span>
      <b>{{ project.currentProject?.name }}</b>
      <small>{{ project.currentProject?.mode === 'running' ? '运行模式' : '开发模式' }}</small>
    </header>
    <section>
      <div class="section-title"><span>Project 资源</span></div>
      <button type="button" class="resource-row" @click="open('memory')">
        <Document />
        <span><b>Project Memory</b><small>项目共享 Markdown 信息</small></span>
      </button>
      <button type="button" class="resource-row" @click="open('artifacts')">
        <FolderOpened />
        <span><b>Artifacts</b><small>运行产生的文件与证据</small></span>
      </button>
    </section>
  </aside>
</template>

<script setup>
import { Document, FolderOpened } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { openStudioPanel } from '@/studio/panelService'

const project = useProjectStore()
const open = (type) => openStudioPanel(type)
</script>

<style scoped lang="scss">
.explorer-panel {
  height: 100%;
  padding: 14px 12px;
  overflow-y: auto;
  background: var(--sf-bg-secondary);

  > header {
    display: flex;
    flex-direction: column;
    padding: 14px;
    border: 1px solid var(--sf-border-light);
    border-radius: var(--sf-radius-lg);
    background: var(--sf-bg-tertiary);

    span,
    small {
      color: var(--sf-text-disabled);
      font-size: 11px;
    }

    b {
      margin: 4px 0;
      font-size: 14px;
    }
  }

  section {
    margin-top: 20px;
  }
}

.section-title {
  padding: 0 7px 7px;
  color: var(--sf-brand);
  font-size: 10px;
  font-weight: 380;
  letter-spacing: 0.09em;
}

.resource-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 46px;
  gap: 10px;
  margin-bottom: 4px;
  padding: 6px 9px;
  border: 0;
  border-radius: var(--sf-radius-md);
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  text-align: left;

  > svg {
    width: 17px;
    flex: none;
  }

  > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  b {
    color: var(--sf-text-primary);
    font-size: 12px;
  }

  small {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }

  &:hover {
    background: var(--sf-bg-hover);
    color: var(--sf-brand);
  }
}

.hint {
  margin: 20px 4px 0;
  padding: 11px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-brand-soft);
  color: var(--sf-text-secondary);
  font-size: 11px;
  line-height: 1.55;
}
</style>
