<template>
  <div class="empty-state">
    <el-icon v-if="icon" class="empty-icon"><component :is="icon" /></el-icon>
    <p class="empty-text">{{ description }}</p>
    <div v-if="$slots.default" class="empty-action">
      <slot />
    </div>
  </div>
</template>

<script setup>
// 通用空态占位：图标 + 描述 + 可选操作区（slot）。
defineProps({
  description: { type: String, default: '暂无数据' },
  icon: { type: [Object, Function], default: null }
})
</script>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sf-space-2);
  padding: var(--sf-space-8) var(--sf-space-4);
  color: var(--sf-text-disabled);
}

.empty-icon {
  font-size: 32px;
}

.empty-text {
  margin: 0;
  font-size: var(--sf-font-sm);
}

.empty-action {
  margin-top: var(--sf-space-2);
}
</style>
