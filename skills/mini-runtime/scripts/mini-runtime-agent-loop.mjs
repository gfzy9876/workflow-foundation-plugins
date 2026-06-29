#!/usr/bin/env node
import { createRequire } from 'node:module';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {
  compileReadyFailureMessage,
  ensureCompileReady,
  summarizeCompileReady,
} from './compile-ready.mjs';

const DEFAULT_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const DEFAULT_ARTIFACT_DIR = path.join(os.tmpdir(), `mini-runtime-agent-loop-${formatStamp(new Date())}`);
const DEFAULT_ALLOWED_OPS = [
  'routeMap',
  'reLaunch',
  'wait',
  'waitText',
  'tap',
  'tapText',
  'input',
  'confirmModal',
  'back',
  'screenshot',
  'pageStack',
  'currentPage',
  'readData',
  'readStorage',
  'assertStorage',
  'assertPageStack',
  'sleep',
  'compileShortcut',
  'status',
  'finalize',
];

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes('Connection closed, check if wechat web devTools is still running')) {
    process.stderr.write(`[mini-runtime-agent-loop] ignored late automator rejection: ${message}\n`);
    return;
  }
  process.stderr.write(`[mini-runtime-agent-loop] unhandled rejection: ${message}\n`);
  process.exitCode = 1;
});

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
    port: Number(process.env.MINIPROGRAM_AUTOMATOR_PORT || 19590),
    timeout: Number(process.env.MINIPROGRAM_AUTOMATOR_TIMEOUT || 150000),
    operationTimeoutMs: Number(process.env.MINIPROGRAM_AUTOMATOR_OPERATION_TIMEOUT || 45000),
    compileShortcut: true,
    compileShortcutDelayMs: 16000,
    compileShortcutAttempts: Number(process.env.MINIPROGRAM_COMPILE_SHORTCUT_ATTEMPTS || 3),
    requireCompileLogEvidence: process.env.MINIPROGRAM_REQUIRE_COMPILE_LOG_EVIDENCE === '1',
    trustProject: true,
    closeDevTools: false,
    artifactDir: DEFAULT_ARTIFACT_DIR,
    goal: '',
    strategy: 'business-flow',
    maxAutoAdjustments: 2,
    captureConsole: true,
    captureException: true,
    recipePath: '',
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
    } else if (arg === '--goal') {
      options.goal = requireValue(arg, next);
      i += 1;
    } else if (arg === '--strategy') {
      options.strategy = requireValue(arg, next);
      i += 1;
    } else if (arg === '--max-auto-adjustments') {
      options.maxAutoAdjustments = Number(requireValue(arg, next));
      i += 1;
    } else if (arg === '--recipe') {
      options.recipePath = requireValue(arg, next);
      i += 1;
    } else if (arg === '--no-capture-console') {
      options.captureConsole = false;
    } else if (arg === '--no-capture-exception') {
      options.captureException = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  validateNumber(options.port, '--port');
  validateNumber(options.timeout, '--timeout');
  validateNumber(options.operationTimeoutMs, '--operation-timeout');
  validateNumber(options.compileShortcutDelayMs, '--compile-shortcut-delay');
  validateNumber(options.compileShortcutAttempts, '--compile-shortcut-attempts');
  if (options.compileShortcutAttempts < 1) {
    throw new Error('--compile-shortcut-attempts must be a positive number');
  }
  validateNumber(options.maxAutoAdjustments, '--max-auto-adjustments');
  if (options.idePort !== '' && !Number.isFinite(Number(options.idePort))) {
    throw new Error('--ide-port must be a number');
  }
  if (!['business-flow', 'smoke', 'matrix'].includes(options.strategy)) {
    throw new Error('--strategy must be business-flow, smoke, or matrix');
  }

  return options;
}

function requireValue(arg, value) {
  if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
  return value;
}

function validateNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number`);
}

function printHelp() {
  console.log(`用法：
  node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs --goal '<验收目标>' [options]
  node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs --project-path <mini-project-root> --goal '<验收目标>' [options]

作用：
  启动一个持续连接 WeChat DevTools 的 agent-loop workflow。
  Agent 通过 stdin 逐行发送 JSON op，CLI 执行通用原语、写 run-trace.jsonl，并逐行返回 JSON 结果。

项目定位：
  从目标 mini 项目根或 miniprogram 目录运行时会自动识别 project.config.json；
  当前 cwd 不在项目内时传 --project-path。目标项目不需要包含 .agents/scripts。

示例：
  node <mini-runtime-skill-dir>/scripts/mini-runtime-agent-loop.mjs \\
    --goal '验收掷硬币 runtime flow' \\
    --strategy business-flow \\
    --project-path <mini-project-root> \\
    --ide-port 29230 \\
    --port 19593 \\
    --artifact-dir /tmp/mini-runtime-agent-loop-coin

stdin JSONL 示例：
  {"op":"routeMap","text":"index -> lobby -> coin -> back"}
  {"op":"reLaunch","page":"/pages/index/index","intent":"打开真实来源页"}
  {"op":"wait","selector":"lobby >> .menu-btn.fortune"}
  {"op":"tap","selector":"lobby >> .menu-btn.fortune"}
  {"op":"input","selector":"treehole-overlay >> .input","value":"我想抽一场塔罗"}
  {"op":"tapText","selector":"fortune-param-popup >> .chip","contains":"健康"}
  {"op":"confirmModal"}
  {"op":"readStorage","keyPattern":"^chat_avatar_history_","parseJson":true}
  {"op":"assertStorage","key":"chat_avatar_history_xxx","path":"[].text","contains":"刚才的牌"}
  {"op":"compileShortcut","delayMs":16000}
  {"op":"screenshot","name":"source-ready"}
  {"op":"finalize"}

