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
  <aside
    class="context-inspector"
    :class="{ 'is-embedded': embedded }"
    data-testid="studio-context-inspector"
  >
    <header v-if="!embedded" class="inspector-header">
      <strong>详情</strong>
      <el-tooltip content="关闭详情" effect="dark" :show-after="500" placement="bottom">
        <button type="button" @click="$emit('close')"><Close /></button>
      </el-tooltip>
    </header>

    <div v-if="context" class="inspector-content">
      <section class="object-heading">
        <div class="object-icon"><component :is="context.icon" /></div>
        <div>
          <span>{{ context.typeLabel }}</span>
          <h2>{{ context.title }}</h2>
        </div>
        <el-tooltip
          v-if="layout.selectedResource"
          content="清除当前选择"
          effect="dark"
          :show-after="500"
          :persistent="false"
          placement="left"
        >
          <button type="button" @click="layout.select(null)">
            <Close />
          </button>
        </el-tooltip>
      </section>

      <section v-if="context.status" class="status-card">
        <i class="sf-status-dot" :data-status="context.status.dot" />
        <div>
          <span>状态</span><b>{{ context.status.label }}</b>
        </div>
      </section>

      <MapEntityInspector v-if="selectedMapEntity" :record="selectedMapEntity" />
      <SimulationResourceInspector v-else-if="selectedSimulationResource" />
      <RobotStageInspector
        v-else-if="selectedRobotStage"
        :execution="selectedRobotStage.execution"
        :stage="selectedRobotStage.stage"
      />

      <section
        v-if="!selectedMapEntity && !selectedSimulationResource && workflowContext"
        class="workflow-progress"
      >
        <header>
          <div>
            <span>WORKFLOW · REVISION {{ inspectedWorkflow.revision }}</span>
            <b>{{ inspectedWorkflow.goal }}</b>
          </div>
          <strong>{{ workflowProgress }}%</strong>
        </header>
        <el-progress :percentage="workflowProgress" :stroke-width="5" :show-text="false" />
        <div class="workflow-task-list">
          <button
            v-for="task in inspectedTasks"
            :key="task.id"
            type="button"
            :class="{ active: selectedWorkflowTask?.id === task.id }"
            @click="selectWorkflowTask(task)"
          >
            <i class="sf-status-dot" :data-status="taskDot(task.status)" />
            <span
              ><b>{{ task.title || task.goal || task.id }}</b
              ><small
                >{{ task.assigned_agent_id || '未分配 Agent' }} ·
                {{ workStatusLabel(task.status) }}</small
              ></span
            >
          </button>
        </div>
        <TaskWaitingCard
          v-if="selectedTaskWaitingView"
          :view="selectedTaskWaitingView"
          class="inspector-waiting"
          @action="handleTaskWaitingAction"
        />
        <div v-if="selectedWorkflowTask" class="subtask-progress">
          <b>SubTask 进度</b>
          <button
            v-for="item in selectedWorkflowTask.subtasks"
            :key="item.id"
            type="button"
            @click="selectWorkflowSubTask(item)"
          >
            <i class="sf-status-dot" :data-status="taskDot(item.status)" />
            <span>{{ item.title || item.goal || item.id }}</span>
          </button>
          <p v-if="!selectedWorkflowTask.subtasks.length">尚无 SubTask</p>
        </div>
        <div class="workflow-actions">
          <el-button
            v-if="inspectedWorkflow.status === 'running'"
            size="small"
            @click="workflowAction('pause')"
          >
            暂停
          </el-button>
          <el-button
            v-if="canResumeWorkflow"
            size="small"
            type="primary"
            @click="workflowAction('resume')"
          >
            继续
          </el-button>
          <el-button
            v-if="canRetryRobotDecision"
            size="small"
            type="primary"
            @click="workflowAction('retry-decision')"
          >
            重试决策
          </el-button>
          <el-button
            v-if="['running', 'paused'].includes(inspectedWorkflow.status)"
            size="small"
            type="danger"
            plain
            @click="workflowAction('stop')"
          >
            停止
          </el-button>
        </div>
      </section>

      <section
        v-if="!selectedMapEntity && !selectedSimulationResource && !selectedRobotStage"
        class="property-section"
      >
        <h3>属性</h3>
        <dl>
          <template v-for="item in context.properties" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd>
              <InspectorPropertyValue :value="item.value" />
            </dd>
          </template>
        </dl>
      </section>

      <AbilityDebugPanel
        v-if="selectedAbilityRecord?.robot"
        :robot="selectedAbilityRecord.robot"
        :ability="selectedAbilityRecord.ability"
      />
      <template v-if="selectedRobotExecution">
        <details v-for="item in executionData" :key="item.label" class="execution-data">
          <summary>{{ item.label }}</summary>
          <pre>{{ JSON.stringify(safeDeviceRecord(item.value), null, 2) }}</pre>
        </details>
      </template>
      <RobotSkillDebugPanel
        v-if="selectedRobotSkillRecord?.robot"
        :robot="selectedRobotSkillRecord.robot"
        :skill="selectedRobotSkillRecord.skill"
      />

      <section
        v-if="!selectedMapEntity && !selectedSimulationResource && context.relations?.length"
        class="property-section"
      >
        <h3>关联</h3>
        <button
          v-for="relation in context.relations"
          :key="relation.label"
          type="button"
          class="relation-row"
          @click="relation.action"
        >
          <span>{{ relation.label }}</span>
          <ArrowRight />
        </button>
      </section>

      <section v-if="selectedRun" class="inspector-actions">
        <el-button
          v-if="activeStatuses.has(selectedRun.status)"
          type="danger"
          plain
          size="small"
          :loading="runs.cancellingId === selectedRun.id"
          @click="cancelRun"
        >
          停止 Run
        </el-button>
        <el-button v-if="selectedRun.trace_id" size="small" @click="openTrace">
          查看 Trace
        </el-button>
      </section>
    </div>

    <div v-else class="inspector-empty">
      <View />
      <b>选择一个对象以查看详情</b>
    </div>
  </aside>
