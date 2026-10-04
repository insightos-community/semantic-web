<template>
  <section
    class="robot-runtime-status"
    :class="{ compact }"
    :data-testid="testId"
    :data-executable="runtimeAllowsRobotExecution(runtime)"
  >
    <template v-if="runtime">
      <div class="runtime-heading">
        <span>Robot Runtime</span>
        <DeviceStatus :status="runtime.status" />
      </div>
      <b>{{ runtime.instance_id || 'Runtime Instance 未命名' }}</b>
      <small v-if="runtime.scene_instance_id">Scene {{ runtime.scene_instance_id }}</small>
      <p v-if="runtime.failure_reason" class="failure">{{ runtime.failure_reason }}</p>
      <small v-if="runtimeAllowsRobotExecution(runtime)" class="executable"> Robot 已可执行 </small>
      <small v-else>等待 Server 确认 Robot 可执行</small>
    </template>
    <template v-else>
      <div class="runtime-heading">
        <span>Robot Runtime</span>
        <DeviceStatus status="not_reported" />
      </div>
      <small>Server 尚未上报 Runtime Instance</small>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { runtimeAllowsRobotExecution } from '@/devices/runtimeState'

const props = defineProps({
  runtime: { type: Object, default: null },
  robotId: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})

const testId = computed(() => `robot-runtime-${props.robotId || 'unknown'}`)
</script>

<style scoped lang="scss">
.robot-runtime-status {
  display: flex;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-secondary);
  flex-direction: column;
  gap: 6px;
}
.runtime-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.runtime-heading > span,
small {
  color: var(--sf-text-disabled);
  font-size: 9px;
}
b,
small,
p {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
}
b,
small {
  white-space: nowrap;
}
b {
  font-size: 11px;
}
.failure {
  color: var(--sf-danger);
  font-size: 10px;
  line-height: 1.45;
}
.executable {
  color: var(--sf-success);
}
.compact {
  padding: 0;
  border: 0;
  background: transparent;
  gap: 4px;
}
.compact .runtime-heading > span {
  display: none;
}
.compact .runtime-heading {
  justify-content: flex-start;
}
.compact .failure {
  max-width: 190px;
  white-space: nowrap;
}
</style>
