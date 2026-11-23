# 零触控游乐场

> 不用手，也能玩三分钟。
> 让上肢障碍者、术后康复者、行动不便的长辈，只用头、眼睛和嘴在浏览器里玩一局游戏。
>
> 2026 Qoder 高校创造力大赛 · Hack4Good 赛道。纯前端，无后端、无账号、无数据库，画面全部在浏览器本地处理、不上传。

## 技术栈

- Vite 8 + React 18.3.1 + TypeScript 5.9
- Tailwind CSS 4（通过 `@tailwindcss/vite` 插件，无独立配置文件，主题变量写在 `src/index.css` 的 `@theme` 里）
- Canvas 2D（不用 Three.js）
- 人脸关键点用 `@mediapipe/tasks-vision` 的 FaceLandmarker（精确锁 `0.10.14`）；wasm 与模型都放 `public/`，不走 CDN

依赖版本全部写精确值，不用 `^` `~`，`package-lock.json` 需一并提交。

## 本地开发

```bash
cd app
npm install
npm run dev        # http://localhost:5173
```

其他命令：

```bash
npm run build      # 先 tsc --noEmit 做类型检查，再产出 dist/
npm run preview    # 本地预览构建产物
```

## 当前状态：Day 4，校准接真 + 独立俯仰量程

骨架、虚拟玩家、真实摄像头、真实校准都在了；**还没有的是游戏逻辑**（引擎输出的 `confirm` / `pause` 目前只驱动演示页的方块变绿和「已暂停」遮罩）。

状态机在 [src/state/machine.ts](src/state/machine.ts)，`start → calibration → game → result`：

| 事件 | 从 | 到 | 说明 |
| --- | --- | --- | --- |
| `choose_camera` | start | calibration 或 game | 本机存过校准值就直接进游戏 |
| `start_calibration` | start | calibration | 「重新校准」入口 |
| `choose_demo` | start | game | 演示模式（虚拟玩家，量程恒为默认值） |
| `calibration_finished` | calibration | game | 采到数 → `mode='camera'`，置 `calibrated` 并写盘 |
| `calibration_skipped` | calibration | game | 「跳过，使用默认值」→ 摄像头模式，**不写盘** |
| `game_finished` | game | result | 带上分数 |
| `replay` | result | game | 保持上次的输入模式 |
| `home` | 任意 | start | 返回按钮 |

页面：

- `StartScreen` — 大标题 + 副标题 + 入口；有存档时「开始体验」直奔游戏，并多出「重新校准」
- `CalibrationScreen` — 4 步采样 + 眨眼确认，见下节
- `GameScreen` — `mode='demo'` 走 `ScriptedSource` 画方块；`mode='camera'` 走 `CameraSource` 显示镜像预览 + 关键点叠加
- `ResultScreen` — 分数占位 + 分享卡占位

测试 70 条：`GestureEngine` 17 + sequencer 14 + storage 9 + `landmarksToFrame` 9 + machine 9 + sampling 7 + `buildCsv` 5。
输入侧是 `GestureEngine` + `landmarksToFrame` + `ScriptedSource` + `CameraSource`（FaceLandmarker 468 点 + blendshape，GPU 委托请求失败自动回退 CPU，切后台释放摄像头轨道）。

自然眨眼已实测：弱侧峰值只有 0.47~0.55，0.55 的阈值过不了，已降到 0.38；确认动作定为**点头为主、眨眼为辅**。调试面板的峰值保持和 CSV 导出就是为这类核对准备的。
`delegate` 一栏只表示哪一种委托请求被 `createFromOptions` 接受：GPU 请求成功后，wasm 内部仍打印
`INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`，没有证据说明推理跑在 GPU 上。所以界面文案只说「加速：GPU 优先」，
调试面板写「GPU（已请求，实际后端由 MediaPipe 决定）」，不写「已启用」。

无障碍相关的既定约束：按钮最小 64px 高、深底高对比配色、焦点环 3px、`prefers-reduced-motion` 降级、手机竖屏 375px 可用。

## 校准与量程

