import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/request', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import request from '@/api/request'
import * as api from '@/api/simulation'

describe('原生场景生命周期独立超时', () => {
  beforeEach(() => vi.clearAllMocks())
  it('创建、切换和拉起 Runtime 使用两分钟受理预算', () => {
    api.startProjectScene('p', 's', {})
    api.startScene('p', 's', {})
    api.switchProjectSceneVariant('p', 's', {})
    api.ensureProjectRuntime('p')
    api.ensureRuntime('p', 'profile')
    for (const args of request.post.mock.calls) expect(args[2]).toEqual({ timeout: 120_000 })
  })
  it('重置/停止单独延长，查询、暂停/继续保留默认短超时', () => {
    api.operateScene('p', 's', 'reset')
    api.operateScene('p', 's', 'stop')
    api.operateScene('p', 's', 'pause')
    api.operateScene('p', 's', 'resume')
    expect(request.post.mock.calls.map((args) => args[2])).toEqual([
      { timeout: 120_000 }, { timeout: 120_000 }, undefined, undefined
    ])
    api.getSimulationSnapshot('p')
    expect(request.get).toHaveBeenCalledWith('/projects/p/simulation/snapshot')
  })
})
