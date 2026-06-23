# Trace Event 字典

## 命名规则

event 使用小写点分命名：

```txt
<domain>.<action>[.<result>]
```

要求：

- event 名称必须稳定，不能把临时说明拼进 event 名。
- 只有现有 event 无法表达清楚时才新增 event。
- 不使用 `log`、`message`、`info`、`debug` 这类自由文本式 event。
- 事件语义由本文档定义，调用方只补结构化 `attributes`。

## 标准事件

| Event | 含义 | 推荐调用方 | parentTraceId 规则 | 必填 attributes |
| --- | --- | --- | --- | --- |
| `agent.goal.received` | Agent 收到用户或上游系统给出的顶层目标。通常是整棵 trace 树的根。 | `agent` | 顶层目标为 `null`；被委派的子目标指向委派 trace | `goalType` |
| `agent.plan.created` | Agent 形成了计划或执行轮廓。记录“已形成计划”这个事实，不记录私有推理过程。 | `agent` | 指向 goal trace 或触发规划的 decision trace | `planRef` 或 `planSummary` |
| `agent.response.sent` | Agent 已向用户或上游系统发送最终/中间响应。 | `agent` | 指向产出该响应的 workflow、step 或 decision trace | `responseType` |
| `workflow.started` | Workflow runtime 接受目标并开始编排一个 workflow。 | `workflow_runtime` | 指向 goal trace | `workflowName` |
| `workflow.completed` | Workflow runtime 到达成功终态。 | `workflow_runtime` | 指向对应的 `workflow.started` trace | `workflowName` |
| `workflow.failed` | Workflow runtime 到达失败终态。 | `workflow_runtime` | 指向对应的 `workflow.started` trace，或导致终态失败的最后一个 failed trace | `workflowName` |
| `workflow.cancelled` | Workflow runtime 因用户取消、超时策略、被新任务替代或外部取消信号而终止。 | `workflow_runtime` | 指向对应的 `workflow.started` trace 或取消决策 trace | `workflowName`, `reason` |
| `step.started` | Workflow runtime 开始执行一个逻辑 step。step 可以调用工具、调用 skill 或等待审批。 | `workflow_runtime` | 指向 workflow trace 或调度该 step 的 decision trace | `stepId` |
| `step.completed` | 一个 workflow step 成功完成。 | `workflow_runtime` | 指向对应的 `step.started` trace | `stepId` |
| `step.failed` | 一个 workflow step 失败。它不等价于 workflow 失败，runtime 仍可重试、跳过、走失败分支或请求审批。 | `workflow_runtime` | 指向对应的 `step.started` trace，或导致 step 失败的 child failed trace | `stepId` |
| `step.skipped` | Runtime 有意跳过某个 step，例如条件不满足、分支未选择、已有缓存或 checkpoint 结果可复用。 | `workflow_runtime` | 指向 workflow trace 或导致跳过的 decision trace | `stepId`, `reason` |
| `skill.started` | 一个 skill playbook 或 skill 内部流程开始。只有当 skill 调用本身值得观测时才发。 | `skill` 或 `workflow_runtime` | 指向 step trace 或 agent trace | `skillName` |
| `skill.completed` | 一个 skill 流程成功完成。 | `skill` 或 `workflow_runtime` | 指向对应的 `skill.started` trace | `skillName` |
| `skill.failed` | 一个 skill 流程未能产出预期结果。 | `skill` 或 `workflow_runtime` | 指向对应的 `skill.started` trace，或导致失败的 child failed trace | `skillName` |
| `tool.started` | 一个被 wrapper 包装的 tool call 开始。默认由 wrapper 发，不由 raw tool 直接发。 | `tool_wrapper` | 指向 step trace 或 skill trace | `toolName`, `attempt` |
| `tool.completed` | 一个被 wrapper 包装的 tool call 成功完成。 | `tool_wrapper` | 指向对应的 `tool.started` trace | `toolName`, `attempt` |
| `tool.failed` | 一个被 wrapper 包装的 tool call 失败。错误可能可重试，也可能是终态失败。 | `tool_wrapper` | 指向对应的 `tool.started` trace | `toolName`, `attempt` |
| `retry.scheduled` | Runtime 或 wrapper 在失败后决定安排重试。它记录“决定重试”，不是重试操作本身。 | `workflow_runtime` 或 `tool_wrapper` | 指向触发重试的 failed trace | `attempt`, `maxAttempts`, `backoffMs`, `reason` |
| `checkpoint.saved` | Runtime 保存了一个 checkpoint 引用，用于恢复、回放或故障转移。trace 中不保存 checkpoint body。 | `workflow_runtime` | 指向被 checkpoint 的 workflow 或 step trace | `checkpointId`, `stateRef` |
| `checkpoint.restored` | Runtime 从 checkpoint 引用恢复执行状态。 | `workflow_runtime` | 指向 workflow start、resume decision 或原 checkpoint trace | `checkpointId`, `stateRef` |
| `decision.made` | Agent、runtime 或 skill 做出了明确的分支、路由、工具选择、策略选择或 fallback 决策。 | `agent`、`workflow_runtime` 或 `skill` | 指向触发该决策的观察、结果或失败 trace | `decisionType`, `selected`, `reasonCode` |
| `approval.requested` | Runtime 在继续执行前请求人工审批或外部授权。 | `workflow_runtime` | 指向需要审批的 step trace 或 decision trace | `approvalType`, `approvalId` |
| `approval.resolved` | 审批请求已有结果：通过、拒绝、过期或取消。 | `workflow_runtime` | 指向对应的 `approval.requested` trace | `approvalId`, `result` |

## 事件语义

### started / completed / failed 配对

生命周期事件中，`completed` 或 `failed` trace 应把对应的 `started` trace 作为 `parentTraceId`。

```txt
tool.started   traceId=t1 parentTraceId=s1
tool.completed traceId=t2 parentTraceId=t1
```

这样每条记录仍是原子的，同时可以把 duration、status、error 放在终止事实上。

### 局部失败不等于 workflow 失败

`tool.failed` 和 `step.failed` 都只是局部事实。Workflow runtime 决定接下来是重试、跳过、走失败分支、请求审批，还是让整个 workflow 失败。

只有 `workflow.failed` 表示 workflow 已经进入失败终态。

### retry 是决策事件

`retry.scheduled` 表示失败之后的重试决策：

```txt
tool.failed -> retry.scheduled -> tool.started
```

重试产生的新 `tool.started` 应把 `retry.scheduled` 作为 `parentTraceId`。

### decision 事件

`decision.made` 不记录私有 chain-of-thought。推荐字段：

- `decisionType`: `branch`、`tool_selection`、`fallback`、`policy`、`approval`、`retry`、`checkpoint` 等稳定枚举。
- `selected`: 被选中的分支、工具或策略。
- `reasonCode`: 机器可读的稳定原因。
- `reasonSummary`: 可选，简短、脱敏的人类可读说明。

### checkpoint 事件

checkpoint 事件只记录引用和恢复语义，不记录状态正文：

```ts
attributes: {
  checkpointId: "ckpt_123",
  stateRef: "checkpoint://fullchain/ckpt_123",
  resumePolicy: "resume_from_next_step"
}
```
