---
name: tryst-lark-cli
description: Use for TrystOfStars business workflows that write, update, search, or synchronize release notes, deploy evidence, audit conclusions, status reports, or operational records through `lark-cli` into Lark/Feishu Docs, Sheets, Drive, Wiki, or Base.
---

# Tryst Lark CLI

Use this skill as the Tryst business layer over `lark-cli`. It routes a Tryst outcome into the right Lark atomic skill and keeps the evidence format consistent.

## Always Load First

Before running `lark-cli`, read:

- `$HOME/.agents/skills/lark-shared/SKILL.md`

Then route by target:

- Docs or document search: `$HOME/.agents/skills/lark-doc/SKILL.md`
- Sheets or tabular records: `$HOME/.agents/skills/lark-sheets/SKILL.md`
- Drive files, permissions, comments, imports, or title changes: `$HOME/.agents/skills/lark-drive/SKILL.md`
- Wiki node organization: `$HOME/.agents/skills/lark-wiki/SKILL.md`
- Base records or structured operational tables: `$HOME/.agents/skills/lark-base/SKILL.md`

Load only the target atomic skill needed for the current request.

## Business Workflows

### Publish Deploy Evidence

Use when the user wants deploy results synced to Feishu/Lark.

Gather:

- repo name and path
- branch and commit if available
- command run
- env/service/hosting target
- verification evidence
- remaining risk or blocker

Write a concise section to the requested doc, or create a doc only if the user asks. If the target document is unknown, use `lark-cli docs +search` first.

### Sync Audit Conclusion

Use when the user wants audit results, review findings, or validation evidence recorded.

Keep findings separated from refactor candidates. Include file paths and runtime evidence only when they were actually checked. Do not turn unverified guesses into conclusions.

### Update Operational Sheet

Use when the user wants a table row updated or appended.

Use `lark-cli docs +search` to locate a spreadsheet by name if only a title is given. After locating the spreadsheet URL/token, switch to `lark-sheets` and use `+info`, `+read`, `+find`, `+write`, or `+append`.

### Locate Lark Resource

Use when the user gives a loose name like "那个发布表", "星辰系统文档", or "审计记录".

Start with:

```bash
lark-cli docs +search --query "<keywords>"
```

Then choose the specific atomic skill based on the returned object type.

## Identity and Permission Rules

- Prefer user identity for user-owned Docs, Sheets, Drive, and Wiki resources.
- Use bot identity only when the resource is known to belong to the bot or the user explicitly wants bot-owned output.
- If a command returns missing scope or permission errors, follow `lark-shared`; do not guess scopes or ask for broad access first.
- Write/delete operations require clear user intent. Use read/search first when the target is ambiguous.
- Never print app secrets, access tokens, or auth payloads.

## Output Shape

For document updates, prefer this section order:

1. Title: concise business event, such as `express_star CloudRun deploy verification`.
2. Context: repo, branch, environment, command.
3. Evidence: deploy record, process log, HTTP probe, screenshot, or CLI result.
4. Result: success, partial, blocked, or failed.
5. Next action: only if there is a real follow-up.

For sheet rows, prefer stable columns:

```text
date, repo, branch, action, target, result, evidence, operator, notes
```

## Pitfalls

- Do not use `lark-doc` for sheet cell edits after a spreadsheet is identified; switch to `lark-sheets`.
- Wiki URLs may need wiki-node resolution before using the real object token.
- Do not create a new document or table when the user likely wants an existing resource updated; search first.
- Do not silently ignore `_notice.update` from `lark-cli`; mention it after completing the user's requested operation.
