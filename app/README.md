# 零触控游乐场

> 不用手，也能玩三分钟。
> 让上肢障碍者、术后康复者、行动不便的长辈，只用头、眼睛和嘴在浏览器里玩一局游戏。
>
> 2026 Qoder 高校创造力大赛 · Hack4Good 赛道。纯前端，无后端、无账号、无数据库，画面全部在浏览器本地处理、不上传。

## 技术栈

- Vite 8 + React 18.3.1 + TypeScript 5.9
- Tailwind CSS 4（通过 `@tailwindcss/vite` 插件，无独立配置文件，主题变量写在 `src/index.css` 的 `@theme` 里）
- Canvas 2D（不用 Three.js）
- 下一阶段接入 `@mediapipe/tasks-vision`（精确锁 `0.10.14`，本骨架**尚未安装**）

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

## 当前状态：Day 3，真实摄像头已接通

骨架、虚拟玩家、真实摄像头输入都在了；**还没有的是校准 UI 与游戏逻辑**（引擎输出的 `confirm` / `pause` 目前只驱动演示页的方块变绿和「已暂停」遮罩）。

状态机在 [src/state/machine.ts](src/state/machine.ts)，`start → calibration → game → result`：

| 事件 | 从 | 到 | 说明 |
| --- | --- | --- | --- |
| `choose_camera` | start | calibration | 开始体验（需要摄像头） |
| `choose_demo` | start | game | 演示模式，跳过校准 |
| `calibration_finished` | calibration | game | 校准完成 → `mode='camera'` |
| `calibration_skipped` | calibration | game | 「跳过（演示模式）」 |
| `game_finished` | game | result | 带上分数 |
| `replay` | result | game | 保持上次的输入模式 |
| `home` | 任意 | start | 返回按钮 |

页面：

- `StartScreen` — 大标题 + 副标题 + 三个入口（视频按钮目前是占位提示）
- `CalibrationScreen` — 3 步占位（正对 / 向左 / 向右）、进度条、跳过；**未接真实采样**
- `GameScreen` — `mode='demo'` 走 `ScriptedSource` 画方块；`mode='camera'` 走 `CameraSource` 显示镜像预览 + 关键点叠加
- `ResultScreen` — 分数占位 + 分享卡占位

输入侧已就位：`GestureEngine`（13 条用例）+ `landmarksToFrame`（9 条用例）+ `ScriptedSource` + `CameraSource`（FaceLandmarker 468 点 + blendshape，GPU 委托请求失败自动回退 CPU，切后台释放摄像头轨道）。

已知未验：真人镜头前的 yaw/pitch 实际量级、自然眨眼能否撑满 `blinkHoldMs: 180`。这两项要人坐在镜头前按 `D` 开调试面板量。
`delegate` 一栏只表示哪一种委托请求被 `createFromOptions` 接受：GPU 请求成功后，wasm 内部仍打印
`INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`，没有证据说明推理跑在 GPU 上。所以界面文案只说「加速：GPU 优先」，
调试面板写「GPU（已请求，实际后端由 MediaPipe 决定）」，不写「已启用」。

无障碍相关的既定约束：按钮最小 64px 高、深底高对比配色、焦点环 3px、`prefers-reduced-motion` 降级、手机竖屏 375px 可用。

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
   └─ components/          # 四个屏幕 + Button + TopBar
```

Day 2 加了：`src/input/`（引擎 + 输入源抽象 + 虚拟玩家）、`src/hooks/useGesture.ts`、`tests/`。
Day 3 加了：`src/input/cameraSource.ts`（FaceLandmarker）、`faceFrame.ts`（关键点→RawFrame 纯函数）、`src/components/CameraStage.tsx`、`DebugPanel.tsx`、`public/wasm`、`public/models`。

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

按 `D` 开合（默认隐藏）。含镜像预览开关（同步切 `mirrorX`，且**不重启输入源**）、关键点叠加开关、yaw/pitch/blinkL/blinkR/jaw 实时值、cursorX、engine 事件时间戳、delegate。
镜像的正确对应关系已实测：镜像预览开 → `mirrorX=-1`，被摄者向左转头光标向左；关掉镜像 → `mirrorX=1`，方向跟着预览走。演示模式下 40 次采样符号一致率 31/31。

## 下一步

1. 真人面前验一次：转头/点头/眨眼的实际 yaw、pitch 量级，以及自然眨眼能不能撑满 `blinkHoldMs: 180`（真人眨眼只有 100–150ms，很可能需要放宽，放宽走构造参数 override，不动 `DEFAULT_CONFIG`）。
2. 校准页接真实采样与自适应量程（`calibrateNeutral` / `setRangeFromOffsets` 已在引擎里，UI 未接）。
3. 游戏本体：光标命中判定与计分。

## 部署到 Qoder Sites

**线上地址（公开，免登录）**：<https://zero-touch-arcade-isyzlt2g2ce.qoder.zone>
`access_mode: public`，2026-11-22 发布，同日 20:54 重新发布到 Day 3 收尾构建（`assets/index-B-l08UlS.js`，含真实摄像头与 favicon）。
线上验收：无痕窗口进 game 页，7 个请求全部同源、零 4xx，控制台只剩 MediaPipe 自己打的
`INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`。

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
