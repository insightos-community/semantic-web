<template>
  <router-view />
</template>

<script setup>
import { watchEffect } from 'vue'
import { useUiStore } from '@/stores/ui'

// 主题偏好由 Pinia 持久化；根组件负责把状态同步到 document，登录页与工作台
// 使用同一套设计令牌。
const ui = useUiStore()
watchEffect(() => {
  document.documentElement.classList.toggle('dark', ui.theme === 'dark')
})
</script>