可用 op：
  routeMap, reLaunch, wait, waitText, tap, tapText, input, confirmModal,
  back, screenshot, pageStack, currentPage, readData, readStorage,
  assertStorage, assertPageStack, sleep, compileShortcut, status, finalize

常用参数：
  --cli-path <path>              WeChat DevTools CLI 路径
  --project-path <path>          WeChat DevTools 项目根目录
  --sdk-root <path>              解析 miniprogram-automator 的目录
  --ide-port <number>            已打开 DevTools 的 service port
  --port <number>                automator websocket port，默认 19590
  --timeout <ms>                 启动/连接总超时，默认 150000
  --operation-timeout <ms>       单步操作超时，默认 45000
  --compile-shortcut-delay <ms>  Cmd+B 编译后等待时间，默认 16000
  --compile-shortcut-attempts <n> Cmd+B 编译 readiness 最大重试次数，默认 3
  --require-compile-log-evidence
                                 除 runtime readiness 外，还强制要求弱 compile 日志证据
  --no-compile-shortcut          连接后不触发 Cmd+B
  --artifact-dir <dir>           产物目录，默认 /tmp/mini-runtime-agent-loop-<timestamp>
  --goal <text>                  本次验收目标
  --strategy <type>              business-flow / smoke / matrix，默认 business-flow
  --max-auto-adjustments <n>     agent 自动调整次数预算，默认 2
  --recipe <path>                运行 JSON/JSONL recipe 后自动 finalize
  --close-devtools               finalize 后关闭 DevTools
  --keep-open                    保持 DevTools 打开，默认
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

async function writeJsonl(filePath, value) {
  await fsPromises.appendFile(filePath, `${JSON.stringify({ ts: new Date().toISOString(), ...value })}\n`);
}

function emit(value) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...value })}\n`);
}

function startDevToolsAuto(options) {
  const args = ['auto', '--project', options.projectPath, '--auto-port', String(options.port)];
  if (options.trustProject) args.push('--trust-project');
  if (options.idePort !== '') args.push('--port', String(options.idePort));

  const logs = [];
  let exitCode = null;
  const cliProcess = childProcess.spawn(options.cliPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let exited = false;
  cliProcess.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  cliProcess.stderr.on('data', (chunk) => logs.push(chunk.toString()));
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

function normalizeOp(op) {
  const value = String(op || '').trim();
  if (value === 'launch' || value === 'relaunch') return 'reLaunch';
  if (value === 'wait-text' || value === 'waitByText') return 'waitText';
  if (value === 'tap-text' || value === 'tapByText' || value === 'selectByText') return 'tapText';
  if (value === 'inputText' || value === 'type') return 'input';
  if (value === 'confirm' || value === 'nativeConfirm' || value === 'native-confirm') return 'confirmModal';
  if (value === 'assert-page-stack') return 'assertPageStack';
  if (value === 'read-storage') return 'readStorage';
  if (value === 'assert-storage') return 'assertStorage';
  if (value === 'route-map') return 'routeMap';
  if (value === 'current-page') return 'currentPage';
  if (value === 'read-data') return 'readData';
  if (value === 'page-stack') return 'pageStack';
  return value;
}

function ensureLeadingSlash(value) {
  const text = String(value || '');
  return text.startsWith('/') ? text : `/${text}`;
}

function stackToText(pageStack) {
  return pageStack.map((entry) => ensureLeadingSlash(entry.path)).join(' > ');
}

function sanitizeName(value) {
  return String(value || 'screenshot')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'screenshot';
}

function shouldAutoScreenshot(op) {
  return !['screenshot', 'routeMap', 'sleep', 'finalize', 'status', 'readStorage', 'assertStorage'].includes(op);
}

async function currentPage(miniProgram, timeoutMs) {
  const page = await withTimeout('currentPage', miniProgram.currentPage(), timeoutMs);
  if (!page) throw new Error('No current page');
  return page;
}

async function resolveSelector(page, selector) {
  const parts = String(selector || '').split('>>').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error('selector is required');
  let scope = page;
  let element = null;
  for (const part of parts) {
    element = await scope.$(part);
    if (!element) return null;
    scope = element;
  }
  return element;
}

async function resolveAll(page, selector) {
  const parts = String(selector || '').split('>>').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error('selector is required');
  let scope = page;
  for (let i = 0; i < parts.length - 1; i += 1) {
    scope = await scope.$(parts[i]);
    if (!scope) return [];
  }
  return await scope.$$(parts[parts.length - 1]);
}

async function waitForSelector(miniProgram, selector, timeoutMs, pollMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastPagePath = '';
  while (Date.now() < deadline) {
    const page = await currentPage(miniProgram, timeoutMs);
    lastPagePath = ensureLeadingSlash(page.path);
    const element = await resolveSelector(page, selector);
    if (element) return { page, element, pagePath: lastPagePath };
    await sleep(pollMs);
  }
  throw new Error(`selector not found within ${timeoutMs} ms: ${selector}; lastPage=${lastPagePath}`);
}

function buildTextMatcher(command) {
  if (command.regex !== undefined) {
    const pattern = String(command.regex);
    const flags = String(command.flags || '');
    const regex = new RegExp(pattern, flags);
    return {
      label: `regex:${regex}`,
      matches: (value) => regex.test(String(value || '')),
    };
  }
  if (command.contains !== undefined) {
    const expected = String(command.contains);
    return {
      label: `contains:${expected}`,
      matches: (value) => String(value || '').includes(expected),
    };
  }
  if (command.text !== undefined) {
    const expected = String(command.text);
    const exact = command.exact === true;
    return {
      label: exact ? `text:${expected}` : `contains:${expected}`,
      matches: (value) => exact ? String(value || '') === expected : String(value || '').includes(expected),
    };
  }
  throw new Error('text match requires one of text, contains, or regex');
}

async function findElementByText(miniProgram, command, timeoutMs, pollMs = 500) {
  if (!command.selector) throw new Error(`${command.op} requires selector`);
  const matcher = buildTextMatcher(command);
  const deadline = Date.now() + timeoutMs;
  let lastPagePath = '';
  let lastSample = [];
  while (Date.now() < deadline) {
    const page = await currentPage(miniProgram, timeoutMs);
    lastPagePath = ensureLeadingSlash(page.path);
    const elements = await resolveAll(page, command.selector);
    const texts = [];
    for (let i = 0; i < elements.length; i += 1) {
      const text = await withTimeout(`read text ${command.selector}[${i}]`, elements[i].text(), timeoutMs).catch(() => '');
      texts.push(text);
      if (matcher.matches(text)) {
        return {
          page,
          pagePath: lastPagePath,
          element: elements[i],
          index: i,
          text,
          count: elements.length,
          matcher: matcher.label,
          sampleTexts: texts.slice(0, 8),
        };
      }
    }
    lastSample = texts.slice(0, 8);
    await sleep(pollMs);
  }
  throw new Error(`text match not found within ${timeoutMs} ms: selector=${command.selector}; matcher=${matcher.label}; lastPage=${lastPagePath}; sample=${JSON.stringify(lastSample)}`);
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stableStringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function previewValue(value, maxChars = 2000) {
  const text = stableStringify(value);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...<truncated ${text.length - maxChars} chars>` : text;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tokenizePath(pathValue) {
  const pathText = String(pathValue || '').trim();
  if (!pathText) return [];
  const tokens = [];
  const regex = /([^.[\]]+)|\[(\d+|\*|)\]/g;
  let match;
  while ((match = regex.exec(pathText))) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[2] === '' || match[2] === '*') {
      tokens.push('*');
    } else {
      tokens.push(Number(match[2]));
    }
  }
  return tokens;
}

