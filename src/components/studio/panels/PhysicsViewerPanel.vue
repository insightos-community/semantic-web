<template>
  <section class="simulation-panel"><PhysicsSceneViewer /></section>
</template>
<script setup>
import PhysicsSceneViewer from '@/components/simulation/PhysicsSceneViewer.vue'
</script>
<style scoped>
.simulation-panel {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #05080d;
}
</style>
