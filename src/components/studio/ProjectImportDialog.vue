<template>
  <el-dialog
    :model-value="modelValue"
    title="导入项目内容"
    width="min(760px, 94vw)"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="project-import" data-testid="project-import-dialog">
      <p>
        上传安装包后选择全部内容或单个组件，所需的包内依赖会一起安装。也可直接上传 Skill、Ability
        或模型包进行更新。Runtime 独立安装，可供多个场景复用。
      </p>
      <section class="import-directory">
        <strong>项目投递目录</strong>
        <code>{{ directory || '正在读取…' }}</code>
        <small
          >将包放入此目录，Server 会自动识别并记录结果。复制大文件时，可先使用 .partial
          后缀，完成后改为 .zip。</small
        >
        <el-button :disabled="!directory" @click="copyDirectory">复制路径</el-button>
        <el-button :disabled="!editable || busy" @click="perform(() => scanImports(projectId))">
          <span>立即扫描</span>
        </el-button>
      </section>
      <section class="import-upload">
        <label for="project-import-file">上传安装包或单个组件（最大 32 GiB）</label>
        <el-button type="primary" :loading="busy" :disabled="!editable" @click="fileInput?.click()">
          选择安装包
        </el-button>
        <input
          id="project-import-file"
          ref="fileInput"
          type="file"
          hidden
          accept=".zip,.zst,application/zip,application/zstd"
          :disabled="!editable || busy"
          @change="upload"
        />
        <small v-if="!editable">切换到开发模式后可导入；运行模式可以查看已有记录。</small>
        <small
          >开发者可上传包含 semantic-source.yaml 和依赖源码的 Ability ZIP；Robot Skill 源码 ZIP
          使用原有 SKILL.md。</small
        >
      </section>
      <p v-if="error" class="import-error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <div class="import-heading">
        <strong>导入记录</strong><el-button :disabled="busy" @click="refresh">刷新</el-button>
      </div>
      <p v-if="!items.length">暂无导入记录</p>
      <ul class="import-records">
        <li v-for="item in items" :key="item.id">
          <div class="import-record-heading">
            <strong>{{ item.name || item.filename }}</strong
            ><el-tag :type="statusType(item.status)">{{ statusLabel(item.status) }}</el-tag>
          </div>
          <small
            >{{ item.filename
            }}<template v-if="item.version"> · {{ item.version }}</template></small
          >
          <small v-if="item.source_revision"
            >源码修订 {{ item.source_revision.slice(0, 12) }}</small
          >
          <p v-if="item.status === 'imported'">{{ importDescription(item) }}</p>
          <el-tag
            v-if="item.installation_status"
            :type="installationType(item.installation_status)"
          >
            {{ installationLabel(item.installation_status) }}
          </el-tag>
          <p v-if="item.progress" class="install-progress" role="status">{{ item.progress }}</p>
          <small v-if="item.kind === 'package' && item.installation_status === 'installed'">
            本次已安装：{{ item.selected_components?.join('、') }}。其余组件可继续选装。
          </small>
          <p v-if="item.error" class="import-error">{{ item.error }}</p>
          <p v-if="item.status === 'importing'">
            正在导入。若 Server 上次在导入时退出，请先检查项目内容与日志。
          </p>
          <el-button
            v-if="item.status === 'failed'"
            :disabled="!editable || busy"
            @click="perform(() => retryImport(projectId, item.id))"
          >
            <span>重试导入</span>
          </el-button>
          <el-button
            v-if="item.status === 'imported' && item.kind !== 'scene'"
            :disabled="!editable || busy || item.installation_status === 'installing'"
            @click="selectInstallation(item)"
          >
            {{ item.installation_status === 'installed' ? '选择组件 / 更新' : '安装' }}
          </el-button>
          <el-button
            v-if="item.installation_status === 'installing'"
            :disabled="busy"
            @click="perform(() => cancelInstallation(projectId, item.id))"
            >取消安装</el-button
          >
        </li>
      </ul>
      <RobotComponentBinding
        :project-id="projectId"
        :editable="editable"
        :available="available"
        :robots="robots"
        :defaults="defaults"
        :runtime-profile="runtimeProfile"
        @updated="refresh"
      />
      <details v-if="robots.length" class="import-directory">
        <summary>Robot 组件版本详情</summary>
        <article v-for="robot in robots" :key="robot.robot_id">
          <p>{{ robot.robot_id }} · {{ robot.robot_model }}</p>
          <small>已绑定：{{ robot.desired?.revision || '机器人默认配置' }}</small>
          <ul v-if="robot.desired">
            <li v-for="(ability, role) in robot.desired.abilities" :key="role">
              {{ role }} · {{ ability.name || ability.ability_name }} {{ ability.version }}
              <small v-if="ability.source_revision"
                >源码 {{ ability.source_revision.slice(0, 12) }}</small
              >
              <small>{{
                robot.running?.abilities?.[role]?.component_id === ability.component_id
                  ? '当前运行已生效'
                  : '等待生效'
              }}</small>
            </li>
            <li v-if="robot.desired.model">
              模型 · {{ robot.desired.model.name }} {{ robot.desired.model.version }}
            </li>
          </ul>
          <small
            >当前运行：{{
              robot.running?.revision ||
              (robot.status === 'ready' ? `机器人运行支持 ${robot.bundle_version}` : '未运行')
            }}</small
          >
          <p v-if="robot.desired && robot.desired.revision !== robot.running?.revision">
            新绑定等待目标 Robot 启动后生效。
          </p>
          <el-button
            v-if="robot.running && robot.desired?.revision !== robot.running.revision"
            :disabled="!editable || busy"
            @click="
              perform(() => rollbackComponents(projectId, robot.robot_id, robot.running.revision))
            "
          >
            恢复当前运行版本的绑定
          </el-button>
        </article>
      </details>
      <section v-if="installed.length">
        <strong>已安装组件</strong>
        <article v-for="component in installed" :key="component.id" class="import-record-heading">
          <span
            >{{ component.name }} · {{ component.version
            }}<small> · {{ componentKindLabel(component.kind) }}</small></span
          >
          <el-button
            :disabled="!editable || busy"
            type="danger"
            plain
            size="small"
            @click="uninstallComponent(component)"
            >卸载</el-button
          >
        </article>
        <small>卸载前会检查 Robot 绑定、活动执行和项目场景引用；原包与历史记录保留。</small>
      </section>
      <p v-if="versionsError" class="import-error">{{ versionsError }}</p>
    </div>
    <el-dialog v-model="installDialog" title="选择安装内容" width="min(580px, 92vw)" append-to-body>
      <el-form label-position="top" v-if="selected">
        <p>{{ selected.name }} · {{ selected.version }}</p>
        <section v-if="selected.kind === 'package'" class="package-selection">
          <p>默认安装全部，也可只选择需要更新的组件。</p>
          <el-checkbox-group v-model="options.components">
            <el-checkbox v-for="entry in selected.components" :key="entry.id" :value="entry.id">
              {{ entry.id }}
              <small v-if="entry.requires?.length">依赖：{{ entry.requires.join('、') }}</small>
            </el-checkbox>
          </el-checkbox-group>
          <p v-if="requiredComponents.length" role="status">
            将自动安装所需依赖：{{ requiredComponents.join('、') }}
          </p>
          <small>Runtime 在设置中独立安装。未选择的组件及其运行版本保持不变。</small>
        </section>
        <el-form-item
          v-if="
            [
              'robot_skill',
              'robot_ability',
              'robot_ability_source',
              'model',
              'robot_base',
              'package'
            ].includes(selected.kind)
          "
          label="目标 Robot"
        >
          <el-select
            v-model="options.robot_id"
            clearable
            placeholder="仅安装到组件库，稍后绑定"
            style="width: 100%"
          >
            <el-option
              v-for="robot in robots"
              :key="robot.robot_id"
              :label="`${robot.robot_id} · ${robot.robot_model}`"
              :value="robot.robot_id"
            />
          </el-select>
        </el-form-item>
        <el-checkbox
          v-if="
            ['robot_ability', 'robot_ability_source', 'model', 'package'].includes(selected.kind)
          "
          v-model="options.project_default"
          >设为项目对应型号的默认组件（首次启动 Robot 时使用）</el-checkbox
        >
        <template v-if="selected.kind === 'runtime'">
          <el-form-item label="资产目录（包需要外部资产时填写）"
            ><el-input v-model="options.asset_root"
          /></el-form-item>
          <el-form-item label="机器人模型资源目录（按 Runtime 包要求填写）"
            ><el-input v-model="options.model_root"
          /></el-form-item>
          <el-form-item label="Runtime 地址（留空使用包内默认值）"
            ><el-input v-model="options.endpoint" placeholder="http://127.0.0.1:8092"
          /></el-form-item>
          <el-form-item label="已接受的上游许可标识（逗号分隔）"
            ><el-input v-model="licenses"
          /></el-form-item>
        </template>
        <el-checkbox
          v-if="
            options.robot_id &&
            ['robot_ability', 'robot_ability_source', 'model', 'robot_base', 'package'].includes(
              selected.kind
            )
          "
          v-model="options.apply_now"
        >
          空闲时重启目标 Robot 并生效（保留场景）
        </el-checkbox>
        <template v-if="selected?.kind === 'scene_catalog' || selected?.kind === 'package'">
          <el-checkbox v-model="options.generate_previews"
            >生成任务信息和全部所选初态预览</el-checkbox
          >
          <p>使用独立离屏环境，保留当前现场；包内已有图片自动复用，缺失部分可以稍后补全。</p>
          <el-select
            v-if="selected?.scenes?.length"
            v-model="options.scene_ids"
            multiple
            filterable
            placeholder="选择需要生成预览的场景（默认全部）"
            style="width: 100%"
          >
            <el-option
              v-for="scene in selected.scenes"
              :key="scene.scene_id"
              :value="scene.scene_id"
              :label="`${scene.name} · ${scene.initial_states} 个初态 · ${scene.runtime_profile}`"
            />
          </el-select>
        </template>
        <p>安装会准备此包声明的代码和依赖。已有组件版本与执行记录保留。</p>
        <el-checkbox v-model="options.confirm_code"
          >我信任此包的来源，同意安装并运行其中的代码</el-checkbox
        >
      </el-form>
      <template #footer>
        <el-button @click="installDialog = false">返回</el-button>
        <el-button
          type="primary"
          :disabled="
            !options.confirm_code ||
            busy ||
            (selected?.kind === 'package' && !options.components?.length)
          "
          @click="submitInstallation"
          >确认安装</el-button
        >
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import {
  listImports,
  scanImports,
  uploadImport,
  retryImport,
  installImport,
  cancelInstallation,
  componentVersions,
  removeComponent,
  rollbackComponents
} from '@/api/imports'
import { installRobotSkill } from '@/api/devices'
import RobotComponentBinding from './RobotComponentBinding.vue'

