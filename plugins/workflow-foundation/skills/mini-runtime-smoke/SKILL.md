---
name: mini-runtime-smoke
description: 当需要用现有 miniprogram-automator 烟测脚本验证 TrystOfStars 小程序页面路由、selector、可选点击、截图和 pageStack 时使用。
---

# Mini Runtime Smoke（运行时烟测）

用于当前已经可执行的运行时预览检查：证明页面能打开、指定 selector 存在、可选点击能执行，并产出截图与 pageStack 证据。多页面验证优先用 `mini-runtime` 的复用 CLI；单页兼容命令和 DevTools 会话排障仍可用 `mini-runtime-preview`。

## 仓库常量

- 小程序源码目录：`$HOME/Desktop/TrystOfStars/mini/miniprogram`
- WeChat DevTools 项目根目录：`$HOME/Desktop/TrystOfStars/mini`
- skill wrapper：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/automator-smoke.mjs`
- 复用会话 wrapper：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/mini-runtime-suite.mjs`
- canonical script：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/automator-smoke.mjs`
- 复用会话 canonical script：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/mini-runtime-suite.mjs`
- 默认 DevTools CLI：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli`

## 能力状态

- 当前已可用：单页基于 `automator-smoke.mjs`；多页面复用基于 `mini-runtime-suite.mjs`。
- 目标 CLI 名称：`mini-preview smoke`。这是后续 CLI 抽象的命名，不是当前仓库里已经存在的命令。
- 当前复用 CLI 已产出 PNG、stdout、`summary.json`、`console.jsonl`、`exception.jsonl`。

## 工作流

1. 先看被改页面/组件的 diff，选出一个页面路由、一个稳定 selector，以及是否需要点击。
2. 如果要接入已打开的 DevTools，先发现当前 IDE service port：

```bash
lsof -nP -a -c wechatweb -iTCP -sTCP:LISTEN
```

3. 从 `$HOME/Desktop/TrystOfStars/mini/miniprogram` 运行命令，指定固定 automator port 和有意义的截图路径。
4. 检查 stdout：必须看到 websocket connected、relaunch、selector found、可选 tap、screenshot、pageStack 和 `ok`。
5. 报告成功前必须检查 PNG，确认不是空白或错误页面。

## 当前命令

多页面复用优先：

```bash
node .agents/scripts/mini-runtime-suite.mjs \
  --port <fixed-auto-port> \
  --artifact-dir /tmp/<meaningful-run-dir> \
  --timeout 150000 \
  --operation-timeout 45000 \
  --compile-shortcut-delay 16000
```

单页兼容：

```bash
node .agents/scripts/automator-smoke.mjs \
  --ide-port <devtools-service-port> \
  --port <fixed-auto-port> \
  --page /pages/<page>/<page> \
  --selector '<selector>' \
  --screenshot /tmp/<meaningful-name>.png \
  --timeout 150000 \
  --operation-timeout 45000 \
  --compile-shortcut-delay 14000
```

常用参数：

- `--no-tap`：只打开页面并断言 selector。
- `--wait-after-route <ms>` / `--wait-after-tap <ms>`：等待异步渲染或点击后的状态变化。
- `--keep-open`：需要在同一 DevTools 会话里继续取证时使用。

## 后续 CLI 契约

```bash
mini-preview smoke \
  --page /pages/<page>/<page> \
  --selector '<selector>' \
  --screenshot /tmp/<meaningful-name>.png \
  --no-tap
```

## 证据与失败模式

- 证据：PNG 截图、stdout 里的 `pageStack=...`、点击前 selector class、可选 tap success。
- 复用 CLI 额外证据：`summary.json`、`console.jsonl`、`exception.jsonl`、每个截图的 PNG 尺寸和大小。
- 常见失败：页面未注册、selector 不存在、点击与动画/异步状态竞争、截图空白或页面不对、automator port 被占用、IDE port 错误、冷启动超时、`osascript` 权限不足、CLI 路径不对。
- 端口、编译快捷键、冷启动和 DevTools 权限细节不要在这里重复，转用 `mini-runtime-preview`。

## 安全规则

- 不要把 build、preview upload 或 deploy 成功当作运行时 smoke 成功。
- 使用本 skill 时不要修改 `.agents/scripts/automator-smoke.mjs`。
- 不要把无关 dirty worktree 文件带入结论、提交或部署。
