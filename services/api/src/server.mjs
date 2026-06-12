import { createServer } from "node:http";
import { execFile as nodeExecFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi, createPasswordHash, DEFAULT_PERMISSION_CODES } from "./api.mjs";

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) {
    return null;
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  return { key, value };
}

export function loadDotEnv(env = process.env, envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env")) {
  if (!existsSync(envPath)) {
    return false;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (parsed && env[parsed.key] === undefined) {
      env[parsed.key] = parsed.value;
    }
  }
  return true;
}

function parseJsonStringArray(value, name) {
  if (!value) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must be a JSON array of strings.`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be a JSON array of strings.`);
  }
  return parsed;
}

function safeAttachmentFilename(filename) {
  return String(filename ?? "attachment.bin")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 160) || "attachment.bin";
}

function localOcrCommandConfig(env = {}) {
  const provider = env.AIS_OCR_PROVIDER ?? (env.AIS_OCR_COMMAND ? "local-command-ocr" : "local-ocr-placeholder");
  if (provider === "local-ocr-placeholder") {
    return null;
  }
  const command = env.AIS_OCR_COMMAND ?? (provider === "local-tesseract" ? "tesseract" : null);
  if (!command) {
    return null;
  }
  const args =
    parseJsonStringArray(env.AIS_OCR_COMMAND_ARGS, "AIS_OCR_COMMAND_ARGS") ??
    (provider === "local-tesseract" ? ["{input}", "stdout", "-l", env.AIS_OCR_LANG ?? "chi_sim+eng"] : ["{input}"]);
  return {
    provider,
    model: env.AIS_OCR_MODEL ?? (provider === "local-tesseract" ? `tesseract:${env.AIS_OCR_LANG ?? "chi_sim+eng"}` : "local-command-v1"),
    command,
    args,
    timeoutMs: Number(env.AIS_OCR_TIMEOUT_MS ?? 30000)
  };
}

function expandOcrCommandArg(arg, context) {
  return arg
    .replaceAll("{input}", context.inputPath)
    .replaceAll("{filename}", context.filename)
    .replaceAll("{contentType}", context.contentType)
    .replaceAll("{attachmentId}", context.attachmentId);
}

function normalizeExecFileResult(result) {
  if (Array.isArray(result)) {
    return { stdout: result[0] ?? "", stderr: result[1] ?? "" };
  }
  return { stdout: result?.stdout ?? "", stderr: result?.stderr ?? "" };
}

function runExecFile(execFile, command, args, options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, stdout, stderr) => {
      settled = true;
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    };
    try {
      const result = execFile(command, args, options, done);
      if (result && typeof result.then === "function") {
        result.then((value) => {
          if (!settled) {
            resolve(normalizeExecFileResult(value));
          }
        }, reject);
      } else if (result && (Object.hasOwn(result, "stdout") || Object.hasOwn(result, "stderr"))) {
        resolve(normalizeExecFileResult(result));
      }
    } catch (error) {
      reject(error);
    }
  });
}

