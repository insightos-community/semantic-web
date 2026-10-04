<template>
  <section class="binding-section">
    <div class="binding-heading">
      <strong>机器人与模型配置</strong>
      <el-button :disabled="!editable || busy" @click="open(null)">设置项目默认</el-button>
    </div>
    <p>复用已安装的 Ability 和模型。保存后按需生效，场景保持当前状态。</p>
    <p v-for="(binding, model) in defaults" :key="model">
      {{ model }} 默认：{{ binding.model?.name || '未选择模型' }} {{ binding.model?.version }}
    </p>
    <article v-for="robot in robots" :key="robot.robot_id" class="binding-robot">
      <div>
        <b>{{ robot.robot_id }}</b
        ><small>{{ robot.robot_model }} · {{ robot.backend_profile }}</small>
      </div>
      <p>
        待生效配置：{{ robot.desired?.model?.name || '机器人默认配置' }}
        {{ robot.desired?.model?.version }}
      </p>
      <p>
        实际运行模型：{{ robot.running?.model?.name || '暂无模型运行快照' }}
        {{ robot.running?.model?.version }}
      </p>
      <el-alert
        v-if="robot.failure_reason"
        :title="robot.failure_reason"
        type="warning"
        :closable="false"
      />
      <p v-if="!robot.bundle_version">
        机器人运行支持尚未就绪。请先导入该型号的运行支持，再选择 Ability 和模型；已有场景可保留。
      </p>
      <div class="binding-actions">
        <el-button :disabled="!editable || busy" @click="open(robot)"
          >选择 Ability / 模型</el-button
        >
        <el-button :disabled="!editable || busy || !robot.desired" @click="apply(robot)"
          >立即生效 / 重试</el-button
        >
      </div>
    </article>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="notice" :title="notice" type="success" :closable="false" />
    <el-dialog
      v-model="visible"
      :title="target ? `${target.robot_id} · 组件选择` : '项目默认组件'"
      width="620px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="机器人型号">
          <el-select v-model="robotModel" :disabled="!!target" @change="loadDefault">
            <el-option v-for="model in models" :key="model" :label="model" :value="model" />
          </el-select>
        </el-form-item>
        <p>Runtime：{{ profile || '请先在项目场景中选择默认运行环境' }}</p>
        <el-form-item label="Ability（同一角色选择一个实现）">
          <el-select v-model="abilityIDs" multiple placeholder="选择已安装的 Ability">
            <el-option
              v-for="item in abilityOptions"
              :key="item.id"
              :value="item.id"
              :label="`${item.name} · ${item.version} · ${item.id.slice(0, 8)}`"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="策略模型">
          <el-select v-model="modelID" clearable placeholder="选择兼容的已安装模型">
            <el-option
              v-for="option in modelOptions"
              :key="option.item.id"
              :value="option.item.id"
              :disabled="!!option.reason"
              :label="`${option.item.name} · ${option.item.version} · ${option.item.id.slice(0, 8)}${option.reason ? '（' + option.reason + '）' : ''}`"
            />
          </el-select>
        </el-form-item>
        <p v-if="!abilityOptions.length">
          尚无该型号的 Ability，请先从安装包或源码导入。已安装的同型号组件可跨项目复用。
        </p>
        <p>
          项目默认用于后续首次绑定；单个 Robot 的选择独立保存。新架构的模型需要 Ability
          提供对应后端。
        </p>
        <el-alert v-if="selectionError" :title="selectionError" type="warning" :closable="false" />
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="busy || !robotModel || !abilityIDs.length || !!selectionError"
          @click="save"
          >保存绑定</el-button
        >
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { bindComponents, applyComponents } from '@/api/imports'
import { modelCompatibilityReason } from '@/utils/componentBinding'

