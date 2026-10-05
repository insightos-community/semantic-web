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
// ApprovalCard 渲染冒烟（jsdom 挂载真实组件）：pending 显示问题/risk 徽标/
// 倒计时/按钮；resolved 显示结果徽标；本地倒计时耗尽置灰（不判超时）。
// 队列与对账逻辑由 interaction-store.test.js 保证。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

import ApprovalCard from '@/components/chat/ApprovalCard.vue'
import { useChatStore } from '@/stores/chat'
import { useInteractionsStore } from '@/stores/interactions'
import {
  clearStudioCommandTransport,
  setStudioCommandTransport
} from '@/studio/commandGateway'

const apps = []

function mountCard(interaction) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const pinia = createPinia()
  setActivePinia(pinia)
  const app = createApp(ApprovalCard, { interaction })
  app.use(pinia)
  app.use(ElementPlus)
  app.mount(el)
  apps.push(app)
  return { app, el }
}

const rec = (over = {}) => ({
  id: 'int-1',
  sessionId: 'cs-1',
  kind: 'confirm',
  question: '是否批准执行 artifact.put（风险等级：high）？',
  risk: 'high',
  timeoutTs: Math.floor(Date.now() / 1000) + 300,
  agentName: 'leader',
  ts: '2026-08-03T10:00:05.000Z',
  status: 'pending',
  result: '',
  repliedAt: 0,
  ...over
})

describe('ApprovalCard · 渲染冒烟', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    clearStudioCommandTransport()
  })
  afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
  })

  it('pending：问题文本 + high 风险徽标 + 倒计时 + 批准/拒绝按钮可用', () => {
    const { el } = mountCard(rec())
    expect(el.textContent).toContain('是否批准执行 artifact.put（风险等级：high）？')
    expect(el.textContent).toContain('风险 高')
    expect(el.textContent).toContain('剩余')
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent.trim())).toEqual(['批准', '拒绝'])
    expect(buttons.every((b) => !b.disabled)).toBe(true)
  })

  it('replied(approved)：显示"已批准"徽标，不再显示按钮', () => {
    const { el } = mountCard(rec({ status: 'resolved', result: 'approved' }))
    expect(el.textContent).toContain('已批准')
    expect(el.querySelectorAll('button')).toHaveLength(0)
  })

  it('resolved(expired)：显示"已超时"徽标', () => {
    const { el } = mountCard(rec({ status: 'resolved', result: 'expired' }))
    expect(el.textContent).toContain('已超时')
    expect(el.querySelectorAll('button')).toHaveLength(0)
  })

  it('resolved(rejected)：显示"已拒绝"徽标', () => {
    const { el } = mountCard(rec({ status: 'resolved', result: 'rejected' }))
    expect(el.textContent).toContain('已拒绝')
  })

  it('pending 且本地倒计时耗尽：按钮置灰并提示已超时（卡片仍在队列等对账）', () => {
    const { el } = mountCard(rec({ timeoutTs: Math.floor(Date.now() / 1000) - 1 }))
    expect(el.textContent).toContain('已超时')
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.length).toBe(2)
    expect(buttons.every((b) => b.disabled)).toBe(true)
  })

  it('点击批准：调用 store.replyInteraction(id, true)', async () => {
    const { el } = mountCard(rec())
    const chat = useChatStore()
    const spy = vi.spyOn(chat, 'replyInteraction').mockReturnValue(true)
    const [approve] = [...el.querySelectorAll('button')]
    approve.click()
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith('int-1', true)
    })
  })

  it('Studio Interaction 使用 Store submittingIds 禁止重复提交', async () => {
    const interaction = rec()
    const { el } = mountCard(interaction)
    const interactions = useInteractionsStore()
    interactions.hydrate('project-1', [
      { ...interaction, project_id: 'project-1', conversation_id: 'cs-1' }
    ])
    const send = vi.fn(() => true)
    setStudioCommandTransport(send)
    const [approve, reject] = [...el.querySelectorAll('button')]

    approve.click()
    await vi.waitFor(() => expect(interactions.isSubmitting('int-1')).toBe(true))
    expect(el.textContent).toContain('提交中，等待 Server 确认')
    expect(approve.disabled).toBe(true)
    expect(reject.disabled).toBe(true)
    reject.click()
    expect(send).toHaveBeenCalledTimes(1)
  })
})