export function createLocalCommandOcrAdapter(env = {}, execFile = nodeExecFile) {
  const config = localOcrCommandConfig(env);
  if (!config) {
    return null;
  }
  return {
    provider: config.provider,
    model: config.model,
    async extractText({ attachment, content }) {
      const tempRoot = mkdtempSync(join(tmpdir(), "ais-ocr-"));
      const filename = safeAttachmentFilename(attachment.filename);
      const inputPath = join(tempRoot, filename);
      try {
        writeFileSync(inputPath, content);
        const args = config.args.map((arg) =>
          expandOcrCommandArg(arg, {
            inputPath,
            filename,
            contentType: attachment.contentType ?? "application/octet-stream",
            attachmentId: attachment.id
          })
        );
        const { stdout, stderr } = await runExecFile(execFile, config.command, args, {
          timeout: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 30000,
          maxBuffer: 10 * 1024 * 1024
        });
        const extractedText = String(stdout ?? "").trim();
        const warning = String(stderr ?? "").trim();
        return {
          provider: config.provider,
          model: config.model,
          status: extractedText ? "completed" : "completed_empty",
          extractedText,
          confidence: extractedText ? 0.72 : 0,
          warning: warning || null
        };
      } catch (error) {
        return {
          provider: config.provider,
          model: config.model,
          status: "failed",
          extractedText: "",
          confidence: 0,
          warning: `Local OCR command failed: ${error.message}`
        };
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  };
}

async function configurePrismaForSqlite(prisma, databaseUrl) {
  if (!databaseUrl?.startsWith("file:") || typeof prisma?.$queryRawUnsafe !== "function") {
    return;
  }
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
}

function splitSqlStatements(sql) {
  return sql
    .split(";")
    .map((statement) =>
      statement
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

function isIdempotentSqliteMigrationError(error) {
  const message = String(error?.message ?? error);
  return /already exists|duplicate column name/i.test(message);
}

async function applyBundledSqliteMigrations(prisma, migrationsRoot) {
  if (typeof prisma?.$executeRawUnsafe !== "function" || !existsSync(migrationsRoot)) {
    return;
  }
  const migrationDirs = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationDir of migrationDirs) {
    const migrationPath = join(migrationsRoot, migrationDir, "migration.sql");
    if (!existsSync(migrationPath)) {
      continue;
    }
    for (const statement of splitSqlStatements(readFileSync(migrationPath, "utf8"))) {
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (error) {
        if (!isIdempotentSqliteMigrationError(error)) {
          throw error;
        }
      }
    }
  }
}

async function seedLocalSystemAdministrator(platformStore, role, env) {
  const deploymentMode = env.AIS_DEPLOYMENT_MODE ?? env.DEPLOYMENT_MODE ?? "local";
  if (
    deploymentMode !== "local" ||
    !role?.id ||
    typeof platformStore?.findUserIdentity !== "function" ||
    typeof platformStore?.createUser !== "function"
  ) {
    return;
  }
  const username = env.AIS_DESKTOP_SYSTEM_USERNAME ?? "system";
  const password = env.AIS_DESKTOP_SYSTEM_PASSWORD ?? "system";
  const existingIdentity = await platformStore.findUserIdentity(username);
  if (existingIdentity) {
    return;
  }
  await platformStore.createUser({
    username,
    name: env.AIS_DESKTOP_SYSTEM_NAME ?? "系统管理员",
    passwordHash: createPasswordHash(username, password),
    roleId: role.id
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
  });
}

export function createHttpServer(api = createApi()) {
  return createServer(async (request, response) => {
    try {
      const result = await api.handle({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: await readRequestBody(request)
      });

      response.writeHead(result.status, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          code: "INVALID_REQUEST",
          message: error.message,
          traceId: "local-api"
        })
      );
    }
  });
}

function externalObjectUrl(env, storageKey) {
  const endpoint = String(env.AIS_ATTACHMENT_EXTERNAL_ENDPOINT ?? "").replace(/\/+$/, "");
  const bucket = String(env.AIS_ATTACHMENT_EXTERNAL_BUCKET ?? "").replace(/^\/+|\/+$/g, "");
  const key = String(storageKey ?? "").replace(/^\/+/, "");
  return `${endpoint}/${bucket}/${key}`;
}

function externalObjectHeaders(env) {
  const credentialRef = String(env.AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF ?? "");
  if (credentialRef.startsWith("header:")) {
    const [headerName, valueRef] = credentialRef.slice("header:".length).split("=", 2);
    const envName = valueRef?.startsWith("env:") ? valueRef.slice("env:".length).trim() : "";
    const value = envName ? env[envName] : null;
    return headerName && value ? { [headerName.trim()]: value } : {};
  }
  if (!credentialRef.startsWith("env:")) {
    return {};
  }
  const envName = credentialRef.slice("env:".length).trim();
  const token = env[envName];
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function resolveEnvSecretRef(env, ref) {
  const credentialRef = String(ref ?? "");
  if (!credentialRef.startsWith("env:")) {
    return null;
  }
  const envName = credentialRef.slice("env:".length).trim();
  return envName ? env[envName] ?? null : null;
}

function redactLlmDraftText(value, policy) {
  if (policy !== "enabled") {
    return value;
  }
  return String(value ?? "")
    .replace(/\b(1[3-9]\d)(\d{4})(\d{4})\b/g, "$1****$3")
    .replace(/\b(\d{6})\d{6,}(\d{4})\b/g, "$1******$2");
}

function redactLlmDraftInput(input, policy) {
  if (Array.isArray(input)) {
    return input.map((item) => redactLlmDraftInput(item, policy));
  }
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, redactLlmDraftInput(value, policy)]));
  }
  if (typeof input === "string") {
    return redactLlmDraftText(input, policy);
  }
  return input;
}

function parsePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function parseLlmDraftContent(content) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("LLM draft response did not include JSON content.");
  }
  return JSON.parse(text);
}

function createOpenAiCompatibleLlmDraftAdapter(env, fetchImpl = globalThis.fetch) {
  const provider = "openai-compatible";
  const model = env.AIS_LLM_DRAFT_MODEL ?? "openai-compatible-draft-model";
  const baseUrl = String(env.AIS_LLM_DRAFT_BASE_URL ?? "").replace(/\/+$/, "");
  const timeoutMs = parsePositiveInteger(env.AIS_LLM_DRAFT_TIMEOUT_MS);
  const maxTokens = parsePositiveInteger(env.AIS_LLM_DRAFT_MAX_TOKENS);
  const redaction = env.AIS_LLM_DRAFT_REDACTION ?? "disabled";
  const apiToken = resolveEnvSecretRef(env, env.AIS_LLM_DRAFT_API_KEY_REF);

  return {
    provider,
    model,
    async generateDraft(input) {
      if (typeof fetchImpl !== "function") {
        throw new Error("A fetch implementation is required for openai-compatible LLM draft generation.");
      }
      const redactedInput = redactLlmDraftInput(input, redaction);
      const controller = timeoutMs && typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {})
          },
          signal: controller?.signal,
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You generate ERP draft candidates only. Return strict JSON with draftPayload, unmatchedItems, warnings, and confidence. Never invent persisted master-data ids."
              },
              {
                role: "user",
                content: JSON.stringify(redactedInput)
              }
            ],
            temperature: 0,
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            response_format: { type: "json_object" }
          })
        });
        if (!response?.ok) {
          throw new Error(`LLM draft provider returned HTTP ${response?.status ?? "unknown"}.`);
        }
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? "";
        const parsed = parseLlmDraftContent(content);
        return {
          provider,
          model,
          status: "completed",
          draftPayload: parsed.draftPayload ?? parsed,
          unmatchedItems: Array.isArray(parsed.unmatchedItems) ? parsed.unmatchedItems : [],
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
          outputSchema: input.draftType
        };
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    }
  };
}

function createHttpExternalAttachmentStore(env, fetchImpl = globalThis.fetch) {
  return {
    async verifyObject(object) {
      if (typeof fetchImpl !== "function") {
        throw new Error("A fetch implementation is required for external attachment storage verification.");
      }
      const response = await fetchImpl(externalObjectUrl(env, object.storageKey), {
        method: "HEAD",
        headers: externalObjectHeaders(env)
      });
      if (!response?.ok) {
        return { exists: false };
      }
      const byteSizeHeader = response.headers?.get?.("content-length");
      const checksum =
        response.headers?.get?.("x-ais-sha256-checksum") ??
        response.headers?.get?.("x-amz-meta-sha256") ??
        response.headers?.get?.("checksum-sha256") ??
        null;

      return {
        exists: true,
        byteSize: byteSizeHeader ? Number(byteSizeHeader) : undefined,
        checksum
      };
    }
  };
}

