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
  <div class="login-view">
    <!-- 深蓝品牌渐变氛围层 -->
    <div class="login-glow login-glow--a" aria-hidden="true"></div>
    <div class="login-glow login-glow--b" aria-hidden="true"></div>
    <div class="login-glow login-glow--c" aria-hidden="true"></div>

    <div class="login-card">
      <div class="login-brand">
        <img src="/logo-whale.svg" alt="Logo" class="login-mark" />
        <h1 class="login-title">Semantic Studio</h1>
        <p class="login-subtitle">多 Agent 协作控制台</p>
      </div>
      <el-form
        ref="formRef"
        class="login-form"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="onSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            :prefix-icon="User"
            autofocus
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button
          class="login-submit"
          type="primary"
          native-type="submit"
          :loading="submitting"
          @click="onSubmit"
        >
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Lock, User } from '@element-plus/icons-vue'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

const formRef = ref()
const submitting = ref(false)
const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

// 回跳目标：登录前被守卫拦下的地址；非法值兜底 /chat
function redirectTarget() {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/chat'
}

async function onSubmit() {
  if (submitting.value) return
  try {
    await formRef.value.validate()
  } catch {
    return // 校验失败：el-form 已在表单项就地提示
  }
  submitting.value = true
  try {
    await session.login(form.username.trim(), form.password)
    ui.notify({ type: 'success', message: '登录成功' })
    router.replace(redirectTarget())
  } catch (e) {
    ui.notify({ type: 'error', message: e.message || '登录失败，请稍后重试' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(160deg, #f5f7ff 0%, #eef3ff 45%, #e7efff 100%);
  position: relative;
  overflow: hidden;
}

// 品牌蓝氛围光晕（玻璃拟态登录页）
.login-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
  opacity: 0.55;

  &--a {
    width: 520px;
    height: 520px;
    top: -160px;
    right: -80px;
    background: #dcebff;
  }
  &--b {
    width: 460px;
    height: 460px;
    bottom: -180px;
    left: -120px;
    background: rgba(2, 83, 253, 0.12);
  }
  &--c {
    width: 260px;
    height: 260px;
    top: 46%;
    right: 10%;
    background: rgba(255, 225, 1, 0.14);
  }
}

.login-card {
  position: relative;
  width: 420px;
  padding: 44px 40px 40px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(2, 83, 253, 0.16);
}

.login-brand {
  text-align: center;
  margin-bottom: var(--sf-space-5);
}

.login-mark {
  display: inline-block;
  width: auto;
  max-width: 88px;
  height: 56px;
}

.login-title {
  margin: 18px 0 6px;
  font-size: 22px;
  font-weight: 630;
  color: var(--sf-text-primary);
}

.login-subtitle {
  margin: 0;
  font-size: var(--sf-font-sm);
  color: var(--sf-text-secondary);
}

.login-submit {
  width: 100%;
  margin-top: 6px;
  height: 40px;
  border-radius: 8px;
  font-weight: 520;
}

@media (prefers-reduced-motion: reduce) {
  .login-glow {
    filter: blur(40px);
  }
}
</style>
