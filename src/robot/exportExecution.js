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

import { getArtifact } from '@/api/chat'

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  )
const dataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsDataURL(blob)
  })

const credentialKey =
  /^(?:authorization|proxy_authorization|cookie|set_cookie|password|passwd|secret|client_secret|api_key|apikey|access_token|refresh_token|id_token|private_key)$/iu
export function redactExecutionRecord(value) {
  if (Array.isArray(value)) return value.map(redactExecutionRecord)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        credentialKey.test(key.replaceAll('-', '_')) ? '[已脱敏]' : redactExecutionRecord(item)
      ])
    )
  if (typeof value !== 'string') return value
  return value
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_.~-]+/giu, 'Bearer [已脱敏]')
    .replace(
      /((?:api[-_]?key|access_token|refresh_token|password|passwd|client_secret)["']?\s*[:=]\s*["']?)[^\s"'&,;<>]+/giu,
      '$1[已脱敏]'
    )
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
      '[私钥已脱敏]'
    )
}

// 单文件报告包含当次已读取原文和鉴权下载的证据本体，可离线查看。
export async function createExecutionExport(records, artifacts = []) {
  const missing = [...(records.missing || [])]
  const attachments = []
  for (const artifact of artifacts) {
    try {
      let blob = await getArtifact(artifact.id)
      if (/^(text\/|application\/json)/u.test(blob.type) && typeof blob.text === 'function') {
        const content = await blob.text()
        let redacted
        try {
          redacted = JSON.stringify(redactExecutionRecord(JSON.parse(content)), null, 2)
        } catch {
          redacted = redactExecutionRecord(content)
        }
        blob = new Blob([redacted], { type: blob.type })
      }
      attachments.push({
        ...redactExecutionRecord(artifact),
        media_type: artifact.media_type || blob.type,
        data: await dataUrl(blob)
      })
    } catch (error) {
      missing.push(`Artifact ${artifact.id}：${error.message || '文件读取失败'}`)
    }
  }
  const manifest = redactExecutionRecord({
    ...records,
    exported_at: new Date().toISOString(),
    missing,
    artifacts: artifacts.map((item) => ({
      ...item,
      included: attachments.some((value) => value.id === item.id)
    }))
  })
  const json = JSON.stringify(manifest, null, 2)
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Studio 运行记录</title><style>body{font:14px/1.6 system-ui;max-width:1100px;margin:30px auto;padding:0 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f6;padding:16px}img{max-width:100%;max-height:500px}figure{margin:20px 0}</style><h1>Studio 运行记录与证据</h1><p>范围：${escapeHtml(manifest.scope_label || manifest.scope?.id || '')}。导出时已读取的 Execution、阶段、事件和关联 Trace；缺项列在记录中。常见凭据字段已脱敏，图像和二进制附件保持原样。</p>${attachments.map((item) => `<figure>${item.media_type?.startsWith('image/') ? `<img src="${escapeHtml(item.data)}" alt="${escapeHtml(item.summary || item.id)}">` : ''}<figcaption>${escapeHtml(item.stage || '')} · ${escapeHtml(item.captured_at || '采集时间未上报')} · <a download="${escapeHtml(item.id)}" href="${escapeHtml(item.data)}">${escapeHtml(item.summary || item.id)}</a></figcaption></figure>`).join('')}<h2>记录原文</h2><pre>${escapeHtml(json)}</pre></html>`
  return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), manifest }
}
