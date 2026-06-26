#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const scriptName = 'automator-smoke.mjs';
const candidates = [
  process.env.MINI_RUNTIME_PROJECT_ROOT,
  process.cwd(),
  resolve(process.cwd(), '..'),
  resolve(homedir(), 'Desktop/TrystOfStars/mini'),
].filter(Boolean);

let canonicalScript;
for (const root of candidates) {
  const fromMiniRoot = resolve(root, 'miniprogram/.agents/scripts', scriptName);
  const fromMiniprogramRoot = resolve(root, '.agents/scripts', scriptName);
  if (existsSync(fromMiniRoot)) {
    canonicalScript = fromMiniRoot;
    break;
  }
  if (existsSync(fromMiniprogramRoot)) {
    canonicalScript = fromMiniprogramRoot;
    break;
  }
}

if (!canonicalScript) {
  console.error(`Cannot find canonical ${scriptName}. Run from the mini repo/miniprogram directory or set MINI_RUNTIME_PROJECT_ROOT.`);
  process.exit(1);
}

const child = spawn(process.execPath, [canonicalScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Failed to start canonical automator script: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Canonical automator script exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
