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
  <div class="map-select-renderer">
    <div v-if="validSelection" class="selection">
      <b>{{ selectionLabel }}</b
      ><small>{{ map.selection.map_id }} · 地图版本 {{ map.selection.generation }}</small>
    </div>
    <div v-else class="empty">尚未选择地图实体、点或已保存区域</div>
    <div class="actions">
      <el-button size="small" :disabled="disabled" @click="openMap">进入地图选择</el-button>
      <el-button type="primary" size="small" :disabled="disabled || !validSelection" @click="send">
        提交选择
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useInteractionsStore } from '@/stores/interactions'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { openStudioPanel } from '@/studio/panelService'

const props = defineProps({ interaction: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['submit'])
const interactions = useInteractionsStore()
const map = useSemanticMapStore()
const validSelection = computed(
  () =>
    map.selectionValid &&
    map.selection.generation === map.activeSnapshot?.generation &&
    map.selectionPurpose === props.interaction.id
)
const selectionLabel = computed(() => {
  if (map.selection?.kind === 'entity') return '实体 · ' + map.selection.entity_id
  if (map.selection?.kind === 'region') return '区域 · ' + map.selection.entity_id
  if (map.selection?.kind === 'point') return '点位'
  return ''
})
function openMap() {
  map.beginSelection(props.interaction.id)
  openStudioPanel('map', { viewMode: 'select', resourceId: props.interaction.id })
}
function send() {
  if (!validSelection.value) return
  const selection = { ...map.selection }
  delete selection.map_id
  delete selection.generation
  emit('submit', {
    map_id: map.selection.map_id,
    generation: map.selection.generation,
    selections: [selection]
  })
}
watch(
  () => map.selection,
  (draft) => {
    if (draft && map.selectionValid && map.selectionPurpose === props.interaction.id) {
      interactions.setDraft(props.interaction.id, draft)
    } else {
      interactions.clearDraft(props.interaction.id)
    }
  },
  { deep: true, immediate: true }
)
watch(
  () => [map.activeMapId, map.activeSnapshot?.generation],
  ([mapId, generation]) => {
    const draft = interactions.drafts[props.interaction.id]
    if (draft && (draft.map_id !== mapId || draft.generation !== generation)) {
      interactions.clearDraft(props.interaction.id)
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.map-select-renderer {
  margin-top: 10px;
}
.selection,
.empty {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px;
  border-radius: 7px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
  font-size: 10px;
}
.selection b {
  color: var(--sf-text-primary);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
