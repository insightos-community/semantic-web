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
  <section class="debug-timeline" data-testid="studio-execution-timeline" data-layout="horizontal">
    <header class="execution-heading">
      <div>
        <span class="eyebrow">ROBOT EXECUTION · DEBUG VIEW</span>
        <h2>{{ execution?.skill_name || '没有 Robot Execution' }}</h2>
        <p v-if="execution">{{ execution.id }} · {{ execution.robot_id }}</p>
      </div>
      <div v-if="execution" class="heading-actions">
        <DeviceStatus :status="execution.status" />
        <el-button
          v-if="canStop"
          type="danger"
          plain
          size="small"
          :loading="robots.stopPending(execution.id)"
          @click="requestStop"
        >
          请求安全停止
        </el-button>
      </div>
    </header>

    <div v-if="!execution" class="empty">当前 Project 没有 Robot Execution。</div>
    <template v-else>
      <nav class="execution-scope" aria-label="Robot Execution 所属任务">
        <span
          ><small>Workflow</small><b>{{ execution.workflow_id || '—' }}</b></span
        >
        <i>›</i>
        <span
          ><small>Task</small><b>{{ execution.task_id || '—' }}</b></span
        >
        <i>›</i>
        <span class="active"
          ><small>SubTask</small><b>{{ execution.subtask_id || '—' }}</b></span
        >
        <em>{{ progressLabel }}</em>
      </nav>

      <div class="timeline-viewport">
        <div v-if="stages.length" class="horizontal-timeline">
          <div class="time-axis" aria-hidden="true">
            <span v-for="stage in stages" :key="`time-${stageKey(stage)}`">
              <time>{{ formatClock(stage.started_at) }}</time>
              <small>{{ formatEndClock(stage) }}</small>
            </span>
          </div>

          <div class="rail" aria-hidden="true">
            <span
              v-for="(stage, index) in stages"
              :key="`rail-${stageKey(stage)}`"
              :data-status="stage.status"
              :class="{ current: stage.name === execution.stage }"
            >
              <i>{{ index + 1 }}</i>
            </span>
          </div>

          <div class="stage-columns">
            <article
              v-for="stage in stages"
              :key="stageKey(stage)"
              class="stage-column"
              :class="{
                current: stage.name === execution.stage,
                selected: isSelected(stage)
              }"
              role="button"
              tabindex="0"
              :aria-label="`在 Inspector 查看阶段 ${stage.label || stage.name}`"
              @click="selectStage(stage)"
              @keydown.enter.prevent="selectStage(stage)"
              @keydown.space.prevent="selectStage(stage)"
            >
              <header>
                <div>
                  <small>{{ stage.name }}</small>
                  <h3>{{ stage.label || stage.name }}</h3>
                </div>
                <DeviceStatus :status="stage.status" />
              </header>

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
              </dl>

              <section class="action-band">
                <h4>Action / Ability</h4>
                <article v-for="action in actionsFor(stage)" :key="action.action_id">
                  <div>
                    <b>{{ action.action_type || action.type }}</b
                    ><DeviceStatus :status="action.status" />
                  </div>
                  <p>{{ action.ability_name || action.ability_task || '—' }}</p>
                  <small>{{ action.ability_instance_id || '未上报 Ability instance' }}</small>
                </article>
                <p v-if="!actionsFor(stage).length" class="empty compact">尚无 Action</p>
              </section>

              <section class="signal-band">
                <header>
                  <h4>Feedback / Observation</h4>
                  <span>{{ feedbackFor(stage).length + observationsFor(stage).length }}</span>
                </header>
                <article
                  v-for="item in feedbackFor(stage)"
                  :key="feedbackKey(item)"
                  class="feedback"
                >
                  <div>
                    <b>{{ item.phase || 'feedback' }}</b
                    ><time>{{ formatClock(item.occurred_at) }}</time>
                  </div>
                  <p>{{ item.message || '未提供文字摘要' }}</p>
                </article>
                <article
                  v-for="item in observationsFor(stage)"
                  :key="observationKey(item)"
                  class="observation"
                >
                  <div>
                    <b>{{ item.type || item.kind || 'Observation' }}</b
                    ><time>{{ formatClock(item.occurred_at) }}</time>
                  </div>
                  <p>{{ item.summary || item.subject_ref || '未提供文字摘要' }}</p>
                  <div v-if="item.artifact_refs?.length" class="references">
                    <code v-for="artifactRef in item.artifact_refs" :key="artifactRef">{{
                      artifactRef
                    }}</code>
                  </div>
                </article>
                <div v-if="evidenceFor(stage).length" class="references">
                  <code v-for="evidenceRef in evidenceFor(stage)" :key="evidenceRef">{{
                    evidenceRef
                  }}</code>
                </div>
                <p
                  v-if="
                    !feedbackFor(stage).length &&
                    !observationsFor(stage).length &&
                    !evidenceFor(stage).length
                  "
                  class="empty compact"
                >
                  尚无反馈或观测
                </p>
              </section>
            </article>
          </div>
        </div>
        <div v-else class="empty">Skill 尚未上报 Stage。</div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { robotStageResourceId } from '@/devices/stageSelection'
