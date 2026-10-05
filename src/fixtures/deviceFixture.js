// Copyright 2026 InsightOS
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const copy = (value) => structuredClone(value)
const now = () => new Date().toISOString()

let sequence = 30
const listeners = new Set()

const skills = [
  {
    name: 'grasp-object',
    version: '0.1.0',
    description: '抓取指定物体并形成经过验证的持物状态',
    applicable_models: ['r1pro'],
    required_actions: [
      { type: 'perception.locate_object', schema_version: 1 },
      { type: 'grasp.generate_candidates', schema_version: 1 }
    ],
    published: true
  },
  {
    name: 'semantic-navigation',
    version: '0.1.0',
    description: '在目标地图版本中导航并独立验证到达状态',
    applicable_models: ['r1pro'],
    required_actions: [
      { type: 'navigation.plan_route', schema_version: 1 },
      { type: 'navigation.follow_route', schema_version: 1 }
    ],
    published: true
  },
  {
    name: 'place-object',
    version: '0.1.0',
    description: '放置持有物并验证位置与稳定性',
    applicable_models: ['r1pro'],
    required_actions: [
      { type: 'perception.observe_placement_target', schema_version: 1 },
      { type: 'gripper.release', schema_version: 1 }
    ],
    published: true
  }
]

const abilitiesFor = (prefix) => [
  {
    instance_id: `${prefix}-navigation-1`,
    ability_name: 'Navigation',
    package: 'semantic-ability-navigation',
    version: '0.1.0',
    cr_name: 'navigation-v1',
    status: 'ready',
    health: 'healthy',
    actions: ['navigation.plan_route', 'navigation.follow_route', 'navigation.verify_arrival'],
    action_details: [
      {
        type: 'navigation.verify_arrival',
        schema_version: 1,
        task_name: 'VerifyArrival',
        input_model: 'semantic_abilities.navigation.VerifyArrivalInput',
        physical: false
      }
    ],
    config_schema: {
      properties: {
        arrival_tolerance_m: {
          type: 'number',
          description: '到达位姿允许的最大位置误差'
        }
      }
    },
    debug_tasks: [
      {
        name: 'VerifyArrival',
        task_type: 1,
        input_model: 'semantic_abilities.navigation.VerifyArrivalInput',
        returns: [{ name: 'observation', type: 'NavigationArrivalObservation' }],
        input_fields: [
          {
            name: 'target',
            type: 'ResolvedNavigationTarget',
            required: true,
            description: '需要独立复核的目标与地图版本'
          },
          {
            name: 'arrival_radius_m',
            type: 'number',
            required: true,
            description: '到达位姿允许的最大位置误差，单位 m'
          }
        ]
      }
    ]
  },
  {
    instance_id: `${prefix}-perception-1`,
    ability_name: 'ObjectPerception',
    package: 'semantic-ability-object-perception',
    version: '0.1.0',
    cr_name: 'object-perception-v1',
    status: 'running',
    health: 'healthy',
    actions: ['perception.locate_object', 'perception.verify_grasp'],
    action_details: [
      {
        type: 'perception.locate_object',
        schema_version: 1,
        task_name: 'LocateObject',
        input_model: 'semantic_abilities.perception.LocateObjectInput',
        physical: false
      }
    ],
    debug_tasks: [
      {
        name: 'LocateObject',
        task_type: 1,
        input_model: 'semantic_abilities.perception.LocateObjectInput',
        returns: [{ name: 'observation', type: 'ObjectPoseObservation' }],
        input_fields: [
          {
            name: 'object_ref',
            type: 'string',
            required: true,
            description: '需要定位的语义物体引用'
          }
        ]
      }
    ]
  }
]

