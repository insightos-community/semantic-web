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
    class="execution-timeline"
    :class="{ 'current-first': currentFirst }"
    data-testid="robot-execution-timeline"
    data-layout="vertical"
  >
    <header v-if="!currentFirst" class="timeline-header">
      <div>
        <span class="eyebrow">ROBOT EXECUTION</span>
        <h2>{{ execution?.skill_name || '没有 Robot Execution' }}</h2>
      </div>
      <div v-if="execution" class="header-actions">
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

    <div v-if="!execution" class="empty">当前 Project 或 Robot 没有执行记录。</div>
    <template v-else>
      <details class="execution-details" @click.stop>
        <summary>执行身份与时间</summary>
        <div class="execution-context">
          <div>
            <span>Execution / Robot / Skill 版本</span
            ><b>{{ execution.id }} · {{ execution.robot_id }} · v{{ execution.skill_version }}</b>
          </div>
          <div>
            <span>Workflow</span><b>{{ execution.workflow_id || '—' }}</b>
          </div>
          <div>
            <span>Task</span><b>{{ execution.task_id || '—' }}</b>
          </div>
          <div>
            <span>SubTask</span><b>{{ execution.subtask_id || '—' }}</b>
          </div>
          <div>
            <span>进度</span><b>{{ progressLabel }}</b>
          </div>
          <div>
            <span>开始</span
            ><b>{{ formatDateTime(execution.created_at || execution.started_at) }}</b>
          </div>
          <div>
            <span>更新</span><b>{{ formatDateTime(execution.updated_at) }}</b>
          </div>
          <div>
            <span>耗时</span><b>{{ durationLabel(execution, now) }}</b>
          </div>
        </div>
      </details>

      <section class="stage-section">
        <header v-if="!currentFirst" class="section-heading">
          <div>
            <h3>语义阶段时间线</h3>
            <p>
              左侧是阶段实际时间，中间是 Skill 上报的期望与动作，右侧是同阶段的反馈、观测和证据。
            </p>
          </div>
          <span>{{ stages.length }} 个阶段</span>
        </header>

        <div v-if="stages.length" class="vertical-timeline">
          <article
            v-for="stage in displayStages"
            :key="stageKey(stage)"
            class="stage-row"
            :class="{
              current: stage.name === execution.stage && !lastReportedStageStatus(execution, stage),
              selected: isSelected(stage)
            }"
            :data-status="
              lastReportedStageStatus(execution, stage) ? 'last_reported' : stage.status
            "
            :data-stage="stage.name || stage.id"
            role="button"
            tabindex="0"
            :aria-label="`在 Inspector 查看阶段 ${stage.label || stage.name}`"
            @click="selectStage(stage)"
            @keydown.enter.prevent="selectStage(stage)"
            @keydown.space.prevent="selectStage(stage)"
          >
            <aside class="stage-clock" aria-label="阶段时间">
              <span>开始</span>
              <time>{{ formatClock(stage.started_at) }}</time>
              <small>{{ formatDate(stage.started_at) }}</small>
              <i></i>
              <span>结束</span>
              <time>{{ formatClock(stage.completed_at || stage.ended_at) }}</time>
              <small>{{ formatDate(stage.completed_at || stage.ended_at) }}</small>
              <b>{{ durationFor(stage) }}</b>
            </aside>

            <div class="stage-rail" aria-hidden="true">
              <span>{{ stages.indexOf(stage) + 1 }}</span>
            </div>

            <section class="stage-summary">
              <header>
                <div>
                  <small>{{ stage.name }}</small>
                  <h4>
                    {{ lastReportedStageStatus(execution, stage) ? '最后阶段 · ' : ''
                    }}{{ stage.label || stage.name }}
                  </h4>
                </div>
                <span v-if="lastReportedStageStatus(execution, stage)" class="last-reported"
                  >最后上报：{{ lastReportedStageStatus(execution, stage) }}</span
                >
                <DeviceStatus v-else :status="stage.status" />
              </header>

              <dl>
                <template v-if="stage.expectation">
                  <dt>语义期望</dt>
                  <dd>{{ stage.expectation }}</dd>
                </template>
                <template v-if="stage.observation">
                  <dt>阶段判断</dt>
                  <dd>{{ stage.observation }}</dd>
                </template>
                <template v-if="stage.recovery_reason">
                  <dt>局部恢复</dt>
                  <dd class="warning">{{ stage.recovery_reason }}</dd>
                </template>
                <template v-if="stage.next_step">
                  <dt>下一步</dt>
                  <dd>{{ stage.next_step }}</dd>
                </template>
              </dl>

              <details
                v-if="actionsFor(stage).length"
                class="stage-details"
                @click.stop
                @keydown.stop
              >
                <summary>Action / Ability 明细 · {{ actionsFor(stage).length }}</summary>
                <div class="action-list">
                  <article v-for="action in actionsFor(stage)" :key="action.action_id">
                    <div>
                      <span>ACTION / ABILITY</span>
                      <b>{{ action.action_type || action.type }}</b>
                      <small>{{ action.ability_name || action.ability_task || '—' }}</small>
                    </div>
                    <div class="action-meta">
                      <DeviceStatus :status="action.status" />
                      <small>{{ action.ability_instance_id || '未上报 Ability instance' }}</small>
                      <small>{{ action.invocation_id || action.action_id }}</small>
                    </div>
                  </article>
                </div>
              </details>
            </section>

            <aside class="stage-evidence">
              <section v-if="viewFor(stage).artifacts.length" class="stage-artifacts">
                <ArtifactCard
                  v-for="artifact in artifactsFor(stage)"
                  :key="artifact.id"
                  :artifact="artifact"
                  :deletable="false"
                  large-preview
                  @click.stop
                />
              </section>
              <section>
                <header>
                  <h5>Feedback</h5>
                  <span>{{ feedbackFor(stage).length }}</span>
                </header>
                <article
                  v-for="item in feedbackFor(stage)"
                  :key="item.display_key || feedbackKey(item)"
                  data-testid="stage-feedback"
                >
                  <div>
                    <b>#{{ item.sequence ?? '—' }} · {{ item.phase || 'feedback' }}</b>
                    <time>{{ formatClock(item.occurred_at) }}</time>
                  </div>
                  <p>{{ item.message || '未提供文字摘要' }}</p>
                  <small v-if="item.repeat_count > 1">已更新 {{ item.repeat_count }} 次</small>
                  <small v-if="item.measurements">{{ compactJson(item.measurements) }}</small>
                </article>
                <p v-if="!feedbackFor(stage).length" class="empty compact">尚无 Feedback</p>
              </section>

              <section>
                <header>
                  <h5>Observation / 证据</h5>
                  <span>{{ observationsFor(stage).length }}</span>
                </header>
                <details
                  v-if="observationsFor(stage).length || evidenceFor(stage).length"
                  class="stage-details"
                  @click.stop
                  @keydown.stop
                >
                  <summary>观测原文与引用 · {{ observationsFor(stage).length }}</summary>
                  <article v-for="item in observationsFor(stage)" :key="observationKey(item)">
                    <div>
                      <b>{{ item.type || item.kind || 'Observation' }}</b>
                      <time>{{ formatClock(item.occurred_at) }}</time>
                    </div>
                    <p>{{ item.summary || item.subject_ref || '未提供文字摘要' }}</p>
                    <small>{{ item.source || item.frame_id || '—' }}</small>
                    <pre>{{ compactJson(item) }}</pre>
                    <div v-if="item.artifact_refs?.length" class="reference-list">
                      <code v-for="artifactRef in item.artifact_refs" :key="artifactRef">{{
                        artifactRef
                      }}</code>
                    </div>
                  </article>
                  <div v-if="evidenceFor(stage).length" class="reference-list stage-refs">
                    <code v-for="evidenceRef in evidenceFor(stage)" :key="evidenceRef">{{
                      evidenceRef
                    }}</code>
                  </div>
                  <p
                    v-for="reference in viewFor(stage).unresolvedRefs"
                    :key="reference"
                    class="warning"
                  >
                    尚无可读取文件：{{ reference }}
                  </p>
                </details>
                <dl v-if="viewFor(stage).telemetry.length" class="stage-telemetry">
                  <template v-for="value in viewFor(stage).telemetry" :key="value.key">
                    <dt>{{ value.label }}</dt>
                    <dd :class="{ warning: value.alert }">{{ value.value }}</dd>
                  </template>
                </dl>
                <p
                  v-if="!observationsFor(stage).length && !evidenceFor(stage).length"
                  class="empty compact"
                >
                  尚无 Observation 或证据
                </p>
              </section>
            </aside>
          </article>
        </div>
        <div v-else class="empty">Skill 尚未上报 Stage。</div>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import {
  buildRobotStageView,
  currentExecutionStage,
  lastReportedStageStatus
} from '@/robot/executionViewAdapter'
import { durationLabel } from '@/robot/executionRecords'
import { robotStageResourceId } from '@/devices/stageSelection'
import { useLayoutStore } from '@/stores/layout'
import { ACTIVE_ROBOT_EXECUTION_STATUSES, useRobotStore } from '@/stores/robot'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  execution: { type: Object, default: null },
  currentFirst: { type: Boolean, default: false }
})
const robots = useRobotStore()
const layout = useLayoutStore()
const ui = useUiStore()
const now = ref(Date.now())
const timer = setInterval(() => {
  now.value = Date.now()
}, 1000)
onBeforeUnmount(() => clearInterval(timer))

