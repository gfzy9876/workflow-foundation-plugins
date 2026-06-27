---
name: mini-runtime
description: 当用户明确要求 TrystOfStars 小程序真实环境预览、运行时验证、DevTools 预览、截图取证、console/log 打印、交互效果验证、状态检查或 CloudRun/RUM 运行时验证时使用；这是 mini-runtime skill suite 的根入口。
---

# Mini Runtime（根入口）

这是 TrystOfStars 小程序运行时验证的根 skill。用户不需要记住各个子 skill 名；只要明确要求真实预览、运行时验证、截图、log、交互效果或 CloudRun/RUM 证据，就从这里进入，再按场景路由到具体能力。

## 触发示例

- “用微信开发者工具真实预览一下这个页面，并截图。”
- “跑一下小程序 runtime，看看这个按钮点完有没有效果。”
- “打开页面后抓 console log / error / exception。”
- “验证 daily-fortune 触发 CloudRun 后有没有成功日志。”
- “不要只 build，帮我真实跑一下并给截图证据。”

## 路由规则

- 页面能否打开、selector 是否存在、可选点击、截图、pageStack：使用 `mini-runtime-smoke`。
- DevTools service port、Cmd+B 编译、冷启动、自动化连接、权限排障：使用 `mini-runtime-preview`。
- console log、warning、error、exception、JSONL 日志、fail-on-log：使用 `mini-runtime-console-watch`。
- 多步骤点击、输入、滚动、长按、用户流程验证：使用 `mini-runtime-flow`。
- current page、page data、eval、call-method、JSON 状态断言：使用 `mini-runtime-state-inspect`。
- CloudRun client 日志、trace id、RUM debug state、请求成功/失败标记：使用 `mini-runtime-cloudrun-rum`。

## 当前 CLI 状态

- 当前可直接执行的 agent-loop workflow CLI：`node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs`。
- 该 workflow CLI 通过 stdin JSONL 接收 agent 每一步决策，支持 `routeMap`、`reLaunch`、`wait`、`waitText`、`tap`、`tapText`、`input`、`confirmModal`、`back`、`screenshot`、`pageStack`、`currentPage`、`readData`、`readStorage`、`assertStorage`、`assertPageStack`、`sleep`、`compileShortcut`、`status`、`finalize`，并强制写 `run-trace.jsonl`、`summary.json`、console/exception 日志。
- 该 workflow CLI 支持 `--recipe <path>` 直接运行 JSON/JSONL 步骤；适合由 agent 读源码后生成一次性业务 flow recipe，并保留标准 trace，而不是临时写业务专用 probe 脚本。
- `compileShortcut` 已接入 runtime readiness：优先触发 DevTools 菜单“工具 > 编译”，失败时 fallback 到 Cmd+B，最多重试 3 次；通过 `systemInfo/pageStack` 判断 runtime 是否可用，并把 compile log evidence 作为弱辅助字段 `logEvidenceObserved` 输出。当前 SDK 没有正式 compile-complete API，不要把日志正则当强证明。
- 当前可直接执行的复用会话 CLI：`node <mini-runtime-skill-dir>/scripts/mini-runtime-suite.mjs`。
- 该 CLI 已支持单 DevTools 会话内复用 automator websocket，连续跑多页面 smoke、可选 tap、截图、summary JSON、console JSONL、exception JSONL。
- 单页兼容脚本在 `mini-runtime-preview` skill 中：`node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs`。
- `mini-preview state`、`mini-preview action`、`mini-preview cloudrun` 仍是后续统一命令契约，还不是当前仓库里已经存在的命令。
- 当用户要求尚未接入 CLI 的能力时，要明确说明“SDK 支持/文档已定义/CLI 未接入”，不能伪装成已完整验证。

## 默认工作流

