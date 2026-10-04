<template>
  <div class="tool-list">
    <div v-for="group in groups" :key="group.category" class="tool-group">
      <div class="group-title">
        <span>{{ group.category }}</span>
        <span>{{ group.tools.length }}</span>
      </div>
      <el-tooltip
        v-for="tool in group.tools"
        :key="tool.key"
        :content="tool.description"
        :disabled="!tool.description"
        effect="dark"
        :show-after="500"
        placement="right"
      >
        <button
          type="button"
          class="tool-item"
          :class="{ 'is-active': tool.key === activeKey }"
          @click="$emit('select', tool.key)"
        >
          <span class="tool-heading">
            <span class="tool-name">{{ tool.name }}</span>
            <i
              class="health-dot"
              :class="tool.health === 'unavailable' ? 'is-unavailable' : 'is-healthy'"
            />
          </span>
          <span class="tool-desc">{{ tool.description || '暂无描述' }}</span>
          <span class="tool-meta">{{ tool.sourceTitle }} · {{ tool.risk || 'low' }}</span>
        </button>
      </el-tooltip>
    </div>
    <div v-if="groups.length === 0" class="list-empty">没有符合条件的工具</div>
  </div>
</template>

<script setup>
defineProps({
  groups: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' }
})

defineEmits(['select'])
</script>

<style scoped lang="scss">
.tool-list {
  display: flex;
  flex-direction: column;
  padding: var(--sf-space-2);
}

.group-title {
  display: flex;
  justify-content: space-between;
  padding: var(--sf-space-2) var(--sf-space-3) var(--sf-space-1);
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tool-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 9px var(--sf-space-3);
  border: none;
  border-radius: var(--sf-radius-md);
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--sf-bg-tertiary);
  }

  &.is-active {
    background: var(--sf-bg-tertiary);

    .tool-name {
      color: var(--sf-brand);
    }
  }
}

.tool-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
}

.tool-name {
  flex: 1;
  overflow: hidden;
  color: var(--sf-text-primary);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: var(--sf-font-sm);
  font-weight: 520;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;

  &.is-healthy {
    background: var(--sf-success);
  }

  &.is-unavailable {
    background: var(--sf-danger);
  }
}

.tool-desc,
.tool-meta {
  width: 100%;
  overflow: hidden;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-meta {
  color: var(--sf-text-disabled);
}

.list-empty {
  padding: 36px 16px;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-sm);
  text-align: center;
}
</style>
