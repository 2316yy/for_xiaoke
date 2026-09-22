# GITHUB_HANDOFF · 向克苏鲁许愿 game2.5（集曜图鉴）

> 给「新对话里的 AI」和「你自己」的交接说明。
> 新开对话时，直接发送本文档「给新对话的提示词」一节中的内容即可。

## 一、项目与仓库

| 项 | 值 |
|---|---|
| 工作目录（git 仓库） | `~/game2.5_work`（**主目录**，所有提交在这里做） |
| 备份副本 | `/Volumes/outer_unlimited/vibetool/for_xiaoke/game2.5/`（改完手动 `cp` 同步） |
| 远端 | `https://github.com/2316yy/for_xiaoke.git`（分支 `main`） |
| 线上 | https://2316yy.github.io/for_xiaoke/ |
| 本地运行 | `cd ~/game2.5_work && /opt/homebrew/bin/node server.js` → http://127.0.0.1:7250/ |
| 凭据 | 已存 macOS 钥匙串（`git credential-osxkeychain`），**push 无需再要 token**；不要往聊天/文件里贴 PAT |

## 二、环境事实（踩过的坑，别重踩）

1. **node** 在 `/opt/homebrew/bin/node`（v26）；shell 里先 `export PATH=/opt/homebrew/bin:$PATH`。
2. **git 2.39.5**；`user.name=2316yy` / `user.email=2316751859@qq.com` 已配好（仓库级+全局）。
3. **本机终端（含 AI 工具）特性**：
   - 命令行里直接输入**中文**（尤其作为 git 提交消息）会导致命令挂死 → **提交消息一律走文件**（`-F` / `-f`）。
   - `git commit` 走 porcelain 会挂 → 用 **plumbing 流程**：`git write-tree` → `git commit-tree <tree> -p HEAD < 消息文件` → `git update-ref refs/heads/main <commit>`。本仓库的 `push.sh` 已封装。
   - 推送 github.com 偶发 `HTTP2 framing layer` 报错 → 重试并用 `git -c http.version=HTTP/1.1 push`。
4. **GitHub Pages**：仓库根有 `.nojekyll`（别删！否则 `node_modules` 被 Jekyll 吞掉 404）。推完等 **1~2 分钟**再验证：
   `curl -s -o /dev/null -w "%{http_code}" https://2316yy.github.io/for_xiaoke/`。
5. **/tmp 会被系统清理**，工具都放在 `~/cth_tools/`：
   - `playwright` 1.63（浏览器缓存在 `~/Library/Caches/ms-playwright`）
   - `@gltf-transform/cli|core|functions`、`sharp`、`meshoptimizer`
   - 回归脚本：`regress.cjs`（主页/签谱/结果页择日/移动端基础）、`regress2.cjs`（展台拖放/触屏滑动）
   - GLB 优化：`opt.mjs`（用法：`node opt.mjs 输入.glb 输出.glb 0.08`，管线 dedup→weld→simplify→prune→reorder→quantize）
6. 单文件不得超 GitHub 100MB；当前神像 `小克1.1.glb` 已优化到 ~3.7MB，**别把 56MB 原版提交回来**。

## 三、标准操作流（提交 + 上线）

```sh
cd ~/game2.5_work

# 1) 改代码并本地验证（起 server + 跑回归，见下）
# 2) 把中文提交说明写进文件（用编辑器写，别在命令行敲中文）：
#    ~/cth_tools/msg.txt
# 3) 一键提交+推送：
sh push.sh -f ~/cth_tools/msg.txt
# 4) 等 60~90s，验证线上：
curl -s -o /dev/null -w "%{http_code}\n" https://2316yy.github.io/for_xiaoke/
# 5) 同步备份盘（先 cd 到仓库根，glob 展开，避免手敲中文文件名）：
cd ~/game2.5_work
cp ./*.html ./*.js ./*.json ./*.md .nojekyll ./*.glb \
   "/Volumes/outer_unlimited/vibetool/for_xiaoke/game2.5/"
```

`push.sh` 做的事：`git add -A` → 无改动则退出 → plumbing 提交（消息从文件读）→ `HTTP/1.1 push origin main`。

## 四、回归与调试速查

```sh
# 本地回归（需要 server 已在 7250 跑）
cd ~/cth_tools && /opt/homebrew/bin/node regress.cjs   # 14 项：主页/签谱/择日/移动端
cd ~/cth_tools && /opt/homebrew/bin/node regress2.cjs  # 8 项：展台拖放/触屏滑动
```

- 线上调试：链接后加 `?dbg`（如 `.../for_xiaoke/?dbg`）→ 控制台输出方块拖拽事件日志。
- 页面调试钩子：`window.__controls`（镜头，含 `autoRotate`）、`window.__cubes.debugInfo()`、
  `window.__cubes.screenPos(key)` / `cellScreenPos(i,j)`、`window.__ritual`、`window.__dex.stats()`。
