export type TraceLayer =
  | "agent"
  | "workflow_runtime"
  | "skill"
  | "tool_wrapper"
  | "raw_tool";

export type TraceStatus =
  | "started"
  | "success"
  | "failed"
  | "skipped"
  | "waiting"
  | "retrying"
  | "cancelled";

export type TraceLevel = "debug" | "info" | "warn" | "error";

export type TraceSubjectType =
  | "agent"
  | "workflow"
  | "step"
  | "skill"
  | "tool"
  | "checkpoint"
  | "approval"
  | "decision";

export type TraceEventName =
  | "agent.goal.received"
  | "agent.plan.created"
  | "agent.response.sent"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.cancelled"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "step.skipped"
  | "skill.started"
  | "skill.completed"
  | "skill.failed"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "retry.scheduled"
  | "checkpoint.saved"
  | "checkpoint.restored"
  | "decision.made"
  | "approval.requested"
  | "approval.resolved";

export type TraceSubject = {
  type: TraceSubjectType;
  name: string;
  id?: string;
};

export type TraceError = {
  code?: string;
  message: string;
  type?: string;
  retryable?: boolean;
  stackHash?: string;
};

export type TraceSecurity = {
  redaction?: "none" | "partial" | "strict";
  containsPii?: boolean;
  containsSecret?: boolean;
};

export type TraceEmitInput = {
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

export type TraceRecord = Omit<TraceEmitInput, "schemaVersion" | "traceId" | "timestamp" | "security"> & {
  schemaVersion: "trace.v1";
  traceId: string;
  parentTraceId: string | null;
  timestamp: string;
  status: TraceStatus;
  level: TraceLevel;
  security: Required<Pick<TraceSecurity, "redaction">> &
    Pick<TraceSecurity, "containsPii" | "containsSecret">;
};

export type TraceEmitResult = {
  accepted: true;
  traceId: string;
  timestamp: string;
};

export type TraceSink = {
  write(record: TraceRecord): Promise<void>;
};

export type TraceEmitToolOptions = {
  sink?: TraceSink;
  filePath?: string;
  baseDir?: string;
  now?: () => Date;
  idFactory?: () => string;
};

export class TraceEmitValidationError extends Error {
  details: string[];
  constructor(message: string, details?: string[]);
}

export class JsonlTraceSink implements TraceSink {
  filePath: string;
  constructor(options: { filePath: string });
  write(record: TraceRecord): Promise<void>;
}

export const SCHEMA_VERSION: "trace.v1";
export const TRACE_LAYERS: readonly TraceLayer[];
export const TRACE_STATUSES: readonly TraceStatus[];
export const TRACE_LEVELS: readonly TraceLevel[];
export const TRACE_SUBJECT_TYPES: readonly TraceSubjectType[];
export const CANONICAL_EVENTS: Readonly<Record<TraceEventName, unknown>>;

export function defaultTraceFilePath(options?: {
  baseDir?: string;
  date?: Date;
}): string;

export function createTraceEmitTool(options?: TraceEmitToolOptions): {
  emit(input: TraceEmitInput): Promise<TraceEmitResult>;
};

export function emitTrace(
  input: TraceEmitInput,
  options?: TraceEmitToolOptions,
): Promise<TraceEmitResult>;

export function normalizeTraceRecord(
  input: TraceEmitInput,
  options?: {
    now?: () => Date;
    idFactory?: () => string;
  },
): TraceRecord;

export function createTraceId(): string;

export function redactAttributes<T>(value: T, redaction?: "none" | "partial" | "strict"): T;
