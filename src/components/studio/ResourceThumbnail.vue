<template>
  <span class="resource-thumbnail" :class="{ empty: !src }" aria-hidden="true">
    <ScenePreviewImage v-if="src" :src="src" :alt="alt" />
    <component :is="fallbackIcon" v-else />
  </span>
</template>

<script setup>
import { PictureRounded } from '@element-plus/icons-vue'
import ScenePreviewImage from '@/components/simulation/ScenePreviewImage.vue'

defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  fallbackIcon: { type: [Object, Function], default: PictureRounded }
})
</script>

<style scoped>
.resource-thumbnail {
  display: grid;
  width: 52px;
  height: 36px;
  flex: 0 0 52px;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  overflow: hidden;
  background: var(--sf-bg-tertiary);
  place-items: center;
}
.resource-thumbnail :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.resource-thumbnail svg {
  width: 16px;
  height: 16px;
  color: var(--sf-text-disabled);
}
</style>
