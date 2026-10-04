// 只有已有属性页的资源才创建 Inspector。编辑器焦点本身（例如对话、
// Agent 列表）不等同于选中了业务对象，不再生成只有 Resource ID 的空详情。
const supportedTypes = new Set([
  'map_entity',
  'robot_stage',
  'robot_execution',
  'run',
  'robot',
  'ability',
  'robot_skill',
  'workflow',
  'plan_proposal',
  'task',
  'subtask',
  'trace',
  'artifact',
  'interaction',
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

export function supportsInspector(resource) {
  return Boolean(resource?.resourceId && supportedTypes.has(resource.resourceType))
}
