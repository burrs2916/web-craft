#!/usr/bin/env bash
# 交叉编译 webcraft-server（linux musl 静态产物，见 docs/server-integration-design.md D-SI5）。
# 依赖：rustup target add <target>；cargo install cargo-zigbuild --locked
# 用法：scripts/build-server.sh [target ...]（默认 x86_64-unknown-linux-musl）
set -euo pipefail

cd "$(dirname "$0")/.."

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=("x86_64-unknown-linux-musl")
fi

for target in "${targets[@]}"; do
  echo "==> building $target"
  cargo zigbuild --release --target "$target" -p webcraft-server
  bin="target/$target/release/webcraft-server"
  echo "==> $bin ($(du -h "$bin" | cut -f1))"
done
