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