</template>

<script setup>
import { computed, markRaw } from 'vue'
import {
  ArrowRight,
  ChatDotRound,
  Close,
  DataAnalysis,
  Document,
  FolderOpened,
  Cpu,
  Location,
  Operation,
  List,
  View
} from '@element-plus/icons-vue'
import { ACTIVE_RUN_STATUSES, useRunsStore } from '@/stores/runs'
import { useArtifactsStore } from '@/stores/artifacts'
import { useConversationStore } from '@/stores/conversation'
import { useInteractionsStore } from '@/stores/interactions'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useUiStore } from '@/stores/ui'
import { useWorkflowStore } from '@/stores/workflow'
import { useAbilityStore } from '@/stores/ability'
import { useDeviceStore } from '@/stores/device'
import { useRobotStore } from '@/stores/robot'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { safeDeviceRecord } from '@/devices/configuration'
import { openStudioPanel } from '@/studio/panelService'
import InspectorPropertyValue from '@/components/studio/InspectorPropertyValue.vue'
import MapEntityInspector from '@/components/studio/MapEntityInspector.vue'
import SimulationResourceInspector from '@/components/studio/SimulationResourceInspector.vue'
import AbilityDebugPanel from '@/components/device/AbilityDebugPanel.vue'
import RobotSkillDebugPanel from '@/components/device/RobotSkillDebugPanel.vue'
import RobotStageInspector from '@/components/studio/RobotStageInspector.vue'
import TaskWaitingCard from '@/components/studio/TaskWaitingCard.vue'
import { parseRobotStageResourceId } from '@/devices/stageSelection'
import { deriveTaskWaitingView, interactionForTask } from '@/studio/taskWaitingView'
import { confirmWorkflowStop } from '@/studio/confirmWorkflowStop'

defineProps({ embedded: { type: Boolean, default: false } })
defineEmits(['close'])
const layout = useLayoutStore()
const project = useProjectStore()
const conversation = useConversationStore()
const runs = useRunsStore()
const interactions = useInteractionsStore()
const artifacts = useArtifactsStore()
const semanticMap = useSemanticMapStore()
const ui = useUiStore()
const workflow = useWorkflowStore()
const abilities = useAbilityStore()
const devices = useDeviceStore()
const robotExecutions = useRobotStore()
const executionScope = useExecutionScopeStore()
const activeStatuses = ACTIVE_RUN_STATUSES

