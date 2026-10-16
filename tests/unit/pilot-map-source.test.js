// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import PilotMapSource from '@/components/studio/PilotMapSource.vue'
import request from '@/api/request'
vi.mock('@/api/request', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
const sources = [
  {
    pilot_id: 'real',
    robot_id: 'r1pro',
    name: '真机',
    online: true,
    available: true,
    service_url: 'http://127.0.0.1:18050'
  },
  { pilot_id: 'mock', name: '模拟器', online: false, available: true },
  { pilot_id: 'new', name: '新设备', online: true, available: false }
]
let app, host
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}
async function mount(props, synced = vi.fn()) {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(PilotMapSource, { ...props, onSynced: synced }) })
  app.mount(host)
  await flush()
  return synced
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
})
describe('Pilot map selection', () => {
  it('loads only when Real Map is open; selects the exact Pilot and refreshes the map', async () => {
    request.get.mockResolvedValue({ sources, binding: null })
    const props = reactive({ projectId: 'kitchen', active: false })
    const synced = await mount(props)
    expect(request.get).not.toHaveBeenCalled()
    props.active = true
    await flush()
    expect(host.querySelectorAll('option')).toHaveLength(4)
    expect(host.querySelector('option[value="new"]').disabled).toBe(true)
    request.put.mockResolvedValue({})
    request.get.mockResolvedValue({ sources, binding: { pilot_id: 'real', source_revision: 1 } })
    const select = host.querySelector('select')
    select.value = 'real'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(request.put).toHaveBeenCalledWith('/projects/kitchen/maps/real_map/source', {
      pilot_id: 'real'
    })
    expect(select.value).toBe('real')
    expect(host.textContent).toContain('已连接')
    expect(host.textContent).toContain('http://127.0.0.1:18050')
    expect(synced).toHaveBeenCalled()
  })
  it('discards a previous project response arriving after a switch', async () => {
    let finish
    request.get
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        })
      )
      .mockResolvedValue({ sources, binding: { pilot_id: 'mock', source_revision: 2 } })
    const props = reactive({ projectId: 'first', active: true })
    await mount(props)
    props.projectId = 'second'
    await flush()
    finish({ sources, binding: { pilot_id: 'real', source_revision: 1 } })
    await flush()
    expect(host.querySelector('select').value).toBe('mock')
    expect(host.textContent).toContain('Pilot 离线')
  })
  it('retains the current source after a failed selection', async () => {
    request.get.mockResolvedValue({ sources, binding: { pilot_id: 'real', source_revision: 1 } })
    await mount(reactive({ projectId: 'kitchen', active: true }))
    request.put.mockRejectedValue(new Error('无权使用该地图来源'))
    const select = host.querySelector('select')
    select.value = 'mock'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(host.textContent).toContain('无权使用该地图来源')
    expect(host.querySelector('select').value).toBe('real')
  })
})