import { useLayoutStore } from '@/stores/layout'
import { ACTIVE_ROBOT_EXECUTION_STATUSES, useRobotStore } from '@/stores/robot'
import { useUiStore } from '@/stores/ui'

const props = defineProps({ execution: { type: Object, default: null } })
const robots = useRobotStore()
const layout = useLayoutStore()
const ui = useUiStore()
const stages = computed(() => props.execution?.stages || [])
const stageGridColumns = computed(
  () => `repeat(${Math.max(stages.value.length, 1)}, minmax(270px, 1fr))`
)
const timelineMinWidth = computed(() => `${Math.max(stages.value.length, 1) * 270}px`)
const allActions = computed(() =>
  props.execution?.actions?.length
    ? props.execution.actions
    : props.execution?.current_action
      ? [props.execution.current_action]
      : []
)
const canStop = computed(
  () =>
    props.execution &&
    ACTIVE_ROBOT_EXECUTION_STATUSES.has(props.execution.status) &&
    props.execution.status !== 'interrupted'
)
const progressLabel = computed(() =>
  Number.isFinite(props.execution?.progress)
    ? `${Math.round(props.execution.progress * 100)}%`
    : '按 Stage 展示'
)

const stageKey = (stage) => stage?.id || stage?.name || ''
const actionsFor = (stage) => allActions.value.filter((item) => item.stage === stage.name)
function belongsToStage(item, stage) {
  if (item?.stage === stage.name) return true
  const ids = new Set(
    actionsFor(stage)
      .map((item) => item.action_id)
      .filter(Boolean)
  )
  return Boolean(item?.action_id && ids.has(item.action_id))
}
const feedbackFor = (stage) =>
  (props.execution?.feedback || [])
    .filter((item) => belongsToStage(item, stage))
    .slice()
    .reverse()
const observationsFor = (stage) =>
  (props.execution?.observations || [])
    .filter((item) => belongsToStage(item, stage))
    .slice()
    .reverse()
const evidenceFor = (stage) => [...new Set(stage?.evidence_refs || [])]
const isSelected = (stage) =>
  layout.selectedResource?.resourceType === 'robot_stage' &&
  layout.selectedResource.resourceId === robotStageResourceId(props.execution?.id, stage)
function selectStage(stage) {
  const resourceId = robotStageResourceId(props.execution?.id, stage)
  if (!resourceId) return
  layout.select({
    projectId: props.execution?.project_id,
    resourceType: 'robot_stage',
    resourceId,
    title: stage.label || stage.name
  })
  layout.revealInspector()
}
const validDate = (value) => value && !Number.isNaN(Date.parse(value))
const formatClock = (value) =>
  validDate(value) ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '—'
const formatEndClock = (stage) => {
  const value = stage.completed_at || stage.ended_at
  return value ? `至 ${formatClock(value)}` : stage.status === 'running' ? '进行中' : '未开始'
}
const feedbackKey = (item) => `${item.action_id || ''}:${item.sequence ?? item.occurred_at ?? ''}`
const observationKey = (item) =>
  item.id || `${item.action_id || ''}:${item.type || item.kind || ''}:${item.occurred_at || ''}`