const selection = computed(() => layout.selectedResource)
const selectedRun = computed(() =>
  selection.value?.resourceType === 'run' ? runs.byId(selection.value.resourceId) : null
)
const selectedRobotExecution = computed(() =>
  selection.value?.resourceType === 'robot_execution'
    ? robotExecutions.byId(selection.value.resourceId)
    : null
)
const executionData = computed(() => {
  const value = selectedRobotExecution.value
  return value
    ? [
        { label: '技能输入', value: value.input },
        { label: '执行结果', value: value.result },
        { label: '错误详情', value: value.error }
      ].filter((item) => item.value != null)
    : []
})
const selectedAbilityRecord = computed(() => {
  if (selection.value?.resourceType !== 'ability') return null
  const preferredRobotId = selection.value.robotId
  const robotIds = preferredRobotId
    ? [preferredRobotId, ...Object.keys(abilities.byRobot).filter((id) => id !== preferredRobotId)]
    : Object.keys(abilities.byRobot)
  for (const robotId of robotIds) {
    const ability = abilities.byRobot[robotId]?.find(
      (item) => item.instance_id === selection.value.resourceId
    )
    if (ability) return { ability, robot: devices.byId(robotId), robotId }
  }
  return null
})
const selectedRobotSkillRecord = computed(() => {
  if (selection.value?.resourceType !== 'robot_skill') return null
  const skill = devices.skillPackages.find(
    (item) => `${item.name}@${item.version}` === selection.value.resourceId
  )
  if (!skill) return null
  const preferred = selection.value.robotId ? devices.byId(selection.value.robotId) : null
  const robot =
    preferred ||
    devices.robots.find((item) =>
      (item.installed_skills || []).some(
        (installed) => installed.name === skill.name && installed.version === skill.version
      )
    ) ||
    null
  return { skill, robot }
})
const workflowContext = computed(() => {
  const selected = selection.value
  if (!selected) return null
  // 历史 Task/Workflow 的详情和操作必须指向它所属的 Workflow，不能借用
  // 当前对话的 Workflow；否则查看旧记录时，停止按钮会操作另一条执行。
  const current = workflow.workflow ? { workflow: workflow.workflow, tasks: workflow.tasks } : null
  const views = [current, ...Object.values(workflow.views)].filter(Boolean)
  if (selected.resourceType === 'workflow')
    return views.find((view) => view.workflow.id === selected.resourceId) || null
  if (selected.resourceType === 'task')
    return views.find((view) => view.tasks.some((task) => task.id === selected.resourceId)) || null
  if (selected.resourceType === 'subtask')
    return (
      views.find((view) =>
        view.tasks.some((task) =>
          task.subtasks.some((subtask) => subtask.id === selected.resourceId)
        )
      ) || null
    )
  return selected.resourceType === 'conversation' &&
    current?.workflow.conversation_id === selected.resourceId
    ? current
    : null
})
const inspectedWorkflow = computed(() => workflowContext.value?.workflow || null)
const inspectedTasks = computed(() => workflowContext.value?.tasks || [])
const selectedWorkflowSubTask = computed(() => {
  if (selection.value?.resourceType !== 'subtask') return null
  for (const task of inspectedTasks.value) {
    const subtask = (task.subtasks || []).find((item) => item.id === selection.value.resourceId)
    if (subtask) return { task, subtask }
  }
  return null
})
const selectedWorkflowTask = computed(() =>
  selection.value?.resourceType === 'task'
    ? inspectedTasks.value.find((task) => task.id === selection.value.resourceId)
    : selectedWorkflowSubTask.value?.task ||
      inspectedTasks.value.find((task) => task.status === 'running') ||
      null
)
const selectedTaskWaitingView = computed(() =>
  selectedWorkflowTask.value
    ? deriveTaskWaitingView(selectedWorkflowTask.value, {
        workflow: inspectedWorkflow.value,
        interaction: interactionForTask(
          interactions.pending,
          selectedWorkflowTask.value,
          inspectedWorkflow.value
        )
      })
    : null
)
const workflowProgress = computed(() => {
  if (!inspectedTasks.value.length) return 0
  return Math.round(
    (inspectedTasks.value.filter((task) => task.status === 'completed').length /
      inspectedTasks.value.length) *
      100
  )
})
const canResumeWorkflow = computed(
  () =>
    inspectedWorkflow.value?.status === 'paused' &&
    ['user_paused', 'server_restarted'].includes(inspectedWorkflow.value.reason)
)
const canRetryRobotDecision = computed(
  () =>
    inspectedWorkflow.value?.status === 'paused' &&
    inspectedWorkflow.value?.reason === 'robot_agent_decision_failed'
)
const selectedMapEntity = computed(() => {
  if (selection.value?.resourceType !== 'map_entity') return null
  const entity = semanticMap.entityById(selection.value.resourceId)
  if (!entity) return null
  return { entity, snapshot: semanticMap.activeSnapshot, mapId: semanticMap.activeMapId }
})

const simulationResourceTypes = new Set([
  'runtime_installation',
  'project_scene',
  'scene_instance',
  'simulation_object',
  'virtual_robot',
  'simulation_sensor',
  'scene_editor_node',
  'scene_document',
  'scene-editor',
  'viewer_session'
])
const selectedSimulationResource = computed(() =>
  simulationResourceTypes.has(selection.value?.resourceType)
)
const selectedRobotStage = computed(() => {
  if (selection.value?.resourceType !== 'robot_stage') return null
  const parsed = parseRobotStageResourceId(selection.value.resourceId)
  if (!parsed) return null
  const execution = robotExecutions.byId(parsed.executionId)
  if (!execution) return null
  const stage = (execution.stages || []).find(
    (item) => item.id === parsed.stageId || item.name === parsed.stageId
  )
  return stage ? { execution, stage } : null
})
const runStatus = (status) => {
  const values = {
    queued: ['排队中', 'starting'],
    running: ['运行中', 'warning'],
    waiting_input: ['等待输入', 'warning'],
    cancelling: ['停止中', 'danger'],
    completed: ['已完成', 'success'],
    failed: ['失败', 'danger'],
    cancelled: ['已取消', 'stopped']
  }
  return { label: values[status]?.[0] || status || '未知', dot: values[status]?.[1] || 'idle' }
}

