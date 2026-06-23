---
name: trace-emit
description: "设计、声明或审查 AI 全链路工作流里的 Trace Emit Tool。使用原子化结构 trace 记录，只通过 traceId 和 parentTraceId 建立因果关系。适用于定义 trace schema、event 语义、emit API、workflow/tool/skill/agent 可观测边界、retry/checkpoint/decision 事件语义、存储与监控管线。"
---

# Trace Emit

## Overview

使用本 skill 设计或校验 AI 全链路架构底层的 `trace.emit` 能力。每条 trace 都是一条不可变的原子事实，通过 `parentTraceId` 指向直接因果来源；除非用户明确要求，不引入 `runId`、`spanId` 或具体 tracing 产品的概念。

## Core Rules

- 保持声明工具足够小：`trace.emit` 接收一条结构化记录，返回本条记录的 `traceId`。
- `traceId` 是当前原子 trace 记录的身份，不是一次长任务或 run 的身份。
- `parentTraceId` 是唯一因果链接。只有根用户目标或系统根事件可以为 `null`。
- 不把自由文本日志作为主接口；结构化数据放入 `attributes`，短文本必须是已脱敏、可审计的字段。
- 不把 trace 存储当作 workflow 状态库。状态机、重试、超时、分支、checkpoint、审批仍由 workflow runtime 负责。
- 详细 schema 和事件字典必须放在 references 中，不要膨胀 `SKILL.md`。

## Reference Routing

- 设计 trace record 结构、必填字段、父子规则、脱敏策略时，读取 `references/schema.md`。
- 选择或解释 event 名称时，读取 `references/events.md`。这是标准事件字典，每个 event 都必须有明确语义。
- 声明 `trace.emit` 工具接口或 TypeScript 风格封装时，读取 `references/api.md`。
- 展示 workflow、step、tool、retry、checkpoint、decision、failure 示例时，读取 `references/examples.md`。
- 设计存储、索引、监控、统计或 MVP 落地时，读取 `references/pipeline.md`。

## Tool Implementation

- 可执行工具位于 `scripts/trace_emit_tool.mjs`。
- TypeScript 类型声明位于 `scripts/trace_emit_tool.d.ts`。
- 测试位于 `scripts/trace_emit_tool.test.mjs`，用 `node --test scripts/trace_emit_tool.test.mjs` 运行。
- CLI 默认写入 `.trace-emit/YYYY-MM-DD/traces.jsonl`，也可用 `--out` 或 `TRACE_EMIT_PATH` 指定 JSONL sink。
- 模块调用时优先使用 `createTraceEmitTool({ filePath })` 或 `emitTrace(input, { filePath })`。

## Recommended Boundaries

trace emit tool 负责：

- 校验和标准化 trace record；
- 在缺省时生成 `traceId` 和 `timestamp`；
- 执行脱敏、采样、缓冲、投递策略；
- 写入本地 JSONL、stdout、HTTP collector、队列或可观测后端；
- 返回轻量 ACK。

trace emit tool 不负责：

- 决定 workflow 控制流；
- 负责 retry、timeout、approval、failure branch 决策；
- 把 checkpoint body 当作状态真相存储；
- 替代业务状态、任务状态或 workflow runtime 状态；
- 直接提供产品化监控大盘；
- 在已有 tool wrapper 时要求 raw tool 直接发 trace。

## Caller Guidance

除非用户指定其他分层模型，默认采用：

- Workflow runtime 是 workflow、step、retry、checkpoint、approval、decision 事件的主要调用方。
- Tool wrapper 是 tool start/success/failure 事件的主要调用方。
- Agent 可以发用户目标、规划、面向用户响应、handoff 等高层 trace。
- Skill 可以发策略选择、规则命中类 trace，但不能绕过 workflow runtime 控制状态。
- Raw tool 默认不直接发 trace；由 wrapper 统一发射以保持边界一致。
