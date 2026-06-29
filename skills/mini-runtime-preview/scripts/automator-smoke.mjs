#!/usr/bin/env node
import { createRequire } from 'node:module';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compileReadyFailureMessage,
  ensureCompileReady,
  summarizeCompileReady,
} from './compile-ready.mjs';

const DEFAULT_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const DEFAULT_SCREENSHOT_PATH = path.join(os.tmpdir(), 'tryst-miniprogram-automator-smoke', 'smoke.png');

function defaultProjectPath() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'project.config.json'))) {
    return cwd;
  }
  if (fs.existsSync(path.join(cwd, '..', 'project.config.json'))) {
    return path.resolve(cwd, '..');
  }
  return cwd;
}

function parseArgs(argv) {
  const options = {
    cliPath: process.env.WECHAT_DEVTOOLS_CLI || DEFAULT_CLI_PATH,
    projectPath: process.env.MINIPROGRAM_PROJECT_PATH || defaultProjectPath(),
    sdkRoot: process.env.MINIPROGRAM_AUTOMATOR_SDK_ROOT || '',
    idePort: process.env.WECHAT_DEVTOOLS_IDE_PORT || process.env.MINIPROGRAM_IDE_PORT || '',
    page: '/pages/coin-toss/coin-toss',
    selector: '.coin-lift',
    screenshot: DEFAULT_SCREENSHOT_PATH,
    port: Number(process.env.MINIPROGRAM_AUTOMATOR_PORT || 9420),
    timeout: Number(process.env.MINIPROGRAM_AUTOMATOR_TIMEOUT || 120000),
    operationTimeoutMs: Number(process.env.MINIPROGRAM_AUTOMATOR_OPERATION_TIMEOUT || 20000),
    waitAfterRouteMs: 1500,
    waitAfterTapMs: 1200,
    compileShortcut: true,
    compileShortcutDelayMs: 12000,
    compileShortcutAttempts: Number(process.env.MINIPROGRAM_COMPILE_SHORTCUT_ATTEMPTS || 3),
    requireCompileLogEvidence: process.env.MINIPROGRAM_REQUIRE_COMPILE_LOG_EVIDENCE === '1',
    tap: true,
    close: true,
    trustProject: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--cli-path') {
      options.cliPath = requireValue(arg, next);
      i += 1;
    } else if (arg === '--project-path') {
      options.projectPath = requireValue(arg, next);
      i += 1;
    } else if (arg === '--sdk-root') {
      options.sdkRoot = requireValue(arg, next);
      i += 1;
    } else if (arg === '--ide-port') {
      options.idePort = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--page') {
      options.page = requireValue(arg, next);
      i += 1;
    } else if (arg === '--selector') {
      options.selector = requireValue(arg, next);
      i += 1;
    } else if (arg === '--screenshot') {
      options.screenshot = requireValue(arg, next);
      i += 1;
    } else if (arg === '--port') {
      options.port = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--timeout') {
      options.timeout = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--operation-timeout') {
      options.operationTimeoutMs = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--wait-after-route') {
      options.waitAfterRouteMs = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--wait-after-tap') {
      options.waitAfterTapMs = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--compile-shortcut-delay') {
      options.compileShortcutDelayMs = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--compile-shortcut-attempts') {
      options.compileShortcutAttempts = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--no-compile-shortcut') {
      options.compileShortcut = false;
    } else if (arg === '--require-compile-log-evidence') {
      options.requireCompileLogEvidence = true;
    } else if (arg === '--no-tap') {
      options.tap = false;
    } else if (arg === '--keep-open') {
      options.close = false;
    } else if (arg === '--no-trust-project') {
      options.trustProject = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.port)) {
    throw new Error('--port must be a number');
  }

  if (!Number.isFinite(options.timeout)) {
    throw new Error('--timeout must be a number');
  }

  if (!Number.isFinite(options.operationTimeoutMs)) {
    throw new Error('--operation-timeout must be a number');
  }

  if (!Number.isFinite(options.compileShortcutDelayMs)) {
    throw new Error('--compile-shortcut-delay must be a number');
  }

  if (!Number.isFinite(options.compileShortcutAttempts) || options.compileShortcutAttempts < 1) {
    throw new Error('--compile-shortcut-attempts must be a positive number');
  }

  if (options.idePort !== '' && !Number.isFinite(Number(options.idePort))) {
    throw new Error('--ide-port must be a number');
  }

  return options;
}

