#!/bin/sh
# game2.5 一键提交 + 推送（避坑版）
# 用法：
#   sh push.sh -f /path/to/msgfile   # 推荐：提交消息写在文件里（避免命令行中文 tty 卡死）
#   sh push.sh "message"             # 快捷：直接给消息（本机终端如遇中文卡死，请改用 -f）
# 说明：本环境 git commit porcelain 会挂，故走 plumbing（write-tree/commit-tree/update-ref）。
set -e
cd "$(dirname "$0")"

MSG_FILE=""
if [ "$1" = "-f" ] && [ -n "$2" ]; then
  MSG_FILE="$2"
elif [ -n "$1" ]; then
  MSG_FILE=$(mktemp /tmp/gitmsg.XXXXXX)
  printf '%s\n' "$1" > "$MSG_FILE"
else
  echo "用法: sh push.sh -f <消息文件>   或   sh push.sh \"提交说明\""
  exit 1
fi
[ -f "$MSG_FILE" ] || { echo "消息文件不存在: $MSG_FILE"; exit 1; }

git add -A
if git diff --cached --quiet; then
  echo "没有需要提交的改动"
  exit 0
fi

NAME=$(git config user.name  || echo "2316yy")
EMAIL=$(git config user.email || echo "2316751859@qq.com")
TREE=$(git write-tree)
COMMIT=$(GIT_AUTHOR_NAME="$NAME" GIT_AUTHOR_EMAIL="$EMAIL" \
         GIT_COMMITTER_NAME="$NAME" GIT_COMMITTER_EMAIL="$EMAIL" \
         git commit-tree "$TREE" -p HEAD < "$MSG_FILE")
git update-ref refs/heads/main "$COMMIT"
echo "本地提交: $COMMIT"

git -c http.version=HTTP/1.1 push origin main
echo "推送完成: $(git rev-parse --short HEAD)"
