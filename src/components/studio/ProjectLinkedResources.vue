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
  <section class="linked-resources">
    <h3>项目资源</h3>
    <details open>
      <summary>
        场景 <small>{{ simulation.projectScenes.length }}</small>
      </summary>
      <button
        v-for="scene in simulation.projectScenes"
        :key="scene.project_scene_id"
        @click="
          openStudioPanel('scene-workspace', {
            resourceId: scene.project_scene_id,
            viewMode: 'setup'
          })
        "
      >
        {{ simulation.catalogById(scene.catalog_scene_id)?.name || scene.catalog_scene_id }}
      </button>
    </details>
    <details>
      <summary>
        Robot Skill <small>{{ skills.length }}</small>
      </summary>
      <button v-for="item in skills" :key="`${item.robotId}:${item.name}`" @click="openRobot(item)">
        <b>{{ item.name }}</b
        ><small>{{ item.robotId }} · {{ item.version }}</small>
      </button>
      <p v-if="!skills.length">尚未安装 Robot Skill</p>
    </details>
    <details>
      <summary>
        Ability <small>{{ abilities.length }}</small>
      </summary>
      <button
        v-for="item in abilities"
        :key="`${item.robotId}:${item.instance_id || item.name}`"
        @click="openRobot(item)"
      >
        <b>{{ item.name || item.ability_name || item.ability_type }}</b
        ><small>{{ item.robotId }}</small>
      </button>
      <p v-if="!abilities.length">尚未上报 Ability</p>
    </details>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
import { openStudioPanel } from '@/studio/panelService'
const props = defineProps({ robots: { type: Array, default: () => [] } })
const simulation = useSimulationStore()
const skills = computed(() =>
  props.robots.flatMap((robot) =>
    (robot.installed_skills || []).map((item) => ({ ...item, robotId: robot.robot_id }))
  )
)
const abilities = computed(() =>
  props.robots.flatMap((robot) =>
    (robot.abilities || []).map((item) => ({ ...item, robotId: robot.robot_id }))
  )
)
function openRobot(item) {
  openStudioPanel('robot-device', {
    resourceId: item.robotId,
    viewMode: 'skills',
    debugTab: item.instance_id ? 'abilities' : 'skills',
    abilityId: item.instance_id || '',
    skillKey: item.instance_id ? '' : `${item.name}@${item.version}`
  })
}
</script>
<style scoped>
.linked-resources {
  margin-top: 18px;
  border-top: 1px solid var(--sf-border-light);
  padding-top: 14px;
}
h3 {
  font-size: 12px;
  margin: 0 0 10px;
}
details {
  border-left: 1px solid var(--sf-border-light);
  padding-left: 10px;
  margin: 8px 0;
}
summary {
  cursor: pointer;
  font-size: 12px;
  padding: 5px 0;
}
small,
p {
  color: var(--sf-text-secondary);
  font-size: 11px;
}
summary small {
  float: right;
}
button {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  gap: 3px;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-primary);
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  overflow-wrap: anywhere;
}
button:hover {
  background: var(--sf-bg-hover);
}
</style>
