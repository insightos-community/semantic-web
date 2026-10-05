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

import { describe, expect, it } from 'vitest'
import { robotSkillDebugTemplate } from '@/robot/skillDebugTemplate'

describe('Robot Skill 人工调试输入', () => {
  it('只使用已发布 SKILL.md 提供的正式输入，不在 Web 猜测业务字段', () => {
    expect(
      JSON.parse(
        robotSkillDebugTemplate({
          extensions: {
            debug_input: {
              object_ref: 'tote-large-smoke',
              target: { target_ref: 'pallet-b-slot-r1-c1' }
            }
          }
        })
      )
    ).toEqual({
      object_ref: 'tote-large-smoke',
      target: { target_ref: 'pallet-b-slot-r1-c1' }
    })
  })

  it('旧包没有调试输入时保留通用 JSON 入口', () => {
    expect(robotSkillDebugTemplate({ extensions: {} })).toBe('{}')
  })
})
