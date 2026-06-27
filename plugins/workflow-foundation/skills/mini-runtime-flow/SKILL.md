---
name: mini-runtime-flow
description: 当小程序运行时预览需要多步骤页面流程、element 断言、输入/长按/触发/滚动/滑动、native 事件或超过一次 smoke tap 的操作编排时使用。
---

# Mini Runtime Flow（运行时流程编排）

用于需要超过一个路由、selector 或点击的用户可见流程。它采用 checkpoint-driven agent loop：AI 读代码发现链路，agent 根据当前 CLI/tool 能力逐步执行、观察、决策，再给出最终 runtime 验收结果。

## 仓库常量

- 小程序源码目录：`<mini-project-root>/miniprogram`，以当前 cwd、`--project-path` 或 `MINIPROGRAM_PROJECT_PATH` 解析。
- WeChat DevTools 项目根目录：包含 `project.config.json` 的 `<mini-project-root>`。
- agent-loop workflow script：`node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs`
- 当前 smoke script：`node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs`
- 核心会话 skill：`mini-runtime-preview（同一 workflow-foundation 插件内）`

## 能力状态

- 当前已可用：`mini-runtime-agent-loop.mjs` 最小 workflow CLI，保持单 DevTools/automator 会话，通过 stdin JSONL 接收 agent 的逐步 op，强制写 `run-trace.jsonl` 和 `summary.json`。
- 当前已可用：通过 `automator-smoke.mjs` 完成一个页面路由、一个 selector wait、可选一次 tap、截图和 pageStack。
- 当前已可用：通过 `miniprogram-automator` 编排业务 flow，在同一个 DevTools 会话里从真实入口进入二级页，完成点击、截图、页面返回和 pageStack 断言。
- 当前已可用：agent-loop 已接入 `input`、`confirmModal`、`waitText`、`tapText`、`readStorage`、`assertStorage`，并支持 `--recipe <path>` 运行 JSON/JSONL 业务 flow recipe。
- SDK 可用但正式 CLI DSL 未接入：longpress、trigger、scroll、swipe、完整 text/attr 断言表达式。
- 目标 CLI 名称：`mini-preview element` / `mini-preview action`。这些是未来接口，不是当前仓库里已经存在的命令。

## 工作流

1. 把用户路径拆成有序 checkpoint：路由、可见 selector、动作、预期可见状态、截图。
2. 区分验证策略：隔离 smoke 可用 `reLaunch`；业务 flow 只允许初始入口用 `reLaunch`，后续必须通过真实入口、页面按钮、`navigateBack` 或等价用户路径移动。
3. 业务 flow 必须断言进入页和返回页：例如 A 页 selector -> 点击进入 B 页 -> B 页 selector -> 操作 -> 点击 B 页返回 -> A 页 selector/pageStack。
4. selector 要稳定且尽量页面局部。未来 element CLI 可用后，优先做用户可见断言，而不是只检查实现层 class。
5. 最终状态必须截图；中间状态没有验证到时要明确说明。
6. 如果真实入口不在用户举例的来源页里，先读源码确认实际来源页，不要硬造不存在的入口。

## Agent Loop 模式

本 skill 不要求一次性生成完整 recipe 后盲跑到底。推荐循环：

1. 读源码发现 checkpoint：入口页面、组件 selector、事件绑定、导航函数、路由参数、返回函数。
2. 生成链路图 artifact：`route-map.md` 或 `route-map.json`，包含源码依据和预期 pageStack。
3. 选择下一步 CLI/tool 原语：`reLaunch`、wait selector、tap、input、tapText、confirmModal、back / `navigateBack`、pageStack、screenshot、console/log、storage/state inspect。
4. 执行一步后观察反馈：命令结果、当前 pageStack、截图、console/exception、可选 page data。
5. 根据反馈决定继续、调整下一步、判定业务失败或报告 CLI 能力缺口。
6. 每一步都写入 `run-trace.jsonl`：step、意图、调用的 CLI/tool、参数、结果、截图/log 路径和下一步决策理由。
7. 完成后写 `summary.json`：checkpoint 结果、验证通过/失败、失败原因、证据路径和是否发生策略降级。

## CLI 原语边界

- CLI/executor 是稳定工具箱，负责执行通用动作；AI/agent 负责读代码、生成链路图、选择下一步动作和解释结果。
- 验收期间不要修改 canonical CLI/executor，也不要把某个业务 flow 写成长期专用脚本。
- 如果 selector 推断错误，可以基于源码和反馈调整下一步动作；如果 CLI 缺少某个原语，报告能力缺口。
- 如果真实入口失败，不要直接 `reLaunch` 目标页绕过；只能作为隔离 smoke 的单独补充，并在报告中标记降级。
- 自动调整应有限，连续失败后停止循环并报告 blocker，避免无限试错。

## Agent Loop 命令模式

启动 workflow：

