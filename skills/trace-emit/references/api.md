# Trace Emit API

## 声明工具边界

底层声明工具名为 `trace.emit`。

它接收一条原子 trace record draft，返回持久化后的记录身份。它应当可以被 workflow runtime、skill、agent code、tool wrapper 安全调用。

本 skill 的最小实现位于 `scripts/trace_emit_tool.mjs`，TypeScript 类型声明位于 `scripts/trace_emit_tool.d.ts`。

## 最小工具接口

```ts
type TraceEmitInput = {
  schemaVersion?: "trace.v1";
  traceId?: string;
  parentTraceId?: string | null;
  timestamp?: string;

  layer: TraceLayer;
  emitter: string;
  event: TraceEventName;

  status?: TraceStatus;
  level?: TraceLevel;
  subject?: TraceSubject;
  durationMs?: number;
  attributes?: Record<string, unknown>;
  error?: TraceError;
  security?: TraceSecurity;
};

type TraceEmitResult = {
  accepted: true;
  traceId: string;
  timestamp: string;
};

interface TraceEmitTool {
  emit(input: TraceEmitInput): Promise<TraceEmitResult>;
}
```

## 实际脚本用法

CLI:

```bash
node scripts/trace_emit_tool.mjs \
  --input '{"parentTraceId":null,"layer":"agent","emitter":"codex-agent","event":"agent.goal.received","attributes":{"goalType":"demo"}}' \
  --out /tmp/traces.jsonl \
  --pretty
```

模块：

```ts
import { createTraceEmitTool } from "./scripts/trace_emit_tool.mjs";

const trace = createTraceEmitTool({ filePath: "/tmp/traces.jsonl" });

const result = await trace.emit({
  parentTraceId: null,
  layer: "agent",
  emitter: "codex-agent",
  event: "agent.goal.received",
  attributes: { goalType: "demo" }
});
```

## 标准化行为

工具可以在缺省时补齐：

- `schemaVersion`: `trace.v1`
- `traceId`: 新生成的唯一 id
- `timestamp`: 当前 ISO-8601 时间
- `level`: 根据 event 和 error 推断
- `security.redaction`: 默认脱敏策略

工具不能推断 workflow 状态转移；它只标准化本条 emit 记录。

## 便利封装

Runtime 或 wrapper 可以暴露 helper，但所有 helper 最终都必须落到 `trace.emit`。

```ts
class TraceEmitter {
  constructor(private tool: TraceEmitTool) {}

  emit(input: TraceEmitInput) {
    return this.tool.emit(input);
  }

  child(parentTraceId: string, input: Omit<TraceEmitInput, "parentTraceId">) {
    return this.tool.emit({ ...input, parentTraceId });
  }
}
```

## Workflow Runtime 调用

```ts
const workflow = await trace.emit({
  parentTraceId: goal.traceId,
  layer: "workflow_runtime",
  emitter: "fullchain-orchestrator",
  event: "workflow.started",
  status: "started",
  subject: { type: "workflow", name: "deploy-agent-flow" },
  attributes: { workflowName: "deploy-agent-flow" }
});
```

## Tool Wrapper 调用

```ts
const started = await trace.emit({
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
```

## 错误处理

`trace.emit` 应尽量不阻塞调用方业务主流程：

- sink 暂时不可用时，按配置进入本地 buffer。
- buffer 不可用时，返回受控失败，或按 runtime 策略降级。
- 除非环境要求审计级持久性，否则 trace 投递失败不应自动导致 workflow 失败。

推荐内部投递策略：

```ts
type TraceDeliveryPolicy =
  | "best_effort"
  | "buffer_then_best_effort"
  | "must_persist";
```

`must_persist` 只用于合规或审计强约束 workflow。
