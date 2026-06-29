---
name: chrome-mcp-workflow
description: "Use when Codex should operate an existing Chrome MCP/Chrome CLI browser workflow from the command line: opening or switching pages, navigating, taking snapshots, getting nodes/uids, clicking, filling inputs, typing, pressing keys, taking screenshots, reading console logs, inspecting network requests, or collecting page evidence for testing. Use this for chrome-mcp, chrome-cli, 页面调用, 页面状态采集, 获取node, 点击, 输入, 截图, 抓接口, console, network, and browser acceptance checks."
---

# Chrome MCP Workflow

Use the existing Chrome MCP command-line surface. Do not create a new browser wrapper, new MCP server, or new tool API.

Resolve the CLI at runtime instead of assuming a machine-specific path:

1. Use `chrome-cli` when it is available in `PATH`.
2. Use `$CHROME_CLI` when the environment points to an executable or `chrome-cli.mjs`.
3. Otherwise search likely local skill locations such as:
   - `$PWD/.cursor/skills/chrome-cli/bin/chrome-cli.mjs`
   - parent directories' `.cursor/skills/chrome-cli/bin/chrome-cli.mjs`
   - `$HOME/.cursor/skills/chrome-cli/bin/chrome-cli.mjs`
   - `$HOME/Desktop/TrystOfStars/.cursor/skills/chrome-cli/bin/chrome-cli.mjs`
4. If no CLI is found, stop and report that the Chrome CLI source is not installed on this machine.

When the resolved CLI is a `.mjs` file, call it with Node:

```bash
node "$CHROME_CLI" <command> [flags]
```

When it is an executable command, call it directly:

```bash
chrome-cli <command> [flags]
```

## Basic Flow

1. Check browser daemon state.

```bash
chrome-cli daemon status
```

If `chrome-cli` is not found, resolve `$CHROME_CLI` or a local `chrome-cli.mjs` and use the `node "$CHROME_CLI" ...` form above. If the daemon is stopped and the user asked to operate Chrome, start it. Prefer isolated profile for automation:

```bash
chrome-cli daemon start -- --isolated
```

2. Open or select the page.

```bash
chrome-cli list-pages
chrome-cli new-page --url http://127.0.0.1:5173
chrome-cli select-page --page-id <pageId>
chrome-cli navigate-page --url <url>
```

3. Capture page state before acting.

```bash
chrome-cli take-snapshot --file-path /tmp/page-snapshot.txt
chrome-cli list-console-messages
```

4. Interact using the latest node uid from the snapshot.

```bash
chrome-cli click --uid "<uid>"
chrome-cli fill --uid "<uid>" --value "text"
chrome-cli type-text --text "text"
chrome-cli press-key --key Enter
```

5. Capture the after-state.

```bash
chrome-cli take-snapshot --file-path /tmp/page-after.txt
chrome-cli take-screenshot --file-path /tmp/page-after.png --format png
chrome-cli list-console-messages
```

6. Report evidence.
   - URL/page title or selected page id.
   - Relevant text or node state from snapshot.
   - Screenshot path when visual evidence matters.
   - Console errors/warnings.
   - Network request ids and response summary when API behavior matters.

## Node And UID Rules

- `take-snapshot` is the normal way to get node/uids.
- A `uid` is valid only for the current snapshot state.
- After navigation, reload, click that changes DOM, or form submission, take a fresh snapshot before the next uid-based action.
- Prefer snapshot for structure and selector grounding; use screenshot for visual layout, overlap, rendering, or user-facing evidence.

## Common Tasks

### Open A Test Page

```bash
chrome-cli daemon status
chrome-cli new-page --url http://127.0.0.1:5173
chrome-cli take-snapshot --file-path /tmp/snap.txt
```

### Click A Button

```bash
chrome-cli take-snapshot --file-path /tmp/snap.txt
grep -n "保存\\|提交\\|登录" /tmp/snap.txt
chrome-cli click --uid "<uid-from-latest-snapshot>"
chrome-cli take-snapshot --file-path /tmp/after.txt
```

### Fill Inputs

```bash
chrome-cli take-snapshot --file-path /tmp/form.txt
chrome-cli fill --uid "<input-uid>" --value "value"
chrome-cli press-key --key Enter
```

For several fields, use `fill-form` after reading the original chrome-cli reference or `chrome-cli help fill-form`.

### Screenshot

```bash
chrome-cli take-screenshot --file-path /tmp/page.png --format png
```

Use screenshots for layout, visual regressions, modals, overlays, and final acceptance proof.

### Console Logs

```bash
chrome-cli list-console-messages
chrome-cli get-console-message --msgid <msgid>
```

Treat `error` and meaningful `warn` entries as evidence. Do not ignore console failures when validating UI behavior.

### Network/API Evidence

```bash
chrome-cli list-network-requests --resource-types xhr fetch
chrome-cli get-network-request --reqid <reqid> --response-file-path /tmp/response.network-response
```

Large responses should be written to files and summarized. For response files, keep the `.network-response` extension.

## Safety

- Do not inspect cookies, passwords, saved credentials, or browser profile storage unless the user explicitly asks and the task requires it.
- Do not submit forms, upload files, delete data, change permissions, make purchases, or transmit sensitive information unless the user clearly authorized that action.
- If login, CAPTCHA, permission prompts, or irreversible side effects block the task, stop and ask the user to handle or approve that step.
- Do not kill the user's Chrome process. If a profile conflict happens, use isolated daemon startup instead.

## When To Read References

Read `references/chrome-cli-source.md` for the existing command surface, file extension traps, and when to consult the original `.cursor` chrome-cli references.
