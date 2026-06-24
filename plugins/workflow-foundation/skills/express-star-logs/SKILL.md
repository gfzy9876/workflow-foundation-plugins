---
name: express-star-logs
description: "用于 TrystOfStars `express_star` 后端 CloudRun 部署后验证、运行日志查询、部署记录检查、`/health` 探活，以及星币支付回调、虚拟支付回调、`star-virtual-notify-relay`、`fulfillStarPurchase` 相关诊断。"
---

# Express Star Logs

Use this skill for read-only backend operations after an `express_star` deploy or when the user asks why the live backend, payment callback, relay, or CloudRun runtime is failing.

## Boundaries

- Target repo: `$HOME/Desktop/TrystOfStars/express_star`
- Runtime: CloudBase CloudRun container service, not a WeChat cloud function.
- Default dev service: env `dev-8g923tapc831bc98`, service `express-star`, port `80`.
- Deploy entrypoint, when the user explicitly asks to deploy: `npm run deploy:dev`.
- Cloud function relay `star-virtual-notify-relay` is adjacent infrastructure; use it only when diagnosing virtual-payment callback forwarding.

Do not use `tcb fn log` for this service. It is for cloud functions, not the container CloudRun service.

## Read-Only Workflow

1. Enter the backend repo.

```bash
cd "$HOME/Desktop/TrystOfStars/express_star"
```

2. Confirm the current CloudBase CLI shape before using unfamiliar flags.

```bash
tcb cloudrun --help
tcb cloudrun list --help
```

3. Read the service management view.

```bash
tcb cloudrun list --envId dev-8g923tapc831bc98 --serviceName express-star
```

4. Query CloudRun service detail and deploy records with the bundled read-only helper.

Resolve `scripts/tcbr-cloudrun-read.cjs` relative to this Skill directory; do not assume a machine-specific plugin checkout path.

```bash
HELPER="<path-to-this-skill>/scripts/tcbr-cloudrun-read.cjs"
node "$HELPER" --action status
```

5. If a deploy record has a `RunId`, inspect process logs.

```bash
node "$HELPER" --action logs --run-id <RunId>
```

If `--run-id` is omitted, the helper tries to use the newest deploy record's `RunId`.

6. Probe the public default domain from the service detail. Prefer `BaseInfo.DefaultDomainName`; do not curl the internal domain from the local machine.

```bash
curl -i "$DEFAULT_DOMAIN/health"
curl -i "$DEFAULT_DOMAIN/"
```

For virtual payment checks, also probe:

```bash
curl -i "$DEFAULT_DOMAIN/api/stars/orders/virtual/notify"
curl -i "$DEFAULT_DOMAIN/api/stars/orders/virtual/config-check"
```

## Deploy Verification

Treat these as different layers:

- Submission: `npm run deploy:dev` / `tcb cloudrun deploy` completed.
- Deploy record: `DescribeCloudRunDeployRecord` latest record is `normal`, has traffic, and has a useful `RunId`.
- Runtime process: `DescribeCloudRunProcessLog` shows container/service creation and no startup crash.
- Live traffic: public `/health` returns HTTP 200 with `status: healthy` and fresh service metadata.

Do not report a deploy as live only because the CLI said submission completed.

## Payment Diagnostics

For star payment or virtual payment issues, collect these facts in order:

1. CloudRun live status and process log for the current run.
2. HTTP behavior of:
   - `/api/stars/orders/notify`
   - `/api/stars/orders/virtual/notify`
   - `/api/stars/orders/virtual/config-check`
3. Runtime config signals, without printing secrets:
   - `STAR_PAYMENT_PROVIDER`
   - `STAR_PAYMENT_NOTIFY_URL`
   - `STAR_VIRTUAL_NOTIFY_URL`
   - `STAR_VIRTUAL_NOTIFY_TOKEN` presence only, never the value
   - `STAR_VIRTUAL_OFFER_ID`
   - `STAR_VIRTUAL_ENV`
4. Relay boundary if virtual callbacks are involved:
   - cloud function name `star-virtual-notify-relay`
   - target URL path `/api/stars/orders/virtual/notify`
   - relay transport success versus backend fulfillment success
5. Code-level anchors when needed:
   - `routes/api.ts`
   - `services/pay/virtual/notify.ts`
   - `services/stars/fulfillStarPurchase.ts`
   - `cloudfunctions/star-virtual-notify-relay/index.js`

## Known Pitfalls

- `DescribeCloudRunDeployRecord` accepts `EnvId + ServerName`; do not add guessed pagination fields such as `Limit`.
- `DescribeCloudRunProcessLog` needs `EnvId + RunId`; `ServerName` is not enough.
- `tcb cloudrun list` shows service status but not the root cause of failed releases.
- The live service can be healthy while feature behavior fails because of model names, env drift, or payment config.
- Deployment scripts merge runtime env values but do not remove stale live env keys automatically.
- Never print raw `EnvParams`, private keys, app secrets, tokens, or payment keys in the final answer.

## Report Format

Report the result in this order:

1. Target: env, service, public domain, online version or latest deploy id.
2. Deploy record: status, traffic, run id, deploy time.
3. Runtime log: relevant success/error lines only.
4. HTTP probes: endpoint, status code, short body summary.
5. Diagnosis: whether the problem is deploy submission, container startup, runtime config, payment relay, or business fulfillment.
