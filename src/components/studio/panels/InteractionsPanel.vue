<template>
  <section class="interactions-panel">
    <header>
      <b>Interactions</b>
      <span>{{ interactions.pending.length }} 个等待用户输入</span>
    </header>
    <div v-if="interactions.pending.length === 0" class="empty">当前没有待处理 Interaction</div>
    <div
      v-for="record in interactions.pending"
      :key="record.id"
      class="interaction-card"
      @click="select(record)"
    >
      <InteractionShell :interaction="record" />
    </div>
  </section>
</template>

<script setup>
import InteractionShell from '@/components/interaction/InteractionShell.vue'
import { useInteractionsStore } from '@/stores/interactions'
import { useLayoutStore } from '@/stores/layout'

const interactions = useInteractionsStore()
const layout = useLayoutStore()

function select(record) {
  layout.select({
    resourceType: 'interaction',
    resourceId: record.id,
    title: record.question
  })
}
</script>

<style scoped lang="scss">
.interactions-panel {
  height: 100%;
  padding: 0 12px 12px;
  overflow: auto;
  background: var(--sf-bg-primary);

  > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 38px;
    color: var(--sf-text-primary);

    span {
      color: var(--sf-text-disabled);
      font-size: 11px;
    }
  }
}

.interaction-card + .interaction-card {
  margin-top: 10px;
}

.empty {
  display: grid;
  min-height: 100px;
  place-items: center;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
</style>