function valuesAtPath(value, pathValue) {
  const tokens = tokenizePath(pathValue);
  let values = [value];
  for (const token of tokens) {
    const next = [];
    for (const item of values) {
      if (token === '*') {
        if (Array.isArray(item)) next.push(...item);
      } else if (typeof token === 'number') {
        if (Array.isArray(item) && token < item.length) next.push(item[token]);
      } else if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, token)) {
        next.push(item[token]);
      }
    }
    values = next;
  }
  return values;
}

function matchAssertionValue(value, command) {
  const assertions = [];
  if (command.type !== undefined) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    const ok = actualType === command.type;
    assertions.push({ name: 'type', expected: command.type, actual: actualType, ok });
  }
  if (command.equals !== undefined) {
    assertions.push({ name: 'equals', expected: command.equals, ok: deepEqual(value, command.equals) });
  }
  if (command.contains !== undefined || command.includes !== undefined) {
    const expected = String(command.contains ?? command.includes);
    const actual = stableStringify(value);
    assertions.push({ name: 'contains', expected, ok: actual.includes(expected) });
  }
  if (command.regex !== undefined) {
    const regex = new RegExp(String(command.regex), String(command.flags || ''));
    assertions.push({ name: 'regex', expected: String(regex), ok: regex.test(stableStringify(value)) });
  }
  if (command.lengthAtLeast !== undefined) {
    const expected = Number(command.lengthAtLeast);
    validateNumber(expected, 'lengthAtLeast');
    const actual = typeof value === 'string' || Array.isArray(value) ? value.length : 0;
    assertions.push({ name: 'lengthAtLeast', expected, actual, ok: actual >= expected });
  }
  return assertions;
}

