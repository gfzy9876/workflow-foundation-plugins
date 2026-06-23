# Chrome CLI Source Notes

This skill intentionally reuses the existing command-line Chrome MCP wrapper. It does not implement a new tool.

## Existing Source

Primary source:

```bash
/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/SKILL.md
```

Executable:

```bash
/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/bin/chrome-cli.mjs
```

Fallback invocation:

```bash
node /Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/bin/chrome-cli.mjs <command> [flags]
```

## Important Existing Concepts

- Commands are kebab-case versions of the original chrome-devtools-mcp tool names.
- Use `chrome-cli list` to list commands.
- Use `chrome-cli help <command>` when parameters are uncertain.
- `pageId` identifies a tab.
- `uid` identifies an element from `take-snapshot`.
- `uid` expires after navigation, reload, or DOM-changing interactions.
- Default to `take-snapshot` for operation grounding and `take-screenshot` for visual proof.

## Commands Most Relevant To UI Acceptance

- `daemon status`
- `daemon start -- --isolated`
- `list-pages`
- `select-page`
- `new-page`
- `navigate-page`
- `wait-for`
- `take-snapshot`
- `take-screenshot`
- `click`
- `fill`
- `fill-form`
- `type-text`
- `press-key`
- `list-console-messages`
- `get-console-message`
- `list-network-requests`
- `get-network-request`
- `evaluate-script`

## File Extension Traps

Some commands silently ignore file path parameters if the extension is wrong.

- `get-network-request --response-file-path`: use `.network-response`
- `get-network-request --request-file-path`: use `.network-request`
- `take-memory-snapshot --file-path`: use `.heapsnapshot`
- `performance-*-trace --file-path`: use `.json.gz` or `.json`

## Original Reference Files

Open these from the original source only when needed:

- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/daemon.md`
- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/take-snapshot.md`
- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/take-screenshot.md`
- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/fill-form.md`
- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/network-requests.md`
- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/evaluate-script.md`
- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/performance.md`
- `/Users/yingzhang/Desktop/TrystOfStars/.cursor/skills/chrome-cli/references/emulate.md`

## Evidence Pattern

For page testing, collect evidence in this order:

1. Current page id, URL, and snapshot.
2. Action performed, including uid or input value.
3. After-state snapshot or `wait-for` result.
4. Screenshot when visual state matters.
5. Console errors/warnings.
6. Network request/response evidence when API behavior is part of the case.
