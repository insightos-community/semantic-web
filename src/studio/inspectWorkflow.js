import { useLayoutStore } from '@/stores/layout'
import { useWorkflowStore } from '@/stores/workflow'

// inspectWorkflowTask 把对话里的「查看 Task」落到 Inspector：加载历史视图，
// 不替换当前工作，也不切换 Editor Tab，避免覆盖正在执行的 Workflow 或 Task 选择。
export async function inspectWorkflowTask({ workflowId, taskId, title } = {}) {
  if (!taskId) return false
  const workflow = useWorkflowStore()
  const layout = useLayoutStore()
  if (workflowId) {
    try {
      await workflow.inspectView(workflowId)
    } catch (error) {
      workflow.error = error.message || 'Workflow 视图加载失败'
      throw error
    }
  }
  layout.select({
    resourceType: 'task',
    resourceId: taskId,
    title: title || taskId
  })
  layout.revealInspector(true)
  return true
}