1. 先看当前 diff，判断需要验证哪个页面、selector、交互或日志路径。不要回滚无关 dirty 文件。
2. 选择最小子 skill 组合；多页面验证优先用复用 CLI，单页问题可用单页 smoke。
3. 从当前小程序项目根或 `miniprogram` 目录执行命令；如果 cwd 不在项目内，显式传 `--project-path <mini-project-root>` 或设置 `MINIPROGRAM_PROJECT_PATH=<mini-project-root>`。不要假设项目一定在 `$HOME/Desktop/TrystOfStars/mini`。
4. 证据必须包含可核查输出：截图、pageStack、selector 命中、可选 tap、`summary.json`、`console.jsonl` 或 `exception.jsonl`。
5. 最终报告要区分验证层级：build/typecheck、DevTools runtime、截图可见效果、console/state、服务端日志。

## 项目定位与依赖

- 目标项目根目录以包含 `project.config.json` 的目录为准；脚本会从当前 cwd 或上一级自动识别，也可用 `--project-path` / `MINIPROGRAM_PROJECT_PATH` 覆盖。
- 源码目录通常是 `<mini-project-root>/miniprogram`，但不要硬编码到某个用户目录。
- runtime CLI 由本 workflow-foundation skill 自带，不要求目标项目存在 `.agents/scripts/`。
- `miniprogram-automator` 必须能从 `--sdk-root`、当前 cwd、`<mini-project-root>/miniprogram` 或 `<mini-project-root>` 解析；目标项目未安装时，先在项目内安装或传入已有 SDK root。

## 验证策略

- 隔离 smoke：用 `reLaunch` 打开单页，验证页面注册、selector、一次点击、基础截图和 pageStack。适合证明页面自身可运行，不证明来源页面或返回链路。
- 业务 flow：从真实业务入口进入页面，测完用页面上的返回按钮、`navigateBack` 或等价用户路径回到来源页，再断言来源页 selector 和 pageStack。适合证明真实页面栈、二级页返回、跨页状态和用户可见路径。
- 多页面矩阵：复用同一个 DevTools/automator 会话连续跑多个页面或多个 flow，不要每页重启 DevTools；只在会话崩溃或截图已是崩溃页时重启。

选择规则：用户说“打开某页看能不能用”优先隔离 smoke；用户说“从 A 进 B、点完回 A、完整链路、真实路径”必须用业务 flow；用户说“多个页面都扫一遍”必须用复用会话矩阵。

## Checkpoint Agent Loop

运行时验收优先采用 checkpoint-driven agent loop，而不是一次性写死业务脚本。

1. AI 先根据用户验收目标读代码，确认触发点、入口页面、组件、selector、事件绑定、导航方法、参数和返回点。
2. AI 生成链路图，说明从哪个页面、哪个组件、哪个事件走到目标功能；链路图是理解和审计材料，不是长期业务脚本。
3. Agent 根据链路图自行选择当前 CLI/tool 能力，例如 `reLaunch`、等待 selector、tap、back / `navigateBack`、pageStack、screenshot、console/log、state inspect。
4. 每执行一步，都读取结构化反馈：当前 pageStack、selector 是否存在、截图、console/exception、可选 state。Agent 再决定下一步动作。
5. 循环直到 checkpoint 全部通过、确认业务失败、确认 CLI 能力缺口，或达到有限重试次数。

最小 workflow CLI 启动方式：

```bash
node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs \
  --goal '<runtime 验收目标>' \
  --strategy business-flow \
  --project-path <mini-project-root> \
  --ide-port <devtools-service-port> \
  --port <fixed-auto-port> \
  --artifact-dir /tmp/<meaningful-run-dir>
```

启动后，agent 通过 stdin 逐行发送 JSON op；CLI 逐行返回 JSON 结果：

```json
{"op":"routeMap","text":"index -> lobby -> coin -> back"}
{"op":"compileShortcut","delayMs":16000,"attempts":3}
{"op":"reLaunch","page":"/pages/index/index","intent":"打开真实来源页"}
{"op":"wait","selector":"lobby >> .menu-btn.fortune"}
{"op":"tap","selector":"lobby >> .menu-btn.fortune"}
{"op":"input","selector":"treehole-overlay >> .input","value":"我想抽一场塔罗"}
{"op":"tapText","selector":"fortune-param-popup >> .chip","contains":"健康"}
{"op":"confirmModal"}
{"op":"assertStorage","keyPattern":"^chat_avatar_history_","path":"[].text","contains":"刚才的牌","minMatches":1}
{"op":"pageStack"}
{"op":"finalize"}
```

