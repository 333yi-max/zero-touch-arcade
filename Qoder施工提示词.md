# 零触控游乐场 · Qoder 施工提示词

> 用法：在 Qoder 里新建项目后，**按顺序**把下面的提示词一条一条粘进去。
> 每条做完 → 本地跑 → 截图 → 提交 → 再粘下一条。
> 不要一次把 8 条全发，也不要让 Qoder 一次生成整个项目。

---

## P0 · 项目骨架（Day 1）

```
你是我的前端搭档。我们要做一个纯前端项目「零触控游乐场」，参加 2026 Qoder 高校创造力大赛 Hack4Good 赛道。目标用户是上肢障碍者、术后康复者、行动不便的老人。他们不能用手，只能用头、眼睛和嘴操作浏览器。

技术约束：
- Vite + React 18 + TypeScript
- 纯静态，无后端、无账号、无数据库
- 不使用 Three.js，游戏用 Canvas 2D
- 所有视频在浏览器本地处理，不上传
- 部署到 Qoder Sites，vite base 设为 './'

本次只做「骨架」，不要接摄像头：
1. 创建项目并配置 Tailwind。
2. 实现状态机：start → calibration → game → result。
3. start 页：大标题「零触控游乐场」，副标题「不用手，也能玩三分钟」，三个按钮：开始体验（需要摄像头）、演示模式（不用摄像头）、看 60 秒视频（占位）。
4. calibration 页：3 步占位（正对、向左、向右），有进度和「跳过（演示模式）」。
5. game 页：一个空 Canvas + 顶部返回按钮。
6. result 页：分数占位 + 分享卡占位。
7. 全局样式：大按钮（最小 64px 高）、高对比、支持手机竖屏。
8. 写 README：如何 npm run dev / build，如何部署到 Qoder Sites。

验收：
- npm run build 成功
- 首页在 375px 和 1440px 宽度都正常
- 控制台无报错
- 不引入任何后端依赖

做完后告诉我改了哪些文件，并给出下一步建议。不要一次性实现摄像头或游戏。
```

---

## P1 · 输入抽象 + 虚拟玩家（Day 2）

```
在现有骨架上，实现「输入源抽象」和「虚拟玩家演示模式」，仍然不要接摄像头。

定义：
type RawFrame = { t:number; yaw:number; pitch:number; blinkL:number; blinkR:number; jaw:number; present:boolean };
type InputState = { cursorX:number; confirm:boolean; pause:boolean };
interface InputSource { start(): Promise<void>; stop(): void; onFrame(cb:(f:RawFrame)=>void): void; }

实现两个 InputSource：
1. ScriptedSource：用 requestAnimationFrame 生成确定性的虚拟输入。每 1.4 秒做一次「转头回中」的正弦摆动（yaw 幅度 0.16），每 3 秒点头一次（pitch 0.14 持续 200ms），每 4 秒眨眼一次（blink 1 持续 120ms），jaw 恒为 0。t 用 performance.now()。
2. CameraSource：先留空实现，start() 直接 throw new Error('camera not implemented')，保证接口一致。

实现 GestureEngine（纯函数/类，不依赖 DOM）：
- 输入 RawFrame，输出 InputState 和事件 'confirm' | 'pause'
- EMA 平滑 α=0.35
- 死区 0.05，量程 0.18，cursorX 映射到 -1..1
- 点头：pitch 偏移 > 0.09 且保持 220ms → confirm；回落到 0.04 以下才重新武装
- 眨眼：双眼都 > 0.55 且保持 180ms → confirm；冷却 700ms；低于 0.25 重新武装
- 张嘴：> 0.5 保持 350ms → pause；冷却 1200ms
- 校准：calibrate(samples) 记录 yaw/pitch 中性值，之后所有偏移都减中性值

在 start 页的「演示模式」按钮上接 ScriptedSource + GestureEngine，game 页显示一个跟随 cursorX 移动的方块，confirm 时方块变绿，pause 时弹出「已暂停」。

为 GestureEngine 写 Vitest 单元测试：
- 中性帧不触发事件
- 持续点头触发一次 confirm，不重复触发
- 眨眼触发一次 confirm
- 张嘴触发 pause
- 转头映射到 cursorX 的正负方向

验收：
- npm test 全绿
- 演示模式下方块随虚拟输入左右移动，定时变绿
- 不接摄像头也能走完 start → game → result

不要实现真实摄像头，不要加新依赖（除了 vitest）。
```

