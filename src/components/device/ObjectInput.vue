<template>
  <div class="object-input">
    <div v-for="(value, key) in modelValue" :key="key" class="field-row">
      <span>{{ key }}</span>
      <details v-if="value !== null && typeof value === 'object'" open>
        <summary>{{ Array.isArray(value) ? `${value.length} 项` : '参数' }}</summary>
        <ObjectInput :model-value="value" @update:model-value="update(key, $event)" />
      </details>
      <el-switch
        v-else-if="typeof value === 'boolean'"
        :model-value="value"
        @update:model-value="update(key, $event)"
      />
      <el-input-number
        v-else-if="typeof value === 'number'"
        :model-value="value"
        controls-position="right"
        @update:model-value="update(key, $event)"
      />
      <el-input
        v-else
        :model-value="value"
        :aria-label="String(key)"
        :placeholder="value === null ? 'null（未设置）' : ''"
        @update:model-value="update(key, $event)"
      />
    </div>
  </div>
</template>
<script setup>
const props = defineProps({ modelValue: { type: [Object, Array], required: true } })
const emit = defineEmits(['update:modelValue'])
function update(key, value) {
  const next = Array.isArray(props.modelValue) ? [...props.modelValue] : { ...props.modelValue }
  next[key] = value
  emit('update:modelValue', next)
}
</script>
<style scoped>
.object-input {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.field-row {
  display: grid;
  grid-template-columns: minmax(120px, 30%) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  font-size: 12px;
}
.field-row > span {
  color: var(--sf-text-secondary);
  padding-top: 6px;
  overflow-wrap: anywhere;
}
details {
  min-width: 0;
  border-left: 2px solid var(--sf-border-light);
  padding-left: 12px;
}
summary {
  cursor: pointer;
  color: var(--sf-text-secondary);
  margin-bottom: 10px;
}
.el-input-number {
  width: 100%;
}
</style>
