#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const SCHEMA_VERSION = "trace.v1";

export const TRACE_LAYERS = Object.freeze([
  "agent",
  "workflow_runtime",
  "skill",
  "tool_wrapper",
  "raw_tool",
]);

export const TRACE_STATUSES = Object.freeze([
  "started",
  "success",
  "failed",
  "skipped",
  "waiting",
  "retrying",
  "cancelled",
]);

export const TRACE_LEVELS = Object.freeze(["debug", "info", "warn", "error"]);

export const TRACE_SUBJECT_TYPES = Object.freeze([
  "agent",
  "workflow",
  "step",
  "skill",
  "tool",
  "checkpoint",
  "approval",
  "decision",
]);

export const CANONICAL_EVENTS = Object.freeze({
  "agent.goal.received": {
    layers: ["agent"],
    requiredAttributes: [["goalType"]],
    allowRoot: true,
    defaultStatus: "started",
    defaultLevel: "info",
  },
  "agent.plan.created": {
    layers: ["agent"],
    requiredAttributes: [["planRef", "planSummary"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "agent.response.sent": {
    layers: ["agent"],
    requiredAttributes: [["responseType"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "workflow.started": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["workflowName"]],
    defaultStatus: "started",
    defaultLevel: "info",
  },
  "workflow.completed": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["workflowName"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "workflow.failed": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["workflowName"]],
    requiresError: true,
    defaultStatus: "failed",
    defaultLevel: "error",
  },
  "workflow.cancelled": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["workflowName"], ["reason"]],
    defaultStatus: "cancelled",
    defaultLevel: "warn",
  },
  "step.started": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["stepId"]],
    defaultStatus: "started",
    defaultLevel: "info",
  },
  "step.completed": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["stepId"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "step.failed": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["stepId"]],
    requiresError: true,
    defaultStatus: "failed",
    defaultLevel: "error",
  },
  "step.skipped": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["stepId"], ["reason"]],
    defaultStatus: "skipped",
    defaultLevel: "info",
  },
  "skill.started": {
    layers: ["skill", "workflow_runtime"],
    requiredAttributes: [["skillName"]],
    defaultStatus: "started",
    defaultLevel: "info",
  },
  "skill.completed": {
    layers: ["skill", "workflow_runtime"],
    requiredAttributes: [["skillName"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "skill.failed": {
    layers: ["skill", "workflow_runtime"],
    requiredAttributes: [["skillName"]],
    requiresError: true,
    defaultStatus: "failed",
    defaultLevel: "error",
  },
  "tool.started": {
    layers: ["tool_wrapper"],
    requiredAttributes: [["toolName"], ["attempt"]],
    defaultStatus: "started",
    defaultLevel: "info",
  },
  "tool.completed": {
    layers: ["tool_wrapper"],
    requiredAttributes: [["toolName"], ["attempt"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "tool.failed": {
    layers: ["tool_wrapper"],
    requiredAttributes: [["toolName"], ["attempt"]],
    requiresError: true,
    defaultStatus: "failed",
    defaultLevel: "error",
  },
  "retry.scheduled": {
    layers: ["workflow_runtime", "tool_wrapper"],
    requiredAttributes: [["attempt"], ["maxAttempts"], ["backoffMs"], ["reason"]],
    defaultStatus: "retrying",
    defaultLevel: "warn",
  },
  "checkpoint.saved": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["checkpointId"], ["stateRef"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "checkpoint.restored": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["checkpointId"], ["stateRef"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "decision.made": {
    layers: ["agent", "workflow_runtime", "skill"],
    requiredAttributes: [["decisionType"], ["selected"], ["reasonCode"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
  "approval.requested": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["approvalType"], ["approvalId"]],
    defaultStatus: "waiting",
    defaultLevel: "warn",
  },
  "approval.resolved": {
    layers: ["workflow_runtime"],
    requiredAttributes: [["approvalId"], ["result"]],
    defaultStatus: "success",
    defaultLevel: "info",
  },
});

const SENSITIVE_KEY_RE =
  /(^|_|-|\.)?(authorization|cookie|credential|password|private.?key|secret|session|token)(_|-|\.)?$/i;

export class TraceEmitValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "TraceEmitValidationError";
    this.details = details;
  }
}

export class JsonlTraceSink {
  constructor({ filePath }) {
    if (!filePath || typeof filePath !== "string") {
      throw new TypeError("JsonlTraceSink requires a filePath string");
    }
    this.filePath = filePath;
  }

  async write(record) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }
}

export function defaultTraceFilePath({
  baseDir = process.cwd(),
  date = new Date(),
} = {}) {
  const day = date.toISOString().slice(0, 10);
  return path.join(baseDir, ".trace-emit", day, "traces.jsonl");
}

export function createTraceEmitTool(options = {}) {
  const now = options.now || (() => new Date());
  const idFactory = options.idFactory || createTraceId;
  const sink =
    options.sink ||
    new JsonlTraceSink({
      filePath: options.filePath || defaultTraceFilePath(options),
    });

  return {
    async emit(input) {
      const record = normalizeTraceRecord(input, { now, idFactory });
      await sink.write(record);
      return {
        accepted: true,
        traceId: record.traceId,
        timestamp: record.timestamp,
      };
    },
  };
}

export async function emitTrace(input, options = {}) {
  return createTraceEmitTool(options).emit(input);
}

export function normalizeTraceRecord(input, { now = () => new Date(), idFactory = createTraceId } = {}) {
  const draft = assertPlainObject(input, "trace input");
  const eventMeta = CANONICAL_EVENTS[draft.event];
  const errors = [];

  if (draft.schemaVersion !== undefined && draft.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }

  if (!isNonEmptyString(draft.event)) {
    errors.push("event is required");
  } else if (!eventMeta) {
    errors.push(`event is not canonical: ${draft.event}`);
  }

  if (!isOneOf(draft.layer, TRACE_LAYERS)) {
    errors.push(`layer must be one of: ${TRACE_LAYERS.join(", ")}`);
  } else if (eventMeta && !eventMeta.layers.includes(draft.layer)) {
    errors.push(`event ${draft.event} cannot be emitted by layer ${draft.layer}`);
  }

  if (!isNonEmptyString(draft.emitter)) {
    errors.push("emitter is required");
  }

  if (draft.traceId !== undefined && !isNonEmptyString(draft.traceId)) {
    errors.push("traceId must be a non-empty string when provided");
  }

  if (
    draft.parentTraceId !== undefined &&
    draft.parentTraceId !== null &&
    !isNonEmptyString(draft.parentTraceId)
  ) {
    errors.push("parentTraceId must be null or a non-empty string");
  }
  if (
    eventMeta &&
    !eventMeta.allowRoot &&
    (draft.parentTraceId === undefined || draft.parentTraceId === null)
  ) {
    errors.push(`parentTraceId is required for event ${draft.event}`);
  }

  if (draft.timestamp !== undefined && Number.isNaN(Date.parse(draft.timestamp))) {
    errors.push("timestamp must be a valid ISO-8601-compatible string when provided");
  }

  if (draft.status !== undefined && !isOneOf(draft.status, TRACE_STATUSES)) {
    errors.push(`status must be one of: ${TRACE_STATUSES.join(", ")}`);
  }

  if (draft.level !== undefined && !isOneOf(draft.level, TRACE_LEVELS)) {
    errors.push(`level must be one of: ${TRACE_LEVELS.join(", ")}`);
  }

  if (draft.durationMs !== undefined && !isNonNegativeNumber(draft.durationMs)) {
    errors.push("durationMs must be a non-negative number when provided");
  }

  if (draft.subject !== undefined) {
    validateSubject(draft.subject, errors);
  }

  const attributes =
    draft.attributes === undefined
      ? {}
      : assertPlainObject(draft.attributes, "attributes");

  if (eventMeta) {
    for (const group of eventMeta.requiredAttributes) {
      if (!group.some((key) => attributes[key] !== undefined && attributes[key] !== null && attributes[key] !== "")) {
        errors.push(`attributes must include ${group.join(" or ")} for event ${draft.event}`);
      }
    }

    if (eventMeta.requiresError) {
      validateError(draft.error, errors, true);
    } else if (draft.error !== undefined) {
      validateError(draft.error, errors, false);
    }
  }

  if (draft.security !== undefined) {
    validateSecurity(draft.security, errors);
  }

  if (errors.length > 0) {
    throw new TraceEmitValidationError("invalid trace emit input", errors);
  }

  const normalizedSecurity = normalizeSecurity(draft.security, draft.layer);
  const timestamp = draft.timestamp || now().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    traceId: draft.traceId || idFactory(),
    parentTraceId: draft.parentTraceId ?? null,
    timestamp,
    layer: draft.layer,
    emitter: draft.emitter,
    event: draft.event,
    status: draft.status || eventMeta.defaultStatus,
    level: draft.level || eventMeta.defaultLevel,
    ...(draft.subject !== undefined ? { subject: draft.subject } : {}),
    ...(draft.durationMs !== undefined ? { durationMs: draft.durationMs } : {}),
    ...(Object.keys(attributes).length > 0
      ? { attributes: redactAttributes(attributes, normalizedSecurity.redaction) }
      : {}),
    ...(draft.error !== undefined ? { error: normalizeError(draft.error) } : {}),
    security: normalizedSecurity,
  };
}

export function createTraceId() {
  return `trace_${crypto.randomUUID()}`;
}

export function redactAttributes(value, redaction = "partial") {
  if (redaction === "none") return value;
  return redactValue(value, redaction, []);
}

function validateSubject(subject, errors) {
  if (!isPlainObject(subject)) {
    errors.push("subject must be an object when provided");
    return;
  }
  if (!isOneOf(subject.type, TRACE_SUBJECT_TYPES)) {
    errors.push(`subject.type must be one of: ${TRACE_SUBJECT_TYPES.join(", ")}`);
  }
  if (!isNonEmptyString(subject.name)) {
    errors.push("subject.name is required when subject is provided");
  }
  if (subject.id !== undefined && !isNonEmptyString(subject.id)) {
    errors.push("subject.id must be a non-empty string when provided");
  }
}

function validateError(error, errors, required) {
  if (required && error === undefined) {
    errors.push("error is required for failed events");
    return;
  }
  if (error === undefined) return;
  if (!isPlainObject(error)) {
    errors.push("error must be an object when provided");
    return;
  }
  if (!isNonEmptyString(error.message)) {
    errors.push("error.message is required when error is provided");
  }
  if (error.code !== undefined && !isNonEmptyString(error.code)) {
    errors.push("error.code must be a non-empty string when provided");
  }
  if (error.type !== undefined && !isNonEmptyString(error.type)) {
    errors.push("error.type must be a non-empty string when provided");
  }
  if (error.retryable !== undefined && typeof error.retryable !== "boolean") {
    errors.push("error.retryable must be boolean when provided");
  }
  if (error.stackHash !== undefined && !isNonEmptyString(error.stackHash)) {
    errors.push("error.stackHash must be a non-empty string when provided");
  }
}

function validateSecurity(security, errors) {
  if (!isPlainObject(security)) {
    errors.push("security must be an object when provided");
    return;
  }
  if (security.redaction !== undefined && !isOneOf(security.redaction, ["none", "partial", "strict"])) {
    errors.push("security.redaction must be none, partial, or strict");
  }
  if (security.containsPii !== undefined && typeof security.containsPii !== "boolean") {
    errors.push("security.containsPii must be boolean when provided");
  }
  if (security.containsSecret !== undefined && typeof security.containsSecret !== "boolean") {
    errors.push("security.containsSecret must be boolean when provided");
  }
}

function normalizeSecurity(security, layer) {
  const defaultRedaction = layer === "agent" || layer === "tool_wrapper" ? "partial" : "none";
  return {
    redaction: security?.redaction || defaultRedaction,
    ...(security?.containsPii !== undefined ? { containsPii: security.containsPii } : {}),
    ...(security?.containsSecret !== undefined ? { containsSecret: security.containsSecret } : {}),
  };
}

function normalizeError(error) {
  return {
    ...(error.code !== undefined ? { code: error.code } : {}),
    message: error.message,
    ...(error.type !== undefined ? { type: error.type } : {}),
    ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
    ...(error.stackHash !== undefined ? { stackHash: error.stackHash } : {}),
  };
}

function redactValue(value, redaction, keyPath) {
  const lastKey = keyPath[keyPath.length - 1] || "";
  if (SENSITIVE_KEY_RE.test(lastKey)) return "[REDACTED]";

  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (redaction === "strict" && value.length > 128) return `${value.slice(0, 64)}...[TRUNCATED]`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item, index) => redactValue(item, redaction, [...keyPath, String(index)]));
  }

  if (isPlainObject(value)) {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = redactValue(nested, redaction, [...keyPath, key]);
    }
    return output;
  }

  return String(value);
}