const props = defineProps({
  projectId: { type: String, required: true },
  editable: Boolean,
  available: { type: Array, default: () => [] },
  robots: { type: Array, default: () => [] },
  defaults: { type: Object, default: () => ({}) },
  runtimeProfile: { type: String, default: '' }
})
const emit = defineEmits(['updated'])
const visible = ref(false)
const target = ref(null)
const robotModel = ref('')
const abilityIDs = ref([])
const modelID = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
watch(
  () => props.projectId,
  () => {
    visible.value = false
    target.value = null
    error.value = ''
    notice.value = ''
  }
)
const profile = computed(() => target.value?.backend_profile || props.runtimeProfile)
const models = computed(() => [
  ...new Set([
    ...props.available.flatMap((i) => i.robot_models || []),
    ...props.robots.map((r) => r.robot_model)
  ])
])
const abilityOptions = computed(() =>
  props.available.filter(
    (i) => i.kind === 'robot_ability' && (i.robot_models || []).includes(robotModel.value)
  )
)
const selectedAbilities = computed(() =>
  abilityOptions.value.filter((i) => abilityIDs.value.includes(i.id))
)
const modelOptions = computed(() =>
  props.available
    .filter((i) => i.kind === 'model' && (i.robot_models || []).includes(robotModel.value))
    .map((item) => ({
      item,
      reason: modelCompatibilityReason(
        item,
        robotModel.value,
        profile.value,
        selectedAbilities.value
      )
    }))
)
const selectionError = computed(() => {
  const roles = selectedAbilities.value.flatMap((i) => i.abilities || [])
  if (new Set(roles.map((a) => a.role)).size !== roles.length)
    return '同一角色只能选择一个 Ability 实现'
  if (modelID.value) {
    const option = modelOptions.value.find((o) => o.item.id === modelID.value)
    return option?.reason || (option ? '' : '所选模型已不可用，请重新选择')
  }
  return roles.some((a) => a.model_backends?.length) ? '请为策略 Ability 选择模型' : ''
})
function setSelection(binding) {
  abilityIDs.value = [
    ...new Set(Object.values(binding?.abilities || {}).map((a) => a.component_id))
  ]
  modelID.value = binding?.model?.component_id || ''
}
function loadDefault() {
  setSelection(props.defaults[robotModel.value])
}
function open(robot) {
  target.value = robot
  robotModel.value = robot?.robot_model || models.value[0] || ''
  setSelection(robot ? robot.desired : props.defaults[robotModel.value])
  error.value = ''
  notice.value = ''
  visible.value = true
}
async function save() {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await bindComponents(props.projectId, {
      robot_id: target.value?.robot_id || '',
      robot_model: robotModel.value,
      component_ids: [...abilityIDs.value, ...(modelID.value ? [modelID.value] : [])]
    })
    visible.value = false
    notice.value = '绑定已保存。现有 Robot 可在空闲时点击“立即生效”，项目默认用于后续首次绑定。'
    emit('updated')
  } catch (e) {
    error.value = e.message || '保存绑定失败'
  } finally {
    busy.value = false
  }
}
async function apply(robot) {
  try {
    await ElMessageBox.confirm(
      `将停止并重新启动 ${robot.robot_id} 的组件，场景保持当前状态。请确认机器人空闲。`,
      '生效组件绑定',
      { type: 'warning' }
    )
  } catch {
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await applyComponents(props.projectId, robot.robot_id)
    notice.value = '目标 Robot 已通过就绪检查，新绑定已生效。'
  } catch (e) {
    error.value = e.message || '生效失败，绑定已保留，可查看原因后重试'
  } finally {
    busy.value = false
    emit('updated')
  }
}
</script>

<style scoped>
.binding-section {
  margin: 20px 0;
  min-width: 0;
}
.binding-heading,
.binding-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.binding-heading {
  justify-content: space-between;
}
.binding-robot {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 14px;
  margin: 12px 0;
  overflow-wrap: anywhere;
}
.binding-robot small {
  display: block;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.binding-actions {
  margin-top: 12px;
}
.el-select {
  width: 100%;
}
p {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
</style>
