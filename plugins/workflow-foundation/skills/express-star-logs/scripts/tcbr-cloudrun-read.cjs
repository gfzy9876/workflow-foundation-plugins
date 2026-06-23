#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_REPO = "/Users/yingzhang/Desktop/TrystOfStars/express_star";
const DEFAULT_REGION = "ap-shanghai";
const SENSITIVE_KEY_RE = /(secret|token|key|password|credential|private|envparams)/i;

function usage() {
  console.log(`Usage:
  tcbr-cloudrun-read.cjs --action status [--repo <path>] [--env-id <id>] [--service <name>] [--raw]
  tcbr-cloudrun-read.cjs --action detail [--repo <path>] [--env-id <id>] [--service <name>] [--raw]
  tcbr-cloudrun-read.cjs --action deploy-records [--repo <path>] [--env-id <id>] [--service <name>] [--raw]
  tcbr-cloudrun-read.cjs --action logs [--repo <path>] [--env-id <id>] [--service <name>] [--run-id <id>] [--raw]

Read-only helper for TrystOfStars express_star CloudRun diagnostics.
Credentials are read from TencentCloud env vars or ~/.config/.cloudbase/auth.json.
`);
}

function parseArgs(argv) {
  const args = { action: "status", repo: DEFAULT_REPO, raw: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--raw") {
      args.raw = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[key] = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readCloudbasercEnvId(repo) {
  const filePath = path.join(repo, "cloudbaserc.json");
  if (!fs.existsSync(filePath)) return "";
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return typeof parsed.envId === "string" ? parsed.envId.trim() : "";
  } catch (_err) {
    return "";
  }
}

function readCloudbaseCredential() {
  const envSecretId = process.env.TENCENTCLOUD_SECRETID || process.env.TENCENTCLOUD_SECRET_ID;
  const envSecretKey = process.env.TENCENTCLOUD_SECRETKEY || process.env.TENCENTCLOUD_SECRET_KEY;
  const envToken = process.env.TENCENTCLOUD_SESSIONTOKEN || process.env.TENCENTCLOUD_SESSION_TOKEN;
  if (envSecretId && envSecretKey) {
    return { secretId: envSecretId, secretKey: envSecretKey, token: envToken || "" };
  }

  const authPath = path.join(os.homedir(), ".config", ".cloudbase", "auth.json");
  if (!fs.existsSync(authPath)) {
    throw new Error("Missing CloudBase auth. Run `tcb login` first.");
  }

  const parsed = JSON.parse(fs.readFileSync(authPath, "utf8"));
  const credential = parsed.credential || {};
  const secretId = credential.secretId || credential.tmpSecretId || "";
  const secretKey = credential.secretKey || credential.tmpSecretKey || "";
  const token = credential.token || credential.tmpToken || "";
  if (!secretId || !secretKey) {
    throw new Error("Missing CloudBase credential. Run `tcb login` first.");
  }
  return { secretId, secretKey, token };
}

function hmacSha256(message, secret, encoding) {
  return crypto.createHmac("sha256", secret).update(message).digest(encoding);
}

function sha256Hex(message) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

function formatTcDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

async function requestTcbr(action, payload, region) {
  const credential = readCloudbaseCredential();
  const service = "tcbr";
  const version = "2022-02-17";
  const host = `${service}.tencentcloudapi.com`;
  const endpoint = `https://${host}`;
  const method = "POST";
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = formatTcDate(timestamp);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    method,
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmacSha256(date, `TC3${credential.secretKey}`);
  const kService = hmacSha256(service, kDate);
  const kSigning = hmacSha256("tc3_request", kService);
  const signature = hmacSha256(stringToSign, kSigning, "hex");
  const headers = {
    Host: host,
    "Content-Type": "application/json",
    "X-TC-Action": action,
    "X-TC-Version": version,
    "X-TC-Region": region || DEFAULT_REGION,
    "X-TC-Timestamp": String(timestamp),
    Authorization: [
      `TC3-HMAC-SHA256 Credential=${credential.secretId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", "),
  };
  if (credential.token) headers["X-TC-Token"] = credential.token;

  const response = await fetch(endpoint, { method, headers, body });
  const data = await response.json();
  const error = data && data.Response && data.Response.Error;
  if (error) {
    const detail = [
      error.Message || "Tencent Cloud API request failed",
      error.Code ? `code=${error.Code}` : "",
      data.Response.RequestId ? `requestId=${data.Response.RequestId}` : "",
    ].filter(Boolean).join(" ");
    throw new Error(detail);
  }
  return data.Response || {};
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : redact(child);
  }
  return result;
}

function pick(value, keys) {
  for (const key of keys) {
    if (value && value[key] !== undefined && value[key] !== null && value[key] !== "") {
      return value[key];
    }
  }
  return undefined;
}

function findDeployRecords(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object" && (item.DeployId || item.RunId || item.VersionName))) {
      return value;
    }
    for (const item of value) {
      const found = findDeployRecords(item);
      if (found.length) return found;
    }
    return [];
  }
  for (const key of ["Records", "RecordList", "DeployRecords", "DeployRecordList", "CloudRunDeployRecordList"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const child of Object.values(value)) {
    const found = findDeployRecords(child);
    if (found.length) return found;
  }
  return [];
}

function summarizeRecords(response) {
  return findDeployRecords(response).slice(0, 8).map((record) => ({
    deployId: pick(record, ["DeployId", "Id"]),
    versionName: pick(record, ["VersionName", "Version"]),
    status: pick(record, ["Status", "DeployStatus"]),
    flowRatio: pick(record, ["FlowRatio"]),
    hasTraffic: pick(record, ["HasTraffic"]),
    runId: pick(record, ["RunId"]),
    deployTime: pick(record, ["DeployTime", "CreateTime", "UpdateTime"]),
  }));
}

function summarizeDetail(response) {
  const base = response.BaseInfo || {};
  const config = response.ServerConfig || {};
  return {
    defaultDomainName: base.DefaultDomainName,
    status: base.Status || response.Status,
    serverType: base.ServerType || config.ServerType,
    accessTypes: base.AccessTypes,
    trafficType: base.TrafficType,
    customLogs: config.CustomLogs,
    logType: config.LogType,
    logSetIdPresent: Boolean(config.LogSetId),
    logTopicIdPresent: Boolean(config.LogTopicId),
    onlineVersionInfos: response.OnlineVersionInfos || base.OnlineVersionInfos || config.OnlineVersionInfos,
  };
}

function collectLogLines(value, lines = []) {
  if (typeof value === "string") {
    if (value.includes("\n")) lines.push(...value.split(/\r?\n/).filter(Boolean));
    else lines.push(value);
    return lines;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLogLines(item, lines);
    return lines;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) continue;
      collectLogLines(child, lines);
    }
  }
  return lines;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const repo = path.resolve(args.repo || DEFAULT_REPO);
  const localEnv = readDotEnv(args.envFile || path.join(repo, ".env.local"));
  const mergedEnv = { ...localEnv, ...process.env };
  const envId = args.envId || mergedEnv.ENV_ID || mergedEnv.TCB_ENV_ID || readCloudbasercEnvId(repo);
  const serviceName = args.service || mergedEnv.CLOUDRUN_SERVICE_NAME || "express-star";
  const region = args.region || mergedEnv.TENCENTCLOUD_REGION || DEFAULT_REGION;

  if (!envId) throw new Error("Missing env id. Pass --env-id or configure ENV_ID/cloudbaserc.json.");

  const output = { envId, serviceName, region, action: args.action };

  if (args.action === "detail" || args.action === "status") {
    const detail = await requestTcbr("DescribeCloudRunServerDetail", {
      EnvId: envId,
      ServerName: serviceName,
    }, region);
    output.detail = args.raw ? redact(detail) : summarizeDetail(detail);
  }

  if (args.action === "deploy-records" || args.action === "status" || args.action === "logs") {
    const records = await requestTcbr("DescribeCloudRunDeployRecord", {
      EnvId: envId,
      ServerName: serviceName,
    }, region);
    output.deployRecords = args.raw ? redact(records) : summarizeRecords(records);
  }

  if (args.action === "logs") {
    const runId = args.runId || (output.deployRecords || []).find((record) => record.runId)?.runId;
    if (!runId) throw new Error("Missing RunId. Pass --run-id or inspect deploy records first.");
    const logs = await requestTcbr("DescribeCloudRunProcessLog", {
      EnvId: envId,
      RunId: runId,
    }, region);
    output.runId = runId;
    output.processLog = args.raw ? redact(logs) : collectLogLines(logs).slice(-120);
  }

  if (!["detail", "deploy-records", "status", "logs"].includes(args.action)) {
    throw new Error(`Unsupported action: ${args.action}`);
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  const message = String(err && err.message ? err.message : err);
  const authHint = /AuthFailure\.TokenFailure|Token verification failed|No valid identity/i.test(message)
    ? " Run `tcb login` to refresh CloudBase credentials, then retry."
    : "";
  console.error(`[tcbr-cloudrun-read] ${message}${authHint}`);
  process.exit(1);
});