async function summarizeLogs(consolePath, exceptionPath, options) {
  const consoleLines = options.captureConsole && fs.existsSync(consolePath)
    ? (await fsPromises.readFile(consolePath, 'utf8')).trim().split('\n').filter(Boolean)
    : [];
  const exceptionLines = options.captureException && fs.existsSync(exceptionPath)
    ? (await fsPromises.readFile(exceptionPath, 'utf8')).trim().split('\n').filter(Boolean)
    : [];
  const consoleRows = consoleLines.map((line) => JSON.parse(line));
  const consoleCounts = {};
  const problemConsole = [];
  for (const row of consoleRows) {
    const type = row.msg?.type || 'unknown';
    consoleCounts[type] = (consoleCounts[type] || 0) + 1;
    if (type === 'warn' || type === 'error') {
      problemConsole.push({ type, text: consoleText(row).slice(0, 500) });
    }
  }
  return {
    consoleLines: consoleRows.length,
    consoleCounts,
    exceptionLines: exceptionLines.length,
    problemConsole,
  };
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

class AgentLoopSession {
  constructor(options, miniProgram, paths, cliState) {
    this.options = options;
    this.miniProgram = miniProgram;
    this.paths = paths;
    this.cliState = cliState;
    this.step = 0;
    this.initialLaunchDone = false;
    this.autoAdjustmentsUsed = 0;
    this.failures = [];
    this.completed = false;
  }

  async handleCommand(rawCommand) {
    const command = { ...rawCommand, op: normalizeOp(rawCommand.op) };
    const startedAt = new Date().toISOString();
    this.step += 1;
    const step = this.step;
    let response;

    try {
      this.validateCommand(command);
      const result = await this.execute(command, step);
      response = {
        event: 'op-result',
        step,
        ok: true,
        op: command.op,
        result,
      };
    } catch (error) {
      const failure = {
        step,
        op: command.op || '',
        message: error.message,
      };
      if (shouldAutoScreenshot(command.op)) {
        try {
          const screenshot = await this.captureScreenshot(`failed-step-${step}`);
          failure.screenshot = screenshot.path;
        } catch {
          // Best effort only.
        }
      }
      this.failures.push(failure);
      response = {
        event: 'op-result',
        step,
        ok: false,
        op: command.op,
        error: error.message,
        failure,
        next: 'agent_decide',
      };
    }

    await writeJsonl(this.paths.tracePath, {
      step,
      startedAt,
      command: redactCommand(command),
      response,
    });
    return response;
  }

  validateCommand(command) {
    if (!DEFAULT_ALLOWED_OPS.includes(command.op)) {
      throw new Error(`Unsupported op: ${command.op}`);
    }
    if (this.options.strategy === 'business-flow' && command.op === 'reLaunch' && this.initialLaunchDone) {
      throw new Error('Guard violation: business-flow only allows reLaunch for the initial entry. Use tap/back/real UI path, or explicitly run an isolated smoke check.');
    }
    if (command.adjustmentReason) {
      this.autoAdjustmentsUsed += 1;
      if (this.autoAdjustmentsUsed > this.options.maxAutoAdjustments) {
        throw new Error(`Guard violation: max auto adjustments exceeded (${this.options.maxAutoAdjustments})`);
      }
    }
  }

  async execute(command, step) {
    if (command.op === 'routeMap') return await this.writeRouteMap(command);
    if (command.op === 'reLaunch') return await this.opReLaunch(command);
    if (command.op === 'wait') return await this.opWait(command);
    if (command.op === 'waitText') return await this.opWaitText(command);
    if (command.op === 'tap') return await this.opTap(command);
    if (command.op === 'tapText') return await this.opTapText(command);
    if (command.op === 'input') return await this.opInput(command);
    if (command.op === 'confirmModal') return await this.opConfirmModal(command);
    if (command.op === 'back') return await this.opBack(command);
    if (command.op === 'screenshot') return await this.captureScreenshot(command.name || `step-${step}`);
    if (command.op === 'pageStack') return await this.opPageStack();
    if (command.op === 'currentPage') return await this.opCurrentPage();
    if (command.op === 'readData') return await this.opReadData(command);
    if (command.op === 'readStorage') return await this.opReadStorage(command);
    if (command.op === 'assertStorage') return await this.opAssertStorage(command);
    if (command.op === 'assertPageStack') return await this.opAssertPageStack(command);
    if (command.op === 'sleep') return await this.opSleep(command);
    if (command.op === 'compileShortcut') return await this.opCompileShortcut(command);
    if (command.op === 'status') return await this.status();
    if (command.op === 'finalize') return await this.finalize(command);
    throw new Error(`Unsupported op: ${command.op}`);
  }

  async writeRouteMap(command) {
    if (command.path) {
      const source = path.resolve(command.path);
      const ext = path.extname(source) || '.txt';
      const target = path.join(this.options.artifactDir, `route-map${ext}`);
      await fsPromises.copyFile(source, target);
      return { routeMap: target };
    }
    if (command.text) {
      const target = path.join(this.options.artifactDir, 'route-map.md');
      await fsPromises.writeFile(target, command.text);
      return { routeMap: target };
    }
    const target = path.join(this.options.artifactDir, 'route-map.json');
    await fsPromises.writeFile(target, JSON.stringify({
      goal: this.options.goal,
      generatedAt: new Date().toISOString(),
      value: command.value ?? command.routeMap ?? command,
    }, null, 2));
    return { routeMap: target };
  }

  async opReLaunch(command) {
    if (!command.page) throw new Error('reLaunch requires page');
    const page = await withTimeout(`reLaunch ${command.page}`, this.miniProgram.reLaunch(command.page), this.options.operationTimeoutMs);
    if (!page) throw new Error(`Failed to reLaunch ${command.page}`);
    this.initialLaunchDone = true;
    return {
      page: ensureLeadingSlash(page.path),
      pageStack: await this.pageStackResult(),
    };
  }

  async opWait(command) {
    if (!command.selector) throw new Error('wait requires selector');
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    const { element, pagePath } = await waitForSelector(this.miniProgram, command.selector, timeoutMs);
    const className = await withTimeout('read element class', element.attribute('class'), timeoutMs).catch(() => '');
    const text = command.includeText ? await withTimeout('read element text', element.text(), timeoutMs).catch(() => '') : '';
    return {
      selector: command.selector,
      page: pagePath,
      class: className,
      text,
      pageStack: await this.pageStackResult(),
    };
  }

  async opWaitText(command) {
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    const match = await findElementByText(this.miniProgram, command, timeoutMs);
    return {
      selector: command.selector,
      page: match.pagePath,
      index: match.index,
      count: match.count,
      matcher: match.matcher,
      text: match.text,
      sampleTexts: match.sampleTexts,
      pageStack: await this.pageStackResult(),
    };
  }

  async opTap(command) {
    if (!command.selector) throw new Error('tap requires selector');
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    const { element, pagePath } = await waitForSelector(this.miniProgram, command.selector, timeoutMs);
    await withTimeout(`tap ${command.selector}`, element.tap(), timeoutMs);
    const waitAfterMs = Number(command.waitAfterMs || 800);
    validateNumber(waitAfterMs, 'waitAfterMs');
    if (waitAfterMs > 0) await sleep(waitAfterMs);
    return {
      selector: command.selector,
      pageBeforeTap: pagePath,
      waitAfterMs,
      pageStack: await this.pageStackResult(),
    };
  }

  async opTapText(command) {
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    const match = await findElementByText(this.miniProgram, command, timeoutMs);
    await withTimeout(`tap text ${command.selector}`, match.element.tap(), timeoutMs);
    const waitAfterMs = Number(command.waitAfterMs || 800);
    validateNumber(waitAfterMs, 'waitAfterMs');
    if (waitAfterMs > 0) await sleep(waitAfterMs);
    return {
      selector: command.selector,
      pageBeforeTap: match.pagePath,
      index: match.index,
      count: match.count,
      matcher: match.matcher,
      text: match.text,
      waitAfterMs,
      pageStack: await this.pageStackResult(),
    };
  }

  async opInput(command) {
    if (!command.selector) throw new Error('input requires selector');
    if (command.value === undefined && command.text === undefined) {
      throw new Error('input requires value or text');
    }
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    const value = String(command.value ?? command.text);
    const { element, pagePath } = await waitForSelector(this.miniProgram, command.selector, timeoutMs);
    if (command.clearFirst) {
      await withTimeout(`clear ${command.selector}`, element.input(''), timeoutMs);
    }
    await withTimeout(`input ${command.selector}`, element.input(value), timeoutMs);
    const waitAfterMs = Number(command.waitAfterMs || 300);
    validateNumber(waitAfterMs, 'waitAfterMs');
    if (waitAfterMs > 0) await sleep(waitAfterMs);
    return {
      selector: command.selector,
      page: pagePath,
      valueLength: value.length,
      clearFirst: command.clearFirst === true,
      waitAfterMs,
      pageStack: await this.pageStackResult(),
    };
  }

  async opConfirmModal(command) {
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    await withTimeout('native confirm modal', this.miniProgram.native().confirmModal(), timeoutMs);
    const waitAfterMs = Number(command.waitAfterMs || 800);
    validateNumber(waitAfterMs, 'waitAfterMs');
    if (waitAfterMs > 0) await sleep(waitAfterMs);
    return {
      action: 'confirm',
      waitAfterMs,
      pageStack: await this.pageStackResult(),
    };
  }

  async opBack(command) {
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    await withTimeout('navigateBack', this.miniProgram.navigateBack(), timeoutMs);
    const waitAfterMs = Number(command.waitAfterMs || 1200);
    validateNumber(waitAfterMs, 'waitAfterMs');
    if (waitAfterMs > 0) await sleep(waitAfterMs);
    return {
      waitAfterMs,
      pageStack: await this.pageStackResult(),
    };
  }

  async captureScreenshot(name) {
    const fileName = `${sanitizeName(name)}.png`;
    const screenshot = path.join(this.options.artifactDir, fileName);
    await withTimeout(`screenshot ${name}`, this.miniProgram.screenshot({ path: screenshot }), this.options.operationTimeoutMs);
    const png = await getPngInfo(screenshot);
    return { path: screenshot, ...png };
  }

  async opPageStack() {
    return await this.pageStackResult();
  }

  async pageStackResult() {
    const pageStack = await withTimeout('pageStack', this.miniProgram.pageStack(), this.options.operationTimeoutMs);
    const raw = pageStack.map((entry) => entry.path);
    const normalized = raw.map(ensureLeadingSlash);
    return {
      raw,
      normalized,
      text: normalized.join(' > '),
    };
  }

  async opCurrentPage() {
    const page = await currentPage(this.miniProgram, this.options.operationTimeoutMs);
    return {
      path: ensureLeadingSlash(page.path),
      query: page.query || {},
    };
  }

  async opReadData(command) {
    const page = await currentPage(this.miniProgram, this.options.operationTimeoutMs);
    const data = await withTimeout(`readData ${command.path || ''}`, page.data(command.path || undefined), this.options.operationTimeoutMs);
    return {
      page: ensureLeadingSlash(page.path),
      path: command.path || '',
      data,
    };
  }

  async readStorageRows(command) {
    const timeoutMs = Number(command.timeoutMs || this.options.operationTimeoutMs);
    validateNumber(timeoutMs, 'timeoutMs');
    const info = await withTimeout('getStorageInfoSync', this.miniProgram.callWxMethod('getStorageInfoSync'), timeoutMs);
    const allKeys = Array.isArray(info?.keys) ? info.keys : [];
    let keys = [];
    if (command.key !== undefined) {
      keys = [String(command.key)];
    } else if (command.keyPattern !== undefined) {
      const regex = new RegExp(String(command.keyPattern), String(command.flags || ''));
      keys = allKeys.filter((key) => regex.test(key));
    } else if (command.keysOnly || command.keys === true) {
      keys = [];
    } else {
      throw new Error('readStorage/assertStorage requires key, keyPattern, or keysOnly');
    }

    const rows = [];
    if (!command.keysOnly && command.keys !== true) {
      for (const key of keys) {
        const raw = await withTimeout(`getStorageSync ${key}`, this.miniProgram.callWxMethod('getStorageSync', key), timeoutMs);
        const value = command.parseJson === false ? raw : parseMaybeJson(raw);
        rows.push({ key, value });
      }
    }
    return { allKeys, keys, rows };
  }

  async opReadStorage(command) {
    const { allKeys, keys, rows } = await this.readStorageRows(command);
    const maxValueChars = Number(command.maxValueChars || 2000);
    validateNumber(maxValueChars, 'maxValueChars');
    let artifactPath = '';
    if (rows.length && command.writeArtifact !== false) {
      const name = sanitizeName(command.name || command.key || command.keyPattern || 'storage');
      artifactPath = path.join(this.options.artifactDir, `${name}.storage.json`);
      await fsPromises.writeFile(artifactPath, JSON.stringify(rows, null, 2));
    }
    return {
      totalKeys: allKeys.length,
      matchedKeys: command.keysOnly || command.keys === true ? allKeys : keys,
      matchedCount: command.keysOnly || command.keys === true ? allKeys.length : keys.length,
      rows: rows.map((row) => ({
        key: row.key,
        type: Array.isArray(row.value) ? 'array' : typeof row.value,
        preview: previewValue(row.value, maxValueChars),
      })),
      artifactPath,
    };
  }

  async opAssertStorage(command) {
    const { allKeys, keys, rows } = await this.readStorageRows(command);
    const minMatches = command.minMatches === undefined ? undefined : Number(command.minMatches);
    if (minMatches !== undefined) validateNumber(minMatches, 'minMatches');
    const assertions = [];
    if (minMatches !== undefined) {
      assertions.push({ name: 'minMatches', expected: minMatches, actual: keys.length, ok: keys.length >= minMatches });
    }
    const pathValue = command.path || '';
    if (command.exists !== undefined && command.key !== undefined && !pathValue) {
      const exists = allKeys.includes(String(command.key));
      assertions.push({ name: 'exists', expected: Boolean(command.exists), actual: exists, ok: exists === Boolean(command.exists) });
    }
    if (command.exists !== undefined && command.key === undefined && !pathValue) {
      const exists = keys.length > 0;
      assertions.push({ name: 'exists', expected: Boolean(command.exists), actual: exists, ok: exists === Boolean(command.exists) });
    }

    const requireAll = command.all === true;
    const pathExistsChecks = [];
    const valueAssertions = [];
    for (const row of rows) {
      const values = pathValue ? valuesAtPath(row.value, pathValue) : [row.value];
      if (command.exists !== undefined && pathValue) {
        pathExistsChecks.push({
          key: row.key,
          expected: Boolean(command.exists),
          actual: values.length > 0,
          ok: (values.length > 0) === Boolean(command.exists),
        });
      }
      valueAssertions.push(...values.flatMap((value) => matchAssertionValue(value, command).map((assertion) => ({
        key: row.key,
        path: pathValue,
        valuePreview: previewValue(value, Number(command.maxValueChars || 500)),
        ...assertion,
      }))));
    }

    if (pathExistsChecks.length) {
      assertions.push({
        name: 'pathExists',
        path: pathValue,
        mode: requireAll ? 'all' : 'any',
        ok: requireAll ? pathExistsChecks.every((item) => item.ok) : pathExistsChecks.some((item) => item.ok),
        checked: pathExistsChecks.length,
        sample: pathExistsChecks.slice(0, 5),
      });
    }

    if (valueAssertions.length) {
      const grouped = new Map();
      for (const assertion of valueAssertions) {
        const list = grouped.get(assertion.name) || [];
        list.push(assertion);
        grouped.set(assertion.name, list);
      }
      for (const [name, list] of grouped.entries()) {
        assertions.push({
          path: pathValue,
          name,
          mode: requireAll ? 'all' : 'any',
          ok: requireAll ? list.every((item) => item.ok) : list.some((item) => item.ok),
          checked: list.length,
          sample: list.slice(0, 5),
        });
      }
    }
    if (!assertions.length) {
      throw new Error('assertStorage requires at least one assertion: exists, minMatches, equals, contains/includes, regex, type, or lengthAtLeast');
    }
    const failed = assertions.filter((assertion) => !assertion.ok);
    if (failed.length) {
      throw new Error(`storage assertion failed: ${JSON.stringify(failed).slice(0, 1000)}`);
    }
    return {
      totalKeys: allKeys.length,
      matchedKeys: keys,
      matchedCount: keys.length,
      assertions,
    };
  }

  async opAssertPageStack(command) {
    if (!Array.isArray(command.equals)) throw new Error('assertPageStack requires equals array');
    const actual = await this.pageStackResult();
    const expected = command.equals.map(ensureLeadingSlash);
    const ok = JSON.stringify(actual.normalized) === JSON.stringify(expected);
    if (!ok) {
      throw new Error(`pageStack mismatch. expected=${expected.join(' > ')} actual=${actual.text}`);
    }
    return {
      expected,
      actual,
    };
  }

  async opSleep(command) {
    const ms = Number(command.ms || 1000);
    validateNumber(ms, 'ms');
    await sleep(ms);
    return { ms };
  }

  async opCompileShortcut(command) {
    const delayMs = Number(command.delayMs || this.options.compileShortcutDelayMs);
    const attempts = Number(command.attempts || this.options.compileShortcutAttempts);
    validateNumber(delayMs, 'delayMs');
    validateNumber(attempts, 'attempts');
    if (attempts < 1) throw new Error('attempts must be a positive number');
    const compileReady = await ensureCompileReady({
      miniProgram: this.miniProgram,
      cliState: this.cliState,
      delayMs,
      operationTimeoutMs: this.options.operationTimeoutMs,
      maxAttempts: attempts,
      requireCompileLogEvidence: this.options.requireCompileLogEvidence,
      logPrefix: 'mini-runtime-agent-loop',
      log: (line) => process.stderr.write(`${line}\n`),
    });
    if (!compileReady.ok) {
      throw new Error(compileReadyFailureMessage(compileReady));
    }
    return {
      delayMs,
      attempts,
      summary: summarizeCompileReady(compileReady),
      compileReady,
    };
  }

  async status() {
    return {
      goal: this.options.goal,
      strategy: this.options.strategy,
      step: this.step,
      initialLaunchDone: this.initialLaunchDone,
      autoAdjustmentsUsed: this.autoAdjustmentsUsed,
      maxAutoAdjustments: this.options.maxAutoAdjustments,
      failures: this.failures,
      pageStack: await this.pageStackResult().catch((error) => ({ error: error.message })),
    };
  }

  async finalize(command = {}) {
    const logs = await summarizeLogs(this.paths.consolePath, this.paths.exceptionPath, this.options);
    const summary = {
      goal: this.options.goal,
      strategy: this.options.strategy,
      artifactDir: this.options.artifactDir,
      projectPath: this.options.projectPath,
      autoPort: this.options.port,
      idePort: this.options.idePort,
      steps: this.step,
      initialLaunchDone: this.initialLaunchDone,
      autoAdjustmentsUsed: this.autoAdjustmentsUsed,
      maxAutoAdjustments: this.options.maxAutoAdjustments,
      pageStack: await this.pageStackResult().catch((error) => ({ error: error.message })),
      logs,
      failures: this.failures,
      ok: typeof command.ok === 'boolean' ? command.ok : this.failures.length === 0,
      artifacts: {
        sessionJson: this.paths.sessionPath,
        traceJsonl: this.paths.tracePath,
        summaryJson: this.paths.summaryPath,
        consoleJsonl: this.options.captureConsole ? this.paths.consolePath : '',
        exceptionJsonl: this.options.captureException ? this.paths.exceptionPath : '',
        cliOutputLog: this.paths.cliOutputPath,
      },
    };
    await fsPromises.writeFile(this.paths.summaryPath, JSON.stringify(summary, null, 2));
    await fsPromises.writeFile(this.paths.cliOutputPath, this.cliState.logs.join(''));
    this.completed = true;
    return summary;
  }
}

function redactCommand(command) {
  return { ...command };
}

async function loadRecipeSteps(recipePath) {
  const source = path.resolve(recipePath);
  const text = await fsPromises.readFile(source, 'utf8');
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Recipe is empty: ${source}`);

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const steps = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid recipe JSONL at line ${index + 1}: ${error.message}`);
        }
      });
    return validateRecipeSteps(steps, source);
  }

  const steps = Array.isArray(parsed) ? parsed : parsed.steps;
  return validateRecipeSteps(steps, source);
}

