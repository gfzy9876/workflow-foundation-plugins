import childProcess from 'node:child_process';

const COMPILE_LOG_EVIDENCE_PATTERNS = [
  { name: 'restart_appservice_compile', pattern: /restart appservice compile/i },
  { name: 'appservice_reload', pattern: /appservice reload/i },
  { name: 'simulator_launch_success', pattern: /simulator launch success/i },
  { name: 'appservice_webview_loadstop', pattern: /appservice webview loadstop/i },
  { name: 'compile_success', pattern: /\bcompile (success|finished|complete|done)\b/i },
  { name: 'build_success', pattern: /\bbuild (success|finished|complete|done)\b/i },
  { name: 'chinese_compile_success', pattern: /(编译|构建)(成功|完成|结束)/ },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(label, promise, timeoutMs) {
  let timer;
  let settled = false;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      settled = true;
      reject(new Error(`${label} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function cliLogsFrom(cliState, startIndex) {
  if (!cliState || !Array.isArray(cliState.logs)) return '';
  return cliState.logs.slice(startIndex).join('');
}

function findCompileLogEvidence(text) {
  return COMPILE_LOG_EVIDENCE_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.name);
}

function consoleMessageText(msg) {
  const args = msg?.args || [];
  if (!Array.isArray(args)) return '';
  return args.map((arg) => {
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

function consoleBufferFor(miniProgram) {
  if (!miniProgram || typeof miniProgram.on !== 'function') return [];
  if (!Object.prototype.hasOwnProperty.call(miniProgram, '__trystCompileReadyConsoleBuffer')) {
    const buffer = [];
    Object.defineProperty(miniProgram, '__trystCompileReadyConsoleBuffer', {
      value: buffer,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    miniProgram.on('console', (msg) => {
      const text = consoleMessageText(msg);
      if (text) buffer.push(text);
    });
  }
  return miniProgram.__trystCompileReadyConsoleBuffer;
}

export async function triggerCompileShortcut() {
  const appleScript = [
    'tell application id "com.tencent.webplusdevtools" to activate',
    'delay 1',
    'tell application "System Events"',
    '  try',
    '    set devtoolsProcess to first application process whose bundle identifier is "com.tencent.webplusdevtools"',
    '    set frontmost of devtoolsProcess to true',
    '  end try',
    '  delay 0.3',
    '  try',
    '    click (first menu item of menu "工具" of menu bar 1 of devtoolsProcess whose name starts with "编译")',
    '  on error',
    '    key code 11 using {command down}',
    '  end try',
    'end tell',
  ];

  await new Promise((resolve, reject) => {
    const scriptProcess = childProcess.spawn('osascript', appleScript.flatMap((line) => ['-e', line]), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const logs = [];
    scriptProcess.stdout.on('data', (chunk) => logs.push(chunk.toString()));
    scriptProcess.stderr.on('data', (chunk) => logs.push(chunk.toString()));
    scriptProcess.on('error', reject);
    scriptProcess.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = logs.join('').trim();
      reject(new Error(`Cmd+B compile shortcut failed with code=${code} signal=${signal}${detail ? `: ${detail}` : ''}`));
    });
  });
}

async function probeRuntimeReady(miniProgram, operationTimeoutMs) {
  const system = await withTimeout('systemInfo', miniProgram.systemInfo(), operationTimeoutMs)
    .then((info) => ({
      ok: true,
      platform: info.platform || 'unknown',
      SDKVersion: info.SDKVersion || 'unknown',
    }))
    .catch((error) => ({ ok: false, error: error.message }));

  const pageStack = await withTimeout('pageStack', miniProgram.pageStack(), operationTimeoutMs)
    .then((stack) => {
      const paths = stack.map((entry) => entry.path);
      return {
        ok: true,
        paths,
        text: paths.join(' > '),
      };
    })
    .catch((error) => ({ ok: false, error: error.message }));

  return {
    ready: Boolean(pageStack.ok && pageStack.paths.length),
    system,
    pageStack,
  };
}

export async function ensureCompileReady({
  miniProgram,
  cliState,
  delayMs,
  operationTimeoutMs,
  maxAttempts,
  logPrefix = 'mini-runtime',
  log = () => {},
  requireCompileLogEvidence = false,
  trigger = triggerCompileShortcut,
}) {
  const attempts = [];
  let bestRuntimeReadyAttempt = null;
  const runtimeLogs = consoleBufferFor(miniProgram);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const logStart = Array.isArray(cliState?.logs) ? cliState.logs.length : 0;
    const runtimeLogStart = runtimeLogs.length;
    const row = {
      attempt,
      delayMs,
      shortcut: { ok: false },
      logEvidence: [],
      runtime: null,
      elapsedMs: 0,
    };

    log(`[${logPrefix}] compile attempt ${attempt}/${maxAttempts}: triggering DevTools compile command`);
    try {
      await trigger();
      row.shortcut = { ok: true };
    } catch (error) {
      row.shortcut = { ok: false, error: error.message };
    }

    if (delayMs > 0) await sleep(delayMs);

    const logText = [
      cliLogsFrom(cliState, logStart),
      runtimeLogs.slice(runtimeLogStart).join('\n'),
    ].filter(Boolean).join('\n');
    row.logEvidence = findCompileLogEvidence(logText);
    row.runtime = await probeRuntimeReady(miniProgram, operationTimeoutMs);
    row.elapsedMs = Date.now() - startedAt;
    attempts.push(row);

    log([
      `[${logPrefix}] compile attempt ${attempt}/${maxAttempts}:`,
      `shortcut=${row.shortcut.ok ? 'ok' : 'failed'}`,
      `logEvidence=${row.logEvidence.length > 0}`,
      `runtimeReady=${row.runtime.ready}`,
      row.runtime.pageStack?.text ? `pageStack=${row.runtime.pageStack.text}` : '',
    ].filter(Boolean).join(' '));

    if (row.runtime.ready) {
      const hasLogEvidence = row.logEvidence.length > 0;
      if (hasLogEvidence || !requireCompileLogEvidence) {
        return {
          ok: true,
          status: hasLogEvidence ? 'runtime_ready_with_log_evidence' : 'runtime_ready_without_log_evidence',
          compileObserved: hasLogEvidence,
          logEvidenceObserved: hasLogEvidence,
          runtimeReady: true,
          warning: hasLogEvidence ? '' : 'No compile log evidence observed; readiness is based on structured runtime probes.',
          attempts,
          lastAttempt: row,
        };
      }
    }

    if (row.runtime.ready && !bestRuntimeReadyAttempt) {
      bestRuntimeReadyAttempt = row;
    }

    if (attempt < maxAttempts) await sleep(1000);
  }

  const logEvidenceObserved = attempts.some((item) => item.logEvidence.length > 0);
  const runtimeReadyAttempt = bestRuntimeReadyAttempt || attempts.find((item) => item.runtime?.ready);
  if (runtimeReadyAttempt) {
    return {
      ok: logEvidenceObserved || !requireCompileLogEvidence,
      status: logEvidenceObserved ? 'runtime_ready_with_log_evidence_late' : 'runtime_ready_without_log_evidence',
      compileObserved: logEvidenceObserved,
      logEvidenceObserved,
      runtimeReady: true,
      warning: logEvidenceObserved ? '' : 'No compile log evidence observed; readiness is based on structured runtime probes.',
      attempts,
      lastAttempt: runtimeReadyAttempt,
    };
  }

  return {
    ok: false,
    status: logEvidenceObserved ? 'log_evidence_without_runtime_ready' : 'runtime_not_ready_after_compile_command',
    compileObserved: logEvidenceObserved,
    logEvidenceObserved,
    runtimeReady: false,
    attempts,
    lastAttempt: attempts[attempts.length - 1] || null,
  };
}

export function summarizeCompileReady(result) {
  if (!result) return 'compileReady=skipped';
  return [
    `status=${result.status}`,
    `attempts=${result.attempts?.length || 0}`,
    `logEvidence=${Boolean(result.logEvidenceObserved ?? result.compileObserved)}`,
    `runtimeReady=${Boolean(result.runtimeReady)}`,
  ].join(' ');
}

export function compileReadyFailureMessage(result) {
  const last = result?.lastAttempt;
  const runtimeError = last?.runtime?.pageStack?.error || last?.runtime?.system?.error || '';
  const shortcutError = last?.shortcut?.error || '';
  return [
    `DevTools runtime did not become ready after compile command: ${summarizeCompileReady(result)}`,
    shortcutError ? `shortcutError=${shortcutError}` : '',
    runtimeError ? `runtimeError=${runtimeError}` : '',
  ].filter(Boolean).join('; ');
}
