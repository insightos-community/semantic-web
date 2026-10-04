<template>
  <section class="scene-browser">
    <div class="browser-filters">
      <el-input
        v-model="query"
        clearable
        placeholder="搜索任务、物品或场景编号"
        aria-label="搜索场景"
      />
      <el-select v-model="group" clearable placeholder="全部任务集" aria-label="筛选任务集">
        <el-option v-for="item in groups" :key="item" :label="item" :value="item" />
      </el-select>
      <el-checkbox v-model="withPreview">有预览</el-checkbox>
    </div>
    <div class="browser-count">{{ filtered.length }} 个场景 · 点击卡片选择</div>
    <div class="browser-grid">
      <button
        v-for="scene in pageScenes"
        :key="scene.scene_id"
        class="browser-card"
        :class="{ selected: modelValue === scene.scene_id }"
        :aria-pressed="modelValue === scene.scene_id"
        type="button"
        @click="$emit('select', scene)"
      >
        <div class="browser-image">
          <span>{{ scene.preview ? '加载预览…' : '待生成预览' }}</span>
          <ScenePreviewImage
            v-if="scene.preview"
            :src="scene.preview"
            :alt="scene.name"
            :zoom-enabled="false"
          />
        </div>
        <div class="browser-copy">
          <small>{{ scene.display_id || scene.scene_id }}</small>
          <b :title="scene.name">{{ scene.name }}</b>
          <span
            >{{ scene.versions?.[0]?.variants?.length || 0 }} 个初态 ·
            {{ scene.loader || scene.engine }}</span
          >
          <span v-if="modelValue === scene.scene_id" class="browser-selected">已选择</span>
        </div>
      </button>
      <el-empty v-if="!filtered.length" description="没有符合条件的场景" :image-size="64" />
    </div>
    <el-pagination
      v-if="filtered.length > pageSize"
      v-model:current-page="page"
      :page-size="pageSize"
      :total="filtered.length"
      layout="prev, pager, next"
      small
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import ScenePreviewImage from './ScenePreviewImage.vue'
const props = defineProps({
  scenes: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' }
})
defineEmits(['select'])
const query = ref('')
const group = ref('')
const withPreview = ref(false)
const page = ref(1)
const pageSize = 12
// 分组取自目录的原生场景键，适用于后续任务集，无需列举 LIBERO 任务名。
const groupOf = (scene) =>
  scene.versions?.[0]?.runtime_scene_key?.split(':')[0] || scene.loader || scene.engine || '其他'
const groups = computed(() => [...new Set(props.scenes.map(groupOf))].sort())
const filtered = computed(() => {
  const words = query.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return props.scenes.filter((scene) => {
    const text = `${scene.name} ${scene.display_id || scene.scene_id}`.toLowerCase()
    return (
      words.every((word) => text.includes(word)) &&
      (!group.value || groupOf(scene) === group.value) &&
      (!withPreview.value || scene.preview)
    )
  })
})
const pageScenes = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize)
)
watch([query, group, withPreview], () => {
  page.value = 1
})
watch(
  () => filtered.value.length,
  () => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / pageSize)))
  }
)
</script>

<style scoped>
.browser-filters {
  display: flex;
  gap: 12px;
  align-items: center;
}
.browser-filters > .el-input {
  flex: 1;
  min-width: 160px;
}
.browser-filters > .el-select {
  width: 180px;
}
.browser-count {
  margin: 12px 0;
  color: var(--sf-text-secondary);
  font-size: 12px;
}
.browser-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(285px, 1fr));
  gap: 12px;
  max-height: 48vh;
  overflow: auto;
  padding: 2px;
  align-content: start;
}
.browser-card {
  display: flex;
  gap: 12px;
  min-width: 0;
  min-height: 132px;
  padding: 12px;
  border: 1px solid var(--sf-border-light);
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
}
.browser-card:hover {
  border-color: var(--sf-brand);
}
.browser-card.selected {
  border-color: var(--sf-brand);
  background: var(--sf-brand-soft);
}
/* 先保留图片空间，再异步加载；原始图片尺寸与加载时长都不会挤压文字。 */
.browser-image {
  position: relative;
  width: 104px;
  height: 104px;
  flex: 0 0 104px;
  overflow: hidden;
  border-radius: 7px;
  background: var(--sf-bg-tertiary);
  display: grid;
  place-items: center;
}
.browser-image > span {
  font-size: 11px;
  color: var(--sf-text-secondary);
}
.browser-image :deep(img) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--sf-bg-tertiary);
}
.browser-image :deep(img:not([src])) {
  opacity: 0;
}
.browser-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}
.browser-copy small {
  font-size: 11px;
  overflow-wrap: anywhere;
  color: var(--sf-brand);
}
.browser-copy b {
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}
.browser-copy > span {
  font-size: 11px;
  color: var(--sf-text-secondary);
}
.browser-copy > .browser-selected {
  color: var(--sf-brand);
}
.el-pagination {
  margin-top: 14px;
  justify-content: center;
}
@media (max-width: 620px) {
  .browser-filters {
    flex-wrap: wrap;
  }
  .browser-grid {
    grid-template-columns: 1fr;
  }
}
</style>
