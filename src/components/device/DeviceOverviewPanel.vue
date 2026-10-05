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
  <section class="device-overview">
    <div class="summary-grid">
      <article>
        <span>Pilot</span><DeviceStatus :status="robot.pilot?.status" />
        <b>{{ robot.pilot?.instance_id || '未注册' }}</b>
        <small>v{{ robot.pilot?.version || '—' }} · {{ heartbeat }}</small>
      </article>
      <article>
        <span>AbilityFramework</span><DeviceStatus :status="robot.ability_framework?.status" />
        <b>{{ healthyAbilities }}/{{ totalAbilities }} 个实例健康</b>
        <small>目录 revision {{ robot.ability_catalog_revision || 0 }}</small>
      </article>
      <article>
        <span>Robot</span><DeviceStatus :status="robot.status" />
        <b>{{ robot.model || '未声明型号' }} · {{ robot.backend || '未声明后端' }}</b>
        <small>{{ robot.environment || 'unknown' }} · {{ robot.robot_id }}</small>
      </article>
      <article>
        <span>Project / Task</span>
        <b>{{ robot.project_id || projectId || '未分配' }}</b>
        <small>{{ robot.task_id || '没有活动 Robot Task' }}</small>
      </article>
    </div>

    <RobotRuntimeStatus :robot-id="robot.robot_id" :runtime="runtime" />

    <div class="details-grid">
      <section>
        <header>
          <h3>部署与连接</h3>
          <span>实际生效配置</span>
        </header>
        <dl>
          <dt>SDK Package</dt>
          <dd>{{ sdk.package || '未上报' }}</dd>
          <dt>SDK Endpoint</dt>
          <dd>{{ sdk.endpoint || '进程内 / 未上报' }}</dd>
          <dt>固件 Profile</dt>
          <dd>{{ sdk.firmware_profile || '未配置' }}</dd>
          <dt>Runtime Bundle</dt>
          <dd>{{ runtime?.bundle_id || runtime?.bundle || '未上报' }}</dd>
          <dt>Backend Profile</dt>
          <dd>{{ runtime?.backend_profile || '未上报' }}</dd>
          <dt>最后心跳</dt>
          <dd>{{ heartbeat }}</dd>
        </dl>
      </section>
      <section>
        <header>
          <h3>Robot 配置</h3>
          <span>由 Pilot 安全摘要上报</span>
        </header>
        <dl>
          <dt>Provider</dt>
          <dd>
            <code v-for="item in providers" :key="item">{{ item }}</code
            ><span v-if="!providers.length">未上报</span>
          </dd>
          <dt>坐标系</dt>
          <dd>
            <code v-for="item in frames" :key="item">{{ item }}</code
            ><span v-if="!frames.length">未上报</span>
          </dd>
          <dt>安全限制</dt>
          <dd>
            <code v-for="item in safety" :key="item">{{ item }}</code
            ><span v-if="!safety.length">未上报</span>
          </dd>
          <dt>Ability 调试</dt>
          <dd>{{ allowAbilityDebug ? '已启用（受 Robot 资源锁保护）' : '未启用' }}</dd>
        </dl>
      </section>
      <section>
        <header>
          <h3>目录与资源</h3>
          <span>Server 汇总</span>
        </header>
        <div class="catalog-grid">
          <div>
            <b>{{ enabledSkills }}/{{ robot.installed_skills?.length || 0 }}</b
            ><span>Robot Skill 已启用</span>
          </div>
          <div>
            <b>{{ healthyAbilities }}/{{ totalAbilities }}</b
            ><span>Ability 健康</span>
          </div>
          <div>
            <b>{{ robot.sensors?.length || 0 }}</b
            ><span>传感器</span>
          </div>
          <div>
            <b>{{ robot.skill_catalog_revision || 0 }}</b
            ><span>Skill revision</span>
          </div>
        </div>
      </section>
      <section>
        <header>
          <h3>当前执行</h3>
          <DeviceStatus :status="currentExecution?.status || robot.status" />
        </header>
        <template v-if="currentExecution">
          <dl>
            <dt>Robot Skill</dt>
            <dd>{{ currentExecution.skill_name }} · v{{ currentExecution.skill_version }}</dd>
            <dt>语义阶段</dt>
            <dd>{{ currentExecution.stage_label || currentExecution.stage || '尚未上报' }}</dd>
            <dt>Execution</dt>
            <dd>{{ currentExecution.id }}</dd>
            <dt>Task / SubTask</dt>
            <dd>
              {{ currentExecution.task_id || '—' }} / {{ currentExecution.subtask_id || '—' }}
            </dd>
          </dl>
          <el-button size="small" plain type="primary" @click="$emit('open-execution')">
            查看执行时间线
          </el-button>
        </template>
        <p v-else>当前没有 Robot Execution。</p>
      </section>
    </div>

    <aside>
      <InfoFilled />
      <p>
        设备调试经 Semantic Server → Pilot → AbilityFramework，不由浏览器直连 Robot SDK；页面只展示
        Pilot 实际上报的配置与状态。
      </p>
    </aside>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import RobotRuntimeStatus from '@/components/device/RobotRuntimeStatus.vue'

