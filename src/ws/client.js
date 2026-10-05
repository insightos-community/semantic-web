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

// WS 客户端（docs/api/ws.md 定稿、17-web-ui-design §9）
// 状态机：offline → connecting → online ⇄ reconnecting（→ offline 仅手动断开）
// - 保活：服务端协议层 ping/pong（30s ping / 90s 判死，浏览器自动回 pong），
//   应用层不再上行 ping——上行类型只有 chat.message/interaction.reply/sync，
//   多发 {"type":"ping"} 只会吃 WS_UNKNOWN_TYPE；同理默认不做"N 秒无入站判死"
//  （静默的健康连接没有任何应用层入站，协议层 ping 到不了 onmessage）。
//   pingInterval/deadTimeout 仅在未来服务端支持应用层心跳时开启。
// - 重连：指数退避 1s/2s/4s…封顶 30s，连接成功清零
// - 续传：旧 Chat 使用 last_event_id；Project Studio 使用全局 after_sequence。
//   两类连接共享重连实现，但只会发送各自协议要求的字段。
// - 监听：on(channel, fn) 注册表；'*' 订阅全部频道（含 error/sync.done 除外的协议应答）
export const WS_STATUS = Object.freeze({
  OFFLINE: 'offline',
  CONNECTING: 'connecting',
  ONLINE: 'online',
  RECONNECTING: 'reconnecting'
})

const SEEN_CAP = 1000 // 去重缓存上限（FIFO）

export function createWsClient(options = {}) {
  const {
    url = defaultUrl(),
    pingInterval = 0, // >0 才启用应用层 ping（见文件头说明）
    deadTimeout = 0, // >0 才启用无入站判死
    backoffBase = 1000,
    backoffMax = 30000,
    initialLastEventId = '',
    initialAfterSequence = null,
    socketImpl = null // 测试注入用
  } = options

  let ws = null
  let status = WS_STATUS.OFFLINE
  let lastEventId = initialLastEventId
  let lastSequence =
    initialAfterSequence == null ? null : Math.max(0, Number(initialAfterSequence) || 0)
  let attempts = 0
  let manualClose = false
  let pingTimer = null
  let deadTimer = null
  let reconnectTimer = null
  const seen = []
  const listeners = new Map() // channel → Set<fn>
  const statusListeners = new Set()

  function defaultUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}/ws/agent-events`
  }

  function setStatus(next) {
    if (status === next) return
    status = next
    statusListeners.forEach((fn) => fn(next))
  }

  function armDeadTimer() {
    clearTimeout(deadTimer)
    if (deadTimeout <= 0) return
    deadTimer = setTimeout(() => {
      // N 秒无入站消息：判定断连，触发 onclose 走重连
      ws?.close()
    }, deadTimeout)
  }

  function startPing() {
    armDeadTimer()
    if (pingInterval <= 0) return
    clearInterval(pingTimer)
    pingTimer = setInterval(() => send('ping'), pingInterval)
  }

  function stopTimers() {
    clearInterval(pingTimer)
    clearTimeout(deadTimer)
  }

  function scheduleReconnect() {
    stopTimers()
    if (manualClose) {
      setStatus(WS_STATUS.OFFLINE)
      return
    }
    setStatus(WS_STATUS.RECONNECTING)
    const delay = Math.min(backoffBase * 2 ** attempts, backoffMax)
    attempts += 1
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, delay)
  }

  function remember(id) {
    seen.push(id)
    if (seen.length > SEEN_CAP) seen.shift()
  }

  function handleMessage(raw) {
    armDeadTimer() // 任何入站消息都算存活信号
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }
    if (!data || typeof data !== 'object') return
    if (data.type === 'pong') return
    if (data.type === 'sync.done') return // 补发结束标记，无需分发
    // 下行 envelope：按 id 幂等去重后再分发
    if (data.id) {
      if (seen.includes(data.id)) return
      remember(data.id)
      lastEventId = data.id
    }
    if (lastSequence != null && Number(data.sequence || 0) > lastSequence) {
      lastSequence = Number(data.sequence)
    }
    const fns = [...(listeners.get(data.channel) || []), ...(listeners.get('*') || [])]
    fns.forEach((fn) => fn(data))
  }

  function connect() {
    const Socket = socketImpl || window.WebSocket
    setStatus(attempts > 0 ? WS_STATUS.RECONNECTING : WS_STATUS.CONNECTING)
    ws = new Socket(url)

    ws.onopen = () => {
      attempts = 0
      setStatus(WS_STATUS.ONLINE)
      startPing()
      // Project Studio 的 sequence 是 Project 全局游标；旧 Chat 仍按事件 ID 续传。
      if (lastSequence != null) send('sync', { after_sequence: lastSequence })
      else if (lastEventId) send('sync', { last_event_id: lastEventId })
    }
    ws.onmessage = (evt) => handleMessage(evt.data)
    ws.onerror = () => ws?.close()
    ws.onclose = () => scheduleReconnect()
  }

  function disconnect() {
    manualClose = true
    clearTimeout(reconnectTimer)
    stopTimers()
    ws?.close()
    setStatus(WS_STATUS.OFFLINE)
  }

  function send(type, extra = {}) {
    if (ws?.readyState !== 1) return false
    ws.send(JSON.stringify({ type, ...extra }))
    return true
  }

  function on(channel, fn) {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel).add(fn)
    return () => off(channel, fn)
  }

  function off(channel, fn) {
    listeners.get(channel)?.delete(fn)
  }

  function onStatus(fn) {
    statusListeners.add(fn)
    return () => statusListeners.delete(fn)
  }

  return {
    connect,
    disconnect,
    send,
    on,
    off,
    onStatus,
    get status() {
      return status
    },
    get lastEventId() {
      return lastEventId
    },
    get lastSequence() {
      return lastSequence
    }
  }
}
