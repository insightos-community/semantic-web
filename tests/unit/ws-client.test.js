import { describe, expect, it } from 'vitest'
import { createWsClient } from '@/ws/client'

class FakeSocket {
  static latest = null

  constructor() {
    this.readyState = 0
    this.sent = []
    FakeSocket.latest = this
  }

  open() {
    this.readyState = 1
    this.onopen?.()
  }

  emit(value) {
    this.onmessage?.({ data: JSON.stringify(value) })
  }

  send(value) {
    this.sent.push(JSON.parse(value))
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }
}

describe('Project Studio WebSocket 续传', () => {
  it('连接和重连使用 Project 全局 after_sequence', () => {
    const client = createWsClient({
      url: 'ws://fixture/ws/studio',
      initialAfterSequence: 10,
      socketImpl: FakeSocket
    })
    client.connect()
    FakeSocket.latest.open()
    expect(FakeSocket.latest.sent).toContainEqual({ type: 'sync', after_sequence: 10 })

    FakeSocket.latest.emit({ id: 'evt-11', sequence: 11, type: 'run.running' })
    expect(client.lastSequence).toBe(11)
    client.disconnect()
  })
})
