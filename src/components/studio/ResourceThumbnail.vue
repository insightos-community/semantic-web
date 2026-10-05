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
