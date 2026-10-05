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
