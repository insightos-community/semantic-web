<template>
  <div class="geometry-dimensions" data-testid="map-geometry-dimensions">
    <label v-for="field in fields" :key="field.key">
      <span>{{ field.label }}</span>
      <el-input-number
        :key="`${field.key}-${disabled}`"
        :model-value="field.value"
        :aria-label="field.label"
        :disabled="disabled"
        :controls="controls"
        :min="field.key === 'radius' ? 0.005 : 0.01"
        :step="modelValue.kind === 'cylinder' ? 0.01 : 0.1"
        @update:model-value="update(field.key, $event)"
      />
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: Boolean,
  controls: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue'])
const fields = computed(() => {
  const size = props.modelValue.size || {}
  if (props.modelValue.kind === 'cylinder') {
    return [
      { key: 'radius', label: '半径 R（米）', value: size.x == null ? undefined : size.x / 2 },
      { key: 'z', label: '高度 H（米）', value: size.z }
    ]
  }
  return [
    { key: 'x', label: '宽 X（米）', value: size.x },
    { key: 'y', label: '深 Y（米）', value: size.y },
    { key: 'z', label: '高 Z（米）', value: size.z }
  ]
})

function update(key, value) {
  const size = { ...props.modelValue.size }
  if (key === 'radius') size.x = value == null ? undefined : value * 2
  else size[key] = value
  // The existing renderer uses bounding diameters; the API already converts
  // them to canonical bounds.radius/height. Keep a single geometry model.
  if (props.modelValue.kind === 'cylinder') size.y = size.x
  emit('update:modelValue', { ...props.modelValue, size })
}
</script>

<style scoped>
.geometry-dimensions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}
label {
  display: flex;
  flex: 1 1 100px;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--sf-text-secondary);
  font-size: 12px;
}
.geometry-dimensions :deep(.el-input-number) {
  width: 100%;
}
</style>
