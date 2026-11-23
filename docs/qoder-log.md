# 施工日志

按天记录「Qoder 在这个项目里改了什么、为什么改、怎么验的」。
重点不是生成了多少页面，而是踩到的坑和判断依据——论坛帖「我改了什么」直接从这里取素材。

---

## 2026-11-24 · Day 7：自主迭代冲刺（10 轮，夜间）

所有者授权自主迭代：不询问、逐轮「审计 → 改 → 回归 → 记录」，每轮一个提交。
红线：不动校准/引擎阈值/zt.calibration.v1 与 zt.settings.v1、不加运行时依赖（lucide-react 除外）、
逻辑纯函数可测、不编造数据、不部署线上。产品决策已拍板：**保留贪吃蛇，最终 5 个游戏**。

### 第 1 轮 · 基线固化

**改了什么**：把上一轮未提交的「全站视觉精致化 + 游戏 3 霓虹贪吃蛇」一次性提交（`1a1ae8f`，
33 文件 / +2225 行）；引入截图验收工具链：`puppeteer-core@25.18.1`（精确锁版 devDependency，
驱动系统 Edge，app 代码零引用、产物零影响）+ `scripts/shots.mjs`（真页面截图 + 网络 4xx/5xx
与 console error 门禁，`--reduced` 档模拟 prefers-reduced-motion，输出 docs/shots/ 编号续 53）。

**基线数据**：145 条测试全绿（15 个文件）；构建体积 js 388.37 kB（gzip 120.33 kB）、
css 29.08 kB（gzip 6.43 kB）、html 0.77 kB（gzip 0.53 kB）。

**发现**：基线截图（53–56）里首页数据卡数字已过期——「123 条测试 / 2 个小游戏」，
实际 145 条 / 5 个游戏。根因：数字是视觉升级时手写的静态文案，没有跟随代码演进。
修法：第 3 轮改成真实数据（测试数运行时取、游戏数按 GameId 推导）。已列入第 3 轮清单。

**验证**：npm test 145/145 ✅；npm run build ✅；截图脚本 4 张（1280 首页/选游戏/贪吃蛇、375 首页）
网络 4xx/5xx = 0、console error = 0 ✅。

### 第 2 轮 · 全宽布局收口

**改了什么**：
- App.tsx：wide 屏容器 max-w-6xl → max-w-7xl（1280 满宽利用），校准页维持 max-w-3xl 窄栏；页脚同步放宽。
- 首页 StartScreen：两栏 grid 改 `lg:grid-cols-5`（文案 3 列 / 示意+数据卡 2 列），右侧栏 `lg:sticky lg:top-8`。
- 选游戏页 SelectScreen：纵向大按钮列表 → 卡片网格（sm:2 列、lg:3 列），每张卡 = 图标 + 名称 + 一句话玩法 + 时长 + 适用人群 + 「开始」按钮；「再念一遍 / 返回首页」留在底部。
- 游戏页 GameScreen：抽 `SessionLayout` 外壳，xl 起两栏（左画布尽量大 / 右栏竖排 HUD + 玩法提示卡），窄屏上下堆叠、HUD 在画布上方；摄像头预览 320px 小窗贴右栏顶部（xl 撑满右栏）；三个 HudBar 在 xl 改竖排；画布高度钳位放宽为 `xl:max-h-[80vh]`。
- 截图脚本 clickByText 加兜底：选游戏页卡片按钮文案是「开始」，按卡片标题匹配。

**发现 / 根因 / 修法**：
1. 卡片化后截图脚本路由失效——按钮 textContent 从游戏名变成「开始」。修法：shots.mjs 里找不到按钮时退回按 `article` 卡片标题定位再点其中按钮。
2. 「时长」字段不能编：节奏点头 16 拍 × 1s ≈ 20 秒（BPM=60、BEATS=16）；接星星是命数制没有时限，如实写「漏 5 颗星结束」（START_LIVES=5、SPAWN_INTERVAL_MS=750）；贪吃蛇 90 秒（GAME_DURATION_MS=90000）。不写拍脑袋的「3 分钟一局」。

**验证**：npm test 145/145 ✅；npm run build ✅（js 391.47 kB / gzip 121.38 kB，css 30.50 kB / 6.66 kB）；
截图 57–66 共 10 张（1280/1440/375 三档 × 首页/选游戏/接星星/贪吃蛇/节奏点头，66 为 reduced-motion 档）：
三档无横向溢出，xl 两栏、窄屏堆叠均符合预期；网络 4xx/5xx = 0、console error = 0 ✅。

**提交**：`a8bb490`。

### 第 3 轮 · 首页内容饱满

