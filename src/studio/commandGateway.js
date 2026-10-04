let transport = null

// Studio 的业务命令统一经过 Project 订阅持有的传输层。面板不能自己创建
// WebSocket，否则拖动或关闭面板会意外断开整个 Project 的业务连接。
export function setStudioCommandTransport(next) {
  transport = typeof next === 'function' ? next : null
}

export function clearStudioCommandTransport() {
  transport = null
}

export function hasStudioCommandTransport() {
  return Boolean(transport)
}

export function sendStudioCommand(type, payload = {}) {
  return transport ? transport(type, payload) === true : false
}
