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
const DEFAULT_ARTIFACT_DIR = path.join(os.tmpdir(), `mini-runtime-suite-${formatStamp(new Date())}`);

const DEFAULT_CASES = [
  { name: 'profile', page: '/pages/profile/profile', selector: '.profile-page', tap: false, waitAfterTapMs: 0 },
  { name: 'coin-page', page: '/pages/coin-toss/coin-toss', selector: '.coin-page', tap: false, waitAfterTapMs: 0 },
  { name: 'coin-lift-tap', page: '/pages/coin-toss/coin-toss', selector: '.coin-lift', tap: true, waitAfterTapMs: 2600 },
  { name: 'daily-fortune', page: '/pages/daily-fortune/daily-fortune', selector: '.daily-page', tap: false, waitAfterTapMs: 0 },
  { name: 'agreement', page: '/pages/agreement/agreement', selector: '.agreement-page', tap: false, waitAfterTapMs: 0 },
];

function formatStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function defaultProjectPath() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'project.config.json'))) return cwd;
  if (fs.existsSync(path.join(cwd, '..', 'project.config.json'))) return path.resolve(cwd, '..');
  return cwd;
}

function parseArgs(argv) {
  const options = {
    cliPath: process.env.WECHAT_DEVTOOLS_CLI || DEFAULT_CLI_PATH,
    projectPath: process.env.MINIPROGRAM_PROJECT_PATH || defaultProjectPath(),
    sdkRoot: process.env.MINIPROGRAM_AUTOMATOR_SDK_ROOT || '',
    idePort: process.env.WECHAT_DEVTOOLS_IDE_PORT || process.env.MINIPROGRAM_IDE_PORT || '',
    port: Number(process.env.MINIPROGRAM_AUTOMATOR_PORT || 19570),
    timeout: Number(process.env.MINIPROGRAM_AUTOMATOR_TIMEOUT || 150000),
    operationTimeoutMs: Number(process.env.MINIPROGRAM_AUTOMATOR_OPERATION_TIMEOUT || 45000),
    waitAfterRouteMs: 1800,
    compileShortcut: true,
    compileShortcutDelayMs: 16000,
    compileShortcutAttempts: Number(process.env.MINIPROGRAM_COMPILE_SHORTCUT_ATTEMPTS || 3),
    requireCompileLogEvidence: process.env.MINIPROGRAM_REQUIRE_COMPILE_LOG_EVIDENCE === '1',
    trustProject: true,
    closeDevTools: false,
    artifactDir: DEFAULT_ARTIFACT_DIR,
    cases: [],
    captureConsole: true,
    captureException: true,
    failOnException: false,
    failOnConsoleTypes: [],
    requireLogPatterns: [],
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
    } else if (arg === '--no-trust-project') {
      options.trustProject = false;
    } else if (arg === '--close-devtools') {
      options.closeDevTools = true;
    } else if (arg === '--keep-open') {
      options.closeDevTools = false;
    } else if (arg === '--artifact-dir') {
      options.artifactDir = requireValue(arg, next);
      i += 1;
    } else if (arg === '--case') {
      options.cases.push(parseCase(requireValue(arg, next)));
      i += 1;
    } else if (arg === '--no-default-cases') {
      options.cases = [];
      options.noDefaultCases = true;
    } else if (arg === '--no-capture-console') {
      options.captureConsole = false;
    } else if (arg === '--no-capture-exception') {
      options.captureException = false;
    } else if (arg === '--fail-on-exception') {
      options.failOnException = true;
    } else if (arg === '--fail-on-console') {
      options.failOnConsoleTypes = requireValue(arg, next).split(',').map((item) => item.trim()).filter(Boolean);
      i += 1;
    } else if (arg === '--require-log') {
      options.requireLogPatterns.push(requireValue(arg, next));
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.noDefaultCases && options.cases.length === 0) {
    options.cases = DEFAULT_CASES;
  }

  validateNumber(options.port, '--port');
  validateNumber(options.timeout, '--timeout');
  validateNumber(options.operationTimeoutMs, '--operation-timeout');
  validateNumber(options.waitAfterRouteMs, '--wait-after-route');
  validateNumber(options.compileShortcutDelayMs, '--compile-shortcut-delay');
  validateNumber(options.compileShortcutAttempts, '--compile-shortcut-attempts');
  if (options.compileShortcutAttempts < 1) {
    throw new Error('--compile-shortcut-attempts must be a positive number');
  }
  if (options.idePort !== '' && !Number.isFinite(Number(options.idePort))) {
    throw new Error('--ide-port must be a number');
  }
  if (options.cases.length === 0) {
    throw new Error('No cases to run. Use --case or omit --no-default-cases.');
  }

  return options;
}

