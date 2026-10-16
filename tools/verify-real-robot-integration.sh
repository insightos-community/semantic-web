#!/usr/bin/env bash
# Copyright 2026 InsightOS
# SPDX-License-Identifier: Apache-2.0
# Local/CI checks only. No robot, model provider or deployment endpoint is used.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm ci --ignore-scripts
npm run lint
npm test -- --maxWorkers=4 --minWorkers=1
VITE_STUDIO_FIXTURES=false VITE_DEVICE_FIXTURES=false npm run build
test -s dist/index.html
