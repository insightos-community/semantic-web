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

// 组件健康轮询（GET /system/healthz，30s）：AppShell 顶栏健康点数据源。
// 返回 { health, healthTitle }；挂载即查一次并起定时器，卸载清理。
// health.status 直接取状态四元组名（success/danger/stopped），供 .sf-status-dot 消费。
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { getHealthz } from '@/api/system'

const POLL_INTERVAL = 30000

export function useHealth() {
  const health = reactive({ status: 'stopped', text: '--' })
  let timer = null

  async function poll() {
    try {
      const data = await getHealthz()
      health.status = data?.status === 'ok' ? 'success' : 'danger'
      health.text = data?.status === 'ok' ? '正常' : '异常'
    } catch {
      health.status = 'danger'
      health.text = '不可达'
    }
  }

  const healthTitle = computed(
    () => `GET /api/v1/system/healthz · 每 30s 轮询 · 当前：${health.text}`
  )

  onMounted(() => {
    poll()
    timer = setInterval(poll, POLL_INTERVAL)
  })

  onBeforeUnmount(() => {
    clearInterval(timer)
    timer = null
  })

  return { health, healthTitle }
}
