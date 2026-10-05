<!--
Copyright 2026 InsightOS
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<template>
  <div class="camera-wall" :class="{ compact }">
    <article v-for="sensor in visualSensors" :key="sensor.sensor_id" class="camera-tile">
      <header>
        <span>{{ sensor.sensor_id }}</span>
        <span>{{ frames[sensor.sensor_id]?.status || 'offline' }}</span>
      </header>
      <canvas
        v-if="frames[sensor.sensor_id]?.depth"
        :ref="(element) => setDepthCanvas(sensor.sensor_id, element)"
        role="img"
        :aria-label="`${sensor.kind} 传感器画面`"
      />
      <img
        v-else-if="frames[sensor.sensor_id]?.url"
        :src="frames[sensor.sensor_id].url"
        :alt="`${sensor.kind} 传感器画面`"
      />
      <div v-else class="camera-empty">等待 {{ sensor.kind }} 数据…</div>
      <footer>
        <span>{{ sensorSummary(sensor) }}</span>
        <span>#{{ frames[sensor.sensor_id]?.metadata?.sequence || 0 }}</span>
        <span>{{ sensorDimensions(sensor) }}</span>
      </footer>
    </article>
    <article v-for="sensor in dataSensors" :key="sensor.sensor_id" class="camera-tile data-tile">
      <header>
        <span>{{ sensor.sensor_id }}</span
        ><span>{{ sensor.kind }}</span>
      </header>
      <pre>{{ frames[sensor.sensor_id]?.json || '等待传感器状态…' }}</pre>
    </article>
    <div v-if="!visualSensors.length && !dataSensors.length" class="wall-empty">
      选择并启动虚拟 Robot 后显示 RGB、Depth、Contact 和 Holding。
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useSimulationStore } from '@/stores/simulation'
import { decodeFloat32Depth, formatDepthRange } from '@/utils/depthFrame'
import { createSimulationFrameStream, simulationStreamUrl } from '@/utils/simulationFrame'
const props = defineProps({
  sensorIds: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false }
})

const store = useSimulationStore()
const session = useSessionStore()
const frames = reactive({})
const streams = new Map()
const depthCanvases = new Map()
const visualSensors = computed(() =>
  store.sensors.filter(
    (item) =>
      ['rgb', 'depth'].includes(item.kind) &&
      (!props.sensorIds.length || props.sensorIds.includes(item.sensor_id))
  )
)
const dataSensors = computed(() =>
  store.sensors.filter(
    (item) =>
      !['rgb', 'depth'].includes(item.kind) &&
      (!props.sensorIds.length || props.sensorIds.includes(item.sensor_id))
  )
)

function disposeSensor(sensorId) {
  streams.get(sensorId)?.close()
  streams.delete(sensorId)
  depthCanvases.delete(sensorId)
  if (frames[sensorId]?.url) URL.revokeObjectURL(frames[sensorId].url)
  delete frames[sensorId]
}

function disposeAll() {
  ;[...streams.keys()].forEach(disposeSensor)
}

function drawDepth(sensorId) {
  const depth = frames[sensorId]?.depth
  const canvas = depthCanvases.get(sensorId)
  if (!depth || !canvas) return
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持 Canvas 2D，无法显示深度画面')
  canvas.width = depth.width
  canvas.height = depth.height
  const image = context.createImageData(depth.width, depth.height)
  image.data.set(depth.rgba)
  context.putImageData(image, 0, 0)
}

function setDepthCanvas(sensorId, element) {
  if (!element) {
    depthCanvases.delete(sensorId)
    return
  }
  depthCanvases.set(sensorId, element)
  try {
    drawDepth(sensorId)
  } catch (error) {
    store.record('problem', `传感器 ${sensorId} 渲染失败`, error.message)
  }
}

function sensorDimensions(sensor) {
  const metadata = frames[sensor.sensor_id]?.metadata
  return `${metadata?.width || sensor.width || '-'}×${metadata?.height || sensor.height || '-'}`
}

function sensorSummary(sensor) {
  const entry = frames[sensor.sensor_id]
  if (entry?.depth) return `DEPTH · ${formatDepthRange(entry.depth)}`
  if (entry?.metadata?.encoding === 'png16-mm') return 'DEPTH · mm (PNG16)'
  return sensor.kind.toUpperCase()
}