产物要求：

- `route-map.md` 或 `route-map.json`：AI 从源码生成的链路图和关键源码依据。
- `recipe.json` 或 `recipe.jsonl`：可选，AI 从源码生成的业务 flow 步骤；可用 `--recipe` 执行。
- `run-trace.jsonl`：每一步实际调用的 CLI/tool、参数、返回 pageStack、截图路径、日志摘要和 agent 决策原因。
- `summary.json`：最终 checkpoint 结果、失败原因、截图/log 路径和验证层级。

边界规则：

- 不要把业务 flow 固化成长期专用脚本，例如 `coin-business-flow.mjs` 这类脚本只能作为一次性临时 probe，不能成为默认验收方式。
- 验收期间不要修改 canonical CLI/executor；如果 CLI 缺少原语，报告“CLI 能力缺口”，不要临时改脚本绕过。
- 可以根据截图、日志、pageStack 和源码修正下一步动作，但必须记录到 `run-trace.jsonl`，并限制自动修正次数。
- 业务 flow 失败时，不要改成直接 `reLaunch` 目标页绕过真实入口；这种降级必须明确标记为隔离 smoke。

## 常用复用命令

端口规则：

- `--port` 是 automator websocket port，不是 DevTools service port；固定值被占用时换一个新值，例如 `19581`。
- `--ide-port` 是已打开 DevTools 的 service port；要复用现有窗口时，先用 `lsof -nP -a -c wechatweb -iTCP -sTCP:LISTEN` 查当前监听端口。
- 多页面验证优先复用同一个 CLI 会话，不要每个页面都重新启动 DevTools。旧会话残留但页面未崩时，换 `--port` 即可；如果截图已经是崩溃页，再重启 DevTools。

默认多页面矩阵：

```bash
node <mini-runtime-skill-dir>/scripts/mini-runtime-suite.mjs \
  --project-path <mini-project-root> \
  --port <fixed-auto-port> \
  --artifact-dir /tmp/<meaningful-run-dir> \
  --timeout 150000 \
  --operation-timeout 45000 \
  --compile-shortcut-delay 16000 \
  --compile-shortcut-attempts 3
```

自定义页面：

```bash
node <mini-runtime-skill-dir>/scripts/mini-runtime-suite.mjs \
  --project-path <mini-project-root> \
  --port <fixed-auto-port> \
  --no-default-cases \
  --case 'profile|/pages/profile/profile|.profile-page|no-tap' \
  --case 'coin-lift|/pages/coin-toss/coin-toss|.coin-lift|tap|2600' \
  --artifact-dir /tmp/<meaningful-run-dir>
```

常用日志策略：

```bash
node <mini-runtime-skill-dir>/scripts/mini-runtime-suite.mjs \
  --project-path <mini-project-root> \
  --port <fixed-auto-port> \
  --fail-on-exception \
  --fail-on-console error \
  --require-log 'cloudrun-call'
```

## 单页兼容命令

```bash
node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs \
  --project-path <mini-project-root> \
  --ide-port <devtools-service-port> \
  --port <fixed-auto-port> \
  --page /pages/<page>/<page> \
  --selector '<selector>' \
  --screenshot /tmp/<meaningful-name>.png \
  --timeout 150000 \
  --operation-timeout 45000 \
  --compile-shortcut-delay 14000 \
  --compile-shortcut-attempts 3
```

如果只需要打开页面和断言 selector，加 `--no-tap`。

## 安全规则

- 不要让用户手动指定 `/skill{n}`；根据需求自动选子 skill。
- 不要把 build、deploy、preview upload 当作 runtime 验证。
- 不要再用每页启动/关闭一次 DevTools 的方式做多页面矩阵；优先复用一个会话，避免压挂 DevTools。
- 不要声称直接 network capture 已可用；当前 CloudRun/RUM 证据主要来自 console/state 或外部服务端日志。
- 不要为了验证方便修改业务源码或日志源码，除非用户明确要求实现/接入新 CLI 能力。
