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
  <section class="trace-view">
    <header>
      <el-button size="small" text :icon="ArrowLeft" @click="router.push('/chat')">
        返回对话
      </el-button>
      <b>模型与工具调用</b>
    </header>
    <TraceExplorer
      :trace-id="String(route.params.traceId || '')"
      :run-id="String(route.query.run_id || '')"
    />
  </section>
</template>
<script setup>
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import TraceExplorer from '@/components/trace/TraceExplorer.vue'
const route = useRoute()
const router = useRouter()
</script>
<style scoped>
.trace-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--sf-border-light);
  font-size: 12px;
}
.trace-view :deep(.trace-explorer) {
  min-height: 0;
  flex: 1;
}
</style>
