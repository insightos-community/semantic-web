<template>
  <pre ref="viewport" @scroll="trackPosition">{{ text }}</pre>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'

const props = defineProps({ text: { type: String, default: '' } })
const viewport = ref(null)
let following = true
function trackPosition() {
  const node = viewport.value
  if (node?.clientHeight) following = node.scrollHeight - node.clientHeight - node.scrollTop < 24
}
function follow() {
  if (following && viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight
}
watch(() => props.text, follow, { flush: 'post' })
onMounted(follow)
</script>
