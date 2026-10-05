// Copyright 2026 InsightOS
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
