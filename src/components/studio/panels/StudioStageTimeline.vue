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
  <section
    class="compact-stage-timeline"
    data-testid="studio-stage-timeline"
    :data-execution-id="execution.id"
    data-layout="horizontal"
  >
    <nav class="stage-axis" aria-label="Stage 时间轴">
      <button
        v-for="(stage, index) in stages"
        :key="stageKey(stage)"
        type="button"
        :data-stage="stage.name || stage.id"
        :class="{ selected: stageKey(selectedStage) === stageKey(stage) }"
        :aria-current="stageKey(selectedStage) === stageKey(stage) ? 'step' : undefined"
        :title="stage.label || stage.name"
        @click="$emit('select', stage)"
      >
        <span class="axis-node">{{ index + 1 }}</span>
        <b>{{ stageTitle(stage) }}</b>
        <time v-if="stage.started_at">{{
          new Date(stage.started_at).toLocaleTimeString('zh-CN', { hour12: false })
        }}</time>
        <small v-if="stage.detailsPending">详情待读取</small>
        <small v-else-if="lastReportedStageStatus(execution, stage)"
          >最后上报：{{ lastReportedStageStatus(execution, stage) }}</small
        >
        <DeviceStatus v-else :status="stage.status" />
      </button>
    </nav>
    <div v-if="selectedStage" class="stage-content">
      <div class="stage-copy">
        <header>
          <b :title="selectedStage.label || selectedStage.name">{{ stageTitle(selectedStage) }}</b
          ><button
            class="stage-log-button"
            type="button"
            title="查看此阶段日志"
            @click="$emit('logs')"
          >
            <Tickets />日志
          </button>
        </header>
        <p v-if="selectedStage.detailsPending">当前阶段摘要已上报，详细事件待读取。</p>
        <p
          v-if="typeof selectedStage.observation === 'string' && selectedStage.observation"
          class="stage-summary"
        >
          {{ selectedStage.observation }}
        </p>
        <p v-if="selectedStage.deviation" class="deviation">
          <span>偏差</span>{{ selectedStage.deviation }}
        </p>
        <p class="muted">详细状态与动作见右侧 Inspector。</p>
        <section v-for="problem in stageProblems" :key="problem.id" class="stage-problem">
          <b>{{ problem.resolutionLabel }}</b>
          <p>{{ problem.message }}</p>
          <p
            v-for="record in problem.recovery.filter((item) => item.type.startsWith('stage.'))"
            :key="record.id"
          >
            {{ record.message }}
          </p>
        </section>
      </div>
      <div class="stage-images" aria-label="当前阶段证据">
        <ArtifactCard
          v-for="artifact in images"
          :key="artifact.id"
          :artifact="artifact"
          :deletable="false"
          large-preview
        />
        <p v-if="!images.length" class="muted">{{ imageState }}</p>
      </div>
    </div>
    <p v-else class="muted">尚未上报 Stage；当前执行状态：{{ execution.status }}。</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { buildRobotStageView, lastReportedStageStatus } from '@/robot/executionViewAdapter'
