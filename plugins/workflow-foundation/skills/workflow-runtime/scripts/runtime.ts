import { randomUUID } from "node:crypto";

export type RunStatus = "running" | "completed" | "error";
export type StepStatus = "assigned" | "completed" | "error";

export type RuntimeError = {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export type TraceEmitInput = {
  parentTraceId?: string | null;
  layer: "workflow_runtime";
  emitter: string;
  event:
    | "workflow.started"
    | "workflow.completed"
    | "workflow.failed"
    | "step.started"
    | "step.completed"
    | "step.failed"
    | "retry.scheduled";
  status?: "started" | "success" | "failed" | "retrying";
  level?: "debug" | "info" | "warn" | "error";
  subject?: {
    type: "workflow" | "step" | "decision";
    name: string;
    id?: string;
  };
  attributes?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
  };
  security?: {
    redaction: "none" | "partial" | "strict";
  };
};

export type TraceEmitTool = {
  emit(input: TraceEmitInput): Promise<{ accepted: true; traceId: string }>;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export type RuntimeDefinition = {
  id: "workflow-runtime";
  version: string;
  source: "SKILL.md";
  stateProtocol: {
    runStatuses: readonly RunStatus[];
    stepStatuses: readonly StepStatus[];
    finalRunStatuses: readonly Extract<RunStatus, "completed" | "error">[];
  };
  agentContract: {
    agentExecutesWork: true;
    runtimeOwnsState: true;
    agentSubmitsSteps: true;
    runtimeReturnsNextStep: true;
  };
};

export const WORKFLOW_RUNTIME_DEFINITION: RuntimeDefinition = {
  id: "workflow-runtime",
  version: "0.1.0",
  source: "SKILL.md",
  stateProtocol: {
    runStatuses: ["running", "completed", "error"],
    stepStatuses: ["assigned", "completed", "error"],
    finalRunStatuses: ["completed", "error"],
  },
  agentContract: {
    agentExecutesWork: true,
    runtimeOwnsState: true,
    agentSubmitsSteps: true,
    runtimeReturnsNextStep: true,
  },
};

export type StepPlan = {
  id: string;
  title?: string;
  purpose: string;
  input: unknown;
  instructions?: string;
  retry?: {
    maxAttempts?: number;
  };
};

export type StepOutput = {
  status: "completed";
  summary: string;
  data?: unknown;
  evidence?: EvidenceRef[];
};

export type EvidenceRef = {
  type: "command" | "file" | "trace" | "artifact" | "manual";
  ref: string;
  summary?: string;
};

export type FinalResult = {
  status: "completed";
  summary: string;
  evidence?: EvidenceRef[];
  data?: unknown;
};

export type StartInput = {
  goal: string;
  firstStep: StepPlan;
  parentTraceId?: string | null;
};

export type CompleteStepInput = {
  runId: string;
  stepId: string;
  output: unknown;
  nextStep?: StepPlan | null;
  finalResult?: FinalResult | null;
};

export type ErrorStepInput = {
  runId: string;
  stepId: string;
  error: RuntimeError;
  nextStep?: StepPlan | null;
};

export type StepRun = {
  stepId: string;
  title?: string;
  purpose: string;
  input: unknown;
  status: StepStatus;
  attempt: number;
  maxAttempts: number;
  output?: StepOutput;
  error?: RuntimeError;
  assignedAt: string;
  completedAt?: string;
  trace: {
    startedTraceId?: string;
    completedTraceId?: string;
    failedTraceId?: string;
    retryTraceIds: string[];
  };
};

export type WorkflowRun = {
  runId: string;
  runtimeDefinition: RuntimeDefinition;
  status: RunStatus;
  goal: string;
  currentStep?: StepPlan;
  steps: StepRun[];
  finalResult?: FinalResult;
  error?: RuntimeError;
  trace: {
    workflowStartedTraceId?: string;
    workflowCompletedTraceId?: string;
    workflowFailedTraceId?: string;
  };
  startedAt: string;
  completedAt?: string;
};

export type RuntimeTransition =
  | {
      type: "next_step";
      run: WorkflowRun;
      step: StepPlan;
    }
  | {
      type: "retry_step";
      run: WorkflowRun;
      step: StepPlan;
      reason: string;
    }
  | {
      type: "completed";
      run: WorkflowRun;
      result: FinalResult;
    }
  | {
      type: "error";
      run: WorkflowRun;
      error: RuntimeError;
    }
  | {
      type: "rejected";
      run?: WorkflowRun;
      reason: "FORMAT_INVALID" | "STATE_INVALID";
      validationErrors: string[];
      stateChanged: false;
    };

export type WorkflowRunStore = {
  create(run: WorkflowRun): Promise<void>;
  update(run: WorkflowRun): Promise<void>;
  get(runId: string): Promise<WorkflowRun | null>;
};

export class InMemoryWorkflowRunStore implements WorkflowRunStore {
  private runs = new Map<string, WorkflowRun>();

  async create(run: WorkflowRun): Promise<void> {
    this.runs.set(run.runId, cloneJson(run));
  }

  async update(run: WorkflowRun): Promise<void> {
    this.runs.set(run.runId, cloneJson(run));
  }

  async get(runId: string): Promise<WorkflowRun | null> {
    const run = this.runs.get(runId);
    return run ? cloneJson(run) : null;
  }
}

export type RuntimeNormalizer = (input: {
  raw: unknown;
  target: "step_plan" | "step_output";
  validationErrors: string[];
}) => Promise<unknown>;

export type WorkflowRuntimeOptions = {
  store?: WorkflowRunStore;
  trace?: TraceEmitTool;
  normalizer?: RuntimeNormalizer;
  maxStepAttempts?: number;
  now?: () => Date;
  idFactory?: () => string;
  traceDelivery?: "best_effort" | "must_persist";
};

export class WorkflowRuntime {
  private readonly store: WorkflowRunStore;
  private readonly trace?: TraceEmitTool;
  private readonly normalizer?: RuntimeNormalizer;
  private readonly maxStepAttempts: number;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly traceDelivery: "best_effort" | "must_persist";

  constructor(options: WorkflowRuntimeOptions = {}) {
    this.store = options.store ?? new InMemoryWorkflowRunStore();
    this.trace = options.trace;
    this.normalizer = options.normalizer;
    this.maxStepAttempts = options.maxStepAttempts ?? 2;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.traceDelivery = options.traceDelivery ?? "best_effort";
  }

  async start(input: StartInput): Promise<RuntimeTransition> {
    const goalValidation = validateGoal(input.goal);
    if (goalValidation.ok === false) {
      return rejected("FORMAT_INVALID", goalValidation.errors);
    }

    const firstStep = await this.normalizeStepPlan(input.firstStep);
    if (firstStep.ok === false) {
      return rejected("FORMAT_INVALID", firstStep.errors);
    }

    const run: WorkflowRun = {
      runId: this.idFactory(),
      runtimeDefinition: WORKFLOW_RUNTIME_DEFINITION,
      status: "running",
      goal: goalValidation.value,
      currentStep: firstStep.value,
      steps: [],
      trace: {},
      startedAt: this.isoNow(),
    };

    const workflowTrace = await this.emitTrace({
      parentTraceId: input.parentTraceId ?? null,
      layer: "workflow_runtime",
      emitter: "workflow-runtime",
      event: "workflow.started",
      status: "started",
      subject: {
        type: "workflow",
        name: "agent-controlled-workflow",
        id: run.runId,
      },
      attributes: {
        runId: run.runId,
        runtimeDefinitionId: WORKFLOW_RUNTIME_DEFINITION.id,
        runtimeDefinitionVersion: WORKFLOW_RUNTIME_DEFINITION.version,
      },
      security: { redaction: "partial" },
    });
    run.trace.workflowStartedTraceId = workflowTrace?.traceId;

    const assignment = await this.assignStep(run, firstStep.value);
    await this.store.create(assignment.run);
    return assignment;
  }

  async completeStep(input: CompleteStepInput): Promise<RuntimeTransition> {
    const run = await this.store.get(input.runId);
    if (!run) {
      return rejected("STATE_INVALID", [`run not found: ${input.runId}`]);
    }

    const currentValidation = validateCurrentStep(run, input.stepId);
    if (currentValidation.ok === false) {
      return rejected("STATE_INVALID", currentValidation.errors, run);
    }

    const output = await this.normalizeStepOutput(input.output);
    if (output.ok === false) {
      return rejected("FORMAT_INVALID", output.errors, run);
    }

    if (input.finalResult && input.nextStep) {
      return rejected("FORMAT_INVALID", ["finalResult and nextStep are mutually exclusive"], run);
    }

    const currentStep = currentValidation.value;
    currentStep.status = "completed";
    currentStep.output = output.value;
    currentStep.completedAt = this.isoNow();

    const completedTrace = await this.traceStep(run, currentStep, "completed");
    currentStep.trace.completedTraceId = completedTrace?.traceId;

    if (input.finalResult) {
      const finalValidation = validateFinalResult(input.finalResult);
      if (finalValidation.ok === false) {
        return rejected("FORMAT_INVALID", finalValidation.errors, run);
      }

      run.status = "completed";
      run.currentStep = undefined;
      run.finalResult = finalValidation.value;
      run.completedAt = this.isoNow();

      const workflowCompleted = await this.emitTrace({
        parentTraceId: run.trace.workflowStartedTraceId,
        layer: "workflow_runtime",
        emitter: "workflow-runtime",
        event: "workflow.completed",
        status: "success",
        subject: {
          type: "workflow",
          name: "agent-controlled-workflow",
          id: run.runId,
        },
        attributes: {
          runId: run.runId,
          steps: run.steps.length,
        },
        security: { redaction: "partial" },
      });
      run.trace.workflowCompletedTraceId = workflowCompleted?.traceId;

      await this.store.update(run);
      return {
        type: "completed",
        run,
        result: finalValidation.value,
      };
    }

    const nextStep = await this.normalizeStepPlan(input.nextStep);
    if (nextStep.ok === false) {
      return rejected("FORMAT_INVALID", nextStep.errors, run);
    }

    run.currentStep = nextStep.value;
    const assignment = await this.assignStep(run, nextStep.value);
    await this.store.update(assignment.run);
    return assignment;
  }

  async errorStep(input: ErrorStepInput): Promise<RuntimeTransition> {
    const run = await this.store.get(input.runId);
    if (!run) {
      return rejected("STATE_INVALID", [`run not found: ${input.runId}`]);
    }

    const currentValidation = validateCurrentStep(run, input.stepId);
    if (currentValidation.ok === false) {
      return rejected("STATE_INVALID", currentValidation.errors, run);
    }

    const currentStep = currentValidation.value;
    currentStep.status = "error";
    currentStep.error = input.error;
    currentStep.completedAt = this.isoNow();

    const failedTrace = await this.traceStep(run, currentStep, "failed", input.error);
    currentStep.trace.failedTraceId = failedTrace?.traceId;

    const canRetry = Boolean(input.error.retryable) && currentStep.attempt < currentStep.maxAttempts;
    if (canRetry) {
      const retryTrace = await this.emitTrace({
        parentTraceId: currentStep.trace.failedTraceId ?? currentStep.trace.startedTraceId,
        layer: "workflow_runtime",
        emitter: "workflow-runtime",
        event: "retry.scheduled",
        status: "retrying",
        level: "warn",
        subject: {
          type: "decision",
          name: `${currentStep.stepId}:retry`,
          id: currentStep.stepId,
        },
        attributes: {
          runId: run.runId,
          stepId: currentStep.stepId,
          nextAttempt: currentStep.attempt + 1,
          maxAttempts: currentStep.maxAttempts,
          reason: input.error.code,
        },
        error: {
          code: input.error.code,
          message: input.error.message,
          retryable: input.error.retryable,
        },
        security: { redaction: "partial" },
      });
      if (retryTrace?.traceId) {
        currentStep.trace.retryTraceIds.push(retryTrace.traceId);
      }

      const retryStep: StepPlan = {
        id: currentStep.stepId,
        title: currentStep.title,
        purpose: currentStep.purpose,
        input: currentStep.input,
        retry: {
          maxAttempts: currentStep.maxAttempts,
        },
      };
      currentStep.status = "assigned";
      currentStep.attempt += 1;
      currentStep.error = undefined;
      currentStep.completedAt = undefined;
      currentStep.assignedAt = this.isoNow();
      run.currentStep = retryStep;

      const startedTrace = await this.traceStep(
        run,
        currentStep,
        "started",
        undefined,
        retryTrace?.traceId,
      );
      currentStep.trace.startedTraceId = startedTrace?.traceId;

      await this.store.update(run);
      return {
        type: "retry_step",
        run,
        step: retryStep,
        reason: input.error.code,
      };
    }

    if (input.nextStep) {
      const nextStep = await this.normalizeStepPlan(input.nextStep);
      if (nextStep.ok === false) {
        return rejected("FORMAT_INVALID", nextStep.errors, run);
      }
      run.currentStep = nextStep.value;
      const assignment = await this.assignStep(run, nextStep.value);
      await this.store.update(assignment.run);
      return assignment;
    }

    run.status = "error";
    run.currentStep = undefined;
    run.error = input.error;
    run.completedAt = this.isoNow();

    const workflowFailed = await this.emitTrace({
      parentTraceId: currentStep.trace.failedTraceId ?? run.trace.workflowStartedTraceId,
      layer: "workflow_runtime",
      emitter: "workflow-runtime",
      event: "workflow.failed",
      status: "failed",
      level: "error",
      subject: {
        type: "workflow",
        name: "agent-controlled-workflow",
        id: run.runId,
      },
      attributes: {
        runId: run.runId,
        failedStepId: currentStep.stepId,
      },
      error: {
        code: input.error.code,
        message: input.error.message,
        retryable: input.error.retryable,
      },
      security: { redaction: "partial" },
    });
    run.trace.workflowFailedTraceId = workflowFailed?.traceId;

    await this.store.update(run);
    return {
      type: "error",
      run,
      error: input.error,
    };
  }

  async getRun(runId: string): Promise<WorkflowRun | null> {
    return this.store.get(runId);
  }

  private async assignStep(
    run: WorkflowRun,
    step: StepPlan,
  ): Promise<Extract<RuntimeTransition, { type: "next_step" }>> {
    const maxAttempts = clampAttempts(step.retry?.maxAttempts, this.maxStepAttempts);
    const stepRun: StepRun = {
      stepId: step.id,
      title: step.title,
      purpose: step.purpose,
      input: step.input,
      status: "assigned",
      attempt: 1,
      maxAttempts,
      assignedAt: this.isoNow(),
      trace: {
        retryTraceIds: [],
      },
    };
    run.steps.push(stepRun);

    const startedTrace = await this.traceStep(run, stepRun, "started");
    stepRun.trace.startedTraceId = startedTrace?.traceId;

    return {
      type: "next_step",
      run,
      step,
    };
  }

  private async normalizeStepPlan(raw: unknown): Promise<ValidationResult<StepPlan>> {
    const first = validateStepPlan(coerceJsonObject(raw));
    if (first.ok === true) {
      return first;
    }

    if (!this.normalizer) {
      return first;
    }

    const normalized = await this.normalizer({
      raw,
      target: "step_plan",
      validationErrors: first.errors,
    });
    return validateStepPlan(coerceJsonObject(normalized));
  }

  private async normalizeStepOutput(raw: unknown): Promise<ValidationResult<StepOutput>> {
    const first = validateStepOutput(coerceJsonObject(raw));
    if (first.ok === true) {
      return first;
    }

    if (!this.normalizer) {
      return first;
    }

    const normalized = await this.normalizer({
      raw,
      target: "step_output",
      validationErrors: first.errors,
    });
    return validateStepOutput(coerceJsonObject(normalized));
  }

  private async traceStep(
    run: WorkflowRun,
    step: StepRun,
    event: "started" | "completed" | "failed",
    error?: RuntimeError,
    parentTraceIdOverride?: string,
  ): Promise<{ accepted: true; traceId: string } | undefined> {
    const eventName =
      event === "started"
        ? "step.started"
        : event === "completed"
          ? "step.completed"
          : "step.failed";

    const parentTraceId =
      parentTraceIdOverride ??
      (event === "started" ? run.trace.workflowStartedTraceId : step.trace.startedTraceId);

    return this.emitTrace({
      parentTraceId,
      layer: "workflow_runtime",
      emitter: "workflow-runtime",
      event: eventName,
      status:
        event === "started"
          ? "started"
          : event === "completed"
            ? "success"
            : "failed",
      level: event === "failed" ? "error" : "info",
      subject: {
        type: "step",
        name: step.stepId,
        id: step.stepId,
      },
      attributes: {
        runId: run.runId,
        stepId: step.stepId,
        attempt: step.attempt,
        maxAttempts: step.maxAttempts,
      },
      error: error
        ? {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          }
        : undefined,
      security: { redaction: "partial" },
    });
  }

  private async emitTrace(
    input: TraceEmitInput,
  ): Promise<{ accepted: true; traceId: string } | undefined> {
    if (!this.trace) {
      return undefined;
    }

    try {
      return await this.trace.emit(input);
    } catch (error) {
      if (this.traceDelivery === "must_persist") {
        throw error;
      }
      return undefined;
    }
  }

  private isoNow(): string {
    return this.now().toISOString();
  }
}

export async function runAgentLoopExample(agent: {
  nextStep(input: { goal: string; previous?: StepOutput }): Promise<StepPlan>;
  execute(step: StepPlan): Promise<StepOutput>;
  shouldFinish(input: { run: WorkflowRun; output: StepOutput }): Promise<FinalResult | null>;
}) {
  const runtime = new WorkflowRuntime({
    normalizer: extractJsonObjectNormalizer,
  });

  const goal = "create a minimal deterministic workflow runtime";
  const firstStep = await agent.nextStep({ goal });
  let transition = await runtime.start({ goal, firstStep });

  while (transition.type === "next_step" || transition.type === "retry_step") {
    const step = transition.step;
    const runId = transition.run.runId;

    try {
      const output = await agent.execute(step);
      const finalResult = await agent.shouldFinish({ run: transition.run, output });
      const nextStep = finalResult ? null : await agent.nextStep({ goal, previous: output });

      transition = await runtime.completeStep({
        runId,
        stepId: step.id,
        output,
        nextStep,
        finalResult,
      });
    } catch (error) {
      transition = await runtime.errorStep({
        runId,
        stepId: step.id,
        error: {
          code: "AGENT_STEP_FAILED",
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      });
    }
  }

  return transition;
}

export async function extractJsonObjectNormalizer(input: {
  raw: unknown;
}): Promise<unknown> {
  if (typeof input.raw !== "string") {
    return input.raw;
  }

  const firstBrace = input.raw.indexOf("{");
  const lastBrace = input.raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return input.raw.slice(firstBrace, lastBrace + 1);
  }

  return input.raw;
}

function validateGoal(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, errors: ["goal must be a non-empty string"] };
  }
  return { ok: true, value: raw.trim() };
}

