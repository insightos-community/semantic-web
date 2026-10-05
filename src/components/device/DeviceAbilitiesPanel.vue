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
  <section class="abilities-panel">
    <header>
      <div>
        <h2>Ability 实例</h2>
        <p>选择能力，填写参数并测试。</p>
      </div>
    </header>
    <div class="ability-layout">
      <nav>
        <button
          v-for="ability in abilities"
          :key="ability.instance_id"
          type="button"
          :class="{ active: ability.instance_id === selected?.instance_id }"
          @click="selectAbility(ability)"
        >
          <span
            ><b>{{ ability.ability_name }}</b
            ><small>{{ ability.role || '未声明角色' }}</small></span
          >
          <DeviceStatus :status="ability.health || ability.status || ability.state" />
        </button>
        <div v-if="!abilities.length" class="empty">Pilot 尚未上报 Ability 实例。</div>
      </nav>

      <main v-if="selected">
        <div class="ability-heading">
          <div>
            <span class="eyebrow">ABILITY INSTANCE</span>
            <h3>{{ selected.ability_name }}</h3>
          </div>
          <DeviceStatus :status="selected.status || selected.state" />
        </div>
        <AbilityDebugPanel v-if="!inspectorMode" :robot="robot" :ability="selected" />
        <details class="ability-contract">
          <summary>接口与配置</summary>
          <dl class="metadata">
            <dt>Instance UUID</dt>
            <dd>{{ selected.instance_id }}</dd>
            <dt>版本</dt>
            <dd>{{ selected.version || '未上报' }}</dd>
            <dt>语义角色</dt>
            <dd>{{ selected.role || '未声明' }}</dd>
            <dt>实例名称</dt>
            <dd>{{ selected.instance_name || '—' }}</dd>
            <dt>Framework 状态</dt>
            <dd>{{ selected.state || selected.status }}</dd>
            <dt>精确路由</dt>
            <dd>{{ selected.selected ? '已绑定到当前 Robot' : '未选为当前 Robot 路由' }}</dd>
            <dt>当前 Invocation</dt>
            <dd>{{ selected.current_invocation_id || '无' }}</dd>
            <dt>错误</dt>
            <dd>{{ selected.error || '无' }}</dd>
          </dl>

          <section>
            <h4>语义 Action</h4>
            <div v-if="selected.action_details?.length" class="table">
              <div class="table-head">
                <span>Action</span><span>Task</span><span>输入模型</span><span>属性</span>
              </div>
              <div
                v-for="action in selected.action_details"
                :key="`${action.type}@${action.schema_version}`"
              >
                <code>{{ action.type }}@{{ action.schema_version }}</code
                ><b>{{ action.task_name }}</b
                ><span>{{ action.input_model || '未声明' }}</span
                ><span>{{ action.physical ? '物理动作' : '只读 / 计算' }}</span>
              </div>
            </div>
            <p v-else class="empty compact">Manifest 尚未上报 Action 元数据。</p>
          </section>

          <section>
            <h4>业务 Task 与参数</h4>
            <div v-if="selected.debug_tasks?.length" class="task-list">
              <article v-for="task in selected.debug_tasks" :key="task.name">
                <header>
                  <b>{{ task.name }}</b
                  ><code>type {{ task.task_type }}</code>
                </header>
                <dl>
                  <dt>Input Model</dt>
                  <dd>{{ task.input_model || '未声明' }}</dd>
                  <dt>返回值</dt>
                  <dd>{{ returnLabel(task) }}</dd>
                </dl>
                <AbilityInputFields :fields="task.input_fields" />
              </article>
            </div>
            <p v-else class="empty compact">该实例没有业务 Task。</p>
          </section>

          <section>
            <h4>Ability 配置字段</h4>
            <dl v-if="configProperties.length" class="config-list">
              <template v-for="item in configProperties" :key="item.name">
                <dt>{{ item.name }}</dt>
                <dd>
                  <b>{{ item.type || 'any' }}</b
                  >{{ item.description || 'Manifest 未提供说明' }}
                </dd>
              </template>
            </dl>
            <p v-else class="empty compact">Manifest 尚未声明配置 Schema。</p>
          </section>
        </details>
        <p v-if="inspectorMode" class="inspector-hint">
          已在右侧 Inspector 中打开该 Ability 的详情与调试入口。
        </p>
      </main>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AbilityInputFields from '@/components/device/AbilityInputFields.vue'