const execution = {
  id: 'rex-v050-mujoco-001',
  project_id: 'proj-v020-demo',
  workflow_id: 'workflow-v030-demo',
  task_id: 'task-v030-implement',
  subtask_id: 'subtask-v030-implement-1',
  robot_id: 'r1pro-sim-001',
  pilot_instance_id: 'pilot-sim-001',
  skill_name: 'grasp-object',
  skill_version: '0.1.0',
  status: 'running',
  stage: 'grasp',
  stage_label: '闭合夹爪并观察接触',
  progress: null,
  started_at: '2026-08-10T09:15:00+08:00',
  revision: 6,
  current_action: {
    id: 'action-close-002',
    action_id: 'action-close-002',
    type: 'gripper.close',
    stage: 'grasp',
    status: 'running',
    ability_instance_id: 'sim-end-effector-1',
    invocation_id: 'inv-close-002',
    started_at: '2026-08-10T09:16:20+08:00'
  },
  stages: [
    {
      id: 'stage-observe',
      name: 'observe_target',
      label: '观测抓取目标',
      status: 'completed',
      started_at: '2026-08-10T09:15:00+08:00',
      ended_at: '2026-08-10T09:15:08+08:00',
      expectation: '获得目标的新鲜位姿',
      observation: '目标 box-17，置信度 0.94'
    },
    {
      id: 'stage-approach',
      name: 'approach',
      label: '移动到预抓取位姿',
      status: 'completed',
      started_at: '2026-08-10T09:15:09+08:00',
      ended_at: '2026-08-10T09:16:19+08:00',
      expectation: '末端进入候选 2 的预抓取位姿',
      observation: '位置偏差 7 mm，姿态偏差 1.4°',
      recovery_reason: '候选 1 可达性检查失败，已切换候选 2'
    },
    {
      id: 'stage-grasp',
      name: 'grasp',
      label: '闭合夹爪并观察接触',
      status: 'running',
      started_at: '2026-08-10T09:16:20+08:00',
      expectation: '双侧接触且夹持力处于安全范围',
      observation: '左侧已接触，右侧等待接触',
      progress: null
    },
    {
      id: 'stage-lift',
      name: 'lift_and_verify',
      label: '抬升并验证持物',
      status: 'pending'
    }
  ],
  feedback: [
    {
      sequence: 1,
      action_id: 'action-close-002',
      stage: 'grasp',
      phase: 'closing',
      severity: 'info',
      message: '夹爪开始闭合',
      occurred_at: '2026-08-10T09:16:20+08:00'
    },
    {
      sequence: 2,
      action_id: 'action-close-002',
      stage: 'grasp',
      phase: 'contact',
      severity: 'info',
      message: '左侧检测到接触，右侧继续闭合',
      occurred_at: '2026-08-10T09:16:21+08:00'
    }
  ],
  observations: [
    {
      id: 'obs-target-001',
      stage: 'observe_target',
      type: 'object_pose',
      summary: 'box-17 位姿，置信度 0.94',
      source: 'ObjectPerception',
      occurred_at: '2026-08-10T09:15:07+08:00',
      artifact_refs: ['artifact://art-rgb-001']
    }
  ],
  artifact_sync: [
    {
      local_artifact_id: 'pilot-rgb-001',
      server_artifact_id: 'art-rgb-001',
      ref: 'artifact://art-rgb-001',
      media_type: 'image/png',
      summary: '抓取目标 RGB 证据',
      status: 'synced',
      updated_at: '2026-08-10T09:15:08+08:00'
    },
    {
      local_artifact_id: 'pilot-depth-002',
      server_artifact_id: '',
      ref: 'pilot-artifact://pilot-sim-001/pilot-depth-002',
      media_type: 'application/x-depth-map',
      summary: '抓取阶段深度图',
      status: 'uploading',
      updated_at: '2026-08-10T09:16:21+08:00'
    }
  ]
}