---

## P2 · 摄像头 + 姿态（Day 3）

```
现在接真实摄像头，使用 @mediapipe/tasks-vision 的 FaceLandmarker。

要求：
1. 安装 @mediapipe/tasks-vision，并把 node_modules 里的 wasm 复制到 public/wasm，模型下载到 public/models/face_landmarker.task。用 import.meta.env.BASE_URL 拼路径，保证 Qoder Sites 子路径部署可用。
2. CameraSource：
   - getUserMedia({ video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} }, audio:false })
   - 创建隐藏 video，muted/playsInline，加入 DOM，等待 loadedmetadata 后 play
   - FilesetResolver.forVisionTasks(BASE_URL + 'wasm')
   - FaceLandmarker.createFromOptions：runningMode VIDEO，numFaces 1，outputFaceBlendshapes true，delegate GPU，失败自动降级 CPU
   - requestAnimationFrame 循环，video.currentTime 变化才调用 detectForVideo，时间戳用 performance.now()
3. 把 detect 结果转成 RawFrame：
   - 关键点：1 鼻尖、234 右颊、454 左颊、33 右眼外角、263 左眼外角、10 额头、152 下巴
   - faceW = 距离(234,454)，faceH = 距离(10,152)
   - yaw = (鼻尖.x - 两颊中点.x) / faceW
   - pitch = (鼻尖.y - 双眼中点.y) / faceH
   - blinkL/R、jaw 从 faceBlendshapes 取 eyeBlinkLeft/eyeBlinkRight/jawOpen
4. 调试面板：按 D 键显示摄像头预览（镜像 scaleX(-1)）、关键点、yaw/pitch/blink/jaw 数值。默认隐藏。
5. 权限失败、无摄像头、非 HTTPS 时，抛出可读错误，UI 显示「无法使用摄像头，试试演示模式」和排查步骤。
6. 处理镜像：预览镜像显示，但 cursorX 要取 -yawDelta，保证用户向左转头，光标向左。把这个方向做成常量 MIRROR_X = -1，方便调试。

验收：
- Chrome 桌面能看到实时数值
- 向左转头 yaw 变化方向正确，光标向左
- 拒绝权限时不崩溃，能回演示模式
- 控制台无报错

不要做校准 UI，不要做游戏。
```

---

## P3 · 校准 + 完整手势（Day 4）

```
实现 3 步自适应校准和完整手势引擎。

校准流程：
1. 「正对屏幕，保持 2 秒」：采集 45 帧，取 yaw/pitch 平均值作为中性位。
2. 「慢慢向左看，到舒服的最大幅度，再回正」：记录最小 yaw（相对中性位的负偏移）。
3. 「慢慢向右看，到舒服的最大幅度，再回正」：记录最大 yaw。
4. 计算 range = clamp(max(|左|,|右|), 0.08, 0.22)。如果用户活动范围很小，自动放大灵敏度；如果很大，压缩，避免过度敏感。
5. 最后「眨两次眼确认」：连续两次 blink 事件完成校准。
6. 校准结果存 localStorage（只存数值，不存视频/照片），下次可直接复用，提供「重新校准」。

UI：
- 每步一个大图标 + 一句话 + 进度环
- 文字大、对比高、可语音播报（Web Speech API，zh-CN）
- 任何一步都可以「跳过，使用默认值」
- 校准中实时显示「偏移条」，让用户看到自己的动作被识别

手势引擎升级：
- 使用校准后的 yaw/pitch 中性值和 range
- cursorX = clamp(MIRROR_X * yawDelta / range, -1, 1)
- 点头阈值改为 range 的 55%，回中阈值 25%
- 增加「灵敏度」滑块（0.7–1.3），存 localStorage
- 所有阈值集中在一个 config.ts，方便调参

验收：
- 不同人校准后都能在 30 秒内完成
- 只转 10° 的用户也能让光标走满全程
- 校准后点头/眨眼/张嘴误触明显减少
- 单元测试覆盖 range 放大/压缩

不要做游戏内容。
```

