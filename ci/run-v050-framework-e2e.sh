#!/usr/bin/env bash
# Copyright 2026 InsightOS
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

# 连接真实 Semantic Server 的设备中心 E2E。
# Server 不可达或 Fixture 仍打开时立即失败，不能 skip 当绿。
: "${V050_FRAMEWORK_HTTP:?真实 v0.5 Web E2E 必须提供 V050_FRAMEWORK_HTTP}"
: "${V050_FRAMEWORK_WS:?真实 v0.5 Web E2E 必须提供 V050_FRAMEWORK_WS}"

if [[ "${VITE_STUDIO_FIXTURES:-false}" != "false" ]]; then
  echo "VITE_STUDIO_FIXTURES 必须为 false，禁止 Fixture 冒充真实 Server" >&2
  exit 2
fi

if [[ "${VITE_DEVICE_FIXTURES:-false}" == "true" ]]; then
  echo "VITE_DEVICE_FIXTURES 必须关闭" >&2
  exit 2
fi

export VITE_STUDIO_FIXTURES=false
export VITE_DEVICE_FIXTURES=false

curl --fail --silent --show-error --max-time 10 \
  "${V050_FRAMEWORK_HTTP%/}/api/v1/system/healthz" >/dev/null

npm run test:framework:v050
