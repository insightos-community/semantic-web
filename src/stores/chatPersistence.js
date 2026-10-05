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

// 对话历史的 REST 分页与本地时间线对账。函数作为 Pinia action 安装，
// 通过 this 访问 store；网络职责与实时 WS 归并职责保持分离。
import * as chatApi from '@/api/chat'
import { fromRest, PAGE_SIZE, reconcileMessages } from '@/stores/chatModel'

export async function fetchLastPage(sid) {
  const first = await chatApi.listMessages(sid, { page: 1, pageSize: PAGE_SIZE })
  const total = first?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  let rows = Array.isArray(first?.messages) ? first.messages : []
  if (lastPage > 1) {
    const tail = await chatApi.listMessages(sid, { page: lastPage, pageSize: PAGE_SIZE })
    rows = Array.isArray(tail?.messages) ? tail.messages : []
  }
  return { rows: rows.map(fromRest), total, lastPage }
}

export async function loadMessages(sid = this.currentSessionId) {
  const bucket = this._bucket(sid)
  const { rows, total, lastPage } = await this._fetchLastPage(sid)
  bucket.list = reconcileMessages(bucket.loaded ? bucket.list : [], rows)
  bucket.total = total
  bucket.earliestPage = lastPage
  bucket.loaded = true
  return bucket.list
}

export async function loadEarlierMessages() {
  const sid = this.currentSessionId
  if (!sid) return 0
  const bucket = this._bucket(sid)
  if (!bucket.loaded || bucket.earliestPage <= 1 || bucket.loadingEarlier) return 0
  bucket.loadingEarlier = true
  try {
    const page = bucket.earliestPage - 1
    const data = await chatApi.listMessages(sid, { page, pageSize: PAGE_SIZE })
    const rows = (Array.isArray(data?.messages) ? data.messages : []).map(fromRest)
    bucket.list = reconcileMessages(bucket.list, rows)
    bucket.earliestPage = page
    return rows.length
  } finally {
    bucket.loadingEarlier = false
  }
}

export async function refreshTail(sid) {
  const bucket = this.messagesBySession[sid]
  if (!bucket?.loaded) return
  const { rows, total } = await this._fetchLastPage(sid)
  bucket.total = total
  bucket.list = reconcileMessages(bucket.list, rows)
}
