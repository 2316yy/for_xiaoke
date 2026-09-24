# 向克苏鲁许愿 · 小红书 3D 小工具版 v1.1.1（模型内嵌，无 .glb）

小红书上传器只允许 `jpg/css/gif/svg/png/js/jpeg/json/html/woff2/webp/woff`，`.glb` 会被直接拒绝。这一版把优化后的模型 base64 内嵌进 JS，运行时用 `GLTFLoader.parse()` 解析——**包内没有任何 `.glb`，但 3D 完整保留**。`1.1.1` 在 dist 的 `<meta name="xhs-tool-version">` 里带版本号，并修复了 1.1.0 的移动端紫色假打光和音效解锁问题。

## 1.1.1 修了什么

- **移动端配光回归 2.5.11 原版**：去掉 mobile/low 的紫蓝 ambient（`#9b95d0 × 0.9`）、紫 hemi/fill 强光；恢复 `ambient 0 / hemi 0.28 / fill 0.4 / exposure 0.9`，保留 PMREM 环境贴图。
- **恢复质感**：mobile 档开抗锯齿、开阴影（1024 / PCF）、`Dpr 1.5`、Standard 暗色地面；描边紫光从 5 降到 mobile 3.5 / low 2.5。
- **修正档位误判**：不再因为 `devicePixelRatio >= 3` 就把高分屏手机降到 low 档（这是紫屏最明显的档位）；只有 `deviceMemory <= 2` 或 `hardwareConcurrency <= 2` 才降 low。
- **保留 2.6 流畅优化**：30fps 主循环、页面隐藏暂停、DOM 节流、粒子数量下调不变。
- **音效保活**：全局补 `touchstart` / `touchend` 解锁；`window.__audio.debug()` 可看 `state / muted / lastError`；环境声与摇签声增益略提。不改音色。

## 产物

- 本地上传包（已 `.gitignore`，不推 GitHub）：`xiaohongshu/cthulhu-xhs-3d-embedded-1.1.1.zip`（2.20 MiB）
- 本地预览目录：`xiaohongshu/dist/`
- 优化后模型源：`xiaohongshu/models3d/`（仅构建用，不会进包）
- 重新构建：`XHS_VERSION=1.1.1 node tools/build_xhs_3d.mjs`
- 重新校验：`node tools/check_xhs_minitool.mjs xiaohongshu/dist --allow-3d`

## 打包方式（方案 B）

1. `models3d/idol.glb` + 8 个曜方 GLB 在构建时转 base64，写入 `model-idol.js` / `model-cubes.js`。
2. `main.js` / `cubes.js` 在打包前被替换为 `window.__xhsLoadGLB(loader, name, ...)`；该函数解码 base64 后调用 `GLTFLoader.parse(arrayBuffer, '', onLoad, onError)`。
3. `xhs-ui.js` 在 three 初始化前把 `window.createImageBitmap` 置空，强制 GLTFLoader 使用 `TextureLoader`（`<img src="blob:...">`）读取 GLB 内嵌贴图，避免 `ImageBitmapLoader` 内部走 `fetch`。
4. 包内文件只剩 `html / css / js`，全部在小红书白名单内。

## dist 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 入口；无内联脚本、无 importmap/module；按顺序加载 UI、模型数据、app3d |
| `device.js` | 设备探测外置脚本 |
| `model-idol.js` | 神像模型 base64（解码后 1.42MB / 约 5.5 万面） |
| `model-cubes.js` | 8 个曜方模型 base64（解码后合计约 1.1MB） |
| `app3d.js` | three.js + OrbitControls + GLTFLoader + RoomEnvironment + main.js + cubes.js 的经典 IIFE（esbuild `--target=chrome61 --minify`） |
| `xhs-ui.js` | 内嵌模型解码、复制浮层、Flex gap 检测、3D 失败兜底 |
| `lots.js` | 64 签文案 + 12 心情标签 + 签级判词 |
| `audio.js` | Web Audio 音效 |
| `dex.js` | 集曜 / 签谱 / 曜录（localStorage） |
| `game.js` | 许愿 / 摇签 / 结果卡；剪贴板 API 已替换 |
| `compat.css` | Chrome 61 基线回退层 |

## 校验摘要

- 上传包文件类型：只有 `html / css / js`，**无 `.glb` / `.gltf` / `.bin`**，全部命中平台白名单。
- skill Node 审计（dist）：`PASS: 11 file(s), 0 warning(s)`
- skill Python 审计（zip）：`PASS: 11 file(s), 1 warning(s)`（zip 2.20 MiB，仅超 2 MiB 建议值，未超 10 MiB 上限）
- 自有静态校验（`--allow-3d`）：`通过 · FAIL 0 / WARN 1`
  - `index.html` 在 zip 根；无内联脚本 / 行内事件 / module / importmap / 外部 http(s) 资源
  - 无被禁 Web API；剪贴板、定位、传感器、Worker、WebSocket、全屏等均无
  - CSS 无 `inset` / `env()` / `dvh` / `min()` / `max()` / `clamp()` 残留，`color-mix` 前有 rgba 兜底
  - WARN：`app3d.js` 内 three.js 自带 FileLoader 含 `fetch(`，本包不会调用它（模型走 `parse`，贴图走 blob `<img>`）
- 浏览器端到端探针（桌面 1280×800 + 移动 390×844）：`ALL PASS 21/21`
  - **全程 0 次 `.glb` 请求**；`model-idol.js` / `model-cubes.js` 均 200；`createImageBitmap` 已关闭
  - WebGL / `__ritual` / `__cubes` / 曜方掉落正常；模型真实解析，无剪影 / 线框兜底警告
  - 勇气 / 释然抽签、签卡三标签、复制浮层、签谱 64 格正常；`CONSOLE CLEAN`，无 4xx/5xx
- 移动端视觉探针（390×844，dpr2 / dpr3）：两档都正确落在 `mobile`（不再因 dpr≥3 误降 `low`）；手机档 RGB 均值约 `36.3 / 41.6 / 48.0`，与 `?q=high` 的 `36.5 / 41.9 / 48.2` 基本一致，不再有 1.1.0 那种蓝色高 17 的紫罩。
- 音频探针：`PointerEvent` 与 `无 PointerEvent` 两种环境，首次 tap 后 `AudioContext.state = running`，摇签 14 次 rustle，常驻噪声源不重复创建；`window.__audio.debug()` 可查 `state / muted / lastError`。

## 兼容性

- 目标基线：Android 8.1 Chrome / WebView 61；`app3d.js` 由 esbuild `--target=chrome61` 转译，UI 脚本为 ES2017。
- 本机没有 Chrome 61 / 真机，**WebGL 性能与旧内核兼容性未实测**；建议上传 PC 模拟器先跑首屏、摇签、结果卡、曜方拖动。
- 未使用 `window.xhs.miniTool.*` JSBridge（当前功能不需要发笔记 / 存相册 / 跳原生页）。
