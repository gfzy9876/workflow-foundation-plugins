---
name: mini-runtime-preview
description: 当需要用 WeChat Developer Tools 和 miniprogram-automator 验证 TrystOfStars 小程序运行时行为时使用，包括编译、页面跳转、selector、点击、截图和证据采集。
---

# Mini Runtime Preview（小程序运行时预览）

用于代码改动需要小程序运行时证据的场景。它补充 build、TypeScript 和 deploy 检查，但不能替代它们。

## Skill 组合

`mini-runtime-preview` 负责 DevTools 会话、编译 readiness、端口和核心排障。更窄的检查应路由到：

- `mini-runtime-smoke`：当前可执行的页面/selector/点击/截图命令。
- `mini-runtime-console-watch`：console/exception 捕获和 JSONL 证据。
- `mini-runtime-flow`：多步骤动作编排。
- `mini-runtime-state-inspect`：page data、eval 和状态断言。
- `mini-runtime-cloudrun-rum`：CloudRun/RUM 运行时证据。

## 仓库常量

- 小程序源码目录：`<mini-project-root>/miniprogram`，以当前 cwd、`--project-path` 或 `MINIPROGRAM_PROJECT_PATH` 解析，不硬编码用户目录。
- WeChat DevTools 项目根目录：包含 `project.config.json` 的 `<mini-project-root>`。
- 单页 smoke implementation：`node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs`。
- 复用会话 implementation：`node <mini-runtime-skill-dir>/scripts/mini-runtime-suite.mjs`。
- 默认 DevTools CLI：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- DevTools 编译快捷键 app id：`com.tencent.webplusdevtools`
- 已验证工具组合：`miniprogram-automator@0.12.1`、DevTools `2.01.2602282`、Mini Program SDK `3.14.2`

## 项目定位与依赖

- 从目标 mini 项目根或 `miniprogram` 目录运行时，脚本会自动识别上级 `project.config.json`。
- 如果当前 cwd 不在目标项目内，必须传 `--project-path <mini-project-root>` 或设置 `MINIPROGRAM_PROJECT_PATH=<mini-project-root>`，例如 `/Users/yingshen/.openclaw/workspace-wx-frontend/project/mini`。
- `miniprogram-automator` 需要能从 `--sdk-root`、当前 cwd、`<mini-project-root>/miniprogram` 或 `<mini-project-root>` 解析；目标项目没有该 npm 包时，先在项目内安装或传 `MINIPROGRAM_AUTOMATOR_SDK_ROOT`。
- runtime CLI 已随 workflow-foundation skill 分发，不要求目标项目存在 `.agents/scripts/automator-smoke.mjs`。

## 工作流

1. 先看 `git diff --stat` 和 `git diff -- <files>`，判断改动涉及的页面/组件，以及要验证的用户可见行为。不要回滚无关 dirty 文件。
2. 选择能覆盖 diff 的页面路径、selector 和交互。优先选页面局部 selector，证明变更 surface 已加载。
3. 选择固定 automator websocket port，例如 `--port 19540`。如果 DevTools 已经打开，先发现当前 service port 并作为 `--ide-port` 传入：

```bash
lsof -nP -a -c wechatweb -iTCP -sTCP:LISTEN
```

4. 多页面验证优先运行复用会话 wrapper；单页排障可运行 smoke wrapper。除非确认 runtime 已 ready，否则保持编译触发开启；脚本会优先点击 DevTools 菜单“工具 > 编译”，失败时 fallback 到 Cmd+B，并用结构化 runtime readiness 继续判断。
5. 临时证据写到 `/tmp`；需要保留项目证据时写到 `.agents/artifacts/`。
6. 报告成功前必须同时检查命令输出和截图。只有输出确认 page/selector/tap/screenshot，且截图非空并显示预期状态，才算运行时验证通过。

## 命令

复用会话模板：

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

单页 smoke 模板：

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

本仓库已验证的 coin-toss 命令：

```bash
node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs \
  --project-path <mini-project-root> \
  --ide-port 52427 \
  --port 19540 \
  --timeout 150000 \
  --operation-timeout 45000 \
  --compile-shortcut-delay 14000 \
  --compile-shortcut-attempts 3 \
  --screenshot /tmp/tryst-smoke-auto-cmdb.png
```

通过 skill wrapper 的等价命令：

```bash
node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs \
  --project-path <mini-project-root> \
  --ide-port 52427 \
  --port 19540 \
  --timeout 150000 \
  --operation-timeout 45000 \
  --compile-shortcut-delay 14000 \
  --compile-shortcut-attempts 3 \
  --screenshot /tmp/tryst-smoke-auto-cmdb.png
```

成功输出应包含：automator websocket connected、`compile attempt ... triggering DevTools compile command`、`compileReady status=runtime_ready... logEvidence=... runtimeReady=true`、`system=devtools sdk=...`、relaunch 到目标页面、selector found、可选 tap ok、screenshot path、`pageStack=...` 和 `ok`。

## 排障

- DevTools service port 会随手动启动变化。接入已有 DevTools 窗口时，用 `lsof ... wechatweb ...` 重新发现当前端口并传给 `--ide-port`。
- 省略 `--ide-port` 时，`cli auto` 可能启动自己的 DevTools HTTP service。需要接入已有 service port 时必须传 `--ide-port`。
- 如果 App domain 调用超时（`systemInfo`、`pageStack`、`reLaunch`、`App.getCurrentPage` 或截图），保持编译快捷键开启并优先增加 `--compile-shortcut-attempts`；必要时再加长 `--compile-shortcut-delay`。冷启动时，`cli auto` 可能在 simulator runtime 真正 ready 前就连上 websocket。
- runtime ready 的日志标记包括 `restart appservice compile`、`appservice reload`、`simulator launch success` 和 `appservice webview loadstop`。
- 当前 `miniprogram-automator` / DevTools automation 没有正式 compile-complete API；日志正则只能作为弱证据 `logEvidenceObserved`。如果必须证明“新编译产物已加载”，需要额外的 app-level generation marker；普通 runtime 验收以 `reLaunch`、目标 selector、截图、pageStack 和 console/exception 作为主证据。
- 如果输出 `runtime_not_ready_after_compile_command`，说明触发编译后结构化 runtime probe 仍不可用，不要继续声称 runtime 验证通过。排障时可加 `--require-compile-log-evidence` 强制要求弱日志证据一起出现。
- 如果 macOS 报 `osascript` 无权发送快捷键，为 terminal 或 Codex host process 打开 Accessibility/Automation 权限后重试。
- 当前流程里 `Tool.compile` 返回过 `unimplemented`，`cli open` 也不能替代 DevTools 的“普通编译”按钮。继续通过脚本触发 Cmd+B。
- 固定 `--port` 陈旧或被占用时，换一个 automator websocket port，或关闭旧 DevTools/automation 进程。
- DevTools 未正常关闭时，不带 `--keep-open` 重跑、手动退出 app，或用 `lsof` 检查残留监听。

## 安全规则

- 不要从 build、preview 或 deploy 成功推断运行时验证成功。构建/预览发布和小程序 runtime 行为是不同层。
- 冷启动会话不要使用 `--no-compile-shortcut`，除非已有其他证据证明新的 automator 会话里 simulator runtime 已 active。
- 不要扩大 review，把无关 dirty 文件带进提交、部署或结论。
- 报告成功前必须采集并检查证据；如果截图失败、空白或页面不对，就明确说本次 runtime check 未验证通过。
