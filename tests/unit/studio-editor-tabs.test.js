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
import {
  closeableTabs,
  editorTabMode,
  persistentEditorLayout,
  replaceablePreview
} from '@/studio/editorTabs'

describe('Studio 编辑器生命周期', () => {
  it('资源单击预览，现场保留，用户可以保留或置顶', () => {
    expect(editorTabMode('workflow-run', { resourceId: 'wf-1' })).toBe('preview')
    expect(editorTabMode('scene-workspace')).toBe('kept')
    expect(editorTabMode('trace', { preview: false })).toBe('kept')
    expect(editorTabMode('trace', { tabMode: 'pinned' })).toBe('pinned')
  })

  it('替换预览不关闭未保存页面，批量关闭保留置顶页面', () => {
    const panels = [
      { id: 'edited', params: { tabMode: 'preview' } },
      { id: 'pinned', params: { tabMode: 'pinned' } },
      { id: 'preview', params: { tabMode: 'preview' } }
    ]
    expect(replaceablePreview(panels, (id) => id === 'edited')?.id).toBe('preview')
    expect(closeableTabs(panels).map((panel) => panel.id)).toEqual(['edited', 'preview'])
  })

  it('场景是固定工作页，批量关闭始终保留', () => {
    const panels = [
      { id: 'scene', params: { panelType: 'scene-workspace', tabMode: 'kept' } },
      { id: 'history', params: { panelType: 'workflow-run', tabMode: 'kept' } }
    ]
    expect(closeableTabs(panels).map((panel) => panel.id)).toEqual(['history'])
  })

  it('保存布局排除预览、清理空组，保留分屏和固定历史的身份', () => {
    const source = {
      panels: {
        scene: { params: { panelType: 'scene-workspace', tabMode: 'kept' } },
        history: { params: { panelType: 'workflow-run', resourceId: 'wf-old', tabMode: 'pinned' } },
        preview: { params: { panelType: 'trace', tabMode: 'preview' } }
      },
      activeGroup: 'empty',
      grid: {
        root: {
          type: 'branch',
          data: [
            {
              type: 'leaf',
              data: { id: 'main', views: ['scene', 'preview'], activeView: 'preview' }
            },
            { type: 'leaf', data: { id: 'empty', views: ['preview'], activeView: 'preview' } },
            { type: 'leaf', data: { id: 'side', views: ['history'], activeView: 'history' } }
          ]
        }
      },
      floatingGroups: [
        { data: { id: 'floating', views: ['preview'], activeView: 'preview' }, position: {} }
      ]
    }
    const saved = persistentEditorLayout(source)
    expect(Object.keys(saved.panels)).toEqual(['scene', 'history'])
    expect(saved.grid.root.data).toHaveLength(2)
    expect(saved.grid.root.data[0].data.activeView).toBe('scene')
    expect(saved.activeGroup).toBe('main')
    expect(saved.floatingGroups).toEqual([])
    expect(saved.panels.history.params.resourceId).toBe('wf-old')
    expect(source.grid.root.data).toHaveLength(3)
  })

  it('主区域为空时仍保存浮动窗口中的保留页', () => {
    const saved = persistentEditorLayout({
      panels: {
        preview: { params: { tabMode: 'preview' } },
        kept: { params: { tabMode: 'kept' } }
      },
      grid: {
        root: {
          type: 'branch',
          data: [{ type: 'leaf', data: { id: 'main', views: ['preview'] } }]
        },
        width: 1000,
        height: 600
      },
      floatingGroups: [{ data: { id: 'floating', views: ['kept'], activeView: 'kept' } }]
    })
    expect(saved.grid.root).toEqual({ type: 'branch', data: [] })
    expect(saved.floatingGroups[0].data.views).toEqual(['kept'])
    expect(saved.activeGroup).toBe('floating')
  })
})
