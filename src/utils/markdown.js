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

// Markdown 渲染管线（17-web-ui-design §6.1 流式输出）：
// markdown-it（GFM 近似：链接自动识别、换行即 <br>、禁用内联 HTML）
// → highlight.js 代码块高亮 → DOMPurify 白名单消毒。
// 安全纪律：消息 HTML 只允许经 renderMarkdown 产出，禁止 v-html 直出未消毒串。
import MarkdownIt from 'markdown-it'
// 只注册常用语言集（~40 种）：全量 highlight.js 会让 ChatView chunk 多约 300KB
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false, // 源文本中的 HTML 一律按文本转义（XSS 第一道闸）
  linkify: true,
  breaks: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch {
        // 高亮失败回退为纯文本转义（下方 markdown-it 默认处理）
      }
    }
    return '' // markdown-it 对空返回做默认转义
  }
})

// DOMPurify 白名单（第二道闸）：只放排版与代码高亮所需标签；
// class 服务于 hljs token 类名。因 markdown-it 已禁内联 HTML，
// 源文本中的标签根本到不了这里，白名单主要防高亮器异常输出。
export function renderMarkdown(text) {
  const raw = md.render(text || '')
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ['class', 'href']
  })
}
