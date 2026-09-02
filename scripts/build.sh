#!/bin/bash
# dsh-concise build: 装依赖（若缺）→ tsc 编译 host（src -> lib）→ tsc 校验 client → tsdown 打包 client。
# 自包含：直接用本包 node_modules 的编译器，不依赖 DSH_CHECKOUT。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Installing dependencies (prefer offline, cheap when cached) ==="
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --prefer-offline
else
  npm install --no-audit --no-fund
fi

echo "=== Compiling host (src -> lib) ==="
node_modules/.bin/tsc -p tsconfig.json

echo "=== Type-checking client ==="
node_modules/.bin/tsc -p tsconfig.client.json --noEmit

echo "=== Bundling client (src/client -> lib/client.js) ==="
node_modules/.bin/tsdown

echo "=== dsh-concise build complete ==="
ls -la lib/client.js lib/index.js
