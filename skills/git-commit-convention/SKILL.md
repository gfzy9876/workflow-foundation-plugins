---
name: git-commit-convention
description: "当 Codex 需要使用现有 git CLI 提交改动时使用，尤其是用户说 提交、git提交、commit、提交当前改动、部署+提交，或要求在审计前保留当前改动时。要求执行安全的 status/diff 检查、风险筛查、窄范围 staging、禁止空提交、多仓库边界隔离，并使用必需的提交信息格式：标题加编号的主要改动说明。"
---

# Git Commit Convention

Use the existing `git` command line only. Do not create a wrapper tool or invent a new commit API.

## Required Flow

1. Establish the repo boundary.
   - Run `git rev-parse --show-toplevel` when the cwd may be nested.
   - Run `git status --short --branch` before any staging.
   - For audits that require a branch gate, also run `git branch --show-current` and obey the audit skill's branch rule.

2. Inspect the change set.
   - Run `git diff --stat`.
   - Read focused diffs for changed files before staging.
   - Include untracked files in the inventory; do not assume they are safe.

3. Screen for commit blockers.
   - Stop and report if the change set includes obvious secrets, credentials, private keys, `.env` files, personal data, huge generated output, build artifacts, or unrelated binary blobs.
   - Exclude junk such as `.DS_Store`.
   - If the user explicitly allowed only pre-existing changes, do not edit, format, or manufacture files to create a commit.

4. Validate before commit when the repo has a known cheap check.
   - Always run `git diff --check`.
   - After staging, run `git diff --cached --check`.
   - Prefer repo-local tests/typecheck/build when already known for the project, but do not invent heavyweight validation for a tiny commit unless risk justifies it.

5. Stage intentionally.
   - Stage only files that belong to the coherent change set.
   - If unrelated user changes are present, leave them unstaged unless the user asked to commit everything and the inventory supports doing so.
   - For multiple repositories, repeat the full flow separately in each repo.

6. Commit with the required message format.
   - Use a content-first title, usually Chinese in Tryst repos unless the repo convention is clearly different.
   - Do not use process-only titles such as `deploy`, `snapshot`, or `update`.
   - Use exactly this body shape:

```text
<title>

主要改动：
1. <main change>
2. <main change>
3. <main change>
```

7. Verify after commit.
   - Run `git status --short --branch`.
   - Run `git show --stat --oneline --decorate -1` or `git log -1 --oneline`.
   - Report the commit hash and whether the worktree is clean or what remains.

## Empty Commit Rule

If there is nothing to commit, say so and skip the commit. Do not create an empty commit unless the user explicitly asks for an empty commit.

## Useful Commands

```bash
git rev-parse --show-toplevel
git status --short --branch
git diff --stat
git diff -- <paths>
git diff --check
git add <paths>
git diff --cached --stat
git diff --cached --check
git commit -m "<title>" -m "主要改动：
1. ...
2. ...
3. ..."
git status --short --branch
git show --stat --oneline --decorate -1
```

## References

Read `references/recent-git-patterns.md` when a task involves audits, dirty worktree protection, cross-repo commits, or deciding whether to commit all changes or a narrow subset.
