---
name: express-star-cloudrun-deploy
description: Deploy TrystOfStars express_star CloudBase CloudRun container service via skill-owned scripts. Use when the user says express_star 部署, 云托管部署, CloudRun deploy, backend deploy, or asks to deploy the express_star main backend service. Do not use for CloudBase cloud functions; use express-star-cloudfunctions-deploy for cloudfunctions/star-virtual-notify-relay.
---

# express_star CloudRun 部署

## Scope

Use this skill for `/Users/yingzhang/Desktop/TrystOfStars/express_star` CloudBase CloudRun container deployment.

Do not use it for CloudBase cloud functions under `cloudfunctions/`.

## Workflow

1. Confirm the repo boundary:

```bash
cd /Users/yingzhang/Desktop/TrystOfStars/express_star
git status --short
git branch --show-current
```

2. Run the skill-owned deploy wrapper from this skill directory:

```bash
./scripts/deploy.sh
```

The wrapper loads `.env.local` or `EXPRESS_STAR_ENV_FILE`, sets `ENV_ID`, `CLOUDRUN_SERVICE_NAME`, and `CLOUDRUN_PORT`, then runs `scripts/deploy-cloudrun.cjs` from this skill. The CloudRun script builds the app, syncs configured runtime env keys, prepares a temporary deploy source, and calls `tcb cloudrun deploy`.

3. Treat deployment as complete only after live verification:

- Deploy record is normal and has traffic.
- CloudRun process log shows no startup crash.
- `GET /health` returns 200 from the live domain.

Use `express-star-logs` for the read-only verification and runtime log phase.

## Required Local State

`.env.local` or the current shell must provide `ENV_ID`; if absent, the wrapper falls back to `cloudbaserc.json.envId`.

Default dev values:

```text
CLOUDRUN_SERVICE_NAME=express-star
CLOUDRUN_PORT=80
```

Never commit runtime secrets or generated deploy sources.
