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
  <div class="skill-detail">
    <el-alert v-if="error" class="detail-error" type="error" :title="error" show-icon closable />

    <div v-loading="loading" class="detail-body">
      <template v-if="skill">
        <header class="detail-header">
          <div>
            <span class="detail-kicker">STANDARD SKILL</span>
            <h2>{{ skill.name }}</h2>
            <p>{{ skill.description }}</p>
          </div>
          <el-tag effect="plain" type="success">SKILL.md 已加载</el-tag>
        </header>

        <div class="package-structure">
          <span class="is-ready"><i />SKILL.md · 上下文</span>
          <span :class="{ 'is-ready': resourceCount('scripts') > 0 }">
            <i />scripts/ · {{ resourceStatus('scripts') }}
          </span>
          <span :class="{ 'is-ready': resourceCount('references') > 0 }">
            <i />references/ · {{ resourceStatus('references') }}
          </span>
          <span :class="{ 'is-ready': resourceCount('assets') > 0 }">
            <i />assets/ · {{ resourceStatus('assets') }}
          </span>
        </div>

        <!-- frontmatter 标准字段表 -->
        <div class="field-card">
          <div class="field-row">
            <span class="field-label">name</span>
            <span class="field-value">{{ skill.name }}</span>
          </div>
          <div class="field-row">
            <span class="field-label">category</span>
            <span class="field-value"
              ><el-tag size="small" effect="plain">{{ skill.category }}</el-tag></span
            >
          </div>
          <div class="field-row">
            <span class="field-label">description</span>
            <span class="field-value">{{ skill.description }}</span>
          </div>
          <div class="field-row">
            <span class="field-label">when_to_use</span>
            <span class="field-value">{{ skill.when_to_use || '--' }}</span>
          </div>
          <!-- 扩展字段透传（frontmatter 标准键以外的键，服务端原样输出） -->
          <div v-for="key in extensionKeys" :key="key" class="field-row">
            <el-tooltip
              :content="`扩展字段 ${key}`"
              effect="dark"
              :show-after="500"
              placement="top"
            >
              <span class="field-label">{{ key }}</span>
            </el-tooltip>
            <pre class="field-value field-pre">{{ formatExtension(skill.extensions[key]) }}</pre>
          </div>
        </div>

        <!-- 正文：markdown 渲染（安全纪律同 MessageBubbleText：html 只能来自
             renderMarkdown，markdown-it 禁内联 HTML + DOMPurify 白名单消毒） -->
        <div class="body-card">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="skill-markdown" v-html="bodyHtml" />
        </div>

        <!-- 标准资源包浏览：详情首包只返回文件元数据，点击后再读取正文。
             二进制或超限资源由服务端明确拒绝，不尝试在浏览器猜测解码。 -->
        <section v-if="resources.length" class="resource-card">
          <header class="resource-head">
            <div>
              <strong>技能资源</strong>
              <span>scripts / references / assets</span>
            </div>
            <span>{{ resources.length }} 个文件</span>
          </header>
          <div class="resource-workspace">
            <nav class="resource-list" aria-label="技能资源文件">
              <button
                v-for="item in resources"
                :key="item.path"
                type="button"
                :class="{ 'is-active': selectedResourcePath === item.path }"
                @click="emit('select-resource', item.path)"
              >
                <span class="resource-kind">{{ item.kind }}</span>
                <span class="resource-path">{{ item.path }}</span>
                <span class="resource-size">{{ formatSize(item.size) }}</span>
              </button>
            </nav>
            <div v-loading="resourceLoading" class="resource-preview">
              <el-alert
                v-if="resourceError"
                type="error"
                :title="resourceError"
                show-icon
                :closable="false"
              />
              <template v-else-if="resource">
                <div class="preview-path">{{ resource.resource?.path }}</div>
                <pre><code>{{ resource.content }}</code></pre>
              </template>
              <div v-else class="preview-empty">选择左侧资源查看文本内容</div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
// 技能详情（右栏）：frontmatter 字段表（四标准字段 + 扩展字段透传）+
// 正文 markdown 渲染。只渲染不发请求；数据来自 skills store 的 detail。
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import 'highlight.js/styles/github-dark.css'

const props = defineProps({
  skill: { type: Object, default: null }, // {name, category, description, when_to_use, body, extensions?}
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  resource: { type: Object, default: null }, // {resource:{path,...}, content}
  resourceLoading: { type: Boolean, default: false },
  resourceError: { type: String, default: '' }
})

const emit = defineEmits(['select-resource'])

// 扩展字段键按名升序（渲染稳定，map 序不抖动）
const extensionKeys = computed(() => Object.keys(props.skill?.extensions || {}).sort())

const bodyHtml = computed(() => renderMarkdown(props.skill?.body || ''))
const resources = computed(() =>
  Array.isArray(props.skill?.resources) ? props.skill.resources : []
)
const selectedResourcePath = computed(() => props.resource?.resource?.path || '')