**改了什么**：
- 新增「评委 30 秒」区块（这是什么 / 给谁用 / 怎么玩 + 演示模式入口 / 证据），插在三张特性卡与 CTA 之间。
- 数据卡改真实数字：测试数由 `scripts/testcount.mjs` 在 npm predev/prebuild 跑 `vitest list` 生成
  `src/generated/testCount.ts`（数不出任何测试就退出码 1，拒绝生成假数字）；游戏数从共享元数据
  `src/components/gameMeta.ts` 的 GAMES 长度推导（选游戏页与首页同一份，第 4/5 轮加游戏自动变 5）；
  对外请求数运行时用 `performance.getEntriesByType('resource')` 实测（`game/networkStats.ts` 纯函数 + 3 条单测）；
  「0 次上传」由架构保证、由对外请求计数背书。
- 玩法示意卡：星星加飘落循环动画（keyframes 接管 top、负延迟错峰），reduced-motion 回退静态位置。
- FEATURES「三个小游戏」改为按 GAMES.length 拼接，不再手写数字。

**发现 / 根因 / 修法**：
1. 首页「123 条测试 / 2 个游戏」是第 1 轮基线审计发现的过期手写数字，根因是文案硬编码不随代码演进。
   修法：测试数生成、游戏数推导、请求数实测，全部运行时真实值。
2. `spawnSync('npx.cmd')` 在 Windows 报 EINVAL（.cmd 必须走 shell）。修法：testcount 直接
   `node node_modules/vitest/vitest.mjs list`，跨平台且更快。

**验证**：npm test 148/148 ✅（新增 networkStats 3 条）；npm run build ✅（prebuild 自动重生成测试数 148；
js 394.72 kB / gzip 122.42 kB，css 31.41 kB / 6.79 kB）；截图 67–70（1280 首页/选游戏、375 首页、
reduced-motion 首页）：数据卡 148 / 3 / 0 / 0 与真实一致，评委块 lg 四列、375 无溢出，reduced 档星星静态；
网络 4xx/5xx = 0、console error = 0 ✅。

**提交**：`d4ce51f`。

### 第 4 轮 · 游戏 4「打地鼠」

**改了什么**：
- 新纯逻辑 `src/game/whackGame.ts`：3×3 九洞，一维准星沿「蛇形路径」滑动（`whackPathPoint` 线性插值、
  `holeIndexForCursor` 就近取整、`cursorForHole` 往返映射，全部纯函数）；60 秒或敲中 25 个结束，漏 8 个结束；
  地鼠 0.8–1.4 秒随机出现、金色每 10 只出现一次；敲中 +10×倍率（连击每 5 个 +1，封顶 ×3），金鼠 +30×倍率；
  敲空断连击但不扣漏数，缩回才计漏；暂停语义与接星星一致（张嘴/点头暂停，恢复的 confirm 不敲地鼠）；
  单步 dt 钳位 100ms、随机数注入、`moles` 整层浅拷贝隔离帧间状态。
- 新演示 AI `src/game/demoWhack.ts`：整体接管输入（瞄准+点头，不依赖 ScriptedSource 的 3 秒点头节奏）——
  朝路径距离最近的可见地鼠按 0.18 速率滑去，到位后按 350ms 节拍点头；ready 相位延迟 1.5 秒自己开局
  （让「准备好了吗」卡片先露脸）。手算验证过命中上界 < 地鼠寿命下界，整局必以「敲满 25 个」结束。
- 新 hook `src/hooks/useWhackGame.ts`（demo 标志整体切换输入源）+ 画布渲染 `src/components/WhackGame.tsx`
  （蛇形路径虚线、洞口椭圆、地鼠弹出缓动/缩回、准星光环随连击增亮、敲中爆发粒子、敲空红叉、缩回红圈、
  金鼠四芒旋转，reduced-motion 全静态）。
- 全站集成：machine GameId 加 'whack'；bestScores 加可选字段 `whack`（旧存档缺失按 null 兼容）；
  shareCard GAME_NAMES；sound 加敲击音（金鼠三连上行）/缩回音；gameSpeech 加 whackCountdown/whackGameOver；
  SelectScreen 第四张卡；GameScreen WhackSession + WhackHudBar（敲中/漏计数）；ResultCard 统计行
  （敲中/漏/最高连击）；shots.mjs 加 game-whack 路由与 `WAIT:毫秒` 延时指令。

**发现 / 根因 / 修法**：
1. `WhackGameState` 起初没有 cursorX——渲染器要画准星但状态里没有。修法：像接星星的 paddleX 一样，
   step 每帧把 input.cursorX 抄进状态，渲染器只读状态；补「准星跟手」单测锁死。
2. 演示 AI 首帧就点头，ready 卡片一闪而过、截图脚本点不到「开始游戏」按钮。根因：记忆脉冲时间戳
   初始 -1e9（纯函数测试用）。修法：hook 里用挂载时刻 `performance.now()` 初始化记忆 + ready 相位
   停顿 1.5 秒；shots.mjs 支持 `WAIT:6500` 延时等倒计时走完再拍对局。