const devices = [
  {
    robot_id: 'r1pro-sim-001',
    display_name: 'R1 Pro · 拆码垛仿真',
    model: 'r1pro',
    backend: 'mujoco',
    environment: 'simulation',
    configuration: {
      sdk: {
        package: 'semantic-robot-sdk-r1pro',
        endpoint: 'http://127.0.0.1:8090',
        firmware_profile: 'r1pro-sim-v1',
        providers: { navigation: 'local_navigation', motion: 'local_motion' }
      },
      frames: { world: 'world', base: 'base_link', tool: 'tool0' },
      safety: { maximum_speed_mps: 0.35, stop_timeout_s: 5 },
      pilot: { allow_ability_debug: true }
    },
    runtime_instance: {
      instance_id: 'robot-runtime-sim-001',
      robot_id: 'r1pro-sim-001',
      scene_instance_id: 'scene-depalletizing-001',
      status: 'ready',
      revision: 4,
      updated_at: '2026-08-10T09:16:22+08:00'
    },
    status: 'busy',
    pilot: {
      instance_id: 'pilot-sim-001',
      status: 'online',
      version: '0.5.0-dev',
      last_heartbeat_at: '2026-08-10T09:16:22+08:00'
    },
    ability_framework: { status: 'ready', healthy_instances: 7, total_instances: 7 },
    project_id: 'proj-v020-demo',
    task_id: 'task-v030-implement',
    current_execution_id: execution.id,
    current_stage: execution.stage_label,
    sensors: [
      {
        id: 'front-rgbd',
        type: 'RGBD',
        status: 'streaming',
        last_observation_at: '2026-08-10T09:16:21+08:00'
      },
      {
        id: 'gripper-contact',
        type: '接触与夹持力',
        status: 'streaming',
        last_observation_at: '2026-08-10T09:16:21+08:00'
      }
    ],
    progress: null,
    skill_catalog_revision: 3,
    ability_catalog_revision: 7,
    installed_skills: skills.map((skill) => ({ ...skill, enabled: true, status: 'installed' })),
    desired_skills: skills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      enabled: true
    })),
    abilities: [
      ...abilitiesFor('sim'),
      {
        instance_id: 'sim-end-effector-1',
        ability_name: 'EndEffector',
        package: 'semantic-ability-end-effector',
        version: '0.1.0',
        cr_name: 'end-effector-v1',
        status: 'running',
        health: 'healthy',
        actions: ['gripper.close', 'gripper.release', 'gripper.hold'],
        current_invocation_id: 'inv-close-002',
        debug_tasks: []
      }
    ],
    revision: 9
  },
  {
    robot_id: 'r1pro-real-001',
    display_name: 'R1 Pro · 真机 001',
    model: 'r1pro',
    backend: 'real',
    environment: 'real',
    configuration: {
      sdk: {
        package: 'semantic-robot-sdk-r1pro',
        endpoint: 'http://10.20.0.41:8090',
        firmware_profile: 'r1pro-firmware-2026.08',
        providers: { navigation: 'vendor_navigation', motion: 'vendor_motion' }
      },
      frames: { world: 'map', base: 'base_link', tool: 'tool0' },
      safety: { maximum_speed_mps: 0.5, stop_timeout_s: 5 },
      pilot: { allow_ability_debug: true }
    },
    runtime_instance: {
      instance_id: 'robot-runtime-real-001',
      robot_id: 'r1pro-real-001',
      scene_instance_id: '',
      status: 'ready',
      revision: 2,
      updated_at: '2026-08-10T09:16:21+08:00'
    },
    status: 'idle',
    pilot: {
      instance_id: 'pilot-real-001',
      status: 'online',
      version: '0.5.0-dev',
      last_heartbeat_at: '2026-08-10T09:16:21+08:00'
    },
    ability_framework: { status: 'ready', healthy_instances: 7, total_instances: 7 },
    sensors: [
      {
        id: 'front-rgbd',
        type: 'RGBD',
        status: 'ready',
        last_observation_at: '2026-08-10T09:16:18+08:00'
      }
    ],
    project_id: '',
    task_id: '',
    current_execution_id: '',
    current_stage: '',
    progress: null,
    skill_catalog_revision: 3,
    ability_catalog_revision: 7,
    installed_skills: skills.map((skill) => ({ ...skill, enabled: true, status: 'installed' })),
    desired_skills: skills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      enabled: true
    })),
    abilities: abilitiesFor('real'),
    revision: 4
  },
  {
    robot_id: 'r1pro-lab-002',
    display_name: 'R1 Pro · 实验室 002',
    model: 'r1pro',
    backend: 'mujoco',
    environment: 'simulation',
    configuration: {
      sdk: { package: 'semantic-robot-sdk-r1pro', endpoint: 'http://127.0.0.1:8091' },
      pilot: { allow_ability_debug: false }
    },
    runtime_instance: {
      instance_id: 'robot-runtime-lab-002',
      robot_id: 'r1pro-lab-002',
      scene_instance_id: 'scene-lab-002',
      status: 'degraded',
      failure_reason: 'Robot SDK Backend 初始化失败',
      revision: 5,
      updated_at: '2026-08-10T09:10:02+08:00'
    },
    status: 'offline',
    pilot: {
      instance_id: 'pilot-real-002',
      status: 'offline',
      version: '0.5.0-dev',
      last_heartbeat_at: '2026-08-10T09:10:02+08:00'
    },
    ability_framework: { status: 'offline', healthy_instances: 0, total_instances: 7 },
    project_id: '',
    sensors: [
      {
        id: 'front-rgbd',
        type: 'RGBD',
        status: 'offline',
        last_observation_at: '2026-08-10T09:10:00+08:00'
      }
    ],
    task_id: '',
    current_execution_id: '',
    current_stage: '',
    progress: null,
    skill_catalog_revision: 2,
    ability_catalog_revision: 6,
    installed_skills: [],
    desired_skills: [],
    abilities: [],
    revision: 5
  }
]

