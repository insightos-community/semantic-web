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