const props = defineProps({
  robot: { type: Object, required: true },
  runtime: { type: Object, default: null },
  currentExecution: { type: Object, default: null },
  projectId: { type: String, default: '' }
})
defineEmits(['open-execution'])

const configuration = computed(() => props.robot.configuration || {})
const sdk = computed(() => configuration.value.sdk || {})
const totalAbilities = computed(
  () => props.robot.ability_framework?.total_instances || props.robot.abilities?.length || 0
)
const healthyAbilities = computed(() => props.robot.ability_framework?.healthy_instances || 0)
const enabledSkills = computed(
  () => props.robot.installed_skills?.filter((item) => item.enabled).length || 0
)
const allowAbilityDebug = computed(() => configuration.value.pilot?.allow_ability_debug === true)
const heartbeat = computed(() => formatTime(props.robot.pilot?.last_heartbeat_at))
const providers = computed(() => entries(configuration.value.sdk?.providers))
const frames = computed(() => entries(configuration.value.frames))
const safety = computed(() => entries(configuration.value.safety))

function entries(value) {
  return Object.entries(value || {}).map(([key, item]) => `${key}: ${String(item)}`)
}
function formatTime(value) {
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '未上报'
}
</script>

<style scoped lang="scss">
.device-overview {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px;
  container-type: inline-size;
}
.summary-grid,
.details-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.summary-grid {
  margin-bottom: 12px;
}
.summary-grid article,
.details-grid > section {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-secondary);
}
.summary-grid article {
  display: flex;
  gap: 5px;
  flex-direction: column;
}
.summary-grid span,
.summary-grid small {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.summary-grid b {
  overflow: hidden;
  font-size: var(--sf-font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.details-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 12px;
}
.details-grid header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 11px;
}
.details-grid h3 {
  margin: 0;
  font-size: var(--sf-font-sm);
}
.details-grid header > span {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
dl {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: var(--sf-font-xs);
}
dt {
  color: var(--sf-text-disabled);
}
dd {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  overflow-wrap: anywhere;
}
dd code {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}
.catalog-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}
.catalog-grid div {
  display: flex;
  padding: 10px;
  border-radius: 7px;
  background: var(--sf-bg-tertiary);
  flex-direction: column;
  gap: 3px;
}
.catalog-grid b {
  font-size: 16px;
}
.catalog-grid span {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.details-grid p {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
aside {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 12px;
  padding: 11px 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 9px;
  background: var(--sf-bg-secondary);
}
aside svg {
  width: 15px;
  flex: none;
  color: var(--sf-brand);
}
aside p {
  margin: 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  line-height: 1.6;
}
@media (max-width: 1000px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .details-grid {
    grid-template-columns: 1fr;
  }
}
@container (max-width: 650px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .details-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