const executions = [execution]
const executionEvents = [
  ...execution.stages.map((stage, index) => ({
    execution_id: execution.id,
    sequence: index + 1,
    type: 'stage.updated',
    payload: { stage }
  })),
  {
    execution_id: execution.id,
    sequence: execution.stages.length + 1,
    type: 'action.updated',
    payload: { action: execution.current_action }
  },
  ...execution.feedback.map((feedback, index) => ({
    execution_id: execution.id,
    sequence: execution.stages.length + 2 + index,
    type: 'feedback.emitted',
    payload: { feedback }
  })),
  ...execution.observations.map((observation, index) => ({
    execution_id: execution.id,
    sequence: execution.stages.length + execution.feedback.length + 2 + index,
    type: 'observation.emitted',
    payload: { observation }
  })),
  ...execution.artifact_sync.map((artifact_sync, index) => ({
    execution_id: execution.id,
    sequence:
      execution.stages.length +
      execution.feedback.length +
      execution.observations.length +
      2 +
      index,
    type: 'artifact.sync.updated',
    payload: { artifact_sync }
  }))
]

function deviceOrThrow(robotId) {
  const device = devices.find((item) => item.robot_id === robotId)
  if (!device) throw Object.assign(new Error('Robot 不存在'), { code: 'ROBOT_NOT_FOUND' })
  return device
}

function emit(resourceType, resourceId, type, payload, revision = 1) {
  sequence += 1
  const event = {
    id: `device-event-${sequence}`,
    sequence,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_revision: revision,
    type,
    occurred_at: now(),
    payload: copy(payload)
  }
  for (const listener of listeners) listener(copy(event))
  return event
}

