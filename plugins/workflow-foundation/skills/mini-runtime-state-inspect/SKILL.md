---
name: mini-runtime-state-inspect
description: 当小程序运行时预览需要通过 miniprogram-automator 检查 current page、page data、eval、call-method、system 或 JSON 状态断言时使用。
---

# Mini Runtime State Inspect（运行时状态检查）

用于截图不足以证明行为、必须从小程序 runtime API 读取或断言状态的场景。

## 仓库常量

- 小程序源码目录：`$HOME/Desktop/TrystOfStars/mini/miniprogram`
- WeChat DevTools 项目根目录：`$HOME/Desktop/TrystOfStars/mini`
- 当前 smoke wrapper：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/automator-smoke.mjs`
- canonical script：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/automator-smoke.mjs`
- 核心会话 skill：`mini-runtime-preview（同一 workflow-foundation 插件内）`

## 能力状态

- 当前已可用：agent-loop 会输出 `system`、`pageStack`、`currentPage`，并支持 `readData`、`readStorage`、`assertStorage`。
- 当前已可用：`readStorage` / `assertStorage` 通过 `wx.getStorageInfoSync` / `wx.getStorageSync` 读取本地 storage，支持 `key` / `keyPattern`、简单 path（如 `[].text`）和 `contains` / `regex` / `equals` / `lengthAtLeast` 等断言。
- SDK 可用但 CLI 未接入：eval、调用页面方法和更完整的 JSONPath/谓词断言。
- 目标 CLI 名称：`mini-preview state`。这是未来接口；当前项目本地入口是 `mini-runtime-agent-loop.mjs`。

## 工作流

1. 如果状态断言依赖页面路由或点击，先用 `mini-runtime-smoke` 到达目标状态。
2. 定义能证明行为的最小 state path 或 eval。优先读 page data path，不要粗暴 dump 整个 app。
3. 明确断言类型：完整 JSON、部分 JSON、正则/字符串，或数字谓词。
4. 能落盘时，把 state/eval 结果保存为 JSON artifact，并报告断言字段、期望值和实际值。
5. 如果需要读取 storage，只读与验收目标直接相关的 key 或 keyPattern，并把完整内容落到 artifact，最终回复只摘要。
6. 如果 runtime state 和截图矛盾，在两层证据解释清楚前不要判定通过。

## 后续 CLI 契约

```bash
mini-preview state \
  --page /pages/<page>/<page> \
  --selector '<ready-selector>' \
  --current-page \
  --page-data '<path>' \
  --storage-key '<key-or-regex>' \
  --eval '<expression>' \
  --call-method '<methodName>' \
  --assert-json '<json-or-jsonpath-assertion>' \
  --output-json .agents/artifacts/<run>/state.json
```

常用断言目标：

- 跳转后的 current page path 和 pageStack。
- 页面 `data` 中的 flag、list、selected id、loading state、渲染值。
- 本地 storage 中最近一次聊天、玩法返回状态、上下文 payload 或 feature flag。
- 环境相关检查可复用 smoke stdout 中的 system 信息。
- 只有确认没有破坏性副作用时，才读取页面方法返回值。

## 证据与失败模式

- 证据：`state.json`、eval result JSON、current page/pageStack、stdout 断言摘要、可选截图。
- 常见失败：页面未 ready 就读取状态、path 写错、值不可序列化、storage key 过宽导致输出过大、eval 有副作用、方法需要参数/上下文、状态藏在组件内部、DevTools/session 失效。
- 不要读取 token、云凭证、用户隐私无关 key；不要把数据库 inspection 纳入本 skill。

## 安全规则

- 避免破坏性的 `--call-method` 检查，除非任务明确要求。
- 不要从 runtime state 打印 token、用户隐私或云凭证。
- 当前统一 `mini-preview state` 命令还未实现；使用 agent-loop 的 `readData`、`readStorage`、`assertStorage`。