const context = computed(() => {
  const current = selection.value
  if (!current) return null
  if (current.resourceType === 'map_entity') {
    const record = selectedMapEntity.value
    if (!record) return null
    const { entity, snapshot, mapId } = record
    const position = entity.pose?.position || {}
    const orientation = entity.pose?.orientation || {}
    const size = entity.geometry?.size || {}
    const labels = Array.isArray(entity.properties?.labels)
      ? entity.properties.labels.join('、')
      : entity.properties?.labels
    const related = semanticMap.relations.filter(
      (relation) => relation.subject_id === entity.id || relation.object_id === entity.id
    )
    return {
      icon: markRaw(Location),
      typeLabel: entity.geometry?.kind === 'region' ? '地图区域' : '地图物品',
      title: entity.name || current.title || shortId(entity.id),
      status: {
        label:
          { active: '有效', uncertain: '不确定', removed: '已移除' }[entity.status] ||
          entity.status,
        dot:
          { active: 'success', uncertain: 'warning', removed: 'stopped' }[entity.status] || 'idle'
      },
      properties: [
        { label: 'Entity ID', value: entity.id },
        { label: '地图', value: mapId === 'real_map' ? '真实地图' : '仿真地图' },
        { label: '地图版本', value: snapshot?.generation },
        { label: '更新版本', value: entity.revision || snapshot?.revision },
        { label: '类别', value: entity.type },
        { label: '用途', value: entity.properties?.purpose },
        { label: '坐标系', value: entity.frame_id },
        { label: '位置 X/Y/Z', value: vectorLabel(position) },
        { label: '姿态 X/Y/Z/W', value: quaternionLabel(orientation) },
        { label: '形状', value: entity.geometry?.kind },
        { label: '尺寸 X/Y/Z', value: vectorLabel(size) },
        { label: '标签', value: labels },
        { label: '来源', value: entity.source || 'user' },
        { label: '来源时间', value: formatTime(entity.source_time || entity.observed_at) },
        { label: '证据', value: referenceLabel(entity.evidence || entity.evidence_refs) }
      ],
      relations: related.map((relation) => {
        const outbound = relation.subject_id === entity.id
        const peerId = outbound ? relation.object_id : relation.subject_id
        const peer = semanticMap.entityById(peerId)
        return {
          label:
            `${outbound ? '' : entityName(peerId) + ' '} ${relation.predicate} ${outbound ? entityName(peerId) : ''}`.trim(),
          action: () => selectMapEntity(peer)
        }
      })
    }
  }
  if (current.resourceType === 'robot_stage') {
    const record = selectedRobotStage.value
    if (!record) return null
    return {
      icon: markRaw(List),
      typeLabel: 'Robot Skill Stage',
      title: record.stage.label || record.stage.name,
      status: {
        label: workStatusLabel(record.stage.status),
        dot: taskDot(record.stage.status)
      },
      properties: []
    }
  }
  if (current.resourceType === 'robot_execution') {
    const execution = selectedRobotExecution.value
    if (!execution) return null
    return {
      icon: markRaw(Operation),
      typeLabel: 'Robot Execution',
      title: execution.skill_name || current.title || shortId(execution.id),
      status: { label: workStatusLabel(execution.status), dot: taskDot(execution.status) },
      properties: [
        { label: 'Execution', value: execution.id },
        { label: 'Robot', value: execution.robot_id },
        { label: 'Skill 版本', value: execution.skill_version },
        { label: '开始', value: formatTime(execution.started_at || execution.created_at) },
        { label: '结束', value: formatTime(execution.completed_at || execution.ended_at) }
      ],
      relations: [
        {
          label: '查看阶段与证据',
          action: () => {
            executionScope.inspectExecution(execution.id)
            openStudioPanel('activity')
          }
        }
      ]
    }
  }
  if (current.resourceType === 'run') {
    const run = runs.byId(current.resourceId)
    if (!run) return null
    return {
      icon: markRaw(Operation),
      typeLabel: 'Agent Run',
      title: current.title || shortId(run.id),
      status: runStatus(run.status),
      properties: [
        { label: 'Run ID', value: run.id },
        { label: 'Agent', value: run.agent_id || run.agent_name || 'leader' },
        { label: 'Model', value: run.model || run.model_name },
        { label: 'Provider', value: run.provider },
        { label: 'Trace', value: run.trace_id },
        { label: 'Started', value: formatTime(run.started_at) },
        { label: 'Ended', value: formatTime(run.ended_at) },
        { label: 'Error', value: run.error }
      ],
      relations: run.trace_id
        ? [{ label: '查看模型与工具调用', action: () => openTraceFor(run.trace_id, run.id) }]
        : []
    }
  }
  if (current.resourceType === 'robot') {
    const robot = devices.byId(current.resourceId)
    if (!robot) return null
    const runtime = devices.runtimeForRobot(robot.robot_id)
    const activeExecution = robotExecutions.currentForRobot(robot)
    return {
      icon: markRaw(Cpu),
      typeLabel: robot.environment === 'simulation' ? '仿真 Robot' : '真实 Robot',
      title: robot.display_name || robot.robot_id,
      status: { label: robot.status || '未知', dot: taskDot(robot.status) },
      properties: [
        { label: 'Robot ID', value: robot.robot_id },
        { label: '型号', value: robot.model },
        { label: 'Backend', value: robot.backend },
        { label: 'Backend Profile', value: runtime?.backend_profile },
        {
          label: 'Runtime Bundle',
          value: runtime
            ? `${runtime.bundle_name || ''} ${runtime.bundle_version || ''}`.trim()
            : ''
        },
        { label: 'Pilot', value: robot.pilot?.instance_id },
        { label: 'Pilot 状态', value: robot.pilot?.status },
        { label: 'AbilityFramework', value: robot.ability_framework?.status },
        {
          label: 'Ability',
          value: `${robot.ability_framework?.healthy_instances || 0}/${robot.ability_framework?.total_instances || 0}`
        },
        {
          label: 'Robot Skill',
          value: `${robot.installed_skills?.filter((item) => item.enabled).length || 0} 个已启用`
        },
        { label: '当前 Execution', value: activeExecution?.id }
      ]
    }
  }
  if (current.resourceType === 'ability') {
    const record = selectedAbilityRecord.value
    if (!record) return null
    const { ability, robotId } = record
    return {
      icon: markRaw(Cpu),
      typeLabel: 'Ability 实例',
      title: ability.ability_name,
      status: {
        label: ability.status || ability.state || '未知',
        dot: taskDot(ability.status || ability.state)
      },
      properties: [
        { label: 'Instance UUID', value: ability.instance_id },
        { label: 'Robot', value: robotId },
        { label: '语义角色', value: ability.role },
        { label: '版本', value: ability.version },
        { label: 'Framework 状态', value: ability.state },
        { label: '已选中路由', value: ability.selected ? '是' : '否' },
        {
          label: 'Action',
          value:
            ability.action_details
              ?.map((item) => `${item.type}@${item.schema_version || 1}`)
              .join('、') || ability.actions?.join('、')
        },
        {
          label: 'Task',
          value:
            ability.debug_tasks?.map((item) => item.name).join('、') || ability.tasks?.join('、')
        },
        { label: '错误', value: ability.error }
      ]
    }
  }
  if (current.resourceType === 'robot_skill') {
    const skill = selectedRobotSkillRecord.value?.skill
    if (!skill) return null
    const installations = devices.robots.flatMap((robot) =>
      (robot.installed_skills || [])
        .filter((item) => item.name === skill.name && item.version === skill.version)
        .map((item) => ({ robot, item }))
    )
    return {
      icon: markRaw(Cpu),
      typeLabel: 'Robot Skill',
      title: `${skill.name} v${skill.version}`,
      status: {
        label: installations.some(({ item }) => item.enabled) ? '已启用' : '已发布',
        dot: installations.some(({ item }) => item.enabled) ? 'success' : 'idle'
      },
      properties: [
        { label: '类型', value: 'SKILL.md / robot_skill' },
        { label: '适用型号', value: skill.applicable_models?.join('、') || '未限制' },
        {
          label: '已安装 Robot',
          value: installations.map(({ robot }) => robot.robot_id).join('、') || '无'
        },
        {
          label: 'Required Action',
          value: skill.required_actions?.map((item) => item.type).join('、')
        },
        { label: 'Stop Action', value: skill.stop_actions?.map((item) => item.type).join('、') },
        { label: '执行入口', value: 'robot.run' }
      ]
    }
  }
  if (current.resourceType === 'workflow') {
    return {
      icon: markRaw(List),
      typeLabel: 'Workflow',
      title: inspectedWorkflow.value?.goal || current.title,
      status: {
        label: workStatusLabel(inspectedWorkflow.value?.status),
        dot: taskDot(inspectedWorkflow.value?.status)
      },
      properties: [
        { label: 'Workflow ID', value: inspectedWorkflow.value?.id },
        { label: 'Revision', value: inspectedWorkflow.value?.revision },
        { label: 'Tasks', value: inspectedTasks.value.length },
        { label: 'Reason', value: inspectedWorkflow.value?.reason }
      ]
    }
  }
  if (current.resourceType === 'plan_proposal') {
    const proposal = workflow.proposalById(current.resourceId) || workflow.proposal
    if (!proposal || proposal.id !== current.resourceId) return null
    return {
      icon: markRaw(List),
      typeLabel: 'Plan Proposal',
      title: proposal.goal || current.title,
      status: { label: proposal.status, dot: taskDot(proposal.status) },
      properties: [
        { label: 'Proposal ID', value: proposal.id },
        { label: 'Revision', value: proposal.revision },
        { label: 'Conversation', value: proposal.conversation_id },
        { label: '主要 Task', value: proposal.structured_plan?.tasks?.length || 0 }
      ]
    }
  }
  if (current.resourceType === 'task') {
    const task = selectedWorkflowTask.value
    if (!task) return null
    return {
      icon: markRaw(List),
      typeLabel: 'Task',
      title: task.title || task.goal || current.title,
      status: { label: workStatusLabel(task.status), dot: taskDot(task.status) },
      properties: [
        { label: 'Task ID', value: task.id },
        { label: '所需角色', value: task.required_role },
        { label: '所需能力', value: task.required_capabilities?.join('、') },
        { label: '实际 Agent', value: task.assigned_agent_id || '等待分配' },
        { label: '实际 Robot', value: task.assigned_robot_id },
        { label: '分配 Revision', value: task.assignment_revision },
        { label: 'Context', value: task.context_id },
        { label: 'SubTask', value: task.subtasks.length },
        { label: 'Reason', value: task.reason },
        { label: 'Result', value: task.result_summary || task.result }
      ]
    }
  }
  if (current.resourceType === 'subtask') {
    const record = selectedWorkflowSubTask.value
    if (!record) return null
    const { task, subtask } = record
    return {
      icon: markRaw(List),
      typeLabel: 'SubTask',
      title: subtask.title || subtask.goal || current.title,
      status: { label: workStatusLabel(subtask.status), dot: taskDot(subtask.status) },
      properties: [
        { label: 'SubTask ID', value: subtask.id },
        { label: 'Task', value: task.title || task.goal || task.id },
        { label: 'Kind', value: subtask.kind },
        { label: 'Goal', value: subtask.goal },
        { label: 'Execution', value: subtask.execution_ref },
        { label: 'Reason', value: subtask.reason },
        { label: 'Spec', value: subtask.spec },
        { label: '完成条件', value: subtask.completion_criteria },
        { label: 'Result', value: subtask.result },
        { label: 'Evidence', value: subtask.evidence }
      ]
    }
  }
  if (current.resourceType === 'trace') {
    return {
      icon: markRaw(DataAnalysis),
      typeLabel: 'Trace',
      title: current.title || shortId(current.resourceId),
      properties: [
        { label: 'Trace ID', value: current.resourceId },
        {
          label: 'Run',
          value: runs.items.find((item) => item.trace_id === current.resourceId)?.id
        }
      ]
    }
  }
  if (current.resourceType === 'artifact') {
    const artifact = artifacts.items.find((item) => item.id === current.resourceId)
    return {
      icon: markRaw(FolderOpened),
      typeLabel: 'Artifact',
      title: artifact?.name || artifact?.summary || current.title || shortId(current.resourceId),
      properties: [
        { label: 'Artifact ID', value: current.resourceId },
        { label: 'Media Type', value: artifact?.media_type },
        { label: 'Path', value: artifact?.path },
        { label: 'Size', value: artifact?.size ? `${artifact.size} bytes` : '' }
      ]
    }
  }
  if (current.resourceType === 'interaction') {
    const interaction = interactions.records[current.resourceId]
    return {
      icon: markRaw(Operation),
      typeLabel: 'Interaction',
      title: interaction?.question || current.title || shortId(current.resourceId),
      status: {
        label: interaction?.status === 'pending' ? '等待用户输入' : interaction?.status,
        dot: interaction?.status === 'pending' ? 'warning' : 'success'
      },
      properties: [
        { label: 'Interaction ID', value: current.resourceId },
        { label: 'Kind', value: interaction?.kind },
        { label: 'Risk', value: interaction?.risk },
        { label: 'Run', value: interaction?.runId || interaction?.run_id }
      ]
    }
  }
  if (current.resourceType === 'conversation') {
    const item = [...conversation.items, ...conversation.archivedItems].find(
      (entry) => entry.id === current.resourceId
    )
    const archived = Boolean(item?.archived || item?.archived_at)
    const latestRun = runs.items.find((run) => run.conversation_id === current.resourceId)
    return {
      icon: markRaw(ChatDotRound),
      typeLabel: 'Conversation',
      title: item?.title || current.title || 'Conversation',
      status: archived
        ? { label: '已归档 · 只读', dot: 'stopped' }
        : latestRun
          ? runStatus(latestRun.status)
          : { label: '待命', dot: 'success' },
      properties: [
        { label: 'Conversation ID', value: current.resourceId },
        { label: 'Project', value: project.currentProject?.name },
        { label: 'Updated', value: formatTime(item?.updated_at) },
        ...(archived ? [{ label: 'Archived', value: formatTime(item?.archived_at) }] : []),
        { label: 'Latest Run', value: latestRun?.id }
      ],
      relations: latestRun
        ? [
            {
              label: '查看最近 Run',
              action: () =>
                layout.select({
                  resourceType: 'run',
                  resourceId: latestRun.id,
                  title: `Run ${shortId(latestRun.id)}`
                })
            }
          ]
        : []
    }
  }
  if (current.resourceType === 'memory') {
    return {
      icon: markRaw(Document),
      typeLabel: 'Project 资源',
      title: 'Project Memory',
      properties: [
        { label: 'Project', value: project.currentProject?.name },
        { label: 'Format', value: 'Markdown' }
      ]
    }
  }
  if (simulationResourceTypes.has(current.resourceType)) {
    const labels = {
      runtime_installation: '运行环境',
      project_scene: '场景资源',
      scene_instance: '场景实例',
      simulation_object: '场景对象',
      virtual_robot: '仿真 Robot',
      simulation_sensor: '传感器',
      scene_editor_node: '场景节点',
      scene_document: '场景文档',
      'scene-editor': '场景文档',
      viewer_session: '查看器'
    }
    return {
      icon: markRaw(Location),
      typeLabel: labels[current.resourceType],
      title: current.title || current.resourceId,
      properties: []
    }
  }
  return null
})