async function requestStop() {
  try {
    await robots.stop(props.execution)
    ui.notify({ type: 'info', message: 'Server 已接受停止请求，等待 Pilot 返回物理停止结果' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot 停止请求失败' })
  }
}
</script>

<style scoped lang="scss">
.debug-timeline {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--sf-bg-primary);
}
.execution-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  gap: 18px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--sf-border-light);
}
.execution-heading h2,
.execution-heading p,
h3,
h4 {
  margin: 0;
}
.execution-heading h2 {
  margin: 3px 0;
  font-size: var(--sf-font-lg);
}
.execution-heading p {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
}
.eyebrow {
  color: var(--sf-role-robot);
  font-size: var(--sf-font-xs);
  font-weight: 380;
  letter-spacing: 0.11em;
}
.heading-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.execution-scope {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);
}
.execution-scope > span {
  display: grid;
  min-width: 130px;
  gap: 2px;
  padding: 7px 10px;
  border-radius: 6px;
  background: var(--sf-bg-tertiary);
}
.execution-scope > span.active {
  box-shadow: inset 3px 0 var(--sf-brand);
}
.execution-scope small {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.execution-scope b {
  overflow: hidden;
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.execution-scope i {
  color: var(--sf-text-disabled);
  font-style: normal;
}
.execution-scope em {
  margin-left: auto;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  font-style: normal;
}
.timeline-viewport {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 18px 20px 28px;
}
.horizontal-timeline {
  min-width: max(100%, v-bind(timelineMinWidth));
}
.time-axis,
.rail,
.stage-columns {
  display: grid;
  grid-template-columns: v-bind(stageGridColumns);
}
.time-axis > span {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 13px 8px;
}
.time-axis time {
  color: var(--sf-text-primary);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
  font-weight: 380;
}
.time-axis small {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.rail > span {
  position: relative;
  display: flex;
  align-items: center;
  height: 32px;
}
.rail > span::before,
.rail > span::after {
  height: 2px;
  flex: 1;
  background: var(--sf-border-light);
  content: '';
}
.rail > span:first-child::before,
.rail > span:last-child::after {
  background: transparent;
}
.rail i {
  display: grid;
  width: 26px;
  height: 26px;
  border: 2px solid var(--sf-border-light);
  border-radius: 50%;
  background: var(--sf-bg-primary);
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  font-style: normal;
  place-items: center;
}
.rail > span[data-status='completed'] i {
  border-color: var(--sf-success);
  color: var(--sf-success);
}
.rail > span.current i,
.rail > span[data-status='running'] i {
  border-color: var(--sf-brand);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--sf-brand) 14%, transparent);
  color: var(--sf-brand);
}
.stage-columns {
  align-items: stretch;
  gap: 10px;
}
.stage-column {
  display: grid;
  min-width: 0;
  grid-template-rows: auto auto auto 1fr;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  background: var(--sf-bg-secondary);
}
.stage-column.current,
.stage-column.selected,
.stage-column:focus-visible {
  border-color: color-mix(in srgb, var(--sf-brand) 60%, var(--sf-border-light));
  box-shadow: 0 5px 18px color-mix(in srgb, var(--sf-brand) 9%, transparent);
}
.stage-column > header,
.action-band article > div,
.signal-band > header,
.signal-band article > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.stage-column > header small {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
}
.stage-column h3 {
  margin-top: 3px;
  font-size: var(--sf-font-sm);
}
.stage-column dl {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 6px 8px;
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: var(--sf-bg-tertiary);
  font-size: var(--sf-font-xs);
}
.stage-column dt {
  color: var(--sf-text-disabled);
}
.stage-column dd {
  margin: 0;
  line-height: 1.5;
}
.stage-column dd.warning {
  color: var(--sf-warning);
}
.action-band,
.signal-band {
  min-width: 0;
  padding-top: 10px;
  border-top: 1px solid var(--sf-border-light);
}
.action-band h4,
.signal-band h4 {
  margin-bottom: 8px;
  font-size: var(--sf-font-xs);
}
.action-band article,
.signal-band article {
  display: grid;
  gap: 4px;
  margin-top: 6px;
  padding: 8px;
  border-radius: 6px;
  background: var(--sf-bg-tertiary);
  font-size: var(--sf-font-xs);
}
.action-band p,
.signal-band p {
  margin: 0;
  color: var(--sf-text-secondary);
  line-height: 1.45;
}
.action-band small,
.signal-band time {
  overflow: hidden;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  text-overflow: ellipsis;
}
.signal-band > header {
  align-items: center;
}
.signal-band > header span {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.signal-band article.feedback {
  border-left: 3px solid var(--sf-brand);
}
.signal-band article.observation {
  border-left: 3px solid var(--sf-success);
}
.references {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.references code {
  max-width: 100%;
  overflow: hidden;
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--sf-bg-primary);
  color: var(--sf-brand);
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
}
.empty {
  padding: 42px 18px;
  color: var(--sf-text-disabled);
  text-align: center;
}
.empty.compact {
  padding: 12px 6px;
  font-size: var(--sf-font-xs);
}
</style>