import AbilityDebugPanel from '@/components/device/AbilityDebugPanel.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { useAbilityStore } from '@/stores/ability'
import { useLayoutStore } from '@/stores/layout'

const props = defineProps({
  initialAbilityId: { type: String, default: '' },
  robot: { type: Object, required: true },
  inspectorMode: { type: Boolean, default: false }
})
const abilitiesStore = useAbilityStore()
const layout = useLayoutStore()
const selectedId = ref('')
const abilities = computed(() => abilitiesStore.forRobot(props.robot.robot_id))
const selected = computed(
  () =>
    abilities.value.find((item) => item.instance_id === selectedId.value) ||
    abilities.value[0] ||
    null
)
const configProperties = computed(() =>
  Object.entries(selected.value?.config_schema?.properties || {}).map(([name, schema]) => ({
    name,
    ...schema
  }))
)

watch(
  () => props.initialAbilityId,
  (id) => {
    selectedId.value = id || ''
  },
  { immediate: true }
)

function selectAbility(ability) {
  selectedId.value = ability.instance_id
  if (props.inspectorMode)
    layout.select({
      resourceType: 'ability',
      resourceId: ability.instance_id,
      title: ability.ability_name,
      robotId: props.robot.robot_id
    })
}
function returnLabel(task) {
  return (
    task.returns?.map((item) => `${item.name || 'result'}: ${item.type || 'object'}`).join('、') ||
    '未声明'
  )
}
</script>

<style scoped lang="scss">
.abilities-panel {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 28px 36px;
  container-type: inline-size;
}
.abilities-panel > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 15px;
}
h2,
h3,
h4 {
  margin: 0;
}
.abilities-panel > header p {
  margin: 5px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}
.abilities-panel > header > span {
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
}
.ability-layout {
  display: grid;
  min-height: 520px;
  grid-template-columns: 280px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: 11px;
  background: var(--sf-bg-secondary);
}
nav {
  padding: 8px;
  border-right: 1px solid var(--sf-border-light);
  background: var(--sf-bg-tertiary);
}
nav button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  padding: 11px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
nav button:hover {
  background: var(--sf-bg-hover);
}
nav button.active {
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}
nav button > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
nav small {
  overflow: hidden;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
}
main {
  padding: 20px;
  overflow: auto;
}
.ability-contract {
  margin-top: 16px;
}
.ability-contract summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--sf-text-secondary);
}
@container (max-width: 700px) {
  .ability-layout {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  nav {
    display: flex;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--sf-border-light);
  }
  nav button {
    flex: 0 0 190px;
  }
  main {
    padding: 12px;
  }
  .table {
    overflow: auto;
  }
}
.ability-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.eyebrow {
  color: var(--sf-role-robot);
  font-size: var(--sf-font-xs);
  font-weight: 520;
  letter-spacing: 0.1em;
}
.ability-heading h3 {
  margin-top: 4px;
  font-size: var(--sf-font-display);
}
.metadata,
.config-list {
  display: grid;
  grid-template-columns: 125px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 18px 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  font-size: var(--sf-font-xs);
}
dt {
  color: var(--sf-text-disabled);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
main > section {
  margin-top: 17px;
  padding-top: 15px;
  border-top: 1px solid var(--sf-border-light);
}
main h4 {
  margin-bottom: 9px;
  font-size: var(--sf-font-sm);
}
.table {
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
}
.table > div {
  display: grid;
  grid-template-columns: minmax(170px, 1.3fr) minmax(110px, 1fr) minmax(170px, 1.2fr) 90px;
  gap: 8px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--sf-border-light);
  font-size: var(--sf-font-xs);
}
.table > div:last-child {
  border-bottom: 0;
}
.table-head {
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-disabled);
}
.table code {
  color: var(--sf-brand);
}
.task-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.task-list article {
  padding: 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
}
.task-list header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.task-list code {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.task-list dl {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 5px 8px;
  margin: 9px 0 0;
  font-size: var(--sf-font-xs);
}
.config-list dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.config-list dd b {
  color: var(--sf-brand);
  font-size: var(--sf-font-xs);
}
.inspector-hint {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.empty {
  padding: 25px;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  text-align: center;
}
.empty.compact {
  padding: 12px;
}
@media (max-width: 900px) {
  .ability-layout {
    grid-template-columns: 1fr;
  }
  nav {
    border-right: 0;
    border-bottom: 1px solid var(--sf-border-light);
  }
  .table > div {
    grid-template-columns: 1fr;
  }
  .task-list {
    grid-template-columns: 1fr;
  }
}
</style>