const stages = computed(() => props.execution?.stages || [])
const displayStages = computed(() => {
  const current = props.currentFirst && currentExecutionStage(props.execution || {})
  return current ? [current, ...stages.value.filter((stage) => stage !== current)] : stages.value
})
const stageViews = computed(
  () =>
    new Map(
      stages.value.map((stage) => [stageKey(stage), buildRobotStageView(props.execution, stage)])
    )
)
const viewFor = (stage) => stageViews.value.get(stageKey(stage))
const artifactsFor = (stage) =>
  props.currentFirst ? [...viewFor(stage).artifacts].reverse() : viewFor(stage).artifacts
const allActions = computed(() => {
  if (props.execution?.actions?.length) return props.execution.actions
  return props.execution?.current_action ? [props.execution.current_action] : []
})
const canStop = computed(
  () =>
    props.execution &&
    ACTIVE_ROBOT_EXECUTION_STATUSES.has(props.execution.status) &&
    props.execution.status !== 'interrupted'
)
const progressLabel = computed(() =>
  Number.isFinite(props.execution?.progress)
    ? `${Math.round(props.execution.progress * 100)}%`
    : '由阶段状态表示'
)

function stageKey(stage) {
  return stage?.id || stage?.name || ''
}
function actionsFor(stage) {
  return allActions.value.filter((item) => item.stage === stage.name)
}
function belongsToStage(item, stage) {
  if (item?.stage === stage.name) return true
  const actionIds = new Set(
    actionsFor(stage)
      .map((item) => item.action_id)
      .filter(Boolean)
  )
  return Boolean(item?.action_id && actionIds.has(item.action_id))
}
function feedbackFor(stage) {
  return viewFor(stage).feedback
}
function observationsFor(stage) {
  return (props.execution?.observations || [])
    .filter((item) => belongsToStage(item, stage))
    .slice()
    .reverse()
}
function evidenceFor(stage) {
  return viewFor(stage).unresolvedRefs
}
function isSelected(stage) {
  return (
    layout.selectedResource?.resourceType === 'robot_stage' &&
    layout.selectedResource.resourceId === robotStageResourceId(props.execution?.id, stage)
  )
}
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
function durationFor(stage) {
  const start = Date.parse(stage?.started_at || '')
  const end = Date.parse(stage?.completed_at || stage?.ended_at || '')
  if (!Number.isFinite(end) && lastReportedStageStatus(props.execution, stage))
    return '结束时间未上报'
  if (!Number.isFinite(start)) return '未开始'
  if (!Number.isFinite(end) || end < start) return stage?.status === 'running' ? '进行中' : '—'
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

const validDate = (value) => value && !Number.isNaN(Date.parse(value))
const formatDateTime = (value) =>
  validDate(value) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
const formatClock = (value) =>
  validDate(value) ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '—'
const formatDate = (value) =>
  validDate(value)
    ? new Date(value).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : '—'
const compactJson = (value) => JSON.stringify(value)
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
.execution-timeline {
  container-type: inline-size;
  height: 100%;
  overflow: auto;
  background: var(--sf-bg-primary);
}
.last-reported {
  color: var(--sf-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}
.execution-details,
.stage-details {
  font-size: 11px;
  summary {
    padding: 6px 0;
    color: var(--sf-text-secondary);
    cursor: pointer;
  }
  pre {
    max-height: 240px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 10px;
  }
}
.execution-details > summary {
  padding-inline: 20px;
}
.timeline-header,
.execution-context,
.stage-section {
  max-width: 1540px;
  margin-inline: auto;
}
.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 30px 16px;
}
.timeline-header h2,
h3,
h4,
h5 {
  margin: 0;
}
.timeline-header h2 {
  margin: 3px 0;
  font-size: var(--sf-font-xl);
}
.timeline-header p {
  margin: 0;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
}
.eyebrow {
  color: var(--sf-role-robot);
  font-size: var(--sf-font-xs);
  font-weight: 520;
  letter-spacing: 0.12em;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}
.execution-context {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: 12px;
  background: var(--sf-border-light);
}
.execution-context div {
  display: flex;
  min-width: 0;
  padding: 12px 14px;
  background: var(--sf-bg-secondary);
  flex-direction: column;
  gap: 5px;
}
.execution-context span,
.stage-clock span,
.stage-clock small {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.execution-context b {
  overflow: hidden;
  font-size: var(--sf-font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-section {
  padding: 26px 30px 40px;
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}
.section-heading h3 {
  font-size: var(--sf-font-lg);
}
.section-heading p {
  margin: 5px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
}
.section-heading > span {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.vertical-timeline {
  display: grid;
}
.stage-row {
  display: grid;
  min-width: 0;
  grid-template-columns: 130px 34px minmax(330px, 0.95fr) minmax(380px, 1.25fr);
  gap: 14px;
  padding-bottom: 18px;
  border-radius: 12px;
  cursor: pointer;
  outline: none;
}
.stage-row:hover .stage-summary,
.stage-row:hover .stage-evidence,
.stage-row:focus-visible .stage-summary,
.stage-row:focus-visible .stage-evidence,
.stage-row.selected .stage-summary,
.stage-row.selected .stage-evidence {
  border-color: color-mix(in srgb, var(--sf-brand) 65%, var(--sf-border-light));
}
.stage-row:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sf-brand) 32%, transparent);
}
.stage-clock {
  display: grid;
  align-content: start;
  justify-items: end;
  padding-top: 13px;
  text-align: right;
}
.stage-clock time {
  margin-top: 2px;
  color: var(--sf-text-primary);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-sm);
  font-weight: 520;
}
.stage-clock i {
  width: 30px;
  height: 1px;
  margin: 8px 0;
  background: var(--sf-border-light);
}
.stage-clock b {
  margin-top: 7px;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}
.stage-rail {
  position: relative;
  display: flex;
  justify-content: center;
}
.stage-rail::after {
  position: absolute;
  top: 38px;
  bottom: -18px;
  width: 2px;
  background: var(--sf-border-light);
  content: '';
}
.stage-row:last-child .stage-rail::after {
  display: none;
}
.stage-rail span {
  position: relative;
  z-index: 1;
  display: grid;
  width: 28px;
  height: 28px;
  margin-top: 13px;
  border: 2px solid var(--sf-border-light);
  border-radius: 50%;
  background: var(--sf-bg-primary);
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  place-items: center;
}
.stage-row[data-status='completed'] .stage-rail span {
  border-color: var(--sf-success);
  color: var(--sf-success);
}
.stage-row.current .stage-rail span,
.stage-row[data-status='running'] .stage-rail span {
  border-color: var(--sf-brand);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--sf-brand) 14%, transparent);
  color: var(--sf-brand);
}
.stage-summary,
.stage-evidence {
  min-width: 0;
  border: 1px solid var(--sf-border-light);
  border-radius: 12px;
  background: var(--sf-bg-secondary);
}
.stage-row.current .stage-summary {
  border-color: color-mix(in srgb, var(--sf-brand) 55%, var(--sf-border-light));
}
.stage-summary {
  padding: 15px;
}
.stage-summary > header,
.stage-evidence section > header,
.stage-evidence article > div,
.action-list article {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.stage-summary header small {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
}
.stage-summary h4 {
  margin-top: 4px;
  font-size: var(--sf-font-md);
}
.stage-summary dl {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 14px 0 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  font-size: var(--sf-font-sm);
}
.stage-summary dt {
  color: var(--sf-text-disabled);
}
.stage-summary dd {
  margin: 0;
  line-height: 1.55;
}
.stage-summary dd.warning {
  color: var(--sf-warning);
}
.action-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.action-list article {
  padding: 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
}
.action-list article > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.action-list span {
  color: var(--sf-role-robot);
  font-size: var(--sf-font-xs);
  font-weight: 520;
  letter-spacing: 0.08em;
}
.action-list b {
  font-size: var(--sf-font-sm);
}
.action-list small {
  overflow: hidden;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
}
.action-meta {
  justify-items: end;
  text-align: right;
}
.stage-evidence {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  overflow: hidden;
}
.stage-evidence > section {
  min-width: 0;
  padding: 14px;
}
.stage-evidence > .stage-artifacts {
  grid-column: 1 / -1;
}
.stage-evidence > .stage-artifacts + section {
  border-left: 0;
}
.current-first .stage-section {
  padding: 8px 12px;
}
.stage-evidence > section + section {
  border-left: 1px solid var(--sf-border-light);
}
.stage-evidence section > header {
  align-items: center;
  margin-bottom: 9px;
}
.stage-evidence h5 {
  font-size: var(--sf-font-sm);
}
.stage-evidence section > header span {
  display: grid;
  min-width: 22px;
  height: 22px;
  padding-inline: 5px;
  border-radius: 11px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  place-items: center;
}
.stage-evidence article {
  display: grid;
  gap: 5px;
  margin-bottom: 7px;
  padding: 9px;
  border-radius: 7px;
  background: var(--sf-bg-tertiary);
  font-size: var(--sf-font-xs);
}
.stage-evidence article b {
  font-size: var(--sf-font-xs);
}
.stage-evidence article time,
.stage-evidence article small {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
}
.stage-evidence article p {
  margin: 0;
  color: var(--sf-text-secondary);
  line-height: 1.5;
}
.reference-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}
.reference-list code {
  max-width: 100%;
  overflow: hidden;
  padding: 3px 5px;
  border-radius: 4px;
  background: var(--sf-bg-primary);
  color: var(--sf-brand);
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
}
.stage-refs {
  padding-top: 7px;
  border-top: 1px solid var(--sf-border-light);
}
.empty {
  padding: 48px;
  color: var(--sf-text-disabled);
  text-align: center;
}
.empty.compact {
  margin: 0;
  padding: 13px 8px;
  font-size: var(--sf-font-xs);
}
@media (max-width: 1240px) {
  .stage-row {
    grid-template-columns: 108px 32px minmax(300px, 0.9fr) minmax(330px, 1.1fr);
  }
  .stage-evidence {
    grid-template-columns: 1fr;
  }
  .stage-evidence > section + section {
    border-top: 1px solid var(--sf-border-light);
    border-left: 0;
  }
}
@media (max-width: 900px) {
  .execution-context {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .stage-row {
    grid-template-columns: 74px 28px minmax(0, 1fr);
  }
  .stage-evidence {
    grid-column: 3;
    margin-top: -8px;
  }
}
/* 底部面板宽度独立于浏览器宽度；按实际容器折行，证据无需横向滚动。 */
@container (max-width: 950px) {
  .timeline-header {
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px;
  }
  .timeline-header h2 {
    font-size: 16px;
  }
  .timeline-header p {
    overflow-wrap: anywhere;
  }
  .execution-context {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .execution-context div {
    padding: 8px;
  }
  .stage-section {
    padding: 12px;
  }
  .stage-row {
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 8px;
  }
  .stage-clock {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    text-align: left;
    padding-top: 0;
  }
  .stage-clock i {
    margin: 0 4px;
  }
  .stage-rail {
    grid-column: 1;
    grid-row: 1 / 4;
  }
  .stage-summary,
  .stage-evidence {
    grid-column: 2;
  }
  .stage-evidence {
    grid-template-columns: minmax(0, 1fr);
    margin-top: 0;
  }
  .stage-evidence > section + section {
    border-top: 1px solid var(--sf-border-light);
    border-left: 0;
  }
  .section-heading p {
    display: none;
  }
}
</style>
