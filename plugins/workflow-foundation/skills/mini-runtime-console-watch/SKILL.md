---
name: mini-runtime-console-watch
description: 当小程序运行时验证需要通过 miniprogram-automator 捕获 console log、warning、error、exception、JSONL 日志或 fail-on-log 断言时使用。
---

# Mini Runtime Console Watch（运行时日志捕获）

用于运行时证据依赖日志的场景：console log、warning、error、exception，或者项目里的埋点/CloudRun/RUM 日志输出。

## 仓库常量

- 小程序源码目录：`$HOME/Desktop/TrystOfStars/mini/miniprogram`
- WeChat DevTools 项目根目录：`$HOME/Desktop/TrystOfStars/mini`
- 当前 smoke wrapper：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/automator-smoke.mjs`
- canonical script：`$HOME/Desktop/TrystOfStars/mini/miniprogram/.agents/scripts/automator-smoke.mjs`
- 项目 console 日志入口：`$HOME/Desktop/TrystOfStars/mini/miniprogram/utils/track/log.ts`

## 能力状态

- 当前已接入复用 CLI：`mini-runtime-suite.mjs` 会写 `console.jsonl` 和 `exception.jsonl`。
- 单页 `automator-smoke.mjs` 仍未接入日志参数。
- 项目日志走 console，且只在 develop 环境输出。
- 目标 CLI 名称：`mini-preview logs`。这是未来统一命令名；当前项目本地入口是 `node .agents/scripts/mini-runtime-suite.mjs`。

## 工作流

1. 如果页面路由、selector、点击和截图也需要验证，先使用 `mini-runtime-smoke`。
2. 明确本次需要哪类日志证据：是否有 exception、是否禁止 error/warn、是否必须命中某个 app log 正则。
3. 优先用复用 CLI，不再临时写 Node probe。
4. 把 console 和 exception 分别保存为 JSONL，并报告数量与失败行摘要。

## 后续 CLI 契约

当前项目本地可执行入口：

```bash
node .agents/scripts/mini-runtime-suite.mjs \
  --port <fixed-auto-port> \
  --artifact-dir /tmp/<meaningful-run-dir> \
  --fail-on-exception \
  --fail-on-console error \
  --require-log '<regex>'
```

未来统一命令名：

```bash
mini-preview logs \
  --page /pages/<page>/<page> \
  --selector '<selector>' \
  --capture-console \
  --capture-exception \
  --console-jsonl .agents/artifacts/<run>/console.jsonl \
  --exception-jsonl .agents/artifacts/<run>/exception.jsonl \
  --fail-on-exception \
  --fail-on-console error,warn \
  --require-log '<regex>'
```

## 证据与失败模式

- 证据：`console.jsonl`、`exception.jsonl`、stdout 统计、required-log 命中状态、可选 smoke 截图。
- 常见失败：非 develop 环境不输出项目日志、listener 接入太晚、正则过宽、预期 warning 在页面路由前已经发出、exception stack 缺 source map 上下文、DevTools/session 失效。
- 本 skill 不提供直接 network capture。

## 安全规则

- 除非任务明确要求，或未来 CLI 合约指定，否则不要因为 `warn` / `error` 自动判失败。
- 最终回复不要暴露日志里的 secret；只摘要并指向本地 artifact。
- 不要为了让运行时检查更方便而修改 `utils/track/log.ts`。
