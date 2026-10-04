#!/usr/bin/env bash
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
