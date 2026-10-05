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

# 用国内 apt / Playwright 镜像装 Chromium，避免拉 mcr.microsoft.com 官方镜像。
debian_mirror="${DEBIAN_MIRROR:-https://mirrors.aliyun.com}"
export PLAYWRIGHT_DOWNLOAD_HOST="${PLAYWRIGHT_DOWNLOAD_HOST:-https://npmmirror.com/mirrors/playwright}"

if [[ -f /etc/apt/sources.list.d/debian.sources ]]; then
  sed -i "s#https\\?://deb.debian.org#${debian_mirror}#g; s#https\\?://security.debian.org#${debian_mirror}#g" \
    /etc/apt/sources.list.d/debian.sources
fi
if [[ -f /etc/apt/sources.list ]]; then
  sed -i "s#https\\?://deb.debian.org#${debian_mirror}#g; s#https\\?://security.debian.org#${debian_mirror}#g" \
    /etc/apt/sources.list
fi

npx playwright install --with-deps chromium
