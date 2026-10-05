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
  <div ref="host" class="conversation-editor-host" data-testid="conversation-editor-host" />
</template>
<script setup>
import { inject, onMounted, onBeforeUnmount, ref } from 'vue'
import { conversationSurfaceKey } from '@/studio/conversationSurface'
const surface = inject(conversationSurfaceKey)
const host = ref(null)
onMounted(() => {
  if (surface) surface.editor.value = host.value
})
onBeforeUnmount(() => {
  if (surface?.editor.value === host.value) surface.editor.value = null
})
</script>
<style scoped>
.conversation-editor-host {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