3. 设计决策（拍板记录）：敲空没声音只有红叉——安静，不吓人；连击只在敲空时断，别的洞缩回不断；
   pause 沿用张嘴，和接星星/贪吃蛇一致（吹蜡烛才是「无暂停」的例外，下一轮）。

**验证**：npm test 173/173 ✅（新增 whackGame 20 条 + demoWhack 4 条 + bestScores 补 1 条，148→173）；
npm run build ✅（js 410.49 kB / gzip 125.40 kB，css 31.43 kB / 6.79 kB）；截图 71–77：71/72 打地鼠
1280 ready 与对局（演示 AI 已在敲，得分 30/敲中 3）、73/74 同档 375 无溢出、75 reduced-motion 档、
76/77 选游戏页四卡 1280/375；网络 4xx/5xx = 0、console error = 0 ✅。

**提交**：`c26cb55`。

### 第 5 轮 · 游戏 5「吹蜡烛」

**改了什么**：
- 新纯逻辑 `src/game/candleGame.ts`：一排 5 支蜡烛，张嘴（jaw 电平）累计 400ms 吹灭最左一支，吹灭 +20；
  2 秒内连吹下一支 +10 奖励；60 秒内吹完 5 支结束（done），没吹完按已灭数结算（time）。
  **无暂停相位**——嘴是主操作，不能兼职暂停键（设计拍板，与计划一致）；60 秒短，HUD 只放音效开关。
  吹气进度半速衰减（不张嘴时按 0.5× 速率回落）：持续张嘴最快，断续吹也吹得灭（无障碍友好）；吹灭瞬间
  进度清零、余量不结转；单步 dt 钳位 100ms（切后台回来不会瞬间吹灭）；`candles` 数组浅拷贝隔离帧间状态。
- 新演示 AI `src/game/demoCandle.ts`：整体接管输入——ready 延迟 1.5 秒点头开局，playing 按 1100ms 周期
  张嘴（500ms 吹 / 600ms 歇，净进度 +200ms/周期 → 约 1.3 秒吹灭一支），整局模拟 5.6 秒吹完 5 支、140 分。
- 新 hook `src/hooks/useCandleGame.ts`（demo 标志整体切换输入源，latch = {confirm 脉冲, blow 电平}）
  + 画布渲染 `src/components/CandleGame.tsx`（烛身渐变+桌面阴影、火焰呼吸摆动、当前目标进度环+右侧风线、
  熄灭烟圈、吹灭瞬间三层扩散烟圈+飘字，reduced-motion 下火焰静态、无进度环）。
- 全站集成：machine GameId 加 'candle'；bestScores 加可选字段 `candle`（旧存档缺失按 null 兼容）；
  shareCard GAME_NAMES；sound 加 extinguishSound（高→低「呼」滑音，连吹加一声清亮叮）；gameSpeech 加
  candleCountdown/candleGameOver；SelectScreen 第五张卡（Flame 图标，ANNOUNCE/提示「四个→五个」）；
  GameScreen CandleSession + CandleHudBar（得分/已灭 x/5/连吹徽章 + 音效开关，无暂停按钮）；
  ResultCard 统计行（吹灭 x/5 · 连吹 y 次）；shots.mjs 加 game-candle / game-candle-playing
  （WAIT:7500）/ game-candle-over（WAIT:11500）路由。

**发现 / 根因 / 修法**：
1. CandleGame 渲染器引 `GAME_WIDTH/GAME_HEIGHT` 但 candleGame.ts 没导出（这两个常量在 star/whack 模块里
   是各游戏自带的）。修法：candleGame.ts 补导出 800×600，与其它游戏模块一致。
2. 单测算术坑（前 4 条测试全踩一遍才过）：advance() 按 16ms 步进会跨过多拍点（352≠350）→ 改直接 step 传
   dt=100/50；断续吹的净进度周期算错（吹 500/歇 500 时 1600ms 内净 +800，实际吹灭在 ~960ms）→ 按
   「吹 dt 净 +dt、歇 dt 净 −0.5dt」重算边界 800–1600ms；衰减测试忘了 MAX_STEP_MS=100 钳位（1000ms 一步
   被钳成 100ms）；时间到测试缺 ready→countdown 的 confirm 上升沿。
3. 演示 AI 初版 1000ms 周期（吹 500/歇 500）净进度 +250/周期，整局 4.4 秒就吹完——太快，倒计时占大头、
   对局一眨眼。修法：周期改 1100ms（吹 500/歇 600），整局 5.6 秒；演示结果卡截图也稳定可拍。
4. 设计拍板记录：吹蜡烛**没有暂停**、衰减半速（见上）；**没有持续吹气音**——持续合成音会盖过别的
   反馈且烦人，吹灭瞬间给声音就够。摄像头真人张嘴链路未验（无头环境验不了）——写入遗留待办，
   演示整局已验证能吹完，不假装验过真人。