import { stageKey } from '@/studio/executionProcess'
import { Tickets } from '@element-plus/icons-vue'
import { stageTitle } from '@/robot/stagePresentation'
import { executionProblems } from '@/robot/executionRecords'
import { useRobotStore } from '@/stores/robot'
const props = defineProps({
  execution: { type: Object, required: true },
  stages: { type: Array, default: () => [] },
  selectedStage: { type: Object, default: null }
})
defineEmits(['select', 'logs'])
const view = computed(() => buildRobotStageView(props.execution, props.selectedStage || {}))
const images = computed(() =>
  view.value.artifacts.filter((item) => !item.media_type || item.media_type.startsWith('image/'))
)
const robots = useRobotStore()
const stageProblems = computed(() =>
  executionProblems([props.execution], robots.eventsFor).filter(
    (item) => item.stage === props.selectedStage?.name
  )
)
const imageState = computed(() => {
  const refs = new Set(view.value.stageEvidence)
  const records = (props.execution.artifact_sync || []).filter(
    (item) =>
      refs.has(`pilot-artifact://${item.pilot_instance_id}/${item.local_artifact_id}`) ||
      refs.has(`artifact://${item.server_artifact_id}`)
  )
  if (records.some((item) => item.status === 'failed'))
    return '本阶段图片同步失败；可在问题查看详情。'
  if (stageProblems.value.some((item) => item.message === '阶段图像暂不可用'))
    return '阶段图像导入失败，尚未形成可预览文件。'
  const captured =
    view.value.observations.some((item) => item.kind === 'sensor.frame' || item.type === 'rgb') ||
    [...refs].some((ref) => /^(pilot-artifact|artifact):\/\//.test(ref))
  return captured ? '本阶段图片已采集，等待同步。' : '本阶段暂无图像采集记录。'
})
</script>

<style scoped>
.compact-stage-timeline {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 12px;
}
.stage-axis {
  display: flex;
  gap: 0;
  flex: none;
  overflow-x: auto;
  padding: 8px 10px;
  border-bottom: 1px solid var(--sf-border-light);
}
.stage-axis button {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 120px;
  flex: 1 0 120px;
  border: 0;
  padding: 8px;
  background: transparent;
  flex-shrink: 0;
}
.stage-axis button b {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 550;
}
.stage-axis button.selected {
  color: var(--sf-brand);
  background: color-mix(in srgb, var(--sf-brand) 8%, transparent);
}
.axis-node {
  z-index: 1;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 2px solid var(--sf-brand);
  border-radius: 50%;
  background: var(--sf-bg-secondary);
}
.stage-axis button::before {
  content: '';
  position: absolute;
  top: 21px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--sf-border-light);
}
.stage-axis button:first-child::before {
  left: 50%;
}
.stage-axis button:last-child::before {
  right: 50%;
}
.stage-axis time {
  color: var(--sf-text-secondary);
  font-size: 10px;
}
.stage-log-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.stage-log-button svg {
  width: 14px;
  height: 14px;
}
.stage-axis small {
  color: var(--sf-text-secondary);
}
.stage-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: minmax(160px, 0.7fr) minmax(200px, 1.3fr);
  gap: 10px;
  padding: 12px 16px;
  align-items: start;
}
.stage-copy {
  min-width: 0;
  overflow: auto;
}
header {
  display: flex;
  align-items: center;
  gap: 4px;
}
header > b {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
button {
  padding: 4px 6px;
  border: 1px solid var(--sf-border-light);
  border-radius: 4px;
  color: var(--sf-text-primary);
  background: transparent;
  font-size: 10px;
  cursor: pointer;
}
header > button {
  flex: none;
}
p {
  margin: 7px 0;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
p > span {
  margin-right: 5px;
  color: var(--sf-text-secondary);
}
.stage-copy p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.muted,
small {
  color: var(--sf-text-secondary);
}
.deviation {
  color: var(--sf-warning);
}
.telemetry {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.telemetry .alert {
  color: var(--sf-warning);
}
.stage-images {
  display: flex;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  min-height: 0;
}
.stage-images :deep(.artifact-resource-card) {
  min-width: 0;
  width: min(100%, 320px);
  flex: 0 0 min(100%, 320px);
  grid-template-rows: auto auto;
  box-sizing: border-box;
  padding: 4px;
}
.stage-images :deep(.artifact-preview) {
  height: auto;
  aspect-ratio: 4 / 3;
  min-height: 0;
  max-height: 220px;
}
.stage-problem {
  margin: 10px 0;
  padding: 10px;
  border-left: 2px solid var(--sf-warning);
  background: var(--sf-bg-tertiary);
}
.stage-images :deep(.artifact-preview img) {
  object-fit: contain;
  height: 100%;
}
.stage-images :deep(.artifact-resource-copy code),
.stage-images :deep(.artifact-resource-copy > span),
.stage-images :deep(.artifact-resource-actions) {
  display: none;
}
.stage-images :deep(.artifact-resource-copy b) {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stage-images :deep(.artifact-resource-copy time) {
  font-size: 9px;
}
</style>
