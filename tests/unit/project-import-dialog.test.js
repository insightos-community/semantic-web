// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive } from 'vue'
import ElementPlus from 'element-plus'
import ProjectImportDialog from '@/components/studio/ProjectImportDialog.vue'
import { listImports, scanImports, uploadImport, retryImport, installImport } from '@/api/imports'

vi.mock('@/api/imports', () => ({
  listImports: vi.fn(),
  scanImports: vi.fn(),
  uploadImport: vi.fn(),
  retryImport: vi.fn(),
  componentVersions: vi.fn().mockResolvedValue({ robots: [] }),
  installImport: vi.fn(),
  cancelInstallation: vi.fn(),
  rollbackComponents: vi.fn(),
  bindComponents: vi.fn(),
  applyComponents: vi.fn()
}))

const apps = []
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(overrides = {}) {
  const props = reactive({ modelValue: true, projectId: 'project-a', editable: true, ...overrides })
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(ProjectImportDialog, props)
  app.use(ElementPlus)
  app.mount(root)
  apps.push(app)
  await flush()
  return props
}

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('项目包导入', () => {
  it('安装包可单选组件并显示自动补齐的依赖', async () => {
    listImports.mockResolvedValue({
      directory: '/workspace/p/imports',
      items: [
        {
          id: 'package',
          name: 'Franka 场景',
          kind: 'package',
          status: 'imported',
          installation_status: 'pending',
          components: [
            { id: 'ability', file: 'ability.zip', requires: ['robot'] },
            { id: 'robot', file: 'robot.zip' },
            { id: 'scene', file: 'scene.zip' }
          ]
        }
      ]
    })
    installImport.mockResolvedValue({
      item: { status: 'imported', installation_status: 'installing' }
    })
    await mount()
    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === '安装')
      .click()
    await flush()
    const entries = [...document.querySelectorAll('.package-selection input[type=checkbox]')]
    expect(entries).toHaveLength(3)
    expect(entries.every((entry) => entry.checked)).toBe(true)
    entries[1].click()
    await flush()
    entries[2].click()
    await flush()
    expect(document.body.textContent).toContain('将自动安装所需依赖：robot')
    ;[...document.querySelectorAll('input[type=checkbox]')].at(-1).click()
    await flush()
    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === '确认安装')
      .click()
    await flush()
    expect(installImport).toHaveBeenCalledWith(
      'project-a',
      'package',
      expect.objectContaining({
        components: ['ability'],
        project_default: true,
        confirm_code: true
      })
    )
  })

  it('安装包取消所有选项后禁用确认，避免误装全部', async () => {
    listImports.mockResolvedValue({
      directory: '/workspace/p/imports',
      items: [
        {
          id: 'package',
          name: '演示',
          kind: 'package',
          status: 'imported',
          components: [{ id: 'scene', file: 'scene.zip' }]
        }
      ]
    })
    await mount()
    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === '安装')
      .click()
    await flush()
    document.querySelector('.package-selection input[type=checkbox]').click()
    ;[...document.querySelectorAll('input[type=checkbox]')].at(-1).click()
    await flush()
    expect(
      [...document.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === '确认安装'
      ).disabled
    ).toBe(true)
  })

  it('组件导入后明确确认才开始安装', async () => {
    listImports.mockResolvedValue({
      directory: '/workspace/p/imports',
      items: [
        {
          id: 'ability',
          name: 'Franka',
          version: '1.0.0',
          kind: 'robot_ability',
          status: 'imported',
          installation_status: 'pending'
        }
      ]
    })
    installImport.mockResolvedValue({
      item: { status: 'imported', installation_status: 'installing' }
    })
    await mount()
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent.trim() === '安装'
    )
    button.click()
    await flush()
    const confirm = [...document.querySelectorAll('button')].find(
      (item) => item.textContent.trim() === '确认安装'
    )
    expect(confirm.disabled).toBe(true)
    expect(installImport).not.toHaveBeenCalled()
    const checkbox = [...document.querySelectorAll('input[type=checkbox]')].at(-1)
    checkbox.click()
    await flush()
    confirm.click()
    await flush()
    expect(installImport).toHaveBeenCalledWith(
      'project-a',
      'ability',
      expect.objectContaining({ confirm_code: true, robot_id: '' })
    )
  })
  it('展示服务器投递目录、真实结果和设备安装边界', async () => {
    listImports.mockResolvedValue({
      directory: '/workspace/p/imports',
      items: [
        {
          id: 'one',
          name: 'test-skill',
          filename: 'test.zip',
          status: 'imported',
          kind: 'robot_skill',
          version: '1.0.0'
        }
      ]
    })
    await mount()
    expect(document.body.textContent).toContain('/workspace/p/imports')
    expect(document.body.textContent).toContain('已登记到 Robot Skill 库')
    expect(document.body.textContent).toContain('1.0.0')
  })

  it('上传后刷新，失败包显示错误并允许明确重试', async () => {
    listImports.mockResolvedValue({ directory: '/workspace/p/imports', items: [] })
    uploadImport.mockResolvedValue({ item: { status: 'failed', error: '版本冲突' } })
    await mount()
    const input = document.querySelector('input[type=file]')
    const file = new File(['zip'], 'skill.zip', { type: 'application/zip' })
    Object.defineProperty(input, 'files', { value: [file] })
    listImports.mockResolvedValue({
      directory: '/workspace/p/imports',
      items: [{ id: 'failed', filename: 'skill.zip', status: 'failed', error: '版本冲突' }]
    })
    input.dispatchEvent(new Event('change'))
    await flush()
    expect(uploadImport).toHaveBeenCalledWith('project-a', file)
    expect(document.body.textContent).toContain('版本冲突')
    retryImport.mockResolvedValue({ item: { status: 'imported' } })
    const retry = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('重试导入')
    )
    retry.click()
    await flush()
    expect(retryImport).toHaveBeenCalledWith('project-a', 'failed')
  })

  it('运行模式保留查看并禁用导入操作', async () => {
    listImports.mockResolvedValue({ directory: '/workspace/p/imports', items: [] })
    await mount({ editable: false })
    expect(document.querySelector('input[type=file]').disabled).toBe(true)
    const scan = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('立即扫描')
    )
    expect(scan.disabled).toBe(true)
    expect(scanImports).not.toHaveBeenCalled()
  })

  it('后台扫描结果在弹窗内刷新，关闭后停止轮询', async () => {
    vi.useFakeTimers()
    listImports.mockResolvedValue({ directory: '/workspace/p/imports', items: [] })
    await mount()
    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(listImports).toHaveBeenCalledTimes(2)
    apps.splice(0).forEach((app) => app.unmount())
    await vi.advanceTimersByTimeAsync(10000)
    expect(listImports).toHaveBeenCalledTimes(2)
  })
})