const props = defineProps({
  modelValue: Boolean,
  projectId: { type: String, default: '' },
  editable: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'imported'])
const directory = ref('')
const fileInput = ref(null)
const items = ref([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const robots = ref([])
const installed = ref([])
const available = ref([])
const defaults = ref({})
const runtimeProfile = ref('')
const versionsError = ref('')
const installDialog = ref(false)
const selected = ref(null)
const options = ref({})
const licenses = ref('')
const componentKindLabel = (kind) =>
  ({
    robot_base: '机器人运行支持',
    robot_ability: 'Robot Ability',
    model: '模型',
    scene_catalog: '场景',
    robot_skill: 'Robot Skill'
  })[kind] || kind
// 展示由选中项引入的间接依赖；服务端使用相同的清单重新计算实际安装顺序。
const requiredComponents = computed(() => {
  const entries = new Map((selected.value?.components || []).map((entry) => [entry.id, entry]))
  const selectedIDs = options.value.components || []
  const required = new Set(selectedIDs)
  const visit = (id) => {
    for (const dependency of entries.get(id)?.requires || []) {
      if (required.has(dependency)) continue
      required.add(dependency)
      visit(dependency)
    }
  }
  selectedIDs.forEach(visit)
  return [...required].filter((id) => !selectedIDs.includes(id))
})
const installationLabel = (value) =>
  ({ pending: '待安装', installing: '安装中', installed: '已安装', failed: '安装失败' })[value] ||
  value
const installationType = (value) =>
  ({ installed: 'success', installing: 'warning', failed: 'danger' })[value] || 'info'
const importDescription = (item) =>
  ({
    scene: '已加入场景草稿，可在场景配置中查看并发布。',
    robot_skill: '已登记到 Robot Skill 库，可选择目标 Robot 安装。'
  })[item.kind] || '组件包已保存，确认安装后准备依赖与资源。'

function selectInstallation(item) {
  selected.value = item
  options.value = {
    ...(item.kind === 'package' ? { components: item.components.map((entry) => entry.id) } : {}),
    robot_id: '',
    generate_previews: true,
    scene_ids: [],
    confirm_code: false,
    apply_now: false,
    project_default: item.kind === 'package',
    asset_root: '',
    model_root: '',
    libero_root: ''
  }
  licenses.value = ''
  installDialog.value = true
}

async function submitInstallation() {
  const item = selected.value
  if (item.kind === 'robot_skill' && !options.value.robot_id) {
    error.value = '请选择安装 Skill 的目标 Robot'
    return
  }
  const payload = {
    ...options.value,
    accepted_licenses: licenses.value
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
  installDialog.value = false
  await perform(() =>
    item.kind === 'robot_skill'
      ? installRobotSkill(payload.robot_id, { name: item.name, version: item.version })
      : installImport(props.projectId, item.id, payload)
  )
}

async function uninstallComponent(component) {
  try {
    await ElMessageBox.confirm(
      `卸载 ${component.name} ${component.version}？导入原包和历史记录会保留。`,
      '卸载组件',
      { type: 'warning' }
    )
  } catch {
    return
  }
  await perform(() => removeComponent(props.projectId, component.id))
}
let timer
let revision = 0
let loading = false
let knownImports = new Set()

const statusLabel = (status) =>
  ({ imported: '已导入', failed: '导入失败', importing: '导入中', rejected: '已拒绝' })[status] ||
  status
const statusType = (status) =>
  ({ imported: 'success', failed: 'danger', importing: 'warning', rejected: 'danger' })[status] ||
  'info'

// 仅在弹窗打开时刷新记录。切换项目后丢弃旧请求，避免把上一项目的路径和
// 导入结果展示到新项目；后台自动导入由 Server 负责，不依赖这个定时器。
async function refresh() {
  if (loading || !props.projectId || !props.modelValue) return
  const current = revision
  loading = true
  try {
    const response = await listImports(props.projectId)
    if (current !== revision) return
    directory.value = response.directory
    items.value = response.items || []
    const imported = items.value.filter((item) => item.status === 'imported')
    if (imported.some((item) => !knownImports.has(item.id))) emit('imported')
    knownImports = new Set(imported.map((item) => item.id))
    try {
      const versions = await componentVersions(props.projectId)
      if (current === revision) {
        robots.value = versions.robots || []
        installed.value = versions.installed || []
        available.value = versions.available || []
        defaults.value = versions.defaults || {}
        runtimeProfile.value = versions.runtime_profile || ''
        versionsError.value = ''
      }
    } catch (e) {
      if (current === revision) versionsError.value = `Robot 版本信息：${e.message}`
    }
  } catch (e) {
    if (current === revision) error.value = e.message
  } finally {
    if (current === revision) loading = false
  }
}

async function perform(action) {
  const current = revision
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const response = await action()
    if (current !== revision) return
    if (response.item?.status === 'failed') error.value = response.item.error
    await refresh()
  } catch (e) {
    if (current === revision) error.value = e.message
  } finally {
    if (current === revision) busy.value = false
  }
}

async function upload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 32 * 1024 * 1024 * 1024) {
    error.value = '安装包超过 32 GiB'
    return
  }
  await perform(() => uploadImport(props.projectId, file))
}