function assertPlainObject(value, name) {
  if (!isPlainObject(value)) {
    throw new TraceEmitValidationError(`${name} must be a plain object`);
  }
  return value;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function isOneOf(value, allowed) {
  return allowed.includes(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseCliArgs(argv) {
  const args = {
    input: undefined,
    out: process.env.TRACE_EMIT_PATH,
    pretty: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--pretty") {
      args.pretty = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

async function readCliInput(inputArg) {
  if (!inputArg) {
    const stdin = await readStdin();
    if (!stdin.trim()) throw new Error("missing --input JSON or stdin JSON");
    return JSON.parse(stdin);
  }

  if (inputArg.trim().startsWith("{")) {
    return JSON.parse(inputArg);
  }

  return JSON.parse(await fs.readFile(inputArg, "utf8"));
}

function printHelp() {
  process.stdout.write(`trace_emit_tool.mjs

Usage:
  node trace_emit_tool.mjs --input '<json>' [--out traces.jsonl] [--pretty]
  cat trace.json | node trace_emit_tool.mjs [--out traces.jsonl]

Environment:
  TRACE_EMIT_PATH  Default JSONL sink path when --out is omitted.

The input must follow trace.v1 and use canonical events from references/events.md.
`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const input = await readCliInput(args.input);
  const tool = createTraceEmitTool({ filePath: args.out || defaultTraceFilePath() });
  const result = await tool.emit(input);
  process.stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const payload = {
      accepted: false,
      error: {
        name: error.name || "Error",
        message: error.message,
        ...(Array.isArray(error.details) ? { details: error.details } : {}),
      },
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  });
}
