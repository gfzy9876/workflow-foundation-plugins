const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(process.env.EXPRESS_STAR_ROOT || path.join(os.homedir(), "Desktop", "TrystOfStars", "express_star"));
const localEnvPath = path.join(rootDir, ".env.local");
const cloudbasercPath = path.join(rootDir, "cloudbaserc.json");

const runtimeEnvKeys = [
  "ENV_ID",
  "STAR_VIRTUAL_NOTIFY_RELAY_TARGET",
  "STAR_VIRTUAL_NOTIFY_TOKEN",
  "WECHAT_MESSAGE_TOKEN",
  "WX_MESSAGE_TOKEN",
  "MP_MESSAGE_TOKEN",
  "WECHAT_MINIPROGRAM_APPID",
  "WECHAT_MINIPROGRAM_APPSECRET",
  "WX_MINIPROGRAM_APPID",
  "WX_MINIPROGRAM_APPSECRET",
  "MP_APPID",
  "MP_APPSECRET",
  "WECHAT_APPID",
  "WECHAT_APPSECRET",
  "STAR_VIRTUAL_OFFER_ID",
  "STAR_VIRTUAL_APPKEY_SANDBOX",
  "STAR_VIRTUAL_APPKEY_PROD",
  "STAR_VIRTUAL_ENV",
];

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

function readCloudbaserc() {
  if (!fs.existsSync(cloudbasercPath)) return {};
  return JSON.parse(fs.readFileSync(cloudbasercPath, "utf8"));
}

const localEnv = readDotEnv(localEnvPath);
const env = { ...localEnv, ...process.env };
const cloudbaserc = readCloudbaserc();
const envId = (
  env.ENV_ID ||
  env.TCB_ENV_ID ||
  env.WX_CLOUD_ENV ||
  (typeof cloudbaserc.envId === "string" ? cloudbaserc.envId : "")
).trim();
const shouldSyncRuntimeEnv = env.EXPRESS_STAR_SYNC_CLOUDFUNCTION_ENV === "1";
const shouldShowDetail = env.EXPRESS_STAR_SHOW_CLOUDFUNCTION_DETAIL === "1";

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
  if (envId) config.ENV_ID = envId;
  return config;
}

function readConfiguredFunctions() {
  const functions = Array.isArray(cloudbaserc.functions) ? cloudbaserc.functions : [];
  return functions.filter((item) => item && typeof item.name === "string" && item.name.trim());
}

function parseFunctionNames(argv, configuredFunctions) {
  const names = [];
  for (const arg of argv) {
    if (arg === "--skip-invoke") continue;
    if (arg.startsWith("--")) {
      throw new Error(`Unsupported option: ${arg}`);
    }
    names.push(arg);
  }
  if (names.length > 0) return names;
  return configuredFunctions.map((item) => item.name);
}

function copyCloudfunctionsTo(tempRoot) {
  const sourceRoot = path.join(rootDir, cloudbaserc.functionRoot || "cloudfunctions");
  const targetRoot = path.join(tempRoot, "cloudfunctions");
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter(sourcePath) {
      const baseName = path.basename(sourcePath);
      if (baseName === "node_modules" || baseName === ".git" || baseName === ".DS_Store") return false;
      if (baseName.endsWith(".log")) return false;
      return true;
    },
  });
}

function createTempCloudbaserc(tempRoot, functions, runtimeEnvConfig) {
  const tempConfig = {
    version: cloudbaserc.version || "2.0",
    envId,
    functionRoot: "cloudfunctions",
    functions: functions.map((item) => {
      const config = {
        name: item.name,
        handler: item.handler || "index.main",
        runtime: item.runtime || "Nodejs18.15",
        timeout: item.timeout || 30,
        memorySize: item.memorySize || 256,
        installDependency: item.installDependency !== false,
        ignore: item.ignore || ["node_modules/**", ".git/**", "*.log"],
        triggers: Array.isArray(item.triggers) ? item.triggers : [],
      };
      if (shouldSyncRuntimeEnv) {
        config.envVariables = runtimeEnvConfig;
      }
      return config;
    }),
  };
  fs.writeFileSync(path.join(tempRoot, "cloudbaserc.json"), `${JSON.stringify(tempConfig, null, 2)}\n`);
}

function run(command, args, options = {}) {
  console.log(`[express_star] ${command} ${args.join(" ")}`);
  const child = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ...localEnv,
      ENV_ID: envId,
    },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    if (options.allowFailure) return false;
    throw new Error(`${command} ${args.join(" ")} exited with status ${child.status}`);
  }
  return true;
}

function main() {
  if (!envId) {
    throw new Error("Missing ENV_ID. Set it in .env.local or export ENV_ID before running express-star-cloudfunctions-deploy.");
  }

  const configuredFunctions = readConfiguredFunctions();
  if (configuredFunctions.length === 0) {
    throw new Error("No cloud functions configured in cloudbaserc.json.");
  }

  const skipInvoke = process.argv.includes("--skip-invoke");
  const functionNames = parseFunctionNames(process.argv.slice(2), configuredFunctions);
  const selectedFunctions = functionNames.map((name) => {
    const matched = configuredFunctions.find((item) => item.name === name);
    if (!matched) throw new Error(`Function ${name} is not configured in cloudbaserc.json.`);
    return matched;
  });
  const runtimeEnvConfig = buildRuntimeEnvConfig();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "express-star-functions-"));

  try {
    copyCloudfunctionsTo(tempRoot);
    createTempCloudbaserc(tempRoot, selectedFunctions, runtimeEnvConfig);

    console.log("[express_star] deploying CloudBase cloud functions:");
    console.log(`  ENV_ID=${envId}`);
    console.log(`  FUNCTIONS=${selectedFunctions.map((item) => item.name).join(",")}`);
    if (shouldSyncRuntimeEnv) {
      console.log(`  SYNC_RUNTIME_ENV=1`);
      console.log(`  RUNTIME_ENV_KEYS=${Object.keys(runtimeEnvConfig).join(",") || "(none)"}`);
    } else {
      console.log("  SYNC_RUNTIME_ENV=0 (remote function env variables are preserved)");
    }
    console.log(`  SHOW_DETAIL=${shouldShowDetail ? "1" : "0"}`);

    for (const fn of selectedFunctions) {
      run("tcb", ["fn", "deploy", fn.name, "-e", envId, "--force", "--yes"], { cwd: tempRoot });
      if (shouldShowDetail) {
        const detailOk = run("tcb", ["fn", "detail", fn.name, "-e", envId], {
          cwd: tempRoot,
          allowFailure: true,
        });
        if (!detailOk) {
          console.warn("[express_star] warning: tcb fn detail failed; continuing with invoke/list verification");
        }
      }
      if (!skipInvoke) {
        run("tcb", ["fn", "invoke", fn.name, "-e", envId, "--params", "{\"action\":\"ping\"}"], { cwd: tempRoot });
      }
    }
    run("tcb", ["fn", "list", "-e", envId, "-l", "100"], { cwd: tempRoot });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error(`[express_star] cloud functions deploy failed: ${err.message}`);
  process.exit(1);
}
