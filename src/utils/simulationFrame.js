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

// Plugin MuJoCo 二进制帧：4 字节大端 JSON 头长度 + UTF-8 JSON 头 + 图像数据。
const decoder = new TextDecoder()

export function decodeSimulationFrame(value) {
  const buffer =
    value instanceof ArrayBuffer
      ? value
      : value?.buffer?.slice(value.byteOffset, value.byteOffset + value.byteLength)
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 5) {
    throw new Error('仿真帧数据不完整')
  }
  const view = new DataView(buffer)
  const headerLength = view.getUint32(0, false)
  if (headerLength < 2 || headerLength > buffer.byteLength - 4) {
    throw new Error('仿真帧头长度无效')
  }
  let metadata
  try {
    metadata = JSON.parse(decoder.decode(new Uint8Array(buffer, 4, headerLength)))
  } catch {
    throw new Error('仿真帧头不是合法 JSON')
  }
  const payload = buffer.slice(4 + headerLength)
  return { metadata, payload }
}

export function simulationStreamUrl(kind, params = {}) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const query = new URLSearchParams({ kind, ...params })
  return `${protocol}//${window.location.host}/ws/simulation-stream?${query}`
}

// 二进制流连接采用“最新帧覆盖旧帧”。页面解码或渲染变慢时不会排队累积图片。
export function createSimulationFrameStream({
  url,
  token,
  onFrame,
  onStatus = () => {},
  onError = () => {},
  reconnectDelay = 1200,
  socketImpl
}) {
  let socket
  let stopped = false
  let reconnectTimer
  let pendingFrame = null
  let scheduled = false

  const deliver = () => {
    scheduled = false
    const value = pendingFrame
    pendingFrame = null
    if (!value) return
    try {
      onFrame(decodeSimulationFrame(value))
    } catch (error) {
      onError(error)
    }
  }

  const connect = () => {
    if (stopped) return
    onStatus('connecting')
    const Socket = socketImpl || window.WebSocket
    socket = new Socket(url, token ? [`bearer.${token}`] : undefined)
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => onStatus('online')
    socket.onmessage = (event) => {
      pendingFrame = event.data
      if (!scheduled) {
        scheduled = true
        queueMicrotask(deliver)
      }
    }
    socket.onerror = () => socket?.close()
    socket.onclose = () => {
      onStatus(stopped ? 'offline' : 'reconnecting')
      if (!stopped) reconnectTimer = setTimeout(connect, reconnectDelay)
    }
  }

  const close = () => {
    stopped = true
    clearTimeout(reconnectTimer)
    socket?.close()
    onStatus('offline')
  }

  return { connect, close }
}
