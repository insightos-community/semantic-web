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
  <div class="legacy-redirect">正在打开 Project Studio…</div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const router = useRouter()
const project = useProjectStore()

onMounted(async () => {
  if (!project.items.length) await project.load()
  const active =
    project.activeProject || project.items.find((item) => !item.archived && !item.archived_at)
  if (!active) {
    router.replace('/projects')
    return
  }
  const panel = route.meta.studioPanel || 'conversation'
  const resourceId = route.params.traceId || ''
  const query = { panel }
  if (resourceId) query.resource_id = resourceId
  router.replace({ path: `/projects/${active.id}/studio`, query })
})
</script>

<style scoped>
.legacy-redirect {
  display: grid;
  height: 100%;
  color: var(--sf-text-secondary);
  place-items: center;
}
</style>
