// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createPinia } from 'pinia'
import { useDeviceStore } from '@/stores/device'
import DeviceSkillsPanel from '@/components/device/DeviceSkillsPanel.vue'

vi.mock('@/components/device/RobotSkillDebugPanel.vue', () => ({
  default: { props: ['skill'], template: '<div class="debug-skill">{{ skill.name }}</div>' }
}))
vi.mock('@/components/device/DeviceStatus.vue', () => ({
  default: { template: '<span />' }
}))

let app
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

it('页面隐藏不兼容技能，切换 Robot 后不残留旧技能调试区', async () => {
  const action = (type) => ({ type, schema_version: 2 })
  const vla = {
    name: 'vla-manipulation',
    version: '0.1.2',
    required_actions: [action('vla.execute_policy')],
    stop_actions: [action('vla.hold_robot')]
  }
  const grasp = {
    name: 'grasp-object',
    version: '0.4.23',
    required_actions: [action('gripper.close')],
    stop_actions: [action('gripper.hold_object')]
  }
  const props = reactive({
    robot: {
      robot_id: 'franka-0',
      model: 'franka_panda',
      abilities: [
        { selected: true, action_details: [...vla.required_actions, ...vla.stop_actions] }
      ]
    },
    inlineDebug: true,
    initialSkillKey: 'grasp-object@0.4.23'
  })
  const pinia = createPinia()
  useDeviceStore(pinia).skillPackages = [grasp, vla]
  app = createApp({ render: () => h(DeviceSkillsPanel, props) })
  app.use(pinia)
  app.component('el-button', { template: '<button><slot /></button>' })
  const root = document.createElement('div')
  document.body.appendChild(root)
  app.mount(root)
  await nextTick()
  expect([...root.querySelectorAll('.skill-title b')].map((n) => n.textContent)).toEqual([
    'vla-manipulation'
  ])
  expect(root.querySelector('.debug-skill')).toBeNull()
  root.querySelector('article').click()
  await nextTick()
  expect(root.querySelector('.debug-skill').textContent).toBe('vla-manipulation')

  props.robot = {
    robot_id: 'r1-0',
    model: 'r1_pro_chassis',
    abilities: [
      { selected: true, action_details: [...grasp.required_actions, ...grasp.stop_actions] }
    ]
  }
  await nextTick()
  expect([...root.querySelectorAll('.skill-title b')].map((n) => n.textContent)).toEqual([
    'grasp-object'
  ])
  expect(root.querySelector('.debug-skill')).toBeNull()

  props.robot.abilities = []
  await nextTick()
  expect(root.querySelectorAll('article')).toHaveLength(0)
  expect(root.textContent).toContain('暂无与当前机器人 Ability 匹配的 Robot Skill')
})
