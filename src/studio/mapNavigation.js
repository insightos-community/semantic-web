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

// Keep map navigation consistent across 2D and 3D. MapControls itself handles
// Ctrl/Meta/Shift + left drag as rotate when LEFT is configured as PAN.
export function applyMapNavigationPreset(controls, constants, viewMode) {
  const threeDimensional = viewMode === '3d'
  controls.enablePan = true
  controls.enableZoom = true
  controls.enableRotate = threeDimensional
  // 顶视相机的 up 轴用于画面朝向，并不等于地面法线。2D 若按世界 up
  // 平移，射线与平移平面会平行而无法拖动；因此 2D 必须沿相机屏幕平面。
  controls.screenSpacePanning = true
  controls.mouseButtons.LEFT = constants.MOUSE.PAN
  controls.mouseButtons.RIGHT = threeDimensional ? constants.MOUSE.ROTATE : constants.MOUSE.PAN
  controls.touches.ONE = constants.TOUCH.PAN
  controls.touches.TWO = threeDimensional ? constants.TOUCH.DOLLY_ROTATE : constants.TOUCH.DOLLY_PAN
  return controls
}