```bash
node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs \
  --goal '<runtime 验收目标>' \
  --strategy business-flow \
  --project-path <mini-project-root> \
  --ide-port <devtools-service-port> \
  --port <fixed-auto-port> \
  --artifact-dir /tmp/<meaningful-run-dir>
```

启动后通过 stdin JSONL 发送 op；CLI 每行返回 JSON 结果：

```json
{"op":"routeMap","text":"index -> lobby -> coin -> back"}
{"op":"compileShortcut","delayMs":16000,"attempts":3}
{"op":"reLaunch","page":"/pages/index/index","intent":"打开真实来源页"}
{"op":"wait","selector":"lobby >> .menu-btn.fortune"}
{"op":"tap","selector":"lobby >> .menu-btn.fortune"}
{"op":"input","selector":"treehole-overlay >> .input","value":"我想抽一场塔罗"}
{"op":"tapText","selector":"fortune-param-popup >> .chip","contains":"健康"}
{"op":"confirmModal"}
{"op":"screenshot","name":"source-ready"}
{"op":"finalize"}
```

已接入 op：

- `routeMap`：保存链路图 artifact。
- `reLaunch`：只允许业务 flow 初始入口使用；第二次会触发 guard。
- `wait` / `tap`：支持普通 selector 和 `component >> selector`。
- `waitText` / `tapText`：在一组 selector 中按 `text` / `contains` / `regex` 匹配可见文案。
- `input`：对输入元素执行 `element.input(value)`，可选 `clearFirst`。
- `confirmModal`：确认当前 native modal，适合清空聊天这类系统确认框。
- `back`：调用 `miniProgram.navigateBack()`。
- `compileShortcut`：由 agent 在 loop 中主动触发 DevTools 菜单“工具 > 编译”（失败时 fallback 到 Cmd+B），并通过 `systemInfo/pageStack` 重新观察 runtime。默认最多 3 次；日志 evidence 只是弱辅助字段，不能当作正式 compile-complete API。
- `readStorage` / `assertStorage`：通过 `wx.getStorageInfoSync` / `wx.getStorageSync` 读取本地 storage，支持 `key` / `keyPattern`、简单 path（如 `[].text`）和 `contains` / `regex` / `equals` / `lengthAtLeast` 等断言。
- `screenshot` / `pageStack` / `currentPage` / `readData` / `assertPageStack` / `sleep` / `status` / `finalize`。

也可以把上述步骤写成 JSON 或 JSONL recipe 后直接运行：

```bash
node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs \
  --goal '<runtime 验收目标>' \
  --strategy business-flow \
  --project-path <mini-project-root> \
  --ide-port <devtools-service-port> \
  --port <fixed-auto-port> \
  --artifact-dir /tmp/<meaningful-run-dir> \
  --recipe /tmp/<flow-recipe>.jsonl
```

## 兼容命令模式

```bash
node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs \
  --project-path <mini-project-root> \
  --ide-port <devtools-service-port> \
  --port <fixed-auto-port> \
  --page /pages/<page>/<page> \
  --selector '<selector>' \
  --screenshot /tmp/<flow-step>.png \
  --timeout 150000 \
  --operation-timeout 45000 \
  --compile-shortcut-delay 14000 \
  --compile-shortcut-attempts 3
```

checkpoint-only 步骤用 `--no-tap`；点击后渲染需要等待时加 `--wait-after-tap <ms>`。

优先使用 agent-loop workflow CLI；只有单页隔离 smoke 或排障时才退回 smoke wrapper。

## 后续 CLI 契约

```bash
mini-preview element \
  --page /pages/<page>/<page> \
  --selector '<selector>' \
  --assert-text '<text-or-regex>' \
  --assert-attr 'class~=<token>'

mini-preview action \
  --page /pages/<page>/<page> \
  --selector '<selector>' \
  --input '<text>' \
  --trigger '<event>' \
  --longpress \
  --scroll-to '<selector>' \
  --swipe-to '<direction>' \
  --screenshot /tmp/<flow-final>.png
```

## 证据与失败模式

- 证据：有序命令日志、最终截图、可选步骤截图、pageStack、selector/action 摘要、未来断言结果。
- 常见失败：页面未注册、selector 不存在、动作与异步渲染竞争、modal/native surface 不能被 Element API 触达、截图空白或页面不对、DevTools session 失败。
- Wx API mock、native/remote 自动化、audit、ticket 归为高级未来能力；除非任务明确要求，本 skill suite 暂不展开。

## 安全规则

- 不要发明 app 路由或后端契约；先读源码，不明确就问。
- 不要为了单次验收修改 skill 自带的 smoke、suite 或 agent-loop 脚本。
- 不要把一次性的 `/tmp` probe 当作已封装的正式 CLI 能力。
- 不要把业务失败通过改链路、改 selector 或直接 reLaunch 目标页掩盖掉。