真人实测：舒适峰值 yaw 0.36 / 0.40，pitch 0.19，blink 0.65。2026-11-23 另一位测试者线上验收：20 秒走完，
摘要 `yawRange 0.116 / pitchRange 0.101 / 灵敏度 53%`，点头 3/3 触发，左右转头各 3 次 `cursorX` 全部到 ±1.000；
自然眨眼仍未验。转头和点头幅度差一倍多，共用一份量程必然顾此失彼，
所以 `Calibration` 拆成 `range`（光标）和 `pitchRange`（点头）两份，`nodTrig` / `nodRearm` 只认后者。

流程全在 [src/calibration/](src/calibration/)，是纯模块 + 纯 reducer，React 只做外壳 —— 没有 jsdom 也能整条跑一遍：

| 步 | 采什么 | 统计量 | 产出 |
| --- | --- | --- | --- |
| 正对 | 45 帧 | mean；极差 > 0.05 判「没定住」 | `yawNeutral` / `pitchNeutral` |
| 向左 | 30 帧 | 幅度前 15 帧的中位数（带符号） | `leftOffset` |
| 向右 | 30 帧 | 同上，且必须与向左反号 | `rightOffset` |
| 点头 | 45 帧 | 幅度前 15 帧的中位数取绝对值 | `nodPeakOffset` |
| 眨眼两次 | — | 双眼 `min(blinkL,blinkR) > 0.55` 闭合 ≥60ms、两次间隔 ≥120ms | 完成 |

- `yawRange = clamp(min(|左|,|右|), 0.08, 0.22)` —— **取较小边**：一边转不到位，就不能让另一侧走不到边缘。
- `pitchRange = clamp(点头峰值, 0.06, 0.18)`。
- 统计量用「幅度前 k 帧的中位数」而不是整窗中位数或 max：整窗中位数会被转过去的过渡段拉低，max 会一头撞上跟踪野值。
- 某步不合格自动重采一次，再失败就停住，给「重做这一步 / 用默认值继续」；丢脸帧不进缓冲、也不消耗重试次数。
- 眨眼确认有**空格键**兜底（reducer 只在这一步认这个动作）。
- 语音播报 zh-CN，默认开、页内可关、选择记进 `zt.settings.v1`；Windows 缺中文声线时退回默认声线念，不哑掉。
- 完成后显示 `yawRange / pitchRange / 灵敏度`，被压到上限会写明「已自动压缩灵敏度」，8 秒后自动进入游戏。

只往 `zt.calibration.v1` 写 6 个字段（`v / yawNeutral / pitchNeutral / yawRange / pitchRange / savedAt`），
没有图像、没有帧、没有照片 —— 这条用测试锁死（序列化后的键集合必须恰好是这几个）。版本号编在 key 里，schema 一改旧记录自然失效。
读到的坏数据一律当「没校准过」（返回 null），绝不猜 `pitchRange = range`。

## 目录

```
app/
├─ index.html
├─ vite.config.ts          # base: './'
├─ tsconfig.json
└─ src/
   ├─ main.tsx
   ├─ index.css            # Tailwind 入口 + 主题变量
   ├─ App.tsx              # 状态机驱动的屏幕切换
   ├─ state/machine.ts     # 纯函数状态机
   ├─ calibration/         # 校准：steps/sampling/result/sequencer/storage/speech（全纯）
   ├─ input/               # 引擎 + 输入源 + 关键点→RawFrame
   └─ components/          # 四个屏幕 + Button + TopBar + CameraStage/DebugPanel/ProgressRing/OffsetBar
```

Day 2 加了：`src/input/`（引擎 + 输入源抽象 + 虚拟玩家）、`src/hooks/useGesture.ts`、`tests/`。
Day 3 加了：`src/input/cameraSource.ts`（FaceLandmarker）、`faceFrame.ts`（关键点→RawFrame 纯函数）、`src/components/CameraStage.tsx`、`DebugPanel.tsx`、`public/wasm`、`public/models`。
Day 4 加了：`src/calibration/`（steps / sampling / result / sequencer / storage / speech 六个纯模块）、`src/hooks/useCalibration.ts`、`src/components/ProgressRing.tsx`、`OffsetBar.tsx`，并重写了 `CalibrationScreen.tsx`。

