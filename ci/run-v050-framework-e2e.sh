#!/usr/bin/env bash
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
