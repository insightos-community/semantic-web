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
