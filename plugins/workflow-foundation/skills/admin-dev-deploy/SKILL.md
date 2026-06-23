---
name: admin-dev-deploy
description: "用于 TrystOfStars `admin` 开发环境静态托管部署、CloudBase Hosting 目标校验，以及区分开发版后台部署和正式版发布。用户要求部署 admin、admin dev、admin hosting、testAdmin，或验证后台部署结果时触发。"
---

# Admin Dev Deploy

Use this skill to deploy the TrystOfStars admin frontend to CloudBase dev hosting and verify the target boundary.

## Boundaries

- Target repo: `/Users/yingzhang/Desktop/TrystOfStars/admin`
- Default deploy: `npm run deploy`
- Equivalent dev deploy: `npm run deploy:dev`
- Dev build command: `npm run build:dev`
- Dev hosting target: local `dist` -> CloudBase hosting path `testAdmin`
- Dev env: `dev-8g923tapc831bc98`
- Release deploy is explicit only: `npm run deploy:release`
- Release env/path: `starrychat-2gkpjngpf50df2e3` / `admin`

Do not run `deploy:release` unless the user explicitly says release, production, 正式, or gives the release env/path.

## Workflow

1. Enter the admin repo.

```bash
cd /Users/yingzhang/Desktop/TrystOfStars/admin
```

2. Inspect the current package scripts before deploying if this is the first admin deploy in the turn.

```bash
node -e "const p=require('./package.json'); console.log(p.scripts)"
tcb hosting deploy --help
tcb hosting list --help
```

3. Run the dev deploy.

```bash
npm run deploy
```

This currently expands to:

```bash
npm run build:dev && tcb hosting deploy dist testAdmin -e dev-8g923tapc831bc98
```

4. Verify the hosting target after the deploy.

```bash
tcb hosting detail -e dev-8g923tapc831bc98
tcb hosting list -e dev-8g923tapc831bc98
```

If the output is large, report only enough evidence to show that hosting is reachable and `testAdmin` was the intended target.

## Reporting

Report these facts:

1. Build/deploy command that actually ran.
2. Env id and hosting path.
3. Whether the deploy command succeeded.
4. Hosting verification command and concise result.
5. Any warning that the result is dev-only, not release.

## Safety Rules

- Do not blur dev and release. `npm run deploy` is dev in this repo.
- Do not commit admin changes unless the user asks for commit.
- Do not deploy `admin` release path as a follow-up to a bare `部署`.
- If `tcb` auth fails, ask the user to complete `tcb login` or refresh auth; do not switch envs silently.
- If the worktree is dirty, deploy the current workspace only when that matches the user's request. Do not revert unrelated files.
