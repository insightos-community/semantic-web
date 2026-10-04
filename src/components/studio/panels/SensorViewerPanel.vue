<template>
  <section class="sensor-panel">
    <header>
      <div><b>Sensor Viewer</b><span>多路 RGB、Depth 与结构化传感器</span></div>
      <el-button
        size="small"
        :disabled="!store.selectedRobotId"
        @click="store.refreshSelectedRobot()"
      >
        刷新
      </el-button>
    </header>
    <CameraWall />
  </section>
</template>
<script setup>
import CameraWall from '@/components/simulation/CameraWall.vue'
import { useSimulationStore } from '@/stores/simulation'
const store = useSimulationStore()
</script>
<style scoped>
.sensor-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--sf-bg-secondary);
}
.sensor-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sf-border-light);
}
.sensor-panel header div {
  display: flex;
  flex-direction: column;
}
.sensor-panel header span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.sensor-panel :deep(.camera-wall) {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
</style>