**验证**：npm test 191/191 ✅（新增 candleGame 15 条 + demoCandle 3 条，173→191）；npm run build ✅
（js 421.93 kB / gzip 127.35 kB，css 31.43 kB / 6.79 kB）；截图 78–85：78/79 吹蜡烛 1280 ready 与对局
（已灭 3/5、飘字「+20 连吹 +10」、连吹徽章）、80/81 同档 375 无溢出、82 结果卡（得分 140、吹灭 5/5、
连吹 4 次、最佳 140，与整局模拟一致）、83/84 选游戏页五卡 1280/375、85 reduced-motion 档（火焰静态、
无进度环动画）；网络 4xx/5xx = 0、console error = 0 ✅。

**提交**：`d07f98e`。

### 第 6 轮 · 游戏页 HUD 与结果卡统一

**改了什么**：
- 新共享子件 `src/components/gameHud.tsx`：HudContainer（HUD 外壳，xl 起竖排 + 行间细分隔线）、
  HudField（小标签 + 数值）、HudScore（「得分」小标签 + 大数字 tabular-nums）、HudStat、HudBadge
  （accent / accent-hi 两档）、HudLives、CountdownAnnouncer（倒计时 sr-only 播报）、
  HudActions + MuteButton + PauseButton（音效/暂停按钮全 HUD 样式与位置对齐）。
- 五个 HudBar（Star/Rhythm/Snake/Whack/Candle）全部改用共享子件，结构统一：得分 → 专属行
  （生命 / 拍子+判定 / 时间+长度 / 敲中+漏 / 已灭）→ 徽章（连击 / 闪耀 / 连吹）→ 音效+暂停按钮；
  rhythm 与 candle 无暂停按钮（沿用既有设计）。GameScreen 里三份复制粘贴的暂停按钮和本地
  MuteButton 定义一并删除。
- ResultCard：分数改「小标签『得分』+ 大字数字」；五个游戏一行统计、最佳行、四按钮层级
  （再玩/换游戏/分享卡/回首页）保持；入场动画在 prefers-reduced-motion 下由全局规则禁用（截图 96 验证）。

**发现 / 根因 / 修法**：
1. 截图脚本点「开始游戏」有竞态：ScriptedSource 的虚拟玩家从 t=0 就在点头（`t % 3000 < 300`），
   ready 卡片存活不到半秒，点按钮全凭运气（此前接星星/贪吃蛇路由时灵时不灵）。修法：对局态路由
   一律 WAIT 制——game-star-playing WAIT:5000、game-snake-playing WAIT:6000，与打地鼠/吹蜡烛一致。
2. 结果卡等待时长不能拍脑袋：接星星第 5 颗漏星在 id 149（sin-hash 确定性 ≈ 112 秒），实测先撞
   90 秒时间到（112/116 接住、4 漏）——WAIT:125000 时结果卡早已就位；贪吃蛇 90 秒局 WAIT:98000；
   打地鼠敲满 25 个约 21 秒 + 开局 ≈ 26 秒 WAIT:32000。五张结果卡全部真实打完再截，分数均来自
   实际对局（3340 / 1400·A / 310 / 740 / 140）。
3. `--reduced` 是全局开关，第一次批量命令把 91–95 全拍成减动效档。修法：重拍正常档，减动效只留
   96 一张，误拍的 91–95-reduced 删除。

**验证**：npm test 191/191 ✅（本轮不动游戏逻辑）；npm run build ✅（js 420.23 kB / gzip 127.64 kB，
比第 5 轮 421.93 略降——HUD 去重生效）；截图 86–97：86–90 五个游戏对局 HUD 1280（小标签 + 分隔线 +
  对齐按钮一致）、97 吹蜡烛 375 窄屏横排、91–95 五张结果卡 1280 风格一致、96 减动效档结果卡；
网络 4xx/5xx = 0、console error = 0 ✅。

**提交**：`da87f9d`。

---

## 2026-11-24 · Day 6：选游戏页 + 游戏 2「节奏点头」+ 统一结果卡与分享卡

交付内容（提交 `c95a654`）：状态机加 `select` 屏与 `gameId`，删掉 `result` 屏和 `game_finished`/`replay` 两个死事件；
新纯模块 `rhythmGame` / `demoRhythm` / `bestScores` / `shareCard` 各配单测；`GameScreen` 按游戏拆成 `StarSession` /
`RhythmSession` 两个自持 hook 的会话；音效加节拍/判定/评级音；结果卡统一，最佳成绩存 `zt.best.v1`，分享卡 Web Share 优先。

### 节奏判定里最容易写错的两处