async function cancelRun() {
  if (!selectedRun.value) return
  try {
    await runs.cancel(selectedRun.value.id)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Run 停止失败' })
  }
}

function taskDot(status) {
  return (
    {
      queued: 'starting',
      pending: 'idle',
      running: 'warning',
      ready: 'success',
      healthy: 'success',
      online: 'success',
      idle: 'idle',
      busy: 'warning',
      degraded: 'warning',
      interrupted: 'danger',
      paused: 'stopped',
      stopping: 'danger',
      completed: 'success',
      failed: 'danger',
      stopped: 'stopped'
    }[status] || 'idle'
  )
}

function workStatusLabel(status) {
  return (
    {
      queued: '排队中',
      pending: '待执行',
      running: '执行中',
      paused: '已暂停',
      stopping: '停止中',
      completed: '已完成',
      failed: '失败',
      stopped: '已停止',
      interrupted: '已中断'
    }[status] ||
    status ||
    '未知'
  )
}

function selectWorkflowTask(task) {
  layout.select({ resourceType: 'task', resourceId: task.id, title: task.title || task.goal })
}

function selectWorkflowSubTask(subtask) {
  layout.select({
    resourceType: 'subtask',
    resourceId: subtask.id,
    title: subtask.title || subtask.goal
  })
}

