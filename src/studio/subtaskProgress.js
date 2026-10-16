// A successful planning call must stay distinguishable from completed motion.
export function subtaskProgressLabel(step = {}) {
  const result = step.result?.result || step.executions?.at(-1)?.result || {}
  const reason = step.reason || step.waiting_reason
  const reasons = {
    recovery_running: '正在重新编排',
    recovery_exhausted: '恢复未完成，需处理原因',
    robot_execution_failed: '能力执行失败',
    execution_state_unknown: '动作停止状态待核验',
    waiting_input: '等待回答',
    waiting_resource: '等待机器人连接或空闲',
    task_stopped: '任务已停止',
    user_stopped: '已按请求停止',
    replaced_after_failure: '失败记录，已生成恢复步骤',
    revised_after_failure: '已由恢复步骤替代'
  }
  if (reason) return reasons[reason] || reason
  if (step.status === 'completed') {
    return (
      {
        planned: '规划完成 · 尚未执行运动',
        queried: '查询完成',
        submitted: '已提交 · 等待异步结果',
        executed: '执行完成',
        updated: '状态更新完成'
      }[result.completion] || '调用完成 · 详情见执行结果'
    )
  }
  if (step.status === 'running' && !step.execution_ref && !step.executions?.length) {
    return 'Agent 正在准备调用 · 尚无机器人执行记录'
  }
  return (
    {
      pending: '等待前序步骤',
      running: '正在执行',
      paused: '已暂停',
      stopping: '正在停止',
      stopped: '已停止',
      failed: '失败'
    }[step.status] ||
    step.status ||
    '状态未知'
  )
}
