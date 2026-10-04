// envelope 分发器（17-web-ui-design §8/§9）：
// WS 消息按 channel 路由到目标 store 的 action；store 之间不直接引用。
// 未注册 channel 安全忽略（返回 false），便于按里程碑渐进接入。
import { alertImportance, useChatStore } from '@/stores/chat'
import { useUiStore } from '@/stores/ui'

export const CHANNELS = Object.freeze(['dialogue', 'alert', 'trace', 'artifact', 'interaction'])

export function createDispatcher(handlers = {}) {
  return {
    handlers,
    on(channel, fn) {
      handlers[channel] = fn
      return this
    },
    dispatch(envelope) {
      if (!envelope || typeof envelope.channel !== 'string') return false
      const fn = handlers[envelope.channel]
      if (!fn) return false
      fn(envelope)
      return true
    }
  }
}

// 生产默认分发器：绑定真实 store。
// trace 频道将在运行检查器接入后注册；未注册事件由调用方安全忽略。
export function createDefaultDispatcher() {
  const chat = useChatStore()
  const ui = useUiStore()
  return createDispatcher({
    dialogue: (env) => chat.applyDialogue(env),
    alert: (env) => {
      chat.applyAlert(env)
      // critical 告警同时升全局通知（分级渲染规则 §5；分级判定与 store 同源）
      if (alertImportance(env) === 'critical') {
        ui.notify({
          type: 'error',
          message: env.payload?.message || env.payload?.description || '收到严重告警'
        })
      }
    },
    artifact: (env) => chat.applyArtifact(env),
    interaction: (env) => chat.applyInteraction(env)
  })
}
