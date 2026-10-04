// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'
import { stopWorkflowFromUI } from '@/studio/stopWorkflow'

afterEach(() => vi.restoreAllMocks())

function makeUi() {
  return { notify: vi.fn() }
}

describe('停止 Workflow 的统一入口', () => {
  it('普通状态直接下发 stop', async () => {
    const workflow = { transitionById: vi.fn().mockResolvedValue({}), error: '' }
    const ui = makeUi()
    await stopWorkflowFromUI(workflow, ui, 'wf-1', [], {
      view: { workflow: { status: 'running' } }
    })
    expect(workflow.transitionById).toHaveBeenCalledWith('wf-1', 'stop')
    expect(ui.notify).not.toHaveBeenCalled()
  })

  it('物理状态未知时不发 stop，直接打开人工安全确认', async () => {
    // 该状态下 stop 会被服务端安全策略退回 paused，按钮必须直接走确认流程。
    const prompt = vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '现场已确认' })
    const workflow = {
      transitionById: vi.fn(),
      confirmStop: vi.fn().mockResolvedValue({}),
      error: ''
    }
    const ui = makeUi()
    await stopWorkflowFromUI(workflow, ui, 'wf-1', [], {
      view: { workflow: { status: 'paused', reason: 'execution_state_unknown' } }
    })
    expect(workflow.transitionById).not.toHaveBeenCalled()
    expect(prompt).toHaveBeenCalled()
    expect(workflow.confirmStop).toHaveBeenCalledWith('wf-1', '现场已确认')
    expect(ui.notify).toHaveBeenCalledWith({ type: 'success', message: 'Workflow 已按现场安全确认终结' })
  })

  it('服务端返回 OPERATOR_CONFIRMATION_REQUIRED 时转入人工确认', async () => {
    // 前端快照可能滞后（例如刚外部推进过 revision），错误码是权威信号。
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '现场已确认' })
    const error = new Error('执行物理状态未知')
    error.code = 'OPERATOR_CONFIRMATION_REQUIRED'
    const workflow = {
      transitionById: vi.fn().mockRejectedValue(error),
      confirmStop: vi.fn().mockResolvedValue({}),
      error: ''
    }
    const ui = makeUi()
    await stopWorkflowFromUI(workflow, ui, 'wf-1', [])
    expect(workflow.confirmStop).toHaveBeenCalledWith('wf-1', '现场已确认')
    expect(ui.notify).not.toHaveBeenCalledWith({ type: 'error', message: 'Workflow 停止失败' })
  })

  it('其他停止错误仍然提示失败', async () => {
    const error = new Error('网络异常')
    error.code = 'NETWORK_ERROR'
    const workflow = { transitionById: vi.fn().mockRejectedValue(error), error: '' }
    const ui = makeUi()
    await stopWorkflowFromUI(workflow, ui, 'wf-1', [])
    expect(ui.notify).toHaveBeenCalledWith({ type: 'error', message: '网络异常' })
  })
})
