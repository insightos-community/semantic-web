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
