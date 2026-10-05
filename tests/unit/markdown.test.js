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
// markdown 渲染管线（utils/markdown.js）：DOMPurify 消毒 + 代码高亮。
// jsdom 环境：DOMPurify 需要真实 window 才真正过滤（node 裸环境 isSupported=false）。
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/utils/markdown'

describe('renderMarkdown · XSS 过滤', () => {
  it('<script> 被剥除（markdown-it 禁内联 HTML + DOMPurify 双闸）', () => {
    const html = renderMarkdown('正常文本 <script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)</script>')
    expect(html).toContain('正常文本')
  })

  it('javascript: 协议链接不放行（不产出 <a>，href 攻击向量不存在）', () => {
    const html = renderMarkdown('[点我](javascript:alert(1))')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<a ')
  })

  it('事件处理器标签（img onerror / b onclick）不形成真实标签', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> <b onclick=alert(2)>x</b>')
    // 源文本中的标签只能以转义文本形式存在，绝不能成为真实元素
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b ')
    expect(html).toContain('&lt;img')
  })

  it('iframe/style 等危险标签被剥除', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>')
    expect(html).not.toContain('<iframe')
  })

  it('嵌套 svg+script payload 不形成可执行标记', () => {
    const html = renderMarkdown('<svg><script>alert(document.cookie)</script></svg>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<svg')
    // 只剩转义文本：浏览器不会解析为元素
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderMarkdown · 正常渲染', () => {
  it('代码块经 highlight.js 高亮（hljs 类名保留）', () => {
    const html = renderMarkdown('```js\nconst a = 1\n```')
    expect(html).toContain('hljs')
    expect(html).toContain('const')
  })

  it('行内代码与加粗/链接正常', () => {
    const html = renderMarkdown('用 `npm test` 跑 **全部** 用例，见 [文档](https://example.com)')
    expect(html).toContain('<code>npm test</code>')
    expect(html).toContain('<strong>全部</strong>')
    expect(html).toContain('href="https://example.com"')
  })

  it('空文本安全返回', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
  })
})
