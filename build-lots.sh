#!/bin/sh
# ============================================================
# 《向克苏鲁许愿》文案构建入口
#   读取根目录 LOTS_COPY.md → 生成游戏实际加载的 lots.js
#
# 用法：
#   sh build-lots.sh            # 生成/更新 lots.js
#   sh build-lots.sh --check    # 只检查是否忘了同步，不改文件
# ============================================================
set -eu
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  NODE=node
elif [ -x /opt/homebrew/bin/node ]; then
  NODE=/opt/homebrew/bin/node
else
  echo "找不到 node。本机可尝试先执行：export PATH=/opt/homebrew/bin:\$PATH" >&2
  exit 1
fi

exec "$NODE" tools/lots_build.cjs "$@"
