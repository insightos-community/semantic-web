import { confirmWorkflowStop } from '@/studio/confirmWorkflowStop'
import { workflowStopMode } from '@/stores/workflow'

// 停止 Workflow 的统一入口。物理执行状态未知（paused + execution_state_unknown）
// 时普通 stop 无法收敛：服务端安全策略会把 stopping 退回 paused，Robot 锁和仿真
// 现场都还在。这里统一识别该状态（前端快照）与服务端明确的错误码，直接引导用户
// 走人工安全确认，而不是显示一个"看起来成功"的停止结果。
export async function stopWorkflowFromUI(workflow, ui, workflowId, tasks = [], options = {}) {
  const { view = null } = options
  if (view && workflowStopMode(view.workflow) === 'unknown') {
    await confirmWorkflowStop(workflow, ui, workflowId, tasks)
    return
  }
  try {
    await workflow.transitionById(workflowId, 'stop')
  } catch (error) {
    if (error?.code === 'OPERATOR_CONFIRMATION_REQUIRED') {
      await confirmWorkflowStop(workflow, ui, workflowId, tasks)
      return
    }
    ui.notify({ type: 'error', message: workflow.error || error.message || 'Workflow 停止失败' })
  }
}