**浅拷贝共享 results 数组。** `step` 的 `st = {...s}` 是浅拷贝，`judgeAt` 里直接 `st.results.push(...)` 会污染调用方手里的旧状态，
整局重放时历史帧全被改写。必须 `st.results = [...st.results, result]`。starGame 的 `st.stars` 同款坑，Day 5 踩过，Day 6 又踩一次。

**提前判定会吃掉拍点音。** 拍点事件按 `elapsed >= beatAtMs(i)` 触发，但 confirm 允许提前 ±120ms 判定 —— 如果 beat 事件和判定共用
`beatIndex` 游标，提前 Perfect 会让这一拍的 beat 声直接消失。所以 `beatTick` 是独立游标：判定先走 `beatIndex`，
beat 事件照样在拍点那一刻发。对应测试「beat 事件在拍点越过时发出，不受提前判定的影响」锁死这条。

### 演示打拍：目标时刻 + 帧粒度，不是「到点按一下」

第一版测试用 100ms 步进模拟整局，奇数拍（目标 `beatAt+40`）在 100ms 步进下总是晚一帧触发，判成 good。
浏览器实际是 ~16ms 步进所以没事，但模拟和真实不一致的测试没有价值 —— 改成 16ms 步进（约 1200 步）后，
演示输入 ±40ms 的目标全部落在 perfect 窗口内。整局模拟锁死：14/16 命中 = 87.5%，评级 A、1400 分、完美连击 6。

### 演示模式的虚拟玩家会「替用户点再玩一次」

虚拟玩家每 3 秒点一次头，而「结束后点头 = 再玩一次」是 Day 5 的设计 —— 于是演示模式的结果卡每 3 秒就被顶掉，
浏览器验收点「下载分享卡」时撞上重开，卡在等待 download 事件。修法是给两个 hook 加 `replayOnConfirm` 选项
（默认 true，摄像头模式行为不变），演示模式传 false，虚拟玩家的点头不再循环重开。顺手把「结果卡 4 秒后仍在」写进验收脚本。

### 首次成绩没写进盘

ResultCard 挂载时记最佳分，最初只在「超过已有记录」时写盘 —— 每个游戏的**第一次**成绩 prev 是 null，
永远不写。浏览器验收发现 `zt.best.v1` 读出来是 null 才揪出来。修成 `prev === null || score > prev` 都写，
「新纪录」徽标仍只在超过旧纪录时亮。bestScores 的单测里补了「坏数据当没有、写不进也照常玩」两条。

### 无头 Chrome 的两条环境事实

- `navigator.canShare` 整个 **undefined**（不是返回 false），所以下载路径自然走到兜底；为测「Web Share 优先」得先
  `Object.defineProperty` 打桩 canShare/share，再断言文件名传进了 `share({files})`。
- data: 页面里的 `<a download>` 点击**不产生下载**，探针脚本要在真实的 http 源上跑。

### 怎么验的

- 单测 123 条全绿（`rhythmGame` 14 + `demoRhythm` 3 + `bestScores` 9 + `shareCard` 5 + machine 10 + 原有 82），`tsc` 干净，build 355KB JS。
- Playwright 无头验收（28 条全过）：首页 → 演示模式 → 选游戏 → 接星星整局（演示瞄准打到 170 分）→ 结果卡（4 秒稳定、
  最佳成绩）→ 分享卡 PNG 下载（243KB、`zero-touch-score-20261124.png`）→ 换个游戏 → 节奏点头自动打拍（Perfect、
  61fps）→ 结果卡（A 级、88%、1400 分）→ Web Share 打桩验证优先路径 → `zt.best.v1` 两个游戏都在 → 回首页 →
  坏数据 `{oops` 不崩 → 375px 三屏无横向溢出 → console error 0、4xx 0。截图 32–38 在 docs/shots。
- 摄像头模式的链路（校准 → 选游戏 → 两游戏）无头浏览器验不了，留给真人验收（README「下一步」第 3 条）。

### 复查：摄像头模式画布还差 15px

交付后我用假摄像头把摄像头链路跑了一遍（跳过校准 → 选游戏 → 接星星 → 准备态）：
`canvasBottom 817 > vh 802`，挡板最底下一条被裁在视口外。Day 5 定的 38vh 是按当时的 HUD 和间距算的，
Day 6 的 HUD 变高了，这 15px 就露出来了。两个游戏的摄像头画布一起压到 `max-h-[36vh]`，复测
`canvasBottom 801 ≤ 802`，一屏可见。123 条测试不受影响；复查截图 `39-day6-select.png`、
`40-day6-rhythm-result.png`、`41-day6-375.png`、`42-day6-camera-star.png`，证据 `day6-local-audit.json`。

**提交**：`421dfb1`。

### 复查二：一局太短 + 结果卡压在摄像头上

真人试玩后反馈：「一局太短」「结果卡怎么叠在摄像头上，看着简陋」。两处都是参数/布局问题，不是逻辑错。

