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
  <el-form
    class="form-renderer"
    label-position="top"
    size="small"
    novalidate
    @submit.prevent="send"
  >
    <el-form-item
      v-for="field in fields"
      :key="field.name"
      :label="field.label || field.title || field.name"
      :required="field.required"
    >
      <p v-if="field.description" class="field-description">{{ field.description }}</p>
      <el-switch
        v-if="field.type === 'boolean'"
        v-model="values[field.name]"
        :disabled="disabled"
      />
      <el-input-number
        v-else-if="field.type === 'number' || field.type === 'integer'"
        v-model="values[field.name]"
        :disabled="disabled"
        :min="field.minimum"
        :max="field.maximum"
        :step="field.type === 'integer' ? 1 : 0.01"
        :step-strictly="false"
      />
      <el-input
        v-else
        v-model="values[field.name]"
        :disabled="disabled"
        :type="field.multiline ? 'textarea' : 'text'"
        :placeholder="field.placeholder || ''"
      />
    </el-form-item>
    <el-button type="primary" native-type="submit" size="small" :disabled="disabled || !valid">
      提交
    </el-button>
  </el-form>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useInteractionsStore } from '@/stores/interactions'
import {
  displayFormField,
  displayFormValue,
  formResponse,
  validFormField
} from '@/studio/formFields'

const props = defineProps({ interaction: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['submit'])
const interactions = useInteractionsStore()
const schema = computed(() => props.interaction.schema || {})
const fields = computed(() => {
  if (Array.isArray(schema.value.fields)) return schema.value.fields.map(displayFormField)
  return Object.entries(schema.value.properties || {})
    .map(([name, value]) => ({
      name,
      ...value,
      required: (schema.value.required || []).includes(name)
    }))
    .map(displayFormField)
})
const previous = interactions.drafts[props.interaction.id] || {}
const values = reactive(
  Object.fromEntries(
    fields.value.map((field) => [
      field.name,
      displayFormValue(
        field,
        previous[field.name] ??
          props.interaction.initialValue?.[field.name] ??
          field.default ??
          (field.type === 'boolean' ? false : ['number', 'integer'].includes(field.type) ? 0 : '')
      )
    ])
  )
)
const valid = computed(() =>
  fields.value.every((field) => validFormField(field, values[field.name]))
)
// Store canonical units so remounting or restoring an older SI draft converts once.
watch(
  values,
  (draft) => interactions.setDraft(props.interaction.id, formResponse(fields.value, draft)),
  { deep: true }
)
function send() {
  if (!props.disabled && valid.value) emit('submit', formResponse(fields.value, values))
}
</script>

<style scoped>
.form-renderer {
  margin-top: 10px;
}
.form-renderer :deep(.el-form-item) {
  margin-bottom: 10px;
}
.field-description {
  width: 100%;
  margin: -2px 0 6px;
  color: var(--sf-text-disabled);
  font-size: 10px;
  line-height: 1.5;
}
</style>
