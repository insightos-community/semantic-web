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
  <section class="evaluation-panel">
    <header>
      <h2>Evaluation Result</h2>
      <el-button size="small" @click="refresh">刷新</el-button>
    </header>
    <el-alert v-if="!descriptor" title="当前场景版本未声明评测能力" type="info" :closable="false" />
    <template v-else>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="Provider">{{ descriptor.provider }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ descriptor.evaluation_kind }}</el-descriptions-item>
        <el-descriptions-item label="指标">
          {{ descriptor.metrics?.join('、') }}
        </el-descriptions-item>
        <el-descriptions-item label="对比评测">
          {{ descriptor.supports_comparison ? '支持' : '不支持' }}
        </el-descriptions-item>
      </el-descriptions>
      <pre v-if="store.evaluation">{{ JSON.stringify(store.evaluation, null, 2) }}</pre>
      <div v-else class="empty">当前实例尚未产生评测结果。</div>
    </template>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
const store = useSimulationStore()
const descriptor = computed(() => store.evaluationDescriptor)
const refresh = () => store.refreshRuntimeData()
</script>
<style scoped>
.evaluation-panel {
  height: 100%;
  padding: 22px;
  overflow: auto;
  background: var(--sf-bg-secondary);
}
.evaluation-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.evaluation-panel pre {
  padding: 14px;
  overflow: auto;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
}
.empty {
  padding: 24px;
  color: var(--sf-text-disabled);
  text-align: center;
}
</style>