export async function createRuntimeApi(env = process.env, dependencies = {}) {
  const deploymentMode = env.AIS_DEPLOYMENT_MODE ?? env.DEPLOYMENT_MODE;
  const productionLikeModes = new Set(["production", "private-cloud", "saas"]);
  if (productionLikeModes.has(deploymentMode) && !env.AIS_JWT_SECRET) {
    throw new Error("AIS_JWT_SECRET is required for production-like deployments.");
  }
  const tokenPreviousSecrets = String(env.AIS_JWT_PREVIOUS_SECRETS ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
  const jwtRotationExpiresAt = Date.parse(env.AIS_JWT_ROTATION_EXPIRES_AT ?? "");
  const jwtRotationMetadataConfigured = Boolean(
    env.AIS_JWT_ROTATION_APPROVED_BY &&
      env.AIS_JWT_ROTATION_EXPIRES_AT &&
      env.AIS_JWT_ROTATION_MONITOR_REF &&
      env.AIS_JWT_ROTATION_ROLLBACK_REF
  );
  if (productionLikeModes.has(deploymentMode) && tokenPreviousSecrets.length > 0 && !jwtRotationMetadataConfigured) {
    throw new Error(
      "AIS_JWT_ROTATION_APPROVED_BY, AIS_JWT_ROTATION_EXPIRES_AT, AIS_JWT_ROTATION_MONITOR_REF, and AIS_JWT_ROTATION_ROLLBACK_REF are required when AIS_JWT_PREVIOUS_SECRETS is set in production-like deployments."
    );
  }
  if (
    productionLikeModes.has(deploymentMode) &&
    tokenPreviousSecrets.length > 0 &&
    (!Number.isFinite(jwtRotationExpiresAt) || jwtRotationExpiresAt <= Date.now())
  ) {
    throw new Error("AIS_JWT_ROTATION_EXPIRES_AT must be a future ISO timestamp.");
  }
  const attachmentStorageProvider = env.AIS_ATTACHMENT_STORAGE_PROVIDER ?? "local";
  const externalAttachmentStorageConfigured = Boolean(
    env.AIS_ATTACHMENT_EXTERNAL_ENDPOINT &&
      env.AIS_ATTACHMENT_EXTERNAL_BUCKET &&
      env.AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF &&
      Number.isInteger(Number(env.AIS_ATTACHMENT_RETENTION_DAYS)) &&
      Number(env.AIS_ATTACHMENT_RETENTION_DAYS) > 0
  );
  if (
    productionLikeModes.has(deploymentMode) &&
    attachmentStorageProvider !== "external" &&
    !env.AIS_ATTACHMENT_STORAGE_ROOT
  ) {
    throw new Error(
      "AIS_ATTACHMENT_STORAGE_ROOT or AIS_ATTACHMENT_STORAGE_PROVIDER=external is required for production-like deployments."
    );
  }
  if (productionLikeModes.has(deploymentMode) && attachmentStorageProvider === "external" && !externalAttachmentStorageConfigured) {
    throw new Error(
      "AIS_ATTACHMENT_EXTERNAL_ENDPOINT, AIS_ATTACHMENT_EXTERNAL_BUCKET, AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF, and AIS_ATTACHMENT_RETENTION_DAYS are required for external attachment storage in production-like deployments."
    );
  }
  const ocrProvider = env.AIS_OCR_PROVIDER ?? (env.AIS_OCR_COMMAND ? "local-command-ocr" : "local-ocr-placeholder");
  if (productionLikeModes.has(deploymentMode) && ocrProvider !== "local-ocr-placeholder" && !env.AIS_OCR_MODEL) {
    throw new Error("AIS_OCR_MODEL is required when AIS_OCR_PROVIDER is configured in production-like deployments.");
  }
  const llmDraftProvider = env.AIS_LLM_DRAFT_PROVIDER ?? "local-rule-based";
  if (productionLikeModes.has(deploymentMode) && llmDraftProvider !== "local-rule-based" && !env.AIS_LLM_DRAFT_MODEL) {
    throw new Error("AIS_LLM_DRAFT_MODEL is required when AIS_LLM_DRAFT_PROVIDER is configured in production-like deployments.");
  }
  if (
    productionLikeModes.has(deploymentMode) &&
    llmDraftProvider !== "local-rule-based" &&
    (!env.AIS_LLM_DRAFT_BASE_URL || !env.AIS_LLM_DRAFT_API_KEY_REF)
  ) {
    throw new Error(
      "AIS_LLM_DRAFT_BASE_URL and AIS_LLM_DRAFT_API_KEY_REF are required when AIS_LLM_DRAFT_PROVIDER is configured in production-like deployments."
    );
  }

  const ocrAdapter = dependencies.ocrAdapter ?? createLocalCommandOcrAdapter({ ...env, AIS_OCR_PROVIDER: ocrProvider }, dependencies.execFile ?? nodeExecFile);
  const runtimeConfig = {
    deploymentMode,
    databaseUrl: env.DATABASE_URL,
    attachmentStorageRoot: env.AIS_ATTACHMENT_STORAGE_ROOT,
    attachmentStorageProvider,
    attachmentExternalEndpoint: env.AIS_ATTACHMENT_EXTERNAL_ENDPOINT,
    attachmentExternalBucket: env.AIS_ATTACHMENT_EXTERNAL_BUCKET,
    attachmentExternalCredentialRef: env.AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF,
    attachmentRetentionDays: env.AIS_ATTACHMENT_RETENTION_DAYS,
    ocrProvider,
    ocrModel: env.AIS_OCR_MODEL,
    ocrAdapter,
    llmDraftProvider: env.AIS_LLM_DRAFT_PROVIDER,
    llmDraftModel: env.AIS_LLM_DRAFT_MODEL,
    llmDraftTimeoutMs: env.AIS_LLM_DRAFT_TIMEOUT_MS,
    llmDraftMaxTokens: env.AIS_LLM_DRAFT_MAX_TOKENS,
    llmDraftBaseUrl: env.AIS_LLM_DRAFT_BASE_URL,
    llmDraftApiKeyRef: env.AIS_LLM_DRAFT_API_KEY_REF,
    llmDraftRedaction: env.AIS_LLM_DRAFT_REDACTION,
    idempotencyTtlHours: env.AIS_IDEMPOTENCY_TTL_HOURS,
    idempotencyTtlMs: env.AIS_IDEMPOTENCY_TTL_MS,
    restoreDrill: env.RESTORE_DRILL ?? env.AIS_RESTORE_DRILL,
    restoreDrillEnvVar: env.RESTORE_DRILL !== undefined ? "RESTORE_DRILL" : env.AIS_RESTORE_DRILL !== undefined ? "AIS_RESTORE_DRILL" : null,
    llmDraftAdapter:
      dependencies.llmDraftAdapter ??
      (llmDraftProvider === "openai-compatible" ? createOpenAiCompatibleLlmDraftAdapter(env, dependencies.fetch) : undefined),
    tokenSecret: env.AIS_JWT_SECRET,
    tokenPreviousSecrets: tokenPreviousSecrets.join(","),
    tokenRotationApprovedBy: env.AIS_JWT_ROTATION_APPROVED_BY,
    tokenRotationExpiresAt: env.AIS_JWT_ROTATION_EXPIRES_AT,
    tokenRotationMonitorRef: env.AIS_JWT_ROTATION_MONITOR_REF,
    tokenRotationRollbackRef: env.AIS_JWT_ROTATION_ROLLBACK_REF,
    externalAttachmentStore:
      attachmentStorageProvider === "external"
        ? dependencies.externalAttachmentStore ?? createHttpExternalAttachmentStore(env, dependencies.fetch)
        : undefined,
    platformStoreMode: env.AIS_PLATFORM_STORE ?? "memory"
  };

  if (env.AIS_PLATFORM_STORE !== "prisma") {
    return createApi(runtimeConfig);
  }

  const prisma =
    dependencies.prisma ??
    (await import("../../../packages/database/src/index.js")).prisma;
  await configurePrismaForSqlite(prisma, env.DATABASE_URL);
  await applyBundledSqliteMigrations(
    prisma,
    dependencies.sqliteMigrationsRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../..", "packages", "database", "prisma", "migrations")
  );
  const createPlatformPersistence =
    dependencies.createPlatformPersistence ??
    (await import("../../../packages/database/src/platformPersistence.mjs")).createPlatformPersistence;
  const platformStore = createPlatformPersistence(prisma);
  let systemAdministratorRole = null;
  if (typeof platformStore.ensureSystemAdministratorPermissions === "function") {
    systemAdministratorRole = await platformStore.ensureSystemAdministratorPermissions(DEFAULT_PERMISSION_CODES);
  }
  await seedLocalSystemAdministrator(platformStore, systemAdministratorRole, env);

  return createApi({
    ...runtimeConfig,
    platformStore
  });
}

const entrypointPath = process.argv[1] ? resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (entrypointPath === modulePath) {
  loadDotEnv();
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  const api = await createRuntimeApi();
  createHttpServer(api).listen(port, "127.0.0.1", () => {
    console.log(`AIS ERP API listening on http://127.0.0.1:${port}`);
  });
}
