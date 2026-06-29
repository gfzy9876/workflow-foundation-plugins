# Trace Record Schema

## 设计原则

每条 trace record 都是一条不可变的原子事实。父子关系只通过 `traceId` 和 `parentTraceId` 表达。

基础 schema 不引入 `runId`、`spanId`、`rootTraceId` 或分布式 tracing 产品术语。后续如果存储层需要更快查询整棵树，可以在 emit API 之外派生索引。

## TypeScript 结构

```ts
type TraceLayer =
  | "agent"
  | "workflow_runtime"
  | "skill"
  | "tool_wrapper"
  | "raw_tool";

type TraceStatus =
  | "started"
  | "success"
  | "failed"
  | "skipped"
  | "waiting"
  | "retrying"
  | "cancelled";

type TraceLevel = "debug" | "info" | "warn" | "error";

type TraceSubjectType =
  | "agent"
  | "workflow"
  | "step"
  | "skill"
  | "tool"
  | "checkpoint"
  | "approval"
  | "decision";

type TraceRecord = {
  schemaVersion: "trace.v1";

  traceId: string;
  parentTraceId?: string | null;
  timestamp: string;

  layer: TraceLayer;
  emitter: string;
  event: TraceEventName;

  status?: TraceStatus;
  level?: TraceLevel;

  subject?: {
    type: TraceSubjectType;
    name: string;
    id?: string;
  };

  durationMs?: number;

  attributes?: Record<string, unknown>;

  error?: {
    code?: string;
    message: string;
    type?: string;
    retryable?: boolean;
    stackHash?: string;
  };

  security?: {
    redaction: "none" | "partial" | "strict";
    containsPii?: boolean;
    containsSecret?: boolean;
  };
};
```

## 必填字段

每条持久化 trace 都必须有：

- `schemaVersion`: 第一版固定为 `trace.v1`。
- `traceId`: 当前 trace record 的唯一 id。它标识当前原子事件，不标识一次长任务。
- `parentTraceId`: 直接因果父节点。只有根记录使用 `null`。
- `timestamp`: emit 时生成的 ISO-8601 时间。
- `layer`: 发出 trace 的架构层。
- `emitter`: 具体组件名，例如 `fullchain-orchestrator`、`http-tool-wrapper`。
- `event`: 来自 `events.md` 的标准事件名。

## 可选字段

- `status`: 当前原子事件的生命周期状态。
- `level`: 运行严重级别。缺省可按 event 和 error 推断为 `info`。
- `subject`: 本事件描述的实体。
- `durationMs`: completion 或 failure 记录上的耗时。纯 start 记录通常不放 duration。
- `attributes`: 结构化扩展字段。优先放小型 primitive、枚举、id、计数和引用。
- `error`: 只在失败、重试或降级事件中出现。
- `security`: 脱敏和敏感性元信息。

## parentTraceId 规则

- 根用户目标或根系统事件：`parentTraceId = null`。
- workflow trace 指向触发它的 goal trace。
- step trace 指向 workflow trace，或指向调度该 step 的 decision trace。
- tool trace 指向调用它的 step trace 或 skill trace。
- `completed` trace 指向对应的 `started` trace。
- `failed` trace 指向对应的 `started` trace。
- retry trace 指向触发重试的 failed trace。
- checkpoint trace 指向被 checkpoint 的 workflow 或 step trace。
- decision trace 指向触发该决策的观察、结果、失败或完成 trace。

## attributes 规则

`attributes` 放紧凑结构化元数据：

```ts
attributes: {
  stepId: "health-check",
  attempt: 1,
  maxAttempts: 3,
  timeoutMs: 10000,
  resultCount: 5,
  stateRef: "checkpoint://workflow/ckpt_123"
}
```

不要放：

- 完整 prompt；
- 完整模型私有推理；
- credential、token、cookie、private key；
- 完整用户 PII；
- 大体积 tool input/output；
- 二进制数据。

改用引用：

```ts
attributes: {
  inputRef: "blob://trace-inputs/in_123",
  outputRef: "blob://trace-outputs/out_456",
  promptHash: "sha256:..."
}
```

## 脱敏策略

- `none`: 不含敏感内容。
- `partial`: 敏感值已摘要、hash、mask 或替换为引用。
- `strict`: 只允许 id、枚举、hash 和计数。

tool 和 agent 事件默认使用 `partial`，除非调用方能证明没有敏感数据。
