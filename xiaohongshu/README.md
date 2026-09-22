# 向克苏鲁许愿 · 小红书 3D 小工具版

按 `.skill/minitool-zip-builder/SKILL.md`（v1.6.0）及其 references 打包；按你的要求**保留完整 3D**（Three.js + 神像 idol + 8 个曜方模型），只对体积和容器脚本形态做了适配。

## 产物

- 上传包：`xiaohongshu/cthulhu-xhs-3d-1.0.0.zip`（2.20 MiB，`index.html` 在 zip 根）
- 解压目录（可直接本地起静态服务预览）：`xiaohongshu/dist/`
- 优化后模型源：`xiaohongshu/models3d/`（idol.glb + cubes/*.glb）
- 重新构建：`node tools/build_xhs_3d.mjs`
- 重新校验：`node tools/check_xhs_minitool.mjs xiaohongshu/dist --allow-3d`

## dist 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 入口；无内联脚本、无 importmap/module |
| `device.js` | 原头部的设备探测脚本外置（CSP 禁止内联脚本） |
| `app3d.js` | three.js + OrbitControls + GLTFLoader + RoomEnvironment + main.js + cubes.js 的经典 IIFE（esbuild --target=chrome61 --minify） |
| `assets/idol.glb` | 神像模型：3.79MB → 1.89MB，约 7.9 万三角面，贴图最大 512 |
| `assets/cubes/*.glb` | 8 个曜方模型：各 82~167KB（原 0.7~1.4MB），约 4.6k 面，贴图最大 256 |
| `lots.js` | 64 签文案 + 12 心情标签 + 签级判词 |
| `audio.js` | Web Audio 音效（首次用户手势后解锁） |
| `dex.js` | 集曜 / 签谱 / 曜录（localStorage 持久化） |
| `game.js` | 许愿 / 摇签 / 结果卡流程；剪贴板 API 已替换 |
| `xhs-ui.js` | 复制浮层、Flex gap 行为检测、3D 失败兜底（收 loader / Canvas 2D 星空） |
| `compat.css` | Chrome 61 基线回退层（flex 间距 / 焦点 / 复制浮层 / #app 背景） |

## 校验摘要

- skill 自带 Node 审计（dist）：`PASS: 18 file(s), 0 warning(s)`
- skill 自带 Python 审计（zip）：`PASS: 18 file(s), 1 warning(s)`（zip 2.20 MiB，仅超过 2 MiB 建议值，未超 10 MiB 上限）
- 自有静态校验（`--allow-3d`）：`通过 · FAIL 0 / WARN 1`
  - `index.html` 在 zip 根，未多套目录；文件类型全部允许（按你要求额外允许 `.glb`）
  - 无内联 `<script>` / 行内事件 / `javascript:`；无 `type="module"` / importmap / import-export
  - 无 http(s) 外部资源引用；`index.html` 引用文件齐全；8 个曜方 + idol 模型均在包内
  - 无被禁 Web API（剪贴板 / 定位 / 传感器 / Worker / WebSocket / 全屏等）；`eval` / `new Function` / WebAssembly 均无
  - CSS 基线回退：无 `inset` / `env()` / `dvh` / `min()` / `max()` / `clamp()` 残留，`color-mix` 前均有 rgba 色兜底
  - WARN：`app3d.js` 内 three.js 加载器的 `fetch(` 属于库内本地模型读取，没有远程请求
- 浏览器端到端探针（桌面 1280×800 + 移动 390×844）：`ALL PASS 18/18`
  - WebGL canvas / `__ritual` / `__cubes` 就绪；idol.glb 与曜方 glb 均 200；无兜底/剪影警告
  - 勇气 / 释然抽签、心情签池、签卡三标签、复制浮层、签谱 64 格全部正常；`CONSOLE CLEAN`，无 4xx/5xx
- 模型总量 2.9MB，zip 2.20 MiB，满足 10 MiB 上传硬上限。

## 与 skill 默认规范的差异（按你的要求）

| 项 | skill 默认 | 本包 |
| --- | --- | --- |
| `.glb` 文件 | 允许类型不含 `.glb` | 保留 `.glb`（idol + 8 曜方） |
| 网络请求 | 禁止 fetch/XHR | three.js 加载器用 XHR/fetch 读取**本地相对路径**模型；无任何远程请求 |
| 体积建议 | 建议 ≤ 2 MiB | 2.20 MiB（略超建议，远低于 10 MiB 上限） |
| 3D | 可用 WebGL，但需 GPU 预算与降级 | 保留完整 3D；DPR 移动端上限 1.5、粒子/阴影按 2.6 移动端档位；加载失败有剪影/线框兜底 |

## 兼容性

- 目标基线：Android 8.1 出厂 Chrome / WebView 61；`app3d.js` 由 esbuild `--target=chrome61` 转译，UI 脚本为 ES2017。
- 当前环境没有 Chrome 61 / Android 8.1 真机，**WebGL 性能与 CSS 兼容性未实测**；建议在 PC 模拟器与低端安卓真机各跑一遍首屏、摇签、结果卡、曜方拖动。
- 未使用 `window.xhs.miniTool.*` JSBridge（当前功能不需要发笔记 / 存相册 / 跳原生页）。