async function workflowAction(action) {
  try {
    if (inspectedWorkflow.value) await workflow.transitionById(inspectedWorkflow.value.id, action)
  } catch (error) {
    ui.notify({ type: 'error', message: workflow.error || error.message })
  }
}

async function handleTaskWaitingAction(action) {
  const view = selectedTaskWaitingView.value
  if (!view) return
  if (action === 'confirm-stop') {
    await confirmWorkflowStop(workflow, ui, inspectedWorkflow.value.id, inspectedTasks.value)
    return
  }
  if (action === 'inspect') {
    if (selectedWorkflowTask.value) selectWorkflowTask(selectedWorkflowTask.value)
    return
  }
  if (action === 'answer') {
    if (view.interactionId) {
      layout.select({
        resourceType: 'interaction',
        resourceId: view.interactionId,
        title: view.reason
      })
    }
    layout.revealBottom('interactions')
    return
  }
  if (action === 'resume' || action === 'stop' || action === 'retry-decision') {
    await workflowAction(action)
  }
}

function openTraceFor(traceId, runId) {
  if (!traceId) return
  openStudioPanel('trace', { resourceType: 'trace', resourceId: traceId, runId })
}

function openTrace() {
  openTraceFor(selectedRun.value?.trace_id, selectedRun.value?.id)
}

