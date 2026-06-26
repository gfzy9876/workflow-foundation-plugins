---
name: mini-runtime-cloudrun-rum
description: 当小程序运行时预览需要验证 CloudRun 请求行为、trace/log 标记、失败处理或 RUM debug state，并依赖 console/state 证据时使用。
---

# Mini Runtime CloudRun RUM（CloudRun 与 RUM 运行时验证）

用于运行时检查必须证明小程序侧 CloudRun client 行为或 RUM 埋点的场景，尤其是改动请求 wrapper、tracking 或启动遥测之后。

## 仓库常量

- 小程序源码目录：`$HOME/Desktop/TrystOfStars/mini/miniprogram`
- WeChat DevTools 项目根目录：`$HOME/Desktop/TrystOfStars/mini`
- 当前 smoke wrapper：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/automator-smoke.mjs`
- CloudRun client 日志：`$HOME/Desktop/TrystOfStars/mini/miniprogram/utils/cloudRunClient.ts`
- RUM 初始化/debug 代码：`$HOME/Desktop/TrystOfStars/mini/miniprogram/app.ts` 和 `$HOME/Desktop/TrystOfStars/mini/miniprogram/utils/track/rum.ts`

## 能力状态

- 当前已可用：page smoke 可以到达触发 CloudRun/RUM 行为的 UI。
- 可用但未接入：等 `mini-preview logs` 和 `mini-preview state` 存在后，可用 console/exception capture 与 runtime state inspection 断言 CloudRun/RUM 标记。
- 缺失/未知：小程序 runtime 的直接 network capture。除非日志/state 或外部服务日志确认，否则不要声称 request-level proof。
- 目标 CLI 名称：`mini-preview cloudrun`。这是未来接口，不是当前仓库里已经存在的命令。

## 工作流

1. 先看被改的 CloudRun/RUM 代码路径，确定哪个用户动作会触发它。
2. 用 `mini-runtime-smoke` 或 `mini-runtime-flow` 到达并触发该路径。
3. 用 console-watch 预期检查 request start/success/failure marker、CloudRun type、trace id、exception。
4. 用 state-inspect 预期检查 RUM debug flag，或能反映请求完成的 page/app state。
5. 如果需要直接网络证据，明确说明当前 runtime preview suite 没有已知 network capture，另走服务端日志或 CloudBase 工具。

## 后续 CLI 契约

```bash
mini-preview cloudrun \
  --page /pages/<page>/<page> \
  --selector '<trigger-selector>' \
  --watch-log \
  --require-cloudrun-type '<type>' \
  --require-success \
  --extract-trace-id \
  --fail-on-cloudrun-failure \
  --rum-debug-state \
  --console-jsonl .agents/artifacts/<run>/console.jsonl \
  --state-json .agents/artifacts/<run>/rum-state.json
```

## 常用预设

- 请求成功：触发 UI 路径，要求 CloudRun type marker，要求 success，存在 trace id 时提取，并在 exception 上失败。
- 失败处理：只有任务明确允许时才触发已知失败路径；要求 failure marker，并验证 UI/state 按设计恢复。
- RUM debug：通过 state inspection 断言 RUM init/debug state；develop 日志打开时再捕获 console marker。

## 证据与失败模式

- 证据：触发 UI 的截图、console JSONL、exception JSONL、state JSON、提取出的 trace id、可选服务端日志引用。
- 常见失败：非 develop 环境不输出日志、trigger selector 没触发请求、异步请求在捕获窗口后才结束、CloudRun type marker 改名、trace id 缺失、RUM debug state 未暴露、DevTools session 失败。
- 直接 network capture 在当前工具链中属于缺失/未知。

## 安全规则

- 最终回复不要打印 secret、auth token、含隐私的请求 payload 或原始用户标识。
- 不要从 UI 跳转本身推断 CloudRun 成功。
- 当前文档阶段不要实现 network capture，也不要修改 CloudRun/RUM 源码。