function requireValue(arg, value) {
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node <mini-runtime-preview-skill-dir>/scripts/automator-smoke.mjs [options]

Options:
  --cli-path <path>           WeChat DevTools CLI path
  --project-path <path>       WeChat DevTools project path
  --sdk-root <path>           Directory used to resolve miniprogram-automator
  --ide-port <number>         WeChat DevTools service port from Security Settings
  --page <path>               Page to relaunch, default /pages/coin-toss/coin-toss
  --selector <selector>       Element selector to wait for and tap, default .coin-lift
  --screenshot <path>         Screenshot output path, default /tmp/tryst-miniprogram-automator-smoke/smoke.png
  --port <number>             Automator websocket port, default 9420
  --timeout <ms>              Launch timeout, default 120000
  --operation-timeout <ms>    Timeout for each mini program operation, default 20000
  --wait-after-route <ms>     Delay after relaunch, default 1500
  --wait-after-tap <ms>       Delay after tap, default 1200
  --compile-shortcut-delay <ms>
                              Delay after Cmd+B compile shortcut, default 12000
  --compile-shortcut-attempts <n>
                              Max Cmd+B compile attempts before failing, default 3
  --require-compile-log-evidence
                              Require weak compile log evidence in addition to runtime readiness
  --no-compile-shortcut       Do not trigger DevTools Cmd+B after automator connects
  --no-tap                    Only open the page and assert the selector
  --keep-open                 Leave WeChat DevTools open after the run
  --no-trust-project          Do not pass --trust-project to WeChat DevTools

Project resolution:
  Run from a mini project root or its miniprogram directory, or pass --project-path.
  The target project does not need to contain .agents/scripts.
`);
}

function loadAutomator(options) {
  const candidateRoots = [
    options.sdkRoot,
    process.cwd(),
    path.join(options.projectPath, 'miniprogram'),
    options.projectPath,
  ].filter(Boolean);

  const errors = [];
  for (const root of candidateRoots) {
    try {
      const packageJson = path.join(path.resolve(root), 'package.json');
      const localRequire = createRequire(packageJson);
      return localRequire('miniprogram-automator');
    } catch (error) {
      errors.push(`${root}: ${error.message}`);
    }
  }

  throw new Error(`Cannot resolve miniprogram-automator. Tried:\n${errors.join('\n')}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout(label, promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    }),
  ]);
}

function startDevToolsAuto(options) {
  const args = [
    'auto',
    '--project',
    options.projectPath,
    '--auto-port',
    String(options.port),
  ];

  if (options.trustProject) {
    args.push('--trust-project');
  }

  if (options.idePort !== '') {
    args.push('--port', String(options.idePort));
  }

  const logs = [];
  let exitCode = null;
  let exitSignal = null;
  const cliProcess = childProcess.spawn(options.cliPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let exited = false;
  cliProcess.stdout.on('data', (chunk) => {
    logs.push(chunk.toString());
  });
  cliProcess.stderr.on('data', (chunk) => {
    logs.push(chunk.toString());
  });
  cliProcess.on('exit', (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
    logs.push(`[cli exit code=${code} signal=${signal}]\n`);
  });

  return {
    process: cliProcess,
    logs,
    isExited: () => exited,
    exitCode: () => exitCode,
    exitSignal: () => exitSignal,
  };
}

function stopDevToolsAuto(cliState) {
  if (!cliState || cliState.isExited()) {
    return;
  }

  try {
    process.kill(-cliState.process.pid, 'SIGTERM');
  } catch {
    try {
      cliState.process.kill('SIGTERM');
    } catch {
      // Process already exited.
    }
  }
}

async function connectWithRetry(automator, options, cliState) {
  const deadline = Date.now() + options.timeout;
  const wsEndpoint = `ws://127.0.0.1:${options.port}`;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await withTimeout('connect automator websocket', automator.connect({ wsEndpoint }), 5000);
    } catch (error) {
      lastError = error;
      if (cliState.isExited() && cliState.exitCode() !== 0) {
        break;
      }
      await sleep(1000);
    }
  }

  const cliLogs = cliState.logs.join('').trim();
  const suffix = cliLogs ? `\n\nWeChat DevTools CLI output:\n${cliLogs}` : '';
  throw new Error(`Failed to connect to ${wsEndpoint} within ${options.timeout} ms. Last error: ${lastError?.message || 'unknown'}${suffix}`);
}

