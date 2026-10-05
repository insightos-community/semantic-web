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
  <section class="skills-panel">
    <header>
      <div>
        <h2>Robot Skill</h2>
        <p>显示与当前机器人 Ability 匹配的技能，安装后由 Pilot 回报实际状态。</p>
      </div>
      <span>目录 revision {{ robot?.skill_catalog_revision || 0 }}</span>
    </header>
    <p v-if="!availableSkills.length" class="debug-hint">
      暂无与当前机器人 Ability 匹配的 Robot Skill。
    </p>
    <div class="skills-grid">
      <article
        v-for="skill in availableSkills"
        :key="`${skill.name}@${skill.version}`"
        :class="{
          selected: selectedSkill?.name === skill.name && selectedSkill?.version === skill.version
        }"
        tabindex="0"
        @click="selectSkill(skill)"
        @keydown.enter="selectSkill(skill)"
      >
        <div class="skill-title">
          <div>
            <b>{{ skill.name }}</b
            ><small>v{{ skill.version }}</small>
          </div>
          <DeviceStatus :status="convergenceStatus(skill)" />
        </div>
        <p>{{ skill.description }}</p>
        <dl>
          <div>
            <dt>期望</dt>
            <dd>{{ desiredLabel(skill) }}</dd>
          </div>
          <div>
            <dt>Pilot 实际</dt>
            <dd>{{ actualLabel(skill) }}</dd>
          </div>
        </dl>
        <div class="actions">
          <el-button
            v-if="!desired(skill)"
            type="primary"
            size="small"
            :loading="operating('install', skill)"
            @click.stop="install(skill)"
          >
            设为期望并下发
          </el-button>
          <template v-else>
            <el-button
              size="small"
              :type="desired(skill).enabled ? 'warning' : 'success'"
              plain
              :loading="operating('enable', skill)"
              @click.stop="toggle(skill)"
            >
              {{ desired(skill).enabled ? '停用' : '启用' }}
            </el-button>
            <el-button
              size="small"
              type="danger"
              text
              :loading="operating('uninstall', skill)"
              @click.stop="remove(skill)"
            >
              移除期望
            </el-button>
          </template>
        </div>
      </article>
    </div>
    <RobotSkillDebugPanel
      v-if="inlineDebug && selectedSkill"
      :robot="robot"
      :skill="selectedSkill"
    />
    <p v-else-if="inlineDebug && availableSkills.length" class="debug-hint">
      选择一个技能查看正式输入契约并进行人工调试。
    </p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import RobotSkillDebugPanel from '@/components/device/RobotSkillDebugPanel.vue'
import { installableRobotSkills } from '@/devices/skillCompatibility'
import { useDeviceStore } from '@/stores/device'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  initialSkillKey: { type: String, default: '' },
  robot: { type: Object, required: true },
  inlineDebug: { type: Boolean, default: false }
})
const selectedKey = ref('')
watch(
  () => props.initialSkillKey,
  (key) => {
    selectedKey.value = key || ''
  },
  { immediate: true }
)
const selectedSkill = computed(
  () =>
    availableSkills.value.find((skill) => `${skill.name}@${skill.version}` === selectedKey.value) ||
    null
)
const devices = useDeviceStore()
const layout = useLayoutStore()
const project = useProjectStore()
const ui = useUiStore()
const availableSkills = computed(() => installableRobotSkills(devices.skillPackages, props.robot))
const desired = (skill) =>
  props.robot.desired_skills?.find(
    (item) => item.name === skill.name && item.version === skill.version
  )
const actual = (skill) =>
  props.robot.installed_skills?.find(
    (item) => item.name === skill.name && item.version === skill.version
  )
const operating = (operation, skill) =>
  devices.isOperating(`${operation}:${props.robot.robot_id}:${skill.name}:${skill.version}`)

function convergenceStatus(skill) {
  const target = desired(skill)
  const current = actual(skill)
  if (!target) return current ? 'degraded' : 'not_installed'
  if (current?.status === 'failed') return 'failed'
  if (!current || current.enabled !== target.enabled || current.status !== 'installed')
    return 'pending'
  return current.enabled ? 'installed' : 'disabled'
}
function desiredLabel(skill) {
  const target = desired(skill)
  if (!target) return '未配置'
  return target.enabled ? `v${target.version} · 启用` : `v${target.version} · 停用`
}
function actualLabel(skill) {
  const current = actual(skill)
  if (!current) return desired(skill) ? '等待 Pilot 对账' : '未安装'
  if (current.status === 'failed') return current.error || '安装失败'
  return current.enabled ? '已安装并启用' : '已安装，未启用'
}
function selectSkill(skill) {
  if (props.inlineDebug) {
    selectedKey.value = `${skill.name}@${skill.version}`
    return
  }
  layout.select({
    projectId: project.currentProjectId,
    resourceType: 'robot_skill',
    resourceId: `${skill.name}@${skill.version}`,
    title: skill.name,
    robotId: props.robot.robot_id
  })
}
async function install(skill) {
  try {
    await devices.installSkill(props.robot.robot_id, skill)
    ui.notify({ type: 'success', message: `${skill.name} 已设为期望版本，Pilot 将自动对账` })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot Skill 期望状态保存失败' })
  }
}
async function toggle(skill) {
  const target = desired(skill)
  try {
    await devices.setSkillEnabled(props.robot.robot_id, skill, !target.enabled)
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot Skill 期望状态修改失败' })
  }
}
async function remove(skill) {
  try {
    await ElMessageBox.confirm(
      `移除 ${skill.name} v${skill.version} 的期望状态？Pilot 将在安全时卸载实际版本。`,
      '移除 Robot Skill',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }
    )
    await devices.uninstallSkill(props.robot.robot_id, skill)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ui.notify({ type: 'error', message: error.message || 'Robot Skill 期望状态移除失败' })
  }
}
</script>

<style scoped lang="scss">
.skills-panel {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 28px 36px;
}
.skills-panel > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}
h2 {
  margin: 0;
  font-size: 17px;
}
header p {
  margin: 5px 0 0;
  color: var(--sf-text-secondary);
  font-size: 12px;
}
header > span {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: 10px;
}
.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
article {
  padding: 15px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-secondary);
  cursor: pointer;
}
article:hover,
article.selected,
article:focus-visible {
  border-color: var(--sf-brand);
  outline: none;
}
.skill-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.skill-title div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.skill-title small {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
}
article > p {
  min-height: 36px;
  color: var(--sf-text-secondary);
  font-size: 11px;
  line-height: 1.6;
}
dl {
  margin: 10px 0 12px;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
}
dl div {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
}
dl div + div {
  margin-top: 5px;
}
dt,
dd {
  margin: 0;
  font-size: 10px;
}
dt {
  color: var(--sf-text-disabled);
}
dd {
  color: var(--sf-text-secondary);
}
.actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--sf-border-light);
}
.debug-hint {
  color: var(--sf-text-secondary);
  font-size: 12px;
}
</style>
