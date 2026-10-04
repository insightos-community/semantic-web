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
