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

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
case_dir="$(mktemp -d)"
trap 'rm -rf "$case_dir"' EXIT

cp "$repo_root/ci/validate-release.sh" "$case_dir/validate-release.sh"

write_case() {
  local version="$1"
  printf '{"version":"%s"}\n' "$version" >"$case_dir/package.json"
  printf '{"version":"%s"}\n' "$version" >"$case_dir/package-lock.json"
  printf '# CHANGELOG\n\n## v0.2.0\n\n- release\n' >"$case_dir/CHANGELOG.md"
}

expect_pass() {
  local tag="$1"
  local version="$2"
  write_case "$version"
  (cd "$case_dir" && CI_COMMIT_TAG="$tag" bash ./validate-release.sh >/dev/null)
}

expect_fail() {
  local tag="$1"
  local version="$2"
  write_case "$version"
  if (cd "$case_dir" && CI_COMMIT_TAG="$tag" bash ./validate-release.sh >/dev/null 2>&1); then
    echo "期望校验失败但实际通过：tag=$tag source=$version" >&2
    exit 1
  fi
}

expect_pass "v0.2.0" "0.2.0"
expect_pass "v0.2.0-rc.1" "0.2.0-rc.1"
expect_fail "v0.2.0-rc.1" "0.2.0"
expect_fail "v0.2.0-beta.2" "0.2.0-rc.1"
expect_fail "release-0.2.0" "0.2.0"

# 发布版本正确之外，还必须确保安装包与 SHA-256 从 package 完整传递到 Release Assets。
bash "$repo_root/ci/validate-release-assets.sh" "$repo_root/ci/release.yml" >/dev/null

echo "发布版本校验测试通过"