- **一局太短**：3 条命、600ms 一颗、最高 260px/s。摄像头玩转头慢，二三十秒漏满 3 个就结束。
  改 5 条命、750ms 一颗、110–220px/s。演示整局现在能打满 90 秒（接 82 / 漏 5、2410 分），
  真人也留出翻盘空间。
- **结果卡压住摄像头**：结果卡原本是 `absolute inset-0` 贴在游戏画布内，内容比 36vh 的画布高，
  flex 居中后上下溢出，正好盖到摄像头预览和「已捕捉人脸」那行字上。改成 `fixed inset-0` 全屏 +
  不透明背景 + 居中卡片，内部可滚动，和预览彻底分开。
- 测试同步：生命 5、750ms/110–220 节奏、漏 5 结束；`demoAim` 的「故意漏」用例改用
  `AIM_SLIP_THRESHOLD` 常量（阈值 0.88 → 0.94，演示接得更顺），不再硬编码。

验证：123/123 全绿；本地 CDP 验收 `dots = 5`、演示整局 90 秒 2410 分（接 82/87）、结果卡
`position: fixed`、背景 `rgb(6,8,15)`、高度 802 全屏、375px 无溢出、4xx 0。截图
`49-fix-star-result.png`、`50-fix-375.png`。

**提交**：`5eaa9c9`。

### 发布（2026-11-24）

新 actionId `7f4b3a3d-b08e-471c-808b-367b0bcf0683` 发到同一 siteId，`published: true / access_mode: public`，
链接不变，线上资产换成 `index-BRq1Rx-K.js`（352.5 kB）+ `index-DTQDdeKD.css`。

- 九个资源 curl 全 200：`/` 57.8 kB、favicon、JS 352.5 kB、CSS 19 kB、模型 3.76 MB、wasm js 209.8 kB、
  wasm 9.42 MB、nosimd wasm 9.29 MB、nosimd js 209.7 kB。小插曲：nosimd 的文件名是
  `vision_wasm_nosimd_internal.wasm`（nosimd 在 internal 前面），第一次按 `internal_nosimd` 猜出个 404，
  对照 `dist/wasm/` 目录才发现是自己拼错。
- 无痕线上验收 28 条全过：演示整局接星星 **230 分**（300–600 带内）→ 结果卡 4 秒稳定 + 最佳成绩 →
  分享卡 PNG 251 KB（`zero-touch-score-20261124.png`）→ 节奏点头 A / 88% / 1400 → Web Share 打桩验证优先路径 →
  `zt.best.v1` 两个游戏都在（`{"star":230,"rhythm":1400}`）→ 回首页 → 坏数据 `{oops` 不崩 →
  375px 三屏无横向溢出 → 两游戏 fps 61 → console error 0、4xx/5xx 0。
- 截图 `39-day6-live-start.png` 至 `45-day6-live-375-rhythm.png`，证据 `day6-live/report.txt`。

---

## 2026-11-24 · Day 5：游戏 1「接星星」

三分钟一局，挡板跟 `cursorX`，点头/眨眼开局，张嘴暂停。规则全部在 [starGame.ts](../app/src/game/starGame.ts) ——
纯函数 `step(state, input, dtMs)`，随机数注入，node 里整局模拟；React 只做外壳，逻辑一行都没进组件。

### 为什么结束页不切成独立页面

Day 4 的状态机有 `game_finished → result`，验收后设计变了：结束后「再玩一次」要能被**点头触发**，手势得一直活着，
所以结束页做成 `GameScreen` 内的覆盖层，`ResultScreen.tsx` 删除。`machine.ts` 一字未动（result 分支不再派发，
9 条 machine 用例保持绿色）——删了它就得动状态机测试，而状态机本身没有错。

### 演示辅助瞄准调了三轮，每轮都死在「没积分记忆」

要求是「每帧朝最近星星 lerp ≤0.08」，还要「允许漏 1–2 颗、分数 300–600」。第一版：

```ts
// 错：每帧从当帧 cursorX 重算，等于没有记忆
return raw + (desired - raw) * 0.07;
```

模拟里挡板永远停在「脚本正弦 + 7% 偏移」的平衡点上，星星落在哪跟挡板毫无关系，整局只接到 2 颗。
第二版改成积分器（`next = prev + (desired - prev) * k`，调用方回传），但把摆动加在 `next` 上再回灌进积分器，
摆动被指数放大 13 倍。最终形态：`demoAimCursor` 返回 `{cursorX, next}` —— **摆动只叠在输出上，绝不回灌**。

「故意漏」也踩了方向坑：最初把瞄准点往**边缘**推，`clamp(±1)` 把偏移吃掉，贴边星照样接住（模拟 1190 分）。
改成往**场地中央**推（`side = star.x < 400 ? 1 : -1`），任何位置的星都能拉开 >75px 的接住窗口。
每颗星用确定性 sin-hash 挑「漏哪几颗」，同一局可复现。最终整局模拟：接 20 / 漏 3 / 最高连击 7 / **340 分**，
7 条 demoAim 用例把「每帧移动 ≤0.08」「收敛」「漏星方向」「整局分数 ∈ [300,600]」全部锁死。

