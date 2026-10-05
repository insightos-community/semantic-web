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
  <section class="device-configuration" data-testid="device-configuration">
    <header>
      <div>
        <h2>配置与部署</h2>
        <p>当前设备配置</p>
      </div>
      <el-button size="small" @click="copy">复制安全配置</el-button>
    </header>
    <div class="configuration-groups">
      <details v-for="group in groups" :key="group.label" open>
        <summary>{{ group.label }}</summary>
        <ConfigurationTree v-if="Object.keys(group.value).length" :values="group.value" />
        <p v-else class="empty">尚未上报</p>
      </details>
    </div>
    <section class="skill-state">
      <h3>技能期望与实际安装</h3>
      <div v-for="skill in skills" :key="skill.key" class="skill-row">
        <b>{{ skill.name }}</b
        ><span>v{{ skill.version }}</span>
        <span
          >期望：{{ skill.desired ? (skill.desired.enabled ? '启用' : '停用') : '未配置' }}</span
        >
        <span
          >实际：{{ skill.actual?.status || '未安装'
          }}{{ skill.actual ? (skill.actual.enabled ? ' / 启用' : ' / 停用') : '' }}</span
        >
        <small v-if="skill.actual?.error">{{ skill.actual.error }}</small>
      </div>
      <p v-if="!skills.length" class="empty">尚无技能配置</p>
    </section>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { safeDeviceRecord } from '@/devices/configuration'
import ConfigurationTree from './ConfigurationTree.vue'
const props = defineProps({
  robot: { type: Object, required: true },
  runtime: { type: Object, default: null }
})
const ui = useUiStore()
const config = computed(() => safeDeviceRecord(props.robot.configuration || {}))
const groups = computed(() => [
  {
    label: 'SDK 与连接',
    value: Object.fromEntries(
      Object.entries(config.value.sdk || {}).filter(([key]) => key !== 'providers')
    )
  },
  { label: 'Providers', value: config.value.sdk?.providers || config.value.providers || {} },
  { label: '坐标系 Frames', value: config.value.frames || {} },
  { label: '安全限制 Safety', value: config.value.safety || {} },
  { label: 'Pilot', value: config.value.pilot || {} },
  {
    label: 'Runtime 部署',
    value: Object.fromEntries(
      Object.entries({
        bundle: props.runtime?.bundle_id || props.runtime?.bundle,
        backend_profile: props.runtime?.backend_profile,
        instance_id: props.runtime?.instance_id
      }).filter(([, value]) => value)
    )
  }
])
const skills = computed(() => {
  const values = new Map()
  for (const kind of ['desired', 'actual']) {
    for (const skill of props.robot[kind === 'desired' ? 'desired_skills' : 'installed_skills'] ||
      []) {
      const key = `${skill.name}@${skill.version}`
      values.set(key, {
        ...values.get(key),
        key,
        name: skill.name,
        version: skill.version,
        [kind]: skill
      })
    }
  }
  return [...values.values()]
})
async function copy() {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(
        safeDeviceRecord({
          robot_id: props.robot.robot_id,
          configuration: config.value,
          desired_skills: props.robot.desired_skills || [],
          installed_skills: props.robot.installed_skills || []
        }),
        null,
        2
      )
    )
    ui.notify({ type: 'success', message: '已复制设备上报的安全配置' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '复制失败' })
  }
}
</script>

<style scoped>
.device-configuration {
  padding: 16px;
}
header {
  display: flex;
  align-items: start;
  gap: 12px;
  justify-content: space-between;
}
h2,
h3 {
  margin: 0;
  font-size: 15px;
}
header p,
.empty {
  color: var(--sf-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.configuration-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  align-items: start;
  gap: 12px;
  margin-top: 12px;
}
details,
.skill-state {
  min-width: 0;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  padding: 12px;
}
summary {
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
dl {
  display: grid;
  grid-template-columns: minmax(85px, 30%) minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
}
dt {
  color: var(--sf-text-secondary);
  overflow-wrap: anywhere;
}
dd,
pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.skill-state {
  margin-top: 12px;
}
.skill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sf-border-light);
  font-size: 11px;
}
.skill-row small {
  width: 100%;
  color: var(--sf-warning);
}
</style>
