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
  <el-dialog
    :model-value="modelValue"
    :title="editingName ? `轮换密钥 · ${editingName}` : '新建密钥'"
    width="440px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="模型端点" prop="name">
        <!-- 新建：后端要求 name 必须是已存在的 LLM 端点名，故用下拉限定 -->
        <el-select
          v-if="!editingName"
          v-model="form.name"
          placeholder="选择端点"
          class="full-width"
        >
          <el-option v-for="n in providerNames" :key="n" :label="n" :value="n" />
        </el-select>
        <el-input v-else :model-value="editingName" disabled />
      </el-form-item>
      <el-form-item label="密钥" prop="keyValue">
        <el-input
          v-model="form.keyValue"
          type="password"
          show-password
          autocomplete="new-password"
          :placeholder="editingName ? '输入新密钥以轮换' : '输入密钥明文（提交后仅显示掩码）'"
          @keyup.enter="onSubmit"
        />
      </el-form-item>
    </el-form>
    <div class="dialog-tip">明文仅随本次请求提交，服务端只回显掩码，前端不保存原文。</div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// 密钥新建/轮换对话框：名称（新建下拉限定端点 / 轮换锁定）+ 密码输入框。
// 校验与后端一致（settings.go：key_value 非空且 ≥ 8）；提交后经事件上抛，
// 由 SettingsView 调 store 并在成功后关闭——本组件不触达 API。
import { reactive, ref } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  providerNames: { type: Array, default: () => [] }, // 可选端点名（新建时下拉）
  editingName: { type: String, default: '' }, // 非空为轮换模式（名称锁定）
  submitting: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'submit'])

const formRef = ref()
const form = reactive({ name: '', keyValue: '' })

const rules = {
  name: [{ required: true, message: '请选择模型端点', trigger: 'change' }],
  keyValue: [
    { required: true, message: '请输入密钥', trigger: 'blur' },
    { min: 8, message: '密钥长度至少 8 字符', trigger: 'blur' }
  ]
}

// 每次打开重置表单与校验态（避免残留上一轮明文/错误提示）
function onOpen() {
  form.name = props.editingName || ''
  form.keyValue = ''
  formRef.value?.clearValidate()
}

async function onSubmit() {
  if (props.submitting) return
  try {
    await formRef.value.validate()
  } catch {
    return // 校验失败：el-form 就地提示
  }
  emit('submit', { name: form.name, keyValue: form.keyValue })
}
</script>

<style scoped lang="scss">
.full-width {
  width: 100%;
}

.dialog-tip {
  font-size: var(--sf-font-xs);
  color: var(--sf-text-disabled);
}
</style>