## 摄像头与模型资源

- `@mediapipe/tasks-vision` 锁 **0.10.14**（`dependencies` 里不带 `^`/`~`，npm 最新已经是 1.x，故意不回退）。
- `public/wasm/` 是从 `node_modules/@mediapipe/tasks-vision/wasm/` 原样拷来的四个文件，版本和 JS 严格一致；**不走 CDN**，否则「零外部请求」那条隐私证据就不成立了。重新安装后这样刷新：
  `cp node_modules/@mediapipe/tasks-vision/wasm/* public/wasm/`
- `public/models/face_landmarker.task` 是官方 float16/1（3.76 MB）：
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- 两者的路径一律经 `import.meta.env.BASE_URL` 拼接再对 `document.baseURI` 取绝对地址（`cameraSource.ts` 的 `asset()`）。
  **wasm 目录结尾不能带 `/`**：MediaPipe 内部按 `${目录}/${文件名}` 拼接，带斜杠就变成 `/wasm//vision_wasm_internal.js`。
  dev 服务器和 `vite preview` 都会把 `//` 归一化成 `/`，所以这个坑只在静态托管上暴露——线上表现为模型加载失败、摄像头不启动，
  控制台每进一次 game 页多一条 404（2026-11-22 发布后实测踩过）。
- 构建后 `dist/` 约 23 MB，其中 22 MB 是 wasm 和模型；发布体积以此为准。

## 调试面板

按 `D` 开合（默认隐藏）。含镜像预览开关（同步切 `mirrorX`，且**不重启输入源**）、关键点叠加开关、yaw/pitch/blinkL/blinkR/jaw 实时值、cursorX、engine 事件时间戳、delegate（写的是「GPU（已请求，实际后端由 MediaPipe 决定）」，不是「已启用」）。
镜像的正确对应关系已实测：镜像预览开 → `mirrorX=-1`，被摄者向左转头光标向左；关掉镜像 → `mirrorX=1`，方向跟着预览走。演示模式下 40 次采样符号一致率 31/31。

面板下面还有两块观测用的（只做测量，不参与手势判定，`gestureEngine.ts` / `config.ts` 一字未改）：

- **峰值保持**：本次会话的 `max |yaw|`、`max pitch`、`max blinkL`、`max blinkR`、`max jaw` 和 confirm / pause 次数，
  蓝色字，和白色的瞬时值区分开；「重置峰值」清零。峰值缓冲挂在 `GameScreen` 而不是面板里，按 D 关掉面板再打开不会丢。
  存在的理由：真人眨眼只有 100–150ms，瞬时值截图根本抓不到峰值。
- **导出 CSV**：「导出 CSV」下载最近 60 秒的逐帧数据，列为 `t,yaw,pitch,blinkL,blinkR,jaw,cursorX,present,event`，
  `event` 为空或 `confirm` / `pause`。`Blob` + `URL.createObjectURL`，文件名 `zero-touch-trace-YYYYMMDD-HHmmss.csv`，
  带 UTF-8 BOM、CRLF 行尾，Excel 直接双击打开。构建逻辑是纯函数 `buildCsv(rows)`，不挂 React 也能测（5 条用例）。

## 下一步

1. 真人面前验一次自然眨眼能不能撑满 `blinkHoldMs: 180`（真人眨眼只有 100–150ms，很可能要放宽；放宽走构造参数 override，不动 `DEFAULT_CONFIG`）。转头和点头的量级不用肉眼量了 —— 校准摘要直接把 `yawRange / pitchRange` 写在屏幕上；面板的峰值保持和 CSV 导出留着做逐帧核对。
2. 游戏本体：光标命中判定与计分。
3. 论坛帖「我改了什么」从 [docs/qoder-log.md](../docs/qoder-log.md) 取素材（Day 3 的两个线上 bug、Day 4 的校准与发布各有记录，含提交号）。

