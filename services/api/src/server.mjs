import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./api.mjs";

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

async function configurePrismaForSqlite(prisma, databaseUrl) {
  if (!databaseUrl?.startsWith("file:") || typeof prisma?.$queryRawUnsafe !== "function") {
    return;
  }
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
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

  const runtimeConfig = {
    deploymentMode,
    databaseUrl: env.DATABASE_URL,
    attachmentStorageRoot: env.AIS_ATTACHMENT_STORAGE_ROOT,
    attachmentStorageProvider,
    attachmentExternalEndpoint: env.AIS_ATTACHMENT_EXTERNAL_ENDPOINT,
    attachmentExternalBucket: env.AIS_ATTACHMENT_EXTERNAL_BUCKET,
    attachmentExternalCredentialRef: env.AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF,
    attachmentRetentionDays: env.AIS_ATTACHMENT_RETENTION_DAYS,
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
  const createPlatformPersistence =
    dependencies.createPlatformPersistence ??
    (await import("../../../packages/database/src/platformPersistence.mjs")).createPlatformPersistence;

  return createApi({
    ...runtimeConfig,
    platformStore: createPlatformPersistence(prisma)
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