function connectSensors() {
  disposeAll()
  if (!store.instance || !store.selectedRobotId || store.runtimeInterrupted) return
  for (const sensor of store.sensors) {
    // 连接标记不能依赖对象身份：Vue 会把 entry 包装成响应式代理。独立 token
    // 可以保证 reset 后旧 WebSocket 即使晚到一帧，也不会覆盖新 generation。
    const connectionToken = Symbol(sensor.sensor_id)
    const entry = {
      connectionToken,
      status: 'connecting',
      generation: store.instance.generation,
      lastSequence: 0,
      metadata: null,
      url: '',
      json: '',
      depth: null
    }
    frames[sensor.sensor_id] = entry
    const stream = createSimulationFrameStream({
      url: simulationStreamUrl('sensor', {
        project_id: store.projectId,
        instance_id: store.instance.instance_id,
        robot_id: store.selectedRobotId,
        sensor_id: sensor.sensor_id
      }),
      token: session.token,
      onStatus: (status) => {
        const current = frames[sensor.sensor_id]
        if (current?.connectionToken === connectionToken) current.status = status
      },
      onError: (error) =>
        store.record('problem', `传感器 ${sensor.sensor_id} 解码失败`, error.message),
      onFrame: ({ metadata, payload }) => {
        const entry = frames[sensor.sensor_id]
        if (!entry || entry.connectionToken !== connectionToken) return
        if (metadata.generation !== entry.generation) return
        if (metadata.sensor_id && metadata.sensor_id !== sensor.sensor_id) {
          throw new Error(`传感器 ID 不匹配：${metadata.sensor_id}`)
        }
        if (Number.isInteger(metadata.sequence) && metadata.sequence <= entry.lastSequence) return

        if (sensor.kind === 'depth' && metadata.encoding === 'float32-le') {
          const depth = decodeFloat32Depth(metadata, payload)
          if (entry.url) URL.revokeObjectURL(entry.url)
          entry.url = ''
          entry.depth = depth
          entry.json = ''
          entry.metadata = metadata
          entry.lastSequence = metadata.sequence || entry.lastSequence
          nextTick(() => {
            if (frames[sensor.sensor_id]?.connectionToken !== connectionToken) return
            try {
              drawDepth(sensor.sensor_id)
            } catch (error) {
              store.record('problem', `传感器 ${sensor.sensor_id} 渲染失败`, error.message)
            }
          })
          return
        }

        entry.metadata = metadata
        if (metadata.media_type?.startsWith('image/')) {
          const next = URL.createObjectURL(new Blob([payload], { type: metadata.media_type }))
          if (entry.url) URL.revokeObjectURL(entry.url)
          entry.url = next
          entry.depth = null
          entry.json = ''
        } else {
          entry.json = new TextDecoder().decode(payload)
        }
        entry.lastSequence = metadata.sequence || entry.lastSequence
      }
    })
    streams.set(sensor.sensor_id, stream)
    stream.connect()
  }
}

watch(
  () =>
    [
      store.instance?.instance_id,
      store.instance?.generation,
      store.selectedRobotId,
      store.runtimeInterrupted,
      store.sensors.map((item) => item.sensor_id).join('|')
    ].join('::'),
  connectSensors,
  { immediate: true }
)
onBeforeUnmount(disposeAll)
</script>

<style scoped lang="scss">
.camera-wall {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  align-content: start;
  gap: 10px;
  height: 100%;
  overflow: auto;
  padding: 10px;
  background: #0e1219;
}

.camera-tile {
  display: grid;
  grid-template-rows: 34px minmax(160px, 1fr) 28px;
  min-height: 250px;
  overflow: hidden;
  border: 1px solid #2d3747;
  border-radius: 8px;
  background: #080b10;
  color: #dbe1eb;
}

.camera-tile header,
.camera-tile footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 9px;
  background: #171d27;
  color: #9aa6b9;
  font-size: 11px;
}

.camera-tile img,
.camera-tile canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.camera-empty,
.wall-empty {
  display: grid;
  place-content: center;
  color: #78859a;
}

.data-tile pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: #a9d8b7;
  font:
    12px/1.6 ui-monospace,
    monospace;
}

.wall-empty {
  min-height: 240px;
  grid-column: 1 / -1;
}
</style>
