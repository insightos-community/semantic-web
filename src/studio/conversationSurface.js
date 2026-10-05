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

// Studio 持有唯一的对话实例；Dock 中的 Tab 只注册显示位置。
// 通过 Teleport 移动同一实例，避免最大化、移入中央时重建输入区和消息流。
export const conversationSurfaceKey = Symbol('studio-conversation-surface')
