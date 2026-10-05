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
  <div class="unavailable-panel">
    <span class="version-chip">暂不可用</span>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true }
})
</script>

<style scoped lang="scss">
.unavailable-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  height: 100%;
  padding: 32px;
  color: var(--sf-text-secondary);
  text-align: center;

  h2 {
    margin: 14px 0 6px;
    color: var(--sf-text-primary);
    font-size: 18px;
  }

  p {
    margin: 0 0 8px;
  }

  small {
    color: var(--sf-text-disabled);
  }
}

.version-chip {
  padding: 4px 9px;
  border: 1px solid var(--sf-border);
  border-radius: 999px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 520;
}
</style>
