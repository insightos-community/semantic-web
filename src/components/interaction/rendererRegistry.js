import { defineAsyncComponent, markRaw } from 'vue'

const definitions = {
  confirm: () => import('./renderers/ConfirmRenderer.vue'),
  form: () => import('./renderers/FormRenderer.vue'),
  parameter: () => import('./renderers/FormRenderer.vue'),
  single_select: () => import('./renderers/ChoiceRenderer.vue'),
  multi_select: () => import('./renderers/ChoiceRenderer.vue'),
  image_select: () => import('./renderers/ResourceChoiceRenderer.vue'),
  file_select: () => import('./renderers/ResourceChoiceRenderer.vue'),
  map_select: () => import('./renderers/MapSelectRenderer.vue')
}

const resolved = new Map()

export function getInteractionRenderer(uiKind) {
  const loader = definitions[uiKind]
  if (!loader) return null
  if (!resolved.has(uiKind)) {
    resolved.set(uiKind, markRaw(defineAsyncComponent(loader)))
  }
  return resolved.get(uiKind)
}

export const supportedInteractionRenderers = Object.freeze(Object.keys(definitions))
