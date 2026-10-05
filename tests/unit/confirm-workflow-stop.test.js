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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'
import { confirmWorkflowStop } from '@/studio/confirmWorkflowStop'

afterEach(() => vi.restoreAllMocks())

describe('现场安全确认', () => {
  it.each(['cancel', 'close'])('用户 %s 时不调用终结 API', async (reason) => {
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue(reason)
    const workflow = { confirmStop: vi.fn() }
    const ui = { notify: vi.fn() }
    await confirmWorkflowStop(workflow, ui, 'wf-1', [])
    expect(workflow.confirmStop).not.toHaveBeenCalled()
    expect(ui.notify).not.toHaveBeenCalled()
  })

  it('显示弹窗错误，不再当作用户取消静默吞掉', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue(new Error('弹窗失败'))
    const workflow = { confirmStop: vi.fn() }
    const ui = { notify: vi.fn() }
    await confirmWorkflowStop(workflow, ui, 'wf-1', [])
    expect(workflow.confirmStop).not.toHaveBeenCalled()
    expect(ui.notify).toHaveBeenCalledWith({ type: 'error', message: '弹窗失败' })
  })

  it('原因不可为空，并显示后端终结失败', async () => {
    const prompt = vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: ' ' })
    const workflow = { confirmStop: vi.fn().mockRejectedValue(new Error('终结失败')) }
    const ui = { notify: vi.fn() }
    await confirmWorkflowStop(workflow, ui, 'wf-1', [])
    expect(workflow.confirmStop).not.toHaveBeenCalled()
    const validator = prompt.mock.calls[0][2].inputValidator
    expect(validator('')).not.toBe(true)
    expect(validator('现场已确认')).toBe(true)
    prompt.mockResolvedValue({ value: '现场已确认' })
    await confirmWorkflowStop(workflow, ui, 'wf-1', [])
    expect(ui.notify).toHaveBeenCalledWith({ type: 'error', message: '终结失败' })
  })
})