### 画布反馈循环：canvas 属性尺寸参与布局

`width/height` 属性按 `getBoundingClientRect × dpr` 回写，canvas 在 aspect-[4/3] 容器里正常流布局时，
回写会撑大盒子 → 下一次测量更大 → 再回写，实测每帧涨 256→294px。改成 `absolute inset-0` 脱离文档流，
尺寸稳定 251px。和 CameraStage 是同一个病、同一个方子。

### 每个声音都有画面替身

验收要求听障用户不能只靠声音。接住：爆发火花圈 + 10 粒确定性散开粒子（300ms）；
漏接：底部红带 350ms + 挡板晃动；连击越高挡板光晕越大；`prefers-reduced-motion` 下这些全部关掉。
浏览器里用像素采样验：漏星瞬间红带像素 26809 个；`reducedMotion: 'reduce'` 下同样时刻 **0 个**。

这里有一个验证脚本自己埋的坑：漏星的生命值 DOM 变化比 React 被动 effect 盖 fx 时间戳**早一两帧**，
Playwright 一探测到就采样，正好采在闪光出现前，红像素 = 0。改成轮询 600ms 取峰值才过 ——
不是代码错了，是采样相位错了。

### 声音与偏好

全部 Web Audio 合成（零音频文件）：接住 523/784/1047 三连上行（连击越高越响）、漏接 180→140Hz 下行、
开局/结束琶音、点头 660Hz / 眨眼 880Hz 三角波、220Hz 光标跟随音独立一路（0.02–0.05，不吃 0.3 主音量）。
静音沿用 `zt.settings.v1`，**只增 `muted` 字段**，校准的 `voice` 原样保留 —— 存储 schema 没改，
calibrationStorage 的 9 条用例原样通过。默认开、刷新后保留（浏览器实测两轮 toggle + reload）。

### 验证

- **91/91 测试**（新增 starGame 14 + demoAim 7），`tsc` 零错，构建产物 `index-CzpUUvnr.js` 336 kB / gzip 105.8 kB
- 浏览器（CDP + 本机 Chrome，无痕）：演示整局打完**得分 380** ∈ 300–600；接住爆发、漏星红带截图确认；
  静音 toggle 写 `{"muted":true}` / 回写 `{"muted":false}`，刷新保持；375px `scrollWidth = 375`、画布 335px；
  reduced-motion 无粒子；console 错误 0
- 摄像头模式不动：校准、gestureEngine、DebugPanel、存储 schema 全部未改（`git diff` 里没有这些文件）

**提交**：`51d3f5f`（代码）。

---

## 2026-11-24 · Day 5 复查：三处体验/数据问题

游戏 1 交上来先自己跑了一遍，三处都是「测试和自动验收抓不到、人一眼能看出来」的问题。

### 问题 1：摄像头模式预览把游戏画布挤出屏幕

`CameraStage` 是全宽 4:3，1280 宽的页面上预览就占 960px 高，下面 60vh 的游戏画布整个在视口外——
戴上摄像头的人看不到自己控制的挡板，等于没法玩。截图 29 的前一版就是这个状态。
改法：预览容器 `max-w-xs`（320px 宽、240 高），摄像头模式的画布 `max-h-[38vh]`。
900 高的视口里 TopBar + HUD + 预览 + 画布 + 开始按钮全部一屏可见。

### 问题 2：准备状态没有任何开始提示

`ready` 相位只认 confirm（点头/眨眼），但界面上一个字都没写。假摄像头验收时页面停在「得分 0」，
真人第一次进来也只能猜。加 `ReadyCard`：「准备好了吗？点点头、眨眨眼，或点下面的按钮开始」，
按钮同时写进 `latch.confirm`——陪护者可以直接点，不依赖手势。

### 问题 3：改语音设置会冲掉音效静音

`writeStoredSettings` 直接 `JSON.stringify({ voice })` 覆盖整个 `zt.settings.v1`，
而游戏页的静音 `muted` 住在同一条记录里（`playerPrefs` 写的）。用户在校准页切一次语音，
游戏页的静音状态就被抹掉——「静音刷新后保留」的验收只在游戏页里测，所以没抓到。
改成先读旧对象、只覆盖 `voice`；新增单测「校准页改语音时不冲掉游戏页的音效静音」。

### 验证

