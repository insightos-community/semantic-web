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
