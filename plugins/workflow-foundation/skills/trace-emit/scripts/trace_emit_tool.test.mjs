import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_EVENTS,
  JsonlTraceSink,
  TraceEmitValidationError,
  createTraceEmitTool,
  defaultTraceFilePath,
  normalizeTraceRecord,
  redactAttributes,
} from "./trace_emit_tool.mjs";

const toolPath = fileURLToPath(new URL("./trace_emit_tool.mjs", import.meta.url));
const scriptDir = path.dirname(toolPath);

function fixedOptions(id = "trace_test") {
  return {
    idFactory: () => id,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

function assertValidationDetails(fn, expectedDetails) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error instanceof TraceEmitValidationError, true);
      for (const detail of expectedDetails) {
        assert.equal(error.details.includes(detail), true, `missing detail: ${detail}`);
      }
      return true;
    },
  );
}

test("normalizes a root agent goal trace", () => {
  const record = normalizeTraceRecord(
    {
      parentTraceId: null,
      layer: "agent",
      emitter: "codex-agent",
      event: "agent.goal.received",
      attributes: { goalType: "demo" },
    },
    fixedOptions(),
  );

  assert.deepEqual(record, {
    schemaVersion: "trace.v1",
    traceId: "trace_test",
    parentTraceId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    layer: "agent",
    emitter: "codex-agent",
    event: "agent.goal.received",
    status: "started",
    level: "info",
    attributes: { goalType: "demo" },
    security: { redaction: "partial" },
  });
});

test("canonical events match references/events.md", async () => {
  const eventsDoc = await fs.readFile(path.join(scriptDir, "../references/events.md"), "utf8");
  const documentedEvents = eventsDoc
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => line.split("|")[1].trim().replace(/^`|`$/g, ""))
    .sort();
  const implementedEvents = Object.keys(CANONICAL_EVENTS).sort();

  assert.deepEqual(documentedEvents, implementedEvents);
});

test("canonical events match trace_emit_tool.d.ts TraceEventName", async () => {
  const dts = await fs.readFile(path.join(scriptDir, "trace_emit_tool.d.ts"), "utf8");
  const unionBody = dts.match(/export type TraceEventName =([\s\S]*?);/)?.[1] || "";
  const typedEvents = [...unionBody.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
  const implementedEvents = Object.keys(CANONICAL_EVENTS).sort();

  assert.deepEqual(typedEvents, implementedEvents);
});

test("requires parentTraceId for non-root events", () => {
  assertValidationDetails(
    () =>
      normalizeTraceRecord(
        {
          parentTraceId: null,
          layer: "workflow_runtime",
          emitter: "runtime",
          event: "workflow.started",
          attributes: { workflowName: "demo" },
        },
        fixedOptions(),
      ),
    ["parentTraceId is required for event workflow.started"],
  );
});

test("normalizes workflow start with parentTraceId", () => {
  const record = normalizeTraceRecord(
    {
      parentTraceId: "trace_goal",
      layer: "workflow_runtime",
      emitter: "runtime",
      event: "workflow.started",
      attributes: { workflowName: "demo" },
    },
    fixedOptions("trace_workflow"),
  );

  assert.equal(record.traceId, "trace_workflow");
  assert.equal(record.parentTraceId, "trace_goal");
  assert.equal(record.status, "started");
  assert.equal(record.level, "info");
});

test("accepts alternative required attributes", () => {
  const bySummary = normalizeTraceRecord(
    {
      parentTraceId: "trace_goal",
      layer: "agent",
      emitter: "agent",
      event: "agent.plan.created",
      attributes: { planSummary: "one step" },
    },
    fixedOptions(),
  );
  assert.equal(bySummary.status, "success");

  const byRef = normalizeTraceRecord(
    {
      parentTraceId: "trace_goal",
      layer: "agent",
      emitter: "agent",
      event: "agent.plan.created",
      attributes: { planRef: "blob://plan/1" },
    },
    fixedOptions(),
  );
  assert.equal(byRef.status, "success");
});

test("rejects missing required attributes", () => {
  assertValidationDetails(
    () =>
      normalizeTraceRecord(
        {
          parentTraceId: null,
          layer: "agent",
          emitter: "agent",
          event: "agent.goal.received",
        },
        fixedOptions(),
      ),
    ["attributes must include goalType for event agent.goal.received"],
  );
});

test("rejects non-canonical event and wrong layer", () => {
  assertValidationDetails(
    () =>
      normalizeTraceRecord(
        {
          parentTraceId: "trace_parent",
          layer: "agent",
          emitter: "agent",
          event: "tool.started",
          attributes: { toolName: "http.request", attempt: 1 },
        },
        fixedOptions(),
      ),
    ["event tool.started cannot be emitted by layer agent"],
  );

  assertValidationDetails(
    () =>
      normalizeTraceRecord(
        {
          parentTraceId: "trace_parent",
          layer: "agent",
          emitter: "agent",
          event: "free.form.log",
        },
        fixedOptions(),
      ),
    ["event is not canonical: free.form.log"],
  );
});

test("requires error on failed events and normalizes failures", () => {
  assertValidationDetails(
    () =>
      normalizeTraceRecord(
        {
          parentTraceId: "trace_started",
          layer: "tool_wrapper",
          emitter: "tool-wrapper",
          event: "tool.failed",
          attributes: { toolName: "http.request", attempt: 1 },
        },
        fixedOptions(),
      ),
    ["error is required for failed events"],
  );

  const record = normalizeTraceRecord(
    {
      parentTraceId: "trace_started",
      layer: "tool_wrapper",
      emitter: "tool-wrapper",
      event: "tool.failed",
      attributes: { toolName: "http.request", attempt: 1 },
      error: { code: "TIMEOUT", message: "request timed out", retryable: true },
    },
    fixedOptions(),
  );

  assert.equal(record.status, "failed");
  assert.equal(record.level, "error");
  assert.deepEqual(record.error, {
    code: "TIMEOUT",
    message: "request timed out",
    retryable: true,
  });
});

test("validates subject, duration, security, and parentTraceId", () => {
  assertValidationDetails(
    () =>
      normalizeTraceRecord(
        {
          parentTraceId: "",
          layer: "agent",
          emitter: "agent",
          event: "agent.goal.received",
          durationMs: -1,
          subject: { type: "unknown", name: "" },
          security: { redaction: "wide-open" },
          attributes: { goalType: "demo" },
        },
        fixedOptions(),
      ),
    [
      "parentTraceId must be null or a non-empty string",
      "durationMs must be a non-negative number when provided",
      "subject.type must be one of: agent, workflow, step, skill, tool, checkpoint, approval, decision",
      "subject.name is required when subject is provided",
      "security.redaction must be none, partial, or strict",
    ],
  );
});

test("redacts sensitive keys recursively", () => {
  const redacted = redactAttributes({
    apiToken: "secret",
    nested: {
      password: "pw",
      value: "safe",
      list: [{ privateKey: "key" }],
    },
  });

  assert.deepEqual(redacted, {
    apiToken: "[REDACTED]",
    nested: {
      password: "[REDACTED]",
      value: "safe",
      list: [{ privateKey: "[REDACTED]" }],
    },
  });

  const preserved = redactAttributes({ apiToken: "secret" }, "none");
  assert.deepEqual(preserved, { apiToken: "secret" });
});

test("strict redaction truncates long strings", () => {
  const long = "x".repeat(200);
  const redacted = redactAttributes({ text: long }, "strict");
  assert.equal(redacted.text, `${"x".repeat(64)}...[TRUNCATED]`);
});

test("JsonlTraceSink writes one JSON record per line", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trace-emit-sink-"));
  const filePath = path.join(tmp, "nested", "traces.jsonl");
  const sink = new JsonlTraceSink({ filePath });
  const record = normalizeTraceRecord(
    {
      parentTraceId: null,
      layer: "agent",
      emitter: "agent",
      event: "agent.goal.received",
      attributes: { goalType: "demo" },
    },
    fixedOptions(),
  );

  await sink.write(record);
  const lines = (await fs.readFile(filePath, "utf8")).trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), record);
});