function validateStepPlan(raw: unknown): ValidationResult<StepPlan> {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["step must be an object"] };
  }

  const errors: string[] = [];
  if (typeof raw.id !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/.test(raw.id)) {
    errors.push("step.id must match /^[a-z][a-z0-9_-]{1,63}$/");
  }

  if (raw.title !== undefined && typeof raw.title !== "string") {
    errors.push("step.title must be string when present");
  }

  if (typeof raw.purpose !== "string" || raw.purpose.trim().length === 0) {
    errors.push("step.purpose must be a non-empty string");
  }

  if (!("input" in raw)) {
    errors.push("step.input is required");
  }

  if (raw.instructions !== undefined && typeof raw.instructions !== "string") {
    errors.push("step.instructions must be string when present");
  }

  if (raw.retry !== undefined) {
    if (!isPlainObject(raw.retry)) {
      errors.push("step.retry must be an object when present");
    } else {
      const maxAttempts = raw.retry.maxAttempts;
      if (
        maxAttempts !== undefined &&
        (!Number.isInteger(maxAttempts) || typeof maxAttempts !== "number" || maxAttempts < 1)
      ) {
        errors.push("step.retry.maxAttempts must be an integer >= 1");
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const id = raw.id as string;
  const title = raw.title as string | undefined;
  const purpose = raw.purpose as string;
  const instructions = raw.instructions as string | undefined;
  const retry = raw.retry as { maxAttempts?: number } | undefined;

  return {
    ok: true,
    value: {
      id,
      title,
      purpose: purpose.trim(),
      input: raw.input,
      instructions,
      retry: retry
        ? { maxAttempts: retry.maxAttempts }
        : undefined,
    },
  };
}

function validateStepOutput(raw: unknown): ValidationResult<StepOutput> {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["step output must be an object"] };
  }

  const errors: string[] = [];
  if (raw.status !== "completed") {
    errors.push('step output.status must be "completed"');
  }

  if (typeof raw.summary !== "string" || raw.summary.trim().length === 0) {
    errors.push("step output.summary is required");
  }

  if (raw.evidence !== undefined) {
    const evidence = validateEvidenceRefs(raw.evidence, "step output.evidence");
    if (evidence.ok === false) {
      errors.push(...evidence.errors);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const summary = raw.summary as string;

  return {
    ok: true,
    value: {
      status: "completed",
      summary: summary.trim(),
      data: raw.data,
      evidence: raw.evidence as EvidenceRef[] | undefined,
    },
  };
}

function validateFinalResult(raw: unknown): ValidationResult<FinalResult> {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["finalResult must be an object"] };
  }

  const errors: string[] = [];
  if (raw.status !== "completed") {
    errors.push('finalResult.status must be "completed"');
  }

  if (typeof raw.summary !== "string" || raw.summary.trim().length === 0) {
    errors.push("finalResult.summary is required");
  }

  if (raw.evidence !== undefined) {
    const evidence = validateEvidenceRefs(raw.evidence, "finalResult.evidence");
    if (evidence.ok === false) {
      errors.push(...evidence.errors);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const summary = raw.summary as string;

  return {
    ok: true,
    value: {
      status: "completed",
      summary: summary.trim(),
      evidence: raw.evidence as EvidenceRef[] | undefined,
      data: raw.data,
    },
  };
}

function validateEvidenceRefs(raw: unknown, path: string): ValidationResult<EvidenceRef[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, errors: [`${path} must be array`] };
  }

  const errors: string[] = [];
  raw.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`${path}[${index}] must be object`);
      return;
    }

    if (!["command", "file", "trace", "artifact", "manual"].includes(String(item.type))) {
      errors.push(`${path}[${index}].type is invalid`);
    }

    if (typeof item.ref !== "string" || item.ref.trim().length === 0) {
      errors.push(`${path}[${index}].ref is required`);
    }

    if (item.summary !== undefined && typeof item.summary !== "string") {
      errors.push(`${path}[${index}].summary must be string when present`);
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: raw as EvidenceRef[] };
}

