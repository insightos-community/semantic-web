<template>
  <section class="device-debug" data-testid="device-debug">
    <nav role="tablist" aria-label="技能与基础调试">
      <button role="tab" type="button" :aria-selected="tab === 'skills'" @click="tab = 'skills'">
        Robot Skill
      </button>
      <button
        role="tab"
        type="button"
        :aria-selected="tab === 'abilities'"
        @click="tab = 'abilities'"
      >
        Ability 基础调试
      </button>
    </nav>
    <DeviceSkillsPanel
      v-if="tab === 'skills'"
      :robot="robot"
      :initial-skill-key="skillKey"
      inline-debug
    />
    <DeviceAbilitiesPanel v-else :robot="robot" :initial-ability-id="abilityId" />
  </section>
</template>
<script setup>
import { ref, watch } from 'vue'
import DeviceSkillsPanel from '@/components/device/DeviceSkillsPanel.vue'
import DeviceAbilitiesPanel from '@/components/device/DeviceAbilitiesPanel.vue'
const props = defineProps({
  robot: { type: Object, required: true },
  initialTab: { type: String, default: 'skills' },
  abilityId: { type: String, default: '' },
  skillKey: { type: String, default: '' }
})
const tab = ref('skills')
watch(
  () => props.initialTab,
  (value) => {
    if (['skills', 'abilities'].includes(value)) tab.value = value
  },
  { immediate: true }
)
</script>
<style scoped>
.device-debug {
  min-width: 0;
}
nav {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
}
button {
  padding: 7px 12px;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-secondary);
  cursor: pointer;
}
button[aria-selected='true'] {
  border-color: var(--sf-brand);
  color: var(--sf-brand);
}
.device-debug :deep(.skills-panel) {
  padding: 4px 16px 16px;
}
</style>
