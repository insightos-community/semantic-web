import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/request', () => ({ default: { delete: vi.fn(), post: vi.fn() } }))
import request from '@/api/request'
import { removeComponent, installImport } from '@/api/imports'
import { removeProjectScene, uninstallRuntime } from '@/api/simulation'

describe('独立组件安装与卸载', () => {
  beforeEach(() => vi.clearAllMocks())
  it('组件卸载明确限定导入项目和组件身份', () => {
    removeComponent('project/a', 'id/b')
    expect(request.delete).toHaveBeenCalledWith('/projects/project%2Fa/components/id%2Fb')
  })
  it('Runtime 卸载使用独立安装入口', () => {
    uninstallRuntime('runtime/a')
    expect(request.delete).toHaveBeenCalledWith('/simulation/runtime-installations/runtime%2Fa')
  })
  it('移除项目场景引用不等同卸载 Runtime', () => {
    removeProjectScene('project', 'scene/a')
    expect(request.delete).toHaveBeenCalledWith(
      '/projects/project/simulation/project-scenes/scene%2Fa'
    )
  })
  it('型号默认绑定由独立安装的明确选项提供', () => {
    installImport('project', 'package', { project_default: true, confirm_code: true })
    expect(request.post).toHaveBeenCalledWith('/projects/project/imports/package/install', {
      project_default: true,
      confirm_code: true
    })
  })
})
