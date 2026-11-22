# 施工日志

按天记录「Qoder 在这个项目里改了什么、为什么改、怎么验的」。
重点不是生成了多少页面，而是踩到的坑和判断依据——论坛帖「我改了什么」直接从这里取素材。

---

## 2026-11-22 · Day 3 收尾：两个本地永远看不见的 bug

发布后拿无痕窗口跑线上验收，才暴露出这两个问题。两个都不是「写错了」，是「只在特定环境下才成立」的错误。

### bug 1：wasm 目录带尾斜杠 → 线上模型加载失败，摄像头根本不启动

**症状**：线上进 game 页，摄像头预览是黑的，调试面板 `delegate` 是 `—`，`yaw/pitch` 全是 `—`；
控制台每进一次 game 页多一条 404，`badResponses` 里是

```
404 https://<host>/wasm//vision_wasm_internal.js
```

注意两个斜杠。文件明明在 `dist/wasm/vision_wasm_internal.js`，单斜杠 curl 是 200。

**根因**：MediaPipe 的 FilesetResolver 内部是模板串拼接：

```js
return { wasmLoaderPath: `${e}/${t}_${n}.js`, wasmBinaryPath: `${e}/${t}_${n}.wasm` }
```

`e` 是我传进去的目录，它自己会补一个 `/`。我按「目录必须以斜杠结尾」的直觉写了 `FilesetResolver.forVisionTasks(asset('wasm/'))`，
于是拼成 `/wasm//vision_wasm_internal.js`。

**为什么本地看不见**：Vite dev server 和 `vite preview` 都会把 URL 里的重复斜杠归一化掉，`/wasm//x.js` 照样返回 200。
静态托管不会归一化，直接 404。所以本地跑了一整天，一切正常。

**修法**：`asset('wasm')`——不带尾斜杠。一行。
[cameraSource.ts:178](../app/src/input/cameraSource.ts#L178)

**验证**：拦截页面发出的所有含 `wasm` 的请求，确认 URL 是单斜杠；线上 4xx 归零，
`delegate` 出值，预览出画面，`/wasm/vision_wasm_internal.js` 与 `.wasm` 都 200 且字节数与本地一致。

**顺带纠正了一条写错的文档**：`app/README.md` 原来写「MediaPipe 是把文件名直接接在 wasm 目录后面的，尾斜杠丢了就是 404」，
正好说反了。日志里留一句，是因为这种「文档本身是错的」情况最容易让下一个人重新踩进去。

### bug 2：effect 依赖整个 frame 对象 → 「先用演示模式」按钮永远不出现

**症状**：摄像头前没人时，4 秒后本该出现的演示模式出口一次都没渲染出来，用户只能对着黑屏。

**根因**：

```tsx
useEffect(() => {
  if (frame?.present) { setShowNoFaceHint(false); return; }
  const timer = window.setTimeout(() => setShowNoFaceHint(true), 4000);
  return () => window.clearTimeout(timer);
}, [frame]);   // ← frame 每 33ms 是一个新对象
```

`useGesture` 每个检测 tick 都往下传一个新的 `RawFrame`，依赖项按引用比较，于是这个 effect 每 33ms
重跑一次：清掉旧定时器、重新起一个 4 秒的。计时器永远走不到 4000ms。

**修法**：依赖只放真正决定行为的那个布尔值。
[CameraStage.tsx:47](../app/src/components/CameraStage.tsx#L47)

```tsx
const facePresent = frame?.present ?? false;
useEffect(() => { /* … */ }, [facePresent]);
```

**验证**：假摄像头（没有真人脸）打开线上页面，等 9 秒，`先用演示模式` 按钮 `isVisible() === true`。

### 这两个坑的共性

- 都是**「本地环境比线上宽容」**造成的：URL 归一化、React 依赖按引用比较在低频下看不出来。
- 判断手段不是多看两眼，是**把线上环境当环境来测**：无痕 + 拦截 `response` 状态码 + 拦截请求 URL + 断言 DOM 可见性。
  这次验收清单里的第 7、9 两条就是专门用来抓这个的，抓到了。

**提交**：`bffb80c`（两处修复）、`8d445ed`（文档与发布记录）、`8e4802e`（GPU 文案收到「请求被接受」这一层，见下节）。

---

## 2026-11-22 · Day 3：接真实摄像头

- 用 `@mediapipe/tasks-vision` 的 **FaceLandmarker**（468 点 + blendshape），不是 PoseLandmarker；版本精确锁 `0.10.14`，
  npm 最新已经是 1.x，故意不跟。wasm 和模型全部放 `public/`，不走 CDN——否则「画面不上传」那条隐私证据不成立。
- `visibilitychange` 隐藏时释放摄像头轨道并取消 RAF；`StrictMode` 双次挂载用世代计数器挡住迟到的 `getUserMedia` 回调，
  避免旧 promise 把新一次的流关掉。
- **GPU 文案的诚实边界**：`createFromOptions('GPU')` 成功只代表请求被接受，wasm 内部仍打印
  `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`。界面文案改为「加速：GPU 优先」，
  调试面板改为「GPU（已请求，实际后端由 MediaPipe 决定）」，不写「已启用 / GPU 推理」。（这条是验收之后补的，提交 `8e4802e`）
- 未验：真人镜头前的 yaw/pitch 实际量级、自然眨眼能否撑满 `blinkHoldMs: 180`（真人眨眼只有 100–150ms，大概率要放宽）。

**提交**：`89bb1ab`。

---

## 2026-11-22 · Day 2：输入抽象 + 虚拟玩家

- `reference/` 的四个文件原样搬运，只改三处：去掉 import 的 `.ts` 后缀、`node:assert` 换成 Vitest（13 条用例一条没删、没改弱、没 skip）、
  只新增 `vitest` 一个精确版本 devDependency。
- `ScriptedSource` 造虚拟玩家：`yaw = 0.16*sin(t/1400)`，每 3 秒一次 pitch 脉冲，每 4 秒一次双眼 blink。
  blink 时长从「刚好卡在 180ms 阈值上」放宽成 240ms，因为 RAF 的采样时刻不落在毫秒整点上，卡阈值必然抖。
- 排查过一次**假泄漏**：RAF 计数 472/s 看着像两个检测循环。实测这块屏刷新率 230Hz，叠加层 + 检测两条链正好 460 上下，
  起始页 0/s——不是泄漏，是刷新率。

**提交**：`c0391c1`。

---

## 2026-11-21 · Day 1：骨架与发布

- Vite 8 + React 18.3.1 + TS 5.9 + Tailwind 4（`@theme` 变量写在 `src/index.css`，无独立配置文件），Canvas 2D 不用 Three.js。
- 纯函数状态机 `start → calibration → game → result`，页面切换只看 `state.screen`。
- 无障碍既定约束：按钮最小 64px 高、深底高对比、焦点环 3px、`prefers-reduced-motion` 降级、手机竖屏 375px 可用。
- 发布到 Qoder Sites：`prepare_site` 必须带 `spa: true`（否则深链和刷新 404），`base: './'` 让产物能挂任意子路径。
  `projectRoot` 必须在 host 报告的会话目录之内，超了会被本地拦截、不产生云端资源。
- 隐私证据的做法：不看文字声明，看 DevTools Network——整页请求只有站点自身同源资源。
