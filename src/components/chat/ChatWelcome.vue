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
  <div class="chat-welcome" :class="{ 'is-compact': compact }">
    <div class="welcome-copy">
      <h2>和 Agent 一起工作</h2>
      <p>描述目标、提出问题，或添加图片。</p>
    </div>
    <div class="scenario-grid">
      <button
        v-for="item in scenarios"
        :key="item.title"
        type="button"
        @click="$emit('select', item.prompt)"
      >
        <span v-if="!compact">{{ item.index }}</span>
        <b>{{ item.title }}</b>
        <p v-if="!compact">{{ item.description }}</p>
        <small v-if="!compact">{{ item.action }} →</small>
      </button>
    </div>
  </div>
</template>

<script setup>
defineEmits(['select'])
defineProps({ compact: { type: Boolean, default: false } })

const scenarios = [
  {
    index: '01',
    title: 'Agent 对话调试',
    description: '验证模型选择、思考策略与连续对话。',
    action: '填写调试任务',
    prompt: '请说明你当前使用的模型、可用工具，并给出执行这项任务的计划。'
  },
  {
    index: '02',
    title: '工具链验证',
    description: '观察工具参数、结果、归属和 Trace。',
    action: '填写验证任务',
    prompt: '请选择一个当前可用的只读工具执行，并解释工具参数与返回结果。'
  },
  {
    index: '03',
    title: '视觉输入分析',
    description: '上传图片，验证 VLM 输入和 Artifact 引用。',
    action: '准备视觉任务',
    prompt: '我将上传一张图片，请识别关键对象并说明分析依据。'
  }
]
</script>

<style scoped lang="scss">
.chat-welcome {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  padding: 34px 12px;
}

.welcome-copy {
  max-width: 620px;
  span {
    color: var(--sf-brand);
    font-size: 10px;
    font-weight: 380;
    letter-spacing: 0.14em;
  }
  h2 {
    margin: 8px 0;
    color: var(--sf-text-primary);
    font-size: 24px;
    font-weight: 630;
  }
  p {
    margin: 0;
    color: var(--sf-text-secondary);
    font-size: 13px;
    line-height: 1.65;
  }
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 24px;

  button {
    display: flex;
    min-height: 154px;
    flex-direction: column;
    align-items: flex-start;
    padding: 15px;
    border: 1px solid var(--sf-border-light);
    border-radius: 12px;
    background: color-mix(in srgb, var(--sf-bg-secondary) 82%, transparent);
    text-align: left;
    cursor: pointer;
    transition: 0.16s ease;

    &:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--sf-brand) 35%, var(--sf-border));
      box-shadow: var(--sf-shadow-sm);
    }
    > span {
      color: var(--sf-text-disabled);
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }
    b {
      margin-top: 16px;
      color: var(--sf-text-primary);
      font-size: 13px;
    }
    p {
      margin: 7px 0 14px;
      color: var(--sf-text-secondary);
      font-size: 11px;
      line-height: 1.5;
    }
    small {
      margin-top: auto;
      color: var(--sf-brand);
      font-size: 10px;
    }
  }
}

@media (max-width: 760px) {
  .scenario-grid {
    grid-template-columns: 1fr;
  }
}
.is-compact {
  padding: 28px 2px;
  justify-content: flex-start;
  .welcome-copy h2 {
    font-size: 17px;
    font-weight: 600;
  }
  .welcome-copy p {
    font-size: 14px;
  }
  .scenario-grid {
    grid-template-columns: 1fr;
    gap: 4px;
    margin-top: 20px;
  }
  .scenario-grid button {
    min-height: 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: transparent;
    border-color: transparent;
  }
  .scenario-grid button:hover {
    transform: none;
    box-shadow: none;
    background: var(--sf-bg-hover);
  }
  .scenario-grid b {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--sf-text-secondary);
  }
}
</style>
