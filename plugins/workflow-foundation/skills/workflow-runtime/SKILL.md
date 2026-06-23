---
name: workflow-runtime
description: "最小确定性 Workflow Runtime 的定义与实现指南。用于通过 runtime 托管状态、step 校验、retry/error/complete 状态迁移、runtime-owned traceStep，以及 agent-runtime 执行循环来协调 Codex/AI agent 工作。"
---

# Workflow Runtime

本 skill 是给 Agent 阅读的 Workflow Runtime 定义。它声明 runtime 协议、状态归属和 agent 使用契约。它不是某一次任务的 workflow 模板。

## 边界

- Agent 是任务执行的主要力量，负责实际执行 step 并提交结果。
- Workflow Runtime 负责状态迁移、格式校验、retry、error、complete 和 step trace 发射。
- 当前 `SKILL.md` 是 runtime definition：它解释 runtime 的使用方式、职责和状态协议。
- Runtime 代码负责确定性实现。
- Workflow 最终状态以 Runtime state 为准。
- Trace record 是不可变的执行事实，不是 workflow 状态库。

## Agent Runtime Loop

Runtime 循环是：

```txt
runtime.start(goal, firstStep)
  -> Runtime 校验 firstStep
  -> Runtime 分配 next_step

Agent 执行分配到的 step
  -> Agent 调用 runtime.completeStep(stepId, output, nextStep | finalResult)
  -> Runtime 校验 output 和 nextStep/finalResult
  -> Runtime 更新 state
  -> Runtime 返回 next_step | completed | rejected | error

循环直到 Runtime state 到达 completed 或 error。
```

Agent 可以提出下一步，但该 step 是否被接纳进 state，由 Runtime 决定。

## 实现

当前 MVP 逻辑在：

```txt
scripts/runtime.ts
```

它包含：

- runtime definition 常量；
- runtime-owned state model；
- `start`;
- `completeStep`;
- `errorStep`;
- 通用 step plan 校验；
- 通用 step output 校验；
- 可选 normalizer hook，用于格式修复；
- retry/error/complete 状态迁移；
- runtime-owned `traceStep`；
- in-memory store；
- 最小 agent-runtime loop 示例。

## MVP 约束

不要把某次任务专属的 workflow 模板、单次任务 output schema，或 agent 自行声明的状态机放进这个 definition。它们要么属于 agent 当前执行上下文，要么在沉淀成确定性规则后进入 runtime 代码。

当前 MVP 暂不包含 branch、approval、checkpoint/resume、distributed workers、automatic tool runners 和 durable database storage。
