const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(process.env.EXPRESS_STAR_ROOT || path.join(os.homedir(), "Desktop", "TrystOfStars", "express_star"));
const localEnvPath = path.join(rootDir, ".env.local");
const cloudbasercPath = path.join(rootDir, "cloudbaserc.json");

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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

const localEnv = readDotEnv(localEnvPath);
const env = { ...localEnv, ...process.env };
function readCloudbasercEnvId() {
  if (!fs.existsSync(cloudbasercPath)) return "";
  try {
    const parsed = JSON.parse(fs.readFileSync(cloudbasercPath, "utf8"));
    return typeof parsed.envId === "string" ? parsed.envId.trim() : "";
  } catch (_err) {
    return "";
  }
}

const envId = env.ENV_ID || env.TCB_ENV_ID || env.WX_CLOUD_ENV || readCloudbasercEnvId();
const serviceName = env.CLOUDRUN_SERVICE_NAME || "express-star";
const port = env.CLOUDRUN_PORT || env.PORT || "80";
const runtimeEnvKeys = [
  "ENV_ID",
  "CLOUDRUN_SERVICE_NAME",
  "CLOUDRUN_PORT",
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_CHAT_MODEL",
  "DASHSCOPE_TTS_MODEL",
  "DASHSCOPE_ASR_MODEL",
  "DASHSCOPE_MEMORY_SUMMARY_MODEL",
  "DASHSCOPE_TREEHOLE_CLASSIFIER_MODEL",
  "DASHSCOPE_COSYVOICE_WS_URL",
  "TAROT_COLLECTION",
  "TAROT_DRAW_TOKEN_SECRET",
  "FORTUNE_LLM_TIMEOUT_MS",
  "FORTUNE_LLM_MAX_TOKENS",
  "EXPRESS_STAR_ALLOW_DEBUG_OPENID",
  "EXPRESS_STAR_BUSINESS_LOG",
  "EXPRESS_STAR_HTTP_LOG",
  "WECHAT_MINIPROGRAM_APPID",
  "WECHAT_MINIPROGRAM_APPSECRET",
  "WX_MINIPROGRAM_APPID",
  "WX_MINIPROGRAM_APPSECRET",
  "MP_APPID",
  "MP_APPSECRET",
  "WECHAT_APPID",
  "WECHAT_APPSECRET",
  "WECHAT_PAY_APPID",
  "WECHAT_PAY_MCHID",
  "WECHAT_PAY_API_V3_KEY",
  "WECHAT_PAY_MERCHANT_SERIAL_NO",
  "WECHAT_PAY_PRIVATE_KEY",
  "WECHAT_PAY_PUBLIC_KEY_ID",
  "WECHAT_PAY_PUBLIC_KEY",
  "WECHAT_PAY_NOTIFY_URL",
  "STAR_PAYMENT_PROVIDER",
  "STAR_DEV_PRODUCTS",
  "STAR_FREE_QUOTA_JSON",
  "STAR_PAYMENT_NOTIFY_URL",
  "STAR_VIRTUAL_NOTIFY_URL",
  "STAR_VIRTUAL_NOTIFY_TOKEN",
  "STAR_VIRTUAL_OFFER_ID",
  "STAR_VIRTUAL_APPKEY_SANDBOX",
  "STAR_VIRTUAL_APPKEY_PROD",
  "STAR_VIRTUAL_ENV",
];

function normalizeRuntimeEnvValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildRuntimeEnvConfig() {
  const config = {};
  for (const key of runtimeEnvKeys) {
    const value = normalizeRuntimeEnvValue(env[key]);
    if (!value) continue;
    config[key] = value;
  }
  return config;
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
    throw new Error("Missing CloudBase auth. Run `tcb login` before deploying.");
  }

  const parsed = JSON.parse(fs.readFileSync(authPath, "utf8"));
  const credential = parsed.credential || {};
  const secretId = credential.secretId || credential.tmpSecretId || "";
  const secretKey = credential.secretKey || credential.tmpSecretKey || "";
  const token = credential.token || credential.tmpToken || "";
  if (!secretId || !secretKey) {
    throw new Error("Missing CloudBase credential. Run `tcb login` before deploying.");
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

async function requestTcbr(action, payload) {
  const credential = readCloudbaseCredential();
  const service = "tcbr";
  const version = "2022-02-17";
  const region = process.env.TENCENTCLOUD_REGION || "ap-shanghai";
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
    "X-TC-Region": region,
    "X-TC-Timestamp": String(timestamp),
    Authorization: [
      `TC3-HMAC-SHA256 Credential=${credential.secretId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", "),
  };
  if (credential.token) {
    headers["X-TC-Token"] = credential.token;
  }

  const response = await fetch(endpoint, { method, headers, body });
  const data = await response.json();
  const error = data && data.Response && data.Response.Error;
  if (error) {
    const message = [
      error.Message || "Tencent Cloud API request failed",
      data.Response.RequestId ? `requestId=${data.Response.RequestId}` : "",
      error.Code ? `code=${error.Code}` : "",
    ].filter(Boolean).join(" ");
    throw new Error(message);
  }
  return data.Response || {};
}

function parseCloudRunEnvParams(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    throw new Error(`CloudRun EnvParams is not valid JSON: ${err.message}`);
  }
}

async function syncCloudRunRuntimeEnv(runtimeEnvConfig) {
  const runtimeEnvKeys = Object.keys(runtimeEnvConfig);
  if (!runtimeEnvKeys.length) {
    console.log("[express_star] runtime env sync skipped: no local runtime env keys");
    return;
  }

  console.log(`[express_star] syncing CloudRun runtime env keys: ${runtimeEnvKeys.join(",")}`);
  const detail = await requestTcbr("DescribeCloudRunServerDetail", {
    EnvId: envId,
    ServerName: serviceName,
  });
  const previousConfig = detail.ServerConfig;
  if (!previousConfig || typeof previousConfig !== "object") {
    throw new Error("CloudRun service config not found");
  }

  const previousEnv = parseCloudRunEnvParams(previousConfig.EnvParams);
  const nextEnv = { ...previousEnv, ...runtimeEnvConfig };
  const changedKeys = runtimeEnvKeys.filter((key) => previousEnv[key] !== runtimeEnvConfig[key]);
  if (!changedKeys.length) {
    console.log("[express_star] CloudRun runtime env already up to date");
    return;
  }

  const serverBaseConfig = {
    EnvId: envId,
    ServerName: serviceName,
    OpenAccessTypes: previousConfig.OpenAccessTypes,
    Cpu: previousConfig.Cpu,
    Mem: previousConfig.Mem,
    MinNum: previousConfig.MinNum,
    MaxNum: previousConfig.MaxNum,
    PolicyDetails: previousConfig.PolicyDetails,
    CustomLogs: previousConfig.CustomLogs,
    EnvParams: JSON.stringify(nextEnv),
    InitialDelaySeconds: previousConfig.InitialDelaySeconds || 2,
    CreateTime: previousConfig.CreateTime,
    Port: previousConfig.Port || Number(port),
    HasDockerfile: true,
    Dockerfile: previousConfig.Dockerfile || "Dockerfile",
    BuildDir: previousConfig.BuildDir || ".",
  };

  await requestTcbr("UpdateCloudRunServerConfig", {
    EnvId: envId,
    ServerBaseConfig: serverBaseConfig,
  });
  console.log(`[express_star] CloudRun runtime env updated keys: ${changedKeys.join(",")}`);
}

const DEPLOY_EXCLUDE_NAMES = new Set([
  ".git",
  ".codex",
  ".cursor",
  ".claude",
  "coverage",
  "dist",
  "logs",
  "node_modules",
]);

function shouldCopyToDeploySource(sourcePath) {
  const relativePath = path.relative(rootDir, sourcePath);
  if (!relativePath) return true;
  const parts = relativePath.split(path.sep);
  const baseName = parts[parts.length - 1];
  if (parts.some((part) => DEPLOY_EXCLUDE_NAMES.has(part))) return false;
  if (baseName === ".DS_Store") return false;
  if (baseName === ".env" || baseName.startsWith(".env.")) return false;
  if (baseName.endsWith(".log")) return false;
  return true;
}

function prepareDeploySource() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "express-star-deploy-"));
  const sourceDir = path.join(tempRoot, "source");
  fs.cpSync(rootDir, sourceDir, {
    recursive: true,
    filter: shouldCopyToDeploySource,
  });
  return { tempRoot, sourceDir };
}

if (!envId) {
  console.error("Missing ENV_ID. Set it in .env.local or export ENV_ID before npm run deploy.");
  process.exit(1);
}

async function main() {
  const runtimeEnvConfig = buildRuntimeEnvConfig();
  await syncCloudRunRuntimeEnv(runtimeEnvConfig);

  const args = [
    "cloudrun",
    "deploy",
    "-e",
    envId,
    "-s",
    serviceName,
    "--port",
    port,
    "--source",
    "",
    "--force",
    ...process.argv.slice(2),
  ];

  const deploySource = prepareDeploySource();
  try {
    const sourceArgIndex = args.indexOf("--source") + 1;
    args[sourceArgIndex] = deploySource.sourceDir;

    console.log([
      "[express_star] deploying with official CloudBase CLI command:",
      `tcb ${args.join(" ")}`,
    ].join("\n"));
    const child = spawnSync("tcb", args, {
      cwd: deploySource.sourceDir,
      input: "\n\n",
      stdio: ["pipe", "inherit", "inherit"],
      env: {
        ...process.env,
        ...localEnv,
        ENV_ID: envId,
        CLOUDRUN_SERVICE_NAME: serviceName,
        CLOUDRUN_PORT: port,
      },
    });

    if (child.error) {
      throw child.error;
    }

    return child.status === null ? 1 : child.status;
  } finally {
    fs.rmSync(deploySource.tempRoot, { recursive: true, force: true });
  }
}

main().then((status) => {
  process.exit(status);
}).catch((err) => {
  console.error(`[express_star] deploy failed: ${err.message}`);
  process.exit(1);
});
