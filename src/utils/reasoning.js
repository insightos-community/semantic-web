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

// stripEmbeddedThinkBlocks 清理旧消息或异常 Provider 最终正文中的完整
// <think>...</think> 片段。新消息应由 Framework 在 AgentTool 边界净化；
// 前端保留这层兼容处理，使修复前已经落库的委派记录刷新后也不再泄漏思考。
export function stripEmbeddedThinkBlocks(value) {
  const text = typeof value === 'string' ? value : ''
  let cursor = 0
  let visible = ''
  while (cursor < text.length) {
    const open = text.indexOf('<think>', cursor)
    if (open < 0) {
      visible += text.slice(cursor)
      break
    }
    visible += text.slice(cursor, open)
    const close = text.indexOf('</think>', open + '<think>'.length)
    if (close < 0) {
      // 未闭合思考标签后的归属无法可靠判断；隐藏剩余部分比把内部推理
      // 当作用户可见答案展示更安全，Trace 中仍保留 Provider 原始响应。
      break
    }
    cursor = close + '</think>'.length
  }
  return visible
}
