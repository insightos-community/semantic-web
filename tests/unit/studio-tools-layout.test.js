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
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sanitizeShell, useLayoutStore } from '@/stores/layout'
import { supportsInspector } from '@/studio/inspector'

describe('Studio 组件 Tab 与 Inspector 选择', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  it('后台同步只更新可用 Inspector，不抢对话或改变底部', () => {
    const layout = useLayoutStore()
    layout.select({ resourceType: 'simulation_object', resourceId: 'tote-1' })
    expect(layout.inspectorAvailable).toBe(true)
    expect(layout.shell.secondaryTab).toBe('conversation')
    expect(layout.shell.bottomVisible).toBe(false)
    layout.updateShell({ secondaryTab: 'inspector' })
    layout.select({ resourceType: 'simulation_object', resourceId: 'tote-2' })
    expect(layout.shell.secondaryTab).toBe('inspector')
    expect(layout.selectedResource.resourceId).toBe('tote-2')
  })
  it('主动查看对象自动展开 Inspector，重复点击同一对象也会重新显示', () => {
    const layout = useLayoutStore()
    layout.updateShell({ secondaryVisible: false })
    layout.select({ resourceType: 'simulation_object', resourceId: 'tote-1' })
    layout.revealInspector()
    expect(layout.shell.secondaryVisible).toBe(true)
    expect(layout.shell.secondaryTab).toBe('inspector')
    expect(layout.shell.bottomVisible).toBe(false)
    layout.closeInspector()
    layout.select({ resourceType: 'simulation_object', resourceId: 'tote-1' })
    layout.revealInspector()
    expect(layout.inspectorAvailable).toBe(true)
    expect(layout.shell.secondaryTab).toBe('inspector')
  })
  it('无属性对象或取消选择关闭 Inspector，回到对话', () => {
    const layout = useLayoutStore()
    for (const next of [null, { resourceType: 'agents', resourceId: 'list' }]) {
      layout.select({ resourceType: 'trace', resourceId: 'trace-1' })
      layout.revealInspector(true)
      layout.select(next)
      expect(layout.inspectorAvailable).toBe(false)
      expect(layout.shell.secondaryTab).toBe('conversation')
    }
    expect(supportsInspector({ resourceType: 'robot', resourceId: '' })).toBe(false)
  })
  it('手动关闭后同一对象的刷新不重开，选择新对象再出现', () => {
    const layout = useLayoutStore()
    layout.select({ resourceType: 'trace', resourceId: 'trace-1' })
    layout.closeInspector()
    layout.select({ resourceType: 'trace', resourceId: 'trace-1', title: '更新' })
    expect(layout.inspectorAvailable).toBe(false)
    layout.select({ resourceType: 'trace', resourceId: 'trace-2' })
    expect(layout.inspectorAvailable).toBe(true)
  })
  it('旧底部详情布局迁移为收起底部，保存对话位置与组件选择', () => {
    expect(sanitizeShell({ bottomVisible: true, bottomTab: 'inspector' })).toMatchObject({
      bottomVisible: false,
      bottomTab: 'activity'
    })
    expect(
      sanitizeShell({
        conversationLocation: 'editor',
        secondaryTab: 'inspector',
        conversationOpen: false
      })
    ).toMatchObject({
      conversationLocation: 'editor',
      secondaryTab: 'inspector',
      conversationOpen: false
    })
    expect(sanitizeShell({}, 'focus').conversationLocation).toBe('editor')
  })

  it('恢复旧入口时合并到项目与场景，保留现有区域尺寸', () => {
    expect(sanitizeShell({ primaryView: 'conversation', primaryWidth: 300 })).toMatchObject({
      primaryView: 'explorer',
      primaryWidth: 300
    })
    expect(sanitizeShell({ primaryView: 'map' }).primaryView).toBe('scene')
    expect(sanitizeShell({ primaryView: 'simulation' }).primaryView).toBe('scene')
    expect(sanitizeShell({ primaryView: 'scene' }).primaryView).toBe('scene')
  })
})
