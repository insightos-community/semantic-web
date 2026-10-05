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
  <div class="resource-renderer">
    <button
      v-for="candidate in candidates"
      :key="candidate.id"
      type="button"
      :class="{ selected: isSelected(candidate.id) }"
      :disabled="disabled"
      @click="toggle(candidate.id)"
    >
      <img v-if="isImage && candidate.url" :src="candidate.url" :alt="candidate.label" />
      <span
        ><b>{{ candidate.label }}</b
        ><small>{{ candidate.mediaType || candidate.id }}</small></span
      >
    </button>
    <el-button type="primary" size="small" :disabled="disabled || !hasSelection" @click="send">
      提交资源
    </el-button>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useInteractionsStore } from '@/stores/interactions'

const props = defineProps({ interaction: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['submit'])
const interactions = useInteractionsStore()
const multiple = computed(() => props.interaction.schema?.type === 'array')
const selected = ref(interactions.drafts[props.interaction.id] ?? (multiple.value ? [] : ''))
const isImage = computed(() => props.interaction.uiKind === 'image_select')
const candidates = computed(() =>
  (props.interaction.candidates || []).map((item) => ({
    id: item.artifact_id || item.id,
    label: item.label || item.name || item.artifact_id || item.id,
    url: item.preview_url || item.url,
    mediaType: item.media_type
  }))
)
const hasSelection = computed(() =>
  multiple.value ? selected.value.length > 0 : Boolean(selected.value)
)
function isSelected(id) {
  return multiple.value ? selected.value.includes(id) : selected.value === id
}
function toggle(id) {
  if (!multiple.value) selected.value = id
  else if (selected.value.includes(id))
    selected.value = selected.value.filter((item) => item !== id)
  else selected.value = [...selected.value, id]
}
function send() {
  emit(
    'submit',
    multiple.value ? { artifact_ids: selected.value } : { artifact_id: selected.value }
  )
}
watch(selected, (draft) => interactions.setDraft(props.interaction.id, draft), { deep: true })
</script>

<style scoped lang="scss">
.resource-renderer {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.resource-renderer > button {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-primary);
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
  &.selected {
    border-color: var(--sf-brand);
    box-shadow: inset 3px 0 var(--sf-brand);
  }
  img {
    width: 56px;
    height: 42px;
    border-radius: 5px;
    object-fit: cover;
  }
  span {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }
  small {
    color: var(--sf-text-disabled);
  }
}
.resource-renderer > .el-button {
  justify-self: start;
}
</style>
