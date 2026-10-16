<template>
  <div v-if="active" ref="root" class="pilot-map-source" data-testid="pilot-map-source">
    <label>
      地图来源 Pilot
      <select
        aria-label="地图来源 Pilot"
        :value="selected"
        :disabled="busy"
        @change="select($event.target.value)"
      >
        <option value="">不自动同步</option>
        <option
          v-for="source in sources"
          :key="source.pilot_id"
          :value="source.pilot_id"
          :disabled="!source.available"
        >
          {{ source.name || source.robot_id }} · {{ source.pilot_id }} ·
          {{ source.online ? '在线' : '离线' }}{{ source.available ? '' : ' · 等待地图' }}
        </option>
        <option v-if="selected && !current" :value="selected" disabled>
          {{ selected }} · 来源不可用
        </option>
      </select>
    </label>
    <button type="button" :disabled="busy" @click="refresh(true)">刷新来源</button>
    <label v-if="twinAvailable" class="twin-layer-control">
      <b>孪生场景</b>
      <input
        :checked="showCloud"
        type="checkbox"
        aria-label="显示点云"
        @change="setCloud($event.target.checked)"
      />
      显示点云
    </label>
    <span role="status">{{ busy ? '正在同步…' : status }}</span>
    <small v-if="current?.service_url">地图服务：{{ current.service_url }}</small>
    <small v-if="binding?.synced_at && selected"
      >最近同步：{{ new Date(binding.synced_at).toLocaleString() }}</small
    >
    <small>选择后持续同步；更换来源会保留旧地图版本。停止同步会保留当前地图。</small>
    <p v-if="error || binding?.last_error" role="alert">{{ error || binding.last_error }}</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import request from '@/api/request'

const props = defineProps({
  projectId: { type: String, required: true },
  active: Boolean,
  twinAvailable: Boolean
})
const emit = defineEmits(['synced', 'display'])
const root = ref(null)
const showCloud = ref(false)
const sources = ref([])
const binding = ref(null)
const busy = ref(false)
const error = ref('')
const selected = computed(() => binding.value?.pilot_id || '')
const current = computed(() => sources.value.find((source) => source.pilot_id === selected.value))
const status = computed(() => {
  if (!selected.value) return '选择 Pilot，获取它提供的地图'
  if (!current.value) return '地图来源不可用，保留最近地图'
  if (!current.value.online) return 'Pilot 离线，显示最近同步的地图'
  if (binding.value.last_error) return '同步失败，等待重试'
  return '已连接，地图变化时自动同步'
})
function setCloud(value) {
  showCloud.value = value
  emit('display', value)
}
let sequence = 0
let timer
let reading = false

const endpoint = (projectId) => `/projects/${encodeURIComponent(projectId)}/maps/real_map`
async function refresh(reloadMap = false) {
  if (!props.active || !props.projectId || busy.value || reading) return
  const projectId = props.projectId
  const run = sequence
  reading = true
  try {
    const value = await request.get(endpoint(projectId) + '/sources')
    if (run !== sequence) return
    const changed =
      selected.value !== (value.binding?.pilot_id || '') ||
      binding.value?.source_revision !== value.binding?.source_revision
    sources.value = value.sources
    binding.value = value.binding
    error.value = ''
    if (reloadMap || changed) emit('synced')
  } catch (failure) {
    if (run === sequence) error.value = failure.message
  } finally {
    if (run === sequence) reading = false
  }
}

async function select(pilotId) {
  const projectId = props.projectId
  const run = ++sequence
  reading = false
  busy.value = true
  error.value = ''
  try {
    await request.put(endpoint(projectId) + '/source', { pilot_id: pilotId })
    if (run !== sequence) return
    emit('synced')
  } catch (failure) {
    if (run === sequence) error.value = failure.message
  } finally {
    if (run === sequence) {
      busy.value = false
      // Preserve a selection failure until the next explicit refresh.
      const message = error.value
      await refresh()
      if (run === sequence && message) error.value = message
    }
  }
}

watch(
  () => [props.projectId, props.active],
  () => {
    sequence++
    reading = false
    busy.value = false
    sources.value = []
    binding.value = null
    error.value = ''
    clearInterval(timer)
    if (!props.active || !props.projectId) return
    void refresh()
    timer = setInterval(() => {
      if (!document.hidden && root.value?.getClientRects().length) void refresh()
    }, 10000)
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  sequence++
  clearInterval(timer)
})
</script>

<style scoped>
.pilot-map-source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--sf-border);
  font-size: 12px;
}
label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
select {
  max-width: 480px;
  min-width: 220px;
}
select,
button {
  border: 1px solid var(--sf-border);
  border-radius: 5px;
  padding: 6px;
  background: var(--sf-bg-primary);
  color: inherit;
}
small {
  color: var(--sf-text-secondary);
}
p {
  width: 100%;
  margin: 0;
  color: #c44;
}
</style>
