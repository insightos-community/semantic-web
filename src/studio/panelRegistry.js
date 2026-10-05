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

import { defineAsyncComponent, markRaw } from 'vue'

const panels = {
  'scene-workspace': {
    title: '场景',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/SceneWorkspacePanel.vue')
  },
  explorer: {
    title: 'Explorer',
    component: () => import('@/components/studio/panels/ExplorerPanel.vue')
  },
  conversation: {
    title: '对话',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/ConversationEditorPanel.vue')
  },
  'plan-document': {
    title: 'Plan',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/PlanDocumentPanel.vue')
  },
  'workflow-run': {
    title: 'Workflow',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/WorkflowRunPanel.vue')
  },
  memory: {
    title: 'Project Memory',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/MemoryPanel.vue')
  },
  agents: {
    title: 'Agent',
    preferredRegion: 'editor',
    component: () => import('@/views/AgentsView.vue')
  },
  skills: {
    title: 'Skill',
    preferredRegion: 'editor',
    component: () => import('@/views/SkillsView.vue')
  },
  tools: {
    title: 'Tool',
    preferredRegion: 'editor',
    component: () => import('@/views/ToolsView.vue')
  },
  inspector: {
    title: '详情',
    component: () => import('@/components/studio/StudioContextInspector.vue')
  },
  runs: {
    title: 'Runs',
    preferredRegion: 'primary',
    component: () => import('@/components/studio/panels/RunsPanel.vue')
  },
  interactions: {
    title: 'Interactions',
    preferredRegion: 'bottom',
    component: () => import('@/components/studio/panels/InteractionsPanel.vue')
  },
  activity: {
    title: 'Tools & SubAgents',
    preferredRegion: 'bottom',
    component: () => import('@/components/studio/panels/ActivityPanel.vue')
  },
  artifacts: {
    title: 'Artifacts',
    preferredRegion: 'bottom',
    component: () => import('@/components/studio/panels/ArtifactsPanel.vue')
  },
  trace: {
    title: 'Trace',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/TracePanel.vue')
  },
  runtime: {
    title: 'Robot Execution',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/RobotExecutionsPanel.vue')
  },
  'robot-device': {
    title: 'Robot Device',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/RobotDevicePanel.vue')
  },
  map: {
    title: 'Semantic Map',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/MapPanel.vue')
  },
  'scene-details': {
    title: 'Scene Details',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/SceneDetailsPanel.vue')
  },
  'scene-editor': {
    title: 'Scene Editor',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/SceneEditorPanel.vue')
  },
  'physics-viewer': {
    title: 'Physics Viewer',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/PhysicsViewerPanel.vue')
  },
  'sensor-viewer': {
    title: 'Sensor Viewer',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/SensorViewerPanel.vue')
  },
  'evaluation-result': {
    title: 'Evaluation Result',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/EvaluationResultPanel.vue')
  },
  'robot-sdk-debug': {
    title: 'Robot SDK Debug',
    preferredRegion: 'editor',
    component: () => import('@/components/studio/panels/RobotSDKDebugPanel.vue')
  },
  simulation: {
    title: 'Simulation',
    unavailable: '旧 Simulation Workbench 已拆分为场景详情、编辑器、Viewer 与 Sensor 面板'
  }
}

const resolved = new Map()

export function getPanelDefinition(type) {
  const definition = panels[type]
  if (!definition) return null
  if (!definition.component) return definition
  if (!resolved.has(type)) {
    resolved.set(type, markRaw(defineAsyncComponent(definition.component)))
  }
  return { ...definition, resolvedComponent: resolved.get(type) }
}

export function listPanelDefinitions() {
  return Object.entries(panels).map(([type, definition]) => ({ type, ...definition }))
}

export function makePanelId(type, resourceId = '') {
  return resourceId ? `${type}:${resourceId}` : type
}

export function panelTitle(type, resourceId = '') {
  const base = panels[type]?.title || type
  return resourceId ? `${base} · ${resourceId}` : base
}