test("createTraceEmitTool emits and persists JSONL", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trace-emit-tool-"));
  const filePath = path.join(tmp, "traces.jsonl");
  const tool = createTraceEmitTool({ filePath, ...fixedOptions("trace_emit") });

  const result = await tool.emit({
    parentTraceId: null,
    layer: "agent",
    emitter: "agent",
    event: "agent.goal.received",
    attributes: { goalType: "demo", secret: "hidden" },
  });

  assert.deepEqual(result, {
    accepted: true,
    traceId: "trace_emit",
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  const persisted = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(persisted.attributes.secret, "[REDACTED]");
});

test("defaultTraceFilePath uses date buckets", () => {
  const result = defaultTraceFilePath({
    baseDir: "/tmp/base",
    date: new Date("2026-06-23T12:00:00.000Z"),
  });
  assert.equal(result, path.join("/tmp/base", ".trace-emit", "2026-06-23", "traces.jsonl"));
});

test("CLI accepts inline JSON and writes JSONL", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trace-emit-cli-"));
  const filePath = path.join(tmp, "traces.jsonl");
  const child = spawnSync(
    process.execPath,
    [
      toolPath,
      "--input",
      JSON.stringify({
        parentTraceId: null,
        layer: "agent",
        emitter: "cli",
        event: "agent.goal.received",
        attributes: { goalType: "cli-demo" },
      }),
      "--out",
      filePath,
    ],
    { encoding: "utf8" },
  );

  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.accepted, true);
  assert.match(result.traceId, /^trace_/);

  const persisted = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(persisted.traceId, result.traceId);
  assert.equal(persisted.attributes.goalType, "cli-demo");
});

test("CLI accepts stdin JSON", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "trace-emit-stdin-"));
  const filePath = path.join(tmp, "traces.jsonl");
  const child = spawnSync(process.execPath, [toolPath, "--out", filePath], {
    input: JSON.stringify({
      parentTraceId: null,
      layer: "agent",
      emitter: "stdin",
      event: "agent.goal.received",
      attributes: { goalType: "stdin-demo" },
    }),
    encoding: "utf8",
  });

  assert.equal(child.status, 0, child.stderr);
  const persisted = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(persisted.emitter, "stdin");
});

test("CLI returns structured validation errors", () => {
  const child = spawnSync(
    process.execPath,
    [
      toolPath,
      "--input",
      JSON.stringify({
        parentTraceId: null,
        layer: "agent",
        emitter: "cli",
        event: "agent.goal.received",
      }),
    ],
    { encoding: "utf8" },
  );

  assert.notEqual(child.status, 0);
  const payload = JSON.parse(child.stderr);
  assert.equal(payload.accepted, false);
  assert.equal(payload.error.name, "TraceEmitValidationError");
  assert.deepEqual(payload.error.details, [
    "attributes must include goalType for event agent.goal.received",
  ]);
});
