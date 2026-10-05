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
  <!-- 安全纪律：html 只能来自 renderMarkdown（markdown-it 禁内联 HTML + DOMPurify
       白名单消毒），禁止 v-html 直出任何未消毒串 -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="bubble-text" v-html="html" />
</template>

<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import 'highlight.js/styles/github-dark.css'

const props = defineProps({
  text: { type: String, default: '' }
})

const html = computed(() => renderMarkdown(props.text))
</script>

<style scoped lang="scss">
.bubble-text {
  color: var(--sf-text-primary);
  font-size: var(--sf-font-md);
  line-height: 1.7;
  word-break: break-word;

  :deep(p) {
    margin: 0 0 var(--sf-space-2);

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(pre) {
    margin: var(--sf-space-2) 0;
    padding: var(--sf-space-3);
    border-radius: var(--sf-radius-md);
    background: var(--sf-bg-tertiary);
    overflow-x: auto;

    code {
      font-size: var(--sf-font-sm);
      background: transparent;
      padding: 0;
    }
  }

  :deep(code) {
    padding: 1px var(--sf-space-1);
    border-radius: var(--sf-radius-sm);
    background: var(--sf-bg-tertiary);
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: var(--sf-font-sm);
  }

  :deep(a) {
    color: var(--sf-brand);
  }

  :deep(ul),
  :deep(ol) {
    margin: var(--sf-space-2) 0;
    padding-left: var(--sf-space-5);
  }

  :deep(blockquote) {
    margin: var(--sf-space-2) 0;
    padding-left: var(--sf-space-3);
    border-left: 3px solid var(--sf-border);
    color: var(--sf-text-secondary);
  }

  :deep(table) {
    border-collapse: collapse;

    th,
    td {
      padding: var(--sf-space-1) var(--sf-space-2);
      border: 1px solid var(--sf-border);
    }
  }
}
</style>
