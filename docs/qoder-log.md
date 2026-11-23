# 施工日志

按天记录「Qoder 在这个项目里改了什么、为什么改、怎么验的」。
重点不是生成了多少页面，而是踩到的坑和判断依据——论坛帖「我改了什么」直接从这里取素材。

---

## 2026-11-23 · Day 4 补修：上线后复查抓到的两处文案/渲染问题

发布完回头翻验收截图，两处问题都明晃晃写在截图里。当时的验收清单只断言了「元素出现」，没读元素里的字。

### bug 3：人脸模型被叫成「手势模型」

校准页加载态写着「正在加载**手势**模型，第一次约 2 秒…」（[CameraStage.tsx:87](../app/src/components/CameraStage.tsx#L87)）。
这个项目从头到尾用的是 FaceLandmarker，没接过任何手势；`cameraSource.ts:17` 的加载失败提示也写错。两处都改成「人脸模型」。

顺手把「第一次约 2 秒」改成「首次需下载约 13 MB…」——3.7 MB 模型 + 9.4 MB wasm 共 13.1 MB，
本地宽带 2 秒，弱网/低端机上远不止。写死一个秒数等于给用户一个错承诺。

### bug 4：权限失败后，错误卡片下面还挂着一个永远停机的取景框

[GameScreen.tsx](../app/src/components/GameScreen.tsx) 里 `CameraProblemCard` 和 `CameraStage` 是两条并列的
`{cond ? <X/> : null}`：`problem` 非空时错误卡片出现，取景框照样渲染，框底一直写「正在加载…」。
截图 19 里卡片下那块 4:3 黑框就是它——用户会以为还在加载，实际已经失败。
改成三选一：演示画布 / 错误卡片 / 取景框。校准页本来就是二选一，不受影响。

### 验证

用 CDP 驱动本机 Chrome 157 复现两个场景（脚本不进仓库，零新增依赖）：

- 清缓存 + 限速 400 KB/s → 加载态文案 `手势=false / 人脸=true`，截图 `20-loading-copy-fixed.png`
- `Browser.setPermission camera=denied` → 校准页「摄像头没打开」；点「跳过，使用默认值」→ 游戏页仍有
  「摄像头没打开」、页面里「正在加载」出现 0 次，截图 `21-permission-fallback-fixed.png`
- 70/70 测试全绿，`tsc` 无错；新产物 `assets/index-BJABjniB.js`（324.91 kB / gzip 101.76 kB）

复现顺序上踩了一个坑：权限是浏览器级的，上一次跑完 denied 会留在这个 profile 里，下一次跑「加载态」场景
会直接落到错误卡片。脚本开头必须先把权限重置成 granted，否则截图是错的。

### 发布与线上验收（2026-11-23）

新 actionId `87611676-737c-4774-8a35-1a87c8115ffa` 发到同一 siteId，
`published: true / committed: true / access_mode: public`，链接不变，线上资产换成 `index-BJABjniB.js`（324.9 kB）。

清缓存 + 公网无痕复验：

- 8 条资源全 200（首页 / JS / CSS / 模型 / wasm js / wasm / nosimd wasm / favicon），`badResponses` 为空
- 首屏：ttfb 1002 ms / DOMContentLoaded 1401 ms / load 1417 ms —— 这是**清缓存**口径；
  之前的 460 ms 是热缓存，两个数不该混着说
- 加载态 `人脸=true / 手势=false`；拒绝权限后校准页、游戏页都出「摄像头没打开」，
  游戏页「正在加载」出现 0 次；375 px `scrollWidth = 375`
- 截图 `22-live-loading-fixed.png`、`23-live-permission-fixed.png`、`24-live-375-fixed.png`，
  原始证据 `live-audit-day4-fix.json`

**提交**：`3ef98dc`（修复）、`7cf037a`（回填）、`284d70b`（README 仓库地址），本次文档与站点文件另提交。

---

## 2026-11-23 · Day 4：独立俯仰量程 + 校准页接真

目标两件事：给引擎拆出独立的 `pitchRange`，把三步占位的校准页换成真采样。

### 先纠正一条我自己写进需求的前提

「yaw 量程 0.38 会把点头阈值推到 0.21，pitch 0.19 永远触发不了」——这句话在 `rangeMax = 0.22` 的钳位下**不成立**：
共用量程会被压到 0.22，阈值 `0.22 × 0.55 = 0.121 < 0.19`，0.19 的点头今天就能触发。

拆量程依然是对的，但真正的理由是另外两条：

1. **幅度小的人**：pitch 0.08 的点头，共用量程阈值 0.121 → 一次都不触发；独立 `pitchRange 0.08` → 阈值 0.044 → 触发。
2. **余量**：阈值从 0.121 降到 0.099，EMA（alpha 0.35）对短促点头的滞后不再容易把峰值抹到阈值以下。

所以新写的回归测试是 A/B 对照（同一份 pitch 0.08，共用 vs 拆分各跑一遍，断言 0 次 / 1 次），
而不是「0.19 能触发」——后者在改动前后都是绿的，全绿也证明不了任何东西。

### `max → min`：先逐条算完再动手

`setRangeFromOffsets` 从取大边改成取小边（一边转不到位，就不能让另一侧走不到边缘）。
改之前把 13 条旧用例逐条算了一遍：`(-0.03,0.03)` 两种都是 0.08；`(-0.5,0.4)` max=0.5、min=0.4，
**都被 clamp 压到 0.22**；「活动范围小的人」用的是 `(-0.03,0.03)`，不受影响。结论是不需要动任何一行旧测试，
改完 13 条确实全绿。另外补了一条 `setRangeFromOffsets(-0.5, 0.09) === 0.09`，专门锁住「取小边」这件事——
旧实现这里会给 0.22，是这条新断言唯一能抓到的差异。

### 规格里的一处自相矛盾

要求「clamp 到 [0.06, 0.18]」，又要求测「pitchRange = 0.19 时能触发」。钳位生效时 0.19 存进去就是 0.18。
按钳位为准（那是产品语义，防止有人把量程顶飞），测试写成 `setPitchRangeFromPeak(0.19) === 0.18` + 0.19 触发 confirm，
两件事都锁住。

### 采样统计量：为什么既不是整窗中位数，也不是 max

- 整窗中位数：转头那 30 帧里混着「转过去」的过渡段，会被拉低；点头更糟，大半时间头在回中位，中位数 ≈ 0。
- max：跟踪抖跳出来的单帧 0.9 会把量程直接顶到钳位上限，等于校准失败。
- 用的是**按幅度取前 k 帧再求中位数**：既落在峰值平台上，又不被单帧野值带跑。

写这条测试时我自己就错了一次：先设的是「15 帧过渡 + 30 帧平台」，断言整窗中位数会被拉低——
实际平台占了 30/47，中位数正好是 0.30，什么都没拉低。改成「20 帧过渡 + 10 帧平台」（平台只占三分之一）才是真实场景，
也才让这条断言有意义。**测试跑出来的红，有时候是测试写错了，不是代码写错了**——这次两处都是这种情况：
另一处是「喂一帧 yaw -0.34 就该走到边缘」，忘了 EMA 要几帧才收敛，第一帧只到 0.406。

### 架构：流程本体是纯 reducer，React 只是外壳

项目硬约束是零新增依赖，也就没有 jsdom / testing-library。所以校准不能写成「一堆 useState 塞在组件里」，
否则这套逻辑一行都测不了。拆成：

```
steps.ts      常量 + 文案（屏幕、语音、aria 读同一份）
sampling.ts   mean / median / medianOfLargest / isStable / oppositeSign
result.ts     测量 → 量程，钳位只在这里做一次
sequencer.ts  纯 reducer：advance(state, action)，时间只用 action.t
storage.ts    纯 parse/serialize + 一对碰 localStorage 的薄壳
speech.ts     纯 speechFor + speechSynthesis 薄壳
```

14 条 sequencer 用例用合成帧在 node 里把整条流程跑通，包括「自动重采一次→giveUp」「丢脸帧不消耗重试次数」
「两步转同一边判失败」「空格只在确认步生效」。这些在浏览器里一个都验不了——假摄像头前没有脸。

几个刻意的小设计：

- **时间只用 `frame.t`**（`performance.now()` 单调），reducer 里不许出现 `Date.now()`，否则测试要 mock 时钟。
- **`if (f.t <= lastFrameT) return s`**：StrictMode 会把 effect 跑两遍，同一帧重投时整帧忽略并**返回同一个对象引用**，
  缓冲不会双计。这条和 Day 3 那个 RAF 泄漏误判是同一个教训的另一半。
- **丢脸帧不进缓冲、也不消耗 attempt**：absent 帧的 yaw/pitch 是 0，喂进去会把峰值拖低；但它也不该让人重试失败——
  没人希望因为检测抖了一下就被判「你没做」。
- **钳位只做一次**：校准流不调 `setRangeFromOffsets` / `setPitchRangeFromPeak`，全走 `buildCalibration`。
  那两个方法留在引擎上是为了 API 自洽和单测直接打，如果流程也调它们，就是两处钳位、迟早分叉。

### 两个踩到的小坑

- **语音欢迎语被自己的 cancel() 掐掉**：`speak()` 内部会先 `cancel()` 防叠话。挂载时「欢迎」和「第 1 步」连着念两句，
  第二句直接把第一句掐了，等于没写。改成把欢迎语并进第 1 步的那句话里，一次 `speak` 只出一段。
- **空格键不能抢按钮的空格**：焦点停在「跳过，使用默认值」上按空格，既会点按钮又会触发我的兜底。
  所以兜底先看 `event.target.tagName`，是 button/input/a 之类就直接放行——那一下是给控件的，不是给校准的。

### 一处行为变更，值得单独记

`calibration_skipped` 的落点从 `mode='demo'` 改成 `mode='camera'`：「跳过，使用默认值」字面意思就是用默认量程玩摄像头模式，
而不是去看虚拟玩家。演示模式仍然从首页的演示入口进。顺带把「跳过」和失败后的「用默认值继续」并成同一条路——
都不写盘，`calibrated` 保持 false。

### 隐私这条用测试钉死

`zt.calibration.v1` 里只有 `v / yawNeutral / pitchNeutral / yawRange / pitchRange / savedAt` 六个字段，
断言序列化后的键集合恰好等于这个列表——想加图像字段会先撞红。版本号编在 key 里，schema 一改旧记录自然失效，
不需要迁移代码。坏数据一律返回 null 当没校准过，**绝不猜 `pitchRange = range`**（猜了就等于悄悄用一套错的阈值继续跑）。
Safari 私密模式 `setItem` 抛错时 `writeStoredCalibration` 返回 false，游戏照玩，只在页脚注一句「本机没能保存」。

### 自动验了 / 只能人验

Playwright + 假摄像头跑构建产物验了：第 1 步渲染与 `aria-valuetext`、无人脸 4 秒后的演示出口、
语音开关写进 `zt.settings.v1` 且刷新后仍是「关」、跳过后确实是摄像头模式且**没有**写 `zt.calibration.v1`、
塞入存档后「开始体验」直奔游戏 + 面板显示 `yawRange 0.150 / pitchRange 0.100 / 已校准`、
「重新校准」仍进校准页、375px 无横向溢出、零 4xx。

只能真人验的四条：30 秒内走完、舒服最大角度时光标确实到边缘、pitch 0.19 稳定触发、左右两边都能走满。
这四条现在有校准摘要的三个数字和面板峰值保持兜着，不用肉眼盯瞬时值。

**提交**：`998d34c`。

### 发布（2026-11-23）

校准构建上线，链接不变。**`prepare_site` 的 schema 变了**：现在必须传 `actionId`（每次发布一个新 UUID，重试时同参复用），
这次用新 actionId 重新发布到同一个 siteId，线上资产从 `index-CoscUwW7.js`（Day 3）换成 `index-QoICF3dh.js`（Day 4，324.93 kB）。

线上验收（无痕 + 假摄像头）：首屏 460ms；第 1 步 `aria-valuetext` =「第 1 步 · 正对屏幕，共 5 步」；
无人脸 9 秒内「先用演示模式」出现；语音开关写 `zt.settings.v1` 且刷新后保持；「跳过，使用默认值」进摄像头模式且
`zt.calibration.v1` 仍是 null；塞存档后「开始体验」直奔游戏、面板显示「已校准 yawRange 0.150 / pitchRange 0.100」；
「重新校准」回到校准页；375px 无横向溢出；六个资源 curl 全 200；console 4xx = 0，
只剩 MediaPipe 自己的两条 XNNPACK INFO。

**拒绝摄像头权限的自动化**：不传 `--use-fake-ui-for-media-stream`（那会直接放行权限），改走 CDP `Browser.setPermission`。
坑：这个 Chrome 版本的枚举名既不是 `video_capture` 也不是 `videoCapture`，两个都报
`Invalid PermissionDescriptor name`，正确的是 **`camera`**。拒绝后校准页和游戏页都正确显示
「摄像头没打开」卡片 + 「先用演示模式」按钮（验收清单里的「无法使用摄像头」是旧文案，实际标题是「摄像头没打开」）。

截图：`docs/shots/17-live-calibration.png`、`18-live-saved-calibration.png`、`19-live-permission-fallback.png`。

**提交**：`00847c7`。

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

## 2026-11-22 · Day 3 收尾：面板加峰值保持和 CSV 导出

**为什么要加**：瞬时值截图抓不到眨眼峰值——真人眨眼只有 100–150ms，而 `blinkHoldMs` 是 180ms，
「自然眨眼能不能撑满阈值」这条未验项靠肉眼看面板是验不出来的。

**做法**：
- `useDebugTrace(frame, cursorX, events)` 只做观测，不碰 `gestureEngine.ts` / `config.ts` / `DEFAULT_CONFIG`，判定逻辑一字未改。
- 峰值和 60 秒环形缓冲放在 `GameScreen` 调 hook、把结果当 props 传给面板。这点是有意的：
  `DebugPanel` 按 D 关掉就整个卸载，状态放面板里等于每次开关面板都清零。
- 同一帧可能被 React 重放（StrictMode 对 effect 的双跑），用单调递增的 `frame.t` 去重，`if (frame.t === lastT) return`。
- `buildCsv(rows)` 抽成纯函数，于是不需要 jsdom 和 testing-library 就能测——保持「零新增依赖」这条不破。
- CSV 带 UTF-8 BOM + CRLF；`URL.revokeObjectURL` 延后 4 秒，立刻回收在 Safari 上会拿到空文件。
- 峰值用 `text-ring`（#58c4ff）蓝，瞬时值保持白色，一眼分得开。

**验证**（演示模式跑虚拟玩家，14 秒 = 3 个以上眨眼周期）：
- 瞬时 `blinkL/blinkR = 0.000` 时，`max blinkL/max blinkR` 仍是 `1.000`，`max |yaw| = 0.160`、`max pitch = 0.140`
  正好等于虚拟玩家的脉冲幅值；confirm 计数在涨，pause 为 0（脚本没有 jaw 脉冲）。
- 「重置峰值」后全部归零 ✅。
- 导出的 CSV 用 Excel 解析器打开：9 列、表头正确、空 `event` 字段保留、BOM 是 `EF BB BF`、CRLF 行尾。
- 27 条用例全绿（22 条原有 + 5 条 `buildCsv`），控制台无报错。

一个已知代价：演示模式的 `ScriptedSource` 每个 RAF 出一帧，60 秒缓冲在 230Hz 屏上能存到一万多行（几百 KB）。
摄像头模式检测按 33ms 节流，同样 60 秒只有一千八百行左右，不用为此加限流。

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