---

## P4 · 游戏 1「接星星」（Day 5）

```
实现第一个游戏「接星星」，用 Canvas 2D，输入只来自 InputState。

玩法：
- 画布逻辑尺寸 800x600，按 devicePixelRatio 缩放，适配手机竖屏（上下留白）
- 底部一个挡板，宽度 120，cursorX (-1..1) 映射到挡板中心 x
- 星星从顶部随机 x 落下，速度 120–260 px/s，每 600ms 生成一个
- 接到 +10 分；漏掉 3 个结束；金色星星每 8 个出现一次，+30 分
- 连击：连续接到，每 5 个加一次倍率，最高 x3
- 时长上限 90 秒
- confirm（点头/眨眼）在开始前用于开始，结束后用于重开；游戏中不响应 confirm，避免误触
- pause（张嘴）暂停，显示「张嘴或点头继续」
音效与动效（必须，规格见实施方案 7.9）：
- 事件音：手势确认（三角波 60ms，点头 660Hz / 眨眼 880Hz）、接住（523→784→1047 上行）、漏掉（180Hz 软咚）、开始/结束（523/659/784）。
- 连续音：一个很轻的 trackingTone，随 |cursorX| 略微升高，音量 0.02–0.05，可静音。
- 动效：挡板缓动 + 轻微拖尾；手势确认缩放 1→1.12→1（180ms）；接住 6–8 粒子 + 分数上浮（300–400ms）；连击边缘微光。
- 所有声音必须配视觉变化；听障用户不能只靠声音。
- 不做 BGM、全屏闪烁、大幅震动。
- 用 Web Audio API 合成，不引入音频文件；主音量 0.3，静音状态存 localStorage。

界面：
- 顶部：分数、剩余生命、暂停按钮（给陪护者用）
- 开始前 3 秒倒计时，语音「准备，转头控制挡板」
- 结束页：接到/总数、最长连击、得分、再玩一次、返回

演示模式：
- 用一个简单的 AI 自动跟随最近的星星（直接改 cursorX），让演示模式能拿到高分
- 但 InputState 仍然来自 ScriptedSource，AI 只做「辅助瞄准」，不要作弊到 100%

验收：
- 摄像头和演示模式都能完整玩一局
- 60fps（Chrome Performance 面板）
- 手机竖屏不溢出
- 暂停/继续正常
- 音效可关闭，静音状态刷新后保留
- 每个事件都有声音 + 视觉双反馈
- prefers-reduced-motion 下粒子和震动关闭

不要做第二个游戏。
```

---

## P5 · 游戏 2 + 结果页（Day 6）

```
实现第二个游戏「节奏点头」和结果页/分享卡。

游戏 2：
- 60 BPM，16 拍，约 16 秒
- 屏幕中央一个收缩环，1.2 秒内从大到小，重合目标圈时点头
- 判定：±120ms Perfect 100 分，±250ms Good 60 分，否则 Miss
- 连续 Perfect 有连击提示
- 结束显示准确率、最高连击、评级（S/A/B/C）
- 开始前语音「跟着节拍点头」
- 对活动范围小的用户，点头阈值自动降低（用校准 range）

结果页：
- 显示两个游戏的最佳成绩（localStorage）
- 生成分享卡：1080x1440 Canvas，渐变背景、大分数、游戏名、「我不用手也能玩」、日期、一个简洁的脸部线条图标
- 下载 PNG；支持 Web Share API（可用时）
- 「再玩一次」「换个游戏」「回到首页」

验收：
- 两个游戏都能从 start 走完
- 分享卡能下载，中文不乱码
- 刷新后最高分还在
- 演示模式能自动玩完节奏游戏（按节拍注入 confirm）

不要做排行榜、账号、后端。
```

---