function shortId(value) {
  const id = String(value || '')
  return id.length > 18 ? `${id.slice(0, 15)}…` : id
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false })
}

function numeric(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(3) : '—'
}

function vectorLabel(value = {}) {
  return [numeric(value.x), numeric(value.y), numeric(value.z)].join(' / ')
}

function quaternionLabel(value = {}) {
  return [numeric(value.x), numeric(value.y), numeric(value.z), numeric(value.w)].join(' / ')
}

function referenceLabel(value) {
  if (!value) return ''
  if (Array.isArray(value))
    return value
      .map((item) => item?.id || item)
      .filter(Boolean)
      .join('、')
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function entityName(entityId) {
  return semanticMap.entityById(entityId)?.name || entityId
}

function selectMapEntity(entity) {
  if (!entity) return
  semanticMap.select({
    kind: entity.geometry?.kind === 'region' ? 'region' : 'entity',
    entity_id: entity.id
  })
  layout.select({ resourceType: 'map_entity', resourceId: entity.id, title: entity.name })
}
</script>

<style scoped lang="scss">
.context-inspector {
  display: flex;
  height: calc(100% - 16px);
  margin: 8px 8px 8px 0;
  border: 0;
  border-radius: var(--sf-radius-lg);
  overflow: hidden;
  min-width: 0;
  flex-direction: column;
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 0 12px 0 16px;

  strong {
    font-size: 15px;
  }

  button {
    display: grid;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--sf-radius-md);
    background: transparent;
    color: var(--sf-text-secondary);
    cursor: pointer;
    place-items: center;

    &:hover {
      background: var(--sf-bg-hover);
      color: var(--sf-brand);
    }

    svg {
      width: 15px;
    }
  }
}

.inspector-content {
  min-height: 0;
  padding: 15px;
  overflow-y: auto;
}

