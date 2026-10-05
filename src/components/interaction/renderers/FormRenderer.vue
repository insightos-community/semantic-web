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
  <el-form class="form-renderer" label-position="top" size="small" @submit.prevent="send">
    <el-form-item
      v-for="field in fields"
      :key="field.name"
      :label="field.label || field.name"
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

const props = defineProps({ interaction: { type: Object, required: true }, disabled: Boolean })
const emit = defineEmits(['submit'])
const interactions = useInteractionsStore()
const schema = computed(() => props.interaction.schema || {})
const fields = computed(() => {
  if (Array.isArray(schema.value.fields)) return schema.value.fields
  return Object.entries(schema.value.properties || {}).map(([name, value]) => ({
    name,
    ...value,
    required: (schema.value.required || []).includes(name)
  }))
})
const previous = interactions.drafts[props.interaction.id] || {}
const values = reactive(
  Object.fromEntries(
    fields.value.map((field) => [
      field.name,
      previous[field.name] ??
        props.interaction.initialValue?.[field.name] ??
        field.default ??
        (field.type === 'boolean' ? false : field.type === 'number' ? 0 : '')
    ])
  )
)
const valid = computed(() =>
  fields.value.every(
    (field) => !field.required || ![undefined, null, ''].includes(values[field.name])
  )
)
watch(values, (draft) => interactions.setDraft(props.interaction.id, draft), { deep: true })
function send() {
  if (valid.value) emit('submit', { ...values })
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