## P6 · 打磨 + 部署（Day 7–8）

```
做最后的打磨和部署。

1. 首屏优化：模型预加载（开始页后台加载），显示进度；3 秒内出现首屏。
2. 权限引导：摄像头被拒绝/无设备/非 HTTPS 时，显示 3 步排查 + 「先用演示模式」按钮。
3. 兼容性：Chrome/Edge 优先；Safari 给出提示；手机前置摄像头可用。
4. 无障碍：所有按钮 aria-label、焦点环、最小 64px、对比度 4.5:1、减少动画开关、语音开关。
5. 性能：检测 30fps、渲染 60fps、页面隐藏时暂停摄像头、Canvas 适配 DPR。
6. 错误兜底：任何异常都显示可读提示，不白屏；加 ErrorBoundary。
7. 部署：vite base './'，npm run build，产物 dist，部署到 Qoder Sites，公开访问。用无痕窗口验证模型/wasm 路径。
8. 写 README：功能、技术栈、本地运行、部署、隐私说明。
9. 生成 docs/qoder-log.md 模板：日期、目标、给 Qoder 的提示、生成结果、我改了什么、截图文件名。

验收：
- 无痕窗口打开公开链接，3 秒内看到首屏
- 无摄像头能走完演示模式
- 有摄像头能完成校准 + 一局
- 手机竖屏正常
- 控制台无报错
- Lighthouse 性能 > 80（桌面）
- 静音状态刷新后保留
- “减少动画”开关生效，并尊重 prefers-reduced-motion
- 声音与视觉双反馈，不依赖单一通道

不要加新功能。
```

---

## P7 · 参赛材料（Day 8–9）

```
帮我整理参赛论坛帖和演示视频脚本。

1. 根据 README 和 docs/qoder-log.md，生成论坛帖初稿，必须包含五部分：自我介绍、作品是什么（一句话）、为什么做、怎么用（5 步以内）、用 Qoder 做出来的过程（哪几步交给它、我改了什么）。
2. 过程部分按时间线列 8 个关键节点，每个节点配一句「截图说明」，例如：脚手架生成、摄像头接入、镜像方向 bug、校准量程、手势误触、性能优化、部署、最终验收。
3. 生成 60 秒演示视频的分镜脚本：0-5 秒钩子、5-15 秒问题、15-45 秒演示、45-55 秒技术、55-60 秒行动号召。
4. 生成 3 分钟答辩稿：问题、演示、技术、真实用户反馈、未来。
5. 所有文案用中文，语气真诚、不堆术语；不要编造用户数据，没有数据就用真实场景描述。
6. 最后给一个提交检查清单。

不要写代码。
```

---

## 现场调参备忘

| 现象 | 先调什么 |
|---|---|
| 光标抖 | `EMA_ALPHA` 调小（0.25） |
| 光标跟不上 | `EMA_ALPHA` 调大（0.45） |
| 不转头光标也动 | `DEADZONE` 调大（0.07） |
| 转满头光标走不满 | `RANGE_MAX` 调小，或让用户重新校准 |
| 点头不触发 | `NOD_HOLD_MS` 调小（180），阈值 0.5 |
| 点头连发 | 回中阈值调大（0.35），冷却调大 |
| 眨眼误触 | `BLINK_HOLD_MS` 调大（220），阈值 0.65 |
| 张嘴误触 | `JAW_HOLD_MS` 调大（500） |
| 暗光识别差 | 提示补光；`delegate` 改 CPU；降低检测分辨率 |
| 镜像反了 | `MIRROR_X` 从 -1 改 1 |

---

## 提交前 30 分钟检查

- [ ] 链接无痕窗口可打开
- [ ] 无摄像头能走演示模式
- [ ] 手机竖屏正常
- [ ] 控制台无红色报错
- [ ] 论坛帖五部分齐全
- [ ] 截图 ≥8 张，能看出“我改了什么”
- [ ] 60 秒视频可播放
- [ ] 社交分享带话题 + @官方
- [ ] 所有成员已完成实名/学生认证
- [ ] 11/30 18:00 前已提交
