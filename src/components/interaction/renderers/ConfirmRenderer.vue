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
  <div class="actions">
    <el-button
      type="primary"
      size="small"
      :disabled="disabled"
      @click="$emit('submit', { approved: true })"
    >
      {{ approveLabel }}
    </el-button>
    <el-button size="small" :disabled="disabled" @click="$emit('submit', { approved: false })">
      {{ rejectLabel }}
    </el-button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ interaction: { type: Object, required: true }, disabled: Boolean })
defineEmits(['submit'])
const isPlanSuggestion = computed(() => props.interaction.action === 'enter_plan')
const approveLabel = computed(() => (isPlanSuggestion.value ? '进入规划' : '确认'))
const rejectLabel = computed(() => (isPlanSuggestion.value ? '继续协作' : '拒绝'))
</script>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
