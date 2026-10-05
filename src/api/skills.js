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

// 技能库 API（skills store 数据源）。
// 后端契约（internal/server/http/handlers/skills.go，以代码为准）：
// - GET /skills → {skills:[{name, category, description, when_to_use}]}
//   （category 升序分组、组内 name 升序；清单不含正文；无技能形态返回空数组）
// - GET /skills/{name} → {skill:{name, category, description, when_to_use, body,
//   extensions?, resources:[{path, kind, media_type, size}]}}
//   （body 为 markdown 正文；extensions 为扩展字段透传，无扩展时缺省；
//   resources 只给资源元数据，不在详情首包内联文件正文）
// - GET /skills/{name}/resources/{path} → {resource:{...}, content}
//   （只允许读取标准资源目录下受大小限制的 UTF-8 文本）
import request from './request'

export function listSkills() {
  return request.get('/skills')
}

// Robot Skill 与普通 Skill 都以 SKILL.md 为说明入口，但运行生命周期不同：
// 普通 Skill 进入 Agent 上下文，Robot Skill 必须安装到指定 Pilot 后由 robot.run 执行。
// 前端统一浏览两类技能，安装和启停仍走设备域接口，不能把二者混成同一种运行方式。
export function listRobotSkills() {
  return request.get('/robot-skills/')
}

export function getRobotSkill(name, version) {
  return request.get(`/robot-skills/${encodeURIComponent(name)}/${encodeURIComponent(version)}`)
}

export function getRobotSkillResource(name, version, path) {
  const encodedPath = String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return request.get(
    `/robot-skills/${encodeURIComponent(name)}/${encodeURIComponent(version)}/resources/${encodedPath}`
  )
}

export function getSkill(name) {
  return request.get(`/skills/${encodeURIComponent(name)}`)
}

// 按需读取标准 Skill 包中的文本资源。逐段编码路径，既保留目录层级，
// 又不能让文件名中的特殊字符改变 API 路由。
export function getSkillResource(name, path) {
  const encodedPath = String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return request.get(`/skills/${encodeURIComponent(name)}/resources/${encodedPath}`)
}
