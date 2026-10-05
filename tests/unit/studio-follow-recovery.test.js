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

// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import ReasoningText from '@/components/chat/ReasoningText.vue'
import { executionProblems, recordLevel } from '@/robot/executionRecords'
import { createPinia, setActivePinia } from 'pinia'
import { useDeviceStore } from '@/stores/device'
import { useChatStore } from '@/stores/chat'
import { fromRest, reconcileMessages } from '@/stores/chatModel'

let app
it('keeps a streamed bubble before the question it raised, including history reconciliation', () => {
  setActivePinia(createPinia())
  const chat = useChatStore()
  chat.refreshTail = async () => {}
  const env = (type, ts, payload) => ({
    id: 'evt-final',
    session_id: 's',
    type,
    ts,
    agent: { id: 'leader' },
    payload: { run_id: 'r', ...payload }
  })
  chat.applyDialogue(env('reasoning.delta', '2026-09-08T02:25:50Z', { text: 'start' }))
  chat.applyDialogue(env('message.delta', '2026-09-08T02:26:38Z', { text: 'answer' }))
  expect(chat._bucket('s').list[0].ts).toBe('2026-09-08T02:25:50Z')
  chat.applyDialogue(env('message.done', '2026-09-08T02:26:39Z', { text: 'answer' }))
  expect(chat._bucket('s').list[0].ts).toBe('2026-09-08T02:25:50Z')
  const history = fromRest({
    id: 'msg-1',
    role: 'assistant',
    run_id: 'r',
    content: 'answer',
    created_at: '2026-09-08T02:26:39Z',
    started_at: '2026-09-08T02:25:49Z'
  })
  const question = { id: 'int-1', role: 'assistant', ts: '2026-09-08T02:26:37Z' }
  expect(reconcileMessages([question], [history]).map((row) => row.id)).toEqual(['msg-1', 'int-1'])
  expect(
    fromRest({
      role: 'assistant',
      created_at: question.ts,
      started_at: history.ts,
      metadata: { system_activity: true }
    }).ts
  ).toBe(question.ts)
})
it('replaces only the corrected run summary, preserving other Agent output', () => {
  setActivePinia(createPinia())
  const chat = useChatStore()
  const delta = (run, text, reset = false) =>
    chat.applyDialogue({
      session_id: 's',
      type: 'message.delta',
      agent: { id: 'robot:r1', role: 'worker' },
      payload: { run_id: run, text, reset }
    })
  delta('first', '旧摘要')
  delta('second', '其他任务')
  delta('first', '新摘要', true)
  expect(chat._bucket('s').list.find((item) => item.runId === 'first').text).toBe('新摘要')
  expect(chat._bucket('s').list.find((item) => item.runId === 'second').text).toBe('其他任务')
})
afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})
it('follows reasoning at bottom but preserves manual scroll-up', async () => {
  const text = ref('first')
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(ReasoningText, { text: text.value }) })
  app.mount(host)
  const pre = host.querySelector('pre')
  let height = 100
  Object.defineProperty(pre, 'scrollHeight', { get: () => height })
  Object.defineProperty(pre, 'clientHeight', { get: () => 40 })
  pre.scrollTop = 60
  pre.dispatchEvent(new Event('scroll'))
  height = 200
  text.value += 'next'
  await nextTick()
  expect(pre.scrollTop).toBe(200)
  pre.scrollTop = 10
  pre.dispatchEvent(new Event('scroll'))
  height = 300
  text.value += 'more'
  await nextTick()
  expect(pre.scrollTop).toBe(10)
})

const event = (sequence, type, payload = {}) => ({
  sequence,
  type,
  payload: { stage: 'lift_and_verify', ...payload }
})
it('shows a deviation awaiting Agent decision and does not treat a reply as recovery', () => {
  const execution = { id: 'e', status: 'waiting_agent', workflow_id: 'w', task_id: 't' }
  const decision = event(1, 'decision.required', {
    summary: '第二侧接近失败',
    deviation: '接近失败'
  })
  const reply = event(2, 'agent.resolved')
  const problem = (status, events) =>
    executionProblems([{ ...execution, status }], () => events).find(
      (row) => row.type === 'decision.required'
    )
  expect(problem('waiting_agent', [decision])).toMatchObject({
    level: 'warning',
    resolution: 'waiting_agent',
    taskId: 't'
  })
  expect(problem('running', [decision, reply]).resolution).toBe('unknown')
  expect(problem('completed', [decision, reply, event(3, 'stage.completed')]).resolution).toBe(
    'recovered'
  )
  expect(problem('stopping', [decision]).resolution).toBe('stopping')
  expect(problem('stopped', [decision]).resolution).toBe('stopped')
  expect(recordLevel(event(1, 'decision.required'))).toBe('info')
  expect(recordLevel(event(1, 'feedback.emitted', { feedback: { severity: 'warning' } }))).toBe(
    'warning'
  )
})

it('keeps unconfirmed stop visible without inventing a successful terminal', () => {
  const execution = { id: 'e', status: 'stopping', stage: 'grasp' }
  expect(executionProblems([execution], () => [])).toEqual([
    expect.objectContaining({
      executionId: 'e',
      stage: 'grasp',
      resolution: 'stopping',
      level: 'warning'
    })
  ])
  expect(executionProblems([{ ...execution, status: 'stopped' }], () => [])).toEqual([])
  expect(recordLevel(event(1, 'skill.stop.finalized', { status: 'interrupted' }))).toBe('error')
})
it('correlates an actual recovered attempt and independent stage verification', () => {
  const execution = {
    id: 'e',
    workflow_id: 'w',
    task_id: 't',
    subtask_id: 's',
    status: 'completed'
  }
  const failure = event(1, 'action.terminal', {
    action_type: 'lift',
    status: 'failed',
    error: { message: 'unstable' }
  })
  const recovery = event(2, 'stage.recovering', { summary: 're-established contact' })
  const retry = event(3, 'action.terminal', { action_type: 'lift', status: 'succeeded' })
  const complete = event(4, 'stage.completed', { summary: 'independently verified' })
  const problem = (events) => executionProblems([execution], () => events)[0]
  expect(problem([failure]).resolution).toBe('unknown')
  expect(problem([failure, complete]).resolution).toBe('unknown')
  expect(problem([failure, recovery, retry]).resolution).toBe('recovering')
  expect(problem([failure, recovery, retry, complete])).toMatchObject({
    resolution: 'recovered',
    taskId: 't',
    workflowId: 'w'
  })
  expect(
    problem([
      failure,
      { ...recovery, payload: { ...recovery.payload, stage: 'other' } },
      retry,
      complete
    ]).resolution
  ).toBe('unknown')
})

it('initial connection after snapshot is not a stale device state', () => {
  setActivePinia(createPinia())
  const devices = useDeviceStore()
  devices.hydrate({ robots: [], event_sequence: 1 })
  devices.setConnectionStatus('connecting')
  devices.setConnectionStatus('online')
  expect(devices.stale).toBe(false)
  devices.setConnectionStatus('offline')
  expect(devices.stale).toBe(true)
})