function parseCase(value) {
  const parts = value.split('|');
  if (parts.length < 3) {
    throw new Error('--case must be formatted as name|/pages/path|selector[|tap|waitAfterTapMs]');
  }
  const [name, page, selector, tapValue = 'no-tap', waitAfterTapValue = '1200'] = parts;
  if (!name || !page || !selector) {
    throw new Error('--case requires name, page, and selector');
  }
  const tap = tapValue === 'tap' || tapValue === 'true' || tapValue === '1';
  const waitAfterTapMs = Number(waitAfterTapValue);
  if (!Number.isFinite(waitAfterTapMs)) {
    throw new Error('--case waitAfterTapMs must be a number');
  }
  return { name, page, selector, tap, waitAfterTapMs: tap ? waitAfterTapMs : 0 };
}

function requireValue(arg, value) {
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function validateNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number`);
}

function printHelp() {
  console.log(`用法：
  node <mini-runtime-skill-dir>/scripts/mini-runtime-suite.mjs [options]
  node <mini-runtime-skill-dir>/scripts/mini-runtime-suite.mjs --project-path <mini-project-root> [options]

作用：
  在一个复用的 WeChat DevTools automator 会话里连续跑多个小程序运行时 case，
  输出截图、summary.json、console.jsonl 和 exception.jsonl。

项目定位：
  从目标 mini 项目根或 miniprogram 目录运行时会自动识别 project.config.json；
  当前 cwd 不在项目内时传 --project-path。目标项目不需要包含 .agents/scripts。

参数：
  --cli-path <path>           WeChat DevTools CLI 路径
  --project-path <path>       WeChat DevTools 项目根目录
  --sdk-root <path>           解析 miniprogram-automator 的目录
  --ide-port <number>         已打开 DevTools 的 service port
  --port <number>             automator websocket port，默认 19570
  --timeout <ms>              启动/连接总超时，默认 150000
  --operation-timeout <ms>    单个操作超时，默认 45000
  --wait-after-route <ms>     每次 relaunch 后等待时间，默认 1800
  --compile-shortcut-delay <ms>
                              Cmd+B 编译快捷键后的等待时间，默认 16000
  --compile-shortcut-attempts <n>
                              Cmd+B 编译 readiness 最大重试次数，默认 3
  --require-compile-log-evidence
                              除 runtime readiness 外，还强制要求弱 compile 日志证据
  --no-compile-shortcut       连接 automator 后不触发 Cmd+B
  --artifact-dir <dir>        产物目录，默认 /tmp/mini-runtime-suite-<timestamp>
  --case <spec>               增加 case：name|/pages/path|selector[|tap|waitAfterTapMs]
  --no-default-cases          只运行 --case 指定的 case
  --no-capture-console        不写 console.jsonl
  --no-capture-exception      不写 exception.jsonl
  --fail-on-exception         捕获到 exception 时以失败退出
  --fail-on-console <types>   捕获到指定 console 类型时失败，例如 error,warn
  --require-log <regex>       要求 console 日志命中指定正则
  --close-devtools            成功后关闭 DevTools
  --keep-open                 保持 DevTools 打开，默认行为
  --no-trust-project          不向 DevTools 传 --trust-project
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(label, promise, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
    }),
  ]);
}

async function writeJsonl(filePath, value) {
  await fsPromises.appendFile(filePath, `${JSON.stringify({ ts: new Date().toISOString(), ...value })}\n`);
}

function startDevToolsAuto(options) {
  const args = [
    'auto',
    '--project',
    options.projectPath,
    '--auto-port',
    String(options.port),
  ];

  if (options.trustProject) args.push('--trust-project');
  if (options.idePort !== '') args.push('--port', String(options.idePort));

  const logs = [];
  let exitCode = null;
  const cliProcess = childProcess.spawn(options.cliPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let exited = false;
  cliProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stdout.write(`[mini-runtime-suite][cli] ${text}`);
  });
  cliProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stderr.write(`[mini-runtime-suite][cli] ${text}`);
  });
  cliProcess.on('exit', (code, signal) => {
    exited = true;
    exitCode = code;
    logs.push(`[cli exit code=${code} signal=${signal}]\n`);
  });

  return {
    process: cliProcess,
    logs,
    isExited: () => exited,
    exitCode: () => exitCode,
  };
}

