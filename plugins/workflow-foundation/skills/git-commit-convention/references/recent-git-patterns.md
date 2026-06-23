# Recent Git Patterns

These rules come from recent TrystOfStars and CocosWorkTest workflows.

## Repeated User Preferences

- For bare `提交` or `提交当前改动`, execute the commit workflow instead of only explaining it.
- Start with `git status --short --branch`; use `git rev-parse --show-toplevel` when the package cwd and Git root may differ.
- Use Chinese, content-first commit titles by default in Tryst repos.
- Keep subjects tied to the actual change. Avoid generic titles like `deploy`, `snapshot`, or `update`.
- If the worktree is clean, explicitly skip the commit; do not create an empty commit.
- If sensitive files, keys, private config, large generated artifacts, or unrelated build output appear, stop and report the risk.
- Keep multi-repo work separate. `mini`, `express_star`, `admin`, and Cocos projects each get their own repo-local commit flow.
- Exclude Finder junk such as `.DS_Store`.

## Patterns Worth Reusing

### Safe Commit

```bash
git status --short --branch
git diff --stat
git diff -- <changed-files>
git diff --check
git add <intended-files>
git diff --cached --stat
git diff --cached --check
git commit -m "<中文内容优先标题>" -m "主要改动：
1. ...
2. ...
3. ..."
git status --short --branch
git show --stat --oneline --decorate -1
```

### Audit Preflight Commit

Use only when the audit instructions allow one preflight commit for already-existing dirty changes.

1. Inspect status and branch before audit work.
2. If dirty, classify the existing changes and run risk screening.
3. Commit only those existing changes if safe.
4. If clean, skip commit.
5. After the preflight decision, keep the audit read-only.

Do not edit, auto-fix, format, deploy, or create files just to make the preflight commit possible.

### Narrow Staging

When unrelated changes exist:

- Stage explicit paths.
- Confirm with `git diff --cached --name-status`.
- Leave unrelated changes unstaged.
- Mention remaining dirty files in the final response.

### Generated Or Ignored Artifacts

Do not trust `git status` alone for ignored generated files. If the user asked about an ignored artifact, use direct file checks or `git check-ignore -v <path>`.

## Message Format

Required:

```text
<title>

主要改动：
1. <specific change>
2. <specific change>
3. <specific change>
```

Good title examples:

- `修复星币商品重新上线保存校验`
- `优化星辰钱包待确认订单刷新`
- `补充微信文本安全拦截处理`
- `整理小程序路由配置与个人页展示`

Bad title examples:

- `deploy`
- `snapshot`
- `update`
- `fix`
