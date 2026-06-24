---
name: express-star-cloudfunctions-deploy
description: Deploy TrystOfStars express_star CloudBase cloud functions via the repo-local fixed script. Use when the user asks to deploy 云开发, 云函数, CloudBase functions, star-virtual-notify-relay, or says express_star 云开发部署 / 后端云函数部署. This skill is only for the express_star CloudBase cloud-function surface, not CloudRun container deploys.
---

# express_star 云函数部署

## Scope

Use this skill for `/Users/yingzhang/Desktop/TrystOfStars/express_star` CloudBase cloud functions under `cloudfunctions/`.

Do not use it for CloudRun/云托管. CloudRun uses `express-star-cloudrun-deploy`:

```bash
./scripts/deploy.sh
```

## Workflow

1. Confirm the repo boundary:

```bash
cd /Users/yingzhang/Desktop/TrystOfStars/express_star
git status --short
git branch --show-current
```

2. Confirm the configured functions:

```bash
node -e "const c=require('./cloudbaserc.json'); console.log(c.envId); console.log((c.functions||[]).map(f=>f.name).join(','));"
```

3. Deploy dev CloudBase cloud functions through the skill-owned wrapper:

```bash
./scripts/deploy.sh
```

To deploy one function explicitly:

```bash
./scripts/deploy.sh star-virtual-notify-relay
```

The wrapper loads `.env.local` or `EXPRESS_STAR_ENV_FILE`, sets `ENV_ID`, and runs the skill-owned `scripts/deploy-cloudfunctions.cjs`. The script reads the `express_star` repo through `EXPRESS_STAR_ROOT`, generates a temporary `cloudbaserc.json`, and runs `tcb fn deploy <name> -e <ENV_ID> --force --yes`.

By default it preserves remote function environment variables. To sync local runtime variables into the cloud function, explicitly run:

```bash
EXPRESS_STAR_SYNC_CLOUDFUNCTION_ENV=1 ./scripts/deploy.sh
```

4. Treat deployment as complete only after the script reaches remote invocation and list verification:

```text
tcb fn invoke <name> -e <ENV_ID> --params '{"action":"ping"}'
tcb fn list -e <ENV_ID> -l 100
```

Do not run `tcb fn detail` in the normal path because it prints cloud-function environment variables. For focused debugging only, use:

```bash
EXPRESS_STAR_SHOW_CLOUDFUNCTION_DETAIL=1 ./scripts/deploy.sh
```

If `invoke` is intentionally skipped, say that runtime invocation was not verified.

## Required Local State

`.env.local` or the current shell must provide `ENV_ID`; if absent, the script falls back to `cloudbaserc.json.envId`.

For `star-virtual-notify-relay`, keep these runtime variables available when relevant:

```text
STAR_VIRTUAL_NOTIFY_RELAY_TARGET
STAR_VIRTUAL_NOTIFY_TOKEN
WECHAT_MESSAGE_TOKEN
WX_MESSAGE_TOKEN
MP_MESSAGE_TOKEN
WECHAT_MINIPROGRAM_APPID
WECHAT_MINIPROGRAM_APPSECRET
WX_MINIPROGRAM_APPID
WX_MINIPROGRAM_APPSECRET
MP_APPID
MP_APPSECRET
WECHAT_APPID
WECHAT_APPSECRET
STAR_VIRTUAL_OFFER_ID
STAR_VIRTUAL_APPKEY_SANDBOX
STAR_VIRTUAL_APPKEY_PROD
STAR_VIRTUAL_ENV
```

Never write these secrets into committed files. When `EXPRESS_STAR_SYNC_CLOUDFUNCTION_ENV=1` is set, the script copies them into a temp deploy config only.

## Failure Handling

- If `tcb` is unauthenticated, run `tcb login` and retry once.
- If deployment succeeds but `invoke {"action":"ping"}` fails, inspect `tcb fn detail` and `tcb fn log <name> -e <ENV_ID>`.
- If CloudRun behavior is involved, switch back to the CloudRun deploy/verify flow; do not debug it as a cloud function.