function validateCurrentStep(run: WorkflowRun, stepId: string): ValidationResult<StepRun> {
  const errors: string[] = [];

  if (run.status !== "running") {
    errors.push(`run must be running, got ${run.status}`);
  }

  if (!run.currentStep) {
    errors.push("run has no current step");
  } else if (run.currentStep.id !== stepId) {
    errors.push(`current step is ${run.currentStep.id}, submitted step is ${stepId}`);
  }

  const stepRun = [...run.steps].reverse().find((step) => step.stepId === stepId);
  if (!stepRun) {
    errors.push(`step run not found: ${stepId}`);
  } else if (stepRun.status !== "assigned") {
    errors.push(`step must be assigned, got ${stepRun.status}`);
  }

  if (errors.length > 0 || !stepRun) {
    return { ok: false, errors };
  }

  return { ok: true, value: stepRun };
}

function coerceJsonObject(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function clampAttempts(value: number | undefined, runtimeMax: number): number {
  if (!value) {
    return runtimeMax;
  }
  return Math.max(1, Math.min(value, runtimeMax));
}

function rejected(
  reason: Extract<RuntimeTransition, { type: "rejected" }>["reason"],
  validationErrors: string[],
  run?: WorkflowRun,
): Extract<RuntimeTransition, { type: "rejected" }> {
  return {
    type: "rejected",
    run,
    reason,
    validationErrors,
    stateChanged: false,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