function resourceCount(kind) {
  return resources.value.filter((item) => item.kind === kind).length
}

function resourceStatus(kind) {
  const count = resourceCount(kind)
  return count > 0 ? `${count} 个文件` : '未提供'
}

function formatSize(value) {
  const size = Number(value) || 0
  if (size < 1024) return `${size} B`
  return `${(size / 1024).toFixed(1)} KiB`
}

// 扩展字段值统一格式化为 JSON（字符串直接展示，结构体缩进两格）
function formatExtension(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
</script>

<style scoped lang="scss">
.skill-detail {
  height: 100%;
  overflow-y: auto;
}

.detail-error {
  margin-bottom: var(--sf-space-4);
}

.detail-body {
  min-height: 120px;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 12px;
  padding: 4px 2px 14px;
  border-bottom: 1px solid var(--sf-border-light);

  h2 {
    margin: 3px 0 5px;
    color: var(--sf-text-primary);
    font-size: var(--sf-font-xl);
  }

  p {
    margin: 0;
    color: var(--sf-text-secondary);
    font-size: var(--sf-font-sm);
    line-height: 1.55;
  }
}

.detail-kicker {
  color: var(--sf-brand);
  font-size: 9px;
  font-weight: 520;
  letter-spacing: 0.12em;
}

.package-structure {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid var(--sf-border-light);
    border-radius: 7px;
    background: var(--sf-bg-primary);
    color: var(--sf-text-disabled);
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 10px;

    &.is-ready {
      color: var(--sf-success);
    }
  }

  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
}

.field-card {
  margin-bottom: var(--sf-space-4);
  padding: var(--sf-space-4);
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
}

.field-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sf-space-3);
  padding: var(--sf-space-1) 0;
  font-size: var(--sf-font-sm);
}

.field-label {
  flex: none;
  width: 120px;
  color: var(--sf-text-disabled);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-value {
  flex: 1;
  min-width: 0;
  color: var(--sf-text-secondary);
  word-break: break-word;
}

.field-pre {
  margin: 0;
  font-family: monospace;
  white-space: pre-wrap;
}

.body-card {
  padding: var(--sf-space-4);
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
}

.resource-card {
  margin-top: var(--sf-space-4);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-secondary);
  overflow: hidden;
}

.resource-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sf-space-3);
  padding: var(--sf-space-3) var(--sf-space-4);
  border-bottom: 1px solid var(--sf-border-light);

  div {
    display: flex;
    align-items: baseline;
    gap: var(--sf-space-2);
  }

  strong {
    color: var(--sf-text-primary);
    font-size: var(--sf-font-sm);
  }

  span {
    color: var(--sf-text-disabled);
    font-size: var(--sf-font-xs);
  }
}

.resource-workspace {
  display: grid;
  grid-template-columns: minmax(220px, 34%) minmax(0, 1fr);
  min-height: 260px;
}

.resource-list {
  padding: var(--sf-space-2);
  border-right: 1px solid var(--sf-border-light);
  background: var(--sf-bg-primary);

  button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sf-space-2);
    width: 100%;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--sf-radius-sm);
    background: transparent;
    color: var(--sf-text-secondary);
    text-align: left;
    cursor: pointer;

    &:hover,
    &.is-active {
      border-color: var(--sf-brand);
      background: var(--sf-brand-soft);
    }
  }
}

.resource-kind {
  color: var(--sf-brand);
  font-family: monospace;
  font-size: 9px;
  text-transform: uppercase;
}

.resource-path {
  overflow: hidden;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-size {
  color: var(--sf-text-disabled);
  font-size: 9px;
}

.resource-preview {
  min-width: 0;
  padding: var(--sf-space-3);

  pre {
    max-height: 440px;
    margin: 0;
    padding: var(--sf-space-3);
    border-radius: var(--sf-radius-md);
    background: var(--sf-bg-tertiary);
    color: var(--sf-text-primary);
    overflow: auto;
    white-space: pre;
  }
}

.preview-path {
  margin-bottom: var(--sf-space-2);
  color: var(--sf-text-secondary);
  font-family: monospace;
  font-size: var(--sf-font-xs);
}

.preview-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-sm);
}

@media (max-width: 800px) {
  .resource-workspace {
    grid-template-columns: 1fr;
  }

  .resource-list {
    border-right: 0;
    border-bottom: 1px solid var(--sf-border-light);
  }
}

// 正文排版与 MessageBubbleText 同一套令牌约定
.skill-markdown {
  color: var(--sf-text-primary);
  font-size: var(--sf-font-md);
  line-height: 1.7;
  word-break: break-word;

  :deep(h1),
  :deep(h2),
  :deep(h3) {
    margin: var(--sf-space-3) 0 var(--sf-space-2);
  }

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