## 源码仓库

<https://github.com/333yi-max/zero-touch-arcade>（公开）。线上站点链接见下一节。

## 部署到 Qoder Sites

**线上地址（公开，免登录）**：<https://zero-touch-arcade-isyzlt2g2ce.qoder.zone>
`access_mode: public`，2026-11-22 首发，同日 21:45 重发 GPU 文案修正（`assets/index-CoscUwW7.js`）；
2026-11-23 重新发布 Day 4 校准构建（`assets/index-QoICF3dh.js`，校准接真 + 独立俯仰量程，dist 共 23 MB）。
线上验收（无痕 + 假摄像头）：首屏 460ms；校准页 aria-valuetext 正确；无人脸 9 秒内出现「先用演示模式」；
拒绝摄像头权限后「跳过，使用默认值」→ 游戏页出现「摄像头没打开」卡片 + 演示出口；塞存档直奔游戏、面板显示已校准量程；
375px 无横向溢出；六个资源 curl 全 200；console 4xx = 0，控制台只剩 MediaPipe 自己打的
`INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`。截图见 [docs/shots/](../docs/shots/) 的 17–24。

2026-11-23 复查补修（人脸模型文案、权限失败态不再重复渲染取景框）：产物 `assets/index-BJABjniB.js`，
当日已重发（新 actionId `87611676-…`，链接不变），线上验收 8 条资源全 200、4xx = 0、375 px 无溢出；
清缓存公网首屏 ttfb 1.0 s / load 1.4 s。验证截图 20–24 与 `live-audit-day4-fix.json`，详见施工日志。

站点是 SPA，构建产物是纯静态文件，`vite.config.ts` 已设 `base: './'`，资源走相对路径，因此可以挂在任意子路径下。

**会话目录限制（已实测）**：`prepare_site` 的 `projectRoot` 必须在 host 报告的「当前会话目录」之内，超出会被本地拦截。在 `D:\JD\零触控游乐场\app` 直接准备，返回 `sites_current_session_required`，不产生任何云端资源。

所以部署必须在**以 `D:\JD\零触控游乐场`（或它的子目录）作为工作区打开的 Qoder 对话**里做。做法：Qoder Desktop 里「打开文件夹」选中 `D:\JD\零触控游乐场`，新开会话，把下面这段贴给它：

> 读 `app/README.md` 和 `会话交接-2026-11-22.md`，把 `app/` 部署到 Qoder Sites 并公开。骨架已完成，已构建，产物在 `app/dist`（`base: './'`，资源相对路径，无需重新构建）。先确认 Sites 的 `get_context` 返回的 `local.projectRoot` 就是 `D:\JD\零触控游乐场`，再准备。`prepare_site` 参数：`projectRoot` = `D:\JD\零触控游乐场\app`，`webDirectory` = `dist`，`spa` = `true`，`displayName` = `零触控游乐场`，`slug` = `zero-touch-arcade`。准备成功后 `publish_site`，轮询到 `published: true`；把访问范围改成公开（新站默认私有，评委要免登录打开）；最后用 `show_publish_confirmation` 交付链接。发布后用无痕窗口和手机各开一次，并在 DevTools 网络面板截图证明只有同源请求。


发布流程要点：

1. `npm run build`，确认 `dist/index.html` 引用的是 `./assets/...`。
2. `.qoder.site` 描述文件由 `prepare_site` 生成，**不要手写**。
3. `prepare_site` **必须带 `spa: true`**，否则会生成 HTML 错误兜底，导致深链和刷新 404。
4. 发布后验收：无痕窗口打开公开链接看首屏；手机竖屏再开一次；DevTools 网络面板确认除站点自身资源外**零外部请求**（这是「画面不上传」的可验证证据，比文字声明可信）。
5. 不要把整个会话目录当站点目录——`projectRoot` 用 `app/`，`webDirectory` 用 `dist`，都不能是 `.`。


平台保留路径不要使用：`/api` `/internal` `/__qoder_auth` `/__qoder_internal` `/functions` `/storage` `/rest/v1` `/supabase`。
