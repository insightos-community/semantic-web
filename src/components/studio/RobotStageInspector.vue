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
  <section class="stage-inspector" data-testid="robot-stage-inspector">
    <div class="time-grid">
      <div>
        <span>开始</span><b>{{ formatTime(stage.started_at) }}</b>
      </div>
      <div>
        <span>结束</span><b>{{ formatTime(stage.completed_at || stage.ended_at) }}</b>
      </div>
      <div>
        <span>耗时</span><b>{{ duration }}</b>
      </div>
    </div>

    <section v-if="hasJudgement" class="detail-card">
      <h3>语义判断</h3>
      <dl>
        <template v-if="stage.expectation">
          <dt>期望</dt>
          <dd>{{ stage.expectation }}</dd>
        </template>
        <template v-if="stage.observation">
          <dt>判断</dt>
          <dd>{{ stage.observation }}</dd>
        </template>
        <template v-if="stage.recovery_reason">
          <dt>恢复</dt>
          <dd class="warning">{{ stage.recovery_reason }}</dd>
        </template>
        <template v-if="stage.next_step">
          <dt>下一步</dt>
          <dd>{{ stage.next_step }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="telemetry.length" class="detail-card">
      <header>
        <h3>工具状态</h3>
        <span>{{ telemetry.length }}</span>
      </header>
      <div class="telemetry-grid">
        <div v-for="item in telemetry" :key="item.key" :class="{ alert: item.alert }">
          <span>{{ item.label }}</span>
          <b>{{ item.value }}</b>
        </div>
      </div>
    </section>

    <section v-if="actions.length" class="detail-card">
      <header>
        <h3>Action / Ability</h3>
        <span>{{ actions.length }}</span>
      </header>
      <article v-for="action in actions" :key="action.action_id || action.id" class="action-item">
        <div>
          <b>{{ action.action_type || action.type || 'Action' }}</b>
          <DeviceStatus :status="action.status" />
        </div>
        <p>{{ action.ability_name || action.ability_task || '未上报 Ability 名称' }}</p>
        <details>
          <summary>调用详情</summary>
          <pre>{{ compactJson(action) }}</pre>
        </details>
      </article>
      <p v-if="!actions.length" class="empty">该 Stage 尚未上报 Action。</p>
    </section>

    <details v-if="feedback.length" class="detail-card">
      <summary>反馈 · {{ feedback.length }}</summary>
      <header>
        <h3>Feedback</h3>
        <span>{{ feedback.length }}</span>
      </header>
      <article v-for="item in feedback" :key="feedbackKey(item)" class="signal feedback">
        <div>
          <b>#{{ item.sequence ?? '—' }} · {{ item.phase || 'feedback' }}</b>
          <time>{{ formatClock(item.occurred_at) }}</time>
        </div>
        <p>{{ item.message || '未提供文字摘要' }}</p>
        <pre v-if="item.measurements">{{ compactJson(item.measurements) }}</pre>
      </article>
      <p v-if="!feedback.length" class="empty">该 Stage 尚无 Feedback。</p>
    </details>

    <section class="detail-card">
      <header>
        <h3>观测与证据</h3>
        <span>{{ observations.length + evidence.length }}</span>
      </header>
      <div v-if="artifacts.length" class="stage-artifacts">
        <ArtifactCard
          v-for="artifact in artifacts"
          :key="artifact.id"
          :artifact="artifact"
          :deletable="false"
          large-preview
        />
      </div>
      <article v-for="item in observations" :key="observationKey(item)" class="signal observation">
        <div>
          <b>{{ item.type || item.kind || 'Observation' }}</b>
          <time>{{ formatClock(item.observed_at || item.occurred_at) }}</time>
        </div>
        <p>{{ item.summary || item.subject_ref || '未提供文字摘要' }}</p>
        <small>{{ observationSource(item) }}</small>
        <details v-if="item.value || item.artifact_refs?.length">
          <summary>详细数据</summary>
          <pre v-if="item.value">{{ compactJson(item.value) }}</pre>
          <div v-if="item.artifact_refs?.length" class="references">
            <code v-for="ref in item.artifact_refs" :key="ref">{{ ref }}</code>
          </div>
        </details>
      </article>
      <div v-if="unresolvedEvidence.length" class="references stage-evidence">
        <code v-for="ref in unresolvedEvidence" :key="ref">{{ ref }}</code>
      </div>
      <p v-if="!observations.length && !evidence.length" class="empty">
        该 Stage 尚无 Observation 或证据。
      </p>
    </section>

    <section class="execution-link">
      <span>Robot Execution</span><code>{{ execution.id }}</code>
    </section>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { buildRobotStageView } from '@/robot/executionViewAdapter'

const props = defineProps({
  execution: { type: Object, required: true },
  stage: { type: Object, required: true }
})

const stageView = computed(() => buildRobotStageView(props.execution, props.stage))
const actions = computed(() => stageView.value.actions)
const feedback = computed(() => stageView.value.feedback)
const observations = computed(() => stageView.value.observations)
const evidence = computed(() => stageView.value.evidence)
const unresolvedEvidence = computed(() => stageView.value.unresolvedRefs)
const telemetry = computed(() => stageView.value.telemetry)
const artifacts = computed(() => stageView.value.artifacts)
const hasJudgement = computed(() =>
  Boolean(
    props.stage.expectation ||
    props.stage.observation ||
    props.stage.recovery_reason ||
    props.stage.next_step
  )
)
const duration = computed(() => {
  const start = Date.parse(props.stage.started_at || '')
  const end = Date.parse(props.stage.completed_at || props.stage.ended_at || '')
  if (!Number.isFinite(start)) return '未开始'
  if (!Number.isFinite(end) || end < start) return props.stage.status === 'running' ? '进行中' : '—'
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
})

const validDate = (value) => value && !Number.isNaN(Date.parse(value))
const formatTime = (value) =>
  validDate(value) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
const formatClock = (value) =>
  validDate(value) ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '—'
const compactJson = (value) => JSON.stringify(value, null, 2)
const observationSource = (item) => {
  const source = item.source || '—'
  const frame = item.frame_id ? ` · ${item.frame_id}` : ''
  const confidence = Number.isFinite(Number(item.confidence))
    ? ` · 置信度 ${Number(item.confidence).toFixed(2)}`
    : ''
  return `${source}${frame}${confidence}`
}
const feedbackKey = (item) => `${item.action_id || ''}:${item.sequence ?? item.occurred_at ?? ''}`
const observationKey = (item) =>
  item.id ||
  `${item.action_id || ''}:${item.type || item.kind || ''}:${item.observed_at || item.occurred_at || ''}`
</script>

<style scoped lang="scss">
.stage-inspector {
  display: grid;
  gap: 12px;
  margin-top: 15px;
}
.stage-inspector summary {
  cursor: pointer;
  padding: 6px 0;
  color: var(--sf-text-secondary);
  font-size: 12px;
}
.stage-inspector pre {
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 11px/1.6 var(--sf-font-mono, monospace);
}
.stage-inspector :deep(.artifact-preview img) {
  max-height: 240px;
  object-fit: contain;
}
.time-grid {
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
}
.time-grid div {
  display: grid;
  gap: 3px;
  padding: 9px 11px;
  background: var(--sf-bg-tertiary);
}
.time-grid div + div {
  border-top: 1px solid var(--sf-border-light);
}
.time-grid span,
.execution-link span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.time-grid b {
  font-size: 11px;
}
.detail-card {
  padding: 11px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-tertiary);
}
.detail-card > header,
.action-item > div,
.signal > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.detail-card h3 {
  margin: 0 0 9px;
  font-size: 13px;
}
.detail-card > header h3 {
  margin: 0;
}
.detail-card > header > span {
  min-width: 20px;
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: center;
}
.detail-card dl {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 7px;
  margin: 0;
  font-size: 11px;
}
.detail-card dt {
  color: var(--sf-text-disabled);
}
.detail-card dd {
  margin: 0;
  line-height: 1.55;
}
.detail-card dd.warning {
  color: var(--sf-warning);
}
.telemetry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 8px;
}
.telemetry-grid div {
  display: grid;
  gap: 3px;
  padding: 7px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-secondary);
}
.telemetry-grid span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.telemetry-grid b {
  font-size: 11px;
}
.telemetry-grid div.alert b {
  color: var(--sf-danger);
}
.action-item,
.signal {
  display: grid;
  gap: 5px;
  margin-top: 8px;
  padding: 8px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-secondary);
  font-size: 11px;
}
.signal.feedback {
  border-left: 3px solid var(--sf-brand);
}
.signal.observation {
  border-left: 3px solid var(--sf-success);
}
.action-item p,
.signal p {
  margin: 0;
  color: var(--sf-text-secondary);
  line-height: 1.5;
}
.action-item code,
.signal code,
.execution-link code,
.signal time,
.signal small {
  overflow-wrap: anywhere;
  color: var(--sf-text-disabled);
  font:
    9px ui-monospace,
    monospace;
}
.references {
  display: grid;
  gap: 4px;
}
.references code {
  padding: 4px 5px;
  border-radius: 4px;
  background: var(--sf-bg-primary);
  color: var(--sf-brand);
}
.stage-evidence {
  margin-top: 8px;
}
.stage-artifacts {
  display: grid;
  margin-top: 8px;
}
.stage-artifacts :deep(.artifact-resource-card) {
  grid-template-columns: 42px minmax(0, 1fr);
}
.stage-artifacts :deep(.artifact-resource-card.large-preview) {
  grid-template-columns: minmax(0, 1fr);
}
.stage-artifacts :deep(.artifact-resource-actions) {
  grid-column: 1 / -1;
  flex-direction: row;
  justify-content: flex-end;
}
.empty {
  margin: 0;
  padding: 10px 3px 2px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: center;
}
.execution-link {
  display: grid;
  gap: 4px;
  padding: 9px 11px;
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-tertiary);
}
</style>
