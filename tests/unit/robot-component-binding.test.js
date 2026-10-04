// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ElementPlus, { ElMessageBox } from 'element-plus'
import RobotComponentBinding from '@/components/studio/RobotComponentBinding.vue'
import { bindComponents, applyComponents } from '@/api/imports'

vi.mock('@/api/imports', () => ({ bindComponents: vi.fn(), applyComponents: vi.fn() }))
const apps = []
const ability = {
  id: 'ability-1',
  kind: 'robot_ability',
  name: '机械臂能力',
  version: '1',
  robot_models: ['arm'],
  abilities: [{ role: 'vla', ability_name: 'Arm.V2', model_backends: ['a'] }]
}
const model = {
  id: 'model-1',
  kind: 'model',
  name: '模型一',
  version: '1',
  robot_models: ['arm'],
  model_compatibility: {
    role: 'vla',
    ability_name: 'Arm.V2',
    backend: 'a',
    runtime_profiles: ['sim']
  }
}
const robot = {
  robot_id: 'arm-0',
  robot_model: 'arm',
  backend_profile: 'sim',
  status: 'ready',
  desired: {
    revision: 'new',
    abilities: { vla: { component_id: ability.id } },
    model: { component_id: model.id, name: '模型一' }
  },
  running: { revision: 'old', model: { name: '运行中的模型' } }
}
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(text) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
}
async function mount() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(RobotComponentBinding, {
    projectId: 'project',
    editable: true,
    robots: [robot],
    available: [ability, model, { ...model, id: 'model-2', name: '模型二' }]
  })
  app.use(ElementPlus)
  app.mount(root)
  apps.push(app)
  await flush()
}
afterEach(() => {
  apps.splice(0).forEach((a) => a.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it('选择已安装模型并保存，不重新安装或自动重启 Robot', async () => {
  bindComponents.mockResolvedValue({})
  await mount()
  expect(document.body.textContent).toContain('运行中的模型')
  button('选择 Ability / 模型').click()
  await flush()
  document.querySelectorAll('.el-select__wrapper')[2].click()
  await flush()
  const option = [...document.querySelectorAll('.el-select-dropdown__item')].find((i) =>
    i.textContent.includes('模型二')
  )
  expect(option).toBeTruthy()
  option.click()
  await flush()
  button('保存绑定').click()
  await flush()
  expect(bindComponents).toHaveBeenCalledWith('project', {
    robot_id: 'arm-0',
    robot_model: 'arm',
    component_ids: ['ability-1', 'model-2']
  })
  expect(applyComponents).not.toHaveBeenCalled()
})

it('用户明确确认后生效；失败显示原因且不报告已就绪', async () => {
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')
  applyComponents.mockRejectedValue(new Error('Robot 仍有任务占用'))
  await mount()
  button('立即生效 / 重试').click()
  await flush()
  expect(applyComponents).toHaveBeenCalledWith('project', 'arm-0')
  expect(document.body.textContent).toContain('Robot 仍有任务占用')
  expect(document.body.textContent).not.toContain('目标 Robot 已通过就绪检查')
})
