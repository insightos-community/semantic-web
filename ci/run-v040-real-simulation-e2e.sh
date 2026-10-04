#!/usr/bin/env bash
set -euo pipefail

# 普通浏览器测试允许跳过真实 MuJoCo 场景；RC 门禁不允许。这里先检查
# Framework 地址和凭据，再显式打开真实测试，避免 Playwright 把 skip 记成成功。
: "${PLAYWRIGHT_BASE_URL:?RC 真实仿真 E2E 必须提供 Framework 的 PLAYWRIGHT_BASE_URL}"
: "${SEMANTIC_E2E_PASSWORD:?RC 真实仿真 E2E 必须提供 SEMANTIC_E2E_PASSWORD}"

if [[ "${SEMANTIC_REAL_SIMULATION_E2E:-}" != "1" ]]; then
  echo "SEMANTIC_REAL_SIMULATION_E2E 必须明确设置为 1" >&2
  exit 2
fi

curl --fail --silent --show-error --max-time 10 \
  "${PLAYWRIGHT_BASE_URL%/}/api/v1/system/healthz" >/dev/null
npm run test:e2e:simulation-real