function validateRecipeSteps(steps, source) {
  if (!Array.isArray(steps) || !steps.length) {
    throw new Error(`Recipe must be a non-empty JSON array or an object with steps[]: ${source}`);
  }
  for (let i = 0; i < steps.length; i += 1) {
    if (!steps[i] || typeof steps[i] !== 'object' || Array.isArray(steps[i])) {
      throw new Error(`Recipe step ${i + 1} must be an object`);
    }
    if (!steps[i].op) {
      throw new Error(`Recipe step ${i + 1} is missing op`);
    }
  }
  return steps;
}

async function runRecipe(session, steps) {
  for (const step of steps) {
    const response = await session.handleCommand(step);
    emit(response);
    if (normalizeOp(step.op) === 'finalize') return;
    if (!response.ok && step.continueOnError !== true) break;
  }
  if (!session.completed) {
    const response = await session.handleCommand({
      op: 'finalize',
      ok: session.failures.length === 0,
      reason: 'recipe completed',
    });
    emit(response);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.artifactDir = path.resolve(options.artifactDir);
  if (options.recipePath) options.recipePath = path.resolve(options.recipePath);
  const paths = {
    sessionPath: path.join(options.artifactDir, 'session.json'),
    tracePath: path.join(options.artifactDir, 'run-trace.jsonl'),
    summaryPath: path.join(options.artifactDir, 'summary.json'),
    consolePath: path.join(options.artifactDir, 'console.jsonl'),
    exceptionPath: path.join(options.artifactDir, 'exception.jsonl'),
    cliOutputPath: path.join(options.artifactDir, 'cli-output.log'),
  };
  const sessionId = `mini-runtime-agent-loop-${formatStamp(new Date())}-${options.port}`;
  const automator = loadAutomator(options);
  let miniProgram;
  let cliState;
  let session;

  await fsPromises.mkdir(options.artifactDir, { recursive: true });
  await fsPromises.writeFile(paths.tracePath, '');
  if (options.captureConsole) await fsPromises.writeFile(paths.consolePath, '');
  if (options.captureException) await fsPromises.writeFile(paths.exceptionPath, '');
  await fsPromises.writeFile(paths.sessionPath, JSON.stringify({
    sessionId,
    goal: options.goal,
    strategy: options.strategy,
    artifactDir: options.artifactDir,
    projectPath: options.projectPath,
    autoPort: options.port,
    idePort: options.idePort,
    recipePath: options.recipePath,
    allowedOps: DEFAULT_ALLOWED_OPS,
    guards: {
      noBusinessScript: true,
      noReLaunchTargetAfterInitialEntry: options.strategy === 'business-flow',
      traceRequired: true,
      maxAutoAdjustments: options.maxAutoAdjustments,
    },
    createdAt: new Date().toISOString(),
  }, null, 2));

  try {
    cliState = startDevToolsAuto(options);
    miniProgram = await connectWithRetry(automator, options, cliState);

    if (options.captureConsole) {
      miniProgram.on('console', (msg) => {
        writeJsonl(paths.consolePath, { type: 'console', msg }).catch(() => {});
      });
    }
    if (options.captureException) {
      miniProgram.on('exception', (error) => {
        writeJsonl(paths.exceptionPath, { type: 'exception', error }).catch(() => {});
      });
    }

    await sleep(5000);
    let compileReady = null;
    if (options.compileShortcut) {
      compileReady = await ensureCompileReady({
        miniProgram,
        cliState,
        delayMs: options.compileShortcutDelayMs,
        operationTimeoutMs: options.operationTimeoutMs,
        maxAttempts: options.compileShortcutAttempts,
        requireCompileLogEvidence: options.requireCompileLogEvidence,
        logPrefix: 'mini-runtime-agent-loop',
        log: (line) => process.stderr.write(`${line}\n`),
      });
      if (!compileReady.ok) {
        throw new Error(compileReadyFailureMessage(compileReady));
      }
    }

    const systemInfo = await withTimeout('systemInfo', miniProgram.systemInfo(), options.operationTimeoutMs)
      .then((info) => ({
        ok: true,
        platform: info.platform || 'unknown',
        SDKVersion: info.SDKVersion || 'unknown',
      }))
      .catch((error) => ({ ok: false, error: error.message }));
    session = new AgentLoopSession(options, miniProgram, paths, cliState);
    emit({
      event: 'ready',
      sessionId,
      artifactDir: options.artifactDir,
      goal: options.goal,
      strategy: options.strategy,
      autoPort: options.port,
      idePort: options.idePort,
      recipePath: options.recipePath,
      system: systemInfo,
      compileReady: compileReady ? {
        status: compileReady.status,
        attempts: compileReady.attempts.length,
        logEvidenceObserved: compileReady.logEvidenceObserved,
        runtimeReady: compileReady.runtimeReady,
        warning: compileReady.warning || '',
      } : { status: 'skipped' },
      allowedOps: DEFAULT_ALLOWED_OPS,
      guards: {
        noBusinessScript: true,
        noReLaunchTargetAfterInitialEntry: options.strategy === 'business-flow',
        traceRequired: true,
        maxAutoAdjustments: options.maxAutoAdjustments,
      },
      next: options.recipePath ? 'run_recipe' : 'send_jsonl_op',
    });

    if (options.recipePath) {
      const steps = await loadRecipeSteps(options.recipePath);
      await runRecipe(session, steps);
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let command;
      try {
        command = JSON.parse(trimmed);
      } catch (error) {
        emit({ event: 'parse-error', ok: false, error: error.message, line: trimmed });
        continue;
      }
      const response = await session.handleCommand(command);
      emit(response);
      if (normalizeOp(command.op) === 'finalize') break;
    }

    if (!session.completed) {
      const response = await session.handleCommand({ op: 'finalize', reason: 'stdin closed' });
      emit(response);
    }
  } finally {
    if (miniProgram && options.closeDevTools && session?.completed) {
      await withTimeout('close WeChat DevTools', miniProgram.close(), 5000).catch(() => {
        miniProgram.disconnect();
      });
    } else if (miniProgram) {
      miniProgram.disconnect();
    }
    if (cliState && !cliState.isExited()) stopDevToolsAuto(cliState);
  }
}

main().catch((error) => {
  emit({ event: 'fatal', ok: false, error: error.message });
  process.exit(1);
});