async function ensureParentDir(filePath) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const automator = loadAutomator(options);
  let miniProgram;
  let cliState;
  let completed = false;

  console.log('[automator-smoke] launching WeChat DevTools');
  console.log(`[automator-smoke] projectPath=${options.projectPath}`);
  if (options.idePort !== '') {
    console.log(`[automator-smoke] idePort=${options.idePort}`);
  }
  console.log(`[automator-smoke] page=${options.page}`);
  console.log(`[automator-smoke] selector=${options.selector}`);

  try {
    cliState = startDevToolsAuto(options);
    miniProgram = await connectWithRetry(automator, options, cliState);
    console.log('[automator-smoke] connected automator websocket');
    await sleep(5000);

    if (options.compileShortcut) {
      const compileReady = await ensureCompileReady({
        miniProgram,
        cliState,
        delayMs: options.compileShortcutDelayMs,
        operationTimeoutMs: options.operationTimeoutMs,
        maxAttempts: options.compileShortcutAttempts,
        requireCompileLogEvidence: options.requireCompileLogEvidence,
        logPrefix: 'automator-smoke',
        log: (line) => console.log(line),
      });
      console.log(`[automator-smoke] compileReady ${summarizeCompileReady(compileReady)}`);
      if (!compileReady.ok) {
        throw new Error(compileReadyFailureMessage(compileReady));
      }
    }

    console.log('[automator-smoke] reading system info');
    const systemInfo = await withTimeout('systemInfo', miniProgram.systemInfo(), options.operationTimeoutMs).catch((error) => {
      console.warn(`[automator-smoke] systemInfo skipped: ${error.message}`);
      return null;
    });
    if (systemInfo) {
      console.log(`[automator-smoke] system=${systemInfo.platform || 'unknown'} sdk=${systemInfo.SDKVersion || 'unknown'}`);
    }

    console.log('[automator-smoke] relaunching page');
    const page = await withTimeout('reLaunch', miniProgram.reLaunch(options.page), options.operationTimeoutMs);
    if (!page) {
      throw new Error(`Failed to relaunch page: ${options.page}`);
    }

    await page.waitFor(options.waitAfterRouteMs);
    console.log('[automator-smoke] waiting for selector');
    await withTimeout(`waitFor ${options.selector}`, page.waitFor(options.selector), options.operationTimeoutMs);

    console.log('[automator-smoke] querying selector');
    const element = await withTimeout(`query ${options.selector}`, page.$(options.selector), options.operationTimeoutMs);
    if (!element) {
      throw new Error(`Element not found after wait: ${options.selector}`);
    }

    const beforeClass = await withTimeout('read element class', element.attribute('class'), options.operationTimeoutMs).catch(() => '');
    console.log(`[automator-smoke] found selector before tap, class="${beforeClass}"`);

    if (options.tap) {
      await withTimeout(`tap ${options.selector}`, element.tap(), options.operationTimeoutMs);
      await page.waitFor(options.waitAfterTapMs);
      console.log('[automator-smoke] tap ok');
    }

    await ensureParentDir(options.screenshot);
    await withTimeout('screenshot', miniProgram.screenshot({ path: options.screenshot }), options.operationTimeoutMs);
    console.log(`[automator-smoke] screenshot=${options.screenshot}`);

    const stack = await withTimeout('pageStack', miniProgram.pageStack(), options.operationTimeoutMs);
    console.log(`[automator-smoke] pageStack=${stack.map((item) => item.path).join(' > ')}`);
    console.log('[automator-smoke] ok');
    completed = true;
  } finally {
    if (miniProgram && options.close && completed) {
      await withTimeout('close WeChat DevTools', miniProgram.close(), 5000).catch(() => {
        miniProgram.disconnect();
      });
      console.log('[automator-smoke] closed WeChat DevTools');
    } else if (miniProgram) {
      miniProgram.disconnect();
      console.log('[automator-smoke] disconnected; WeChat DevTools left open');
    }

    if (cliState && !cliState.isExited()) {
      stopDevToolsAuto(cliState);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[automator-smoke] failed: ${error.message}`);
    process.exit(1);
  });