export const deviceFixture = {
  async createPilotEnrollment() {
    return {
      enrollment: {
        id: 'pen-fixture-1',
        code: 'ABCD12',
        status: 'ready',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    }
  },

  async getSnapshot() {
    return {
      snapshot: {
        snapshot_version: 1,
        event_sequence: sequence,
        robots: copy(devices),
        skill_packages: copy(skills),
        executions: copy(executions)
      }
    }
  },

  async getDevice(robotId) {
    const device = deviceOrThrow(robotId)
    return {
      device: copy(device),
      executions: copy(executions.filter((item) => item.robot_id === robotId)),
      skill_packages: copy(skills)
    }
  },

  async listProjectExecutions(projectId) {
    return { executions: copy(executions.filter((item) => item.project_id === projectId)) }
  },

  async getExecution(executionId, afterSequence = 0) {
    const item = executions.find((candidate) => candidate.id === executionId)
    if (!item) throw Object.assign(new Error('Robot Execution 不存在'), { code: 'NOT_FOUND' })
    return {
      execution: copy(item),
      events: executionEvents
        .filter((event) => event.execution_id === executionId && event.sequence > afterSequence)
        .map(copy)
    }
  },

  async startRobotSkillExecution(projectId, robotId, payload) {
    const device = deviceOrThrow(robotId)
    const installed = device.installed_skills.find(
      (item) =>
        item.name === payload.skill_name &&
        item.version === payload.skill_version &&
        item.status === 'installed' &&
        item.enabled
    )
    if (!installed)
      throw Object.assign(new Error('Robot Skill 尚未安装并启用'), { code: 'SKILL_NOT_AVAILABLE' })
    if (device.status !== 'idle')
      throw Object.assign(new Error('Robot 当前不为空闲'), { code: 'ROBOT_BUSY' })
    const repeated = executions.find(
      (item) => item.project_id === projectId && item.request_key === payload.request_key
    )
    if (repeated) return { execution: copy(repeated) }
    const item = {
      id: `rex-manual-${Date.now()}`,
      project_id: projectId,
      robot_id: robotId,
      skill_name: payload.skill_name,
      skill_version: payload.skill_version,
      input: copy(payload.input || {}),
      request_key: payload.request_key,
      status: 'queued',
      stages: [],
      actions: [],
      feedback: [],
      observations: [],
      artifact_sync: [],
      created_at: now(),
      updated_at: now(),
      revision: 1
    }
    executions.unshift(item)
    device.status = 'busy'
    device.current_execution_id = item.id
    device.revision += 1
    emit('robot_execution', item.id, 'robot_execution.queued', { execution: item }, item.revision)
    emit('robot', robotId, 'robot.busy', { robot: device }, device.revision)
    return { execution: copy(item) }
  },

  async stopRobot(robotId, executionId) {
    const device = deviceOrThrow(robotId)
    const item = executions.find((candidate) => candidate.id === executionId)
    if (!item) throw Object.assign(new Error('Robot Execution 不存在'), { code: 'NOT_FOUND' })
    item.status = 'stopping'
    item.revision += 1
    device.status = 'stopping'
    device.revision += 1
    emit('robot_execution', item.id, 'robot_execution.stopping', { execution: item }, item.revision)
    emit('robot', robotId, 'robot.stopping', { robot: device }, device.revision)
    return { accepted: true, execution: copy(item) }
  },

  async installSkill(robotId, name, version) {
    const device = deviceOrThrow(robotId)
    const skill = skills.find((item) => item.name === name && item.version === version)
    if (!skill) throw Object.assign(new Error('Robot Skill 包不存在'), { code: 'NOT_FOUND' })
    const desired = { name, version, enabled: true }
    const desiredIndex = device.desired_skills.findIndex((item) => item.name === name)
    if (desiredIndex < 0) device.desired_skills.push(desired)
    else device.desired_skills.splice(desiredIndex, 1, desired)
    const installed = { ...skill, enabled: true, status: 'installed' }
    const index = device.installed_skills.findIndex(
      (item) => item.name === name && item.version === version
    )
    if (index < 0) device.installed_skills.push(installed)
    else device.installed_skills.splice(index, 1, installed)
    device.skill_catalog_revision += 1
    device.revision += 1
    emit('robot', robotId, 'skill.installed', { robot: device }, device.revision)
    return { accepted: true, desired_skill: copy(desired), robot: copy(device) }
  },

  async setSkillEnabled(robotId, name, version, enabled) {
    const device = deviceOrThrow(robotId)
    const desired = device.desired_skills.find((item) => item.name === name)
    if (!desired) throw Object.assign(new Error('Robot Skill 尚未设为期望'), { code: 'NOT_FOUND' })
    desired.version = version
    desired.enabled = enabled
    const skill = device.installed_skills.find(
      (item) => item.name === name && item.version === version
    )
    if (skill) skill.enabled = enabled
    device.skill_catalog_revision += 1
    device.revision += 1
    emit(
      'robot',
      robotId,
      enabled ? 'skill.enabled' : 'skill.disabled',
      { robot: device },
      device.revision
    )
    return { accepted: true, desired_skill: copy(desired), robot: copy(device) }
  },

  async uninstallSkill(robotId, name, version) {
    const device = deviceOrThrow(robotId)
    if (
      executions.some(
        (item) =>
          item.robot_id === robotId &&
          item.skill_name === name &&
          item.skill_version === version &&
          ['queued', 'starting', 'running', 'waiting_agent', 'stopping'].includes(item.status)
      )
    ) {
      throw Object.assign(new Error('运行中的 Robot Skill 不能卸载'), { code: 'SKILL_IN_USE' })
    }
    device.desired_skills = device.desired_skills.filter((item) => item.name !== name)
    device.installed_skills = device.installed_skills.filter(
      (item) => !(item.name === name && item.version === version)
    )
    device.skill_catalog_revision += 1
    device.revision += 1
    emit('robot', robotId, 'skill.uninstalled', { robot: device }, device.revision)
    return { removed: true, robot: copy(device) }
  },

  async startAbilityDebug(robotId, instanceId, payload) {
    const device = deviceOrThrow(robotId)
    const ability = device.abilities.find((item) => item.instance_id === instanceId)
    if (!ability) throw Object.assign(new Error('Ability 实例不存在'), { code: 'NOT_FOUND' })
    if (device.status === 'busy' || device.status === 'stopping') {
      throw Object.assign(new Error('Robot 正在执行正式任务，不能启动冲突调试'), {
        code: 'ROBOT_BUSY'
      })
    }
    const debug = {
      id: `debug-${Date.now()}`,
      robot_id: robotId,
      ability_instance_id: instanceId,
      task_name: payload.task_name,
      status: 'running',
      input: payload.input || {},
      feedback: [{ sequence: 1, message: '调试任务已由 Pilot 接受', phase: 'accepted' }],
      observations: [],
      started_at: now(),
      revision: 1
    }
    emit('ability_debug', debug.id, 'ability_debug.started', { debug }, 1)
    return { debug_execution: copy(debug) }
  },

  async stopAbilityDebug(robotId, debugId) {
    const debug = {
      id: debugId,
      robot_id: robotId,
      status: 'stopping',
      revision: 2,
      feedback: [{ sequence: 2, message: '停止请求已送达 Pilot', phase: 'stopping' }]
    }
    emit('ability_debug', debugId, 'ability_debug.stopping', { debug }, 2)
    return { debug_execution: copy(debug) }
  },

  subscribe({ afterSequence = 0, onEvent, onStatus }) {
    const listener = (event) => {
      if (event.sequence > afterSequence) onEvent?.(event)
    }
    listeners.add(listener)
    queueMicrotask(() => onStatus?.('online'))
    return {
      close() {
        listeners.delete(listener)
        onStatus?.('offline')
      }
    }
  }
}