function stopDevToolsAuto(cliState) {
  if (!cliState || cliState.isExited()) return;
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
      if (cliState.isExited() && cliState.exitCode() !== 0) break;
      await sleep(1000);
    }
  }

  const cliLogs = cliState.logs.join('').trim();
  const suffix = cliLogs ? `\n\nWeChat DevTools CLI output:\n${cliLogs}` : '';
  throw new Error(`Failed to connect to ${wsEndpoint} within ${options.timeout} ms. Last error: ${lastError?.message || 'unknown'}${suffix}`);
}

async function getPngInfo(filePath) {
  const stat = await fsPromises.stat(filePath);
  const fd = await fsPromises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(24);
    await fd.read(header, 0, 24, 0);
    const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return {
      bytes: stat.size,
      isPng,
      width: isPng ? header.readUInt32BE(16) : 0,
      height: isPng ? header.readUInt32BE(20) : 0,
    };
  } finally {
    await fd.close();
  }
}

function consoleText(row) {
  const args = row.msg?.args || [];
  return args.map((arg) => {
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

async function summarizeLogs(options, consolePath, exceptionPath) {
  const consoleLines = options.captureConsole
    ? (await fsPromises.readFile(consolePath, 'utf8')).trim().split('\n').filter(Boolean)
    : [];
  const exceptionLines = options.captureException
    ? (await fsPromises.readFile(exceptionPath, 'utf8')).trim().split('\n').filter(Boolean)
    : [];
  const consoleRows = consoleLines.map((line) => JSON.parse(line));
  const consoleCounts = {};
  for (const row of consoleRows) {
    const type = row.msg?.type || 'unknown';
    consoleCounts[type] = (consoleCounts[type] || 0) + 1;
  }

  const requiredLogResults = options.requireLogPatterns.map((pattern) => {
    const regex = new RegExp(pattern);
    return {
      pattern,
      matched: consoleRows.some((row) => regex.test(consoleText(row))),
    };
  });

  return {
    consoleLines: consoleRows.length,
    consoleCounts,
    exceptionLines: exceptionLines.length,
    requiredLogResults,
  };
}

async function runCase(miniProgram, options, item) {
  const screenshot = path.join(options.artifactDir, `${item.name}.png`);
  console.log(`[mini-runtime-suite] relaunch ${item.page}`);
  const page = await withTimeout(`reLaunch ${item.page}`, miniProgram.reLaunch(item.page), options.operationTimeoutMs);
  if (!page) throw new Error(`Failed to relaunch ${item.page}`);

  await page.waitFor(options.waitAfterRouteMs);
  await withTimeout(`waitFor ${item.selector}`, page.waitFor(item.selector), options.operationTimeoutMs);
  const element = await withTimeout(`query ${item.selector}`, page.$(item.selector), options.operationTimeoutMs);
  if (!element) throw new Error(`Element not found: ${item.selector}`);

  const beforeClass = await withTimeout('read element class', element.attribute('class'), options.operationTimeoutMs).catch(() => '');
  console.log(`[mini-runtime-suite] selector found ${item.selector} class="${beforeClass}"`);

  if (item.tap) {
    await withTimeout(`tap ${item.selector}`, element.tap(), options.operationTimeoutMs);
    await page.waitFor(item.waitAfterTapMs || 1200);
    console.log(`[mini-runtime-suite] tap ok ${item.selector}`);
  }

  await withTimeout(`screenshot ${item.name}`, miniProgram.screenshot({ path: screenshot }), options.operationTimeoutMs);
  const pageStack = await withTimeout('pageStack', miniProgram.pageStack(), options.operationTimeoutMs);
  const pageStackText = pageStack.map((entry) => entry.path).join(' > ');
  const png = await getPngInfo(screenshot);
  console.log(`[mini-runtime-suite] screenshot=${screenshot}`);
  console.log(`[mini-runtime-suite] pageStack=${pageStackText}`);

  return {
    name: item.name,
    page: item.page,
    selector: item.selector,
    tap: item.tap,
    waitAfterTapMs: item.waitAfterTapMs,
    class: beforeClass,
    screenshot,
    png,
    pageStack: pageStackText,
    ok: Boolean(png.isPng && png.bytes > 0),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const automator = loadAutomator(options);
  const artifactDir = path.resolve(options.artifactDir);
  options.artifactDir = artifactDir;
  const consolePath = path.join(artifactDir, 'console.jsonl');
  const exceptionPath = path.join(artifactDir, 'exception.jsonl');
  const summaryPath = path.join(artifactDir, 'summary.json');
  const cliOutputPath = path.join(artifactDir, 'cli-output.log');
  let miniProgram;
  let cliState;
  let completed = false;

  await fsPromises.mkdir(artifactDir, { recursive: true });
  if (options.captureConsole) await fsPromises.writeFile(consolePath, '');
  if (options.captureException) await fsPromises.writeFile(exceptionPath, '');

  console.log(`[mini-runtime-suite] artifactDir=${artifactDir}`);
  console.log(`[mini-runtime-suite] projectPath=${options.projectPath}`);
  console.log(`[mini-runtime-suite] autoPort=${options.port}`);
  if (options.idePort !== '') console.log(`[mini-runtime-suite] idePort=${options.idePort}`);

  try {
    cliState = startDevToolsAuto(options);
    miniProgram = await connectWithRetry(automator, options, cliState);
    console.log('[mini-runtime-suite] connected automator websocket');

    if (options.captureConsole) {
      miniProgram.on('console', (msg) => {
        writeJsonl(consolePath, { type: 'console', msg }).catch(() => {});
      });
    }
    if (options.captureException) {
      miniProgram.on('exception', (error) => {
        writeJsonl(exceptionPath, { type: 'exception', error }).catch(() => {});
      });
    }

    await sleep(5000);
    if (options.compileShortcut) {
      const compileReady = await ensureCompileReady({
        miniProgram,
        cliState,
        delayMs: options.compileShortcutDelayMs,
        operationTimeoutMs: options.operationTimeoutMs,
        maxAttempts: options.compileShortcutAttempts,
        requireCompileLogEvidence: options.requireCompileLogEvidence,
        logPrefix: 'mini-runtime-suite',
        log: (line) => console.log(line),
      });
      console.log(`[mini-runtime-suite] compileReady ${summarizeCompileReady(compileReady)}`);
      if (!compileReady.ok) {
        throw new Error(compileReadyFailureMessage(compileReady));
      }
    }

    const systemInfo = await withTimeout('systemInfo', miniProgram.systemInfo(), options.operationTimeoutMs);
    console.log(`[mini-runtime-suite] system=${systemInfo.platform || 'unknown'} sdk=${systemInfo.SDKVersion || 'unknown'}`);

    const results = [];
    for (const item of options.cases) {
      results.push(await runCase(miniProgram, options, item));
    }

    const logSummary = await summarizeLogs(options, consolePath, exceptionPath);
    const failures = [];
    for (const result of results) {
      if (!result.ok) failures.push(`case ${result.name} did not produce a valid PNG`);
    }
    if (options.failOnException && logSummary.exceptionLines > 0) {
      failures.push(`captured ${logSummary.exceptionLines} exception line(s)`);
    }
    for (const type of options.failOnConsoleTypes) {
      const count = logSummary.consoleCounts[type] || 0;
      if (count > 0) failures.push(`captured ${count} console ${type} line(s)`);
    }
    for (const required of logSummary.requiredLogResults) {
      if (!required.matched) failures.push(`required log not found: ${required.pattern}`);
    }

    const summary = {
      artifactDir,
      projectPath: options.projectPath,
      autoPort: options.port,
      idePort: options.idePort,
      system: {
        platform: systemInfo.platform || 'unknown',
        SDKVersion: systemInfo.SDKVersion || 'unknown',
      },
      cases: results,
      artifacts: {
        consoleJsonl: options.captureConsole ? consolePath : '',
        exceptionJsonl: options.captureException ? exceptionPath : '',
        summaryJson: summaryPath,
        cliOutputLog: cliOutputPath,
      },
      logs: logSummary,
      failures,
      ok: failures.length === 0,
    };

    await fsPromises.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    await fsPromises.writeFile(cliOutputPath, cliState.logs.join(''));
    console.log(`[mini-runtime-suite] summary=${summaryPath}`);
    if (failures.length) {
      throw new Error(failures.join('; '));
    }
    console.log('[mini-runtime-suite] ok');
    completed = true;
  } finally {
    if (miniProgram && options.closeDevTools && completed) {
      await withTimeout('close WeChat DevTools', miniProgram.close(), 5000).catch(() => {
        miniProgram.disconnect();
      });
      console.log('[mini-runtime-suite] closed WeChat DevTools');
    } else if (miniProgram) {
      miniProgram.disconnect();
      console.log('[mini-runtime-suite] disconnected; DevTools left open');
    }
    if (cliState && !cliState.isExited()) stopDevToolsAuto(cliState);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[mini-runtime-suite] failed: ${error.message}`);
    process.exit(1);
  });
