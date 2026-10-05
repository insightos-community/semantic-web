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
import { createSimulationFrameStream, decodeSimulationFrame } from '@/utils/simulationFrame'

function packet(metadata, payload = new Uint8Array([1, 2, 3])) {
  const header = new TextEncoder().encode(JSON.stringify(metadata))
  const value = new Uint8Array(4 + header.length + payload.length)
  new DataView(value.buffer).setUint32(0, header.length, false)
  value.set(header, 4)
  value.set(payload, 4 + header.length)
  return value.buffer
}

describe('MuJoCo 二进制帧', () => {
  it('解码四字节大端头、JSON 元数据和二进制载荷', () => {
    const value = decodeSimulationFrame(
      packet({ stream: 'scene_pose', sequence: 7, scene_revision: 'r1', generation: 3 })
    )
    expect(value.metadata).toMatchObject({ stream: 'scene_pose', sequence: 7, generation: 3 })
    expect([...new Uint8Array(value.payload)]).toEqual([1, 2, 3])
  })

  it('拒绝截断或伪造长度的帧', () => {
    expect(() => decodeSimulationFrame(new Uint8Array([0, 0, 0, 9, 1]).buffer)).toThrow(
      '仿真帧头长度无效'
    )
    expect(() => decodeSimulationFrame(new ArrayBuffer(2))).toThrow('仿真帧数据不完整')
  })

  it('消费跟不上时只交付最新帧，主动关闭后不会留下在线状态', async () => {
    class FakeSocket {
      constructor() {
        FakeSocket.instance = this
      }

      close() {
        this.onclose?.({ code: 1000 })
      }
    }

    const received = []
    const statuses = []
    const stream = createSimulationFrameStream({
      url: 'ws://example.test/frames',
      socketImpl: FakeSocket,
      onFrame: (frame) => received.push(frame.metadata.sequence),
      onStatus: (status) => statuses.push(status)
    })

    stream.connect()
    FakeSocket.instance.onopen()
    FakeSocket.instance.onmessage({ data: packet({ sequence: 1 }) })
    FakeSocket.instance.onmessage({ data: packet({ sequence: 2 }) })
    await Promise.resolve()

    expect(received).toEqual([2])
    stream.close()
    expect(statuses).toEqual(['connecting', 'online', 'offline', 'offline'])
  })
})
