# Trace Emit 示例

## 从 Goal 到 Workflow

```ts
const goal = await trace.emit({
  parentTraceId: null,
  layer: "agent",
  emitter: "codex-agent",
  event: "agent.goal.received",
  status: "started",
  subject: { type: "agent", name: "user-goal" },
  attributes: {
    goalType: "deploy_with_validation",
    requestRef: "request://req_123"
  },
  security: { redaction: "partial" }
});

const workflow = await trace.emit({
  parentTraceId: goal.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "workflow.started",
  status: "started",
  subject: { type: "workflow", name: "deploy-agent-flow" },
  attributes: {
    workflowName: "deploy-agent-flow"
  }
});
```

## Workflow Step

```ts
const step = await trace.emit({
  parentTraceId: workflow.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "step.started",
  status: "started",
  subject: { type: "step", name: "health-check", id: "health-check" },
  attributes: {
    stepId: "health-check",
    timeoutMs: 10000
  }
});

await trace.emit({
  parentTraceId: step.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "step.completed",
  status: "success",
  durationMs: 812,
  subject: { type: "step", name: "health-check", id: "health-check" },
  attributes: {
    stepId: "health-check",
    nextStep: "deploy"
  }
});
```

## Tool Call

```ts
const call = await trace.emit({
  parentTraceId: step.traceId,
  layer: "tool_wrapper",
  emitter: "http-tool-wrapper",
  event: "tool.started",
  status: "started",
  subject: { type: "tool", name: "http.request" },
  attributes: {
    toolName: "http.request",
    method: "GET",
    urlHost: "api.example.com",
    attempt: 1
  },
  security: { redaction: "partial" }
});

await trace.emit({
  parentTraceId: call.traceId,
  layer: "tool_wrapper",
  emitter: "http-tool-wrapper",
  event: "tool.completed",
  status: "success",
  durationMs: 842,
  subject: { type: "tool", name: "http.request" },
  attributes: {
    toolName: "http.request",
    attempt: 1,
    httpStatus: 200,
    bytes: 15320
  }
});
```

## Retry

```ts
const failed = await trace.emit({
  parentTraceId: call.traceId,
  layer: "tool_wrapper",
  emitter: "http-tool-wrapper",
  event: "tool.failed",
  status: "failed",
  level: "warn",
  durationMs: 3000,
  subject: { type: "tool", name: "http.request" },
  attributes: {
    toolName: "http.request",
    attempt: 1
  },
  error: {
    code: "TIMEOUT",
    message: "request timed out",
    retryable: true
  }
});

const retry = await trace.emit({
  parentTraceId: failed.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "retry.scheduled",
  status: "retrying",
  level: "warn",
  subject: { type: "decision", name: "retry-http-request" },
  attributes: {
    attempt: 2,
    maxAttempts: 3,
    backoffMs: 2000,
    reason: "timeout"
  }
});

await trace.emit({
  parentTraceId: retry.traceId,
  layer: "tool_wrapper",
  emitter: "http-tool-wrapper",
  event: "tool.started",
  status: "started",
  subject: { type: "tool", name: "http.request" },
  attributes: {
    toolName: "http.request",
    attempt: 2
  }
});
```

## Checkpoint

```ts
await trace.emit({
  parentTraceId: step.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "checkpoint.saved",
  status: "success",
  subject: { type: "checkpoint", name: "after-health-check" },
  attributes: {
    checkpointId: "ckpt_123",
    stateRef: "checkpoint://deploy-agent-flow/ckpt_123",
    resumePolicy: "resume_from_next_step"
  },
  security: { redaction: "strict" }
});
```

## Decision 与失败分支

```ts
const decision = await trace.emit({
  parentTraceId: failed.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "decision.made",
  status: "success",
  subject: { type: "decision", name: "deploy-failure-branch" },
  attributes: {
    decisionType: "branch",
    selected: "request_human_approval",
    reasonCode: "health_check_failed",
    reasonSummary: "Deployment health check failed after retry budget was exhausted."
  }
});

await trace.emit({
  parentTraceId: decision.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "approval.requested",
  status: "waiting",
  subject: { type: "approval", name: "deploy-manual-review" },
  attributes: {
    approvalType: "manual_review",
    approvalId: "appr_123"
  }
});
```