- 已知降级路径（出现「灰模」先查这里）：
  - 神像 GLB 加载失败 → 程序化剪影替身（`main.js` 的 `buildFallbackIdol`，console 会 warn）。
  - 曜日方块 GLB 懒加载失败 → 暗色线框坯（`cubes.js` 的 `makeBlank`，`loadState='fail'`）。
  - 两者目前**无自动重试**（待办：退避重试 2~3 次）。

## 五、给新对话的提示词（直接复制，改需求部分）

```
项目交接：向克苏鲁许愿 game2.5（集曜图鉴）。
仓库在 ~/game2.5_work，远端 GitHub 2316yy/for_xiaoke（分支 main），
线上 https://2316yy.github.io/for_xiaoke/ 。

请先读仓库根目录的 GITHUB_HANDOFF.md，严格按里面的环境事实与避坑流程操作
（中文提交消息走文件、git 用 plumbing、推送用 HTTP/1.1、凭据在 macOS 钥匙串无需 token）。

本次要做：
1) <需求一>
2) <需求二>

要求：改完后本地起 server（node server.js，端口 7250）验证，跑 ~/cth_tools 下的
regress.cjs / regress2.cjs 回归（无 console 报错），同步备份盘副本，然后用
`sh push.sh -f <消息文件>` 提交推送，最后等 1~2 分钟 curl 线上地址验证并向我回报。
```

极简版（小改动）：

```
继续 game2.5 项目（~/game2.5_work）：先读根目录 GITHUB_HANDOFF.md。
本次需求：<一句话>。完成后回归 + push.sh 提交推送 + 线上验证。
```

## 六、动过的关键设计（给接手者的背景）

- 方块三区摆放（2.5.2）：神像本体禁放 / 展台顶面可放（y=0，含射线高度补偿）/ 四周地面，`cubes.js` 的 `statueR/platformR/baseOuterR`。
- 结果页「再问之日」：±90 天择日续求（`game.js` 结果卡）。
- 设备探测：`html.is-touch / is-mobile`（`index.html` 头部内联脚本，`window.__device`）。
- 深色模式：`color-scheme: dark`（meta+CSS）防强制反色黑块。
- 布局/签录持久化：`localStorage: cth_dex_v1`。

## 七、64 签文案怎么改（人类入口）

- **唯一文案源文件**：根目录 `LOTS_COPY.md`（纯文本 / Markdown，64 签 + 每签 2~3 个心情标签 + 六档判词都在里面，直接读改）。
- **改完必须重建**：仓库根目录运行 `sh build-lots.sh`，它读取 `LOTS_COPY.md`，生成游戏实际加载的 `lots.js`。
  - 忘了重建可自检：`sh build-lots.sh --check`（不一致会非 0 退出并提示）。
  - 构建器：`tools/lots_build.cjs`；自测：`node tools/test_lots_build.cjs`（本机 node 不在 PATH 时，脚本会自动用 `/opt/homebrew/bin/node`）。
- **不要手改 `lots.js`**：它开头已标注为自动生成，直接改会在下次构建时被覆盖。
  - 极端情况（`LOTS_COPY.md` 丢失）可用 `node tools/lots_build.cjs --extract > /tmp/lots.md` 从现有 `lots.js` 反向恢复。
- **改错不会弄坏游戏**：构建器会校验 64 签数量、签号、签级（六档）、主题（十二个 key、每签 2~3 个、每个心情至少有一签）和每签四句；报错会指到行号，校验不通过不覆盖 `lots.js`。
- **心情标签怎么参与玩法**：`lots.js` 里每签的 `moods` 是 2~3 个心情 key；`game.js` 的 `pickLotForMood()` 只从带当前所选心情的签里抽（同池尽量不连抽），所以选心情就是选签池，签卡/签谱/曜录会显示「签心相应」三个标签并高亮当前心情。
- **心情语料**：`MOODS` 在 `game.js`（阴翳六 + 微光六，2.5.7 新增「勇气 / 释然」）；颜色镜像在 `dex.js` 的 `MOOD_META` 与 `cubes.js` 的方块底晕映射，三处颜色要一致。旧存档的 `grace`（感念）会在 `dex.js` 里自动迁移为 `gratitude`。
- **提交**：`LOTS_COPY.md` 与 `lots.js` 要一起提交；`push.sh` 的 `git add -A` 会自动带上。
- 卦名会驱动结果页的卦象图标（`game.js` 的 `hexLines`）：改卦名不会崩，但名称不符合六十四卦命名时图标会消失，尽量别随意改。
- `grade` 会影响结果页“理智消耗”，区间数值在 `tools/lots_build.cjs` 顶部 `SAN_RANGE`；那是数值配置，不属于文案。
