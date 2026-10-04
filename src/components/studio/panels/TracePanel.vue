<template>
  <TraceExplorer
    class="trace-panel"
    :trace-id="panelParams.resourceId || ''"
    :run-id="panelParams.runId || ''"
  />
</template>
<script setup>
import TraceExplorer from '@/components/trace/TraceExplorer.vue'
defineProps({ panelParams: { type: Object, default: () => ({}) } })
</script>
