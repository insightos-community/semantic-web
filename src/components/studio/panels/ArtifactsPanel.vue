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
  <section class="artifacts-panel">
    <header>
      <b>Artifacts</b>
      <span>{{ artifacts.items.length }} 项</span>
      <el-button size="small" text :loading="artifacts.loading" @click="load">刷新</el-button>
    </header>
    <div v-if="artifacts.items.length === 0" class="empty">尚未登记 Artifact</div>
    <ArtifactCard
      v-for="artifact in artifacts.items"
      :key="artifact.id"
      :artifact="artifact"
      :deleting="artifacts.deletingId === artifact.id"
      @click="select(artifact)"
      @delete="remove(artifact)"
    />
  </section>
</template>

<script setup>
import { onMounted } from 'vue'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import { useArtifactsStore } from '@/stores/artifacts'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'

const artifacts = useArtifactsStore()
const layout = useLayoutStore()
const project = useProjectStore()
const ui = useUiStore()

function load() {
  artifacts.load().catch((error) => {
    ui.notify({ type: 'error', message: error.message || 'Artifact 加载失败' })
  })
}

async function remove(artifact) {
  try {
    await artifacts.remove(artifact.id)
    if (
      layout.selectedResource?.resourceType === 'artifact' &&
      layout.selectedResource.resourceId === artifact.id
    ) {
      layout.select(null)
    }
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Artifact 删除失败' })
  }
}

function select(artifact) {
  layout.select({
    projectId: project.currentProjectId,
    resourceType: 'artifact',
    resourceId: artifact.id,
    title: artifact.summary || artifact.id
  })
}

onMounted(load)
</script>

<style scoped lang="scss">
.artifacts-panel {
  height: 100%;
  padding: 0 12px 12px;
  overflow: auto;
  background: var(--sf-bg-primary);

  > header {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 38px;

    span {
      flex: 1;
      color: var(--sf-text-disabled);
      font-size: 11px;
    }
  }
}

.empty {
  padding: 24px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: center;
}
</style>
