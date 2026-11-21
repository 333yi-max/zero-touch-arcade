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

## 当前状态：骨架（P0）

只做完了页面骨架与流程状态机，**没有接摄像头、没有游戏逻辑**。

状态机在 [src/state/machine.ts](src/state/machine.ts)，`start → calibration → game → result`：

| 事件 | 从 | 到 | 说明 |
| --- | --- | --- | --- |
| `choose_camera` | start | calibration | 开始体验（需要摄像头） |
| `choose_demo` | start | game | 演示模式，跳过校准 |
| `calibration_finished` | calibration | game | 校准完成 |
| `calibration_skipped` | calibration | game | 「跳过（演示模式）」 |
| `game_finished` | game | result | 带上分数 |
| `replay` | result | game | 保持上次的输入模式 |
| `home` | 任意 | start | 返回按钮 |

页面：

- `StartScreen` — 大标题 + 副标题 + 三个入口（视频按钮目前是占位提示）
- `CalibrationScreen` — 3 步占位（正对 / 向左 / 向右）、进度条、跳过
- `GameScreen` — 一块空 Canvas + 顶部返回
- `ResultScreen` — 分数占位 + 分享卡占位

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

后续会加：`src/input/`（输入源抽象 + 手势引擎）、`src/games/`、`src/lib/`、`public/wasm`、`public/models`。

## 部署到 Qoder Sites

**线上地址（公开，免登录）**：<https://zero-touch-arcade-isyzlt2g2ce.qoder.zone>
`access_mode: public`，2026-11-22 发布。线上产物是 Day-1 骨架构建（`app/.零触控游乐场.qoder.site` 里的 `artifactSha256` 对应那次发布）；Day 2 的手势引擎与演示模式改动已在本地构建，尚未重新发布。

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

## 下一步

1. 把 `reference/` 的四个文件搬进 `src/input/`（去掉导入的 `.ts` 后缀，`node:assert` 转 Vitest），跑绿 13 条用例。
2. 补 `scriptedSource.ts` + `useGesture` + demo 方块页，让演示模式的方块随虚拟输入左右移动。
3. 装 `@mediapipe/tasks-vision@0.10.14`，接 `CameraSource`，拷 wasm 与 `face_landmarker.task` 到 `public/`。
4. 校准页接真实采样与自适应量程。
