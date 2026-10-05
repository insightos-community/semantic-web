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
  <div class="attachment-gallery">
    <el-image
      v-for="item in attachments"
      :key="item.id"
      class="attachment-image"
      :src="urls[item.id] || item.previewUrl || ''"
      :preview-src-list="previewList"
      fit="cover"
      :alt="item.name || '对话图片'"
    >
      <template #placeholder><span class="image-state">加载中…</span></template>
      <template #error><span class="image-state">图片加载失败</span></template>
    </el-image>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import * as chatApi from '@/api/chat'

const props = defineProps({ attachments: { type: Array, default: () => [] } })
const urls = reactive({})
const ownedUrls = new Set()
// 输入框发送成功后会把本地 blob 预览地址的所有权转交给消息列表。
// 统一在画廊卸载时释放，既保证乐观消息可以立即显示，也避免切换会话后泄漏。
const transferredPreviewUrls = new Set()

watch(
  () => props.attachments,
  async (items) => {
    for (const item of items || []) {
      if (item?.previewUrl) transferredPreviewUrls.add(item.previewUrl)
      if (!item?.id || item.previewUrl || urls[item.id]) continue
      try {
        const blob = await chatApi.getAttachment(item.id)
        const url = URL.createObjectURL(blob)
        urls[item.id] = url
        ownedUrls.add(url)
      } catch {
        urls[item.id] = ''
      }
    }
  },
  { immediate: true, deep: true }
)

const previewList = computed(() =>
  (props.attachments || []).map((item) => urls[item.id] || item.previewUrl).filter(Boolean)
)

onBeforeUnmount(() => {
  for (const url of ownedUrls) URL.revokeObjectURL(url)
  for (const url of transferredPreviewUrls) URL.revokeObjectURL(url)
})
</script>

<style scoped lang="scss">
.attachment-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 760px;
  margin: 6px 0;
}
.attachment-image {
  width: 180px;
  height: 130px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  background: var(--sf-bg-tertiary);
}
.image-state {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
</style>
