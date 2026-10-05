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

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDeviceStore } from '@/stores/device'
import { useAbilityStore } from '@/stores/ability'
import { createDeviceSubscription } from '@/devices/subscription'
import * as api from '@/api/devices'

vi.mock('@/api/devices', () => ({ getDeviceSnapshot: vi.fn(), getDevice: vi.fn() }))
const robot = (revision, status = 'idle') => ({
  robot_id: 'r1',
  revision,
  status,
  pilot: { status: 'online' },
  runtime_instance: { robot_id: 'r1', instance_id: 'rt1', status: 'ready', revision }
})

describe('Studio 设备实时状态与补查', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('查询期间收到的更新不会被迟到的旧快照回退', async () => {
    const store = useDeviceStore()
    store.hydrate({ robots: [robot(1)], event_sequence: 10 })
    let resolve
    api.getDeviceSnapshot.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const pending = store.loadSnapshot()
    createDeviceSubscription({ afterSequence: 10 }).applyEvent({
      sequence: 11,
      resource_type: 'robot',
      resource_revision: 2,
      payload: { robot: robot(2, 'busy') }
    })
    resolve({ robots: [robot(1)], event_sequence: 10 })
    await pending
    expect(store.byId('r1').status).toBe('busy')
    expect(store.lastEventSequence).toBe(11)
    expect(store.snapshotStatus).toBe('ready')
  })

  it('后发查询优先，旧查询失败不能覆盖新查询成功', async () => {
    const store = useDeviceStore()
    let reject
    api.getDeviceSnapshot
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail
          })
      )
      .mockResolvedValueOnce({ robots: [robot(4)], event_sequence: 20 })
    const old = store.loadSnapshot()
    await store.loadSnapshot()
    reject(new Error('old request failed'))
    await old
    expect(store.snapshotStatus).toBe('ready')
    expect(store.error).toBe('')
    expect(store.byId('r1').revision).toBe(4)
  })

  it('离开工作区后查询与已关闭订阅不能复活设备状态', async () => {
    const store = useDeviceStore()
    let resolve
    api.getDeviceSnapshot.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const pending = store.loadSnapshot()
    const subscription = createDeviceSubscription()
    subscription.stop()
    store.clear()
    resolve({ robots: [robot(1)], event_sequence: 10 })
    await pending
    subscription.applyEvent({ sequence: 1, resource_type: 'robot', payload: { robot: robot(2) } })
    expect(store.robots).toEqual([])
    expect(store.snapshotStatus).toBe('idle')
  })

  it('手动刷新推进游标后，下一条事件不误报缺口且部分 Robot 事件不清空 Ability', () => {
    const store = useDeviceStore()
    const abilities = useAbilityStore()
    abilities.hydrateRobot('r1', [{ instance_id: 'a1', ability_name: 'Navigation' }])
    const gap = vi.fn()
    const subscription = createDeviceSubscription({ afterSequence: 10, onGap: gap })
    store.hydrate({ robots: [robot(2)], event_sequence: 20 })
    subscription.applyEvent({
      sequence: 21,
      resource_type: 'robot',
      resource_revision: 3,
      payload: { robot: { robot_id: 'r1', status: 'busy', revision: 3 } }
    })
    expect(gap).not.toHaveBeenCalled()
    expect(store.lastEventSequence).toBe(21)
    expect(abilities.forRobot('r1')).toHaveLength(1)
  })

  it('Robot 详情旧响应不回退实时状态，同序号快照也保留较新 Runtime revision', async () => {
    const store = useDeviceStore()
    store.hydrate({ robots: [robot(3, 'busy')], event_sequence: 10 })
    api.getDevice.mockResolvedValue({ device: robot(2) })
    await store.loadDevice('r1')
    store.applyRuntimeEvent({
      resource_revision: 5,
      payload: { runtime_instance: { ...robot(5).runtime_instance, status: 'stopping' } }
    })
    store.hydrate({ robots: [robot(3, 'busy')], event_sequence: 10 })
    expect(store.byId('r1').status).toBe('busy')
    expect(store.runtimeForRobot('r1').status).toBe('stopping')
  })
  it('直接请求结束后完整设备事件清除 current_run，部分状态事件保留已有请求', () => {
    const store = useDeviceStore()
    store.upsert({
      ...robot(1, 'busy'),
      current_run: { id: 'run1', status: 'running' },
      current_execution_id: ''
    })
    store.upsert({ robot_id: 'r1', revision: 2, pilot: { status: 'online' } })
    expect(store.byId('r1').current_run.id).toBe('run1')
    store.upsert({ ...robot(3), current_execution_id: '' })
    expect(store.byId('r1').current_run).toBeNull()
  })

  const runtimeGeneration = (id, revision, status, createdAt) => ({
    robot_id: 'r1',
    instance_id: id,
    revision,
    status,
    created_at: createdAt,
    updated_at: createdAt
  })
  const oldRuntime = () => runtimeGeneration('old', 5, 'stopped', '2026-09-07T12:00:00Z')
  const newRuntime = (status = 'ready', revision = 3) =>
    runtimeGeneration('new', revision, status, '2026-09-07T12:08:15Z')

  it('旧实例 stopped rev5 不遮盖新实例 starting rev1 和 ready rev3', () => {
    const store = useDeviceStore()
    store.hydrate({ robots: [{ ...robot(10), runtime_instance: oldRuntime() }] })
    const apply = (runtime) =>
      store.applyRuntimeEvent({
        resource_type: 'robot_runtime_instance',
        resource_id: runtime.instance_id,
        resource_revision: runtime.revision,
        payload: { runtime_instance: runtime }
      })
    expect(apply(newRuntime('starting', 1))).toBe(true)
    expect(store.runtimeForRobot('r1').status).toBe('starting')
    expect(apply(newRuntime())).toBe(true)
    expect(store.runtimeForRobot('r1')).toMatchObject({
      instance_id: 'new',
      status: 'ready',
      revision: 3
    })
    // 旧实例即使更晚结束、revision 更高，也不属于当前实例代次。
    expect(apply({ ...oldRuntime(), revision: 9, updated_at: '2026-09-07T12:09:00Z' })).toBe(false)
    expect(apply(newRuntime('starting', 1))).toBe(false)
    expect(store.byId('r1').runtime_instance).toEqual(store.runtimeForRobot('r1'))
    expect(store.byId('r1').pilot.status).toBe('online')
  })

  it.each(['snapshot', 'detail'])(
    '完整 %s 可从新实例恢复，旧高 revision 响应不能倒灌',
    async (source) => {
      const store = useDeviceStore()
      store.hydrate({
        robots: [{ ...robot(10), runtime_instance: oldRuntime() }],
        event_sequence: 10
      })
      const update = async (runtime) => {
        const device = { ...robot(10), runtime_instance: runtime }
        if (source === 'snapshot') store.hydrate({ robots: [device], event_sequence: 10 })
        else {
          api.getDevice.mockResolvedValue({ device })
          await store.loadDevice('r1')
        }
      }
      await update(newRuntime())
      expect(store.runtimeForRobot('r1').instance_id).toBe('new')
      await update({ ...oldRuntime(), revision: 20, updated_at: '2026-09-07T12:10:00Z' })
      expect(store.runtimeForRobot('r1')).toMatchObject({
        instance_id: 'new',
        status: 'ready',
        revision: 3
      })
    }
  )

  it('新 Runtime 身份独立于 Robot/Pilot revision，缺时序增量不能猜测替换', () => {
    const store = useDeviceStore()
    store.hydrate({ robots: [{ ...robot(10, 'busy'), runtime_instance: oldRuntime() }] })
    store.upsert({ ...robot(2), runtime_instance: newRuntime() })
    expect(store.byId('r1').status).toBe('busy')
    expect(store.runtimeForRobot('r1').instance_id).toBe('new')
    expect(
      store.applyRuntimeEvent({
        payload: {
          runtime_instance: {
            instance_id: 'unknown',
            robot_id: 'r1',
            revision: 99,
            status: 'stopped'
          }
        }
      })
    ).toBe(false)
    expect(store.runtimeForRobot('r1').instance_id).toBe('new')
  })
})
