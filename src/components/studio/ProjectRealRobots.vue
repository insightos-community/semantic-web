<template>
  <section class="project-real-robots" data-testid="project-real-robots">
    <header>
      <div>
        <h3>项目实机</h3>
        <p>添加已通过 Pilot 接入的机器人，供当前项目查询技能和编排任务。</p>
      </div>
      <button type="button" :disabled="busy || loading" @click="load">刷新机器人</button>
    </header>
    <p v-if="loading" role="status">正在读取机器人目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="connect-row">
      <label for="real-robot-select">选择已接入的机器人</label>
      <select
        id="real-robot-select"
        aria-label="选择已接入的机器人"
        :value="selected"
        :disabled="busy || loading"
        @change="selected = $event.target.value"
      >
        <option value="">请选择机器人</option>
        <option v-for="robot in available" :key="robot.robot_id" :value="robot.robot_id">
          {{ robot.display_name || robot.robot_id }} · {{ robot.robot_id }} ·
          {{ robot.pilot?.status === 'online' ? '在线' : '离线' }}
        </option>
      </select>
      <button
        type="button"
        :disabled="!selected || busy || loading"
        @click="change(selected, true)"
      >
        添加到项目
      </button>
      <a href="/devices" target="_blank" rel="noopener">接入新的 Pilot</a>
    </div>
    <p v-if="!loading && !robots.length" class="empty">
      尚未添加实机。选择机器人后，Agent 即可读取该实例的 Robot Skill 清单。
    </p>
    <article v-for="robot in robots" :key="robot.robot_id" class="robot-card">
      <header>
        <div>
          <h4>{{ robot.display_name || robot.robot_id }}</h4>
          <small>{{ robot.robot_id }} · {{ robot.model }} · Pilot 接入</small>
        </div>
        <span>{{ robot.pilot?.status === 'online' ? '在线' : '离线（最近上报目录）' }}</span>
        <button
          v-if="!robot.managed"
          type="button"
          :disabled="busy"
          :aria-label="`从项目移除 ${robot.display_name || robot.robot_id}`"
          @click="change(robot.robot_id, false)"
        >
          从项目移除
        </button>
      </header>
      <details>
        <summary>
          Robot Skill：{{
            robot.skills.filter((skill) => skill.enabled && skill.status === 'installed').length
          }}
          / {{ robot.skills.length }} 已启用
        </summary>
        <table>
          <thead>
            <tr>
              <th>技能</th>
              <th>版本</th>
              <th>用途</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="skill in robot.skills" :key="`${skill.name}@${skill.version}`">
              <td>{{ skill.name }}</td>
              <td>{{ skill.version }}</td>
              <td>{{ skill.description }}</td>
              <td>{{ skill.enabled && skill.status === 'installed' ? '已启用' : skill.status }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </article>
    <p class="hint">
      添加机器人用于建立项目关联。动作仍由调试操作或批准后的任务下发；移除关联不会停止 Pilot。
    </p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import request from '@/api/request'
import { useDeviceStore } from '@/stores/device'

const props = defineProps({ projectId: { type: String, required: true } })
const emit = defineEmits(['changed'])
const devices = useDeviceStore()
const catalog = ref({ robots: [], available_robots: [] })
const selected = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const robots = computed(() => catalog.value.robots.filter((robot) => robot.backend === 'real'))
const available = computed(() =>
  catalog.value.available_robots.filter((robot) => robot.backend === 'real')
)
const endpoint = (projectId) => `/projects/${encodeURIComponent(projectId)}/robots`
let sequence = 0
async function load() {
  if (!props.projectId || busy.value) return
  const run = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await request.get(endpoint(props.projectId))
    if (run === sequence) catalog.value = result
  } catch (failure) {
    if (run === sequence) error.value = failure.message
  } finally {
    if (run === sequence) loading.value = false
  }
}
async function change(robotId, added) {
  const projectId = props.projectId
  const run = ++sequence
  busy.value = true
  error.value = ''
  try {
    const url = `${endpoint(projectId)}/${encodeURIComponent(robotId)}`
    const result = await (added ? request.put(url, {}) : request.delete(url))
    if (run !== sequence) return
    catalog.value = result
    selected.value = ''
    emit('changed')
    await devices.loadSnapshot()
  } catch (failure) {
    if (run === sequence) error.value = failure.message
  } finally {
    if (run === sequence) busy.value = false
  }
}
watch(
  () => props.projectId,
  () => {
    sequence++
    busy.value = false
    selected.value = ''
    catalog.value = { robots: [], available_robots: [] }
    void load()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  sequence++
})
</script>

<style scoped>
.project-real-robots {
  margin: 24px 0;
}
header,
.connect-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
header > div {
  flex: 1;
}
h3,
h4 {
  margin: 0 0 8px;
}
p,
small {
  color: var(--sf-text-secondary);
  font-size: 13px;
}
.connect-row {
  margin: 16px 0;
}
select {
  max-width: 100%;
  min-width: 240px;
}
button,
select {
  padding: 8px 12px;
  border: 1px solid var(--sf-border);
  border-radius: 6px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
a {
  color: var(--sf-primary);
}
.robot-card {
  padding: 16px;
  border: 1px solid var(--sf-border);
  border-radius: 8px;
  margin-top: 12px;
}
details {
  margin-top: 16px;
  overflow-x: auto;
}
summary {
  cursor: pointer;
  font-size: 13px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 12px;
}
th,
td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid var(--sf-border);
}
[role='alert'] {
  color: var(--sf-danger);
}
</style>