.object-heading {
  display: grid;
  align-items: center;
  grid-template-columns: 42px minmax(0, 1fr) 28px;
  gap: 11px;
  padding-bottom: 16px;
  border-bottom: 0;

  .object-icon {
    display: grid;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--sf-brand-soft);
    color: var(--sf-brand);
    place-items: center;

    svg {
      width: 20px;
    }
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
    font-weight: 380;
    letter-spacing: 0.08em;
  }

  h2 {
    overflow: hidden;
    margin: 2px 0 0;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > button {
    display: grid;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--sf-radius-md);
    background: transparent;
    color: var(--sf-text-disabled);
    cursor: pointer;
    place-items: center;

    &:hover {
      background: var(--sf-bg-hover);
      color: var(--sf-text-primary);
    }

    svg {
      width: 14px;
    }
  }
}

.status-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 15px;
  padding: 11px 12px;
  border: 0;
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-tertiary);

  > div {
    display: flex;
    flex-direction: column;
  }

  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
    letter-spacing: 0.08em;
  }

  b {
    font-size: 12px;
  }
}

.workflow-progress {
  margin-top: 15px;
  padding: 12px;
  border: 0;
  border-radius: var(--sf-radius-lg);
  background: color-mix(in srgb, var(--sf-bg-tertiary) 94%, var(--sf-brand));
}
.workflow-progress > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}
.workflow-progress > header div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.workflow-progress > header span,
.workflow-task-list small {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.workflow-progress > header b {
  overflow: hidden;
  color: var(--sf-text-primary);
  font-size: 11px;
  font-weight: 380;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workflow-progress > header strong {
  color: var(--sf-brand);
  font-size: 14px;
}

.inspector-waiting {
  margin-top: 10px;
}
.workflow-task-list {
  display: grid;
  gap: 5px;
  margin-top: 10px;
}
.workflow-task-list > button {
  display: grid;
  align-items: center;
  grid-template-columns: 9px minmax(0, 1fr);
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
.workflow-task-list > button:hover,
.workflow-task-list > button.active {
  border-color: var(--sf-brand);
}
.workflow-task-list span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.workflow-task-list b {
  overflow: hidden;
  font-size: 11px;
  font-weight: 380;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.subtask-progress {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 0;
}
.subtask-progress > b {
  color: var(--sf-text-secondary);
  font-size: 11px;
  font-weight: 380;
}
.subtask-progress > button {
  display: grid;
  align-items: center;
  grid-template-columns: 8px 1fr;
  gap: 7px;
  padding: 5px 4px;
  border: 0;
  border-radius: var(--sf-radius-sm);
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  font-size: 11px;
  text-align: left;
}
.subtask-progress > button:hover {
  background: var(--sf-bg-hover);
}
.subtask-progress p {
  margin: 0;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.workflow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.property-section {
  margin-top: 20px;

  h3 {
    margin: 0 0 9px;
    color: var(--sf-text-disabled);
    font-size: 11px;
    font-weight: 380;
    letter-spacing: 0.08em;
  }

  dl {
    display: grid;
    grid-template-columns: minmax(80px, 0.8fr) minmax(0, 1.3fr);
    margin: 0;
    padding: 4px 10px;
    border-radius: var(--sf-radius-md);
    background: var(--sf-bg-tertiary);
  }

  dt,
  dd {
    min-width: 0;
    margin: 0;
    padding: 7px 0;
    font-size: 11px;
  }

  dt {
    color: var(--sf-text-disabled);
    font-weight: 380;
  }

  dd {
    overflow: visible;
    color: var(--sf-text-primary);
    text-align: right;
  }
}

.execution-data {
  margin-top: 12px;
  font-size: 12px;
  summary {
    cursor: pointer;
  }
  pre {
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: 11px/1.6 var(--sf-font-mono, monospace);
  }
}

.relation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--sf-radius-md);
  background: transparent;
  color: var(--sf-text-secondary);
  font-size: 11px;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--sf-bg-hover);
    color: var(--sf-brand);
  }

  svg {
    width: 13px;
  }
}

.inspector-actions {
  display: flex;
  gap: 7px;
  margin-top: 20px;
}

.inspector-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  padding: 30px;
  color: var(--sf-text-disabled);
  text-align: center;

  svg {
    width: 30px;
  }

  b {
    color: var(--sf-text-secondary);
    font-size: 13px;
  }

  span {
    max-width: 230px;
    font-size: 11px;
    line-height: 1.55;
  }
}
// Inspector 嵌入右侧组件 Tab，属性沿纵向阅读，标题由外层 Tab 提供。
.context-inspector.is-embedded {
  width: 100%;
  min-width: 0;
  height: 100%;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;

  .inspector-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .inspector-content > :not(.object-heading):not(.status-card) {
    margin-top: 0;
  }

  .object-heading {
    padding: 0;
    border: 0;
  }

  .status-card {
    margin: 0;
    padding: 6px 10px;
  }
}
</style>