92/92 测试全绿（新增 1 条），`tsc` 无错。本地构建 + CDP 验收：375px `scrollWidth = 375`；
演示模式自动开局并得分；摄像头模式（假摄像头）能看到预览小窗、画布和「开始游戏」按钮；
`badResponses` 为空，控制台只剩 MediaPipe 的 XNNPACK INFO。截图 `27-day5-demo-play.png`、
`28-day5-375.png`、`29-day5-camera-ready.png`，证据 `day5-local-audit.json`。
产物 `index-CumlYZPo.js`（336.76 kB / gzip 106.04 kB），当天发布（见下节）。

**提交**：`4fc730d`。

### 发布（2026-11-24）

新 actionId `f9697724-200e-425b-904e-afe135030e66` 发到同一 siteId，`published: true / access_mode: public`，
链接不变，线上资产 `index-CumlYZPo.js`（336.8 kB，即复查修复后的构建）+ `index-0O5_8Qjn.css`。

- 六个资源 curl 全 200：`/` 57.8 kB、`/favicon.svg` 400 B、模型 3.76 MB、wasm js 209.8 kB、wasm 9.42 MB、JS 336.8 kB
- 无痕线上验收：进演示模式 → 倒计时屏读提示 → 整局打完**得分 410**（300–600 带内）、结束页 + 再玩一次正常；
  console error = 0、4xx = 0；375 px `scrollWidth = 375`、音效/暂停按钮可见
- 截图 `30-live-day5-game.png`、`31-live-day5-375.png`
- 一个小坑：HTML 里资产是相对路径 `./assets/…`，从首页 grep 出来的字符串再拼 `/assets/` 前缀会得到
  `/assets/assets/…` 404 —— 线上 JS 的 URL 就是 `/assets/index-CumlYZPo.js`，别加第二次前缀。

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

### 真人验收（2026-11-23，镜头前）

线上构建 `index-BJABjniB.js`，一位真人测试者完整走了一遍：

- 校准 **20 秒**走完（清单要求 30 秒内）
- 摘要：`yawRange 0.116 / pitchRange 0.101 / 灵敏度 53%`，两条钳位提示都没出现
- 点头 3 次，confirm **3/3** 触发
- 左右转头各 3 次，`cursorX` **6/6** 都到 ±1.000
- 未验：自然眨眼能不能撑满 `blinkHoldMs: 180`（测试者没试）

第一次尝试时卡在「30 秒校准一直没采到」。复查面板：`present = true`、yaw/pitch 随头动、`delegate = GPU`，
重新走一遍就过了。对照 reducer 的行为，两条解释都对得上：模型首帧未到时第 1 步文案已经显示，看起来像在采样；
以及 absent 帧会把本步采样清零重来，检测抖一下进度就回到 0。**这不是判定逻辑的错误，是「没有加载态」的体验缺口**——
第一帧到达前应该显示「正在加载」，而不是把第 1 步的采样指令亮出来。

另一个发现：摄像头模式**没有画光标**。验收清单第 2、4 条（光标到边缘）只能看调试面板的 `cursorX` 数值。
Day 5 做游戏本体时，光标可视化要排第一个做，否则用户和评委戴上摄像头看不到任何自己控制的东西。

**提交**：`b0b76d5`。

### 自然眨眼复测：0.55 的线是错的

同一测试者补测两种眨眼：

| 眨眼方式 | max blinkL | max blinkR | confirm |
| --- | --- | --- | --- |
| 故意用力 | 0.789 | 0.785 | 3/3 |
| **自然眨（日常力度）** | 0.683 | **0.471** | **1/5** |

引擎判定是 `min(blinkL, blinkR) > blinkTrigger`，0.55 的线对着弱侧 0.471 **一票否决**。
所以问题不是「撑不满 180ms」，是**峰值根本过不了线**——之前一直怀疑时长，方向错了。

`blinkTrigger` 从 0.55 降到 **0.38**：仍然高于睁眼基线（实测瞬时 0.15~0.25），
`blinkHoldMs: 180` 和 `blinkRearm: 0.25` 都不动——180ms 的保持时间正好用来挡眯眼误触发。
70/70 测试全绿（单眼眨眼用例仍然不触发），产物 `index-Ch9LcWqG.js`，待重发后复测自然眨眼。

**提交**：`846573b`。

### 调试面板溢出屏幕

`fixed right-4 top-4 w-72`，没有高度上限、也没有滚动，内容一多就顶出屏幕底部，页面上也滚不到。
真人验收连着两次反馈「最下面看不到」，不是偶发。加 `max-h-[calc(100dvh-2rem)] overflow-y-auto`，面板内部滚动。
Tailwind 只为新类生成 CSS，`index-D95S_tjc.css` 跟着变；JS 产物 `index-CNz63Ov4.js`。

同时定下确认动作的优先级：**点头为主、眨眼为辅**。真人实测点头 3/3 稳定，自然眨眼弱侧峰值只有 0.47~0.55，
刚好压在旧阈值线上；眨眼保留给「头不方便动」的场景和校准最后一步（也可按空格跳过）。

**提交**：`9d0bf4f`。

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
