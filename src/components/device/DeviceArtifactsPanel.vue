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
  <section class="artifacts-panel">
    <header>
      <div>
        <h2>传感与证据</h2>
        <p>查看已上报的传感器状态和执行证据，点击图片可放大。</p>
      </div>
    </header>
    <section class="sensor-summary">
      <article v-for="sensor in robot.sensors || []" :key="sensor.id">
        <span>{{ sensor.type }}</span>
        <b>{{ sensor.id }}</b>
        <DeviceStatus :status="sensor.status" />
        <small>最近观测 {{ formatTime(sensor.last_observation_at) }}</small>
        <small v-if="sensor.value != null"
          >{{ formatValue(sensor.value) }} {{ sensor.unit || '' }}</small
        >
        <small v-if="sensor.measurements">{{ formatValue(sensor.measurements) }}</small>
      </article>
      <div v-if="!robot.sensors?.length" class="empty compact">Pilot 尚未上报传感器摘要。</div>
    </section>
    <div class="sync-summary">
      <div>
        <span>已同步</span><b>{{ statusCount('synced') }}</b>
      </div>
      <div>
        <span>同步中</span><b>{{ pendingCount }}</b>
      </div>
      <div>
        <span>同步失败</span><b>{{ statusCount('failed') }}</b>
      </div>
    </div>
    <div class="artifact-previews">
      <ArtifactCard
        v-for="artifact in syncedArtifacts"
        :key="artifact.id"
        :artifact="artifact"
        :deletable="false"
        large-preview
      />
    </div>
    <div class="artifact-table">
      <header>
        <span>证据</span><span>引用</span><span>类型</span><span>状态</span><span>更新时间</span>
      </header>
      <div v-for="item in records" :key="`${item.execution_id}:${item.local_artifact_id}`">
        <span
          ><b>{{ item.summary || item.local_artifact_id }}</b
          ><small>{{ item.execution_id }}</small></span
        >
        <code>{{
          item.server_artifact_id ? `artifact://${item.server_artifact_id}` : '等待 Server 引用'
        }}</code>
        <span>{{ item.media_type || '未知' }}</span>
        <DeviceStatus :status="item.status" />
        <span>{{ formatTime(item.updated_at) }}</span>
      </div>
      <div v-if="!records.length" class="empty">当前 Robot 还没有 Artifact 同步记录。</div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import { recordText } from '@/robot/executionRecords'
import { useArtifactSyncStore } from '@/stores/artifactSync'

const props = defineProps({ robot: { type: Object, required: true } })
const artifacts = useArtifactSyncStore()
const records = computed(() =>
  artifacts.records.filter((item) => item.robot_id === props.robot.robot_id)
)
const pendingCount = computed(
  () =>
    records.value.filter((item) => ['announced', 'uploading', 'downloading'].includes(item.status))
      .length
)
const syncedArtifacts = computed(() =>
  records.value
    .filter((item) => item.status === 'synced' && item.server_artifact_id)
    .map((item) => ({
      id: item.server_artifact_id,
      media_type: item.media_type,
      summary: item.summary,
      size: item.size_bytes || item.size,
      stage: item.stage,
      captured_at: item.captured_at || item.observed_at || ''
    }))
)
const formatValue = recordText
const statusCount = (status) => records.value.filter((item) => item.status === status).length
const formatTime = (value) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
</script>

<style scoped lang="scss">
.artifacts-panel {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 28px 36px;
}
h2 {
  margin: 0;
  font-size: 17px;
}
header p {
  margin: 5px 0 0;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.sensor-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  margin-top: 18px;
}
.artifact-previews {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.sensor-summary article {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 5px 10px;
  padding: 12px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
}
.sensor-summary article > span,
.sensor-summary small {
  color: var(--sf-text-disabled);
  font-size: 9px;
}
.sensor-summary b {
  font-family: ui-monospace, monospace;
  font-size: 10px;
}
.sensor-summary small {
  grid-column: 1 / -1;
}
.sync-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 18px 0;
}
.sync-summary div {
  display: flex;
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  flex-direction: column;
  gap: 4px;
}
.sync-summary span {
  color: var(--sf-text-disabled);
  font-size: 10px;
}
.sync-summary b {
  font-size: 18px;
}
.artifact-table {
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-secondary);
}
.artifact-table > header,
.artifact-table > div:not(.empty) {
  display: grid;
  align-items: center;
  grid-template-columns: 1.2fr 1.3fr 0.8fr 0.7fr 0.9fr;
  gap: 10px;
  min-height: 44px;
  padding: 0 13px;
  border-bottom: 1px solid var(--sf-border-light);
  font-size: 10px;
}
.artifact-table > header {
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-disabled);
  font-weight: 520;
}
.artifact-table > div > span:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.artifact-table small {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
}
code {
  overflow: hidden;
  color: var(--sf-brand);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  padding: 30px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: center;
}
</style>