async function copyDirectory() {
  try {
    await navigator.clipboard.writeText(directory.value)
    notice.value = '路径已复制'
  } catch {
    error.value = '浏览器未允许复制，请选中上方路径复制。'
  }
}

watch(
  () => [props.modelValue, props.projectId],
  () => {
    clearInterval(timer)
    revision += 1
    loading = false
    busy.value = false
    directory.value = ''
    items.value = []
    robots.value = []
    versionsError.value = ''
    installDialog.value = false
    error.value = ''
    notice.value = ''
    knownImports = new Set()
    if (props.modelValue && props.projectId) {
      refresh()
      timer = setInterval(refresh, 5000)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  revision += 1
  clearInterval(timer)
})
</script>

<style scoped>
.project-import {
  min-width: 0;
  max-height: calc(85vh - 110px);
  overflow-y: auto;
  padding-right: 4px;
  color: var(--el-text-color-primary);
}
.project-import p,
.project-import small {
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.install-progress {
  white-space: pre-wrap;
  max-height: 180px;
  overflow: auto;
  font-family: monospace;
  font-size: 12px;
}
.import-directory,
.import-upload {
  padding: 16px;
  margin: 16px 0;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
}
.import-directory code {
  display: block;
  padding: 12px 0;
  overflow-wrap: anywhere;
  user-select: text;
}
.import-directory small,
.import-upload label,
.import-upload small {
  display: block;
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
}
.import-upload input {
  max-width: 100%;
}
.import-heading,
.import-record-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.import-record-heading strong {
  overflow-wrap: anywhere;
  min-width: 0;
}
.import-record-heading .el-tag {
  flex-shrink: 0;
}
.import-records {
  list-style: none;
  padding: 0;
}
.import-records li {
  border-top: 1px solid var(--el-border-color);
  padding: 16px 0;
}
.import-records small {
  color: var(--el-text-color-secondary);
}
.import-error {
  color: var(--el-color-danger);
}
.package-selection {
  margin-bottom: 16px;
}
.package-selection .el-checkbox-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.package-selection :deep(.el-checkbox) {
  height: auto;
  margin: 6px 0;
  max-width: 100%;
}
.package-selection :deep(.el-checkbox__label) {
  white-space: normal;
  overflow-wrap: anywhere;
}
.package-selection small {
  display: block;
  color: var(--el-text-color-secondary);
}
</style>
