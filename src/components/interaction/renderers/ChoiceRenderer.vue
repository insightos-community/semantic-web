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
  <div class="choice-renderer">
    <el-checkbox-group v-if="multiple" v-model="selected" :disabled="disabled">
      <el-checkbox v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </el-checkbox>
    </el-checkbox-group>
    <el-radio-group v-else v-model="selected" :disabled="disabled">
      <el-radio v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </el-radio>
    </el-radio-group>
    <label v-if="interaction.allowOther" class="other-choice">
      <span>其他（自行填写）</span>
      <el-input
        v-model="otherValue"
        size="small"
        :disabled="disabled"
        placeholder="以上选项都不合适时，在这里填写"
        @focus="selectOther"
      />
    </label>
    <el-button
      type="primary"
      size="small"
      :disabled="disabled || !hasSelection"
      @click="submitSelection"
    >
      提交选择
    </el-button>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useInteractionsStore } from '@/stores/interactions'

const props = defineProps({ interaction: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['submit'])
const interactions = useInteractionsStore()
const multiple = computed(() => props.interaction.uiKind === 'multi_select')
const responseField = computed(() => {
  const fallback = multiple.value ? 'values' : 'value'
  const schema = props.interaction.schema || {}
  const properties = schema.properties || {}
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name) => Object.hasOwn(properties, name))
    : []
  if (required.length === 1) return required[0]
  const propertyNames = Object.keys(properties)
  return propertyNames.length === 1 ? propertyNames[0] : fallback
})
const options = computed(() =>
  (props.interaction.options || []).map((item) =>
    typeof item === 'object'
      ? { value: item.value ?? item.id, label: item.label || item.name || item.value || item.id }
      : { value: item, label: String(item) }
  )
)
const savedDraft = interactions.drafts[props.interaction.id]
const savedSelection =
  savedDraft && typeof savedDraft === 'object' && !Array.isArray(savedDraft)
    ? savedDraft.selected
    : savedDraft
const selected = ref(
  savedSelection ?? (multiple.value ? [] : (props.interaction.initialValue ?? ''))
)
const otherValue = ref(
  savedDraft && typeof savedDraft === 'object' && !Array.isArray(savedDraft)
    ? savedDraft.other || ''
    : ''
)
const hasSelection = computed(() =>
  multiple.value
    ? selected.value.length > 0 || Boolean(otherValue.value.trim())
    : ![undefined, null, ''].includes(selected.value) || Boolean(otherValue.value.trim())
)
function selectOther() {
  if (!multiple.value) selected.value = ''
}
function submitSelection() {
  if (!hasSelection.value) return
  const custom = otherValue.value.trim()
  emit(
    'submit',
    multiple.value
      ? { [responseField.value]: custom ? [...selected.value, custom] : selected.value }
      : { [responseField.value]: custom || selected.value }
  )
}
function persistDraft() {
  interactions.setDraft(props.interaction.id, {
    selected: selected.value,
    other: otherValue.value
  })
}
watch(selected, persistDraft, { deep: true })
watch(otherValue, (value) => {
  if (value.trim() && !multiple.value) selected.value = ''
  persistDraft()
})
</script>

<style scoped>
.choice-renderer {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
.choice-renderer :deep(.el-checkbox-group),
.choice-renderer :deep(.el-radio-group) {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: stretch;
  flex-direction: column;
  gap: 6px;
}
.choice-renderer :deep(.el-radio),
.choice-renderer :deep(.el-checkbox) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: auto;
  margin: 0;
  padding: 9px 10px;
  align-items: flex-start;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
  white-space: normal;
}
.choice-renderer :deep(.el-radio.is-checked),
.choice-renderer :deep(.el-checkbox.is-checked) {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.choice-renderer :deep(.el-radio__input),
.choice-renderer :deep(.el-checkbox__input) {
  flex: 0 0 auto;
  margin-top: 3px;
}
.choice-renderer :deep(.el-radio__label),
.choice-renderer :deep(.el-checkbox__label) {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.other-choice {
  display: grid;
  min-width: 0;
  width: min(100%, 440px);
  gap: 6px;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
</style>
