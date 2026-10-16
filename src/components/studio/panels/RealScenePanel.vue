<template>
  <section class="real-scene-config" data-testid="real-scene-config">
    <header>
      <div>
        <h2>{{ scene.name }}</h2>
        <p>选择项目机器人，再连接它提供的地图；可在下方查看已安装技能。</p>
      </div>
      <el-button type="primary" @click="$emit('show-map')">查看 Real Map</el-button>
    </header>
    <dl>
      <dt>接入方式</dt>
      <dd>实机接入 · Pilot</dd>
      <dt>地图来源机器人</dt>
      <dd>
        {{ scene.pilot_id ? scene.robot_name : '尚未选择地图来源' }}
        <small v-if="scene.pilot_id">{{ scene.robot_id }}</small>
      </dd>
      <dt>默认地图</dt>
      <dd>Real Map</dd>
      <dt>场景来源</dt>
      <dd>机器人地图服务中的孪生场景与导航标注</dd>
    </dl>
    <ProjectRealRobots :project-id="scene.project_id" @changed="$emit('synced')" />
    <PilotMapSource :project-id="scene.project_id" active @synced="$emit('synced')" />
  </section>
</template>

<script setup>
import PilotMapSource from '@/components/studio/PilotMapSource.vue'
import ProjectRealRobots from '@/components/studio/ProjectRealRobots.vue'
defineProps({ scene: { type: Object, required: true } })
defineEmits(['show-map', 'synced'])
</script>

<style scoped>
.real-scene-config {
  padding: 24px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
h2 {
  font-size: 18px;
  margin: 0 0 8px;
}
p,
dt,
small {
  color: var(--sf-text-secondary);
}
p {
  margin: 0;
  font-size: 13px;
}
dl {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 16px;
  margin: 24px 0;
  font-size: 14px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
small {
  display: block;
  margin-top: 6px;
}
</style>
