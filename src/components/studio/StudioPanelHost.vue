<template>
  <component
    :is="definition.resolvedComponent"
    v-if="definition?.resolvedComponent"
    :panel-params="panelParams"
  />
  <UnavailablePanel
    v-else
    :title="definition?.title || '未知面板'"
    :description="definition?.unavailable || '该面板类型无法加载，请重置当前布局。'"
  />
</template>

<script setup>
import { computed } from 'vue'
import UnavailablePanel from '@/components/studio/panels/UnavailablePanel.vue'
import { getPanelDefinition } from '@/studio/panelRegistry'

const props = defineProps({
  params: { type: Object, default: () => ({}) }
})

// Dockview 7 的 components 注册模式会把面板参数放在 params.params；slot
// 模式则可能直接给 params。统一解包后，恢复旧布局和运行时新开面板使用同一路径。
const panelParams = computed(() => props.params?.params || props.params || {})
const definition = computed(() => getPanelDefinition(panelParams.value.panelType))
</script>
