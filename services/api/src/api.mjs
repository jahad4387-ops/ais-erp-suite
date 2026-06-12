import {
  approveVoucher,
  assertAccountCodeMatchesRule,
  buildTrialBalance,
  createAccount,
  createAccountCodeRule,
  createVoucher,
  postVoucher,
  submitVoucher,
  rejectVoucher,
  voidVoucher,
  reverseVoucher
} from "../../../packages/domain/src/generalLedger.mjs";
import {
  closeAccountingPeriod,
  createAccountSet,
  disableAccountSet,
  enableAccountSet,
  generateAccountingPeriods,
  lockAccountingPeriod,
  openAccountingPeriod,
  setCurrentAccountingPeriod
} from "../../../packages/domain/src/platform.mjs";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const SYSTEM_PERMISSIONS = new Set(["*"]);
const DEFAULT_IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESTORE_DRILL_BLOCKED_CHANNELS = ["webhook", "email", "bank_api"];

function uniqueVoucherId() {
  return `voucher:${randomUUID()}`;
}

function uniqueVoucherStatusLogId() {
  return `voucher-status-log:${randomUUID()}`;
}
const DEFAULT_TOKEN_SECRET = "phase-1-local-secret";
const DEFAULT_ATTACHMENT_STORAGE_ROOT = fileURLToPath(new URL("../.attachment-storage", import.meta.url));
export const DEFAULT_PERMISSION_CODES = [
  "account_set.create",
  "account_set.manage",
  "account_set.view",
  "period.view",
  "period.open",
  "period.close",
  "account.create",
  "account.update",
  "account.delete",
  "account.view",
  "voucher.create",
  "voucher.update_own",
  "voucher.submit",
  "voucher.approve",
  "voucher.reject",
  "voucher.void",
  "voucher.post",
  "voucher.view",
  "ledger.view",
  "report.view",
  "report_template.manage",
  "report_run.manage",
  "report_export.manage",
  "report_interpretation.manage",
  "report_approval.manage",
  "agent_action.view",
  "agent_action.create",
  "agent_action.approve",
  "agent_action.execute",
  "agent_draft.convert",
  "ops.migration.manage",
  "ops.backup.manage",
  "security_event.view",
  "attachment.upload",
  "attachment.delete",
  "bank_reconciliation.create",
  "bank_reconciliation.match",
  "ai.generate_draft",
  "audit_log.view",
  "auxiliary.manage",
  "opening_balance.manage",
  "opening_balance.view",
  "account_set_user.manage",
  "user.manage",
  "role.manage",
  "partner.manage",
  "purchase_order.manage",
  "sales_order.manage",
  "purchase_receipt.manage",
  "sales_delivery.manage",
  "purchase_invoice.manage",
  "sales_invoice.manage",
  "counterparty_ledger.view",
  "payment_request.manage",
  "supplier_payment.manage",
  "payment_block.manage",
  "customer_receipt.manage",
  "collection_plan.view",
  "credit_exposure.view",
  "ap_settlement.manage",
  "ar_settlement.manage",
  "inventory_item.manage",
  "bom.manage",
  "warehouse.manage",
  "inventory_balance.manage",
  "inventory_movement.manage",
  "inventory_transfer.manage",
  "stock_count.manage",
  "work_order.manage",
  "material_requisition.manage",
  "product_receipt.manage",
  "mock_cost_input.manage",
  "cost_allocation.manage",
  "cost_voucher.manage",
  "inventory_reconciliation.view",
  "payroll_setup.manage",
  "payroll_run.manage",
  "payroll_payment.manage",
  "payroll_allocation.manage",
  "payroll_cost_pool.view",
  "fixed_asset_setup.manage",
  "fixed_asset_card.manage",
  "fixed_asset_transfer.manage",
  "fixed_asset_depreciation.manage",
  "fixed_asset_depreciation_pool.view",
  "fixed_asset_disposal.manage",
  "fixed_asset_count.manage",
  "fixed_asset_reconciliation.view"
];
const DEFAULT_ACTOR_PERMISSIONS = new Map([
  [
    "viewer",
    new Set(["account_set.view", "period.view", "account.view", "voucher.view", "ledger.view", "counterparty_ledger.view", "audit_log.view"])
  ]
]);
const DEFAULT_USERS = new Map([
  ["system", { id: "system", username: "system", password: "system", name: "系统", role: "系统管理员" }],
  ["viewer", { id: "viewer", username: "viewer", password: "viewer", name: "查询用户", role: "查询人" }]
]);
const DEFAULT_ROLES = [
  {
    id: "role:system-admin",
    name: "系统管理员",
    permissionCodes: [...DEFAULT_PERMISSION_CODES]
  },
  {
    id: "role:viewer",
    name: "查询用户",
    permissionCodes: ["account_set.view", "period.view", "account.view", "voucher.view", "ledger.view", "counterparty_ledger.view", "report.view"]
  }
];

function jsonResponse(status, body) {
  return { status, body };
}

function errorResponse(status, code, message, extras = {}) {
  return jsonResponse(status, {
    code,
    message,
    traceId: "local-api",
    ...extras
  });
}

function codedError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function tokenSecretFor(state) {
  return (
    state?.config?.tokenSecret ??
    globalThis.process?.env?.AIS_JWT_SECRET ??
    globalThis.process?.env?.JWT_SECRET ??
    DEFAULT_TOKEN_SECRET
  );
}

function tokenPreviousSecretsFor(state) {
  const value = state?.config?.tokenPreviousSecrets ?? globalThis.process?.env?.AIS_JWT_PREVIOUS_SECRETS ?? "";
  if (Array.isArray(value)) {
    return value.filter((secret) => typeof secret === "string" && secret.trim() !== "");
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
}

function tokenSecretsFor(state) {
  return [tokenSecretFor(state), ...tokenPreviousSecretsFor(state)];
}

function tokenRotationConfigFor(state) {
  return {
    approvedBy: state?.config?.tokenRotationApprovedBy ?? globalThis.process?.env?.AIS_JWT_ROTATION_APPROVED_BY ?? null,
    expiresAt: state?.config?.tokenRotationExpiresAt ?? globalThis.process?.env?.AIS_JWT_ROTATION_EXPIRES_AT ?? null,
    monitorRef: state?.config?.tokenRotationMonitorRef ?? globalThis.process?.env?.AIS_JWT_ROTATION_MONITOR_REF ?? null,
    rollbackRef: state?.config?.tokenRotationRollbackRef ?? globalThis.process?.env?.AIS_JWT_ROTATION_ROLLBACK_REF ?? null
  };
}

function attachmentStorageRootFor(state) {
  return (
    state?.config?.attachmentStorageRoot ??
    globalThis.process?.env?.AIS_ATTACHMENT_STORAGE_ROOT ??
    globalThis.process?.env?.STORAGE_PATH ??
    DEFAULT_ATTACHMENT_STORAGE_ROOT
  );
}

function attachmentStorageProviderFor(state) {
  return state?.config?.attachmentStorageProvider ?? globalThis.process?.env?.AIS_ATTACHMENT_STORAGE_PROVIDER ?? "local";
}

function attachmentExternalConfigFor(state) {
  const retentionDaysRaw =
    state?.config?.attachmentRetentionDays ?? globalThis.process?.env?.AIS_ATTACHMENT_RETENTION_DAYS ?? null;
  const retentionDays = Number(retentionDaysRaw);

  return {
    endpoint: state?.config?.attachmentExternalEndpoint ?? globalThis.process?.env?.AIS_ATTACHMENT_EXTERNAL_ENDPOINT ?? null,
    bucket: state?.config?.attachmentExternalBucket ?? globalThis.process?.env?.AIS_ATTACHMENT_EXTERNAL_BUCKET ?? null,
    credentialRef:
      state?.config?.attachmentExternalCredentialRef ??
      globalThis.process?.env?.AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF ??
      null,
    retentionDays: Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : null
  };
}

function attachmentRetentionDaysFor(state) {
  const retentionDays = Number(state?.config?.attachmentRetentionDays ?? globalThis.process?.env?.AIS_ATTACHMENT_RETENTION_DAYS ?? null);
  return Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : null;
}

function retentionUntilFor(state) {
  const retentionDays = attachmentRetentionDaysFor(state);
  return retentionDays ? `now+${retentionDays}d` : null;
}

function attachmentRetentionActive(attachment) {
  if (!attachment.retentionUntil) {
    return false;
  }
  if (String(attachment.retentionUntil).startsWith("now+")) {
    return true;
  }
  const retentionUntilTime = Date.parse(attachment.retentionUntil);
  return Number.isFinite(retentionUntilTime) && retentionUntilTime > Date.now();
}

function databaseProviderFor(databaseUrl) {
  if (!databaseUrl) {
    return "unconfigured";
  }
  if (databaseUrl.startsWith("file:")) {
    return "sqlite";
  }
  if (databaseUrl.startsWith("postgresql:") || databaseUrl.startsWith("postgres:")) {
    return "postgresql";
  }
  if (databaseUrl.startsWith("mysql:")) {
    return "mysql";
  }
  return "unknown";
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function enabledFlag(value) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function restoreDrillConfigFor(state) {
  const configValue =
    state.config.restoreDrill ??
    state.config.restoreDrillEnabled ??
    globalThis.process?.env?.RESTORE_DRILL ??
    globalThis.process?.env?.AIS_RESTORE_DRILL ??
    false;
  const enabled = enabledFlag(configValue);
  const envVar =
    state.config.restoreDrillEnvVar ??
    (globalThis.process?.env?.RESTORE_DRILL !== undefined
      ? "RESTORE_DRILL"
      : globalThis.process?.env?.AIS_RESTORE_DRILL !== undefined
        ? "AIS_RESTORE_DRILL"
        : null);
  return {
    enabled,
    silentSandbox: enabled,
    outboundBlocked: enabled,
    blockedChannels: [...RESTORE_DRILL_BLOCKED_CHANNELS],
    envVar
  };
}

function deploymentConfigFor(state) {
  const databaseUrl = state.config.databaseUrl ?? globalThis.process?.env?.DATABASE_URL ?? null;
  const attachmentStorageProvider = attachmentStorageProviderFor(state);
  const explicitAttachmentRoot =
    state.config.attachmentStorageRoot ??
    globalThis.process?.env?.AIS_ATTACHMENT_STORAGE_ROOT ??
    globalThis.process?.env?.STORAGE_PATH ??
    null;
  const attachmentRoot = attachmentStorageProvider === "local" ? explicitAttachmentRoot ?? attachmentStorageRootFor(state) : explicitAttachmentRoot;
  const externalAttachmentStorage = attachmentExternalConfigFor(state);
  const externalAttachmentStorageConfigured = Boolean(
    externalAttachmentStorage.endpoint &&
      externalAttachmentStorage.bucket &&
      externalAttachmentStorage.credentialRef &&
      externalAttachmentStorage.retentionDays
  );
  const tokenRotation = tokenRotationConfigFor(state);
  const previousSecretsPresent = tokenPreviousSecretsFor(state).length > 0;
  const ocrProvider =
    state.config.ocrAdapter?.provider ??
    state.config.ocrProvider ??
    globalThis.process?.env?.AIS_OCR_PROVIDER ??
    "local-ocr-placeholder";
  const ocrModel =
    state.config.ocrAdapter?.model ?? state.config.ocrModel ?? globalThis.process?.env?.AIS_OCR_MODEL ?? "local-placeholder-v1";
  const llmDraftProvider =
    state.config.llmDraftAdapter?.provider ??
    state.config.llmDraftProvider ??
    globalThis.process?.env?.AIS_LLM_DRAFT_PROVIDER ??
    "local-rule-based";
  const llmDraftModel =
    state.config.llmDraftAdapter?.model ??
    state.config.llmDraftModel ??
    globalThis.process?.env?.AIS_LLM_DRAFT_MODEL ??
    "local-draft-rules-v1";
  const llmDraftTimeoutMs = optionalPositiveInteger(
    state.config.llmDraftTimeoutMs ?? globalThis.process?.env?.AIS_LLM_DRAFT_TIMEOUT_MS ?? null
  );
  const llmDraftMaxTokens = optionalPositiveInteger(
    state.config.llmDraftMaxTokens ?? globalThis.process?.env?.AIS_LLM_DRAFT_MAX_TOKENS ?? null
  );
  const llmDraftBaseUrl = state.config.llmDraftBaseUrl ?? globalThis.process?.env?.AIS_LLM_DRAFT_BASE_URL ?? null;
  const llmDraftApiKeyRef = state.config.llmDraftApiKeyRef ?? globalThis.process?.env?.AIS_LLM_DRAFT_API_KEY_REF ?? null;
  const llmDraftRedaction = state.config.llmDraftRedaction ?? globalThis.process?.env?.AIS_LLM_DRAFT_REDACTION ?? "disabled";
  const idempotencyTtlMs = idempotencyTtlMsFor(state);
  const restoreDrill = restoreDrillConfigFor(state);

  return {
    deploymentMode: state.config.deploymentMode ?? globalThis.process?.env?.AIS_DEPLOYMENT_MODE ?? "local",
    platformStore:
      state.config.platformStoreMode ??
      globalThis.process?.env?.AIS_PLATFORM_STORE ??
      (state.config.platformStore ? "prisma" : "memory"),
    database: {
      provider: databaseProviderFor(databaseUrl),
      configured: Boolean(databaseUrl),
      urlPresent: Boolean(databaseUrl)
    },
    jwt: {
      secretConfigured: Boolean(state.config.tokenSecret ?? globalThis.process?.env?.AIS_JWT_SECRET ?? null),
      previousSecretsPresent,
      rotation: {
        required: previousSecretsPresent,
        configured: previousSecretsPresent
          ? Boolean(tokenRotation.approvedBy && tokenRotation.expiresAt && tokenRotation.monitorRef && tokenRotation.rollbackRef)
          : true,
        approvedByPresent: Boolean(tokenRotation.approvedBy),
        expiresAt: tokenRotation.expiresAt,
        monitorRefPresent: Boolean(tokenRotation.monitorRef),
        rollbackRefPresent: Boolean(tokenRotation.rollbackRef)
      }
    },
    attachmentStorage: {
      provider: attachmentStorageProvider,
      configured: attachmentStorageProvider === "external" ? externalAttachmentStorageConfigured : Boolean(attachmentRoot),
      rootPresent: Boolean(attachmentRoot),
      external: {
        endpointPresent: Boolean(externalAttachmentStorage.endpoint),
        bucketPresent: Boolean(externalAttachmentStorage.bucket),
        credentialRefPresent: Boolean(externalAttachmentStorage.credentialRef),
        retentionDaysConfigured: Boolean(externalAttachmentStorage.retentionDays),
        retentionDays: externalAttachmentStorage.retentionDays
      }
    },
    ai: {
      ocr: {
        provider: ocrProvider,
        model: ocrModel,
        configured: Boolean(ocrProvider && ocrModel),
        commandPresent: Boolean(state.config.ocrAdapter ?? state.config.ocrCommand ?? globalThis.process?.env?.AIS_OCR_COMMAND ?? null)
      },
      llmDraft: {
        provider: llmDraftProvider,
        model: llmDraftModel,
        configured:
          llmDraftProvider === "local-rule-based"
            ? Boolean(llmDraftModel)
            : Boolean(llmDraftProvider && llmDraftModel && llmDraftBaseUrl && llmDraftApiKeyRef),
        timeoutMs: llmDraftTimeoutMs,
        maxTokens: llmDraftMaxTokens,
        baseUrlPresent: Boolean(llmDraftBaseUrl),
        apiKeyRefPresent: Boolean(llmDraftApiKeyRef),
        redaction: llmDraftRedaction
      }
    },
    idempotency: {
      ttlMs: idempotencyTtlMs,
      ttlHours: idempotencyTtlMs / (60 * 60 * 1000)
    },
    restoreDrill: {
      enabled: restoreDrill.enabled,
      silentSandbox: restoreDrill.silentSandbox,
      outboundBlocked: restoreDrill.outboundBlocked,
      blockedChannels: restoreDrill.blockedChannels,
      envVar: restoreDrill.envVar
    }
  };
}

function safeStorageSegment(value) {
  const safe = String(value ?? "attachment")
    .replaceAll("\\", "_")
    .replaceAll("/", "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 128);
  return safe || "attachment";
}

function sha256Checksum(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function signTokenPayload(payloadText, tokenSecret = DEFAULT_TOKEN_SECRET) {
  return createHmac("sha256", tokenSecret).update(payloadText).digest("base64url");
}

function createAccessToken(user, tokenSecret = DEFAULT_TOKEN_SECRET) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      iat: 1
    })
  );
  const signature = signTokenPayload(`${header}.${payload}`, tokenSecret);
  return `${header}.${payload}.${signature}`;
}

function verifyAccessToken(token, tokenSecret = DEFAULT_TOKEN_SECRET) {
  if (typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts;
  const expected = signTokenPayload(`${header}.${payload}`, tokenSecret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function verifyAccessTokenWithSecrets(token, tokenSecrets) {
  for (const tokenSecret of tokenSecrets) {
    const claims = verifyAccessToken(token, tokenSecret);
    if (claims) {
      return claims;
    }
  }
  return null;
}

export function createPasswordHash(username, password) {
  const salt = base64Url(`${username}:phase-1`);
  const digest = createHmac("sha256", salt).update(password).digest("base64url");
  return `sha256:${salt}:${digest}`;
}

function verifyPassword(password, user) {
  if (typeof user?.passwordHash === "string") {
    const [, salt, expected] = user.passwordHash.split(":");
    if (!salt || !expected) {
      return false;
    }
    const actual = createHmac("sha256", salt).update(password).digest("base64url");
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
  return user?.password === password;
}

function normalizeUser(user) {
  if (user.passwordHash) {
    const { password, ...rest } = user;
    return rest;
  }
  const { password, ...rest } = user;
  return {
    ...rest,
    passwordHash: createPasswordHash(user.username, password)
  };
}

function splitPath(path) {
  return path.split("?")[0].split("/").filter(Boolean);
}

function queryParamsFor(path) {
  const [, query = ""] = path.split("?");
  return new URLSearchParams(query);
}

function requireIdempotencyKey(request) {
  if (request.method === "POST" && request.path === "/auth/login") {
    return null;
  }
  if (!WRITE_METHODS.has(request.method)) {
    return null;
  }

  const key = request.headers?.["Idempotency-Key"] ?? request.headers?.["idempotency-key"];
  if (!key) {
    return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", "Write requests must include Idempotency-Key.");
  }

  return null;
}

function idempotencyAccountSetScopeFor(request) {
  if (typeof request.body?.accountSetId === "string" && request.body.accountSetId.trim() !== "") {
    return request.body.accountSetId;
  }
  const segments = splitPath(request.path).map(decodeURIComponent);
  if (segments[0] === "account-sets" && typeof segments[1] === "string") {
    return segments[1];
  }
  return "global";
}

function accountSetIdFromRequest(request) {
  const scope = idempotencyAccountSetScopeFor(request);
  return scope === "global" ? null : scope;
}

function idempotencyTtlMsFor(state) {
  const configuredMs = Number(state.config.idempotencyTtlMs ?? globalThis.process?.env?.AIS_IDEMPOTENCY_TTL_MS ?? null);
  if (Number.isFinite(configuredMs) && configuredMs > 0) {
    return configuredMs;
  }
  const configuredHours = Number(state.config.idempotencyTtlHours ?? globalThis.process?.env?.AIS_IDEMPOTENCY_TTL_HOURS ?? null);
  if (Number.isFinite(configuredHours) && configuredHours > 0) {
    return configuredHours * 60 * 60 * 1000;
  }
  return DEFAULT_IDEMPOTENCY_TTL_MS;
}

function nowMsFor(state) {
  const current = typeof state.config.now === "function" ? state.config.now() : Date.now();
  const value = current instanceof Date ? current.getTime() : Number(current);
  return Number.isFinite(value) ? value : Date.now();
}

function idempotencyRecordExpired(record, nowMs) {
  return typeof record?.expiresAt !== "number" || record.expiresAt <= nowMs;
}

function actorIdFor(request, state) {
  const authorization = request.headers?.Authorization ?? request.headers?.authorization;
  const token = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  const claims = verifyAccessTokenWithSecrets(token, tokenSecretsFor(state));
  if (claims?.sub) {
    return claims.sub;
  }
  return request.headers?.["Actor-Id"] ?? request.headers?.["actor-id"] ?? "system";
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    roleId: user.roleId ?? null
  };
}

function permissionFor(request) {
  const segments = splitPath(request.path);

  if (request.method === "GET" && request.path === "/permissions") return "role.manage";
  if (request.method === "GET" && request.path === "/deployment/config") return "account_set.view";
  if (request.method === "GET" && request.path === "/roles") return "role.manage";
  if (request.method === "POST" && request.path === "/roles") return "role.manage";
  if (request.method === "PATCH" && segments.length === 2 && segments[0] === "roles") return "role.manage";
  if (request.method === "GET" && request.path === "/users") return "user.manage";
  if (request.method === "POST" && request.path === "/users") return "user.manage";
  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "users") return "user.manage";
  if (request.method === "POST" && request.path === "/account-sets") return "account_set.create";
  if (request.method === "GET" && request.path === "/account-sets") return "account_set.view";
  if (request.method === "GET" && segments.length === 2 && segments[0] === "account-sets") return "account_set.view";
  if (request.method === "PATCH" && segments.length === 2 && segments[0] === "account-sets") return "account_set.manage";
  if (request.method === "POST" && segments.length === 3 && segments[0] === "account-sets") {
    if (segments[2] === "enable" || segments[2] === "disable") return "account_set.manage";
  }
  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "account-sets" &&
    segments[2] === "periods" &&
    segments[3] === "generate"
  ) {
    return "period.open";
  }
  if (request.method === "GET" && segments.length === 3 && segments[0] === "account-sets" && segments[2] === "periods") {
    return "period.view";
  }
  if (segments.length === 3 && segments[0] === "account-sets" && segments[2] === "users") {
    if (request.method === "POST") return "account_set_user.manage";
    if (request.method === "GET") return "account_set.manage";
  }
  if (request.method === "GET" && request.path === "/periods") return "period.view";
  if (request.method === "POST" && segments.length === 3 && segments[0] === "periods" && segments[2] === "close") {
    return "period.close";
  }
  if (request.method === "POST" && segments.length === 3 && segments[0] === "periods") {
    if (segments[2] === "open" || segments[2] === "set-current") return "period.open";
    if (segments[2] === "lock") return "period.close";
  }
  if (request.method === "POST" && request.path === "/account-code-rules") return "account.create";
  if (request.method === "POST" && request.path === "/accounts") return "account.create";
  if (request.method === "POST" && request.path === "/accounts/import") return "account.create";
  if (request.method === "GET" && request.path === "/accounts/tree") return "account.view";
  if (request.method === "GET" && segments.length === 2 && segments[0] === "accounts") return "account.view";
  if (request.method === "PATCH" && segments.length === 2 && segments[0] === "accounts") return "account.update";
  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "accounts") return "account.delete";
  if (request.method === "POST" && segments.length === 3 && segments[0] === "accounts" && segments[2] === "disable") {
    return "account.update";
  }
  if (request.method === "POST" && segments.length === 3 && segments[0] === "accounts" && segments[2] === "enable") {
    return "account.update";
  }
  if (request.method === "GET" && request.path === "/accounts") return "account.view";
  if (request.method === "POST" && request.path === "/auxiliary-types") return "auxiliary.manage";
  if (request.method === "GET" && request.path === "/auxiliary-types") return "account.view";
  if (request.method === "POST" && request.path === "/auxiliary-items") return "auxiliary.manage";
  if (request.method === "GET" && request.path === "/auxiliary-items") return "account.view";
  if (request.method === "PATCH" && segments.length === 2 && segments[0] === "auxiliary-items") return "auxiliary.manage";
  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "auxiliary-items") return "auxiliary.manage";
  if (segments.length === 3 && segments[0] === "accounts" && segments[2] === "auxiliary-requirements") {
    if (request.method === "POST") return "auxiliary.manage";
    if (request.method === "GET") return "account.view";
  }
  if (request.method === "POST" && request.path === "/opening-balances") return "opening_balance.manage";
  if (request.method === "GET" && request.path === "/opening-balances") return "opening_balance.view";
  if (request.method === "GET" && request.path === "/opening-balances/trial-balance") return "opening_balance.view";
  if (request.method === "POST" && request.path === "/vouchers") return "voucher.create";
  if (request.method === "GET" && request.path === "/vouchers") return "voucher.view";
  if (request.method === "GET" && segments.length === 2 && segments[0] === "vouchers") return "voucher.view";
  if (request.method === "PATCH" && segments.length === 2 && segments[0] === "vouchers") return "voucher.update_own";
  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "vouchers") return "voucher.update_own";
  if (segments.length === 3 && segments[0] === "vouchers") {
    if (request.method === "POST" && segments[2] === "submit") return "voucher.submit";
    if (request.method === "POST" && segments[2] === "approve") return "voucher.approve";
    if (request.method === "POST" && segments[2] === "reject") return "voucher.reject";
    if (request.method === "POST" && segments[2] === "void") return "voucher.void";
    if (request.method === "POST" && segments[2] === "post") return "voucher.post";
    if (request.method === "POST" && segments[2] === "reverse") return "voucher.create"; // reversing creates a new voucher
    if (request.method === "POST" && segments[2] === "copy") return "voucher.create";
    if (request.method === "GET" && segments[2] === "status-logs") return "voucher.view";
  }
  if (request.method === "POST" && segments.length === 3 && segments[0] === "posting" && segments[1] === "post-voucher") {
    return "voucher.post";
  }
  if (request.method === "POST" && request.path === "/posting/post-batch") return "voucher.post";
  if (request.method === "POST" && request.path === "/posting/period-end/transfer-pl") return "period.close";
  if (request.method === "GET" && request.path === "/posting/batches") return "voucher.view";
  if (request.method === "GET" && segments.length === 3 && segments[0] === "posting" && segments[1] === "batches") {
    return "voucher.view";
  }
  if (request.method === "GET" && request.path === "/ledger/general-ledger") return "ledger.view";
  if (request.method === "GET" && request.path === "/ledger/trial-balance") return "ledger.view";
  if (request.method === "GET" && request.path === "/ledger/detail-ledger") return "ledger.view";
  if (request.method === "GET" && request.path === "/ledger/sub-ledger") return "ledger.view";
  if (request.method === "GET" && request.path === "/ledger/account-balances") return "ledger.view";
  if (request.method === "GET" && request.path === "/reports/account-balances") return "report.view";
  if (request.method === "GET" && request.path === "/reports/trial-balance") return "report.view";
  if (segments[0] === "report-templates") {
    return request.method === "GET" ? "report.view" : "report_template.manage";
  }
  if (segments[0] === "report-template-versions") {
    return request.method === "GET" ? "report.view" : "report_template.manage";
  }
  if (segments[0] === "report-runs" && segments.length === 3 && segments[2] === "exports") {
    return request.method === "GET" ? "report.view" : "report_export.manage";
  }
  if (segments[0] === "report-runs" && segments.length === 3 && segments[2] === "interpretations") {
    return request.method === "GET" ? "report.view" : "report_interpretation.manage";
  }
  if (segments[0] === "report-runs" && segments.length === 3 && segments[2] === "submit-review") {
    return "report_approval.manage";
  }
  if (segments[0] === "report-approvals") {
    return request.method === "GET" ? "report.view" : "report_approval.manage";
  }
  if (segments[0] === "management-analysis") {
    return "report.view";
  }
  if (segments[0] === "supply-chain" && segments[1] === "dashboard") {
    return "inventory_reconciliation.view";
  }
  if (segments[0] === "report-exports" || segments[0] === "ai-report-interpretations") {
    return "report.view";
  }
  if (segments[0] === "report-runs") {
    return request.method === "GET" ? "report.view" : "report_run.manage";
  }
  if (request.method === "GET" && (request.path === "/ledger/bank-statements" || request.path === "/bank/statements")) return "ledger.view";
  if (request.method === "POST" && (request.path === "/ledger/bank-statements/import" || request.path === "/bank/statements")) {
    return "bank_reconciliation.create";
  }
  if (request.method === "POST" && (request.path === "/ledger/bank-reconciliations" || request.path === "/bank/reconcile")) {
    return "bank_reconciliation.create";
  }
  if (request.method === "POST" && (request.path === "/close/profit-loss-carry-forward" || request.path === "/posting/period-end/transfer-pl")) {
    return "period.close";
  }
  if (request.method === "POST" && request.path === "/bank/reconcile/auto") return "bank_reconciliation.match";
  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "ledger" &&
    segments[1] === "bank-reconciliations" &&
    segments[3] === "match"
  ) {
    return "bank_reconciliation.match";
  }
  if (request.method === "GET" && request.path === "/audit-logs") return "audit_log.view";
  if (request.method === "GET" && segments.length === 2 && segments[0] === "security" && segments[1] === "events") {
    return "security_event.view";
  }
  if (segments[0] === "partners") {
    return "partner.manage";
  }
  if (segments[0] === "purchase-orders") {
    return "purchase_order.manage";
  }
  if (segments[0] === "sales-orders") {
    return "sales_order.manage";
  }
  if (segments[0] === "purchase-receipts") {
    return "purchase_receipt.manage";
  }
  if (segments[0] === "sales-deliveries") {
    return "sales_delivery.manage";
  }
  if (segments[0] === "purchase-invoices") {
    return "purchase_invoice.manage";
  }
  if (segments[0] === "sales-invoices") {
    return "sales_invoice.manage";
  }
  if (segments[0] === "counterparty-ledger") {
    if (request.method === "POST" && segments.length === 3 && segments[2] === "block-payment") return "payment_block.manage";
    return "counterparty_ledger.view";
  }
  if (segments[0] === "counterparty-ledger-summary" || segments[0] === "counterparty-aging") {
    return "counterparty_ledger.view";
  }
  if (segments[0] === "inventory-items") {
    return "inventory_item.manage";
  }
  if (segments[0] === "boms") {
    return "bom.manage";
  }
  if (segments[0] === "warehouses") {
    return "warehouse.manage";
  }
  if (segments[0] === "inventory-opening-balances") {
    return "inventory_balance.manage";
  }
  if (segments[0] === "inventory-movements") {
    return "inventory_movement.manage";
  }
  if (segments[0] === "inventory-balances" || segments[0] === "inventory-cost-layers") {
    return "inventory_balance.manage";
  }
  if (segments[0] === "inventory-transfers") {
    return "inventory_transfer.manage";
  }
  if (segments[0] === "stock-counts") {
    return "stock_count.manage";
  }
  if (segments[0] === "work-orders") {
    return "work_order.manage";
  }
  if (segments[0] === "production-plans" || segments[0] === "rework-orders") {
    return "work_order.manage";
  }
  if (segments[0] === "outsourcing-orders" || segments[0] === "line-side-warehouses" || segments[0] === "line-side-material-movements") {
    return "inventory_movement.manage";
  }
  if (segments[0] === "trace-rules" || segments[0] === "traceability") {
    return "inventory_balance.manage";
  }
  if (segments[0] === "material-requisitions") {
    return "material_requisition.manage";
  }
  if (segments[0] === "product-receipts") {
    return "product_receipt.manage";
  }
  if (segments[0] === "mock-cost-inputs") {
    return "mock_cost_input.manage";
  }
  if (segments[0] === "cost-allocations") {
    return "cost_allocation.manage";
  }
  if (segments[0] === "cost-voucher-drafts") {
    return "cost_voucher.manage";
  }
  if (segments[0] === "inventory-reconciliation") {
    return "inventory_reconciliation.view";
  }
  if (segments[0] === "payroll-categories" || segments[0] === "payroll-items" || segments[0] === "employee-payroll-profiles") {
    return "payroll_setup.manage";
  }
  if (segments[0] === "payroll-variable-imports" || segments[0] === "payroll-runs") {
    return "payroll_run.manage";
  }
  if (segments[0] === "payroll-payment-files") {
    return "payroll_payment.manage";
  }
  if (segments[0] === "payroll-allocations") {
    return "payroll_allocation.manage";
  }
  if (segments[0] === "payroll-cost-pools") {
    return "payroll_cost_pool.view";
  }
  if (segments[0] === "asset-categories" || segments[0] === "depreciation-methods") {
    return "fixed_asset_setup.manage";
  }
  if (segments[0] === "fixed-assets" || segments[0] === "asset-value-changes") {
    return "fixed_asset_card.manage";
  }
  if (segments[0] === "asset-transfers") {
    return "fixed_asset_transfer.manage";
  }
  if (segments[0] === "depreciation-runs") {
    return "fixed_asset_depreciation.manage";
  }
  if (segments[0] === "asset-depreciation-cost-pools") {
    return "fixed_asset_depreciation_pool.view";
  }
  if (segments[0] === "asset-disposals") {
    return "fixed_asset_disposal.manage";
  }
  if (segments[0] === "asset-counts") {
    return "fixed_asset_count.manage";
  }
  if (segments[0] === "fixed-asset-ledger" || segments[0] === "fixed-asset-reconciliation") {
    return "fixed_asset_reconciliation.view";
  }
  if (segments[0] === "payment-requests") {
    return "payment_request.manage";
  }
  if (segments[0] === "supplier-payments") {
    return "supplier_payment.manage";
  }
  if (segments[0] === "customer-receipts") {
    return "customer_receipt.manage";
  }
  if (segments[0] === "collection-plans") {
    return "collection_plan.view";
  }
  if (segments[0] === "credit-exposures") {
    return "credit_exposure.view";
  }
  if (segments[0] === "ap-settlements") {
    return "ap_settlement.manage";
  }
  if (segments[0] === "ar-settlements") {
    return "ar_settlement.manage";
  }
  if (request.method === "POST" && request.path === "/attachments/upload") return "attachment.upload";
  if (request.method === "POST" && request.path === "/attachment-links") return "attachment.upload";
  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "attachments") return "attachment.delete";
  if (request.method === "GET" && segments.length >= 2 && segments[0] === "attachments") return "voucher.view";
  if (request.method === "GET" && segments.length === 3 && segments[0] === "vouchers" && segments[2] === "attachments") {
    return "voucher.view";
  }
  if (request.method === "POST" && (request.path === "/ai/voucher-suggestions" || request.path === "/ai/voucher-drafts")) {
    return "ai.generate_draft";
  }
  if (["GET", "POST"].includes(request.method) && segments.length === 2 && segments[0] === "ai" && segments[1] === "llm-draft-runs") {
    return "ai.generate_draft";
  }
  if (request.method === "GET" && segments.length === 3 && segments[0] === "ai" && segments[1] === "llm-draft-runs" && segments[2] === "metrics") {
    return "ai.generate_draft";
  }
  if (request.method === "POST" && request.path === "/ai/ocr-preview") {
    return "ai.generate_draft";
  }
  if (
    request.method === "POST" &&
    ["/ai/reconciliation-suggestions", "/ai/collection-drafts", "/ai/exception-checks"].includes(request.path)
  ) {
    return "ai.generate_draft";
  }
  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "agent" &&
    segments[1] === "draft-candidates" &&
    ["convert", "reject"].includes(segments[3])
  ) {
    return "agent_draft.convert";
  }
  if (segments[0] === "agent" && segments[1] === "draft-candidates") {
    return "ai.generate_draft";
  }
  if (segments[0] === "agent-tools") {
    return "agent_action.view";
  }
  if (segments[0] === "agent-actions") {
    if (request.method === "POST" && segments.length === 1) return "agent_action.create";
    if (request.method === "GET") return "agent_action.view";
    if (request.method === "POST" && segments.length === 3 && segments[2] === "submit") return "agent_action.create";
    if (request.method === "POST" && segments.length === 3 && segments[2] === "approve") return "agent_action.approve";
    if (request.method === "POST" && segments.length === 3 && segments[2] === "execute") return "agent_action.execute";
    if (request.method === "POST" && segments.length === 3 && segments[2] === "reverse") return "agent_action.execute";
  }
  if (segments[0] === "ops" && segments[1] === "migrations") {
    return "ops.migration.manage";
  }
  if (segments[0] === "ops" && (segments[1] === "backups" || segments[1] === "restores")) {
    return "ops.backup.manage";
  }
  if (request.method === "GET" && segments.length === 3 && segments[0] === "ai" && segments[1] === "voucher-drafts") {
    return "ai.generate_draft";
  }
  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "ai" &&
    (segments[1] === "voucher-suggestions" || segments[1] === "voucher-drafts") &&
    segments[3] === "convert-to-voucher"
  ) {
    return "voucher.create";
  }

  return null;
}

async function permissionsForActor(state, actorId) {
  const cachedPermissions = state.permissionsByActor.get(actorId);
  if (cachedPermissions) {
    return cachedPermissions;
  }

  const identity = await state.config.platformStore?.findUserIdentityById?.(actorId);
  if (!identity) {
    return new Set();
  }

  const permissions = new Set(identity.permissionCodes);
  state.permissionsByActor.set(identity.user.id, permissions);
  return permissions;
}

async function requirePermission(request, state) {
  const permission = permissionFor(request);
  if (!permission) {
    return null;
  }

  const actorId = actorIdFor(request, state);
  const permissions = await permissionsForActor(state, actorId);
  if (permissions.has("*") || permissions.has(permission)) {
    return null;
  }
  if (hasPlatformAdministratorScope(state, actorId)) {
    return null;
  }

  await recordSecurityEvent(state, {
    accountSetId: accountSetIdFromRequest(request),
    eventType: "permission_denied",
    severity: "high",
    actorId,
    source: "api",
    objectType: "permission",
    objectId: permission,
    message: `Actor ${actorId} lacks ${permission}.`,
    payload: {
      method: request.method,
      path: request.path.split("?")[0],
      permission
    }
  });
  return errorResponse(403, "PERMISSION_DENIED", `Actor ${actorId} lacks ${permission}.`);
}

function createState(options = {}) {
  const state = {
    config: {
      tokenSecret: options.tokenSecret,
      tokenPreviousSecrets: options.tokenPreviousSecrets,
      tokenRotationApprovedBy: options.tokenRotationApprovedBy,
      tokenRotationExpiresAt: options.tokenRotationExpiresAt,
      tokenRotationMonitorRef: options.tokenRotationMonitorRef,
      tokenRotationRollbackRef: options.tokenRotationRollbackRef,
      attachmentStorageRoot: options.attachmentStorageRoot,
      attachmentStorageProvider: options.attachmentStorageProvider,
      attachmentExternalEndpoint: options.attachmentExternalEndpoint,
      attachmentExternalBucket: options.attachmentExternalBucket,
      attachmentExternalCredentialRef: options.attachmentExternalCredentialRef,
      attachmentRetentionDays: options.attachmentRetentionDays,
      externalAttachmentStore: options.externalAttachmentStore,
      ocrAdapter: options.ocrAdapter,
      ocrProvider: options.ocrProvider,
      ocrModel: options.ocrModel,
      llmDraftAdapter: options.llmDraftAdapter,
      llmDraftProvider: options.llmDraftProvider,
      llmDraftModel: options.llmDraftModel,
      llmDraftTimeoutMs: options.llmDraftTimeoutMs,
      llmDraftMaxTokens: options.llmDraftMaxTokens,
      llmDraftBaseUrl: options.llmDraftBaseUrl,
      llmDraftApiKeyRef: options.llmDraftApiKeyRef,
      llmDraftRedaction: options.llmDraftRedaction,
      platformStore: options.platformStore,
      deploymentMode: options.deploymentMode,
      databaseUrl: options.databaseUrl,
      platformStoreMode: options.platformStoreMode,
      idempotencyTtlMs: options.idempotencyTtlMs,
      idempotencyTtlHours: options.idempotencyTtlHours,
      restoreDrill: options.restoreDrill,
      restoreDrillEnabled: options.restoreDrillEnabled,
      restoreDrillEnvVar: options.restoreDrillEnvVar,
      now: options.now
    },
    accountSets: new Map(),
    periods: new Map(),
    accounts: new Map(),
    accountCodeRule: null,
    auxiliaryTypes: new Map(),
    auxiliaryItems: new Map(),
    accountAuxiliaryRequirements: [],
    openingBalances: new Map(),
    vouchers: new Map(),
    voucherStatusLogs: [],
    journalEntries: [],
    balances: [],
    postingBatches: new Map(),
    bankStatements: new Map(),
    bankReconciliations: new Map(),
    partners: new Map(),
    purchaseOrders: new Map(),
    salesOrders: new Map(),
    purchaseReceipts: new Map(),
    salesDeliveries: new Map(),
    purchaseInvoices: new Map(),
    salesInvoices: new Map(),
    counterpartyLedgerEntries: new Map(),
    paymentRequests: new Map(),
    supplierPayments: new Map(),
    customerReceipts: new Map(),
    collectionPlans: new Map(),
    apSettlements: new Map(),
    arSettlements: new Map(),
    inventoryItems: new Map(),
    agentMasterDataDrafts: new Map(),
    agentPayrollAllocationDrafts: new Map(),
    agentAssetChangeDrafts: new Map(),
    boms: new Map(),
    warehouses: new Map(),
    inventoryOpeningBalances: new Map(),
    inventoryMovements: new Map(),
    inventoryMovementDrafts: new Map(),
    inventoryBalances: new Map(),
    inventoryCostLayers: new Map(),
    inventoryTransfers: new Map(),
    stockCounts: new Map(),
    workOrders: new Map(),
    materialRequisitions: new Map(),
    productReceipts: new Map(),
    productionPlans: new Map(),
    reworkOrders: new Map(),
    outsourcingOrders: new Map(),
    traceRules: new Map(),
    traceQueryRuns: new Map(),
    lineSideWarehouseConfigs: new Map(),
    lineSideMaterialMovements: new Map(),
    mockCostInputs: new Map(),
    costAllocations: new Map(),
    inventoryCostAdjustments: new Map(),
    costVoucherDrafts: new Map(),
    inventoryReconciliationRuns: new Map(),
    payrollCategories: new Map(),
    payrollItems: new Map(),
    employeePayrollProfiles: new Map(),
    payrollVariableImports: new Map(),
    payrollRuns: new Map(),
    payrollRunLines: new Map(),
    payrollPaymentFiles: new Map(),
    payrollAllocations: new Map(),
    payrollCostPools: new Map(),
    assetCategories: new Map(),
    depreciationMethods: new Map(),
    fixedAssets: new Map(),
    assetTransfers: new Map(),
    assetValueChanges: new Map(),
    agentDepreciationRunDrafts: new Map(),
    depreciationRuns: new Map(),
    depreciationRunLines: new Map(),
    assetDepreciationCostPools: new Map(),
    assetDisposals: new Map(),
    assetCounts: new Map(),
    fixedAssetLedgerEntries: new Map(),
    fixedAssetReconciliationRuns: new Map(),
    reportTemplates: new Map(),
    reportTemplateVersions: new Map(),
    reportRuns: new Map(),
    reportExports: new Map(),
    aiReportInterpretations: new Map(),
    reportApprovals: new Map(),
    auditLogs: [],
    securityEvents: new Map(),
    aiVoucherSuggestions: new Map(),
    agentActions: new Map(),
    agentApprovals: [],
    agentReplayEvents: [],
    migrationJobs: new Map(),
    backupJobs: new Map(),
    restoreJobs: new Map(),
    agentDraftCandidates: new Map(),
    llmDraftRuns: new Map(),
    attachments: new Map(),
    attachmentLinks: [],
    accountSetAccessByActor: new Map(),
    accountSetUserGrants: [],
    permissions: DEFAULT_PERMISSION_CODES.map((code) => ({ code, description: code })),
    roles: new Map(DEFAULT_ROLES.map((role) => [role.id, { ...role, permissionCodes: [...role.permissionCodes] }])),
    idempotency: new Map()
  };
  state.users = new Map([...DEFAULT_USERS.entries()].map(([username, user]) => [username, normalizeUser(user)]));
  state.permissionsByActor = new Map(DEFAULT_ACTOR_PERMISSIONS);
  state.permissionsByActor.set("system", SYSTEM_PERMISSIONS);
  for (const role of state.roles.values()) {
    if (role.id === "role:system-admin") {
      state.permissionsByActor.set("system", SYSTEM_PERMISSIONS);
    }
    if (role.id === "role:viewer") {
      state.permissionsByActor.set("viewer", new Set(role.permissionCodes));
    }
  }
  return state;
}

async function validateRolePayload(state, body, currentRoleId = null) {
  if (typeof body.name !== "string" || body.name.trim() === "") {
    throw new Error("name is required.");
  }
  if (!Array.isArray(body.permissionCodes) || body.permissionCodes.length === 0) {
    throw new Error("permissionCodes are required.");
  }
  const platformStore = state.config.platformStore;
  const availablePermissions = platformStore ? await platformStore.listPermissions() : state.permissions;
  const knownPermissions = new Set(availablePermissions.map((permission) => permission.code));
  for (const code of body.permissionCodes) {
    if (!knownPermissions.has(code)) {
      throw new Error(`Unknown permission ${code}.`);
    }
  }
  const existingRoles = platformStore ? await platformStore.listRoles() : [...state.roles.values()];
  const duplicate = existingRoles.find((role) => role.name === body.name && role.id !== currentRoleId);
  if (duplicate) {
    return { error: errorResponse(409, "ROLE_ALREADY_EXISTS", "Role name already exists.") };
  }
  return {
    name: body.name,
    description: body.description ?? "",
    permissionCodes: [...body.permissionCodes]
  };
}

async function wouldRemoveLastRoleManager(state, roleId, nextPermissionCodes) {
  if (nextPermissionCodes.includes("role.manage")) {
    return false;
  }
  const roles = state.config.platformStore ? await state.config.platformStore.listRoles() : [...state.roles.values()];
  return roles.filter((role) => role.id !== roleId).every((role) => !role.permissionCodes?.includes("role.manage"));
}

async function refreshRolePermissionsForUsers(state, role) {
  const users = state.config.platformStore?.listUsers
    ? await state.config.platformStore.listUsers()
    : [...state.users.values()].map(publicUser);
  for (const user of users) {
    if (user.roleId === role.id) {
      state.permissionsByActor.set(user.id, new Set(role.permissionCodes));
    }
  }
}

async function findUserByIdentifier(state, identifier) {
  const users = state.config.platformStore?.listUsers
    ? await state.config.platformStore.listUsers()
    : [...state.users.values()].map(publicUser);
  return users.find((user) => user.id === identifier || user.username === identifier) ?? null;
}

async function findPeriod(state, voucher) {
  const localPeriod = [...state.periods.values()].find(
    (period) =>
      period.accountSetId === voucher.accountSetId &&
      period.fiscalYear === voucher.fiscalYear &&
      period.periodNo === voucher.periodNo
  );
  if (localPeriod) {
    return localPeriod;
  }
  if (state.config.platformStore?.listAccountingPeriods) {
    const periods = await state.config.platformStore.listAccountingPeriods(voucher.accountSetId);
    const persistedPeriod = periods.find(
      (period) =>
        period.accountSetId === voucher.accountSetId &&
        period.fiscalYear === voucher.fiscalYear &&
        period.periodNo === voucher.periodNo
    );
    if (persistedPeriod) {
      state.periods.set(persistedPeriod.id, persistedPeriod);
      return persistedPeriod;
    }
  }
  return null;
}

async function voucherPeriodMutationError(state, voucher, action) {
  const period = await findPeriod(state, voucher);
  if (period?.status === "open") {
    return null;
  }
  return errorResponse(
    409,
    "VOUCHER_PERIOD_CLOSED",
    `Voucher period must be open before ${action}.`
  );
}

async function findVoucherByIdentifier(state, identifier) {
  const localVoucher = state.vouchers.get(identifier);
  if (localVoucher) {
    return localVoucher;
  }
  if (state.config.platformStore?.listVouchers) {
    const vouchers = await state.config.platformStore.listVouchers();
    return vouchers.find((voucher) => voucher.id === identifier || voucher.voucherNo === identifier) ?? null;
  }
  return null;
}

async function generateVoucherNo(state, input) {
  const voucherType = input.voucherType ?? "记";
  const prefix = `${voucherType}-`;
  const persistedVouchers = state.config.platformStore?.listVouchers
    ? await state.config.platformStore.listVouchers(input.accountSetId)
    : [];
  const vouchers = [...new Map([...state.vouchers.values(), ...persistedVouchers].map((voucher) => [voucher.id, voucher])).values()];
  const usedNumbers = vouchers
    .filter(
      (voucher) =>
        voucher.accountSetId === input.accountSetId &&
        voucher.fiscalYear === input.fiscalYear &&
        voucher.periodNo === input.periodNo &&
        typeof voucher.voucherNo === "string" &&
        voucher.voucherNo.startsWith(prefix)
    )
    .map((voucher) => Number(voucher.voucherNo.slice(prefix.length)))
    .filter((value) => Number.isInteger(value) && value > 0);
  const next = usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function updateVoucherDraft(voucher, input) {
  if (!["draft", "rejected"].includes(voucher?.status)) {
    throw new Error("Only draft or rejected vouchers can be updated.");
  }
  const currentRevision = Number.isInteger(voucher.revision) ? voucher.revision : 1;
  if (input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) {
    throw new Error(`Voucher was modified by another user. Refresh and retry with revision ${currentRevision}.`);
  }

  const candidate = createVoucher({
    id: voucher.id,
    accountSetId: voucher.accountSetId,
    fiscalYear: input.fiscalYear ?? voucher.fiscalYear,
    periodNo: input.periodNo ?? voucher.periodNo,
    voucherNo: voucher.voucherNo,
    voucherDate: input.voucherDate ?? voucher.voucherDate,
    createdBy: voucher.createdBy,
    sourceType: input.sourceType ?? voucher.sourceType,
    aiDraftId: voucher.aiDraftId,
    attachmentCount: voucher.attachmentCount,
    lines: input.lines ?? voucher.lines
  });

  return {
    ...candidate,
    status: voucher.status,
    submittedBy: voucher.submittedBy ?? null,
    approvedBy: voucher.approvedBy ?? null,
    postedBy: voucher.postedBy ?? null,
    postedAt: voucher.postedAt ?? null,
    revision: currentRevision + 1,
    updatedBy: input.updatedBy ?? null,
    updatedAt: "now"
  };
}

function listAccounts(state) {
  return [...state.accounts.values()];
}

async function listVoucherAccounts(state, voucher) {
  return state.config.platformStore?.listAccounts
    ? state.config.platformStore.listAccounts(voucher.accountSetId)
    : listAccounts(state);
}

function buildAccountTree(accounts) {
  const nodesById = new Map(accounts.map((account) => [account.id, { ...account, children: [] }]));
  const roots = [];

  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (nodes) => {
    nodes.sort((left, right) => left.code.localeCompare(right.code));
    for (const node of nodes) {
      sortTree(node.children);
    }
    return nodes;
  };

  return sortTree(roots);
}

function findAccountByIdentifier(state, identifier) {
  return [...state.accounts.values()].find((account) => account.code === identifier || account.id === identifier);
}

async function findAccountByIdentifierWithStore(state, identifier) {
  return findAccountByIdentifier(state, identifier) ?? (state.config.platformStore?.findAccount ? await state.config.platformStore.findAccount(identifier) : null);
}

async function accountHasVoucherUsage(state, account) {
  const vouchers = state.config.platformStore?.listVouchers
    ? await state.config.platformStore.listVouchers()
    : [...state.vouchers.values()];
  return vouchers.some(
    (voucher) =>
      (!account.accountSetId || voucher.accountSetId === account.accountSetId) &&
      Array.isArray(voucher.lines) &&
      voucher.lines.some((line) => line.accountCode === account.code)
  );
}

function grantAccountSetAccess(state, actorId, accountSetId) {
  if (!actorId || actorId === "system") {
    return;
  }
  const grants = state.accountSetAccessByActor.get(actorId) ?? new Set();
  grants.add(accountSetId);
  state.accountSetAccessByActor.set(actorId, grants);
}

function hasPlatformAdministratorScope(state, actorId) {
  const permissions = state.permissionsByActor.get(actorId) ?? new Set();
  return (
    permissions.has("*") ||
    (permissions.has("role.manage") &&
      permissions.has("user.manage") &&
      permissions.has("account_set.manage") &&
      permissions.has("account_set_user.manage"))
  );
}

async function canAccessAccountSet(state, actorId, accountSetId) {
  if (hasPlatformAdministratorScope(state, actorId)) {
    return true;
  }
  if (state.accountSetAccessByActor.get(actorId)?.has(accountSetId)) {
    return true;
  }
  return state.config.platformStore?.canAccessAccountSet
    ? state.config.platformStore.canAccessAccountSet(actorId, accountSetId)
    : false;
}

async function filterRowsByAccountSetAccess(state, actorId, rows) {
  const visible = [];
  for (const row of rows) {
    if (await canAccessAccountSet(state, actorId, row.accountSetId)) {
      visible.push(row);
    }
  }
  return visible;
}

function accountSetAccessError(state, actorId, accountSetId) {
  appendAuditLog(state, {
    actorId,
    action: "account_set.access_denied",
    objectType: "account_set",
    objectId: accountSetId
  });
  return errorResponse(403, "ACCOUNT_SET_ACCESS_DENIED", `Actor ${actorId} cannot access account set ${accountSetId}.`);
}

function assertValidAccountSetStart(input) {
  if (!Number.isInteger(input.startYear) || input.startYear < 1900) {
    throw new Error("startYear must be a valid year.");
  }
  if (!Number.isInteger(input.startPeriod) || input.startPeriod < 1 || input.startPeriod > 12) {
    throw new Error("startPeriod must be an integer from 1 to 12.");
  }
}

function findAccountSetByIdentifier(state, identifier) {
  return [...state.accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier);
}

const BACKUP_JOB_TYPES = new Set(["full", "incremental"]);
const MIGRATION_JOB_TYPES = new Set(["master_data", "opening_balance", "voucher_history", "partner_master", "inventory_item_master"]);
const MIGRATION_SOURCE_TYPES = new Set(["excel", "csv", "legacy_erp", "api"]);
const MIGRATION_REQUIRED_FIELDS = {
  master_data: ["code", "name"],
  opening_balance: ["accountCode", "debit", "credit"],
  voucher_history: ["voucherDate", "summary", "accountCode", "debit", "credit"],
  partner_master: ["code", "name", "partnerType"],
  inventory_item_master: ["code", "name", "unit"]
};

function normalizeSourceRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => (row && typeof row === "object" && !Array.isArray(row) ? cloneReportPayload(row) : {}));
}

function migrationSourceSummaryFor(rows) {
  const fields = new Set();
  for (const row of rows) {
    for (const field of Object.keys(row)) {
      fields.add(field);
    }
  }
  return {
    rowCount: rows.length,
    fieldCount: fields.size,
    fields: [...fields].sort()
  };
}

function publicMigrationJob(job) {
  const { sourceRows, ...publicJob } = job;
  return cloneReportPayload(publicJob);
}

function createMigrationJobRecord(state, accountSet, body, actorId) {
  const jobType = body.jobType ?? "master_data";
  const sourceType = body.sourceType ?? "excel";
  if (!MIGRATION_JOB_TYPES.has(jobType)) {
    throw codedError("MIGRATION_JOB_TYPE_UNSUPPORTED", "jobType must be master_data, opening_balance, voucher_history, partner_master, or inventory_item_master.");
  }
  if (!MIGRATION_SOURCE_TYPES.has(sourceType)) {
    throw codedError("MIGRATION_SOURCE_TYPE_UNSUPPORTED", "sourceType must be excel, csv, legacy_erp, or api.");
  }
  const sourceRows = normalizeSourceRows(body.sourceRows);
  const job = {
    id: `migration-job:${randomUUID()}`,
    accountSetId: accountSet.id,
    jobType,
    sourceType,
    targetObjectType: body.targetObjectType ?? jobType,
    status: "draft",
    dryRun: true,
    businessMutation: false,
    requestedBy: body.requestedBy ?? actorId,
    createdAt: "now",
    completedAt: null,
    sourceSummary: migrationSourceSummaryFor(sourceRows),
    fieldMapping: cloneReportPayload(body.fieldMapping ?? {}),
    sourceRows,
    validation: { status: "pending", rowCount: sourceRows.length, errorCount: 0, warningCount: 0 },
    errorReport: { errors: [], warnings: [] },
    importSummary: null
  };
  state.migrationJobs.set(job.id, job);
  return job;
}

function readMappedMigrationValue(row, fieldMapping, logicalField) {
  const sourceField = fieldMapping[logicalField] ?? logicalField;
  return row[sourceField];
}

function migrationFieldMissing(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function runMigrationDryRun(job, body = {}, actorId = "system") {
  const fieldMapping = { ...job.fieldMapping, ...(body.fieldMapping ?? {}) };
  const sourceRows = body.sourceRows ? normalizeSourceRows(body.sourceRows) : normalizeSourceRows(job.sourceRows);
  const requiredFields = MIGRATION_REQUIRED_FIELDS[job.jobType] ?? [];
  const errors = [];
  const warnings = [];

  sourceRows.forEach((row, index) => {
    const rowNo = index + 1;
    for (const field of requiredFields) {
      const value = readMappedMigrationValue(row, fieldMapping, field);
      if (migrationFieldMissing(value)) {
        errors.push({
          rowNo,
          field,
          code: "REQUIRED_FIELD_MISSING",
          message: `${field} is required.`
        });
      }
    }
  });

  let trialBalance = null;
  if (["opening_balance", "voucher_history"].includes(job.jobType)) {
    const debit = sourceRows.reduce((sum, row) => sum + Number(readMappedMigrationValue(row, fieldMapping, "debit") ?? 0), 0);
    const credit = sourceRows.reduce((sum, row) => sum + Number(readMappedMigrationValue(row, fieldMapping, "credit") ?? 0), 0);
    trialBalance = {
      debit: Number(debit.toFixed(2)),
      credit: Number(credit.toFixed(2)),
      difference: Number((debit - credit).toFixed(2))
    };
    if (trialBalance.difference !== 0) {
      errors.push({
        rowNo: null,
        field: "trialBalance",
        code: "TRIAL_BALANCE_NOT_BALANCED",
        message: "Debit and credit totals must be balanced before import."
      });
    }
  }

  const validationStatus = errors.length === 0 ? "passed" : "failed";
  return {
    ...job,
    status: validationStatus === "passed" ? "dry_run_completed" : "dry_run_failed",
    dryRun: true,
    businessMutation: false,
    requestedBy: body.requestedBy ?? job.requestedBy ?? actorId,
    completedAt: "now",
    sourceSummary: migrationSourceSummaryFor(sourceRows),
    fieldMapping,
    sourceRows,
    validation: {
      status: validationStatus,
      rowCount: sourceRows.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      ...(trialBalance ? { trialBalance } : {})
    },
    errorReport: {
      errors,
      warnings
    },
    importSummary: null
  };
}

async function importOpeningBalancesFromMigrationJob(state, job, body = {}, actorId = "system") {
  if (job.status !== "dry_run_completed" || job.validation?.status !== "passed") {
    throw codedError("MIGRATION_DRY_RUN_REQUIRED", "Migration job must pass dry-run before import.", 409);
  }
  if (job.jobType !== "opening_balance") {
    throw codedError("MIGRATION_IMPORT_UNSUPPORTED", "Only opening_balance migration imports are supported in this phase.", 409);
  }
  const fiscalYear = body.fiscalYear;
  const periodNo = body.periodNo;
  if (!Number.isInteger(fiscalYear)) {
    throw codedError("MIGRATION_IMPORT_PERIOD_REQUIRED", "fiscalYear is required.", 400);
  }
  if (!Number.isInteger(periodNo)) {
    throw codedError("MIGRATION_IMPORT_PERIOD_REQUIRED", "periodNo is required.", 400);
  }
  const savedBalances = [];
  for (const row of normalizeSourceRows(job.sourceRows)) {
    const accountCode = readMappedMigrationValue(row, job.fieldMapping, "accountCode");
    const account = findAccountByIdentifier(state, accountCode);
    if (!account || account.accountSetId !== job.accountSetId) {
      throw codedError("MIGRATION_ACCOUNT_NOT_FOUND", `Account ${accountCode} was not found in this account set.`, 404);
    }
    const openingDebit = Number(readMappedMigrationValue(row, job.fieldMapping, "debit") ?? 0);
    const openingCredit = Number(readMappedMigrationValue(row, job.fieldMapping, "credit") ?? 0);
    if (!Number.isFinite(openingDebit) || !Number.isFinite(openingCredit) || openingDebit < 0 || openingCredit < 0) {
      throw codedError("MIGRATION_AMOUNT_INVALID", "Opening balance amounts must be non-negative numbers.", 400);
    }
    if (openingDebit > 0 && openingCredit > 0) {
      throw codedError("MIGRATION_AMOUNT_INVALID", "Opening balance cannot contain both debit and credit.", 400);
    }
    const openingBalance = {
      id: `opening-balance:${account.code}:${fiscalYear}:${periodNo}`,
      accountCode: account.code,
      accountName: account.name,
      accountId: account.id,
      normalBalance: account.normalBalance,
      fiscalYear,
      periodNo,
      openingDebit,
      openingCredit,
      enteredBy: body.requestedBy ?? job.requestedBy ?? actorId,
      enteredAt: "now"
    };
    const savedOpeningBalance = state.config.platformStore?.saveOpeningBalance
      ? await state.config.platformStore.saveOpeningBalance(openingBalance)
      : openingBalance;
    state.openingBalances.set(`${account.code}:${fiscalYear}:${periodNo}`, savedOpeningBalance);
    savedBalances.push(savedOpeningBalance);
  }

  return {
    ...job,
    status: "imported",
    dryRun: false,
    businessMutation: true,
    requestedBy: body.requestedBy ?? job.requestedBy ?? actorId,
    completedAt: "now",
    importSummary: {
      status: "imported",
      targetObjectType: "opening_balance",
      importedCount: savedBalances.length,
      fiscalYear,
      periodNo,
      objectIds: savedBalances.map((balance) => balance.id)
    }
  };
}

async function importPartnerMasterFromMigrationJob(state, job, body = {}, actorId = "system") {
  if (job.status !== "dry_run_completed" || job.validation?.status !== "passed") {
    throw codedError("MIGRATION_DRY_RUN_REQUIRED", "Migration job must pass dry-run before import.", 409);
  }
  if (job.jobType !== "partner_master") {
    throw codedError("MIGRATION_IMPORT_UNSUPPORTED", "Only partner_master jobs can use partner master import.", 409);
  }
  const requestedBy = body.requestedBy ?? job.requestedBy ?? actorId;
  const savedPartners = [];
  const existingPartners = await listPartners(state, job.accountSetId);
  for (const row of normalizeSourceRows(job.sourceRows)) {
    const validated = normalizePartnerInput({
      partnerType: readMappedMigrationValue(row, job.fieldMapping, "partnerType"),
      code: readMappedMigrationValue(row, job.fieldMapping, "code"),
      name: readMappedMigrationValue(row, job.fieldMapping, "name"),
      taxRate: readMappedMigrationValue(row, job.fieldMapping, "taxRate"),
      creditLimit: readMappedMigrationValue(row, job.fieldMapping, "creditLimit"),
      paymentTerms: readMappedMigrationValue(row, job.fieldMapping, "paymentTerms"),
      settlementMethod: readMappedMigrationValue(row, job.fieldMapping, "settlementMethod"),
      isEnabled: readMappedMigrationValue(row, job.fieldMapping, "isEnabled")
    });
    const duplicate = existingPartners.find((partner) => partnerCodeConflicts(partner, { accountSetId: job.accountSetId, ...validated }));
    if (duplicate) {
      throw codedError("MIGRATION_PARTNER_CODE_EXISTS", `Partner code ${validated.code} already exists in this account set.`, 409);
    }
    const partner = {
      id: `partner:${randomUUID()}`,
      accountSetId: job.accountSetId,
      ...validated
    };
    const savedPartner = state.config.platformStore?.createPartner ? await state.config.platformStore.createPartner(partner) : partner;
    state.partners.set(savedPartner.id, savedPartner);
    existingPartners.push(savedPartner);
    savedPartners.push(savedPartner);
    appendAuditLog(state, {
      actorId: requestedBy,
      action: "migration.partner_master.import",
      objectType: "partner",
      objectId: savedPartner.id
    });
  }

  return {
    ...job,
    status: "imported",
    dryRun: false,
    businessMutation: true,
    requestedBy,
    completedAt: "now",
    importSummary: {
      status: "imported",
      targetObjectType: "partner",
      importedCount: savedPartners.length,
      objectIds: savedPartners.map((partner) => partner.id)
    }
  };
}

function readMigrationBoolean(row, fieldMapping, logicalField, fallback = false) {
  const value = readMappedMigrationValue(row, fieldMapping, logicalField);
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "y", "是", "启用"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

async function importInventoryItemMasterFromMigrationJob(state, job, body = {}, actorId = "system") {
  if (job.status !== "dry_run_completed" || job.validation?.status !== "passed") {
    throw codedError("MIGRATION_DRY_RUN_REQUIRED", "Migration job must pass dry-run before import.", 409);
  }
  if (job.jobType !== "inventory_item_master") {
    throw codedError("MIGRATION_IMPORT_UNSUPPORTED", "Only inventory_item_master jobs can use inventory item master import.", 409);
  }
  const requestedBy = body.requestedBy ?? job.requestedBy ?? actorId;
  const savedItems = [];
  for (const row of normalizeSourceRows(job.sourceRows)) {
    const itemInput = normalizeInventoryItemInput({
      accountSetId: job.accountSetId,
      code: readMappedMigrationValue(row, job.fieldMapping, "code"),
      name: readMappedMigrationValue(row, job.fieldMapping, "name"),
      category: readMappedMigrationValue(row, job.fieldMapping, "category"),
      itemType: readMappedMigrationValue(row, job.fieldMapping, "itemType"),
      unit: readMappedMigrationValue(row, job.fieldMapping, "unit"),
      costMethod: readMappedMigrationValue(row, job.fieldMapping, "costMethod"),
      isBatchManaged: readMigrationBoolean(row, job.fieldMapping, "isBatchManaged"),
      isSerialManaged: readMigrationBoolean(row, job.fieldMapping, "isSerialManaged"),
      isManufactured: readMigrationBoolean(row, job.fieldMapping, "isManufactured"),
      shelfLifeDays: readMappedMigrationValue(row, job.fieldMapping, "shelfLifeDays"),
      isEnabled: readMigrationBoolean(row, job.fieldMapping, "isEnabled", true),
      createdBy: requestedBy
    });
    if (itemInput.isBatchManaged && itemInput.costMethod === "moving_average") {
      throw codedError("BATCH_COST_METHOD_CONFLICT", "Batch-managed inventory items must use FIFO or specific identification costing.", 409);
    }
    const duplicate = (await listInventoryItemsWithPersistence(state, job.accountSetId)).find((item) => item.code === itemInput.code);
    if (duplicate) {
      throw codedError("MIGRATION_INVENTORY_ITEM_CODE_EXISTS", `Inventory item code ${itemInput.code} already exists in this account set.`, 409);
    }
    const item = {
      id: `inventory-item:${randomUUID()}`,
      accountSetId: job.accountSetId,
      ...itemInput,
      createdAt: "now",
      updatedAt: "now"
    };
    const savedItem = state.config.platformStore?.createInventoryItem ? await state.config.platformStore.createInventoryItem(item) : item;
    state.inventoryItems.set(savedItem.id, savedItem);
    savedItems.push(savedItem);
    appendAuditLog(state, {
      actorId: requestedBy,
      action: "migration.inventory_item_master.import",
      objectType: "inventory_item",
      objectId: savedItem.id
    });
  }

  return {
    ...job,
    status: "imported",
    dryRun: false,
    businessMutation: true,
    requestedBy,
    completedAt: "now",
    importSummary: {
      status: "imported",
      targetObjectType: "inventory_item",
      importedCount: savedItems.length,
      objectIds: savedItems.map((item) => item.id)
    }
  };
}

async function importMigrationJob(state, job, body = {}, actorId = "system") {
  if (job.jobType === "opening_balance") {
    return importOpeningBalancesFromMigrationJob(state, job, body, actorId);
  }
  if (job.jobType === "partner_master") {
    return importPartnerMasterFromMigrationJob(state, job, body, actorId);
  }
  if (job.jobType === "inventory_item_master") {
    return importInventoryItemMasterFromMigrationJob(state, job, body, actorId);
  }
  throw codedError("MIGRATION_IMPORT_UNSUPPORTED", "Only opening_balance, partner_master, and inventory_item_master migration imports are supported in this phase.", 409);
}

function listMigrationJobs(state, { accountSetId = null, status = null, jobType = null } = {}) {
  return [...state.migrationJobs.values()]
    .filter((job) => {
      if (accountSetId && job.accountSetId !== accountSetId) return false;
      if (status && job.status !== status) return false;
      if (jobType && job.jobType !== jobType) return false;
      return true;
    })
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || right.id.localeCompare(left.id));
}

function rowBelongsToAccountSet(row, accountSetId) {
  return row?.accountSetId === accountSetId;
}

function countMapRowsByAccountSet(map, accountSetId) {
  return [...map.values()].filter((row) => rowBelongsToAccountSet(row, accountSetId)).length;
}

function countArrayRowsByAccountSet(rows, accountSetId) {
  return rows.filter((row) => rowBelongsToAccountSet(row, accountSetId)).length;
}

function backupTableCountsFor(state, accountSetId) {
  return {
    accountSets: findAccountSetByIdentifier(state, accountSetId) ? 1 : 0,
    accounts: countMapRowsByAccountSet(state.accounts, accountSetId),
    auxiliaryTypes: countMapRowsByAccountSet(state.auxiliaryTypes, accountSetId),
    auxiliaryItems: countMapRowsByAccountSet(state.auxiliaryItems, accountSetId),
    openingBalances: countMapRowsByAccountSet(state.openingBalances, accountSetId),
    vouchers: countMapRowsByAccountSet(state.vouchers, accountSetId),
    journalEntries: countArrayRowsByAccountSet(state.journalEntries, accountSetId),
    attachments: countMapRowsByAccountSet(state.attachments, accountSetId),
    partners: countMapRowsByAccountSet(state.partners, accountSetId),
    purchaseOrders: countMapRowsByAccountSet(state.purchaseOrders, accountSetId),
    salesOrders: countMapRowsByAccountSet(state.salesOrders, accountSetId),
    inventoryItems: countMapRowsByAccountSet(state.inventoryItems, accountSetId),
    inventoryMovements: countMapRowsByAccountSet(state.inventoryMovements, accountSetId),
    inventoryTransfers: countMapRowsByAccountSet(state.inventoryTransfers, accountSetId),
    stockCounts: countMapRowsByAccountSet(state.stockCounts, accountSetId),
    workOrders: countMapRowsByAccountSet(state.workOrders, accountSetId),
    materialRequisitions: countMapRowsByAccountSet(state.materialRequisitions, accountSetId),
    productReceipts: countMapRowsByAccountSet(state.productReceipts, accountSetId),
    payrollRuns: countMapRowsByAccountSet(state.payrollRuns, accountSetId),
    payrollAllocations: countMapRowsByAccountSet(state.payrollAllocations, accountSetId),
    fixedAssets: countMapRowsByAccountSet(state.fixedAssets, accountSetId),
    depreciationRuns: countMapRowsByAccountSet(state.depreciationRuns, accountSetId),
    assetDisposals: countMapRowsByAccountSet(state.assetDisposals, accountSetId),
    reportRuns: countMapRowsByAccountSet(state.reportRuns, accountSetId)
  };
}

function backupAttachmentHashVerificationFor(state, accountSetId, includeAttachments) {
  if (!includeAttachments) {
    return {
      status: "skipped",
      attachmentCount: 0,
      verifiedCount: 0,
      failedCount: 0
    };
  }
  const attachments = [...state.attachments.values()].filter((attachment) => attachment.accountSetId === accountSetId);
  const failed = attachments.filter((attachment) => typeof attachment.checksum !== "string" || !attachment.checksum.startsWith("sha256:"));
  return {
    status: attachments.length === 0 ? "completed_empty" : failed.length === 0 ? "completed" : "failed",
    attachmentCount: attachments.length,
    verifiedCount: attachments.length - failed.length,
    failedCount: failed.length
  };
}

function createBackupJobRecord(state, accountSet, body, actorId) {
  const backupType = body.backupType ?? "full";
  if (!BACKUP_JOB_TYPES.has(backupType)) {
    throw codedError("BACKUP_TYPE_UNSUPPORTED", "backupType must be full or incremental.");
  }
  const includeAttachments = body.includeAttachments !== false;
  const retentionDays = optionalPositiveInteger(body.retentionDays);
  const manifest = {
    accountSetId: accountSet.id,
    accountSetCode: accountSet.code,
    accountSetName: accountSet.name,
    backupType,
    includeAttachments,
    tableCounts: backupTableCountsFor(state, accountSet.id),
    generatedAt: "now"
  };
  const attachmentHashVerification = backupAttachmentHashVerificationFor(state, accountSet.id, includeAttachments);
  const snapshotRef = `backup-snapshot:${accountSet.id}:${state.backupJobs.size + 1}`;
  const checksum = sha256Checksum(
    Buffer.from(JSON.stringify({ snapshotRef, manifest, attachmentHashVerification }), "utf8")
  );
  const job = {
    id: `backup-job:${randomUUID()}`,
    accountSetId: accountSet.id,
    backupType,
    status: body.dryRun === true ? "dry_run_completed" : "completed",
    dryRun: body.dryRun === true,
    businessMutation: false,
    includeAttachments,
    retentionDays,
    requestedBy: body.requestedBy ?? actorId,
    createdAt: "now",
    completedAt: "now",
    snapshotRef,
    checksum,
    manifest,
    attachmentHashVerification
  };
  state.backupJobs.set(job.id, job);
  return job;
}

function listBackupJobs(state, { accountSetId = null, status = null } = {}) {
  return [...state.backupJobs.values()].filter(
    (job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status)
  );
}

function createRestoreJobRecord(state, accountSet, backupJob, body, actorId) {
  if (body.dryRun !== true) {
    throw codedError("RESTORE_DRY_RUN_REQUIRED", "Restore execution must use dryRun true in Phase 6.", 409);
  }
  if (body.targetEnvironment !== "restore_drill") {
    throw codedError("RESTORE_TARGET_ENVIRONMENT_REQUIRED", "targetEnvironment must be restore_drill.", 409);
  }
  const restoreDrill = restoreDrillConfigFor(state);
  if (!restoreDrill.enabled || !restoreDrill.silentSandbox || !restoreDrill.outboundBlocked) {
    throw codedError(
      "RESTORE_DRILL_REQUIRED",
      "Restore dry-runs must run in a RESTORE_DRILL/AIS_RESTORE_DRILL silent sandbox.",
      409
    );
  }
  const job = {
    id: `restore-job:${randomUUID()}`,
    accountSetId: accountSet.id,
    sourceBackupJobId: backupJob.id,
    status: "dry_run_completed",
    dryRun: true,
    restoreMode: "silent_sandbox",
    targetEnvironment: body.targetEnvironment,
    restorePointLabel: body.restorePointLabel ?? null,
    requestedBy: body.requestedBy ?? actorId,
    createdAt: "now",
    completedAt: "now",
    businessMutation: false,
    outboundBlocked: restoreDrill.outboundBlocked,
    blockedChannels: [...restoreDrill.blockedChannels],
    impactScope: {
      accountSetId: accountSet.id,
      accountSetCode: accountSet.code,
      sourceBackupJobId: backupJob.id,
      tableCounts: { ...backupJob.manifest.tableCounts }
    },
    validation: {
      status: "passed",
      backupChecksum: backupJob.checksum,
      attachmentHashVerification: backupJob.attachmentHashVerification.status
    }
  };
  state.restoreJobs.set(job.id, job);
  return job;
}

function listRestoreJobs(state, { accountSetId = null, status = null } = {}) {
  return [...state.restoreJobs.values()].filter(
    (job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status)
  );
}

const PARTNER_TYPES = new Set(["supplier", "customer", "both"]);

function normalizePartnerInput(input, current = {}) {
  const partnerType = input.partnerType ?? current.partnerType;
  if (!PARTNER_TYPES.has(partnerType)) {
    throw new Error("partnerType must be supplier, customer, or both.");
  }
  const code = input.code ?? current.code;
  const name = input.name ?? current.name;
  if (typeof code !== "string" || code.trim() === "") {
    throw new Error("code is required.");
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("name is required.");
  }
  const taxRate = Number(input.taxRate ?? current.taxRate ?? 0);
  const creditLimit = Number(input.creditLimit ?? current.creditLimit ?? 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    throw new Error("taxRate must be a number from 0 to 1.");
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    throw new Error("creditLimit must be a non-negative number.");
  }
  return {
    partnerType,
    code: code.trim(),
    name: name.trim(),
    taxRate,
    creditLimit,
    paymentTerms: input.paymentTerms ?? current.paymentTerms ?? "",
    settlementMethod: input.settlementMethod ?? current.settlementMethod ?? "",
    isEnabled: input.isEnabled ?? current.isEnabled ?? true
  };
}

function partnerMatchesType(partner, partnerType) {
  return !partnerType || partner.partnerType === partnerType || partner.partnerType === "both";
}

function partnerCodeConflicts(existingPartner, incomingPartner) {
  if (existingPartner.accountSetId !== incomingPartner.accountSetId || existingPartner.code !== incomingPartner.code) {
    return false;
  }
  return existingPartner.partnerType === incomingPartner.partnerType || existingPartner.partnerType === "both" || incomingPartner.partnerType === "both";
}

async function listPartners(state, accountSetId, partnerType = null) {
  const persistedPartners = state.config.platformStore?.listPartners
    ? await state.config.platformStore.listPartners(accountSetId, partnerType)
    : [];
  const partnersById = new Map(persistedPartners.map((partner) => [partner.id, partner]));
  for (const partner of state.partners.values()) {
    if (accountSetId && partner.accountSetId !== accountSetId) {
      continue;
    }
    if (!partnerMatchesType(partner, partnerType)) {
      continue;
    }
    partnersById.set(partner.id, partner);
  }
  return [...partnersById.values()].sort((left, right) => left.code.localeCompare(right.code));
}

async function findPartnerByIdentifier(state, identifier) {
  const localPartner = [...state.partners.values()].find((partner) => partner.id === identifier || partner.code === identifier);
  if (localPartner) {
    return localPartner;
  }
  return state.config.platformStore?.findPartner ? state.config.platformStore.findPartner(identifier) : null;
}

const INVENTORY_COST_METHODS = new Set(["moving_average", "fifo", "specific_identification", "monthly_weighted_average"]);

function normalizeInventoryItemInput(body) {
  if (!body.accountSetId) throw new Error("accountSetId is required.");
  if (!body.code || !body.name) throw new Error("Inventory item code and name are required.");
  if (!body.unit) throw new Error("Inventory item unit is required.");
  const costMethod = body.costMethod ?? "moving_average";
  if (!INVENTORY_COST_METHODS.has(costMethod)) {
    throw new Error("costMethod is not supported.");
  }
  return {
    code: String(body.code).trim(),
    name: String(body.name).trim(),
    category: body.category ?? null,
    itemType: body.itemType ?? "raw_material",
    unit: String(body.unit).trim(),
    costMethod,
    isBatchManaged: Boolean(body.isBatchManaged),
    isSerialManaged: Boolean(body.isSerialManaged),
    isManufactured: Boolean(body.isManufactured),
    shelfLifeDays: body.shelfLifeDays == null ? null : Number(body.shelfLifeDays),
    isEnabled: body.isEnabled ?? true,
    createdBy: body.createdBy ?? "system"
  };
}

function listInventoryItems(state, accountSetId) {
  return [...state.inventoryItems.values()]
    .filter((item) => item.accountSetId === accountSetId)
    .sort((left, right) => left.code.localeCompare(right.code));
}

async function listInventoryItemsWithPersistence(state, accountSetId) {
  const persistedItems = state.config.platformStore?.listInventoryItems
    ? await state.config.platformStore.listInventoryItems(accountSetId)
    : [];
  const itemsById = new Map();
  for (const item of persistedItems) {
    state.inventoryItems.set(item.id, item);
    itemsById.set(item.id, item);
  }
  for (const item of state.inventoryItems.values()) {
    if (item.accountSetId === accountSetId) {
      itemsById.set(item.id, item);
    }
  }
  return [...itemsById.values()].sort((left, right) => left.code.localeCompare(right.code));
}

function findInventoryItemByIdentifier(state, identifier) {
  return [...state.inventoryItems.values()].find((item) => item.id === identifier || item.code === identifier) ?? null;
}

function listBoms(state, accountSetId) {
  return [...state.boms.values()]
    .filter((bom) => bom.accountSetId === accountSetId)
    .sort((left, right) => `${left.productItemCode}:${left.version}`.localeCompare(`${right.productItemCode}:${right.version}`));
}

function listWarehouses(state, accountSetId) {
  return [...state.warehouses.values()]
    .filter((warehouse) => warehouse.accountSetId === accountSetId)
    .sort((left, right) => left.code.localeCompare(right.code));
}

function findWarehouseByIdentifier(state, identifier) {
  return [...state.warehouses.values()].find((warehouse) => warehouse.id === identifier || warehouse.code === identifier) ?? null;
}

function listInventoryOpeningBalances(state, accountSetId, { fiscalYear = null, periodNo = null } = {}) {
  return [...state.inventoryOpeningBalances.values()]
    .filter((balance) => {
      if (balance.accountSetId !== accountSetId) return false;
      if (fiscalYear && balance.fiscalYear !== Number(fiscalYear)) return false;
      if (periodNo && balance.periodNo !== Number(periodNo)) return false;
      return true;
    })
    .sort((left, right) => `${left.itemCode}:${left.warehouseCode}:${left.batchNo ?? ""}`.localeCompare(`${right.itemCode}:${right.warehouseCode}:${right.batchNo ?? ""}`));
}

function buildInventoryOpeningTrialBalance(state, accountSetId, filters = {}) {
  const rows = listInventoryOpeningBalances(state, accountSetId, filters);
  const totalQuantity = Number(rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0).toFixed(6));
  const totalAmount = Number(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2));
  return {
    accountSetId,
    fiscalYear: filters.fiscalYear ? Number(filters.fiscalYear) : null,
    periodNo: filters.periodNo ? Number(filters.periodNo) : null,
    totalQuantity,
    totalAmount,
    rows
  };
}

function roundQuantity(value) {
  return Number(Number(value ?? 0).toFixed(6));
}

function roundAmount(value) {
  return Number(Number(value ?? 0).toFixed(2));
}

function inventoryDimensionKey({ accountSetId, itemId, warehouseId, locationId = null, batchNo = null }) {
  return [accountSetId, itemId, warehouseId, locationId ?? "", batchNo ?? ""].join("|");
}

function findWarehouseLocation(warehouse, locationId) {
  if (!locationId) return null;
  return warehouse.locations.find((location) => location.id === locationId || location.code === locationId) ?? null;
}

function getInventoryBalance(state, { accountSetId, item, warehouse, location = null, batchNo = null }) {
  const key = inventoryDimensionKey({ accountSetId, itemId: item.id, warehouseId: warehouse.id, locationId: location?.id ?? null, batchNo });
  const existing = state.inventoryBalances.get(key);
  if (existing) return existing;
  const balance = {
    id: `inventory-balance:${randomUUID()}`,
    accountSetId,
    itemId: item.id,
    itemCode: item.code,
    itemName: item.name,
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    warehouseName: warehouse.name,
    locationId: location?.id ?? null,
    locationCode: location?.code ?? null,
    batchNo: batchNo ?? null,
    quantity: 0,
    amount: 0,
    unitCost: 0,
    updatedAt: "now"
  };
  state.inventoryBalances.set(key, balance);
  return balance;
}

function updateInventoryBalance(balance, { quantityDelta, amountDelta, forceZeroResidual = false }) {
  balance.quantity = roundQuantity(balance.quantity + quantityDelta);
  balance.amount = roundAmount(balance.amount + amountDelta);
  let zeroResidualAdjustment = 0;
  if (balance.quantity === 0 && forceZeroResidual && balance.amount !== 0) {
    zeroResidualAdjustment = roundAmount(-balance.amount);
    balance.amount = 0;
  }
  balance.unitCost = balance.quantity === 0 ? 0 : roundAmount(balance.amount / balance.quantity);
  balance.updatedAt = "now";
  return zeroResidualAdjustment;
}

function createInventoryCostLayer(state, { accountSetId, item, warehouse, location = null, batchNo = null, quantity, amount, movementId = null, lineId = null }) {
  const layer = {
    id: `inventory-cost-layer:${randomUUID()}`,
    accountSetId,
    itemId: item.id,
    itemCode: item.code,
    itemName: item.name,
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    locationId: location?.id ?? null,
    locationCode: location?.code ?? null,
    batchNo: batchNo ?? null,
    sourceMovementId: movementId,
    sourceLineId: lineId,
    receivedQuantity: roundQuantity(quantity),
    receivedAmount: roundAmount(amount),
    remainingQuantity: roundQuantity(quantity),
    remainingAmount: roundAmount(amount),
    unitCost: quantity === 0 ? 0 : roundAmount(amount / quantity),
    status: quantity === 0 ? "closed" : "open",
    createdAt: "now",
    createdSequence: state.inventoryCostLayers.size + 1
  };
  state.inventoryCostLayers.set(layer.id, layer);
  return layer;
}

function listInventoryBalances(state, accountSetId) {
  return [...state.inventoryBalances.values()]
    .filter((balance) => {
      if (balance.accountSetId !== accountSetId) return false;
      if (balance.batchNo && balance.quantity === 0 && balance.amount === 0) return false;
      return true;
    })
    .sort((left, right) =>
      `${left.itemCode}:${left.warehouseCode}:${left.batchNo ?? ""}`.localeCompare(
        `${right.itemCode}:${right.warehouseCode}:${right.batchNo ?? ""}`
      )
    );
}

function listInventoryCostLayers(state, accountSetId, { itemId = null, status = null } = {}) {
  return [...state.inventoryCostLayers.values()]
    .filter((layer) => {
      if (layer.accountSetId !== accountSetId) return false;
      if (itemId && layer.itemId !== itemId) return false;
      if (status && layer.status !== status) return false;
      return true;
    })
    .sort((left, right) => left.createdSequence - right.createdSequence);
}

function applyInventoryOpeningBalanceToLedger(state, opening) {
  const item = findInventoryItemByIdentifier(state, opening.itemId);
  const warehouse = findWarehouseByIdentifier(state, opening.warehouseId);
  if (!item || !warehouse) return;
  const location = opening.locationId ? findWarehouseLocation(warehouse, opening.locationId) : null;
  const balance = getInventoryBalance(state, {
    accountSetId: opening.accountSetId,
    item,
    warehouse,
    location,
    batchNo: opening.batchNo
  });
  updateInventoryBalance(balance, { quantityDelta: opening.quantity, amountDelta: opening.amount });
  if (["fifo", "specific_identification"].includes(item.costMethod)) {
    createInventoryCostLayer(state, {
      accountSetId: opening.accountSetId,
      item,
      warehouse,
      location,
      batchNo: opening.batchNo,
      quantity: opening.quantity,
      amount: opening.amount,
      movementId: opening.id,
      lineId: opening.id
    });
  }
}

function resolveInventoryLineContext(state, accountSetId, line) {
  const item = findInventoryItemByIdentifier(state, line.itemId);
  if (!item || item.accountSetId !== accountSetId) {
    throw new Error("Inventory item was not found.");
  }
  const warehouse = findWarehouseByIdentifier(state, line.warehouseId);
  if (!warehouse || warehouse.accountSetId !== accountSetId) {
    throw new Error("Warehouse was not found.");
  }
  const location = line.locationId ? findWarehouseLocation(warehouse, line.locationId) : null;
  if (line.locationId && !location) {
    throw new Error("Warehouse location was not found.");
  }
  if (item.isBatchManaged && !line.batchNo && line.movementType === "inbound") {
    throw new Error("batchNo is required for batch-managed inventory items.");
  }
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Inventory movement line quantity must be greater than 0.");
  }
  return { item, warehouse, location, quantity, batchNo: line.batchNo ?? null };
}

function calculateMovingAverageIssue(state, { accountSetId, item, warehouse, location, batchNo, quantity }) {
  const balance = getInventoryBalance(state, { accountSetId, item, warehouse, location, batchNo });
  if (balance.quantity < quantity) {
    throw new Error("Inventory quantity is insufficient.");
  }
  const isFullIssue = roundQuantity(balance.quantity - quantity) === 0;
  const unitCost = balance.quantity === 0 ? 0 : roundAmount(balance.amount / balance.quantity);
  const amount = isFullIssue ? balance.amount : roundAmount(quantity * unitCost);
  const zeroResidualAdjustment = updateInventoryBalance(balance, {
    quantityDelta: -quantity,
    amountDelta: -amount,
    forceZeroResidual: true
  });
  return { unitCost, amount: roundAmount(amount - zeroResidualAdjustment), zeroResidualAdjustment, costBreakdown: [] };
}

function calculateFifoIssue(state, { accountSetId, item, warehouse, location, batchNo, quantity }) {
  let remaining = quantity;
  const breakdown = [];
  const layers = listInventoryCostLayers(state, accountSetId, { itemId: item.id, status: "open" }).filter((layer) => {
    if (layer.warehouseId !== warehouse.id) return false;
    if (location?.id && layer.locationId !== location.id) return false;
    if (batchNo && layer.batchNo !== batchNo) return false;
    return layer.remainingQuantity > 0;
  });
  const totalAvailable = roundQuantity(layers.reduce((sum, layer) => sum + layer.remainingQuantity, 0));
  if (totalAvailable < quantity) {
    throw new Error("Inventory quantity is insufficient.");
  }

  for (const layer of layers) {
    if (remaining <= 0) break;
    const consumedQuantity = Math.min(remaining, layer.remainingQuantity);
    const consumesWholeLayer = roundQuantity(consumedQuantity - layer.remainingQuantity) === 0;
    const consumedAmount = consumesWholeLayer ? layer.remainingAmount : roundAmount(consumedQuantity * layer.unitCost);
    layer.remainingQuantity = roundQuantity(layer.remainingQuantity - consumedQuantity);
    layer.remainingAmount = roundAmount(layer.remainingAmount - consumedAmount);
    layer.status = layer.remainingQuantity === 0 ? "closed" : "open";
    const layerWarehouse = findWarehouseByIdentifier(state, layer.warehouseId);
    const layerLocation = layer.locationId && layerWarehouse ? findWarehouseLocation(layerWarehouse, layer.locationId) : null;
    const balance = getInventoryBalance(state, {
      accountSetId,
      item,
      warehouse: layerWarehouse ?? warehouse,
      location: layerLocation,
      batchNo: layer.batchNo
    });
    updateInventoryBalance(balance, {
      quantityDelta: -consumedQuantity,
      amountDelta: -consumedAmount,
      forceZeroResidual: true
    });
    breakdown.push({
      layerId: layer.id,
      batchNo: layer.batchNo,
      quantity: roundQuantity(consumedQuantity),
      amount: roundAmount(consumedAmount),
      unitCost: layer.unitCost
    });
    remaining = roundQuantity(remaining - consumedQuantity);
  }

  const amount = roundAmount(breakdown.reduce((sum, layer) => sum + layer.amount, 0));
  return {
    unitCost: quantity === 0 ? 0 : roundAmount(amount / quantity),
    amount,
    zeroResidualAdjustment: 0,
    costBreakdown: breakdown
  };
}

function postInventoryMovement(state, body, actorId, { skipAudit = false } = {}) {
  if (!body.accountSetId) throw new Error("accountSetId is required.");
  if (!["inbound", "outbound", "adjustment"].includes(body.movementType)) {
    throw new Error("movementType must be inbound, outbound, or adjustment.");
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new Error("Inventory movement lines are required.");
  }
  const movementId = body.id ?? `inventory-movement:${randomUUID()}`;
  const lines = body.lines.map((line, index) => {
    const context = resolveInventoryLineContext(state, body.accountSetId, { ...line, movementType: body.movementType });
    const lineId = line.id ?? `inventory-movement-line:${randomUUID()}`;
    let unitCost = Number(line.unitCost ?? 0);
    let amount = Number(line.amount ?? 0);
    let costBreakdown = [];
    let zeroResidualAdjustment = 0;

    if (body.movementType === "inbound" || (body.movementType === "adjustment" && context.quantity > 0)) {
      if (!Number.isFinite(amount) || amount === 0) {
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error("Inventory inbound unitCost must be non-negative.");
        }
        amount = roundAmount(context.quantity * unitCost);
      }
      unitCost = context.quantity === 0 ? 0 : roundAmount(amount / context.quantity);
      const balance = getInventoryBalance(state, {
        accountSetId: body.accountSetId,
        item: context.item,
        warehouse: context.warehouse,
        location: context.location,
        batchNo: context.batchNo
      });
      updateInventoryBalance(balance, { quantityDelta: context.quantity, amountDelta: amount });
      if (["fifo", "specific_identification"].includes(context.item.costMethod)) {
        createInventoryCostLayer(state, {
          accountSetId: body.accountSetId,
          item: context.item,
          warehouse: context.warehouse,
          location: context.location,
          batchNo: context.batchNo,
          quantity: context.quantity,
          amount,
          movementId,
          lineId
        });
      }
    } else {
      const issue =
        context.item.costMethod === "fifo" || context.item.costMethod === "specific_identification"
          ? calculateFifoIssue(state, { accountSetId: body.accountSetId, ...context })
          : calculateMovingAverageIssue(state, { accountSetId: body.accountSetId, ...context });
      unitCost = issue.unitCost;
      amount = issue.amount;
      costBreakdown = issue.costBreakdown;
      zeroResidualAdjustment = issue.zeroResidualAdjustment;
    }

    return {
      id: lineId,
      movementId,
      itemId: context.item.id,
      itemCode: context.item.code,
      itemName: context.item.name,
      warehouseId: context.warehouse.id,
      warehouseCode: context.warehouse.code,
      locationId: context.location?.id ?? null,
      locationCode: context.location?.code ?? null,
      batchNo: context.batchNo,
      lineNo: line.lineNo ?? index + 1,
      quantity: roundQuantity(context.quantity),
      unitCost,
      amount: roundAmount(amount),
      zeroResidualAdjustment,
      costBreakdown
    };
  });
  const movement = {
    id: movementId,
    accountSetId: body.accountSetId,
    documentNo: body.documentNo ?? `INV-${state.inventoryMovements.size + 1}`,
    movementType: body.movementType,
    businessType: body.businessType ?? body.movementType,
    sourceType: body.sourceType ?? null,
    sourceDocumentId: body.sourceDocumentId ?? null,
    fiscalYear: Number(body.fiscalYear),
    periodNo: Number(body.periodNo),
    movementDate: body.movementDate ?? "now",
    costStatus: "calculated",
    totalQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.quantity, 0)),
    totalAmount: roundAmount(lines.reduce((sum, line) => sum + line.amount, 0)),
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines
  };
  state.inventoryMovements.set(movement.id, movement);
  if (!skipAudit) {
    appendAuditLog(state, {
      actorId: movement.createdBy,
      action: "inventory_movement.post",
      objectType: "inventory_movement",
      objectId: movement.id
    });
  }
  return movement;
}

function listInventoryMovements(state, accountSetId) {
  return [...state.inventoryMovements.values()]
    .filter((movement) => movement.accountSetId === accountSetId)
    .sort((left, right) => String(left.documentNo).localeCompare(String(right.documentNo)));
}

function listInventoryTransfers(state, accountSetId) {
  return [...state.inventoryTransfers.values()]
    .filter((transfer) => transfer.accountSetId === accountSetId)
    .sort((left, right) => String(left.transferNo).localeCompare(String(right.transferNo)));
}

function previewStockCount(state, body, actorId) {
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new Error("Stock count lines are required.");
  }
  const countId = body.id ?? `stock-count-preview:${randomUUID()}`;
  const lines = body.lines.map((line, index) => {
    const item = findInventoryItemByIdentifier(state, line.itemId);
    const warehouse = findWarehouseByIdentifier(state, line.warehouseId);
    if (!item || item.accountSetId !== body.accountSetId || !warehouse || warehouse.accountSetId !== body.accountSetId) {
      throw new Error("Stock count item or warehouse was not found.");
    }
    const location = line.locationId ? findWarehouseLocation(warehouse, line.locationId) : null;
    const balance = getInventoryBalance(state, {
      accountSetId: body.accountSetId,
      item,
      warehouse,
      location,
      batchNo: line.batchNo ?? null
    });
    const actualQuantity = Number(line.actualQuantity);
    if (!Number.isFinite(actualQuantity) || actualQuantity < 0) {
      throw new Error("actualQuantity must be non-negative.");
    }
    const differenceQuantity = roundQuantity(actualQuantity - balance.quantity);
    return {
      id: line.id ?? `stock-count-line:${randomUUID()}`,
      stockCountId: countId,
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      locationId: location?.id ?? null,
      locationCode: location?.code ?? null,
      batchNo: line.batchNo ?? null,
      lineNo: line.lineNo ?? index + 1,
      bookQuantity: balance.quantity,
      actualQuantity,
      differenceQuantity,
      unitCost: balance.unitCost,
      adjustmentAmount: roundAmount(differenceQuantity * balance.unitCost),
      reason: line.reason ?? null
    };
  });
  return {
    id: countId,
    accountSetId: body.accountSetId,
    countNo: body.countNo ?? `SC-${state.stockCounts.size + 1}`,
    fiscalYear: Number(body.fiscalYear),
    periodNo: Number(body.periodNo),
    status: "preview",
    totalDifferenceQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.differenceQuantity, 0)),
    totalAdjustmentAmount: roundAmount(lines.reduce((sum, line) => sum + line.adjustmentAmount, 0)),
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines
  };
}

function findWorkOrderByIdentifier(state, identifier) {
  return [...state.workOrders.values()].find((workOrder) => workOrder.id === identifier || workOrder.workOrderNo === identifier) ?? null;
}

function listWorkOrders(state, accountSetId) {
  return [...state.workOrders.values()]
    .filter((workOrder) => workOrder.accountSetId === accountSetId)
    .sort((left, right) => left.workOrderNo.localeCompare(right.workOrderNo));
}

function listMaterialRequisitions(state, accountSetId) {
  return [...state.materialRequisitions.values()]
    .filter((requisition) => requisition.accountSetId === accountSetId)
    .sort((left, right) => left.requisitionNo.localeCompare(right.requisitionNo));
}

function listProductReceipts(state, accountSetId) {
  return [...state.productReceipts.values()]
    .filter((receipt) => receipt.accountSetId === accountSetId)
    .sort((left, right) => left.receiptNo.localeCompare(right.receiptNo));
}

function listByAccountSet(map, accountSetId, sortField) {
  return [...map.values()]
    .filter((row) => row.accountSetId === accountSetId)
    .sort((left, right) => String(left[sortField] ?? left.id).localeCompare(String(right[sortField] ?? right.id)));
}

function collectionResponse(rows) {
  return {
    total: rows.length,
    items: rows
  };
}

function createProductionPlan(state, body, actorId) {
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new Error("Production plan lines are required.");
  }
  const planId = body.id ?? `production-plan:${randomUUID()}`;
  const lines = body.lines.map((line, index) => {
    const plannedQuantity = Number(line.plannedQuantity);
    if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
      throw new Error("Production plan line plannedQuantity must be greater than 0.");
    }
    return {
      id: line.id ?? `production-plan-line:${planId}:${index + 1}`,
      productionPlanId: planId,
      lineNo: line.lineNo ?? index + 1,
      productItemId: line.productItemId ?? null,
      productItemCode: line.productItemCode,
      productItemName: line.productItemName,
      plannedQuantity,
      plannedStartDate: line.plannedStartDate ?? null,
      plannedFinishDate: line.plannedFinishDate ?? null,
      status: line.status ?? "planned"
    };
  });
  const plan = {
    id: planId,
    accountSetId: body.accountSetId,
    planNo: body.planNo ?? `MPS-${state.productionPlans.size + 1}`,
    fiscalYear: Number(body.fiscalYear),
    periodNo: Number(body.periodNo),
    status: body.status ?? "draft",
    sourceType: body.sourceType ?? "manual",
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    updatedAt: "now",
    lines
  };
  state.productionPlans.set(plan.id, plan);
  appendAuditLog(state, { actorId: plan.createdBy, action: "production_plan.create", objectType: "production_plan", objectId: plan.id });
  return plan;
}

function buildWorkOrderDraftsFromPlan(plan, body = {}) {
  return {
    productionPlanId: plan.id,
    planNo: plan.planNo,
    dryRun: body.dryRun !== false,
    requestedBy: body.requestedBy ?? "system",
    workOrderDrafts: plan.lines.map((line) => ({
      documentType: "work_order_draft",
      planLineId: line.id,
      workOrderNo: `WO-${plan.planNo}-${String(line.lineNo).padStart(2, "0")}`,
      productItemId: line.productItemId,
      productItemCode: line.productItemCode,
      productItemName: line.productItemName,
      plannedQuantity: line.plannedQuantity,
      plannedStartDate: line.plannedStartDate,
      plannedFinishDate: line.plannedFinishDate,
      fiscalYear: plan.fiscalYear,
      periodNo: plan.periodNo,
      status: "draft"
    }))
  };
}

function createReworkOrder(state, body, actorId) {
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Rework quantity must be greater than 0.");
  }
  const order = {
    id: body.id ?? `rework-order:${randomUUID()}`,
    accountSetId: body.accountSetId,
    reworkNo: body.reworkNo ?? `RW-${state.reworkOrders.size + 1}`,
    sourceWorkOrderId: body.sourceWorkOrderId ?? null,
    sourceOrderNo: body.sourceOrderNo ?? null,
    originalBatchNo: body.originalBatchNo ?? null,
    itemCode: body.itemCode,
    itemName: body.itemName,
    quantity,
    reasonCode: body.reasonCode ?? "manual",
    status: body.status ?? "draft",
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    approvedBy: null,
    approvedAt: null
  };
  state.reworkOrders.set(order.id, order);
  appendAuditLog(state, { actorId: order.createdBy, action: "rework_order.create", objectType: "rework_order", objectId: order.id });
  return order;
}

function createOutsourcingOrder(state, body, actorId) {
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Outsourcing quantity must be greater than 0.");
  }
  const order = {
    id: body.id ?? `outsourcing-order:${randomUUID()}`,
    accountSetId: body.accountSetId,
    outsourcingNo: body.outsourcingNo ?? `OS-${state.outsourcingOrders.size + 1}`,
    supplierId: body.supplierId ?? null,
    supplierName: body.supplierName ?? null,
    sourceWorkOrderId: body.sourceWorkOrderId ?? null,
    itemCode: body.itemCode,
    itemName: body.itemName,
    quantity,
    processName: body.processName ?? null,
    status: body.status ?? "draft",
    issuedQuantity: Number(body.issuedQuantity ?? 0),
    receivedQuantity: Number(body.receivedQuantity ?? 0),
    settledAmount: Number(body.settledAmount ?? 0),
    createdBy: body.createdBy ?? actorId,
    createdAt: "now"
  };
  state.outsourcingOrders.set(order.id, order);
  appendAuditLog(state, { actorId: order.createdBy, action: "outsourcing_order.create", objectType: "outsourcing_order", objectId: order.id });
  return order;
}

function createTraceRule(state, body, actorId) {
  const rule = {
    id: body.id ?? `trace-rule:${randomUUID()}`,
    accountSetId: body.accountSetId,
    code: body.code,
    name: body.name,
    objectType: body.objectType ?? "batch",
    direction: body.direction ?? "both",
    isEnabled: body.isEnabled !== false,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now"
  };
  state.traceRules.set(rule.id, rule);
  appendAuditLog(state, { actorId: rule.createdBy, action: "trace_rule.create", objectType: "trace_rule", objectId: rule.id });
  return rule;
}

function createTraceQueryRun(state, body, actorId) {
  const rule = state.traceRules.get(body.ruleId);
  if (!rule || rule.accountSetId !== body.accountSetId || rule.isEnabled === false) {
    throw new Error("Trace rule was not found or is disabled.");
  }
  const run = {
    id: body.id ?? `trace-query-run:${randomUUID()}`,
    accountSetId: body.accountSetId,
    ruleId: rule.id,
    ruleCode: rule.code,
    batchNo: body.batchNo,
    direction: body.direction ?? rule.direction,
    requestedBy: body.requestedBy ?? actorId,
    createdAt: "now",
    nodes: [
      {
        nodeType: "batch",
        batchNo: body.batchNo,
        objectType: rule.objectType,
        direction: body.direction ?? rule.direction
      }
    ],
    edges: []
  };
  state.traceQueryRuns.set(run.id, run);
  appendAuditLog(state, { actorId: run.requestedBy, action: "trace_query.run", objectType: "trace_query_run", objectId: run.id });
  return run;
}

function createLineSideWarehouseConfig(state, body, actorId) {
  const config = {
    id: body.id ?? `line-side-warehouse:${randomUUID()}`,
    accountSetId: body.accountSetId,
    code: body.code,
    name: body.name,
    productionLineCode: body.productionLineCode,
    mainWarehouseCode: body.mainWarehouseCode,
    isEnabled: body.isEnabled !== false,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now"
  };
  state.lineSideWarehouseConfigs.set(config.id, config);
  appendAuditLog(state, { actorId: config.createdBy, action: "line_side_warehouse.create", objectType: "line_side_warehouse", objectId: config.id });
  return config;
}

function createLineSideMaterialMovement(state, body, actorId) {
  const config = state.lineSideWarehouseConfigs.get(body.lineSideWarehouseId);
  if (!config || config.accountSetId !== body.accountSetId || config.isEnabled === false) {
    throw new Error("Line-side warehouse was not found or is disabled.");
  }
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Line-side movement quantity must be greater than 0.");
  }
  const movement = {
    id: body.id ?? `line-side-material-movement:${randomUUID()}`,
    accountSetId: body.accountSetId,
    lineSideWarehouseId: config.id,
    lineSideWarehouseCode: config.code,
    movementType: body.movementType ?? "replenish",
    workOrderId: body.workOrderId ?? null,
    itemCode: body.itemCode,
    itemName: body.itemName,
    quantity,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now"
  };
  state.lineSideMaterialMovements.set(movement.id, movement);
  appendAuditLog(state, { actorId: movement.createdBy, action: "line_side_material_movement.create", objectType: "line_side_material_movement", objectId: movement.id });
  return movement;
}

function findBomByIdentifier(state, identifier) {
  return [...state.boms.values()].find((bom) => bom.id === identifier) ?? null;
}

function listMockCostInputs(state, accountSetId) {
  return [...state.mockCostInputs.values()]
    .filter((input) => input.accountSetId === accountSetId)
    .sort((left, right) => `${left.workOrderNo}:${left.costType}`.localeCompare(`${right.workOrderNo}:${right.costType}`));
}

function findMockCostInputByIdentifier(state, identifier) {
  return state.mockCostInputs.get(identifier) ?? null;
}

function findPhase4CostPoolByIdentifier(state, identifier) {
  const payrollPool = state.payrollCostPools.get(identifier);
  if (payrollPool) {
    return { ...payrollPool, sourceType: "phase4_payroll_cost_pool" };
  }
  const depreciationPool = state.assetDepreciationCostPools.get(identifier);
  if (depreciationPool) {
    return { ...depreciationPool, sourceType: "phase4_depreciation_cost_pool" };
  }
  return null;
}

function buildCostAllocation(state, body, actorId, { dryRun }) {
  const workOrder = findWorkOrderByIdentifier(state, body.workOrderId);
  if (!workOrder || workOrder.accountSetId !== body.accountSetId) {
    throw new Error("Work order was not found.");
  }
  const mockInputs = (body.costInputIds ?? [])
    .map((id) => findMockCostInputByIdentifier(state, id))
    .filter(Boolean);
  const phase4Inputs = (body.phase4CostPoolIds ?? [])
    .map((id) => findPhase4CostPoolByIdentifier(state, id))
    .filter(Boolean)
    .filter((input) => input.accountSetId === body.accountSetId)
    .filter((input) => !input.workOrderId || input.workOrderId === workOrder.id)
    .filter((input) => input.fiscalYear === Number(body.fiscalYear))
    .filter((input) => input.periodNo === Number(body.periodNo));
  const inputs = [...mockInputs, ...phase4Inputs];
  if (inputs.length === 0) {
    throw new Error("At least one cost input is required.");
  }
  if (!dryRun && inputs.some((input) => !input.lockedAt)) {
    return { error: errorResponse(409, "COST_INPUT_NOT_LOCKED", "Committed allocation requires locked cost inputs.") };
  }
  const allocationId = body.id ?? `cost-allocation:${randomUUID()}`;
  const lines = inputs.map((input) => ({
    id: `cost-allocation-line:${randomUUID()}`,
    costAllocationId: allocationId,
    costInputId: input.id,
    sourceType: input.sourceType,
    costType: input.costType,
    allocatedAmount: roundAmount(input.amount)
  }));
  const totalAllocatedAmount = roundAmount(lines.reduce((sum, line) => sum + line.allocatedAmount, 0));
  const warningCodes = inputs.some((input) => ["mock", "manual"].includes(input.sourceType)) ? ["PHASE4_SOURCE_MISSING"] : [];
  const allocation = {
    id: allocationId,
    accountSetId: body.accountSetId,
    workOrderId: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    fiscalYear: Number(body.fiscalYear),
    periodNo: Number(body.periodNo),
    dryRun,
    status: dryRun ? "preview" : "committed",
    totalAllocatedAmount,
    warningCodes,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines,
    adjustments: []
  };
  if (dryRun) {
    return { allocation };
  }

  const receipts = [...state.productReceipts.values()].filter((receipt) => receipt.workOrderId === workOrder.id);
  const totalReceiptQuantity = receipts.reduce((sum, receipt) => sum + receipt.totalQuantity, 0);
  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      const item = findInventoryItemByIdentifier(state, line.productItemId);
      const warehouse = findWarehouseByIdentifier(state, line.warehouseId);
      if (!item || !warehouse || totalReceiptQuantity === 0) continue;
      const location = line.locationId ? findWarehouseLocation(warehouse, line.locationId) : null;
      const adjustmentAmount = roundAmount((line.quantity / totalReceiptQuantity) * totalAllocatedAmount);
      const balance = getInventoryBalance(state, {
        accountSetId: body.accountSetId,
        item,
        warehouse,
        location,
        batchNo: line.batchNo
      });
      updateInventoryBalance(balance, { quantityDelta: 0, amountDelta: adjustmentAmount });
      const adjustment = {
        id: `inventory-cost-adjustment:${randomUUID()}`,
        accountSetId: body.accountSetId,
        costAllocationId: allocation.id,
        workOrderId: workOrder.id,
        itemId: item.id,
        itemCode: item.code,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        locationId: location?.id ?? null,
        batchNo: line.batchNo ?? null,
        quantity: 0,
        amount: adjustmentAmount,
        reason: "cost_allocation",
        createdAt: "now"
      };
      state.inventoryCostAdjustments.set(adjustment.id, adjustment);
      allocation.adjustments.push(adjustment);
    }
  }
  state.costAllocations.set(allocation.id, allocation);
  return { allocation };
}

function listCostVoucherDrafts(state, accountSetId) {
  return [...state.costVoucherDrafts.values()]
    .filter((draft) => draft.accountSetId === accountSetId)
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
}

function findCostAllocationByIdentifier(state, identifier) {
  return (
    state.costAllocations.get(identifier) ??
    [...state.costAllocations.values()].find((allocation) => allocation.id === identifier) ??
    null
  );
}

function buildCostVoucherDraft(state, body, actorId) {
  const allocation = findCostAllocationByIdentifier(state, body.costAllocationId);
  if (!allocation || allocation.accountSetId !== body.accountSetId) {
    return { error: errorResponse(404, "COST_ALLOCATION_NOT_FOUND", "Cost allocation was not found.") };
  }
  if (allocation.status !== "committed" || allocation.dryRun) {
    return { error: errorResponse(409, "COST_ALLOCATION_NOT_COMMITTED", "Cost allocation must be committed before voucher draft creation.") };
  }

  const workOrder = findWorkOrderByIdentifier(state, allocation.workOrderId);
  if (!workOrder || workOrder.accountSetId !== body.accountSetId) {
    return { error: errorResponse(404, "WORK_ORDER_NOT_FOUND", "Work order was not found.") };
  }

  const fiscalYear = Number(body.fiscalYear ?? allocation.fiscalYear);
  const periodNo = Number(body.periodNo ?? allocation.periodNo);
  const directMaterialCost = roundAmount(workOrder.directMaterialCost ?? 0);
  const allocatedCost = roundAmount(allocation.totalAllocatedAmount ?? 0);
  const totalAmount = roundAmount(directMaterialCost + allocatedCost);
  const warningCodes = [...new Set(allocation.warningCodes ?? [])];
  const voucherDraft = {
    status: "draft",
    sourceType: "phase3_cost_allocation",
    sourceDocumentId: allocation.id,
    sourceDocumentNo: allocation.workOrderNo,
    fiscalYear,
    periodNo,
    totalAmount,
    approvalRequired: true,
    lines: [
      {
        lineNo: 1,
        summary: `Capitalize production cost for ${allocation.workOrderNo}`,
        amount: totalAmount,
        debit: totalAmount,
        credit: 0,
        direction: "debit",
        accountCode: "1405"
      },
      {
        lineNo: 2,
        summary: `Clear direct material and allocated cost for ${allocation.workOrderNo}`,
        amount: roundAmount(-totalAmount),
        debit: 0,
        credit: totalAmount,
        direction: "credit",
        accountCode: "5001"
      }
    ]
  };
  const draft = {
    id: `cost-voucher-draft:${randomUUID()}`,
    accountSetId: body.accountSetId,
    costAllocationId: allocation.id,
    workOrderId: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    fiscalYear,
    periodNo,
    status: "draft",
    totalAmount,
    directMaterialCost,
    allocatedCost,
    warningCodes,
    approvalRequired: true,
    voucherDraft,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now"
  };
  state.costVoucherDrafts.set(draft.id, draft);
  return { draft };
}

function buildInventoryReconciliation(state, accountSetId, { fiscalYear, periodNo }) {
  const balances = listInventoryBalances(state, accountSetId);
  const rows = balances.map((balance) => ({
    itemId: balance.itemId,
    itemCode: balance.itemCode,
    warehouseId: balance.warehouseId,
    warehouseCode: balance.warehouseCode,
    batchNo: balance.batchNo,
    quantity: balance.quantity,
    amount: balance.amount
  }));
  const inventoryBalanceTotal = roundAmount(rows.reduce((sum, row) => sum + row.amount, 0));
  const costAdjustmentTotal = roundAmount(
    [...state.inventoryCostAdjustments.values()]
      .filter((adjustment) => adjustment.accountSetId === accountSetId)
      .reduce((sum, adjustment) => sum + adjustment.amount, 0)
  );
  const run = {
    id: `inventory-reconciliation:${randomUUID()}`,
    accountSetId,
    fiscalYear: Number(fiscalYear),
    periodNo: Number(periodNo),
    inventoryBalanceTotal,
    costAdjustmentTotal,
    differenceAmount: 0,
    rows,
    createdAt: "now"
  };
  state.inventoryReconciliationRuns.set(run.id, run);
  return run;
}

function listPayrollCategories(state, accountSetId) {
  return [...state.payrollCategories.values()].filter((row) => row.accountSetId === accountSetId).sort((left, right) => left.code.localeCompare(right.code));
}

function listPayrollItems(state, accountSetId) {
  return [...state.payrollItems.values()].filter((row) => row.accountSetId === accountSetId).sort((left, right) => left.code.localeCompare(right.code));
}

function listEmployeePayrollProfiles(state, accountSetId) {
  return [...state.employeePayrollProfiles.values()]
    .filter((row) => row.accountSetId === accountSetId)
    .sort((left, right) => left.employeeNo.localeCompare(right.employeeNo));
}

function listPayrollRuns(state, accountSetId) {
  return [...state.payrollRuns.values()].filter((row) => row.accountSetId === accountSetId).sort((left, right) => left.runNo.localeCompare(right.runNo));
}

function findPayrollCategoryByIdentifier(state, identifier) {
  return state.payrollCategories.get(identifier) ?? [...state.payrollCategories.values()].find((row) => row.code === identifier) ?? null;
}

function findEmployeePayrollProfileByIdentifier(state, identifier) {
  return state.employeePayrollProfiles.get(identifier) ?? [...state.employeePayrollProfiles.values()].find((row) => row.employeeNo === identifier) ?? null;
}

function findPayrollVariableImportByIdentifier(state, identifier) {
  return state.payrollVariableImports.get(identifier) ?? null;
}

function findPayrollRunByIdentifier(state, identifier) {
  return state.payrollRuns.get(identifier) ?? [...state.payrollRuns.values()].find((run) => run.runNo === identifier) ?? null;
}

function calculateSimpleMonthlyTax(taxableIncome, monthlyTaxExemption) {
  return roundAmount(Math.max(0, taxableIncome - monthlyTaxExemption) * 0.03);
}

function manualAdjustmentFor(manualAdjustments, employeeProfileId, field) {
  return (manualAdjustments ?? []).find((adjustment) => adjustment.employeeProfileId === employeeProfileId && adjustment.field === field) ?? null;
}

function priorPayrollRunLinesForMonth(state, accountSetId, fiscalYear, periodNo, employeeProfileId) {
  return [...state.payrollRuns.values()]
    .filter((run) => run.accountSetId === accountSetId && run.fiscalYear === fiscalYear && run.periodNo === periodNo)
    .flatMap((run) => run.lines ?? [])
    .filter((line) => line.employeeProfileId === employeeProfileId);
}

function buildPayrollRun(state, body, actorId) {
  const category = findPayrollCategoryByIdentifier(state, body.payrollCategoryId);
  if (!category || category.accountSetId !== body.accountSetId) {
    return { error: errorResponse(404, "PAYROLL_CATEGORY_NOT_FOUND", "Payroll category was not found.") };
  }
  const variableImport = findPayrollVariableImportByIdentifier(state, body.variableImportId);
  if (!variableImport || variableImport.accountSetId !== body.accountSetId) {
    return { error: errorResponse(404, "PAYROLL_VARIABLE_IMPORT_NOT_FOUND", "Payroll variable import was not found.") };
  }
  const fiscalYear = Number(body.fiscalYear);
  const periodNo = Number(body.periodNo);
  const runId = `payroll-run:${randomUUID()}`;
  const lines = variableImport.lines.map((importLine) => {
    const profile = findEmployeePayrollProfileByIdentifier(state, importLine.employeeProfileId);
    if (!profile || profile.accountSetId !== body.accountSetId) {
      throw new Error("Payroll profile was not found.");
    }
    const includeBaseSalary = Number(importLine.workDays ?? 0) > 0 || variableImport.importType === "attendance_performance";
    const baseSalary = includeBaseSalary ? Number(profile.baseSalary ?? 0) : 0;
    const personalSocialSecurity = includeBaseSalary ? Number(profile.personalSocialSecurity ?? 0) : 0;
    const personalHousingFund = includeBaseSalary ? Number(profile.personalHousingFund ?? 0) : 0;
    const companySocialSecurity = includeBaseSalary ? Number(profile.companySocialSecurity ?? 0) : 0;
    const companyHousingFund = includeBaseSalary ? Number(profile.companyHousingFund ?? 0) : 0;
    const grossAmount = roundAmount(baseSalary + Number(importLine.performancePay ?? 0) + Number(importLine.piecePay ?? 0) + Number(importLine.allowance ?? 0));
    const deductionAmount = roundAmount(personalSocialSecurity + personalHousingFund + Number(importLine.deduction ?? 0));
    const taxableIncome = roundAmount(Math.max(0, grossAmount - deductionAmount));
    const priorLines = priorPayrollRunLinesForMonth(state, body.accountSetId, fiscalYear, periodNo, profile.id);
    const priorTaxableIncome = roundAmount(priorLines.reduce((sum, line) => sum + Number(line.taxableIncome ?? 0), 0));
    const priorTax = roundAmount(priorLines.reduce((sum, line) => sum + Number(line.individualIncomeTax ?? 0), 0));
    const cumulativeTaxableIncome = roundAmount(priorTaxableIncome + taxableIncome);
    const calculatedTax = roundAmount(Math.max(0, calculateSimpleMonthlyTax(cumulativeTaxableIncome, Number(profile.monthlyTaxExemption ?? 5000)) - priorTax));
    const taxOverride = manualAdjustmentFor(body.manualAdjustments, profile.id, "individualIncomeTax");
    const individualIncomeTax = roundAmount(taxOverride ? Number(taxOverride.amount) : calculatedTax);
    const manualAdjustmentAmount = roundAmount(individualIncomeTax - calculatedTax);
    const netPay = roundAmount(grossAmount - deductionAmount - individualIncomeTax);
    const companyCost = roundAmount(grossAmount + companySocialSecurity + companyHousingFund);
    return {
      id: `payroll-run-line:${randomUUID()}`,
      payrollRunId: runId,
      employeeProfileId: profile.id,
      employeeNo: profile.employeeNo,
      employeeName: profile.employeeName,
      departmentId: profile.departmentId,
      departmentName: profile.departmentName ?? null,
      grossAmount,
      deductionAmount,
      taxableIncome,
      cumulativeTaxableIncome,
      individualIncomeTax,
      manualAdjustmentAmount,
      netPay,
      companyCost,
      manualAdjustments: taxOverride ? [taxOverride] : []
    };
  });
  const run = {
    id: runId,
    accountSetId: body.accountSetId,
    runNo: body.runNo,
    payrollCategoryId: category.id,
    payrollCategoryCode: category.code,
    variableImportId: variableImport.id,
    fiscalYear,
    periodNo,
    status: "calculated",
    lineCount: lines.length,
    totalGrossAmount: roundAmount(lines.reduce((sum, line) => sum + line.grossAmount, 0)),
    totalDeductionAmount: roundAmount(lines.reduce((sum, line) => sum + line.deductionAmount, 0)),
    totalTaxAmount: roundAmount(lines.reduce((sum, line) => sum + line.individualIncomeTax, 0)),
    totalNetPay: roundAmount(lines.reduce((sum, line) => sum + line.netPay, 0)),
    totalCompanyCost: roundAmount(lines.reduce((sum, line) => sum + line.companyCost, 0)),
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines
  };
  state.payrollRuns.set(run.id, run);
  for (const line of lines) {
    state.payrollRunLines.set(line.id, line);
  }
  return { run };
}

function payrollRunLockedError(run) {
  if (!run || run.status !== "locked" || !run.lockedAt) {
    return errorResponse(409, "PAYROLL_RUN_NOT_LOCKED", "Payroll run must be locked before this operation.");
  }
  return null;
}

function buildPayrollPaymentFile(state, body, actorId) {
  const run = findPayrollRunByIdentifier(state, body.payrollRunId);
  if (!run || run.accountSetId !== body.accountSetId) {
    return { error: errorResponse(404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.") };
  }
  const lockedError = payrollRunLockedError(run);
  if (lockedError) return { error: lockedError };
  const fileId = `payroll-payment-file:${randomUUID()}`;
  const lines = (run.lines ?? []).map((line) => ({
    id: `payroll-payment-file-line:${randomUUID()}`,
    paymentFileId: fileId,
    employeeProfileId: line.employeeProfileId,
    employeeNo: line.employeeNo,
    employeeName: line.employeeName,
    amount: line.netPay,
    bankAccountNo: line.bankAccountNo ?? null
  }));
  const paymentFile = {
    id: fileId,
    accountSetId: body.accountSetId,
    payrollRunId: run.id,
    runNo: run.runNo,
    bankAccountCode: body.bankAccountCode,
    status: "prepared",
    totalAmount: roundAmount(lines.reduce((sum, line) => sum + line.amount, 0)),
    lineCount: lines.length,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines
  };
  state.payrollPaymentFiles.set(paymentFile.id, paymentFile);
  return { paymentFile };
}

function buildPayrollAllocation(state, body, actorId) {
  const run = findPayrollRunByIdentifier(state, body.payrollRunId);
  if (!run || run.accountSetId !== body.accountSetId) {
    return { error: errorResponse(404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.") };
  }
  const lockedError = payrollRunLockedError(run);
  if (lockedError) return { error: lockedError };
  if (!Array.isArray(body.rules) || body.rules.length === 0) {
    throw new Error("Allocation rules are required.");
  }
  const allocationId = `payroll-allocation:${randomUUID()}`;
  const lines = body.rules.map((rule) => {
    const amount = roundAmount(Number(rule.amount ?? run.totalCompanyCost * Number(rule.allocationRate ?? 0)));
    return {
      id: `payroll-allocation-line:${randomUUID()}`,
      payrollAllocationId: allocationId,
      departmentId: rule.departmentId,
      targetType: rule.targetType ?? "department",
      workOrderId: rule.workOrderId ?? null,
      costType: rule.costType ?? "direct_labor",
      allocationRate: Number(rule.allocationRate ?? (run.totalCompanyCost ? amount / run.totalCompanyCost : 0)),
      allocatedAmount: amount
    };
  });
  const totalAllocatedAmount = roundAmount(lines.reduce((sum, line) => sum + line.allocatedAmount, 0));
  const voucherDraft = {
    status: "draft",
    sourceType: "phase4_payroll_allocation",
    sourceDocumentId: allocationId,
    sourceDocumentNo: run.runNo,
    fiscalYear: Number(body.fiscalYear ?? run.fiscalYear),
    periodNo: Number(body.periodNo ?? run.periodNo),
    totalAmount: totalAllocatedAmount,
    approvalRequired: true,
    lines: [
      {
        lineNo: 1,
        summary: `Payroll allocation for ${run.runNo}`,
        amount: totalAllocatedAmount,
        debit: totalAllocatedAmount,
        credit: 0,
        direction: "debit",
        accountCode: "5001"
      },
      {
        lineNo: 2,
        summary: `Payroll payable clearing for ${run.runNo}`,
        amount: roundAmount(-totalAllocatedAmount),
        debit: 0,
        credit: totalAllocatedAmount,
        direction: "credit",
        accountCode: "2211"
      }
    ]
  };
  const costPools = lines.map((line) => ({
    id: `payroll-cost-pool:${randomUUID()}`,
    accountSetId: body.accountSetId,
    sourceRunId: run.id,
    payrollAllocationId: allocationId,
    fiscalYear: Number(body.fiscalYear ?? run.fiscalYear),
    periodNo: Number(body.periodNo ?? run.periodNo),
    departmentId: line.departmentId,
    workOrderId: line.workOrderId,
    costType: line.costType,
    amount: line.allocatedAmount,
    lockedAt: run.lockedAt,
    createdAt: "now"
  }));
  const allocation = {
    id: allocationId,
    accountSetId: body.accountSetId,
    payrollRunId: run.id,
    runNo: run.runNo,
    fiscalYear: Number(body.fiscalYear ?? run.fiscalYear),
    periodNo: Number(body.periodNo ?? run.periodNo),
    status: "allocated",
    totalAllocatedAmount,
    approvalRequired: true,
    voucherDraft,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines,
    costPools
  };
  state.payrollAllocations.set(allocation.id, allocation);
  for (const pool of costPools) {
    state.payrollCostPools.set(pool.id, pool);
  }
  return { allocation };
}

function listAssetCategories(state, accountSetId) {
  return [...state.assetCategories.values()].filter((row) => row.accountSetId === accountSetId).sort((left, right) => left.code.localeCompare(right.code));
}

function listDepreciationMethods(state, accountSetId) {
  return [...state.depreciationMethods.values()].filter((row) => row.accountSetId === accountSetId).sort((left, right) => left.code.localeCompare(right.code));
}

function listFixedAssets(state, accountSetId) {
  return [...state.fixedAssets.values()].filter((row) => row.accountSetId === accountSetId).sort((left, right) => left.assetNo.localeCompare(right.assetNo));
}

function findAssetCategoryByIdentifier(state, identifier) {
  return state.assetCategories.get(identifier) ?? [...state.assetCategories.values()].find((row) => row.code === identifier) ?? null;
}

function findDepreciationMethodByIdentifier(state, identifier) {
  return state.depreciationMethods.get(identifier) ?? [...state.depreciationMethods.values()].find((row) => row.code === identifier) ?? null;
}

function findFixedAssetByIdentifier(state, identifier) {
  return state.fixedAssets.get(identifier) ?? [...state.fixedAssets.values()].find((row) => row.assetNo === identifier) ?? null;
}

function nextServicePeriod(acquisitionDate) {
  const date = new Date(`${String(acquisitionDate).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("acquisitionDate must be a valid date.");
  }
  const month = date.getUTCMonth() + 1;
  if (month === 12) {
    return { serviceStartYear: date.getUTCFullYear() + 1, serviceStartPeriod: 1 };
  }
  return { serviceStartYear: date.getUTCFullYear(), serviceStartPeriod: month + 1 };
}

function createAssetSnapshot(asset) {
  return {
    ...asset,
    netValue: roundAmount(Number(asset.originalValue ?? 0) - Number(asset.accumulatedDepreciation ?? 0))
  };
}

function periodIndex(fiscalYear, periodNo) {
  return Number(fiscalYear) * 12 + Number(periodNo);
}

function fiscalPeriodFromDate(dateValue) {
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("date must be a valid date.");
  }
  return { fiscalYear: date.getUTCFullYear(), periodNo: date.getUTCMonth() + 1 };
}

function appendFixedAssetLedgerEntry(state, entry) {
  const row = {
    id: entry.id ?? `fixed-asset-ledger:${randomUUID()}`,
    accountSetId: entry.accountSetId,
    fixedAssetId: entry.fixedAssetId ?? null,
    assetNo: entry.assetNo ?? null,
    fiscalYear: Number(entry.fiscalYear),
    periodNo: Number(entry.periodNo),
    sourceType: entry.sourceType,
    sourceDocumentId: entry.sourceDocumentId,
    amount: roundAmount(entry.amount ?? 0),
    occurredAt: entry.occurredAt ?? "now",
    createdAt: "now"
  };
  state.fixedAssetLedgerEntries.set(row.id, row);
  return row;
}

function listDepreciationRuns(state, accountSetId) {
  return [...state.depreciationRuns.values()].filter((row) => row.accountSetId === accountSetId).sort((left, right) => left.runNo.localeCompare(right.runNo));
}

function findDepreciationRunByIdentifier(state, identifier) {
  return state.depreciationRuns.get(identifier) ?? [...state.depreciationRuns.values()].find((run) => run.runNo === identifier) ?? null;
}

function listFixedAssetLedgerEntries(state, accountSetId, { fiscalYear, periodNo } = {}) {
  return [...state.fixedAssetLedgerEntries.values()]
    .filter((row) => row.accountSetId === accountSetId)
    .filter((row) => !fiscalYear || row.fiscalYear === Number(fiscalYear))
    .filter((row) => !periodNo || row.periodNo === Number(periodNo))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function buildAssetCount(state, body, actorId, { dryRun }) {
  const countId = `asset-count:${randomUUID()}`;
  const lines = (body.lines ?? []).map((line) => {
    const asset = line.fixedAssetId ? findFixedAssetByIdentifier(state, line.fixedAssetId) : null;
    const actualStatus = line.actualStatus ?? "found";
    const varianceType = actualStatus === "surplus" ? "inventory_surplus" : actualStatus === "missing" ? "inventory_loss" : "matched";
    const bookValue = asset && varianceType === "inventory_loss" && asset.usageStatus !== "disposed" ? roundAmount(asset.netValue ?? 0) : 0;
    const estimatedValue = roundAmount(line.estimatedValue ?? 0);
    return {
      id: `asset-count-line:${randomUUID()}`,
      assetCountId: countId,
      fixedAssetId: asset?.id ?? null,
      assetNo: asset?.assetNo ?? String(line.assetNo),
      assetName: asset?.name ?? line.assetName ?? null,
      departmentId: asset?.currentDepartmentId ?? line.departmentId ?? null,
      departmentName: asset?.currentDepartmentName ?? line.departmentName ?? null,
      actualStatus,
      varianceType,
      bookValue,
      estimatedValue,
      remark: line.remark ?? null
    };
  });
  const voucherDraft = {
    status: "draft",
    sourceType: "phase4_asset_count",
    sourceDocumentId: countId,
    sourceDocumentNo: body.countNo,
    fiscalYear: Number(body.fiscalYear),
    periodNo: Number(body.periodNo),
    approvalRequired: true,
    lines: lines
      .filter((line) => line.varianceType !== "matched")
      .map((line, index) => ({
        lineNo: index + 1,
        summary: `${line.varianceType} ${line.assetNo}`,
        varianceType: line.varianceType,
        amount: line.varianceType === "inventory_surplus" ? line.estimatedValue : -line.bookValue,
        accountCode: line.varianceType === "inventory_surplus" ? "1601" : "6711"
      }))
  };
  const count = {
    id: countId,
    accountSetId: body.accountSetId,
    countNo: body.countNo,
    fiscalYear: Number(body.fiscalYear),
    periodNo: Number(body.periodNo),
    countDate: String(body.countDate).slice(0, 10),
    dryRun,
    status: dryRun ? "preview" : "counted",
    varianceCount: lines.filter((line) => line.varianceType !== "matched").length,
    voucherDraft,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines
  };
  state.assetCounts.set(count.id, count);
  if (!dryRun) {
    for (const line of lines.filter((row) => row.varianceType !== "matched")) {
      appendFixedAssetLedgerEntry(state, {
        accountSetId: count.accountSetId,
        fixedAssetId: line.fixedAssetId,
        assetNo: line.assetNo,
        fiscalYear: count.fiscalYear,
        periodNo: count.periodNo,
        sourceType: "asset_count",
        sourceDocumentId: count.id,
        amount: line.varianceType === "inventory_surplus" ? line.estimatedValue : -line.bookValue,
        occurredAt: count.countDate
      });
    }
  }
  return count;
}

function calculateDepreciationRunLines(state, { accountSetId, fiscalYear, periodNo, runId }) {
  const currentPeriodIndex = periodIndex(fiscalYear, periodNo);
  return listFixedAssets(state, accountSetId).map((asset) => {
    const accumulatedBefore = roundAmount(asset.accumulatedDepreciation ?? 0);
    const depreciableAmount = roundAmount(Number(asset.originalValue ?? 0) - Number(asset.salvageValue ?? 0));
    const remainingDepreciable = roundAmount(Math.max(0, depreciableAmount - accumulatedBefore));
    const servicePeriodIndex = periodIndex(asset.serviceStartYear, asset.serviceStartPeriod);
    let depreciationAmount = 0;
    let skippedReason = null;
    let brakeApplied = false;

    const disposalStopIndex = asset.depreciationStopYear && asset.depreciationStopPeriod ? periodIndex(asset.depreciationStopYear, asset.depreciationStopPeriod) : null;
    if (disposalStopIndex && currentPeriodIndex >= disposalStopIndex) {
      skippedReason = "DISPOSED_BEFORE_PERIOD";
    } else if (asset.isDepreciationStopped) {
      skippedReason = "DEPRECIATION_STOPPED";
    } else if (currentPeriodIndex < servicePeriodIndex) {
      skippedReason = "NEW_ASSET_NOT_STARTED";
    } else if (remainingDepreciable <= 0) {
      skippedReason = "FULLY_DEPRECIATED";
      brakeApplied = true;
    } else {
      const monthlyAmount = roundAmount(depreciableAmount / Number(asset.usefulLifeMonths || 1));
      depreciationAmount = Math.min(monthlyAmount, remainingDepreciable);
      brakeApplied = depreciationAmount >= remainingDepreciable;
    }

    const accumulatedAfter = roundAmount(accumulatedBefore + depreciationAmount);
    return {
      id: `depreciation-run-line:${randomUUID()}`,
      depreciationRunId: runId,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      assetName: asset.name,
      departmentId: asset.currentDepartmentId,
      departmentName: asset.currentDepartmentName ?? null,
      originalValue: roundAmount(asset.originalValue ?? 0),
      salvageValue: roundAmount(asset.salvageValue ?? 0),
      accumulatedDepreciationBefore: accumulatedBefore,
      depreciationAmount: roundAmount(depreciationAmount),
      accumulatedDepreciationAfter: accumulatedAfter,
      netValueAfter: roundAmount(Number(asset.originalValue ?? 0) - accumulatedAfter),
      brakeApplied,
      skippedReason,
      depreciationTimelineRule: "new_asset_next_month",
      depreciationDepartmentRule: "month_end_department"
    };
  });
}

function depreciationRunWarnings(lines = []) {
  return [...new Set(lines.flatMap((line) => [line.skippedReason, line.brakeApplied ? "NET_VALUE_BRAKE_APPLIED" : null]).filter(Boolean))];
}

function buildDepreciationRun(state, body, actorId, { dryRun }) {
  const fiscalYear = Number(body.fiscalYear);
  const periodNo = Number(body.periodNo);
  const runId = `depreciation-run:${randomUUID()}`;
  const lines = calculateDepreciationRunLines(state, { accountSetId: body.accountSetId, fiscalYear, periodNo, runId });
  const totalDepreciationAmount = roundAmount(lines.reduce((sum, line) => sum + line.depreciationAmount, 0));
  const warningCodes = depreciationRunWarnings(lines);
  const run = {
    id: runId,
    accountSetId: body.accountSetId,
    runNo: body.runNo,
    fiscalYear,
    periodNo,
    dryRun,
    status: dryRun ? "draft" : "calculated",
    totalDepreciationAmount,
    lineCount: lines.length,
    warningCodes,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    lines
  };

  state.depreciationRuns.set(run.id, run);
  for (const line of lines) {
    state.depreciationRunLines.set(line.id, line);
    if (!dryRun && line.depreciationAmount > 0) {
      const asset = state.fixedAssets.get(line.fixedAssetId);
      asset.accumulatedDepreciation = line.accumulatedDepreciationAfter;
      asset.netValue = line.netValueAfter;
      appendFixedAssetLedgerEntry(state, {
        accountSetId: body.accountSetId,
        fixedAssetId: asset.id,
        assetNo: asset.assetNo,
        fiscalYear,
        periodNo,
        sourceType: "asset_depreciation",
        sourceDocumentId: run.id,
        amount: -line.depreciationAmount,
        occurredAt: "now"
      });
      if (line.brakeApplied) {
        asset.isDepreciationStopped = true;
        asset.depreciationStoppedAt = "now";
      }
    }
  }
  return run;
}

function normalizeOrderLines(lines = []) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Order lines are required.");
  }
  return lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const taxRate = Number(line.taxRate ?? 0);
    if (!line.itemCode || !line.itemName) {
      throw new Error("Order line itemCode and itemName are required.");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Order line quantity must be greater than 0.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("Order line unitPrice must be non-negative.");
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      throw new Error("Order line taxRate must be a number from 0 to 1.");
    }
    const netAmount = quantity * unitPrice;
    const taxAmount = Number(line.taxAmount ?? Number((netAmount * taxRate).toFixed(2)));
    const totalAmount = Number(line.totalAmount ?? Number((netAmount + taxAmount).toFixed(2)));
    return {
      lineNo: line.lineNo ?? index + 1,
      itemCode: String(line.itemCode),
      itemName: String(line.itemName),
      quantity,
      unitPrice,
      taxRate,
      taxAmount,
      totalAmount,
      receivedQuantity: Number(line.receivedQuantity ?? 0),
      shippedQuantity: Number(line.shippedQuantity ?? 0),
      invoicedQuantity: Number(line.invoicedQuantity ?? 0)
    };
  });
}

function nextBusinessOrderNo(prefix, accountSetId, orderDate, existingOrders) {
  const periodKey = String(orderDate ?? "").slice(0, 7).replace("-", "");
  const base = `${prefix}-${periodKey || "000000"}-`;
  const used = existingOrders
    .filter((order) => order.accountSetId === accountSetId && typeof order.orderNo === "string" && order.orderNo.startsWith(base))
    .map((order) => Number(order.orderNo.slice(base.length)))
    .filter((value) => Number.isInteger(value) && value > 0);
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;
  return `${base}${String(next).padStart(3, "0")}`;
}

async function listPurchaseOrders(state, accountSetId, status = null) {
  const persistedOrders = state.config.platformStore?.listPurchaseOrders
    ? await state.config.platformStore.listPurchaseOrders(accountSetId, status)
    : [];
  const ordersById = new Map(persistedOrders.map((order) => [order.id, order]));
  for (const order of state.purchaseOrders.values()) {
    if (accountSetId && order.accountSetId !== accountSetId) continue;
    if (status && order.status !== status) continue;
    ordersById.set(order.id, order);
  }
  return [...ordersById.values()].sort((left, right) => left.orderNo.localeCompare(right.orderNo));
}

async function listSalesOrders(state, accountSetId, status = null) {
  const persistedOrders = state.config.platformStore?.listSalesOrders
    ? await state.config.platformStore.listSalesOrders(accountSetId, status)
    : [];
  const ordersById = new Map(persistedOrders.map((order) => [order.id, order]));
  for (const order of state.salesOrders.values()) {
    if (accountSetId && order.accountSetId !== accountSetId) continue;
    if (status && order.status !== status) continue;
    ordersById.set(order.id, order);
  }
  return [...ordersById.values()].sort((left, right) => left.orderNo.localeCompare(right.orderNo));
}

async function findPurchaseOrderByIdentifier(state, identifier) {
  return (
    [...state.purchaseOrders.values()].find((order) => order.id === identifier || order.orderNo === identifier) ??
    (state.config.platformStore?.findPurchaseOrder ? await state.config.platformStore.findPurchaseOrder(identifier) : null)
  );
}

async function findSalesOrderByIdentifier(state, identifier) {
  return (
    [...state.salesOrders.values()].find((order) => order.id === identifier || order.orderNo === identifier) ??
    (state.config.platformStore?.findSalesOrder ? await state.config.platformStore.findSalesOrder(identifier) : null)
  );
}

function nextOrderStatus(order, action, actorId) {
  if (action === "submit" && order.status === "draft") {
    return { ...order, status: "submitted", submittedBy: actorId };
  }
  if (action === "approve" && order.status === "submitted") {
    return { ...order, status: "approved", approvedBy: actorId };
  }
  if (action === "close" && ["approved", "partially_executed", "executed"].includes(order.status)) {
    return { ...order, status: "closed", closedBy: actorId };
  }
  throw new Error(`Cannot ${action} order in status ${order.status}.`);
}

function nextFulfillmentNo(prefix, accountSetId, documentDate, existingDocuments, numberField) {
  const periodKey = String(documentDate ?? "").slice(0, 7).replace("-", "");
  const base = `${prefix}-${periodKey || "000000"}-`;
  const used = existingDocuments
    .filter((document) => document.accountSetId === accountSetId && typeof document[numberField] === "string" && document[numberField].startsWith(base))
    .map((document) => Number(document[numberField].slice(base.length)))
    .filter((value) => Number.isInteger(value) && value > 0);
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;
  return `${base}${String(next).padStart(3, "0")}`;
}

async function listPurchaseReceipts(state, accountSetId) {
  const persistedReceipts = state.config.platformStore?.listPurchaseReceipts
    ? await state.config.platformStore.listPurchaseReceipts(accountSetId)
    : [];
  const receiptsById = new Map(persistedReceipts.map((receipt) => [receipt.id, receipt]));
  for (const receipt of state.purchaseReceipts.values()) {
    if (accountSetId && receipt.accountSetId !== accountSetId) continue;
    receiptsById.set(receipt.id, receipt);
  }
  return [...receiptsById.values()].sort((left, right) => left.receiptNo.localeCompare(right.receiptNo));
}

async function listSalesDeliveries(state, accountSetId) {
  const persistedDeliveries = state.config.platformStore?.listSalesDeliveries
    ? await state.config.platformStore.listSalesDeliveries(accountSetId)
    : [];
  const deliveriesById = new Map(persistedDeliveries.map((delivery) => [delivery.id, delivery]));
  for (const delivery of state.salesDeliveries.values()) {
    if (accountSetId && delivery.accountSetId !== accountSetId) continue;
    deliveriesById.set(delivery.id, delivery);
  }
  return [...deliveriesById.values()].sort((left, right) => left.deliveryNo.localeCompare(right.deliveryNo));
}

async function listPurchaseInvoices(state, accountSetId) {
  const persistedInvoices = state.config.platformStore?.listPurchaseInvoices
    ? await state.config.platformStore.listPurchaseInvoices(accountSetId)
    : [];
  const invoicesById = new Map(persistedInvoices.map((invoice) => [invoice.id, invoice]));
  for (const invoice of state.purchaseInvoices.values()) {
    if (accountSetId && invoice.accountSetId !== accountSetId) continue;
    invoicesById.set(invoice.id, invoice);
  }
  return [...invoicesById.values()].sort((left, right) => left.invoiceNo.localeCompare(right.invoiceNo));
}

async function listSalesInvoices(state, accountSetId) {
  const persistedInvoices = state.config.platformStore?.listSalesInvoices
    ? await state.config.platformStore.listSalesInvoices(accountSetId)
    : [];
  const invoicesById = new Map(persistedInvoices.map((invoice) => [invoice.id, invoice]));
  for (const invoice of state.salesInvoices.values()) {
    if (accountSetId && invoice.accountSetId !== accountSetId) continue;
    invoicesById.set(invoice.id, invoice);
  }
  return [...invoicesById.values()].sort((left, right) => left.invoiceNo.localeCompare(right.invoiceNo));
}

async function listCounterpartyLedgerEntries(state, accountSetId, filters = {}) {
  const persistedEntries = state.config.platformStore?.listCounterpartyLedgerEntries
    ? await state.config.platformStore.listCounterpartyLedgerEntries(accountSetId, filters)
    : [];
  const entriesById = new Map(persistedEntries.map((entry) => [entry.id, entry]));
  for (const entry of state.counterpartyLedgerEntries.values()) {
    if (accountSetId && entry.accountSetId !== accountSetId) continue;
    if (filters.direction && entry.direction !== filters.direction) continue;
    if (filters.partnerId && entry.partnerId !== filters.partnerId) continue;
    if (filters.status && entry.status !== filters.status) continue;
    entriesById.set(entry.id, entry);
  }
  return [...entriesById.values()].sort(
    (left, right) => String(left.documentDate).localeCompare(String(right.documentDate)) || left.sourceNo.localeCompare(right.sourceNo)
  );
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysPastDue(dueDate, asOfDate) {
  const due = dateValue(dueDate);
  const asOf = dateValue(asOfDate);
  if (!due || !asOf) return 0;
  return Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / 86400000));
}

function agingBucketKey(days) {
  if (days <= 0) return "bucketCurrent";
  if (days <= 30) return "bucket1To30";
  if (days <= 60) return "bucket31To60";
  if (days <= 90) return "bucket61To90";
  return "bucketOver90";
}

function summarizeCounterpartyLedger(entries, asOfDate) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.direction}:${entry.partnerId}`;
    const row = groups.get(key) ?? {
      partnerId: entry.partnerId,
      partnerName: entry.partnerName ?? null,
      direction: entry.direction,
      originalAmount: 0,
      settledAmount: 0,
      remainingAmount: 0,
      overdueAmount: 0,
      openItemCount: 0,
      status: "current"
    };
    const remainingAmount = Number(entry.remainingAmount ?? 0);
    row.originalAmount = Number((row.originalAmount + Number(entry.originalAmount ?? 0)).toFixed(2));
    row.settledAmount = Number((row.settledAmount + Number(entry.settledAmount ?? 0)).toFixed(2));
    row.remainingAmount = Number((row.remainingAmount + remainingAmount).toFixed(2));
    if (remainingAmount > 0) {
      row.openItemCount += 1;
    }
    if (remainingAmount > 0 && daysPastDue(entry.dueDate, asOfDate) > 0) {
      row.overdueAmount = Number((row.overdueAmount + remainingAmount).toFixed(2));
      row.status = "overdue";
    }
    groups.set(key, row);
  }
  return [...groups.values()].sort((left, right) => left.direction.localeCompare(right.direction) || left.partnerId.localeCompare(right.partnerId));
}

function buildCounterpartyAging(entries, asOfDate) {
  const groups = new Map();
  for (const entry of entries) {
    const remainingAmount = Number(entry.remainingAmount ?? 0);
    if (remainingAmount <= 0) continue;
    const key = `${entry.direction}:${entry.partnerId}`;
    const row = groups.get(key) ?? {
      partnerId: entry.partnerId,
      partnerName: entry.partnerName ?? null,
      direction: entry.direction,
      bucketCurrent: 0,
      bucket1To30: 0,
      bucket31To60: 0,
      bucket61To90: 0,
      bucketOver90: 0,
      totalRemaining: 0,
      detailRows: []
    };
    const days = daysPastDue(entry.dueDate, asOfDate);
    const bucket = agingBucketKey(days);
    row[bucket] = Number((row[bucket] + remainingAmount).toFixed(2));
    row.totalRemaining = Number((row.totalRemaining + remainingAmount).toFixed(2));
    row.detailRows.push({
      id: entry.id,
      sourceNo: entry.sourceNo,
      dueDate: entry.dueDate ?? null,
      daysPastDue: days,
      remainingAmount,
      bucket
    });
    groups.set(key, row);
  }
  return [...groups.values()].sort((left, right) => left.direction.localeCompare(right.direction) || left.partnerId.localeCompare(right.partnerId));
}

async function createCounterpartyLedgerEntry(state, entry) {
  const savedEntry = state.config.platformStore?.createCounterpartyLedgerEntry
    ? await state.config.platformStore.createCounterpartyLedgerEntry(entry)
    : entry;
  state.counterpartyLedgerEntries.set(savedEntry.id, savedEntry);
  return savedEntry;
}

function payableLedgerEntryFromInvoice(invoice) {
  const amount = Number(invoice.payableAmount ?? invoice.totalAmount ?? 0);
  return {
    id: `counterparty-ledger:ap:${invoice.id}`,
    accountSetId: invoice.accountSetId,
    partnerId: invoice.supplierId,
    partnerName: invoice.supplierName ?? null,
    direction: "ap",
    sourceType: "purchase_invoice",
    sourceId: invoice.id,
    sourceNo: invoice.invoiceNo,
    documentDate: invoice.invoiceDate,
    dueDate: invoice.dueDate ?? null,
    originalAmount: amount,
    settledAmount: 0,
    remainingAmount: amount,
    status: "open",
    glAccountCode: "2202",
    auxiliaryType: "supplier",
    auxiliaryPartnerId: invoice.supplierId,
    isPaymentBlocked: false,
    paymentBlockReason: null,
    createdBy: invoice.createdBy
  };
}

function receivableLedgerEntryFromInvoice(invoice) {
  const amount = Number(invoice.receivableAmount ?? invoice.totalAmount ?? 0);
  return {
    id: `counterparty-ledger:ar:${invoice.id}`,
    accountSetId: invoice.accountSetId,
    partnerId: invoice.customerId,
    partnerName: invoice.customerName ?? null,
    direction: "ar",
    sourceType: "sales_invoice",
    sourceId: invoice.id,
    sourceNo: invoice.invoiceNo,
    documentDate: invoice.invoiceDate,
    dueDate: invoice.dueDate ?? null,
    originalAmount: amount,
    settledAmount: 0,
    remainingAmount: amount,
    status: "open",
    glAccountCode: "1122",
    auxiliaryType: "customer",
    auxiliaryPartnerId: invoice.customerId,
    isPaymentBlocked: false,
    paymentBlockReason: null,
    createdBy: invoice.createdBy
  };
}

async function findCounterpartyLedgerEntryById(state, entryId) {
  const inMemoryEntry = state.counterpartyLedgerEntries.get(entryId);
  if (inMemoryEntry) return inMemoryEntry;
  const persistedEntries = state.config.platformStore?.listCounterpartyLedgerEntries
    ? await state.config.platformStore.listCounterpartyLedgerEntries(null, {})
    : [];
  return persistedEntries.find((entry) => entry.id === entryId) ?? null;
}

async function updateCounterpartyLedgerPaymentBlock(state, entryId, updates) {
  const savedEntry = state.config.platformStore?.updateCounterpartyLedgerPaymentBlock
    ? await state.config.platformStore.updateCounterpartyLedgerPaymentBlock(entryId, updates)
    : { ...(await findCounterpartyLedgerEntryById(state, entryId)), ...updates };
  state.counterpartyLedgerEntries.set(savedEntry.id, savedEntry);
  return savedEntry;
}

async function updateCounterpartyLedgerSettlement(state, entryId, updates) {
  const savedEntry = state.config.platformStore?.updateCounterpartyLedgerSettlement
    ? await state.config.platformStore.updateCounterpartyLedgerSettlement(entryId, updates)
    : { ...(await findCounterpartyLedgerEntryById(state, entryId)), ...updates };
  state.counterpartyLedgerEntries.set(savedEntry.id, savedEntry);
  return savedEntry;
}

async function listPaymentRequests(state, accountSetId, filters = {}) {
  const persistedRequests = state.config.platformStore?.listPaymentRequests
    ? await state.config.platformStore.listPaymentRequests(accountSetId, filters)
    : [];
  const requestsById = new Map(persistedRequests.map((request) => [request.id, request]));
  for (const request of state.paymentRequests.values()) {
    if (accountSetId && request.accountSetId !== accountSetId) continue;
    if (filters.status && request.status !== filters.status) continue;
    if (filters.supplierId && request.supplierId !== filters.supplierId) continue;
    requestsById.set(request.id, request);
  }
  return [...requestsById.values()].sort((left, right) => left.requestNo.localeCompare(right.requestNo));
}

async function createPaymentRequest(state, request) {
  const savedRequest = state.config.platformStore?.createPaymentRequest
    ? await state.config.platformStore.createPaymentRequest(request)
    : request;
  state.paymentRequests.set(savedRequest.id, savedRequest);
  return savedRequest;
}

async function updatePaymentRequestStatus(state, requestId, updates) {
  const savedRequest = state.config.platformStore?.updatePaymentRequestStatus
    ? await state.config.platformStore.updatePaymentRequestStatus(requestId, updates)
    : { ...state.paymentRequests.get(requestId), ...updates, approvedAt: updates.approvedAt ?? new Date().toISOString() };
  state.paymentRequests.set(savedRequest.id, savedRequest);
  return savedRequest;
}

async function findPaymentRequestById(state, requestId) {
  const request = state.paymentRequests.get(requestId);
  if (request) return request;
  const persistedRequests = state.config.platformStore?.listPaymentRequests
    ? await state.config.platformStore.listPaymentRequests(null, {})
    : [];
  return persistedRequests.find((item) => item.id === requestId) ?? null;
}

async function listSupplierPayments(state, accountSetId, filters = {}) {
  const persistedPayments = state.config.platformStore?.listSupplierPayments
    ? await state.config.platformStore.listSupplierPayments(accountSetId, filters)
    : [];
  const paymentsById = new Map(persistedPayments.map((payment) => [payment.id, payment]));
  for (const payment of state.supplierPayments.values()) {
    if (accountSetId && payment.accountSetId !== accountSetId) continue;
    if (filters.status && payment.status !== filters.status) continue;
    if (filters.supplierId && payment.supplierId !== filters.supplierId) continue;
    paymentsById.set(payment.id, payment);
  }
  return [...paymentsById.values()].sort((left, right) => left.paymentNo.localeCompare(right.paymentNo));
}

async function createSupplierPayment(state, payment) {
  const savedPayment = state.config.platformStore?.createSupplierPayment
    ? await state.config.platformStore.createSupplierPayment(payment)
    : payment;
  state.supplierPayments.set(savedPayment.id, savedPayment);
  return savedPayment;
}

async function findSupplierPaymentById(state, paymentId) {
  const payment = state.supplierPayments.get(paymentId);
  if (payment) return payment;
  const persistedPayments = state.config.platformStore?.listSupplierPayments
    ? await state.config.platformStore.listSupplierPayments(null, {})
    : [];
  return persistedPayments.find((item) => item.id === paymentId) ?? null;
}

async function listApSettlements(state, accountSetId, filters = {}) {
  const persistedSettlements = state.config.platformStore?.listApSettlements
    ? await state.config.platformStore.listApSettlements(accountSetId, filters)
    : [];
  const settlementsById = new Map(persistedSettlements.map((settlement) => [settlement.id, settlement]));
  for (const settlement of state.apSettlements.values()) {
    if (accountSetId && settlement.accountSetId !== accountSetId) continue;
    if (filters.status && settlement.status !== filters.status) continue;
    if (filters.supplierId && settlement.supplierId !== filters.supplierId) continue;
    settlementsById.set(settlement.id, settlement);
  }
  return [...settlementsById.values()].sort((left, right) => left.settlementNo.localeCompare(right.settlementNo));
}

async function createApSettlement(state, settlement) {
  const savedSettlement = state.config.platformStore?.createApSettlement
    ? await state.config.platformStore.createApSettlement(settlement)
    : settlement;
  state.apSettlements.set(savedSettlement.id, savedSettlement);
  return savedSettlement;
}

async function listArSettlements(state, accountSetId, filters = {}) {
  const persistedSettlements = state.config.platformStore?.listArSettlements
    ? await state.config.platformStore.listArSettlements(accountSetId, filters)
    : [];
  const settlementsById = new Map(persistedSettlements.map((settlement) => [settlement.id, settlement]));
  for (const settlement of state.arSettlements.values()) {
    if (accountSetId && settlement.accountSetId !== accountSetId) continue;
    if (filters.status && settlement.status !== filters.status) continue;
    if (filters.customerId && settlement.customerId !== filters.customerId) continue;
    settlementsById.set(settlement.id, settlement);
  }
  return [...settlementsById.values()].sort((left, right) => left.settlementNo.localeCompare(right.settlementNo));
}

async function createArSettlement(state, settlement) {
  const savedSettlement = state.config.platformStore?.createArSettlement
    ? await state.config.platformStore.createArSettlement(settlement)
    : settlement;
  state.arSettlements.set(savedSettlement.id, savedSettlement);
  return savedSettlement;
}

async function listCustomerReceipts(state, accountSetId, filters = {}) {
  const persistedReceipts = state.config.platformStore?.listCustomerReceipts
    ? await state.config.platformStore.listCustomerReceipts(accountSetId, filters)
    : [];
  const receiptsById = new Map(persistedReceipts.map((receipt) => [receipt.id, receipt]));
  for (const receipt of state.customerReceipts.values()) {
    if (accountSetId && receipt.accountSetId !== accountSetId) continue;
    if (filters.status && receipt.status !== filters.status) continue;
    if (filters.customerId && receipt.customerId !== filters.customerId) continue;
    receiptsById.set(receipt.id, receipt);
  }
  return [...receiptsById.values()].sort((left, right) => left.receiptNo.localeCompare(right.receiptNo));
}

async function createCustomerReceipt(state, receipt) {
  const savedReceipt = state.config.platformStore?.createCustomerReceipt
    ? await state.config.platformStore.createCustomerReceipt(receipt)
    : receipt;
  state.customerReceipts.set(savedReceipt.id, savedReceipt);
  return savedReceipt;
}

async function findCustomerReceiptById(state, receiptId) {
  const receipt = state.customerReceipts.get(receiptId);
  if (receipt) return receipt;
  const persistedReceipts = state.config.platformStore?.listCustomerReceipts
    ? await state.config.platformStore.listCustomerReceipts(null, {})
    : [];
  return persistedReceipts.find((item) => item.id === receiptId) ?? null;
}

function settlementVoucherDraft({ accountSetId, settlementNo, settlementDate, settlementType, amount, bankAccountCode, arAccountCode, apAccountCode }) {
  if (settlementType === "ar_ap_netting") {
    return {
      status: "draft",
      sourceModule: "order-to-cash",
      sourceDocumentNo: settlementNo,
      voucherDate: settlementDate,
      accountSetId,
      lines: [
        { accountCode: apAccountCode ?? "2202", debit: amount, credit: 0 },
        { accountCode: arAccountCode ?? "1122", debit: 0, credit: amount }
      ]
    };
  }
  return {
    status: "draft",
    sourceModule: "order-to-cash",
    sourceDocumentNo: settlementNo,
    voucherDate: settlementDate,
    accountSetId,
    lines: [
      { accountCode: bankAccountCode ?? "1002", debit: amount, credit: 0 },
      { accountCode: arAccountCode ?? "1122", debit: 0, credit: amount }
    ]
  };
}

async function buildAiReconciliationSuggestions(state, accountSetId, asOfDate) {
  const entries = (await listCounterpartyLedgerEntries(state, accountSetId, {})).filter(
    (entry) => Number(entry.remainingAmount ?? 0) > 0 && entry.status !== "settled"
  );
  const receipts = await listCustomerReceipts(state, accountSetId, {});
  const payments = await listSupplierPayments(state, accountSetId, {});
  const suggestions = [];
  for (const entry of entries) {
    if (entry.direction === "ar") {
      const receipt = receipts.find((item) => item.customerId === entry.partnerId && Number(item.receivedAmount ?? 0) > 0);
      if (!receipt) continue;
      suggestions.push({
        direction: "ar",
        settlementType: receipt.receiptType === "prepayment" ? "prepayment_to_bill" : "receipt_to_bill",
        counterpartyLedgerEntryId: entry.id,
        sourceNo: entry.sourceNo,
        matchSourceId: receipt.id,
        matchSourceNo: receipt.receiptNo,
        suggestedAmount: Math.min(Number(entry.remainingAmount ?? 0), Number(receipt.receivedAmount ?? 0)),
        confidence: 0.82,
        evidenceRefs: receipt.evidenceRefs ?? [],
        reason: `Matched ${entry.sourceNo} with customer receipt ${receipt.receiptNo} as of ${asOfDate}.`
      });
    }
    if (entry.direction === "ap") {
      const payment = payments.find((item) => item.supplierId === entry.partnerId && Number(item.paidAmount ?? 0) > 0);
      if (!payment) continue;
      suggestions.push({
        direction: "ap",
        settlementType: "payment_to_bill",
        counterpartyLedgerEntryId: entry.id,
        sourceNo: entry.sourceNo,
        matchSourceId: payment.id,
        matchSourceNo: payment.paymentNo,
        suggestedAmount: Math.min(Number(entry.remainingAmount ?? 0), Number(payment.paidAmount ?? 0)),
        confidence: 0.8,
        evidenceRefs: payment.evidenceRefs ?? [],
        reason: `Matched ${entry.sourceNo} with supplier payment ${payment.paymentNo} as of ${asOfDate}.`
      });
    }
  }
  return suggestions;
}

async function buildAiCollectionDrafts(state, accountSetId, asOfDate) {
  const entries = await listCounterpartyLedgerEntries(state, accountSetId, { direction: "ar" });
  return entries
    .filter((entry) => Number(entry.remainingAmount ?? 0) > 0 && daysPastDue(entry.dueDate, asOfDate) > 0)
    .map((entry) => {
      const days = daysPastDue(entry.dueDate, asOfDate);
      return {
        customerId: entry.partnerId,
        customerName: entry.partnerName ?? null,
        sourceNo: entry.sourceNo,
        dueDate: entry.dueDate ?? null,
        daysPastDue: days,
        remainingAmount: Number(entry.remainingAmount ?? 0),
        subject: `Payment reminder for ${entry.sourceNo}`,
        body: `Dear ${entry.partnerName ?? entry.partnerId}, invoice ${entry.sourceNo} is ${days} days past due with ${Number(entry.remainingAmount ?? 0).toFixed(2)} outstanding. Please review and confirm the expected payment date.`,
        status: "draft",
        evidenceRefs: [entry.id]
      };
    });
}

async function buildAiExceptionFindings(state, accountSetId, asOfDate) {
  const entries = await listCounterpartyLedgerEntries(state, accountSetId, {});
  const findings = [];
  for (const entry of entries) {
    const remainingAmount = Number(entry.remainingAmount ?? 0);
    if (remainingAmount <= 0) continue;
    const overdueDays = daysPastDue(entry.dueDate, asOfDate);
    if (overdueDays > 0 && entry.direction === "ar") {
      findings.push({
        code: "OVERDUE_AR",
        severity: overdueDays > 60 ? "high" : "medium",
        sourceNo: entry.sourceNo,
        message: `${entry.sourceNo} has overdue AR balance ${remainingAmount.toFixed(2)} for ${overdueDays} days.`,
        evidenceRefs: [entry.id]
      });
    }
    if (overdueDays > 0 && entry.direction === "ap") {
      findings.push({
        code: "OVERDUE_AP",
        severity: overdueDays > 60 ? "high" : "medium",
        sourceNo: entry.sourceNo,
        message: `${entry.sourceNo} has overdue AP balance ${remainingAmount.toFixed(2)} for ${overdueDays} days.`,
        evidenceRefs: [entry.id]
      });
    }
    if (entry.direction === "ap" && entry.isPaymentBlocked) {
      findings.push({
        code: "PAYMENT_BLOCKED",
        severity: "medium",
        sourceNo: entry.sourceNo,
        message: `${entry.sourceNo} is blocked for payment: ${entry.paymentBlockReason ?? "no reason provided"}.`,
        evidenceRefs: [entry.id]
      });
    }
  }
  return findings;
}

const SUPPORTED_AGENT_DRAFT_TYPES = new Set([
  "master_data",
  "purchase_order",
  "sales_order",
  "inventory_movement",
  "material_requisition",
  "product_receipt",
  "stock_count",
  "voucher",
  "payroll_allocation",
  "depreciation_run",
  "asset_change",
  "report_interpretation"
]);

function numbersFromText(text) {
  return [...String(text ?? "").matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
}

function itemNameFromInstruction(instruction) {
  const match = String(instruction ?? "").match(/([\p{Script=Han}A-Za-z0-9_-]+材料|[\p{Script=Han}A-Za-z0-9_-]+商品|[\p{Script=Han}A-Za-z0-9_-]+存货)/u);
  return match?.[1] ?? "待匹配存货";
}

function orderSourceLinesToDraftLines(lines = []) {
  return lines.map((line, index) => {
    const quantity = Number(line.quantity ?? 0);
    const unitPrice = Number(line.unitPrice ?? 0);
    const taxRate = Number(line.taxRate ?? 0);
    const netAmount = Number((quantity * unitPrice).toFixed(2));
    const taxAmount = Number(line.taxAmount ?? Number((netAmount * taxRate).toFixed(2)));
    const totalAmount = Number(line.totalAmount ?? Number((netAmount + taxAmount).toFixed(2)));
    return {
      lineNo: line.lineNo ?? index + 1,
      itemId: line.itemId ?? null,
      itemCode: line.itemCode ?? null,
      itemName: line.itemName ?? null,
      quantity,
      unitPrice,
      taxRate,
      taxAmount,
      totalAmount,
      amount: totalAmount
    };
  });
}

function commonLineValue(lines, field) {
  const values = [...new Set(lines.map((line) => line?.[field] ?? null).filter(Boolean))];
  return values.length === 1 ? values[0] : null;
}

function inventoryMovementSourceLinesToDraftLines(lines = []) {
  return lines.map((line, index) => ({
    lineNo: line.lineNo ?? index + 1,
    itemId: line.itemId ?? null,
    itemCode: line.itemCode ?? null,
    itemName: line.itemName ?? null,
    warehouseId: line.warehouseId ?? null,
    warehouseCode: line.warehouseCode ?? null,
    locationId: line.locationId ?? null,
    locationCode: line.locationCode ?? null,
    batchNo: line.batchNo ?? null,
    quantity: Number(line.quantity ?? 0),
    unitCost: Number(line.unitCost ?? 0),
    amount: Number(line.amount ?? 0)
  }));
}

function stockCountSourceLinesToDraftLines(lines = []) {
  return lines.map((line, index) => ({
    lineNo: line.lineNo ?? index + 1,
    itemId: line.itemId ?? null,
    itemCode: line.itemCode ?? null,
    itemName: line.itemName ?? null,
    warehouseId: line.warehouseId ?? null,
    warehouseCode: line.warehouseCode ?? null,
    locationId: line.locationId ?? null,
    locationCode: line.locationCode ?? null,
    batchNo: line.batchNo ?? null,
    bookQuantity: Number(line.bookQuantity ?? 0),
    actualQuantity: Number(line.actualQuantity ?? line.bookQuantity ?? 0),
    differenceQuantity: Number(line.differenceQuantity ?? 0),
    unitCost: Number(line.unitCost ?? 0),
    adjustmentAmount: Number(line.adjustmentAmount ?? 0),
    reason: line.reason ?? null
  }));
}

function voucherSourceLinesToDraftLines(lines = []) {
  return lines.map((line, index) => ({
    lineNo: line.lineNo ?? index + 1,
    summary: line.summary ?? "",
    accountCode: line.accountCode ?? null,
    accountName: line.accountName ?? null,
    debit: Number(line.debit ?? 0),
    credit: Number(line.credit ?? 0),
    auxiliaries: line.auxiliaries ? { ...line.auxiliaries } : {}
  }));
}

function payrollRunSourceLinesToDraftRules(lines = [], totalCompanyCost = 0) {
  const grouped = new Map();
  for (const line of lines) {
    const key = line.departmentId ?? "unassigned";
    const current = grouped.get(key) ?? {
      departmentId: line.departmentId ?? null,
      targetType: "department",
      workOrderId: null,
      costType: "direct_labor",
      amount: 0
    };
    current.amount = roundAmount(current.amount + Number(line.companyCost ?? 0));
    grouped.set(key, current);
  }
  const total = Number(totalCompanyCost ?? 0);
  return [...grouped.values()].map((rule, index) => ({
    lineNo: index + 1,
    ...rule,
    allocationRate: total > 0 ? Number((rule.amount / total).toFixed(4)) : 0
  }));
}

function guessAssetChangeKind(instruction) {
  const text = String(instruction ?? "").toLowerCase();
  if (text.includes("transfer") || text.includes("move") || text.includes("转移") || text.includes("调拨")) {
    return "transfer";
  }
  if (text.includes("increase") || text.includes("improve") || text.includes("value") || text.includes("原值") || text.includes("改良")) {
    return "value_change";
  }
  if (text.includes("dispose") || text.includes("scrap") || text.includes("处置") || text.includes("报废")) {
    return "disposal";
  }
  return "change_request";
}

function buildDraftPayloadFromInstruction(draftType, instruction, sourceContext = {}, requestContext = {}) {
  const numbers = numbersFromText(instruction);
  const quantity = numbers[0] ?? 1;
  const unitPrice = numbers[1] ?? 0;
  const amount = Number((quantity * unitPrice).toFixed(2));
  const sourceObject = sourceContext?.sourceObject;

  if (draftType === "purchase_order" && sourceObject?.objectType === "purchase_order") {
    return {
      documentType: "purchase_order",
      sourceOrderId: sourceObject.id,
      sourceOrderNo: sourceObject.orderNo,
      orderDate: sourceObject.orderDate ?? new Date().toISOString().slice(0, 10),
      supplierId: sourceObject.supplierId ?? null,
      currency: sourceObject.currency ?? "CNY",
      exchangeRate: sourceObject.exchangeRate ?? 1,
      lines: orderSourceLinesToDraftLines(sourceObject.lines)
    };
  }

  if (draftType === "sales_order" && sourceObject?.objectType === "sales_order") {
    return {
      documentType: "sales_order",
      sourceOrderId: sourceObject.id,
      sourceOrderNo: sourceObject.orderNo,
      orderDate: sourceObject.orderDate ?? new Date().toISOString().slice(0, 10),
      customerId: sourceObject.customerId ?? null,
      currency: sourceObject.currency ?? "CNY",
      exchangeRate: sourceObject.exchangeRate ?? 1,
      lines: orderSourceLinesToDraftLines(sourceObject.lines)
    };
  }

  if (draftType === "purchase_order" || draftType === "sales_order") {
    return {
      documentType: draftType,
      businessDate: new Date().toISOString().slice(0, 10),
      counterpartyId: null,
      lines: [
        {
          itemId: null,
          itemName: itemNameFromInstruction(instruction),
          quantity,
          unitPrice,
          amount
        }
      ]
    };
  }

  if (draftType === "inventory_movement") {
    if (sourceObject?.objectType === "inventory_movement") {
      const lines = inventoryMovementSourceLinesToDraftLines(sourceObject.lines);
      return {
        documentType: "inventory_movement",
        sourceMovementId: sourceObject.id,
        sourceDocumentNo: sourceObject.documentNo,
        movementType: sourceObject.movementType,
        businessType: sourceObject.businessType ?? sourceObject.movementType,
        fiscalYear: sourceObject.fiscalYear ?? null,
        periodNo: sourceObject.periodNo ?? null,
        movementDate: sourceObject.movementDate ?? new Date().toISOString().slice(0, 10),
        warehouseId: commonLineValue(lines, "warehouseId"),
        lines
      };
    }
    return {
      documentType: "inventory_movement",
      movementType: String(instruction ?? "").includes("出库") ? "outbound" : "inbound",
      warehouseId: null,
      lines: [{ itemId: null, itemName: itemNameFromInstruction(instruction), quantity, unitCost: unitPrice, amount }]
    };
  }

  if (draftType === "material_requisition") {
    if (sourceObject?.objectType === "work_order") {
      const yieldQuantity = Number(sourceObject.bomYieldQuantity ?? 1) || 1;
      const lines = (sourceObject.bomLines ?? []).map((line) => {
        const scrapRate = Number(line.scrapRate ?? 0);
        const grossQuantity = (Number(sourceObject.plannedQuantity ?? 0) / yieldQuantity) * Number(line.quantity ?? 0);
        return {
          componentItemId: line.componentItemId,
          componentItemCode: line.componentItemCode,
          itemName: line.componentItemName,
          warehouseId: null,
          quantity: roundQuantity(scrapRate > 0 && scrapRate < 1 ? grossQuantity / (1 - scrapRate) : grossQuantity)
        };
      });
      return {
        documentType: "material_requisition",
        workOrderId: sourceObject.id,
        fiscalYear: sourceObject.fiscalYear ?? null,
        periodNo: sourceObject.periodNo ?? null,
        lines: lines.length > 0 ? lines : [{ componentItemId: null, itemName: itemNameFromInstruction(instruction), warehouseId: null, quantity }]
      };
    }
    return {
      documentType: "material_requisition",
      workOrderId: null,
      fiscalYear: null,
      periodNo: null,
      lines: [
        {
          componentItemId: null,
          itemName: itemNameFromInstruction(instruction),
          warehouseId: null,
          quantity
        }
      ]
    };
  }

  if (draftType === "product_receipt") {
    if (sourceObject?.objectType === "work_order") {
      return {
        documentType: "product_receipt",
        workOrderId: sourceObject.id,
        fiscalYear: sourceObject.fiscalYear ?? null,
        periodNo: sourceObject.periodNo ?? null,
        lines: [
          {
            productItemId: sourceObject.productItemId,
            productItemCode: sourceObject.productItemCode,
            itemName: sourceObject.productItemName,
            warehouseId: null,
            quantity: roundQuantity(Math.max(Number(sourceObject.remainingQuantity ?? sourceObject.plannedQuantity ?? quantity), 0) || quantity)
          }
        ]
      };
    }
    return {
      documentType: "product_receipt",
      workOrderId: null,
      fiscalYear: null,
      periodNo: null,
      lines: [
        {
          productItemId: null,
          itemName: itemNameFromInstruction(instruction),
          warehouseId: null,
          quantity
        }
      ]
    };
  }

  if (draftType === "stock_count" && sourceObject?.objectType === "stock_count") {
    return {
      documentType: "stock_count",
      sourceStockCountId: sourceObject.id,
      sourceCountNo: sourceObject.countNo,
      fiscalYear: sourceObject.fiscalYear ?? null,
      periodNo: sourceObject.periodNo ?? null,
      lines: stockCountSourceLinesToDraftLines(sourceObject.lines)
    };
  }

  if (draftType === "voucher" && sourceObject?.objectType === "voucher") {
    return {
      documentType: "voucher",
      sourceVoucherId: sourceObject.id,
      sourceVoucherNo: sourceObject.voucherNo,
      fiscalYear: sourceObject.fiscalYear ?? null,
      periodNo: sourceObject.periodNo ?? null,
      voucherDate: sourceObject.voucherDate ?? new Date().toISOString().slice(0, 10),
      lines: voucherSourceLinesToDraftLines(sourceObject.lines)
    };
  }

  if (draftType === "payroll_allocation" && sourceObject?.objectType === "payroll_run") {
    return {
      documentType: "payroll_allocation",
      payrollRunId: sourceObject.id,
      runNo: sourceObject.runNo,
      fiscalYear: sourceObject.fiscalYear ?? null,
      periodNo: sourceObject.periodNo ?? null,
      rules: payrollRunSourceLinesToDraftRules(sourceObject.lines, sourceObject.totalCompanyCost)
    };
  }

  if (draftType === "asset_change" && sourceObject?.objectType === "fixed_asset") {
    const changeAmount = numbers[0] == null ? null : Number(numbers[0]);
    return {
      documentType: "asset_change",
      changeKind: guessAssetChangeKind(instruction),
      fixedAssetId: sourceObject.id,
      assetNo: sourceObject.assetNo,
      assetName: sourceObject.assetName,
      changeDate: new Date().toISOString().slice(0, 10),
      fromDepartmentId: sourceObject.currentDepartmentId ?? null,
      fromDepartmentName: sourceObject.currentDepartmentName ?? null,
      toDepartmentId: null,
      toDepartmentName: null,
      amount: Number.isFinite(changeAmount) ? changeAmount : null,
      reason: String(instruction ?? "")
    };
  }

  if (draftType === "depreciation_run") {
    const fiscalYear = Number(requestContext.fiscalYear ?? new Date().getFullYear());
    const periodNo = Number(requestContext.periodNo ?? 1);
    return {
      documentType: "depreciation_run",
      runNo: `AGENT-DEP-${fiscalYear}${String(periodNo).padStart(2, "0")}`,
      fiscalYear,
      periodNo,
      dryRun: true,
      lines: []
    };
  }

  if (draftType === "report_interpretation" && sourceObject?.objectType === "report_run") {
    const evidenceRefs = (sourceObject.cells ?? []).map((cell) => cell.evidenceRef).filter(Boolean);
    return {
      documentType: "report_interpretation",
      reportRunId: sourceObject.id,
      fiscalYear: sourceObject.fiscalYear ?? null,
      periodNo: sourceObject.periodNo ?? null,
      snapshotHash: sourceObject.snapshotHash ?? null,
      summary: String(instruction ?? ""),
      keyFindings: [],
      warnings: [],
      evidenceRefs
    };
  }

  if (draftType === "voucher") {
    return {
      documentType: "voucher",
      lines: [
        { summary: "Agent候选分录", accountCode: null, debit: amount, credit: 0 },
        { summary: "Agent候选分录", accountCode: null, debit: 0, credit: amount }
      ]
    };
  }

  return {
    documentType: draftType,
    instruction: String(instruction ?? ""),
    amount
  };
}

function unmatchedItemsForDraft(draftType, draftPayload) {
  const items = [];
  if (draftType === "purchase_order" && !draftPayload.supplierId) {
    items.push({ field: "supplierId", reason: "Supplier must be selected from matched master data before saving." });
  }
  if (draftType === "sales_order" && !draftPayload.customerId) {
    items.push({ field: "customerId", reason: "Customer must be selected from matched master data before saving." });
  }
  if (["purchase_order", "sales_order", "inventory_movement", "stock_count"].includes(draftType)) {
    for (const [index, line] of (draftPayload.lines ?? []).entries()) {
      if (!line.itemId) {
        items.push({ field: `lines[${index}].itemId`, reason: "Inventory item must be matched before saving." });
      }
    }
  }
  if (draftType === "inventory_movement" && !draftPayload.warehouseId) {
    items.push({ field: "warehouseId", reason: "Warehouse must be selected before saving." });
  }
  if (draftType === "material_requisition") {
    if (!draftPayload.workOrderId) {
      items.push({ field: "workOrderId", reason: "Work order must be selected before saving the material requisition draft." });
    }
    for (const [index, line] of (draftPayload.lines ?? []).entries()) {
      if (!line.componentItemId) {
        items.push({ field: `lines[${index}].componentItemId`, reason: "Component item must be matched before saving." });
      }
      if (!line.warehouseId) {
        items.push({ field: `lines[${index}].warehouseId`, reason: "Warehouse must be selected before saving." });
      }
    }
  }
  if (draftType === "product_receipt") {
    if (!draftPayload.workOrderId) {
      items.push({ field: "workOrderId", reason: "Work order must be selected before saving the product receipt draft." });
    }
    for (const [index, line] of (draftPayload.lines ?? []).entries()) {
      if (!line.productItemId) {
        items.push({ field: `lines[${index}].productItemId`, reason: "Finished good item must be matched before saving." });
      }
      if (!line.warehouseId) {
        items.push({ field: `lines[${index}].warehouseId`, reason: "Warehouse must be selected before saving." });
      }
    }
  }
  if (draftType === "voucher") {
    for (const [index, line] of (draftPayload.lines ?? []).entries()) {
      if (!line.accountCode) {
        items.push({ field: `lines[${index}].accountCode`, reason: "Accounts must be matched before saving the voucher draft." });
      }
    }
  }
  return items;
}

function validateLlmGeneratedDraftPayload(draftType, draftPayload) {
  const errors = [];
  if (!draftPayload || typeof draftPayload !== "object" || Array.isArray(draftPayload)) {
    errors.push("draftPayload must be an object.");
  }
  if (draftPayload?.documentType && draftPayload.documentType !== draftType) {
    errors.push(`draftPayload.documentType must equal ${draftType}.`);
  }
  if ([
    "purchase_order",
    "sales_order",
    "inventory_movement",
    "material_requisition",
    "product_receipt",
    "stock_count",
    "voucher"
  ].includes(draftType)) {
    if (!Array.isArray(draftPayload?.lines) || draftPayload.lines.length === 0) {
      errors.push("draftPayload.lines is required.");
    }
  }
  if (["purchase_order", "sales_order"].includes(draftType) && Array.isArray(draftPayload?.lines)) {
    for (const [index, line] of draftPayload.lines.entries()) {
      if (typeof line !== "object" || line === null || Array.isArray(line)) {
        errors.push(`draftPayload.lines[${index}] must be an object.`);
        continue;
      }
      if (typeof line.quantity !== "number") {
        errors.push(`draftPayload.lines[${index}].quantity must be a number.`);
      }
      if (typeof line.unitPrice !== "number") {
        errors.push(`draftPayload.lines[${index}].unitPrice must be a number.`);
      }
    }
  }
  if (errors.length > 0) {
    const error = new Error(`LLM draft output schema validation failed: ${errors.join(" ")}`);
    error.code = "LLM_DRAFT_SCHEMA_INVALID";
    throw error;
  }
}

function orderLinesToSourceLines(lines = []) {
  return lines.map((line, index) => ({
    id: line.id ?? null,
    lineNo: line.lineNo ?? index + 1,
    itemId: line.itemId ?? null,
    itemCode: line.itemCode ?? null,
    itemName: line.itemName ?? null,
    quantity: Number(line.quantity ?? 0),
    unitPrice: Number(line.unitPrice ?? 0),
    taxRate: Number(line.taxRate ?? 0),
    taxAmount: Number(line.taxAmount ?? 0),
    totalAmount: Number(line.totalAmount ?? 0),
    receivedQuantity: Number(line.receivedQuantity ?? 0),
    shippedQuantity: Number(line.shippedQuantity ?? 0),
    invoicedQuantity: Number(line.invoicedQuantity ?? 0)
  }));
}

async function buildPurchaseOrderSourceSnapshot(state, accountSetId, sourceObjectId) {
  const order = await findPurchaseOrderByIdentifier(state, sourceObjectId);
  if (!order || order.accountSetId !== accountSetId) {
    throw new Error("Agent draft source purchase order was not found.");
  }
  return {
    objectType: "purchase_order",
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    orderDate: order.orderDate,
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    totalAmount: order.totalAmount,
    lines: orderLinesToSourceLines(order.lines)
  };
}

async function buildSalesOrderSourceSnapshot(state, accountSetId, sourceObjectId) {
  const order = await findSalesOrderByIdentifier(state, sourceObjectId);
  if (!order || order.accountSetId !== accountSetId) {
    throw new Error("Agent draft source sales order was not found.");
  }
  return {
    objectType: "sales_order",
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    customerId: order.customerId,
    customerName: order.customerName,
    orderDate: order.orderDate,
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    totalAmount: order.totalAmount,
    lines: orderLinesToSourceLines(order.lines)
  };
}

function buildInventoryMovementSourceSnapshot(state, accountSetId, sourceObjectId) {
  const movement =
    [...state.inventoryMovements.values()].find((row) => row.id === sourceObjectId || row.documentNo === sourceObjectId) ?? null;
  if (!movement || movement.accountSetId !== accountSetId) {
    throw new Error("Agent draft source inventory movement was not found.");
  }
  return {
    objectType: "inventory_movement",
    id: movement.id,
    documentNo: movement.documentNo,
    movementType: movement.movementType,
    businessType: movement.businessType,
    sourceType: movement.sourceType,
    sourceDocumentId: movement.sourceDocumentId,
    fiscalYear: movement.fiscalYear,
    periodNo: movement.periodNo,
    movementDate: movement.movementDate,
    costStatus: movement.costStatus,
    totalQuantity: movement.totalQuantity,
    totalAmount: movement.totalAmount,
    lines: inventoryMovementSourceLinesToDraftLines(movement.lines)
  };
}

function buildStockCountSourceSnapshot(state, accountSetId, sourceObjectId) {
  const stockCount = [...state.stockCounts.values()].find((row) => row.id === sourceObjectId || row.countNo === sourceObjectId) ?? null;
  if (!stockCount || stockCount.accountSetId !== accountSetId) {
    throw new Error("Agent draft source stock count was not found.");
  }
  return {
    objectType: "stock_count",
    id: stockCount.id,
    countNo: stockCount.countNo,
    status: stockCount.status,
    fiscalYear: stockCount.fiscalYear,
    periodNo: stockCount.periodNo,
    totalDifferenceQuantity: stockCount.totalDifferenceQuantity,
    totalAdjustmentAmount: stockCount.totalAdjustmentAmount,
    lines: stockCountSourceLinesToDraftLines(stockCount.lines)
  };
}

async function buildVoucherSourceSnapshot(state, accountSetId, sourceObjectId) {
  const voucher = await findVoucherByIdentifier(state, sourceObjectId);
  if (!voucher || voucher.accountSetId !== accountSetId) {
    throw new Error("Agent draft source voucher was not found.");
  }
  const accounts = await listVoucherAccounts(state, voucher);
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  return {
    objectType: "voucher",
    id: voucher.id,
    voucherNo: voucher.voucherNo,
    voucherDate: voucher.voucherDate,
    status: voucher.status,
    sourceType: voucher.sourceType ?? null,
    fiscalYear: voucher.fiscalYear,
    periodNo: voucher.periodNo,
    attachmentCount: voucher.attachmentCount ?? 0,
    attachmentIds: state.attachmentLinks
      .filter((link) => link.objectType === "voucher" && link.objectId === voucher.id)
      .map((link) => link.attachmentId),
    lines: (voucher.lines ?? []).map((line, index) => ({
      lineNo: line.lineNo ?? index + 1,
      summary: line.summary ?? "",
      accountCode: line.accountCode ?? null,
      accountName: accountsByCode.get(line.accountCode)?.name ?? null,
      debit: Number(line.debit ?? 0),
      credit: Number(line.credit ?? 0),
      auxiliaries: line.auxiliaries ? { ...line.auxiliaries } : {}
    }))
  };
}

function buildPayrollRunSourceSnapshot(state, accountSetId, sourceObjectId) {
  const run = findPayrollRunByIdentifier(state, sourceObjectId);
  if (!run || run.accountSetId !== accountSetId) {
    throw new Error("Agent draft source payroll run was not found.");
  }
  return {
    objectType: "payroll_run",
    id: run.id,
    runNo: run.runNo,
    status: run.status,
    payrollCategoryId: run.payrollCategoryId,
    payrollCategoryCode: run.payrollCategoryCode,
    variableImportId: run.variableImportId,
    fiscalYear: run.fiscalYear,
    periodNo: run.periodNo,
    lineCount: run.lineCount,
    totalGrossAmount: run.totalGrossAmount,
    totalDeductionAmount: run.totalDeductionAmount,
    totalTaxAmount: run.totalTaxAmount,
    totalNetPay: run.totalNetPay,
    totalCompanyCost: run.totalCompanyCost,
    lines: (run.lines ?? []).map((line, index) => ({
      id: line.id ?? null,
      lineNo: line.lineNo ?? index + 1,
      employeeProfileId: line.employeeProfileId,
      employeeNo: line.employeeNo,
      employeeName: line.employeeName,
      departmentId: line.departmentId,
      departmentName: line.departmentName ?? null,
      grossAmount: line.grossAmount,
      deductionAmount: line.deductionAmount,
      taxableIncome: line.taxableIncome,
      individualIncomeTax: line.individualIncomeTax,
      netPay: line.netPay,
      companyCost: line.companyCost
    }))
  };
}

function buildFixedAssetSourceSnapshot(state, accountSetId, sourceObjectId) {
  const asset = findFixedAssetByIdentifier(state, sourceObjectId);
  if (!asset || asset.accountSetId !== accountSetId) {
    throw new Error("Agent draft source fixed asset was not found.");
  }
  const snapshot = createAssetSnapshot(asset);
  return {
    objectType: "fixed_asset",
    id: snapshot.id,
    assetNo: snapshot.assetNo,
    assetName: snapshot.name,
    categoryId: snapshot.categoryId ?? null,
    categoryCode: snapshot.categoryCode ?? null,
    depreciationMethodId: snapshot.depreciationMethodId ?? null,
    depreciationMethodCode: snapshot.depreciationMethodCode ?? null,
    acquisitionType: snapshot.acquisitionType ?? null,
    acquisitionDate: snapshot.acquisitionDate ?? null,
    originalValue: snapshot.originalValue,
    accumulatedDepreciation: snapshot.accumulatedDepreciation,
    netValue: snapshot.netValue,
    salvageValue: snapshot.salvageValue,
    usefulLifeMonths: snapshot.usefulLifeMonths,
    serviceStartYear: snapshot.serviceStartYear,
    serviceStartPeriod: snapshot.serviceStartPeriod,
    currentDepartmentId: snapshot.currentDepartmentId,
    currentDepartmentName: snapshot.currentDepartmentName ?? null,
    responsiblePerson: snapshot.responsiblePerson ?? null,
    usageStatus: snapshot.usageStatus,
    depreciationTimelineRule: snapshot.depreciationTimelineRule,
    depreciationDepartmentRule: snapshot.depreciationDepartmentRule,
    isDepreciationStopped: snapshot.isDepreciationStopped ?? false
  };
}

function buildReportRunSourceSnapshot(state, accountSetId, sourceObjectId) {
  const run = findReportRunByIdentifier(state, sourceObjectId);
  if (!run || run.accountSetId !== accountSetId) {
    throw new Error("Agent draft source report run was not found.");
  }
  const template = findReportTemplateForRun(state, run);
  const cells = (run.cells ?? []).map((cell) => ({
    id: cell.id ?? null,
    sheetCode: cell.sheetCode,
    cellAddress: cell.cellAddress,
    label: cell.label ?? null,
    formulaText: cell.formulaText ?? null,
    calculatedValue: Number(cell.calculatedValue ?? cell.value ?? 0),
    displayFormat: cell.displayFormat ?? null,
    traceId: cell.traceId ?? null,
    evidenceRef: reportCellEvidenceRef(cell)
  }));
  return {
    objectType: "report_run",
    id: run.id,
    templateVersionId: run.templateVersionId,
    templateId: template?.id ?? null,
    templateCode: template?.templateCode ?? null,
    templateName: template?.templateName ?? null,
    reportType: template?.reportType ?? null,
    fiscalYear: run.fiscalYear,
    periodNo: run.periodNo,
    includeUnposted: run.includeUnposted,
    runMode: run.runMode,
    status: run.status,
    renderMode: reportRunRenderMode(run),
    snapshotHash: run.snapshotHash,
    cellCount: cells.length,
    traceLinkCount: (run.traceLinks ?? []).length,
    cells,
    traceLinks: (run.traceLinks ?? []).map((link) => ({
      id: link.id ?? null,
      traceId: link.traceId ?? null,
      sourceType: link.sourceType ?? null,
      accountCode: link.accountCode ?? null,
      accountName: link.accountName ?? null,
      amount: Number(link.amount ?? 0)
    }))
  };
}

function buildWorkOrderSourceSnapshot(state, accountSetId, sourceObjectId) {
  const workOrder = findWorkOrderByIdentifier(state, sourceObjectId);
  if (!workOrder || workOrder.accountSetId !== accountSetId) {
    throw new Error("Agent draft source work order was not found.");
  }
  const bom = findBomByIdentifier(state, workOrder.bomId);
  return {
    objectType: "work_order",
    id: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    status: workOrder.status,
    productItemId: workOrder.productItemId,
    productItemCode: workOrder.productItemCode,
    productItemName: workOrder.productItemName,
    bomId: workOrder.bomId,
    bomVersion: workOrder.bomVersion,
    bomYieldQuantity: bom?.yieldQuantity ?? 1,
    plannedQuantity: workOrder.plannedQuantity,
    completedQuantity: workOrder.completedQuantity,
    remainingQuantity: roundQuantity(Math.max(Number(workOrder.plannedQuantity ?? 0) - Number(workOrder.completedQuantity ?? 0), 0)),
    directMaterialCost: workOrder.directMaterialCost,
    fiscalYear: workOrder.fiscalYear,
    periodNo: workOrder.periodNo,
    bomLines: (bom?.lines ?? []).map((line) => ({
      componentItemId: line.componentItemId,
      componentItemCode: line.componentItemCode,
      componentItemName: line.componentItemName,
      lineNo: line.lineNo,
      quantity: line.quantity,
      scrapRate: line.scrapRate
    }))
  };
}

async function resolveAgentDraftSourceContext(state, body) {
  const sourceContext = {
    sourceObjectType: body.sourceObjectType ?? null,
    sourceObjectId: body.sourceObjectId ?? null,
    userInstruction: body.userInstruction
  };
  if (!body.sourceObjectType || !body.sourceObjectId) {
    return sourceContext;
  }
  if (body.sourceObjectType === "work_order") {
    return {
      ...sourceContext,
      sourceObject: buildWorkOrderSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "purchase_order") {
    return {
      ...sourceContext,
      sourceObject: await buildPurchaseOrderSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "sales_order") {
    return {
      ...sourceContext,
      sourceObject: await buildSalesOrderSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "inventory_movement") {
    return {
      ...sourceContext,
      sourceObject: buildInventoryMovementSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "stock_count") {
    return {
      ...sourceContext,
      sourceObject: buildStockCountSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "voucher") {
    return {
      ...sourceContext,
      sourceObject: await buildVoucherSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "payroll_run") {
    return {
      ...sourceContext,
      sourceObject: buildPayrollRunSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "fixed_asset") {
    return {
      ...sourceContext,
      sourceObject: buildFixedAssetSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  if (body.sourceObjectType === "report_run") {
    return {
      ...sourceContext,
      sourceObject: buildReportRunSourceSnapshot(state, body.accountSetId, body.sourceObjectId)
    };
  }
  return sourceContext;
}

function llmDraftProviderModelFor(state) {
  return {
    provider:
      state.config.llmDraftAdapter?.provider ??
      state.config.llmDraftProvider ??
      globalThis.process?.env?.AIS_LLM_DRAFT_PROVIDER ??
      "local-rule-based",
    model:
      state.config.llmDraftAdapter?.model ??
      state.config.llmDraftModel ??
      globalThis.process?.env?.AIS_LLM_DRAFT_MODEL ??
      "local-draft-rules-v1"
  };
}

function createFailedLlmDraftRun(state, body, ocrResults, error) {
  const { provider, model } = llmDraftProviderModelFor(state);
  return {
    id: `llm-draft-run:${randomUUID()}`,
    accountSetId: body.accountSetId,
    provider,
    model,
    status: "failed",
    inputSummary: {
      draftType: body.draftType,
      sourceObjectType: body.sourceObjectType ?? null,
      sourceObjectId: body.sourceObjectId ?? null,
      sourceContext: body.sourceContext ?? null,
      ocrText: (ocrResults ?? []).map((result) => result.extractedText).filter(Boolean).join("\n"),
      evidenceRefs: Array.isArray(body.evidenceRefs) ? [...body.evidenceRefs] : []
    },
    outputSchema: body.draftType,
    errorMessage: error.message,
    createdAt: "now"
  };
}

async function runLlmDraftAdapter(state, body) {
  const adapter = state.config.llmDraftAdapter;
  const { provider, model } = llmDraftProviderModelFor(state);
  const ocrText = (body.ocrResults ?? []).map((result) => result.extractedText).filter(Boolean).join("\n");
  const adapterInput = {
    accountSetId: body.accountSetId,
    fiscalYear: body.fiscalYear ?? null,
    periodNo: body.periodNo ?? null,
    fiscalPeriodId: body.fiscalPeriodId ?? null,
    draftType: body.draftType,
    sourceObjectType: body.sourceObjectType ?? null,
    sourceObjectId: body.sourceObjectId ?? null,
    sourceContext: body.sourceContext ?? {
      sourceObjectType: body.sourceObjectType ?? null,
      sourceObjectId: body.sourceObjectId ?? null,
      userInstruction: body.userInstruction
    },
    userInstruction: body.userInstruction,
    ocrText,
    ocrResults: body.ocrResults ?? [],
    evidenceRefs: Array.isArray(body.evidenceRefs) ? [...body.evidenceRefs] : [],
    dryRun: true
  };
  const generated = adapter?.generateDraft ? await adapter.generateDraft(adapterInput) : null;
  const instructionWithOcr = [body.userInstruction, ocrText].filter(Boolean).join("\n");
  const draftPayload = generated?.draftPayload ?? buildDraftPayloadFromInstruction(body.draftType, instructionWithOcr, adapterInput.sourceContext, body);
  if (generated?.draftPayload) {
    validateLlmGeneratedDraftPayload(body.draftType, draftPayload);
  }
  const unmatchedItems = generated?.unmatchedItems ?? unmatchedItemsForDraft(body.draftType, draftPayload);
  const llmDraftRun = {
    id: `llm-draft-run:${randomUUID()}`,
    accountSetId: body.accountSetId,
    provider: generated?.provider ?? provider,
    model: generated?.model ?? model,
    status: generated?.status ?? "completed",
    inputSummary: {
      draftType: body.draftType,
      sourceObjectType: body.sourceObjectType ?? null,
      sourceObjectId: body.sourceObjectId ?? null,
      sourceContext: adapterInput.sourceContext,
      ocrText,
      evidenceRefs: Array.isArray(body.evidenceRefs) ? [...body.evidenceRefs] : []
    },
    outputSchema: generated?.outputSchema ?? body.draftType,
    createdAt: "now"
  };
  return { llmDraftRun, draftPayload, unmatchedItems };
}

async function runOcrForAttachment(state, attachment) {
  if (attachment.storageProvider !== "local") {
    return {
      attachmentId: attachment.id,
      provider: state.config.ocrAdapter?.provider ?? "local-ocr-placeholder",
      model: state.config.ocrAdapter?.model ?? null,
      status: "metadata_only",
      extractedText: "",
      confidence: 0,
      warning: "Attachment content is not available in local storage for OCR."
    };
  }

  const content = readFileSync(join(attachmentStorageRootFor(state), attachment.storageKey));
  const adapter = state.config.ocrAdapter;
  if (adapter?.extractText) {
    const result = await adapter.extractText({ attachment, content, state });
    return {
      attachmentId: attachment.id,
      provider: result.provider ?? adapter.provider ?? "configured-local-ocr",
      model: result.model ?? adapter.model ?? null,
      status: result.status ?? "completed",
      extractedText: result.extractedText ?? "",
      confidence: Number(result.confidence ?? 0),
      warning: result.warning ?? null
    };
  }
  const isText = attachment.contentType?.startsWith("text/") || /\.(txt|csv|tsv|json)$/i.test(attachment.filename ?? "");
  const extractedText = isText ? content.toString("utf8") : `[local OCR placeholder extracted text from ${attachment.filename}]`;
  return {
    attachmentId: attachment.id,
    provider: "local-ocr-placeholder",
    model: "local-placeholder-v1",
    status: "completed",
    extractedText,
    confidence: isText ? 0.99 : 0.55
  };
}

async function buildOcrResultsForDraft(state, body) {
  const attachmentIds = Array.isArray(body.attachmentIds) ? [...new Set(body.attachmentIds)] : [];
  const results = [];
  const reviewedByAttachmentId = new Map(
    (Array.isArray(body.reviewedOcrResults) ? body.reviewedOcrResults : [])
      .filter((result) => typeof result?.attachmentId === "string")
      .map((result) => [result.attachmentId, result])
  );
  for (const attachmentId of attachmentIds) {
    const attachment = state.attachments.get(attachmentId);
    if (!attachment || attachment.status !== "available" || attachment.accountSetId !== body.accountSetId) {
      throw new Error("Draft attachments must exist, belong to the account set, and be available.");
    }
    const ocrResult = await runOcrForAttachment(state, attachment);
    const reviewed = reviewedByAttachmentId.get(attachmentId);
    if (reviewed) {
      if (typeof reviewed.extractedText !== "string" || reviewed.extractedText.trim() === "") {
        throw new Error("reviewedOcrResults[].extractedText is required when overriding OCR text.");
      }
      results.push({
        ...ocrResult,
        status: "reviewed",
        originalExtractedText: ocrResult.extractedText,
        extractedText: reviewed.extractedText,
        reviewedBy: reviewed.reviewedBy ?? body.requestedBy ?? body.createdBy ?? "system",
        reviewedAt: "now"
      });
    } else {
      results.push(ocrResult);
    }
  }
  for (const attachmentId of reviewedByAttachmentId.keys()) {
    if (!attachmentIds.includes(attachmentId)) {
      throw new Error("reviewedOcrResults can only reference uploaded attachmentIds.");
    }
  }
  return results;
}

async function createOcrPreview(state, body, actorId) {
  if (body.dryRun !== true) {
    throw new Error("OCR preview must use dryRun true.");
  }
  if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
    throw new Error("accountSetId is required.");
  }
  const results = await buildOcrResultsForDraft(state, body);
  return {
    id: `ocr-preview:${randomUUID()}`,
    accountSetId: body.accountSetId,
    dryRun: true,
    attachmentIds: Array.isArray(body.attachmentIds) ? [...new Set(body.attachmentIds)] : [],
    results,
    requestedBy: body.requestedBy ?? actorId,
    createdAt: "now"
  };
}

async function createAgentDraftCandidate(state, body, actorId) {
  if (body.dryRun !== true) {
    throw new Error("Agent draft candidates must use dryRun true.");
  }
  if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
    throw new Error("accountSetId is required.");
  }
  if (!SUPPORTED_AGENT_DRAFT_TYPES.has(body.draftType)) {
    throw new Error("draftType is not supported.");
  }
  if (typeof body.userInstruction !== "string" || body.userInstruction.trim() === "") {
    throw new Error("userInstruction is required.");
  }

  const ocrResults = await buildOcrResultsForDraft(state, body);
  const attachmentIds = Array.isArray(body.attachmentIds) ? [...new Set(body.attachmentIds)] : [];
  const evidenceRefs = [...new Set([...(Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []), ...attachmentIds])];
  const sourceContext = await resolveAgentDraftSourceContext(state, body);
  let llmDraftRun;
  let draftPayload;
  let unmatchedItems;
  try {
    ({ llmDraftRun, draftPayload, unmatchedItems } = await runLlmDraftAdapter(state, { ...body, sourceContext, ocrResults, evidenceRefs }));
  } catch (error) {
    const failedRun = createFailedLlmDraftRun(state, { ...body, sourceContext, evidenceRefs }, ocrResults, error);
    state.llmDraftRuns.set(failedRun.id, failedRun);
    throw error;
  }
  state.llmDraftRuns.set(llmDraftRun.id, llmDraftRun);
  const candidate = {
    id: `agent-draft-candidate:${randomUUID()}`,
    accountSetId: body.accountSetId,
    fiscalPeriodId: body.fiscalPeriodId ?? null,
    draftType: body.draftType,
    sourceObjectType: body.sourceObjectType ?? null,
    sourceObjectId: body.sourceObjectId ?? null,
    userInstruction: body.userInstruction,
    status: "candidate",
    dryRun: true,
    riskLevel: "medium",
    requiresHumanConfirmation: true,
    sourceContext,
    matchedMasterData: [],
    unmatchedItems,
    draftPayload,
    ocrResults,
    dryRunResult: {
      status: unmatchedItems.length > 0 ? "review_required" : "ready_for_confirmation",
      warnings: unmatchedItems.map((item) => item.reason)
    },
    warnings: unmatchedItems.length > 0 ? ["候选草稿存在未匹配主数据，需人工确认。"] : [],
    confidence: unmatchedItems.length > 0 ? 0.68 : 0.82,
    evidenceRefs,
    llmDraftRun,
    createdBy: actorId,
    createdAt: "now"
  };
  state.agentDraftCandidates.set(candidate.id, candidate);
  return candidate;
}

function summarizeAgentDraftCandidate(candidate) {
  return {
    id: candidate.id,
    accountSetId: candidate.accountSetId,
    draftType: candidate.draftType,
    status: candidate.status,
    riskLevel: candidate.riskLevel,
    requiresHumanConfirmation: candidate.requiresHumanConfirmation,
    confidence: candidate.confidence,
    sourceObjectType: candidate.sourceObjectType,
    sourceObjectId: candidate.sourceObjectId,
    userInstruction: candidate.userInstruction,
    dryRunStatus: candidate.dryRunResult?.status ?? null,
    unmatchedCount: candidate.unmatchedItems?.length ?? 0,
    warningCount: candidate.warnings?.length ?? 0,
    evidenceCount: candidate.evidenceRefs?.length ?? 0,
    convertedObjectType: candidate.convertedObjectType ?? null,
    convertedObjectId: candidate.convertedObjectId ?? null,
    reviewedBy: candidate.reviewedBy ?? null,
    reviewedAt: candidate.reviewedAt ?? null,
    rejectedBy: candidate.rejectedBy ?? null,
    rejectedAt: candidate.rejectedAt ?? null,
    rejectionReason: candidate.rejectionReason ?? null,
    createdBy: candidate.createdBy,
    createdAt: candidate.createdAt
  };
}

function listAgentDraftCandidateQueue(state, { accountSetId, status = null, draftType = null } = {}) {
  return [...state.agentDraftCandidates.values()]
    .filter((candidate) => {
      if (accountSetId && candidate.accountSetId !== accountSetId) return false;
      if (status && candidate.status !== status) return false;
      if (draftType && candidate.draftType !== draftType) return false;
      return true;
    })
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || right.id.localeCompare(left.id))
    .map(summarizeAgentDraftCandidate);
}

async function persistAgentDraftCandidateForRoute(state, candidate) {
  const platformStore = state.config.platformStore;
  let savedCandidate = candidate;
  if (candidate.llmDraftRun && platformStore?.createLlmDraftRun) {
    const savedRun = await platformStore.createLlmDraftRun(candidate.llmDraftRun);
    state.llmDraftRuns.set(savedRun.id, savedRun);
    savedCandidate = { ...candidate, llmDraftRun: savedRun };
  }
  if (platformStore?.createAgentDraftCandidate) {
    savedCandidate = await platformStore.createAgentDraftCandidate(savedCandidate);
    state.agentDraftCandidates.set(savedCandidate.id, savedCandidate);
  }
  return savedCandidate;
}

function rejectAgentDraftCandidate(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be rejected.");
  }
  const rejectedBy = typeof body.rejectedBy === "string" && body.rejectedBy.trim() !== "" ? body.rejectedBy : actorId;
  if (typeof rejectedBy !== "string" || rejectedBy.trim() === "") {
    throw new Error("rejectedBy is required.");
  }
  if (typeof body.rejectionReason !== "string" || body.rejectionReason.trim() === "") {
    throw new Error("rejectionReason is required.");
  }
  const rejectedCandidate = {
    ...candidate,
    status: "rejected",
    rejectedBy,
    rejectedAt: "now",
    rejectionReason: body.rejectionReason
  };
  state.agentDraftCandidates.set(candidate.id, rejectedCandidate);
  appendAuditLog(state, {
    actorId: rejectedBy,
    action: "agent.draft_candidate.reject",
    objectType: "agent_draft_candidate",
    objectId: candidate.id
  });
  return rejectedCandidate;
}

function summarizeLlmDraftRun(run) {
  return {
    id: run.id,
    accountSetId: run.accountSetId ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    draftType: run.inputSummary?.draftType ?? null,
    sourceObjectType: run.inputSummary?.sourceObjectType ?? null,
    sourceObjectId: run.inputSummary?.sourceObjectId ?? null,
    evidenceCount: run.inputSummary?.evidenceRefs?.length ?? 0,
    outputSchema: run.outputSchema,
    errorMessage: run.errorMessage ?? null,
    createdAt: run.createdAt
  };
}

function listLlmDraftRuns(state, { accountSetId = null, status = null, draftType = null } = {}) {
  return [...state.llmDraftRuns.values()]
    .filter((run) => {
      if (accountSetId && run.accountSetId !== accountSetId) return false;
      if (status && run.status !== status) return false;
      if (draftType && run.inputSummary?.draftType !== draftType) return false;
      return true;
    })
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || right.id.localeCompare(left.id))
    .map(summarizeLlmDraftRun);
}

function roundedRate(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(2));
}

function buildLlmDraftMetrics(runs, candidates, { accountSetId = null, draftType = null } = {}) {
  const runIds = new Set(runs.map((run) => run.id));
  const candidateItems = candidates.filter((candidate) => {
    if (accountSetId && candidate.accountSetId !== accountSetId) return false;
    if (draftType && candidate.draftType !== draftType) return false;
    return runIds.has(candidate.llmDraftRun?.id);
  });
  const completedRuns = runs.filter((run) => run.status === "completed").length;
  const failedRuns = runs.filter((run) => run.status === "failed").length;
  const convertedCandidates = candidateItems.filter((candidate) => candidate.status === "converted").length;
  const rejectedCandidates = candidateItems.filter((candidate) => candidate.status === "rejected").length;
  const pendingCandidates = candidateItems.filter((candidate) => candidate.status === "candidate").length;
  const correctedCandidates = candidateItems.filter((candidate) => (candidate.resolvedUnmatchedItems?.length ?? 0) > 0).length;
  const providerGroups = new Map();

  for (const run of runs) {
    const key = `${run.provider}\u0000${run.model}`;
    const existing = providerGroups.get(key) ?? {
      provider: run.provider,
      model: run.model,
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      schemaSuccessRate: 0
    };
    existing.totalRuns += 1;
    if (run.status === "completed") existing.completedRuns += 1;
    if (run.status === "failed") existing.failedRuns += 1;
    existing.schemaSuccessRate = roundedRate(existing.completedRuns, existing.totalRuns);
    providerGroups.set(key, existing);
  }

  return {
    accountSetId: accountSetId ?? null,
    draftType: draftType ?? null,
    totalRuns: runs.length,
    completedRuns,
    failedRuns,
    schemaSuccessRate: roundedRate(completedRuns, runs.length),
    candidateCount: candidateItems.length,
    convertedCandidates,
    rejectedCandidates,
    pendingCandidates,
    adoptionRate: roundedRate(convertedCandidates, candidateItems.length),
    rejectionRate: roundedRate(rejectedCandidates, candidateItems.length),
    humanCorrectionRate: roundedRate(correctedCandidates, candidateItems.length),
    providerBreakdown: [...providerGroups.values()].sort(
      (left, right) => right.totalRuns - left.totalRuns || `${left.provider}/${left.model}`.localeCompare(`${right.provider}/${right.model}`)
    )
  };
}

async function createLlmDraftRun(state, body) {
  if (body.dryRun !== true) {
    throw new Error("LLM draft runs must use dryRun true.");
  }
  if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
    throw new Error("accountSetId is required.");
  }
  if (!SUPPORTED_AGENT_DRAFT_TYPES.has(body.draftType)) {
    throw new Error("draftType is not supported.");
  }
  if (typeof body.userInstruction !== "string" || body.userInstruction.trim() === "") {
    throw new Error("userInstruction is required.");
  }

  const ocrResults = await buildOcrResultsForDraft(state, body);
  let llmDraftRun;
  try {
    ({ llmDraftRun } = await runLlmDraftAdapter(state, { ...body, ocrResults }));
  } catch (error) {
    llmDraftRun = createFailedLlmDraftRun(state, body, ocrResults, error);
  }
  state.llmDraftRuns.set(llmDraftRun.id, llmDraftRun);
  return llmDraftRun;
}

function decodedPathId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function attachmentIdsForDraftCandidate(candidate) {
  return [
    ...new Set(
      (candidate.ocrResults ?? [])
        .map((result) => result.attachmentId)
        .filter((attachmentId) => typeof attachmentId === "string" && attachmentId.trim() !== "")
    )
  ];
}

function assertDraftCandidateAttachmentsAvailable(state, candidate) {
  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const attachment = state.attachments.get(attachmentId);
    if (!attachment || attachment.status !== "available" || attachment.accountSetId !== candidate.accountSetId) {
      throw new Error("Agent draft candidate attachments must still belong to the account set and be available before conversion.");
    }
  }
}

function assertAgentDraftUnmatchedItemsResolved(candidate, body) {
  const unmatchedItems = Array.isArray(candidate.unmatchedItems) ? candidate.unmatchedItems : [];
  if (unmatchedItems.length === 0) {
    return [];
  }
  if (!Array.isArray(body.resolvedUnmatchedItems)) {
    const error = new Error("Agent draft candidate has unmatchedItems; resolvedUnmatchedItems is required before conversion.");
    error.code = "AGENT_DRAFT_UNMATCHED_ITEMS_UNRESOLVED";
    throw error;
  }
  const normalized = body.resolvedUnmatchedItems.map((item) => ({
    field: typeof item?.field === "string" ? item.field : "",
    resolution: typeof item?.resolution === "string" ? item.resolution : "",
    resolvedValue: Object.prototype.hasOwnProperty.call(item ?? {}, "resolvedValue") ? item.resolvedValue : null,
    reviewedBy: body.reviewedBy ?? null,
    reviewedAt: "now"
  }));
  const resolvedByField = new Map(normalized.map((item) => [item.field, item]));
  const missing = unmatchedItems.filter((item) => !resolvedByField.has(item.field));
  const invalid = normalized.filter((item) => item.field.trim() === "" || item.resolution.trim() === "" || item.resolvedValue == null);
  if (missing.length > 0 || invalid.length > 0) {
    const error = new Error("All unmatchedItems must include field, resolution, and resolvedValue before conversion.");
    error.code = "AGENT_DRAFT_UNMATCHED_ITEMS_UNRESOLVED";
    throw error;
  }
  return normalized;
}

async function convertAgentDraftCandidateToVoucher(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "voucher") {
    throw new Error("Only voucher Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "voucher") {
    throw new Error("reviewedDraftPayload.documentType must be voucher.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const attachmentIds = attachmentIdsForDraftCandidate(candidate);
  const voucherInput = {
    ...body.reviewedDraftPayload,
    accountSetId: candidate.accountSetId,
    createdBy: body.reviewedBy,
    sourceType: "agent_draft",
    aiDraftId: null,
    attachmentCount: attachmentIds.length
  };
  const periodError = await voucherPeriodMutationError(state, voucherInput, "converting Agent draft candidates");
  if (periodError) {
    return { error: periodError };
  }

  const voucher = createVoucher({
    ...voucherInput,
    id: uniqueVoucherId(),
    voucherNo: voucherInput.voucherNo ?? (await generateVoucherNo(state, voucherInput))
  });
  voucher.agentDraftCandidateId = candidate.id;
  voucher.sourceObjectType = candidate.sourceObjectType ?? null;
  voucher.sourceObjectId = candidate.sourceObjectId ?? null;

  const savedVoucher = state.config.platformStore?.createVoucher ? await state.config.platformStore.createVoucher(voucher) : voucher;
  state.vouchers.set(savedVoucher.id, savedVoucher);
  for (const attachmentId of attachmentIds) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "voucher",
      objectId: savedVoucher.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "voucher",
      objectId: savedVoucher.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "voucher",
    convertedObjectId: savedVoucher.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendVoucherStatusLog(state, {
    voucherId: savedVoucher.id,
    action: "create",
    fromStatus: null,
    toStatus: "draft",
    actorId: body.reviewedBy,
    reason: `Converted from ${candidate.id}`
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "voucher",
    objectId: savedVoucher.id
  });
  return { voucher: savedVoucher };
}

async function convertAgentDraftCandidateToPurchaseOrder(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "purchase_order") {
    throw new Error("Only purchase order Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "purchase_order") {
    throw new Error("reviewedDraftPayload.documentType must be purchase_order.");
  }
  if (typeof body.reviewedDraftPayload.orderDate !== "string" || body.reviewedDraftPayload.orderDate.trim() === "") {
    throw new Error("reviewedDraftPayload.orderDate is required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const supplier = await findPartnerByIdentifier(state, body.reviewedDraftPayload.supplierId);
  if (!supplier || supplier.accountSetId !== candidate.accountSetId || !["supplier", "both"].includes(supplier.partnerType)) {
    throw new Error("Purchase order supplier must be an enabled supplier partner in the same account set.");
  }
  if (supplier.isEnabled === false) {
    throw new Error("Purchase order supplier must be enabled.");
  }

  const lines = normalizeOrderLines(body.reviewedDraftPayload.lines);
  const existingOrders = await listPurchaseOrders(state, candidate.accountSetId);
  const orderId = body.reviewedDraftPayload.id ?? `purchase-order:${randomUUID()}`;
  const order = {
    id: orderId,
    accountSetId: candidate.accountSetId,
    supplierId: supplier.id,
    supplierName: supplier.name,
    orderNo: body.reviewedDraftPayload.orderNo ?? nextBusinessOrderNo("PO", candidate.accountSetId, body.reviewedDraftPayload.orderDate, existingOrders),
    orderDate: body.reviewedDraftPayload.orderDate,
    totalAmount: Number(lines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2)),
    status: "draft",
    currency: body.reviewedDraftPayload.currency ?? "CNY",
    exchangeRate: body.reviewedDraftPayload.exchangeRate ?? 1,
    createdBy: body.reviewedBy,
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    lines: lines.map((line) => ({ ...line, id: `purchase-order-line:${orderId}:${line.lineNo}` }))
  };

  const savedOrder = state.config.platformStore?.createPurchaseOrder ? await state.config.platformStore.createPurchaseOrder(order) : order;
  state.purchaseOrders.set(savedOrder.id, savedOrder);
  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "purchase_order",
      objectId: savedOrder.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "purchase_order",
      objectId: savedOrder.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "purchase_order",
    convertedObjectId: savedOrder.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "purchase_order.create",
    objectType: "purchase_order",
    objectId: savedOrder.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "purchase_order",
    objectId: savedOrder.id
  });
  return { purchaseOrder: savedOrder };
}

async function convertAgentDraftCandidateToSalesOrder(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "sales_order") {
    throw new Error("Only sales order Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "sales_order") {
    throw new Error("reviewedDraftPayload.documentType must be sales_order.");
  }
  if (typeof body.reviewedDraftPayload.orderDate !== "string" || body.reviewedDraftPayload.orderDate.trim() === "") {
    throw new Error("reviewedDraftPayload.orderDate is required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const customer = await findPartnerByIdentifier(state, body.reviewedDraftPayload.customerId);
  if (!customer || customer.accountSetId !== candidate.accountSetId || !["customer", "both"].includes(customer.partnerType)) {
    throw new Error("Sales order customer must be an enabled customer partner in the same account set.");
  }
  if (customer.isEnabled === false) {
    throw new Error("Sales order customer must be enabled.");
  }

  const lines = normalizeOrderLines(body.reviewedDraftPayload.lines);
  const existingOrders = await listSalesOrders(state, candidate.accountSetId);
  const orderId = body.reviewedDraftPayload.id ?? `sales-order:${randomUUID()}`;
  const totalAmount = Number(lines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2));
  if (Number(customer.creditLimit ?? 0) > 0) {
    const exposure = (await listCreditExposures(state, candidate.accountSetId)).find((item) => item.customerId === customer.id);
    if (exposure && exposure.occupiedAmount + totalAmount > exposure.creditLimit) {
      const error = new Error("Sales order exceeds customer available credit.");
      error.code = "CREDIT_LIMIT_EXCEEDED";
      throw error;
    }
  }

  const order = {
    id: orderId,
    accountSetId: candidate.accountSetId,
    customerId: customer.id,
    customerName: customer.name,
    orderNo: body.reviewedDraftPayload.orderNo ?? nextBusinessOrderNo("SO", candidate.accountSetId, body.reviewedDraftPayload.orderDate, existingOrders),
    orderDate: body.reviewedDraftPayload.orderDate,
    totalAmount,
    status: "draft",
    currency: body.reviewedDraftPayload.currency ?? "CNY",
    exchangeRate: body.reviewedDraftPayload.exchangeRate ?? 1,
    createdBy: body.reviewedBy,
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    lines: lines.map((line) => ({ ...line, id: `sales-order-line:${orderId}:${line.lineNo}` }))
  };

  const savedOrder = state.config.platformStore?.createSalesOrder ? await state.config.platformStore.createSalesOrder(order) : order;
  state.salesOrders.set(savedOrder.id, savedOrder);
  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "sales_order",
      objectId: savedOrder.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "sales_order",
      objectId: savedOrder.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "sales_order",
    convertedObjectId: savedOrder.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "sales_order.create",
    objectType: "sales_order",
    objectId: savedOrder.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "sales_order",
    objectId: savedOrder.id
  });
  return { salesOrder: savedOrder };
}

function convertAgentDraftCandidateToInventoryMovementDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "inventory_movement") {
    throw new Error("Only inventory movement Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "inventory_movement") {
    throw new Error("reviewedDraftPayload.documentType must be inventory_movement.");
  }
  if (!["inbound", "outbound", "adjustment"].includes(body.reviewedDraftPayload.movementType)) {
    throw new Error("movementType must be inbound, outbound, or adjustment.");
  }
  if (!Array.isArray(body.reviewedDraftPayload.lines) || body.reviewedDraftPayload.lines.length === 0) {
    throw new Error("Inventory movement draft lines are required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const movementType = body.reviewedDraftPayload.movementType;
  const draftId = body.reviewedDraftPayload.id ?? `inventory-movement-draft:${randomUUID()}`;
  const lines = body.reviewedDraftPayload.lines.map((line, index) => {
    const item = findInventoryItemByIdentifier(state, line.itemId);
    const warehouse = findWarehouseByIdentifier(state, line.warehouseId);
    if (!item || item.accountSetId !== candidate.accountSetId || !warehouse || warehouse.accountSetId !== candidate.accountSetId) {
      throw new Error("Inventory movement draft item or warehouse was not found.");
    }
    const location = line.locationId ? findWarehouseLocation(warehouse, line.locationId) : null;
    if (line.locationId && !location) {
      throw new Error("Inventory movement draft warehouse location was not found.");
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Inventory movement draft quantity must be greater than 0.");
    }
    const unitCost = Number(line.unitCost ?? 0);
    const amount = Number(line.amount ?? (movementType === "inbound" || movementType === "adjustment" ? quantity * unitCost : 0));
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(amount) || amount < 0) {
      throw new Error("Inventory movement draft cost fields must be non-negative.");
    }
    return {
      id: line.id ?? `inventory-movement-draft-line:${randomUUID()}`,
      movementDraftId: draftId,
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      locationId: location?.id ?? null,
      locationCode: location?.code ?? null,
      batchNo: line.batchNo ?? null,
      lineNo: line.lineNo ?? index + 1,
      quantity: roundQuantity(quantity),
      unitCost: roundAmount(unitCost),
      amount: roundAmount(amount),
      dryRunWarnings: []
    };
  });

  const draft = {
    id: draftId,
    accountSetId: candidate.accountSetId,
    documentNo: body.reviewedDraftPayload.documentNo ?? `IMD-${state.inventoryMovementDrafts.size + 1}`,
    movementType,
    businessType: body.reviewedDraftPayload.businessType ?? movementType,
    sourceType: "agent_draft",
    sourceDocumentId: null,
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    fiscalYear: Number(body.reviewedDraftPayload.fiscalYear ?? candidate.fiscalYear ?? 0),
    periodNo: Number(body.reviewedDraftPayload.periodNo ?? candidate.periodNo ?? 0),
    movementDate: body.reviewedDraftPayload.movementDate ?? "now",
    status: "draft",
    costStatus: "not_calculated",
    totalQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.quantity, 0)),
    totalAmount: roundAmount(lines.reduce((sum, line) => sum + line.amount, 0)),
    createdBy: body.reviewedBy,
    createdAt: "now",
    reviewedDraftPayload: body.reviewedDraftPayload,
    lines
  };
  state.inventoryMovementDrafts.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "inventory_movement_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "inventory_movement_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "inventory_movement_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "inventory_movement_draft",
    objectId: draft.id
  });
  return { inventoryMovementDraft: draft };
}

function convertAgentDraftCandidateToMaterialRequisitionDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "material_requisition") {
    throw new Error("Only material requisition Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object" || Array.isArray(body.reviewedDraftPayload)) {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "material_requisition") {
    throw new Error("reviewedDraftPayload.documentType must be material_requisition.");
  }
  if (!Array.isArray(body.reviewedDraftPayload.lines) || body.reviewedDraftPayload.lines.length === 0) {
    throw new Error("Material requisition draft lines are required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const workOrder = findWorkOrderByIdentifier(state, body.reviewedDraftPayload.workOrderId);
  if (!workOrder || workOrder.accountSetId !== candidate.accountSetId) {
    throw new Error("Work order was not found.");
  }
  if (workOrder.status === "closed") {
    throw new Error("Closed work orders cannot receive new material requisition drafts.");
  }
  const requisitionId = body.reviewedDraftPayload.id ?? `material-requisition-draft:${randomUUID()}`;
  const lines = body.reviewedDraftPayload.lines.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new Error("Material requisition draft lines must be objects.");
    }
    const item = findInventoryItemByIdentifier(state, line.componentItemId);
    const warehouse = findWarehouseByIdentifier(state, line.warehouseId);
    if (!item || item.accountSetId !== candidate.accountSetId || !warehouse || warehouse.accountSetId !== candidate.accountSetId) {
      throw new Error("Material requisition draft component item or warehouse was not found.");
    }
    const location = line.locationId ? findWarehouseLocation(warehouse, line.locationId) : null;
    if (line.locationId && !location) {
      throw new Error("Material requisition draft warehouse location was not found.");
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Material requisition draft quantity must be greater than 0.");
    }
    return {
      id: line.id ?? `material-requisition-draft-line:${randomUUID()}`,
      materialRequisitionId: requisitionId,
      componentItemId: item.id,
      componentItemCode: item.code,
      componentItemName: item.name,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      locationId: location?.id ?? null,
      batchNo: line.batchNo ?? null,
      lineNo: line.lineNo ?? index + 1,
      quantity: roundQuantity(quantity),
      unitCost: null,
      amount: null
    };
  });
  const draft = {
    id: requisitionId,
    accountSetId: candidate.accountSetId,
    requisitionNo: body.reviewedDraftPayload.requisitionNo ?? `MRD-${state.materialRequisitions.size + 1}`,
    workOrderId: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    sourceMovementId: null,
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    fiscalYear: Number(body.reviewedDraftPayload.fiscalYear ?? candidate.fiscalYear ?? 0),
    periodNo: Number(body.reviewedDraftPayload.periodNo ?? candidate.periodNo ?? 0),
    status: "draft",
    totalQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.quantity, 0)),
    totalAmount: 0,
    createdBy: body.reviewedBy,
    createdAt: "now",
    reviewedDraftPayload: body.reviewedDraftPayload,
    lines
  };
  state.materialRequisitions.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "material_requisition_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "material_requisition_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "material_requisition_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "material_requisition_draft.create",
    objectType: "material_requisition_draft",
    objectId: draft.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "material_requisition_draft",
    objectId: draft.id
  });
  return { materialRequisitionDraft: draft };
}

function convertAgentDraftCandidateToProductReceiptDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "product_receipt") {
    throw new Error("Only product receipt Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object" || Array.isArray(body.reviewedDraftPayload)) {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "product_receipt") {
    throw new Error("reviewedDraftPayload.documentType must be product_receipt.");
  }
  if (!Array.isArray(body.reviewedDraftPayload.lines) || body.reviewedDraftPayload.lines.length === 0) {
    throw new Error("Product receipt draft lines are required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const workOrder = findWorkOrderByIdentifier(state, body.reviewedDraftPayload.workOrderId);
  if (!workOrder || workOrder.accountSetId !== candidate.accountSetId) {
    throw new Error("Work order was not found.");
  }
  if (workOrder.status === "closed") {
    throw new Error("Closed work orders cannot receive new product receipt drafts.");
  }
  const receiptId = body.reviewedDraftPayload.id ?? `product-receipt-draft:${randomUUID()}`;
  const lines = body.reviewedDraftPayload.lines.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new Error("Product receipt draft lines must be objects.");
    }
    const item = findInventoryItemByIdentifier(state, line.productItemId);
    const warehouse = findWarehouseByIdentifier(state, line.warehouseId);
    if (!item || item.accountSetId !== candidate.accountSetId || !warehouse || warehouse.accountSetId !== candidate.accountSetId) {
      throw new Error("Product receipt draft finished good item or warehouse was not found.");
    }
    if (item.id !== workOrder.productItemId) {
      throw new Error("Product receipt draft finished good item must match the work order product.");
    }
    const location = line.locationId ? findWarehouseLocation(warehouse, line.locationId) : null;
    if (line.locationId && !location) {
      throw new Error("Product receipt draft warehouse location was not found.");
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Product receipt draft quantity must be greater than 0.");
    }
    return {
      id: line.id ?? `product-receipt-draft-line:${randomUUID()}`,
      productReceiptId: receiptId,
      productItemId: item.id,
      productItemCode: item.code,
      productItemName: item.name,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      locationId: location?.id ?? null,
      batchNo: line.batchNo ?? null,
      lineNo: line.lineNo ?? index + 1,
      quantity: roundQuantity(quantity),
      unitCost: null,
      amount: null
    };
  });
  const draft = {
    id: receiptId,
    accountSetId: candidate.accountSetId,
    receiptNo: body.reviewedDraftPayload.receiptNo ?? `PRD-${state.productReceipts.size + 1}`,
    workOrderId: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    sourceMovementId: null,
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    fiscalYear: Number(body.reviewedDraftPayload.fiscalYear ?? candidate.fiscalYear ?? 0),
    periodNo: Number(body.reviewedDraftPayload.periodNo ?? candidate.periodNo ?? 0),
    status: "draft",
    costStatus: "draft_pending_cost",
    totalQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.quantity, 0)),
    totalAmount: 0,
    createdBy: body.reviewedBy,
    createdAt: "now",
    reviewedDraftPayload: body.reviewedDraftPayload,
    lines
  };
  state.productReceipts.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "product_receipt_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "product_receipt_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "product_receipt_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "product_receipt_draft.create",
    objectType: "product_receipt_draft",
    objectId: draft.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "product_receipt_draft",
    objectId: draft.id
  });
  return { productReceiptDraft: draft };
}

function convertAgentDraftCandidateToStockCountPreview(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "stock_count") {
    throw new Error("Only stock count Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "stock_count") {
    throw new Error("reviewedDraftPayload.documentType must be stock_count.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const preview = previewStockCount(
    state,
    {
      ...body.reviewedDraftPayload,
      accountSetId: candidate.accountSetId,
      createdBy: body.reviewedBy
    },
    actorId
  );
  const stockCountPreview = {
    ...preview,
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.stockCounts.set(stockCountPreview.id, stockCountPreview);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "stock_count",
      objectId: stockCountPreview.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "stock_count",
      objectId: stockCountPreview.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "stock_count",
    convertedObjectId: stockCountPreview.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "stock_count.preview",
    objectType: "stock_count",
    objectId: stockCountPreview.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "stock_count",
    objectId: stockCountPreview.id
  });
  return { stockCountPreview };
}

function convertAgentDraftCandidateToMasterDataDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "master_data") {
    throw new Error("Only master data Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "master_data") {
    throw new Error("reviewedDraftPayload.documentType must be master_data.");
  }
  if (typeof body.reviewedDraftPayload.masterDataType !== "string" || body.reviewedDraftPayload.masterDataType.trim() === "") {
    throw new Error("reviewedDraftPayload.masterDataType is required.");
  }
  if (typeof body.reviewedDraftPayload.name !== "string" || body.reviewedDraftPayload.name.trim() === "") {
    throw new Error("reviewedDraftPayload.name is required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const draft = {
    id: body.reviewedDraftPayload.id ?? `agent-master-data-draft:${randomUUID()}`,
    accountSetId: candidate.accountSetId,
    masterDataType: body.reviewedDraftPayload.masterDataType,
    code: body.reviewedDraftPayload.code ?? null,
    name: body.reviewedDraftPayload.name,
    status: "draft",
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    fields: body.reviewedDraftPayload.fields && typeof body.reviewedDraftPayload.fields === "object" ? body.reviewedDraftPayload.fields : {},
    reviewedDraftPayload: body.reviewedDraftPayload,
    createdBy: body.reviewedBy,
    createdAt: "now"
  };
  state.agentMasterDataDrafts.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "master_data_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "master_data_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "master_data_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "master_data_draft.create",
    objectType: "master_data_draft",
    objectId: draft.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "master_data_draft",
    objectId: draft.id
  });
  return { masterDataDraft: draft };
}

function convertAgentDraftCandidateToPayrollAllocationDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "payroll_allocation") {
    throw new Error("Only payroll allocation Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "payroll_allocation") {
    throw new Error("reviewedDraftPayload.documentType must be payroll_allocation.");
  }
  if (!Array.isArray(body.reviewedDraftPayload.rules) || body.reviewedDraftPayload.rules.length === 0) {
    throw new Error("Payroll allocation draft rules are required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const draftId = body.reviewedDraftPayload.id ?? `agent-payroll-allocation-draft:${randomUUID()}`;
  const rules = body.reviewedDraftPayload.rules.map((rule, index) => {
    const amount = roundAmount(Number(rule.amount ?? 0));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Payroll allocation draft rule amount must be non-negative.");
    }
    return {
      id: rule.id ?? `agent-payroll-allocation-draft-rule:${randomUUID()}`,
      payrollAllocationDraftId: draftId,
      lineNo: rule.lineNo ?? index + 1,
      departmentId: rule.departmentId ?? null,
      targetType: rule.targetType ?? "department",
      workOrderId: rule.workOrderId ?? null,
      costType: rule.costType ?? "direct_labor",
      allocationRate: Number(rule.allocationRate ?? 0),
      amount
    };
  });
  const draft = {
    id: draftId,
    accountSetId: candidate.accountSetId,
    documentType: "payroll_allocation",
    payrollRunId: body.reviewedDraftPayload.payrollRunId ?? null,
    runNo: body.reviewedDraftPayload.runNo ?? body.reviewedDraftPayload.payrollRunId ?? null,
    fiscalYear: Number(body.reviewedDraftPayload.fiscalYear ?? candidate.fiscalYear ?? 0),
    periodNo: Number(body.reviewedDraftPayload.periodNo ?? candidate.periodNo ?? 0),
    status: "draft",
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    totalAllocatedAmount: roundAmount(rules.reduce((sum, rule) => sum + rule.amount, 0)),
    approvalRequired: true,
    rules,
    reviewedDraftPayload: body.reviewedDraftPayload,
    createdBy: body.reviewedBy,
    createdAt: "now"
  };
  state.agentPayrollAllocationDrafts.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "payroll_allocation_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "payroll_allocation_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "payroll_allocation_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "payroll_allocation_draft.create",
    objectType: "payroll_allocation_draft",
    objectId: draft.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "payroll_allocation_draft",
    objectId: draft.id
  });
  return { payrollAllocationDraft: draft };
}

function convertAgentDraftCandidateToDepreciationRunDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "depreciation_run") {
    throw new Error("Only depreciation-run Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "depreciation_run") {
    throw new Error("reviewedDraftPayload.documentType must be depreciation_run.");
  }
  if (body.reviewedDraftPayload.dryRun !== true) {
    throw new Error("Agent depreciation run drafts must remain dryRun true.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const fiscalYear = Number(body.reviewedDraftPayload.fiscalYear ?? candidate.fiscalYear);
  const periodNo = Number(body.reviewedDraftPayload.periodNo ?? candidate.periodNo);
  if (!Number.isInteger(fiscalYear) || !Number.isInteger(periodNo) || periodNo < 1 || periodNo > 12) {
    throw new Error("Depreciation dry-run fiscalYear and periodNo are required.");
  }
  const draftId = body.reviewedDraftPayload.id ?? `agent-depreciation-run-draft:${randomUUID()}`;
  const lines = calculateDepreciationRunLines(state, {
    accountSetId: candidate.accountSetId,
    fiscalYear,
    periodNo,
    runId: draftId
  });
  const totalDepreciationAmount = roundAmount(lines.reduce((sum, line) => sum + line.depreciationAmount, 0));
  const draft = {
    id: draftId,
    accountSetId: candidate.accountSetId,
    documentType: "depreciation_run",
    runNo: body.reviewedDraftPayload.runNo ?? candidate.draftPayload?.runNo ?? `AGENT-DEP-${fiscalYear}${String(periodNo).padStart(2, "0")}`,
    fiscalYear,
    periodNo,
    dryRun: true,
    status: "draft",
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    totalDepreciationAmount,
    lineCount: lines.length,
    warningCodes: depreciationRunWarnings(lines),
    lines,
    reviewedDraftPayload: body.reviewedDraftPayload,
    createdBy: body.reviewedBy,
    createdAt: "now"
  };
  state.agentDepreciationRunDrafts.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "depreciation_run_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "depreciation_run_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "depreciation_run_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "depreciation_run_draft.create",
    objectType: "depreciation_run_draft",
    objectId: draft.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "depreciation_run_draft",
    objectId: draft.id
  });
  return { depreciationRunDraft: draft };
}

function convertAgentDraftCandidateToAssetChangeDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "asset_change") {
    throw new Error("Only asset change Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "asset_change") {
    throw new Error("reviewedDraftPayload.documentType must be asset_change.");
  }
  if (typeof body.reviewedDraftPayload.changeKind !== "string" || body.reviewedDraftPayload.changeKind.trim() === "") {
    throw new Error("reviewedDraftPayload.changeKind is required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const asset = body.reviewedDraftPayload.fixedAssetId ? findFixedAssetByIdentifier(state, body.reviewedDraftPayload.fixedAssetId) : null;
  if (body.reviewedDraftPayload.fixedAssetId && (!asset || asset.accountSetId !== candidate.accountSetId)) {
    throw new Error("Fixed asset for Agent asset change draft was not found.");
  }
  const amount = body.reviewedDraftPayload.amount == null ? null : roundAmount(Number(body.reviewedDraftPayload.amount));
  if (amount != null && !Number.isFinite(amount)) {
    throw new Error("Asset change draft amount must be numeric.");
  }
  const draft = {
    id: body.reviewedDraftPayload.id ?? `agent-asset-change-draft:${randomUUID()}`,
    accountSetId: candidate.accountSetId,
    documentType: "asset_change",
    changeKind: body.reviewedDraftPayload.changeKind,
    fixedAssetId: asset?.id ?? body.reviewedDraftPayload.fixedAssetId ?? null,
    assetNo: asset?.assetNo ?? body.reviewedDraftPayload.assetNo ?? null,
    assetName: asset?.name ?? body.reviewedDraftPayload.assetName ?? null,
    changeDate: body.reviewedDraftPayload.changeDate ?? "now",
    fromDepartmentId: body.reviewedDraftPayload.fromDepartmentId ?? asset?.currentDepartmentId ?? null,
    toDepartmentId: body.reviewedDraftPayload.toDepartmentId ?? null,
    toDepartmentName: body.reviewedDraftPayload.toDepartmentName ?? null,
    amount,
    reason: body.reviewedDraftPayload.reason ?? null,
    status: "draft",
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    reviewedDraftPayload: body.reviewedDraftPayload,
    createdBy: body.reviewedBy,
    createdAt: "now"
  };
  state.agentAssetChangeDrafts.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "asset_change_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "asset_change_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "asset_change_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "asset_change_draft.create",
    objectType: "asset_change_draft",
    objectId: draft.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "asset_change_draft",
    objectId: draft.id
  });
  return { assetChangeDraft: draft };
}

function convertAgentDraftCandidateToReportInterpretationDraft(state, candidate, body, actorId) {
  if (candidate.status !== "candidate") {
    throw new Error("Only candidate Agent drafts can be converted.");
  }
  if (candidate.draftType !== "report_interpretation") {
    throw new Error("Only report interpretation Agent draft candidates can be converted in this workflow.");
  }
  if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (!body.reviewedDraftPayload || typeof body.reviewedDraftPayload !== "object") {
    throw new Error("reviewedDraftPayload is required.");
  }
  if (body.reviewedDraftPayload.documentType !== "report_interpretation") {
    throw new Error("reviewedDraftPayload.documentType must be report_interpretation.");
  }
  if (typeof body.reviewedDraftPayload.summary !== "string" || body.reviewedDraftPayload.summary.trim() === "") {
    throw new Error("summary is required.");
  }
  if (!Array.isArray(body.reviewedDraftPayload.evidenceRefs) || body.reviewedDraftPayload.evidenceRefs.length === 0) {
    throw new Error("evidenceRefs are required.");
  }

  assertDraftCandidateAttachmentsAvailable(state, candidate);
  const reportRunId = body.reviewedDraftPayload.reportRunId ?? candidate.sourceObjectId;
  const run = findReportRunByIdentifier(state, reportRunId);
  if (!run || run.accountSetId !== candidate.accountSetId) {
    throw new Error("Report run for Agent report interpretation draft was not found.");
  }
  const validEvidenceRefs = new Set((run.cells ?? []).map((cell) => reportCellEvidenceRef(cell)));
  for (const ref of body.reviewedDraftPayload.evidenceRefs) {
    if (typeof ref !== "string" || !ref.startsWith("report_cell:")) {
      throw new Error("evidenceRefs must point to report_cell references.");
    }
    if (!validEvidenceRefs.has(ref)) {
      throw new Error("evidenceRefs must point to cells in the report run.");
    }
  }

  const draft = {
    id: body.reviewedDraftPayload.id ?? `ai-report-interpretation:${state.aiReportInterpretations.size + 1}`,
    accountSetId: run.accountSetId,
    reportRunId: run.id,
    summary: body.reviewedDraftPayload.summary,
    keyFindings: Array.isArray(body.reviewedDraftPayload.keyFindings) ? [...body.reviewedDraftPayload.keyFindings] : [],
    warnings: Array.isArray(body.reviewedDraftPayload.warnings) ? [...body.reviewedDraftPayload.warnings] : [],
    evidenceRefs: [...body.reviewedDraftPayload.evidenceRefs],
    status: "draft",
    sourceType: "agent_draft",
    agentDraftCandidateId: candidate.id,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    interpretedBy: body.reviewedBy,
    reviewedDraftPayload: body.reviewedDraftPayload,
    createdAt: "now"
  };
  state.aiReportInterpretations.set(draft.id, draft);

  for (const attachmentId of attachmentIdsForDraftCandidate(candidate)) {
    const link = {
      id: `attachment-link:${state.attachmentLinks.length + 1}`,
      attachmentId,
      objectType: "report_interpretation_draft",
      objectId: draft.id,
      linkedBy: body.reviewedBy,
      linkedAt: "now"
    };
    state.attachmentLinks.push(link);
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "attachment.link",
      objectType: "report_interpretation_draft",
      objectId: draft.id
    });
  }

  const convertedCandidate = {
    ...candidate,
    status: "converted",
    convertedObjectType: "report_interpretation_draft",
    convertedObjectId: draft.id,
    reviewedBy: body.reviewedBy,
    reviewedAt: "now",
    resolvedUnmatchedItems: body.resolvedUnmatchedItems ?? [],
    reviewedDraftPayload: body.reviewedDraftPayload
  };
  state.agentDraftCandidates.set(candidate.id, convertedCandidate);
  appendAuditLog(state, {
    actorId: body.reviewedBy,
    action: "report_interpretation_draft.create",
    objectType: "report_interpretation_draft",
    objectId: draft.id
  });
  appendAuditLog(state, {
    actorId: body.reviewedBy ?? actorId,
    action: "agent.draft_candidate.convert",
    objectType: "report_interpretation_draft",
    objectId: draft.id
  });
  return { reportInterpretationDraft: publicAiReportInterpretation(draft) };
}

function unsupportedAgentDraftConversion(draftType) {
  const error = new Error(`Agent draft conversion for ${draftType} is not supported yet without a non-mutating business draft model.`);
  error.code = "AGENT_DRAFT_CONVERSION_UNSUPPORTED";
  return error;
}

const AGENT_DRAFT_TOOL_INPUT_SCHEMA = {
  type: "object",
  required: ["accountSetId", "userInstruction"],
  properties: {
    accountSetId: { type: "string" },
    userInstruction: { type: "string" },
    sourceObjectType: { type: "string" },
    sourceObjectId: { type: "string" },
    evidenceRefs: { type: "array", items: { type: "string" } },
    attachmentIds: { type: "array", items: { type: "string" } },
    context: { type: "object", additionalProperties: true }
  }
};

const AGENT_DRAFT_TOOL_OUTPUT_SCHEMA = {
  type: "object",
  required: [
    "draftType",
    "sourceContext",
    "matchedMasterData",
    "unmatchedItems",
    "draftPayload",
    "dryRunResult",
    "warnings",
    "confidence",
    "evidenceRefs",
    "requiresHumanConfirmation"
  ],
  properties: {
    draftType: { type: "string" },
    sourceContext: { type: "object", additionalProperties: true },
    matchedMasterData: { type: "array", items: { type: "object", additionalProperties: true } },
    unmatchedItems: { type: "array", items: { type: "object", additionalProperties: true } },
    draftPayload: { type: "object", additionalProperties: true },
    dryRunResult: { type: "object", additionalProperties: true },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    evidenceRefs: { type: "array", items: { type: "string" } },
    requiresHumanConfirmation: { type: "boolean" }
  }
};

const SUPPLY_CHAIN_AGENT_TOOL_INPUT_SCHEMA = {
  type: "object",
  required: ["accountSetId", "fiscalYear", "periodNo"],
  properties: {
    accountSetId: { type: "string" },
    fiscalYear: { type: "integer" },
    periodNo: { type: "integer" },
    asOfDate: { type: "string" },
    sourceObjectType: { type: "string" },
    sourceObjectId: { type: "string" },
    evidenceRefs: { type: "array", items: { type: "string" } },
    payload: { type: "object", additionalProperties: true },
    requestedBy: { type: "string" }
  }
};

const SUPPLY_CHAIN_AGENT_TOOL_OUTPUT_SCHEMA = {
  type: "object",
  required: [
    "toolName",
    "riskLevel",
    "status",
    "summary",
    "draftPayload",
    "warnings",
    "blockingErrors",
    "matchedMasterData",
    "unmatchedItems",
    "evidenceRefs",
    "nextActions"
  ],
  properties: {
    toolName: { type: "string" },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    status: { type: "string" },
    summary: { type: "string" },
    draftPayload: { type: "object", additionalProperties: true },
    warnings: { type: "array", items: { type: "string" } },
    blockingErrors: { type: "array", items: { type: "string" } },
    matchedMasterData: { type: "array", items: { type: "object", additionalProperties: true } },
    unmatchedItems: { type: "array", items: { type: "object", additionalProperties: true } },
    evidenceRefs: { type: "array", items: { type: "string" } },
    nextActions: { type: "array", items: { type: "string" } }
  }
};

const LOW_RISK_APPROVAL_POLICY = {
  approvalRequired: false,
  requiresHumanConfirmation: false,
  minApprovals: 0,
  executeRequiresUserToken: false
};

const DRAFT_APPROVAL_POLICY = {
  approvalRequired: true,
  requiresHumanConfirmation: true,
  minApprovals: 1,
  executeRequiresUserToken: true
};

const HIGH_RISK_APPROVAL_POLICY = {
  approvalRequired: true,
  requiresHumanConfirmation: true,
  minApprovals: 2,
  executeRequiresUserToken: true
};

const SUPPLY_CHAIN_AGENT_TOOL_DEFINITIONS = [
  {
    name: "analyze_supply_chain_dashboard",
    title: "Analyze supply chain dashboard",
    description: "Summarize supply chain dashboard queues, exceptions, and suggested next actions without mutation.",
    riskLevel: "low",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY
  },
  {
    name: "detect_material_shortage",
    title: "Detect material shortage",
    description: "Analyze negative inventory, locked stock, and work-order demand to produce a shortage list.",
    riskLevel: "low",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY
  },
  {
    name: "generate_purchase_suggestions",
    title: "Generate purchase suggestions",
    description: "Generate non-mutating purchase suggestions from shortage and overdue signals.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_production_plan",
    title: "Generate production plan",
    description: "Generate a rule-based production plan proposal from sales demand and available inventory.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_work_orders_from_plan",
    title: "Generate work orders from plan",
    description: "Generate work-order draft recommendations from an approved production plan context.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_material_requisition",
    title: "Generate material requisition",
    description: "Generate work-order material requisition recommendations after inventory availability checks.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_product_receipt",
    title: "Generate product receipt",
    description: "Generate finished-goods receipt recommendations after work-order progress checks.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_sales_delivery",
    title: "Generate sales delivery",
    description: "Generate delivery recommendations for sales orders that pass available-to-promise checks.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "analyze_inventory_availability",
    title: "Analyze inventory availability",
    description: "Analyze available quantity and locked quantity before delivery, issue, or transfer.",
    riskLevel: "low",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY
  },
  {
    name: "detect_inventory_anomalies",
    title: "Detect inventory anomalies",
    description: "Detect negative stock, locked quantity overflow, stale stock, and value anomalies.",
    riskLevel: "low",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY
  },
  {
    name: "generate_stock_count_plan",
    title: "Generate stock count plan",
    description: "Generate a stock-count plan recommendation from inventory anomaly signals.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_outsourcing_order",
    title: "Generate outsourcing order",
    description: "Generate outsourcing recommendations when capacity or process rules require external processing.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_rework_plan",
    title: "Generate rework plan",
    description: "Generate rework plan recommendations from quality, return, or work-order exception context.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "trace_material_batch",
    title: "Trace material batch",
    description: "Generate forward or backward traceability reports for materials, batches, orders, and receipts.",
    riskLevel: "low",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY
  },
  {
    name: "calculate_work_order_cost",
    title: "Calculate work order cost",
    description: "Run a work-order cost simulation without locking cost pools or creating vouchers.",
    riskLevel: "medium",
    approvalPolicy: DRAFT_APPROVAL_POLICY
  },
  {
    name: "generate_cost_voucher_draft",
    title: "Generate cost voucher draft",
    description: "Generate cost voucher draft recommendations after cost calculation and reconciliation checks.",
    riskLevel: "high",
    approvalPolicy: HIGH_RISK_APPROVAL_POLICY
  },
  {
    name: "run_supply_chain_close_check",
    title: "Run supply chain close check",
    description: "Check unfinished supply chain transactions before period close without mutating business data.",
    riskLevel: "high",
    approvalPolicy: HIGH_RISK_APPROVAL_POLICY
  }
];

const SUPPLY_CHAIN_AGENT_TOOL_NAMES = new Set(SUPPLY_CHAIN_AGENT_TOOL_DEFINITIONS.map((tool) => tool.name));

function agentTool({
  name,
  title,
  description,
  riskLevel,
  actionKind,
  draftType = null,
  agentTokenAllowed = true,
  approvalPolicy,
  inputSchema,
  outputSchema
}) {
  return {
    name,
    title,
    description,
    riskLevel,
    actionKind,
    draftType,
    agentTokenAllowed,
    approvalPolicy,
    inputSchema,
    outputSchema
  };
}

const AGENT_TOOL_REGISTRY = [
  agentTool({
    name: "search_vouchers",
    title: "Search vouchers",
    description: "Read voucher drafts and posted vouchers for analysis without mutation.",
    riskLevel: "low",
    actionKind: "query",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY,
    inputSchema: { type: "object", required: ["accountSetId"], properties: { accountSetId: { type: "string" }, keyword: { type: "string" } } },
    outputSchema: { type: "object", required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: true } } } }
  }),
  agentTool({
    name: "search_ledger",
    title: "Search ledger",
    description: "Read ledger balances, details, and traces for analysis without mutation.",
    riskLevel: "low",
    actionKind: "query",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY,
    inputSchema: { type: "object", required: ["accountSetId"], properties: { accountSetId: { type: "string" }, accountCode: { type: "string" } } },
    outputSchema: { type: "object", required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: true } } } }
  }),
  agentTool({
    name: "search_reports",
    title: "Search reports",
    description: "Read report runs, cells, and trace links for interpretation.",
    riskLevel: "low",
    actionKind: "query",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY,
    inputSchema: { type: "object", required: ["accountSetId"], properties: { accountSetId: { type: "string" }, reportRunId: { type: "string" } } },
    outputSchema: { type: "object", required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: true } } } }
  }),
  agentTool({
    name: "suggest_master_data_draft",
    title: "Suggest master-data draft",
    description: "Generate customer, supplier, item, employee, or asset-category candidate drafts from text and OCR evidence.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "master_data",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_purchase_order_draft",
    title: "Suggest purchase order draft",
    description: "Generate purchase request, purchase order, purchase invoice, or payment request candidate drafts.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "purchase_order",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_sales_order_draft",
    title: "Suggest sales order draft",
    description: "Generate sales quote, sales order, sales invoice, or collection plan candidate drafts.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "sales_order",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_inventory_movement_draft",
    title: "Suggest inventory movement draft",
    description: "Generate warehouse receipt, issue, transfer, or adjustment candidate drafts.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "inventory_movement",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_material_requisition_draft",
    title: "Suggest material requisition draft",
    description: "Generate non-mutating work-order material issue candidate drafts from text and OCR evidence.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "material_requisition",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_product_receipt_draft",
    title: "Suggest product receipt draft",
    description: "Generate non-mutating finished-goods receipt candidate drafts from text and OCR evidence.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "product_receipt",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_stock_count_draft",
    title: "Suggest stock count draft",
    description: "Generate stock count and inventory adjustment candidate drafts.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "stock_count",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "create_voucher_draft",
    title: "Create voucher draft",
    description: "Create a voucher draft from reviewed evidence and matched chart-of-account data.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "voucher",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_payroll_allocation_draft",
    title: "Suggest payroll allocation draft",
    description: "Generate payroll allocation and labor-cost-pool candidate drafts.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "payroll_allocation",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "run_depreciation_dry_run",
    title: "Run depreciation dry-run",
    description: "Run a depreciation simulation without locking depreciation or mutating asset ledgers.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "depreciation_run",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_asset_change_draft",
    title: "Suggest asset change draft",
    description: "Generate fixed-asset addition, transfer, value change, or disposal candidate drafts.",
    riskLevel: "medium",
    actionKind: "draft_generation",
    draftType: "asset_change",
    approvalPolicy: DRAFT_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  agentTool({
    name: "suggest_report_interpretation_draft",
    title: "Suggest report interpretation draft",
    description: "Generate report interpretation drafts from report cells, metrics, and trace links.",
    riskLevel: "low",
    actionKind: "draft_generation",
    draftType: "report_interpretation",
    approvalPolicy: LOW_RISK_APPROVAL_POLICY,
    inputSchema: AGENT_DRAFT_TOOL_INPUT_SCHEMA,
    outputSchema: AGENT_DRAFT_TOOL_OUTPUT_SCHEMA
  }),
  ...SUPPLY_CHAIN_AGENT_TOOL_DEFINITIONS.map((tool) =>
    agentTool({
      ...tool,
      actionKind: "dry_run",
      agentTokenAllowed: true,
      inputSchema: SUPPLY_CHAIN_AGENT_TOOL_INPUT_SCHEMA,
      outputSchema: SUPPLY_CHAIN_AGENT_TOOL_OUTPUT_SCHEMA
    })
  ),
  agentTool({
    name: "run_close_checklist",
    title: "Run close checklist",
    description: "Run period close prerequisite checks and produce a risk report without closing the period.",
    riskLevel: "high",
    actionKind: "dry_run",
    agentTokenAllowed: true,
    approvalPolicy: HIGH_RISK_APPROVAL_POLICY,
    inputSchema: { type: "object", required: ["accountSetId", "fiscalYear", "periodNo"], properties: { accountSetId: { type: "string" }, fiscalYear: { type: "integer" }, periodNo: { type: "integer" } } },
    outputSchema: { type: "object", required: ["status", "warnings"], properties: { status: { type: "string" }, warnings: { type: "array", items: { type: "string" } } } }
  }),
  agentTool({
    name: "post_approved_voucher",
    title: "Post approved voucher",
    description: "Post an already approved voucher only after high-risk approval gates are satisfied.",
    riskLevel: "high",
    actionKind: "posting_execution",
    agentTokenAllowed: false,
    approvalPolicy: HIGH_RISK_APPROVAL_POLICY,
    inputSchema: { type: "object", required: ["accountSetId", "voucherId"], properties: { accountSetId: { type: "string" }, voucherId: { type: "string" } } },
    outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" }, voucherId: { type: "string" } } }
  }),
  agentTool({
    name: "execute_approved_payment",
    title: "Execute approved payment",
    description: "Reserve an explicit human-only boundary for payments that may leave the system.",
    riskLevel: "high",
    actionKind: "external_execution",
    agentTokenAllowed: false,
    approvalPolicy: HIGH_RISK_APPROVAL_POLICY,
    inputSchema: { type: "object", required: ["accountSetId", "paymentId"], properties: { accountSetId: { type: "string" }, paymentId: { type: "string" } } },
    outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" }, paymentId: { type: "string" } } }
  }),
  agentTool({
    name: "close_approved_period",
    title: "Close approved period",
    description: "Close an accounting period only after high-risk approval gates are satisfied.",
    riskLevel: "high",
    actionKind: "period_execution",
    agentTokenAllowed: false,
    approvalPolicy: HIGH_RISK_APPROVAL_POLICY,
    inputSchema: { type: "object", required: ["accountSetId", "periodId"], properties: { accountSetId: { type: "string" }, periodId: { type: "string" } } },
    outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" }, periodId: { type: "string" } } }
  })
];

const AGENT_TOOL_BY_NAME = new Map(AGENT_TOOL_REGISTRY.map((tool) => [tool.name, tool]));

function registeredAgentTool(toolName) {
  return AGENT_TOOL_BY_NAME.get(toolName);
}

function listAgentTools() {
  return AGENT_TOOL_REGISTRY.map((tool) => ({
    ...tool,
    approvalPolicy: { ...tool.approvalPolicy },
    inputSchema: structuredClone(tool.inputSchema),
    outputSchema: structuredClone(tool.outputSchema)
  }));
}

function schemaTypeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function validateAgentToolSchemaValue(schema, value, path, errors) {
  if (!schema) return;
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}.`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.join(", ")}.`);
    return;
  }
  if (schema.type) {
    const actualType = schemaTypeOf(value);
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = expectedTypes.some((expectedType) => expectedType === actualType || (expectedType === "number" && actualType === "integer"));
    if (!matches) {
      errors.push(`${path} must be ${expectedTypes.join(" or ")} but got ${actualType}.`);
      return;
    }
  }
  if (schema.type === "object" && schema.properties && value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) {
        errors.push(`${path}.${key} is required.`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (value[key] !== undefined) {
        validateAgentToolSchemaValue(childSchema, value[key], `${path}.${key}`, errors);
      }
    }
  }
  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateAgentToolSchemaValue(schema.items, item, `${path}[${index}]`, errors));
  }
}

function assertAgentToolInputSchema(tool, body) {
  const errors = [];
  validateAgentToolSchemaValue(tool.inputSchema, body, "input", errors);
  if (errors.length > 0) {
    const error = new Error(`Agent tool input schema validation failed: ${errors.join(" ")}`);
    error.code = "AGENT_TOOL_SCHEMA_INVALID";
    throw error;
  }
}

function appendAgentReplayEvent(state, { agentActionId, eventType, actorId = "system", payload = {} }) {
  const event = {
    id: `agent-replay-event:${randomUUID()}`,
    agentActionId,
    eventType,
    actorId,
    payload,
    createdAt: "now"
  };
  state.agentReplayEvents.push(event);
  return event;
}

function captureAgentEvidenceSnapshots(state, accountSetId, evidenceRefs = []) {
  return evidenceRefs
    .map((ref) => {
      const attachment = state.attachments.get(ref);
      if (!attachment) return null;
      if (attachment.accountSetId !== accountSetId) {
        const error = new Error("Agent action evidence attachment must belong to the target account set.");
        error.code = "AGENT_EVIDENCE_ACCOUNT_SET_MISMATCH";
        throw error;
      }
      if (attachment.status !== "available") {
        const error = new Error("Agent action evidence attachment must be available before dry-run.");
        error.code = "AGENT_EVIDENCE_NOT_AVAILABLE";
        throw error;
      }
      return {
        attachmentId: attachment.id,
        checksum: attachment.checksum,
        byteSize: attachment.byteSize,
        storageProvider: attachment.storageProvider,
        storageKey: attachment.storageKey,
        capturedAt: "now"
      };
    })
    .filter(Boolean);
}

function verifyAgentEvidenceSnapshots(state, action, actorId) {
  const mismatches = [];
  for (const snapshot of action.evidenceSnapshots ?? []) {
    const attachment = state.attachments.get(snapshot.attachmentId);
    if (!attachment) {
      mismatches.push({ attachmentId: snapshot.attachmentId, reason: "missing" });
      continue;
    }
    if (attachment.status !== "available") {
      mismatches.push({ attachmentId: snapshot.attachmentId, reason: "not_available", currentStatus: attachment.status });
      continue;
    }
    if (attachment.checksum !== snapshot.checksum) {
      mismatches.push({
        attachmentId: snapshot.attachmentId,
        reason: "checksum_mismatch",
        expectedChecksum: snapshot.checksum,
        actualChecksum: attachment.checksum
      });
    }
  }
  if (mismatches.length > 0) {
    appendAgentReplayEvent(state, {
      agentActionId: action.id,
      eventType: "evidence_verification_failed",
      actorId,
      payload: { mismatches }
    });
    const error = new Error("Agent action evidence hash verification failed before execution.");
    error.code = "AGENT_EVIDENCE_HASH_MISMATCH";
    throw error;
  }
  appendAgentReplayEvent(state, {
    agentActionId: action.id,
    eventType: "evidence_verified",
    actorId,
    payload: { evidenceSnapshots: action.evidenceSnapshots ?? [] }
  });
}

function createAgentActionRecord(state, body, actorId) {
  if (body.dryRun !== true) {
    throw new Error("Agent actions must start with dryRun true.");
  }
  if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
    throw new Error("accountSetId is required.");
  }
  if (typeof body.toolName !== "string" || body.toolName.trim() === "") {
    throw new Error("toolName is required.");
  }
  const tool = registeredAgentTool(body.toolName);
  if (!tool) {
    const error = new Error(`Agent tool ${body.toolName} is not registered.`);
    error.code = "AGENT_TOOL_NOT_REGISTERED";
    throw error;
  }
  if (!Array.isArray(body.evidenceRefs)) {
    throw new Error("evidenceRefs is required.");
  }
  const evidenceSnapshots = captureAgentEvidenceSnapshots(state, body.accountSetId, body.evidenceRefs);

  const action = {
    id: `agent-action:${randomUUID()}`,
    accountSetId: body.accountSetId,
    toolName: tool.name,
    dryRun: true,
    riskLevel: tool.riskLevel,
    actionKind: tool.actionKind,
    status: "dry_run_completed",
    approvalRequired: tool.approvalPolicy.approvalRequired,
    approvalPolicy: { ...tool.approvalPolicy },
    evidenceRefs: [...body.evidenceRefs],
    evidenceSnapshots,
    payload: body.payload ?? {},
    requestedBy: body.requestedBy ?? actorId,
    createdAt: "now",
    dryRunResult: buildAgentActionDryRunResult(state, tool, body),
    approvalRequest: null,
    approvalHistory: [],
    approvalProgress: {
      approvedCount: 0,
      requiredCount: tool.approvalPolicy.minApprovals,
      remainingCount: tool.approvalPolicy.minApprovals
    },
    executionResult: null,
    reversalResult: null
  };
  state.agentActions.set(action.id, action);
  appendAgentReplayEvent(state, {
    agentActionId: action.id,
    eventType: "input_received",
    actorId: action.requestedBy,
    payload: { toolName: action.toolName, evidenceRefs: action.evidenceRefs, payload: action.payload }
  });
  appendAgentReplayEvent(state, {
    agentActionId: action.id,
    eventType: "dry_run_completed",
    actorId,
    payload: action.dryRunResult
  });
  return action;
}

async function invokeRegisteredAgentTool(state, toolName, body, actorId) {
  const tool = registeredAgentTool(toolName);
  if (!tool) {
    const error = new Error(`Agent tool ${toolName} is not registered.`);
    error.code = "AGENT_TOOL_NOT_REGISTERED";
    throw error;
  }
  if (tool.agentTokenAllowed === false) {
    const error = new Error(`Agent tool ${toolName} does not allow direct Agent token invocation.`);
    error.code = "AGENT_TOOL_NOT_AGENT_ALLOWED";
    throw error;
  }
  if (body.dryRun !== true) {
    throw new Error("Agent tool invocation must use dryRun true.");
  }
  assertAgentToolInputSchema(tool, body);
  if (tool.actionKind === "draft_generation") {
    if (!tool.draftType || !SUPPORTED_AGENT_DRAFT_TYPES.has(tool.draftType)) {
      throw new Error(`Agent draft generation tool ${toolName} does not map to a supported draft type.`);
    }
    const candidate = await createAgentDraftCandidate(
      state,
      {
        accountSetId: body.accountSetId,
        fiscalYear: body.fiscalYear,
        periodNo: body.periodNo,
        draftType: tool.draftType,
        sourceObjectType: body.sourceObjectType ?? "agent_tool",
        sourceObjectId: body.sourceObjectId,
        userInstruction: body.userInstruction,
        evidenceRefs: body.evidenceRefs ?? [],
        attachmentIds: body.attachmentIds ?? [],
        reviewedOcrResults: body.reviewedOcrResults ?? [],
        requestedBy: body.requestedBy ?? actorId,
        dryRun: true
      },
      actorId
    );
    const savedCandidate = await persistAgentDraftCandidateForRoute(state, candidate);
    appendAuditLog(state, {
      actorId: body.requestedBy ?? actorId,
      action: "agent_tool.invoke",
      objectType: "agent_tool",
      objectId: tool.name
    });
    return {
      toolName: tool.name,
      actionKind: tool.actionKind,
      dryRun: true,
      resultType: "agent_draft_candidate",
      result: savedCandidate
    };
  }

  const action = createAgentActionRecord(
    state,
    {
      accountSetId: body.accountSetId,
      toolName: tool.name,
      dryRun: true,
      evidenceRefs: body.evidenceRefs ?? [],
      fiscalYear: body.fiscalYear,
      periodNo: body.periodNo,
      asOfDate: body.asOfDate,
      sourceObjectType: body.sourceObjectType,
      sourceObjectId: body.sourceObjectId,
      payload: body.payload ?? {},
      requestedBy: body.requestedBy ?? actorId
    },
    actorId
  );
  const savedAction = await persistAgentActionForRoute(state, action, { create: true });
  appendAuditLog(state, {
    actorId: body.requestedBy ?? actorId,
    action: "agent_tool.invoke",
    objectType: "agent_tool",
    objectId: tool.name
  });
  return {
    toolName: tool.name,
    actionKind: tool.actionKind,
    dryRun: true,
    resultType: "agent_action",
    result: publicAgentAction(state, savedAction)
  };
}

function submitAgentActionForApproval(state, action, body, actorId) {
  if (action.status !== "dry_run_completed") {
    throw new Error("Only dry-run completed Agent actions can be submitted for approval.");
  }
  const submittedBy = body.submittedBy ?? actorId;
  const updated = {
    ...action,
    status: "submitted_for_approval",
    approvalRequest: {
      submittedBy,
      submittedAt: "now",
      approvalComment: body.approvalComment ?? null
    }
  };
  state.agentActions.set(updated.id, updated);
  appendAgentReplayEvent(state, {
    agentActionId: updated.id,
    eventType: "submitted_for_approval",
    actorId: submittedBy,
    payload: updated.approvalRequest
  });
  return updated;
}

function agentApprovalProgress(action, approvalHistory = action.approvalHistory ?? []) {
  const requiredCount = Number(action.approvalPolicy?.minApprovals ?? 0);
  const approvedCount = approvalHistory.length;
  return {
    approvedCount,
    requiredCount,
    remainingCount: Math.max(requiredCount - approvedCount, 0)
  };
}

function approveAgentActionRecord(state, action, body, actorId) {
  if (action.status !== "submitted_for_approval") {
    throw new Error("Only submitted Agent actions can be approved.");
  }
  const approvedBy = body.approvedBy ?? actorId;
  if ((action.approvalHistory ?? []).some((approval) => approval.approvedBy === approvedBy)) {
    const error = new Error("The same approver cannot approve an Agent action more than once.");
    error.code = "AGENT_APPROVAL_DUPLICATE_APPROVER";
    throw error;
  }
  const approval = {
    id: `agent-approval:${randomUUID()}`,
    agentActionId: action.id,
    approvedBy,
    approvedAt: "now",
    approvalComment: body.approvalComment ?? null
  };
  state.agentApprovals.push(approval);
  const approvalHistory = [...(action.approvalHistory ?? []), approval];
  const approvalProgress = agentApprovalProgress(action, approvalHistory);
  const updated = {
    ...action,
    status: approvalProgress.remainingCount === 0 ? "approved" : "submitted_for_approval",
    approvalHistory,
    approvalProgress
  };
  state.agentActions.set(updated.id, updated);
  appendAgentReplayEvent(state, {
    agentActionId: updated.id,
    eventType: "approved",
    actorId: approvedBy,
    payload: { ...approval, approvalProgress }
  });
  return updated;
}

function executeAgentActionRecord(state, action, body, actorId) {
  if (action.status !== "approved") {
    throw new Error("Only approved Agent actions can be executed.");
  }
  const executedBy = body.executedBy ?? actorId;
  if (action.approvalPolicy?.executeRequiresUserToken && body.userTokenConfirmed !== true) {
    const error = new Error("Agent action execution requires an explicit confirmed user token.");
    error.code = "AGENT_ACTION_USER_TOKEN_REQUIRED";
    throw error;
  }
  const restoreDrill = restoreDrillConfigFor(state);
  if (restoreDrill.outboundBlocked && action.actionKind === "external_execution") {
    appendAgentReplayEvent(state, {
      agentActionId: action.id,
      eventType: "restore_drill_outbound_blocked",
      actorId: executedBy,
      payload: {
        toolName: action.toolName,
        actionKind: action.actionKind,
        blockedChannels: restoreDrill.blockedChannels,
        restoreDrill: true
      }
    });
    const error = new Error("Restore-drill silent sandbox blocks external Agent executions.");
    error.code = "RESTORE_DRILL_OUTBOUND_BLOCKED";
    throw error;
  }
  verifyAgentEvidenceSnapshots(state, action, executedBy);
  const executionResult = {
    status: "recorded_without_business_mutation",
    executedBy,
    executedAt: "now",
    toolName: action.toolName,
    businessMutation: false,
    userTokenConfirmed: body.userTokenConfirmed === true
  };
  const updated = {
    ...action,
    status: "executed",
    executionResult
  };
  state.agentActions.set(updated.id, updated);
  appendAgentReplayEvent(state, {
    agentActionId: updated.id,
    eventType: "executed",
    actorId: executedBy,
    payload: executionResult
  });
  return updated;
}

function reverseAgentActionRecord(state, action, body, actorId) {
  if (action.status !== "executed") {
    throw new Error("Only executed Agent actions can be reversed.");
  }
  const reversedBy = body.reversedBy ?? actorId;
  const reversalReason =
    typeof body.reversalReason === "string" && body.reversalReason.trim() !== ""
      ? body.reversalReason
      : "Agent action reversed by user request.";
  const reversalResult = {
    status: "reversed_without_business_mutation",
    reversedBy,
    reversedAt: "now",
    reversalReason,
    originalExecutionResult: action.executionResult ?? null,
    toolName: action.toolName,
    businessMutation: false
  };
  const updated = {
    ...action,
    status: "reversed",
    reversalResult
  };
  state.agentActions.set(updated.id, updated);
  appendAgentReplayEvent(state, {
    agentActionId: updated.id,
    eventType: "reversed",
    actorId: reversedBy,
    payload: reversalResult
  });
  return updated;
}

function agentActionReplayEventsFor(state, agentActionId) {
  return state.agentReplayEvents.filter((event) => event.agentActionId === agentActionId);
}

function agentActionNextActions(action) {
  if (action.status === "dry_run_completed") {
    return action.approvalRequired ? ["submit"] : [];
  }
  if (action.status === "submitted_for_approval") {
    return ["approve"];
  }
  if (action.status === "approved") {
    return ["execute"];
  }
  if (action.status === "executed") {
    return ["reverse"];
  }
  return [];
}

function agentActionMutationState(action) {
  if (action.reversalResult) {
    return action.reversalResult.businessMutation === true ? "reversed_with_business_mutation" : "reversed_without_business_mutation";
  }
  if (action.executionResult) {
    return action.executionResult.businessMutation === true ? "executed_with_business_mutation" : "executed_without_business_mutation";
  }
  return "dry_run_only";
}

function buildAgentActionAuditSummary(state, action) {
  const events = agentActionReplayEventsFor(state, action.id);
  const eventTypes = events.map((event) => event.eventType);
  const failedEvidenceEvents = events.filter((event) => event.eventType === "evidence_verification_failed");
  const failedCount = failedEvidenceEvents.reduce(
    (count, event) => count + (Array.isArray(event.payload?.mismatches) ? event.payload.mismatches.length : 1),
    0
  );
  const verificationStatus =
    failedCount > 0 ? "failed" : eventTypes.includes("evidence_verified") ? "verified" : "pending";

  return {
    agentActionId: action.id,
    accountSetId: action.accountSetId,
    toolName: action.toolName,
    actionKind: action.actionKind,
    status: action.status,
    riskLevel: action.riskLevel,
    requestedBy: action.requestedBy,
    approvalRequired: action.approvalRequired,
    approvals: action.approvalProgress ?? agentApprovalProgress(action),
    evidence: {
      snapshotCount: action.evidenceSnapshots?.length ?? 0,
      verificationStatus,
      failedCount
    },
    replay: {
      eventCount: events.length,
      eventTypes,
      lastEventType: eventTypes.at(-1) ?? null
    },
    dryRunStatus: action.dryRunResult?.status ?? null,
    executionStatus: action.executionResult?.status ?? null,
    reversalStatus: action.reversalResult?.status ?? null,
    mutationState: agentActionMutationState(action),
    nextActions: agentActionNextActions(action)
  };
}

function publicAgentAction(state, action) {
  return {
    ...action,
    auditSummary: buildAgentActionAuditSummary(state, action)
  };
}

function summarizeAgentAction(action) {
  return {
    id: action.id,
    accountSetId: action.accountSetId,
    toolName: action.toolName,
    actionKind: action.actionKind,
    riskLevel: action.riskLevel,
    status: action.status,
    approvalRequired: action.approvalRequired,
    approvalProgress: action.approvalProgress,
    dryRunStatus: action.dryRunResult?.status ?? null,
    evidenceCount: action.evidenceRefs?.length ?? 0,
    requestedBy: action.requestedBy,
    submittedBy: action.approvalRequest?.submittedBy ?? null,
    submittedAt: action.approvalRequest?.submittedAt ?? null,
    executedBy: action.executionResult?.executedBy ?? null,
    executedAt: action.executionResult?.executedAt ?? null,
    createdAt: action.createdAt
  };
}

function listAgentActions(state, { accountSetId = null, status = null, riskLevel = null, toolName = null } = {}) {
  return [...state.agentActions.values()]
    .filter((action) => {
      if (accountSetId && action.accountSetId !== accountSetId) return false;
      if (status && action.status !== status) return false;
      if (riskLevel && action.riskLevel !== riskLevel) return false;
      if (toolName && action.toolName !== toolName) return false;
      return true;
    })
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || right.id.localeCompare(left.id))
    .map(summarizeAgentAction);
}

function hydrateAgentReplayEvents(state, agentActionId, events) {
  state.agentReplayEvents = state.agentReplayEvents.filter((event) => event.agentActionId !== agentActionId);
  state.agentReplayEvents.push(...events);
}

async function loadAgentActionForRoute(state, agentActionId) {
  const action =
    state.agentActions.get(agentActionId) ??
    (state.config.platformStore?.findAgentAction ? await state.config.platformStore.findAgentAction(agentActionId) : null);
  if (!action) {
    return null;
  }
  state.agentActions.set(action.id, action);
  if (state.config.platformStore?.listAgentReplayEvents) {
    hydrateAgentReplayEvents(state, action.id, await state.config.platformStore.listAgentReplayEvents(action.id));
  }
  return action;
}

async function persistAgentActionForRoute(state, action, { create = false } = {}) {
  const platformStore = state.config.platformStore;
  if (!platformStore) {
    return action;
  }
  const savedAction =
    create && platformStore.createAgentAction
      ? await platformStore.createAgentAction(action)
      : platformStore.updateAgentAction
        ? await platformStore.updateAgentAction(action)
        : action;
  state.agentActions.set(savedAction.id, savedAction);
  if (platformStore.replaceAgentReplayEvents) {
    const savedEvents = await platformStore.replaceAgentReplayEvents(savedAction.id, agentActionReplayEventsFor(state, savedAction.id));
    hydrateAgentReplayEvents(state, savedAction.id, savedEvents);
  }
  return savedAction;
}

async function listCollectionPlans(state, accountSetId, filters = {}) {
  const persistedPlans = state.config.platformStore?.listCollectionPlans
    ? await state.config.platformStore.listCollectionPlans(accountSetId, filters)
    : [];
  const plansById = new Map(persistedPlans.map((plan) => [plan.id, plan]));
  for (const plan of state.collectionPlans.values()) {
    if (accountSetId && plan.accountSetId !== accountSetId) continue;
    if (filters.status && plan.status !== filters.status) continue;
    if (filters.customerId && plan.customerId !== filters.customerId) continue;
    plansById.set(plan.id, plan);
  }
  return [...plansById.values()].sort(
    (left, right) => String(left.plannedReceiptDate).localeCompare(String(right.plannedReceiptDate)) || left.sourceNo.localeCompare(right.sourceNo)
  );
}

async function createCollectionPlan(state, plan) {
  const savedPlan = state.config.platformStore?.createCollectionPlan
    ? await state.config.platformStore.createCollectionPlan(plan)
    : plan;
  state.collectionPlans.set(savedPlan.id, savedPlan);
  return savedPlan;
}

function collectionPlanFromReceivableLedgerEntry(entry) {
  return {
    id: `collection-plan:${entry.id}`,
    accountSetId: entry.accountSetId,
    counterpartyLedgerEntryId: entry.id,
    customerId: entry.partnerId,
    customerName: entry.partnerName ?? null,
    sourceNo: entry.sourceNo,
    plannedReceiptDate: entry.dueDate ?? entry.documentDate,
    plannedAmount: Number(entry.remainingAmount ?? entry.originalAmount ?? 0),
    status: "planned",
    createdBy: entry.createdBy
  };
}

async function listCreditExposures(state, accountSetId) {
  const partners = await listPartners(state, accountSetId, "customer");
  const arEntries = await listCounterpartyLedgerEntries(state, accountSetId, { direction: "ar", status: "open" });
  return partners.map((partner) => {
    const occupiedAmount = Number(
      arEntries
        .filter((entry) => entry.partnerId === partner.id)
        .reduce((sum, entry) => sum + Number(entry.remainingAmount ?? 0), 0)
        .toFixed(2)
    );
    const creditLimit = Number(partner.creditLimit ?? 0);
    return {
      accountSetId,
      customerId: partner.id,
      customerName: partner.name,
      creditLimit,
      occupiedAmount,
      availableCredit: Number((creditLimit - occupiedAmount).toFixed(2)),
      status: creditLimit > 0 && occupiedAmount > creditLimit ? "over_limit" : "within_limit"
    };
  });
}

function normalizeFulfillmentLines(order, lines = [], { sourceLineIdField, executedQuantityField }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Fulfillment lines are required.");
  }
  return lines.map((line, index) => {
    const orderLineNo = Number(line.orderLineNo ?? line.lineNo);
    const quantity = Number(line.quantity);
    const orderLine = order.lines?.find((candidate) => candidate.lineNo === orderLineNo);
    if (!orderLine) {
      throw new Error(`Order line ${orderLineNo} was not found.`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Fulfillment line quantity must be greater than 0.");
    }
    const executedQuantity = Number(orderLine[executedQuantityField] ?? 0);
    const remainingQuantity = Number(orderLine.quantity ?? 0) - executedQuantity;
    if (quantity > remainingQuantity) {
      throw new Error(`Fulfillment quantity ${quantity} exceeds remaining quantity ${remainingQuantity}.`);
    }
    return {
      lineNo: line.lineNo ?? index + 1,
      [sourceLineIdField]: orderLine.id ?? `${sourceLineIdField}:${order.id}:${orderLine.lineNo}`,
      orderLineNo,
      itemCode: orderLine.itemCode,
      itemName: orderLine.itemName,
      quantity
    };
  });
}

function applyOrderExecution(order, fulfillmentLines, executedQuantityField) {
  const fulfilledByLineNo = new Map();
  for (const line of fulfillmentLines) {
    fulfilledByLineNo.set(line.orderLineNo, (fulfilledByLineNo.get(line.orderLineNo) ?? 0) + line.quantity);
  }
  const lines = (order.lines ?? []).map((line) => {
    const addition = fulfilledByLineNo.get(line.lineNo) ?? 0;
    return {
      ...line,
      [executedQuantityField]: Number((Number(line[executedQuantityField] ?? 0) + addition).toFixed(4))
    };
  });
  const anyExecuted = lines.some((line) => Number(line[executedQuantityField] ?? 0) > 0);
  const allExecuted = lines.every((line) => Number(line[executedQuantityField] ?? 0) >= Number(line.quantity ?? 0));
  return {
    ...order,
    status: allExecuted ? "executed" : anyExecuted ? "partially_executed" : order.status,
    lines
  };
}

function normalizeInvoiceLines(sourceDocument, order, lines = [], { sourceLineNoField, sourceLineIdField, orderLineIdField }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Invoice lines are required.");
  }
  return lines.map((line, index) => {
    const sourceLineNo = Number(line[sourceLineNoField] ?? line.lineNo);
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const taxRate = Number(line.taxRate ?? 0);
    const sourceLine = sourceDocument.lines?.find((candidate) => candidate.lineNo === sourceLineNo);
    if (!sourceLine) {
      throw new Error(`Source document line ${sourceLineNo} was not found.`);
    }
    const orderLine = order.lines?.find((candidate) => candidate.id === sourceLine[orderLineIdField]);
    if (!orderLine) {
      throw new Error(`Order source line for ${sourceLineNo} was not found.`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Invoice line quantity must be greater than 0.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("Invoice line unitPrice must be non-negative.");
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      throw new Error("Invoice line taxRate must be a number from 0 to 1.");
    }
    const remainingQuantity = Math.min(
      Number(sourceLine.quantity ?? 0),
      Number(orderLine.quantity ?? 0) - Number(orderLine.invoicedQuantity ?? 0)
    );
    if (quantity > remainingQuantity) {
      throw new Error(`Invoice quantity ${quantity} exceeds remaining quantity ${remainingQuantity}.`);
    }
    const netAmount = quantity * unitPrice;
    const taxAmount = Number(line.taxAmount ?? Number((netAmount * taxRate).toFixed(2)));
    const totalAmount = Number(line.totalAmount ?? Number((netAmount + taxAmount).toFixed(2)));
    return {
      lineNo: line.lineNo ?? index + 1,
      [sourceLineIdField]: sourceLine[orderLineIdField],
      sourceLineNo,
      itemCode: sourceLine.itemCode,
      itemName: sourceLine.itemName,
      quantity,
      unitPrice,
      taxRate,
      taxAmount,
      totalAmount,
      expectedTotalAmount: Number((quantity * Number(orderLine.unitPrice ?? 0) * (1 + Number(orderLine.taxRate ?? 0))).toFixed(2))
    };
  });
}

function applyOrderInvoicing(order, invoiceLines) {
  const invoicedBySourceId = new Map();
  for (const line of invoiceLines) {
    const sourceId = line.purchaseOrderLineId ?? line.salesOrderLineId;
    invoicedBySourceId.set(sourceId, (invoicedBySourceId.get(sourceId) ?? 0) + line.quantity);
  }
  const lines = (order.lines ?? []).map((line) => ({
    ...line,
    invoicedQuantity: Number((Number(line.invoicedQuantity ?? 0) + Number(invoicedBySourceId.get(line.id) ?? 0)).toFixed(4))
  }));
  return { ...order, lines };
}

async function enabledAccountSetLockError(state, accountSetId) {
  if (typeof accountSetId !== "string" || accountSetId.trim() === "") {
    return null;
  }
  const accountSet =
    findAccountSetByIdentifier(state, accountSetId) ??
    (state.config.platformStore?.findAccountSet ? await state.config.platformStore.findAccountSet(accountSetId) : null);
  if (accountSet?.status === "enabled") {
    return errorResponse(
      409,
      "ACCOUNT_SET_ENABLED_LOCKED",
      "Enabled account sets do not allow master data or opening balance changes."
    );
  }
  return null;
}

function appendAuditLog(state, { actorId = "system", action, objectType, objectId }) {
  state.auditLogs.push({
    id: `audit:${state.auditLogs.length + 1}`,
    actorId,
    action,
    objectType,
    objectId,
    occurredAt: "now"
  });
}

function createSecurityEventRecord(state, event) {
  return {
    id: event.id ?? `security-event:${randomUUID()}`,
    accountSetId: event.accountSetId ?? null,
    eventType: event.eventType,
    severity: event.severity ?? "medium",
    actorId: event.actorId ?? null,
    source: event.source ?? "api",
    objectType: event.objectType ?? null,
    objectId: event.objectId ?? null,
    message: event.message ?? "",
    payload: event.payload ?? {},
    createdAt: event.createdAt ?? new Date(nowMsFor(state)).toISOString()
  };
}

async function recordSecurityEvent(state, event) {
  const securityEvent = createSecurityEventRecord(state, event);
  state.securityEvents.set(securityEvent.id, securityEvent);
  if (!state.config.platformStore?.createSecurityEvent) {
    return securityEvent;
  }
  try {
    const saved = await state.config.platformStore.createSecurityEvent(securityEvent);
    state.securityEvents.set(saved.id, saved);
    return saved;
  } catch {
    return securityEvent;
  }
}

function listSecurityEvents(state, { accountSetId = null, eventType = null, severity = null, actorId = null } = {}) {
  return [...state.securityEvents.values()]
    .filter((event) => {
      if (accountSetId && event.accountSetId !== accountSetId) return false;
      if (eventType && event.eventType !== eventType) return false;
      if (severity && event.severity !== severity) return false;
      if (actorId && event.actorId !== actorId) return false;
      return true;
    })
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || right.id.localeCompare(left.id));
}

function appendVoucherStatusLog(state, { voucherId, action, fromStatus, toStatus, actorId = "system", reason = null }) {
  const log = {
    id: uniqueVoucherStatusLogId(),
    voucherId,
    action,
    fromStatus,
    toStatus,
    actorId,
    reason,
    createdAt: "now"
  };
  state.voucherStatusLogs.push(log);
  return log;
}

async function persistVoucherStatusTransition(state, voucher, log) {
  const updatedVoucher = state.config.platformStore?.updateVoucherStatus
    ? await state.config.platformStore.updateVoucherStatus(voucher)
    : voucher;
  state.vouchers.set(updatedVoucher.id, updatedVoucher);
  if (state.config.platformStore?.createVoucherStatusLog) {
    await state.config.platformStore.createVoucherStatusLog(log);
  }
  return updatedVoucher;
}

function assertVoucherAttachmentsAvailable(state, voucher) {
  const unavailableAttachments = state.attachmentLinks
    .filter((link) => link.objectType === "voucher" && link.objectId === voucher.id)
    .map((link) => state.attachments.get(link.attachmentId))
    .filter((attachment) => attachment && attachment.status !== "available");
  if (unavailableAttachments.length > 0) {
    const statuses = unavailableAttachments.map((attachment) => `${attachment.id}:${attachment.status}`).join(", ");
    throw new Error(`Voucher attachments must be available before posting: ${statuses}.`);
  }
}

function voucherAttachmentStatusError(state, voucher) {
  try {
    assertVoucherAttachmentsAvailable(state, voucher);
    return null;
  } catch (error) {
    return errorResponse(409, "VOUCHER_ATTACHMENT_NOT_AVAILABLE", error.message);
  }
}

async function postVoucherInState(state, voucher, { period, accounts, postedBy = "system" }) {
  assertVoucherAttachmentsAvailable(state, voucher);
  const posting = postVoucher(voucher, {
    period,
    accounts,
    postedBy
  });
  state.vouchers.set(posting.voucher.id, posting.voucher);
  state.journalEntries.push(...posting.journalEntries);
  state.balances = mergeBalances(state.balances, posting.balances);
  const log = appendVoucherStatusLog(state, {
    voucherId: posting.voucher.id,
    action: "post",
    fromStatus: voucher.status,
    toStatus: posting.voucher.status,
    actorId: postedBy
  });
  await persistVoucherStatusTransition(state, posting.voucher, log);
  if (state.config.platformStore?.savePostingResult) {
    const savedPosting = await state.config.platformStore.savePostingResult({
      ...posting,
      postedBy
    });
    posting.journalEntries = savedPosting.journalEntries ?? posting.journalEntries;
    posting.balances = savedPosting.balances ?? posting.balances;
  }
  appendAuditLog(state, {
    actorId: postedBy,
    action: "voucher.post",
    objectType: "voucher",
    objectId: posting.voucher.id
  });
  return posting;
}

function countUnpostedVouchersForPeriod(state, period) {
  return [...state.vouchers.values()].filter(
    (voucher) =>
      voucher.accountSetId === period.accountSetId &&
      voucher.fiscalYear === period.fiscalYear &&
      voucher.periodNo === period.periodNo &&
      !["posted", "voided"].includes(voucher.status)
  ).length;
}

async function listPostingBatches(state) {
  const persistedBatches = state.config.platformStore?.listPostingBatches
    ? await state.config.platformStore.listPostingBatches()
    : [];
  const batchesById = new Map(persistedBatches.map((batch) => [batch.id, batch]));
  for (const batch of state.postingBatches.values()) {
    batchesById.set(batch.id, batch);
  }
  return [...batchesById.values()];
}

function cloneReportPayload(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderReportExportContent(run, fileType) {
  const delimiter = fileType === "excel" ? "," : " | ";
  const lines = [
    `reportRunId${delimiter}${run.id}`,
    `snapshotHash${delimiter}${run.snapshotHash}`,
    `renderMode${delimiter}${reportRunRenderMode(run)}`,
    ["sheetCell", "label", "calculatedValue", "displayFormat", "formulaText"].join(delimiter)
  ];
  for (const cell of run.cells ?? []) {
    lines.push(
      [
        `${cell.sheetCode}!${cell.cellAddress}`,
        cell.label ?? "",
        Number(cell.calculatedValue ?? 0),
        cell.displayFormat ?? "",
        cell.formulaText ?? ""
      ].join(delimiter)
    );
  }
  return lines.join("\n");
}

function findReportTemplateByIdentifier(state, identifier) {
  return [...state.reportTemplates.values()].find(
    (template) => template.id === identifier || template.templateCode === identifier
  );
}

function findReportTemplateVersionByIdentifier(state, identifier) {
  return [...state.reportTemplateVersions.values()].find((version) => version.id === identifier);
}

function requireReportTemplatePayload(body) {
  for (const field of ["accountSetId", "templateCode", "templateName", "reportType"]) {
    if (typeof body[field] !== "string" || body[field].trim() === "") {
      throw new Error(`${field} is required.`);
    }
  }
}

function normalizeReportVersionSheets(state, versionId, sheets = []) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("sheets are required.");
  }

  return sheets.map((sheet, sheetIndex) => {
    if (typeof sheet.sheetCode !== "string" || sheet.sheetCode.trim() === "") {
      throw new Error("sheetCode is required.");
    }
    const sheetId = `report-sheet:${state.reportTemplateVersions.size + 1}:${sheetIndex + 1}`;
    const cells = Array.isArray(sheet.cells)
      ? sheet.cells.map((cell, cellIndex) => {
          if (typeof cell.cellAddress !== "string" || cell.cellAddress.trim() === "") {
            throw new Error("cellAddress is required.");
          }
          const formula = cell.formula
            ? {
                id: `report-formula:${state.reportTemplateVersions.size + 1}:${sheetIndex + 1}:${cellIndex + 1}`,
                formulaText: cell.formula.formulaText,
                astJson: cloneReportPayload(cell.formula.astJson ?? {}),
                dependenciesJson: cloneReportPayload(cell.formula.dependenciesJson ?? [])
              }
            : null;
          if (formula && (typeof formula.formulaText !== "string" || formula.formulaText.trim() === "")) {
            throw new Error("formulaText is required.");
          }
          return {
            id: `report-cell:${state.reportTemplateVersions.size + 1}:${sheetIndex + 1}:${cellIndex + 1}`,
            sheetId,
            cellAddress: cell.cellAddress,
            label: cell.label ?? null,
            valueType: cell.valueType ?? (formula ? "formula" : "text"),
            displayFormat: cell.displayFormat ?? null,
            isEditable: cell.isEditable ?? true,
            mergeRef: cell.mergeRef ?? null,
            rowNo: cell.rowNo ?? null,
            columnNo: cell.columnNo ?? null,
            formula
          };
        })
      : [];
    return {
      id: sheetId,
      versionId,
      sheetCode: sheet.sheetCode,
      sheetName: sheet.sheetName ?? sheet.sheetCode,
      rowCount: sheet.rowCount ?? 0,
      columnCount: sheet.columnCount ?? 0,
      orderNo: sheet.orderNo ?? sheetIndex + 1,
      cells
    };
  });
}

function publicReportTemplate(template, versions) {
  const templateVersions = versions.filter((version) => version.templateId === template.id);
  return {
    ...template,
    latestVersionNo: template.latestVersionNo ?? Math.max(0, ...templateVersions.map((version) => version.versionNo)),
    versionCount: templateVersions.length
  };
}

async function createReportTemplate(state, body, actorId) {
  requireReportTemplatePayload(body);
  if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
    return accountSetAccessError(state, actorId, body.accountSetId);
  }
  const duplicate = [...state.reportTemplates.values()].find(
    (template) => template.accountSetId === body.accountSetId && template.templateCode === body.templateCode
  );
  if (duplicate) {
    return errorResponse(409, "REPORT_TEMPLATE_ALREADY_EXISTS", "Report template code already exists in this account set.");
  }

  const template = {
    id: `report-template:${state.reportTemplates.size + 1}`,
    accountSetId: body.accountSetId,
    templateCode: body.templateCode,
    templateName: body.templateName,
    reportType: body.reportType,
    status: body.status ?? "draft",
    latestVersionNo: 0,
    publishedVersionId: null,
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    updatedAt: "now"
  };
  state.reportTemplates.set(template.id, template);
  appendAuditLog(state, {
    actorId: template.createdBy,
    action: "report_template.create",
    objectType: "report_template",
    objectId: template.id
  });
  return jsonResponse(201, publicReportTemplate(template, [...state.reportTemplateVersions.values()]));
}

async function createReportTemplateVersion(state, templateId, body, actorId) {
  const template = findReportTemplateByIdentifier(state, templateId);
  if (!template) {
    return errorResponse(404, "REPORT_TEMPLATE_NOT_FOUND", "Report template was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, template.accountSetId))) {
    return accountSetAccessError(state, actorId, template.accountSetId);
  }
  const templateVersions = [...state.reportTemplateVersions.values()].filter((version) => version.templateId === template.id);
  const versionNo = Math.max(0, ...templateVersions.map((version) => version.versionNo)) + 1;
  const versionId = `report-template-version:${state.reportTemplateVersions.size + 1}`;
  const version = {
    id: versionId,
    templateId: template.id,
    versionNo,
    versionName: body.versionName ?? `Version ${versionNo}`,
    status: "draft",
    effectiveFromPeriod: body.effectiveFromPeriod ?? null,
    layoutJson: cloneReportPayload(body.layoutJson ?? {}),
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    publishedBy: null,
    publishedAt: null,
    sheets: normalizeReportVersionSheets(state, versionId, body.sheets)
  };
  state.reportTemplateVersions.set(version.id, version);
  state.reportTemplates.set(template.id, {
    ...template,
    latestVersionNo: versionNo,
    updatedAt: "now"
  });
  appendAuditLog(state, {
    actorId: version.createdBy,
    action: "report_template_version.create",
    objectType: "report_template_version",
    objectId: version.id
  });
  return jsonResponse(201, cloneReportPayload(version));
}

async function publishReportTemplateVersion(state, versionId, body, actorId) {
  const version = findReportTemplateVersionByIdentifier(state, versionId);
  if (!version) {
    return errorResponse(404, "REPORT_TEMPLATE_VERSION_NOT_FOUND", "Report template version was not found.");
  }
  const template = state.reportTemplates.get(version.templateId);
  if (!template) {
    return errorResponse(404, "REPORT_TEMPLATE_NOT_FOUND", "Report template was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, template.accountSetId))) {
    return accountSetAccessError(state, actorId, template.accountSetId);
  }
  const published = {
    ...version,
    status: "published",
    publishedBy: body.publishedBy ?? actorId,
    publishedAt: "now"
  };
  state.reportTemplateVersions.set(published.id, published);
  state.reportTemplates.set(template.id, {
    ...template,
    status: "active",
    publishedVersionId: published.id,
    updatedAt: "now"
  });
  appendAuditLog(state, {
    actorId: published.publishedBy,
    action: "report_template_version.publish",
    objectType: "report_template_version",
    objectId: published.id
  });
  return jsonResponse(200, cloneReportPayload(published));
}

function statutoryFormulaCell(cellAddress, label, formulaText, accountCode, period, displayFormat = "currency") {
  const ast = parseFormulaArgs(formulaText);
  return {
    cellAddress,
    label,
    valueType: "formula",
    displayFormat,
    isEditable: false,
    formula: {
      formulaText,
      astJson: ast,
      dependenciesJson: [{ sourceType: "account_balance", accountCode, period }]
    }
  };
}

function statutoryReportPresetDefinitions(period) {
  return [
    {
      templateCode: "STAT-BS",
      templateName: "资产负债表",
      sheetCode: "BS",
      sheetName: "资产负债表",
      cells: [
        statutoryFormulaCell("B4", "货币资金", `CLOSING("1001", "${period}")`, "1001", period),
        statutoryFormulaCell("B5", "应收账款", `BAL("1122", "${period}", "debit")`, "1122", period),
        statutoryFormulaCell("B8", "资产合计", `CLOSING("1001", "${period}")`, "1001", period),
        statutoryFormulaCell("D4", "短期借款", `BAL("2001", "${period}", "credit")`, "2001", period),
        statutoryFormulaCell("D8", "负债和所有者权益合计", `BAL("3001", "${period}", "credit")`, "3001", period)
      ]
    },
    {
      templateCode: "STAT-IS",
      templateName: "利润表",
      sheetCode: "IS",
      sheetName: "利润表",
      cells: [
        statutoryFormulaCell("B4", "营业收入", `AMT("6001", "${period}")`, "6001", period),
        statutoryFormulaCell("B5", "营业成本", `AMT("6401", "${period}")`, "6401", period),
        statutoryFormulaCell("B8", "利润总额", `AMT("6001", "${period}")`, "6001", period)
      ]
    },
    {
      templateCode: "STAT-CF",
      templateName: "现金流量表",
      sheetCode: "CF",
      sheetName: "现金流量表",
      cells: [
        statutoryFormulaCell("B4", "销售商品、提供劳务收到的现金", `AMT("1002", "${period}")`, "1002", period),
        statutoryFormulaCell("B5", "购买商品、接受劳务支付的现金", `AMT("1002", "${period}")`, "1002", period),
        statutoryFormulaCell("B8", "现金及现金等价物净增加额", `CLOSING("1001", "${period}")`, "1001", period)
      ]
    },
    {
      templateCode: "STAT-OE",
      templateName: "所有者权益变动表",
      sheetCode: "OE",
      sheetName: "所有者权益变动表",
      cells: [
        statutoryFormulaCell("B4", "实收资本", `BAL("3001", "${period}", "credit")`, "3001", period),
        statutoryFormulaCell("B5", "资本公积", `BAL("3002", "${period}", "credit")`, "3002", period),
        statutoryFormulaCell("B6", "未分配利润", `BAL("3104", "${period}", "credit")`, "3104", period)
      ]
    }
  ];
}

async function createStatutoryReportPresets(state, body, actorId) {
  if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
    throw new Error("accountSetId is required.");
  }
  if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
    return accountSetAccessError(state, actorId, body.accountSetId);
  }
  const period = body.effectiveFromPeriod ?? reportPeriodKey(new Date().getFullYear(), 1);
  const templates = [];
  let createdCount = 0;

  for (const preset of statutoryReportPresetDefinitions(period)) {
    const existing = [...state.reportTemplates.values()].find(
      (template) => template.accountSetId === body.accountSetId && template.templateCode === preset.templateCode
    );
    if (existing) {
      templates.push({ ...publicReportTemplate(existing, [...state.reportTemplateVersions.values()]), created: false });
      continue;
    }

    const templateId = `report-template:${state.reportTemplates.size + 1}`;
    const template = {
      id: templateId,
      accountSetId: body.accountSetId,
      templateCode: preset.templateCode,
      templateName: preset.templateName,
      reportType: "statutory",
      status: "draft",
      latestVersionNo: 0,
      publishedVersionId: null,
      createdBy: body.createdBy ?? actorId,
      createdAt: "now",
      updatedAt: "now"
    };
    state.reportTemplates.set(template.id, template);
    appendAuditLog(state, {
      actorId: template.createdBy,
      action: "report_template.create",
      objectType: "report_template",
      objectId: template.id
    });

    const versionId = `report-template-version:${state.reportTemplateVersions.size + 1}`;
    const draftVersion = {
      id: versionId,
      templateId: template.id,
      versionNo: 1,
      versionName: `${preset.templateName} 法定预置版`,
      status: "draft",
      effectiveFromPeriod: period,
      layoutJson: { preset: "statutory", columnWidths: { A: 180, B: 140, C: 48, D: 180, E: 140 } },
      createdBy: body.createdBy ?? actorId,
      createdAt: "now",
      publishedBy: null,
      publishedAt: null,
      sheets: normalizeReportVersionSheets(state, versionId, [
        {
          sheetCode: preset.sheetCode,
          sheetName: preset.sheetName,
          rowCount: 80,
          columnCount: 8,
          cells: preset.cells
        }
      ])
    };
    const publishedVersion = {
      ...draftVersion,
      status: "published",
      publishedBy: body.createdBy ?? actorId,
      publishedAt: "now"
    };
    state.reportTemplateVersions.set(publishedVersion.id, publishedVersion);
    const activeTemplate = {
      ...template,
      status: "active",
      latestVersionNo: 1,
      publishedVersionId: publishedVersion.id,
      updatedAt: "now"
    };
    state.reportTemplates.set(activeTemplate.id, activeTemplate);
    appendAuditLog(state, {
      actorId: publishedVersion.publishedBy,
      action: "report_template_version.publish",
      objectType: "report_template_version",
      objectId: publishedVersion.id
    });
    templates.push({ ...publicReportTemplate(activeTemplate, [...state.reportTemplateVersions.values()]), created: true });
    createdCount += 1;
  }

  return jsonResponse(createdCount > 0 ? 201 : 200, {
    accountSetId: body.accountSetId,
    effectiveFromPeriod: period,
    templates
  });
}

function reportPeriodKey(fiscalYear, periodNo) {
  return `${fiscalYear}-${String(periodNo).padStart(2, "0")}`;
}

function parseReportPeriod(period) {
  if (typeof period !== "string") {
    return null;
  }
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return {
    fiscalYear: Number(match[1]),
    periodNo: Number(match[2])
  };
}

function parseFormulaArgs(formulaText) {
  const match = String(formulaText ?? "").match(/^([A-Z_]+)\((.*)\)$/);
  if (!match) {
    return { name: "TEXT", args: [] };
  }
  const args = match[2]
    .split(",")
    .map((arg) => arg.trim().replace(/^"|"$/g, ""))
    .filter((arg) => arg !== "");
  return { name: match[1], args };
}

function balanceLookupKey(accountCode, fiscalYear, periodNo) {
  return `${accountCode}:${fiscalYear}:${periodNo}`;
}

function reportCellLookupKey(sheetCode, cellAddress) {
  return `${sheetCode}!${cellAddress}`;
}

function parseReportCellReference(token) {
  const match = String(token ?? "").trim().match(/^([A-Za-z][A-Za-z0-9_]*)!([A-Za-z]+[0-9]+)$/);
  if (!match) {
    return null;
  }
  return {
    sheetCode: match[1],
    cellAddress: match[2].toUpperCase()
  };
}

function buildReportBalanceLookup(balances, dependencies, fallbackPeriod) {
  const requested = new Set();
  for (const dependency of dependencies) {
    if (dependency.sourceType !== "account_balance" || !dependency.accountCode) {
      continue;
    }
    const period = parseReportPeriod(dependency.period) ?? fallbackPeriod;
    requested.add(balanceLookupKey(dependency.accountCode, period.fiscalYear, period.periodNo));
  }

  const lookup = new Map();
  for (const balance of balances) {
    const key = balanceLookupKey(balance.accountCode ?? balance.accountId, balance.fiscalYear, balance.periodNo);
    if (requested.size === 0 || requested.has(key)) {
      lookup.set(key, balance);
    }
  }
  return lookup;
}

function calculateReportCellExpression(formulaText, cellLookup) {
  const expression = String(formulaText ?? "").trim();
  if (!expression || !/[A-Za-z][A-Za-z0-9_]*![A-Za-z]+[0-9]+/.test(expression)) {
    return null;
  }
  const tokens = expression.match(/[+-]|[A-Za-z][A-Za-z0-9_]*![A-Za-z]+[0-9]+|-?\d+(?:\.\d+)?/g);
  if (!tokens || tokens.join("").replace(/\s/g, "") !== expression.replace(/\s/g, "")) {
    return null;
  }

  let operator = 1;
  let total = 0;
  const references = [];
  for (const token of tokens) {
    if (token === "+") {
      operator = 1;
      continue;
    }
    if (token === "-") {
      operator = -1;
      continue;
    }
    const reference = parseReportCellReference(token);
    if (reference) {
      const key = reportCellLookupKey(reference.sheetCode, reference.cellAddress);
      const value = Number(cellLookup.get(key)?.calculatedValue ?? 0);
      total += operator * value;
      references.push({ ...reference, sourceCell: key, amount: operator * value });
      operator = 1;
      continue;
    }
    total += operator * Number(token);
    operator = 1;
  }

  return { value: total, references };
}

function calculateFormulaValue(formulaText, dependencies, balanceLookup, fallbackPeriod, cellLookup = new Map()) {
  const cellExpression = calculateReportCellExpression(formulaText, cellLookup);
  if (cellExpression) {
    return cellExpression.value;
  }

  const { name, args } = parseFormulaArgs(formulaText);
  const accountCode = args[0] ?? dependencies?.[0]?.accountCode;
  const period = parseReportPeriod(args[1]) ?? parseReportPeriod(dependencies?.[0]?.period) ?? fallbackPeriod;
  const balance = balanceLookup.get(balanceLookupKey(accountCode, period.fiscalYear, period.periodNo));
  if (!balance) {
    return 0;
  }

  if (name === "AMT") {
    return Number(balance.periodDebit ?? 0) - Number(balance.periodCredit ?? 0);
  }
  if (name === "OPENING") {
    return Number(balance.openingDebit ?? 0) - Number(balance.openingCredit ?? 0);
  }
  if (name === "BAL" || name === "AUX_BAL") {
    const direction = args[2] ?? "debit";
    return direction === "credit"
      ? Number(balance.closingCredit ?? 0) - Number(balance.closingDebit ?? 0)
      : Number(balance.closingDebit ?? 0) - Number(balance.closingCredit ?? 0);
  }
  if (name === "CLOSING") {
    return Number(balance.closingDebit ?? 0) - Number(balance.closingCredit ?? 0);
  }
  return 0;
}

function traceLinksForReportCellReferences({ runId, traceId, formulaText, cellLookup, startIndex }) {
  const cellExpression = calculateReportCellExpression(formulaText, cellLookup);
  if (!cellExpression) {
    return [];
  }
  return cellExpression.references.map((reference, index) => ({
    id: `report-trace-link:${runId}:${startIndex + index + 1}`,
    reportRunId: runId,
    traceId,
    sourceType: "report_cell",
    sourceCell: reference.sourceCell,
    sheetCode: reference.sheetCode,
    cellAddress: reference.cellAddress,
    accountCode: null,
    fiscalYear: null,
    periodNo: null,
    amount: reference.amount
  }));
}

function reportSnapshotHash(run) {
  return `sha256:${createHash("sha256").update(JSON.stringify(run.cells)).digest("hex")}`;
}

function reportRunRenderMode(run) {
  return run.status === "locked" || run.status === "archived" || run.lockedAt ? "snapshot" : "calculated";
}

function publicReportRun(run) {
  return cloneReportPayload({
    ...run,
    renderMode: reportRunRenderMode(run)
  });
}

function findReportRunByIdentifier(state, identifier) {
  return [...state.reportRuns.values()].find((run) => run.id === identifier);
}

function findReportTemplateForRun(state, run) {
  const version = run ? findReportTemplateVersionByIdentifier(state, run.templateVersionId) : null;
  return version ? state.reportTemplates.get(version.templateId) : null;
}

function isCashFlowReportTemplate(template) {
  const text = `${template?.reportType ?? ""} ${template?.templateCode ?? ""} ${template?.templateName ?? ""}`.toLowerCase();
  return text.includes("cash_flow") || text.includes("cash-flow") || text.includes("cashflow") || text.includes("现金流");
}

function parseAuxiliarySnapshot(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
}

function hasCashFlowAssignment(entry) {
  const snapshot = parseAuxiliarySnapshot(entry.auxiliarySnapshot ?? entry.auxiliarySnapshotJson);
  return [
    "cashFlowItemId",
    "cashFlowItemCode",
    "cashFlowProjectId",
    "cashFlowStatementItem",
    "cashFlowTag",
    "cash_flow_item_id",
    "cash_flow_item_code"
  ].some((key) => typeof snapshot[key] === "string" && snapshot[key].trim() !== "");
}

async function detectUnassignedCashFlowExceptions(state, run) {
  const template = findReportTemplateForRun(state, run);
  if (!isCashFlowReportTemplate(template)) {
    return [];
  }

  const accounts = state.config.platformStore?.listAccounts
    ? await state.config.platformStore.listAccounts(run.accountSetId)
    : listAccounts(state).filter((account) => account.accountSetId === run.accountSetId);
  const cashAccounts = new Map(
    accounts
      .filter((account) => account.isCash || account.isBank)
      .map((account) => [account.code ?? account.id, account])
  );
  if (cashAccounts.size === 0) {
    return [];
  }

  const journalEntries = state.config.platformStore?.listJournalEntries
    ? await state.config.platformStore.listJournalEntries(run.accountSetId)
    : state.journalEntries;
  return journalEntries
    .filter(
      (entry) =>
        entry.accountSetId === run.accountSetId &&
        entry.fiscalYear === run.fiscalYear &&
        entry.periodNo === run.periodNo &&
        cashAccounts.has(entry.accountCode ?? entry.accountId) &&
        !hasCashFlowAssignment(entry)
    )
    .map((entry, index) => {
      const account = cashAccounts.get(entry.accountCode ?? entry.accountId);
      const debitAmount = Number(entry.debit ?? entry.debitAmount ?? 0);
      const creditAmount = Number(entry.credit ?? entry.creditAmount ?? 0);
      return {
        id: `report-exception:${run.id}:${index + 1}`,
        exceptionCode: "REPORT_CASH_FLOW_UNASSIGNED",
        severity: "blocking",
        highlight: "未分配异常现金流",
        message: "现金流量表存在涉及现金或银行科目但未挂载现金流项目的凭证分录，必须补录后才能提交或锁定。",
        reportRunId: run.id,
        accountCode: account?.code ?? entry.accountCode ?? entry.accountId,
        accountName: account?.name ?? null,
        voucherId: entry.voucherId ?? null,
        voucherLineNo: entry.voucherLineNo ?? null,
        amount: Math.abs(debitAmount - creditAmount),
        fiscalYear: entry.fiscalYear,
        periodNo: entry.periodNo
      };
    });
}

async function cashFlowAssignmentErrorForRun(state, run) {
  const exceptions = await detectUnassignedCashFlowExceptions(state, run);
  if (exceptions.length === 0) {
    return null;
  }
  return errorResponse(
    409,
    "REPORT_CASH_FLOW_UNASSIGNED",
    "Cash-flow reports cannot be submitted or locked while cash or bank entries lack cash-flow item assignments.",
    { exceptions }
  );
}

async function buildReportCellDrilldown(state, runId, cellAddress, actorId) {
  const run = findReportRunByIdentifier(state, runId);
  if (!run) {
    return errorResponse(404, "REPORT_RUN_NOT_FOUND", "Report run was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) {
    return accountSetAccessError(state, actorId, run.accountSetId);
  }

  const requestedCellAddress = decodeURIComponent(cellAddress);
  const cell = (run.cells ?? []).find(
    (item) => item.cellAddress === requestedCellAddress || `${item.sheetCode}!${item.cellAddress}` === requestedCellAddress
  );
  if (!cell) {
    return errorResponse(404, "REPORT_RUN_CELL_NOT_FOUND", "Report run cell was not found.");
  }

  const traceLinks = (run.traceLinks ?? []).filter((link) => link.traceId === cell.traceId);
  const sourceBalances = traceLinks.map((link) => ({
    sourceType: link.sourceType,
    sourceDocumentId: link.sourceDocumentId ?? null,
    accountCode: link.accountCode ?? null,
    fiscalYear: link.fiscalYear,
    periodNo: link.periodNo,
    snapshotAmount: Number(link.amount ?? 0)
  }));
  const tracedAccountCodes = new Set(traceLinks.map((link) => link.accountCode).filter(Boolean));
  const tracedPeriods = new Set(traceLinks.map((link) => `${link.fiscalYear}:${link.periodNo}`));
  const journalEntries = state.config.platformStore?.listJournalEntries
    ? await state.config.platformStore.listJournalEntries(run.accountSetId)
    : state.journalEntries;
  const ledgerEntries = journalEntries.filter(
    (entry) =>
      entry.accountSetId === run.accountSetId &&
      tracedAccountCodes.has(entry.accountCode) &&
      tracedPeriods.has(`${entry.fiscalYear}:${entry.periodNo}`)
  );
  const voucherIds = [...new Set(ledgerEntries.map((entry) => entry.voucherId).filter(Boolean))];
  const vouchers = state.config.platformStore?.listVouchers
    ? (await state.config.platformStore.listVouchers(run.accountSetId)).filter((voucher) => voucherIds.includes(voucher.id))
    : voucherIds.map((voucherId) => state.vouchers.get(voucherId)).filter(Boolean);

  return jsonResponse(200, cloneReportPayload({
    reportRunId: run.id,
    renderMode: reportRunRenderMode(run),
    snapshotHash: run.snapshotHash,
    cell,
    traceLinks,
    sourceBalances,
    ledgerEntries,
    vouchers
  }));
}

function reportPeriodClosed(state, accountSetId, fiscalYear, periodNo) {
  const period = [...state.periods.values()].find(
    (row) => row.accountSetId === accountSetId && row.fiscalYear === fiscalYear && row.periodNo === periodNo
  );
  return String(period?.status ?? "").toLowerCase() === "closed";
}

function formalReportForcesPostedOnly(template, runMode) {
  const reportType = String(template?.reportType ?? "").toLowerCase();
  return String(runMode ?? "formal") === "formal" && ["statutory", "cash_flow"].includes(reportType);
}

async function reportBalancesForSnapshot(state, { accountSetId, fiscalYear, periodNo, balances, includeUnposted }) {
  const rows = balances.filter((balance) => balance.accountSetId === accountSetId).map((balance) => ({ ...balance }));
  if (!includeUnposted) {
    return rows;
  }

  const byKey = new Map(rows.map((balance) => [balanceLookupKey(balance.accountCode ?? balance.accountId, balance.fiscalYear, balance.periodNo), balance]));
  const vouchers = state.config.platformStore?.listVouchers
    ? await state.config.platformStore.listVouchers(accountSetId)
    : [...state.vouchers.values()];
  for (const voucher of vouchers) {
    if (
      voucher.accountSetId !== accountSetId ||
      Number(voucher.fiscalYear) !== Number(fiscalYear) ||
      Number(voucher.periodNo) !== Number(periodNo) ||
      ["posted", "voided"].includes(String(voucher.status ?? "").toLowerCase())
    ) {
      continue;
    }
    for (const line of voucher.lines ?? []) {
      const accountCode = line.accountCode ?? line.accountId;
      if (!accountCode) {
        continue;
      }
      const key = balanceLookupKey(accountCode, fiscalYear, periodNo);
      const balance =
        byKey.get(key) ??
        {
          accountSetId,
          fiscalYear,
          periodNo,
          accountCode,
          accountName: line.accountName ?? null,
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: 0,
          periodCredit: 0,
          closingDebit: 0,
          closingCredit: 0
        };
      balance.periodDebit = Number(balance.periodDebit ?? 0) + Number(line.debit ?? line.debitAmount ?? 0);
      balance.periodCredit = Number(balance.periodCredit ?? 0) + Number(line.credit ?? line.creditAmount ?? 0);
      balance.closingDebit = Number(balance.closingDebit ?? 0) + Number(line.debit ?? line.debitAmount ?? 0);
      balance.closingCredit = Number(balance.closingCredit ?? 0) + Number(line.credit ?? line.creditAmount ?? 0);
      if (!byKey.has(key)) {
        byKey.set(key, balance);
        rows.push(balance);
      }
    }
  }
  return rows;
}

async function calculateReportRunSnapshot(state, { runId, accountSetId, templateVersion, fiscalYear, periodNo, includeUnposted = false }) {
  const balances = state.config.platformStore?.listAccountPeriodBalances
    ? await state.config.platformStore.listAccountPeriodBalances(accountSetId)
    : state.balances;
  const snapshotBalances = await reportBalancesForSnapshot(state, {
    accountSetId,
    fiscalYear,
    periodNo,
    balances,
    includeUnposted
  });
  const fallbackPeriod = { fiscalYear, periodNo };
  const formulaCells = templateVersion.sheets.flatMap((sheet) =>
    sheet.cells
      .filter((cell) => cell.formula)
      .map((cell) => ({
        sheet,
        cell,
        formula: cell.formula,
        dependencies: cell.formula.dependenciesJson ?? []
      }))
  );
  const allDependencies = formulaCells.flatMap((cell) => cell.dependencies);
  const balanceLookup = buildReportBalanceLookup(
    snapshotBalances,
    allDependencies,
    fallbackPeriod
  );

  const cells = [];
  const cellLookup = new Map();
  for (const item of formulaCells) {
    const calculatedValue = calculateFormulaValue(item.formula.formulaText, item.dependencies, balanceLookup, fallbackPeriod, cellLookup);
    const traceId = `report-trace:${runId}:${item.sheet.sheetCode}:${item.cell.cellAddress}`;
    const runCell = {
      id: `report-run-cell:${runId}:${cells.length + 1}`,
      reportRunId: runId,
      sheetCode: item.sheet.sheetCode,
      cellAddress: item.cell.cellAddress,
      label: item.cell.label ?? null,
      formulaText: item.formula.formulaText,
      calculatedValue,
      displayFormat: item.cell.displayFormat ?? null,
      traceId
    };
    cells.push(runCell);
    cellLookup.set(reportCellLookupKey(item.sheet.sheetCode, item.cell.cellAddress), runCell);
  }

  for (let pass = 0; pass < formulaCells.length; pass += 1) {
    let changed = false;
    for (const item of formulaCells) {
      if (!calculateReportCellExpression(item.formula.formulaText, cellLookup)) {
        continue;
      }
      const key = reportCellLookupKey(item.sheet.sheetCode, item.cell.cellAddress);
      const runCell = cellLookup.get(key);
      const calculatedValue = calculateFormulaValue(item.formula.formulaText, item.dependencies, balanceLookup, fallbackPeriod, cellLookup);
      if (runCell && runCell.calculatedValue !== calculatedValue) {
        runCell.calculatedValue = calculatedValue;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  const traceLinks = [];
  for (const item of formulaCells) {
    const runCell = cellLookup.get(reportCellLookupKey(item.sheet.sheetCode, item.cell.cellAddress));
    const calculatedValue = Number(runCell?.calculatedValue ?? 0);
    const traceId = runCell?.traceId ?? `report-trace:${runId}:${item.sheet.sheetCode}:${item.cell.cellAddress}`;
    for (const dependency of item.dependencies) {
      if ((dependency.sourceType ?? "account_balance") !== "account_balance") {
        continue;
      }
      const period = parseReportPeriod(dependency.period) ?? fallbackPeriod;
      traceLinks.push({
        id: `report-trace-link:${runId}:${traceLinks.length + 1}`,
        reportRunId: runId,
        traceId,
        sourceType: dependency.sourceType ?? "account_balance",
        sourceDocumentId: dependency.sourceDocumentId ?? null,
        accountCode: dependency.accountCode ?? null,
        fiscalYear: period.fiscalYear,
        periodNo: period.periodNo,
        amount: calculatedValue
      });
    }
    traceLinks.push(
      ...traceLinksForReportCellReferences({
        runId,
        traceId,
        formulaText: item.formula.formulaText,
        cellLookup,
        startIndex: traceLinks.length
      })
    );
  }

  return { cells, traceLinks };
}

async function createReportRun(state, body, actorId) {
  for (const field of ["accountSetId", "templateVersionId"]) {
    if (typeof body[field] !== "string" || body[field].trim() === "") {
      throw new Error(`${field} is required.`);
    }
  }
  if (!Number.isInteger(body.fiscalYear)) {
    throw new Error("fiscalYear is required.");
  }
  if (!Number.isInteger(body.periodNo)) {
    throw new Error("periodNo is required.");
  }
  if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
    return accountSetAccessError(state, actorId, body.accountSetId);
  }
  if (reportPeriodClosed(state, body.accountSetId, body.fiscalYear, body.periodNo)) {
    return errorResponse(409, "REPORT_PERIOD_CLOSED", "Closed accounting periods cannot be recalculated by the report engine.");
  }
  const templateVersion = findReportTemplateVersionByIdentifier(state, body.templateVersionId);
  if (!templateVersion) {
    return errorResponse(404, "REPORT_TEMPLATE_VERSION_NOT_FOUND", "Report template version was not found.");
  }
  if (templateVersion.status !== "published") {
    return errorResponse(409, "REPORT_TEMPLATE_VERSION_NOT_PUBLISHED", "Only published report template versions can be run.");
  }
  const template = state.reportTemplates.get(templateVersion.templateId);
  const runMode = body.runMode ?? "formal";
  const includeUnposted = formalReportForcesPostedOnly(template, runMode) ? false : Boolean(body.includeUnposted);

  const runId = `report-run:${state.reportRuns.size + 1}`;
  const snapshot = await calculateReportRunSnapshot(state, {
    runId,
    accountSetId: body.accountSetId,
    templateVersion,
    fiscalYear: body.fiscalYear,
    periodNo: body.periodNo,
    includeUnposted
  });
  const run = {
    id: runId,
    accountSetId: body.accountSetId,
    templateVersionId: body.templateVersionId,
    fiscalYear: body.fiscalYear,
    periodNo: body.periodNo,
    includeUnposted,
    runMode,
    status: "calculated",
    snapshotHash: "pending",
    paramsJson: {
      periodKey: reportPeriodKey(body.fiscalYear, body.periodNo)
    },
    createdBy: body.createdBy ?? actorId,
    createdAt: "now",
    recalculatedAt: null,
    lockedBy: null,
    lockedAt: null,
    cells: snapshot.cells,
    traceLinks: snapshot.traceLinks
  };
  run.snapshotHash = reportSnapshotHash(run);
  state.reportRuns.set(run.id, run);
  appendAuditLog(state, {
    actorId: run.createdBy,
    action: "report_run.create",
    objectType: "report_run",
    objectId: run.id
  });
  return jsonResponse(201, publicReportRun(run));
}

async function recalculateReportRun(state, runId, body, actorId) {
  const run = findReportRunByIdentifier(state, runId);
  if (!run) {
    return errorResponse(404, "REPORT_RUN_NOT_FOUND", "Report run was not found.");
  }
  if (run.status === "locked" || run.status === "archived" || run.lockedAt) {
    return errorResponse(409, "REPORT_RUN_LOCKED", "Locked or archived report runs must render from stored snapshots only.");
  }
  if (reportPeriodClosed(state, run.accountSetId, run.fiscalYear, run.periodNo)) {
    return errorResponse(409, "REPORT_PERIOD_CLOSED", "Closed accounting periods cannot be recalculated by the report engine.");
  }
  if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) {
    return accountSetAccessError(state, actorId, run.accountSetId);
  }
  const templateVersion = findReportTemplateVersionByIdentifier(state, run.templateVersionId);
  if (!templateVersion) {
    return errorResponse(404, "REPORT_TEMPLATE_VERSION_NOT_FOUND", "Report template version was not found.");
  }
  const snapshot = await calculateReportRunSnapshot(state, {
    runId: run.id,
    accountSetId: run.accountSetId,
    templateVersion,
    fiscalYear: run.fiscalYear,
    periodNo: run.periodNo,
    includeUnposted: run.includeUnposted
  });
  const updated = {
    ...run,
    status: "calculated",
    recalculatedAt: "now",
    cells: snapshot.cells,
    traceLinks: snapshot.traceLinks
  };
  updated.snapshotHash = reportSnapshotHash(updated);
  state.reportRuns.set(updated.id, updated);
  appendAuditLog(state, {
    actorId: body.recalculatedBy ?? actorId,
    action: "report_run.recalculate",
    objectType: "report_run",
    objectId: updated.id
  });
  return jsonResponse(200, publicReportRun(updated));
}

async function lockReportRun(state, runId, body, actorId) {
  const run = findReportRunByIdentifier(state, runId);
  if (!run) {
    return errorResponse(404, "REPORT_RUN_NOT_FOUND", "Report run was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) {
    return accountSetAccessError(state, actorId, run.accountSetId);
  }
  const cashFlowError = await cashFlowAssignmentErrorForRun(state, run);
  if (cashFlowError) return cashFlowError;
  const locked = {
    ...run,
    status: "locked",
    lockedBy: body.lockedBy ?? actorId,
    lockedAt: "now"
  };
  state.reportRuns.set(locked.id, locked);
  appendAuditLog(state, {
    actorId: locked.lockedBy,
    action: "report_run.lock",
    objectType: "report_run",
    objectId: locked.id
  });
  return jsonResponse(200, publicReportRun(locked));
}

function publicReportApproval(approval, reportRun = null) {
  return cloneReportPayload({
    ...approval,
    exceptions: parseAuxiliarySnapshot(approval.exceptionsJson ?? []),
    reportRun: reportRun ? publicReportRun(reportRun) : undefined
  });
}

function findReportApprovalByIdentifier(state, identifier) {
  return [...state.reportApprovals.values()].find((approval) => approval.id === identifier);
}

async function submitReportRunReview(state, runId, body, actorId) {
  const run = findReportRunByIdentifier(state, runId);
  if (!run) {
    return errorResponse(404, "REPORT_RUN_NOT_FOUND", "Report run was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) {
    return accountSetAccessError(state, actorId, run.accountSetId);
  }
  if (run.status === "locked" || run.status === "archived" || run.lockedAt) {
    return errorResponse(409, "REPORT_RUN_LOCKED", "Locked or archived report runs cannot be submitted for review.");
  }
  const cashFlowError = await cashFlowAssignmentErrorForRun(state, run);
  if (cashFlowError) return cashFlowError;

  const existing = [...state.reportApprovals.values()].find(
    (approval) => approval.reportRunId === run.id && approval.status === "pending"
  );
  if (existing) {
    return errorResponse(409, "REPORT_APPROVAL_PENDING", "Report run already has a pending approval.");
  }
  const exceptions = await detectUnassignedCashFlowExceptions(state, run);
  const approval = {
    id: `report-approval:${state.reportApprovals.size + 1}`,
    accountSetId: run.accountSetId,
    reportRunId: run.id,
    status: "pending",
    submittedBy: body.submittedBy ?? actorId,
    submittedAt: "now",
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    reviewComment: body.reviewComment ?? null,
    exceptionCount: exceptions.length,
    exceptionsJson: exceptions
  };
  const pendingRun = { ...run, status: "pending_review" };
  state.reportRuns.set(run.id, pendingRun);
  state.reportApprovals.set(approval.id, approval);
  appendAuditLog(state, {
    actorId: approval.submittedBy,
    action: "report_approval.submit",
    objectType: "report_approval",
    objectId: approval.id
  });
  return jsonResponse(201, publicReportApproval(approval, pendingRun));
}

async function approveReportApproval(state, approvalId, body, actorId) {
  const approval = findReportApprovalByIdentifier(state, approvalId);
  if (!approval) {
    return errorResponse(404, "REPORT_APPROVAL_NOT_FOUND", "Report approval was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, approval.accountSetId))) {
    return accountSetAccessError(state, actorId, approval.accountSetId);
  }
  if (approval.status !== "pending") {
    return errorResponse(409, "REPORT_APPROVAL_STATUS_INVALID", "Only pending report approvals can be approved.");
  }
  const lock = await lockReportRun(state, approval.reportRunId, { lockedBy: body.approvedBy ?? actorId }, actorId);
  if (lock.status !== 200) return lock;

  const approved = {
    ...approval,
    status: "approved",
    approvedBy: body.approvedBy ?? actorId,
    approvedAt: "now",
    reviewComment: body.reviewComment ?? approval.reviewComment
  };
  state.reportApprovals.set(approved.id, approved);
  appendAuditLog(state, {
    actorId: approved.approvedBy,
    action: "report_approval.approve",
    objectType: "report_approval",
    objectId: approved.id
  });
  return jsonResponse(200, publicReportApproval(approved, findReportRunByIdentifier(state, approval.reportRunId)));
}

function publicAiReportInterpretation(interpretation) {
  return cloneReportPayload(interpretation);
}

function reportCellEvidenceRef(cell) {
  return `report_cell:${cell.sheetCode}!${cell.cellAddress}`;
}

function isInFiscalPeriod(row, fiscalYear, periodNo, dateField = null) {
  if (Number(row.fiscalYear) === Number(fiscalYear) && Number(row.periodNo) === Number(periodNo)) {
    return true;
  }
  if (!dateField || !row[dateField]) {
    return false;
  }
  const periodKey = `${fiscalYear}-${String(periodNo).padStart(2, "0")}`;
  return String(row[dateField]).startsWith(periodKey);
}

function cashLikeAccountCodes(state, accountSetId) {
  const configuredCodes = listAccounts(state)
    .filter((account) => account.accountSetId === accountSetId && (account.isCash || account.isBank))
    .map((account) => account.code);
  return new Set([...configuredCodes, "1001", "1002"]);
}

function metric(key, label, amount, count, sourceType, path, extra = {}) {
  return {
    key,
    label,
    amount: roundAmount(amount),
    count,
    drilldown: { sourceType, path },
    ...extra
  };
}

function dashboardCard(key, label, count, path, severity = "normal") {
  return {
    key,
    label,
    count,
    severity,
    drilldown: { path }
  };
}

function rowsForAccountSet(map, accountSetId) {
  return [...map.values()].filter((row) => row.accountSetId === accountSetId);
}

function buildSupplyChainDashboard(state, { accountSetId, fiscalYear, periodNo, asOfDate }) {
  const periodPath = `accountSetId=${accountSetId}&fiscalYear=${fiscalYear}&periodNo=${periodNo}`;
  const openStatuses = new Set(["draft", "submitted", "approved", "released", "in_progress"]);
  const purchaseOrders = rowsForAccountSet(state.purchaseOrders, accountSetId).filter((order) =>
    isInFiscalPeriod(order, fiscalYear, periodNo, "orderDate")
  );
  const salesOrders = rowsForAccountSet(state.salesOrders, accountSetId).filter((order) =>
    isInFiscalPeriod(order, fiscalYear, periodNo, "orderDate")
  );
  const inventoryBalances = rowsForAccountSet(state.inventoryBalances, accountSetId);
  const workOrders = rowsForAccountSet(state.workOrders, accountSetId).filter(
    (workOrder) =>
      isInFiscalPeriod(workOrder, fiscalYear, periodNo, "plannedStartDate") ||
      isInFiscalPeriod(workOrder, fiscalYear, periodNo, "plannedFinishDate")
  );
  const materialRequisitions = rowsForAccountSet(state.materialRequisitions, accountSetId);
  const productReceipts = rowsForAccountSet(state.productReceipts, accountSetId);
  const agentActions = rowsForAccountSet(state.agentActions, accountSetId);

  const pendingOrders = [...purchaseOrders, ...salesOrders].filter((order) => openStatuses.has(order.status));
  const purchaseOverdue = purchaseOrders.filter(
    (order) => openStatuses.has(order.status) && daysPastDue(order.expectedDeliveryDate ?? order.deliveryDate, asOfDate) > 0
  );
  const availableToDeliverOrders = salesOrders.filter((order) => ["approved", "released"].includes(order.status));
  const inventoryExceptions = inventoryBalances.filter(
    (balance) => Number(balance.quantity ?? 0) < 0 || Number(balance.lockedQuantity ?? 0) > Number(balance.quantity ?? 0)
  );
  const materialShortages = inventoryExceptions.filter((balance) => Number(balance.quantity ?? 0) < 0);
  const workOrdersToIssue = workOrders.filter((workOrder) => workOrder.status === "released");
  const workOrdersToReceive = workOrders.filter((workOrder) => workOrder.status === "in_progress");
  const pendingMaterialRequisitions = materialRequisitions.filter((requisition) =>
    ["draft", "submitted", "approved"].includes(requisition.status)
  );
  const costPending = productReceipts.filter((receipt) => !["locked", "allocated", "closed"].includes(receipt.costStatus ?? "pending"));
  const pendingAgentApprovals = agentActions.filter((action) => ["submitted_for_approval", "approved"].includes(action.status));

  const summary = {
    pendingOrders: dashboardCard("pendingOrders", "待处理订单", pendingOrders.length, `/purchase-orders?${periodPath}`),
    materialShortages: dashboardCard(
      "materialShortages",
      "缺料预警",
      materialShortages.length,
      `/inventory-ledger?${periodPath}`,
      materialShortages.length > 0 ? "warning" : "normal"
    ),
    purchaseOverdue: dashboardCard(
      "purchaseOverdue",
      "采购逾期",
      purchaseOverdue.length,
      `/purchase-orders?${periodPath}`,
      purchaseOverdue.length > 0 ? "warning" : "normal"
    ),
    availableToDeliverOrders: dashboardCard(
      "availableToDeliverOrders",
      "可发货订单",
      availableToDeliverOrders.length,
      `/sales-orders?${periodPath}`
    ),
    inventoryExceptions: dashboardCard(
      "inventoryExceptions",
      "库存异常",
      inventoryExceptions.length,
      `/inventory-ledger?${periodPath}`,
      inventoryExceptions.length > 0 ? "warning" : "normal"
    ),
    workOrdersToIssue: dashboardCard("workOrdersToIssue", "待领料工单", workOrdersToIssue.length, `/work-orders?${periodPath}`),
    workOrdersToReceive: dashboardCard("workOrdersToReceive", "待完工工单", workOrdersToReceive.length, `/work-orders?${periodPath}`),
    costPending: dashboardCard(
      "costPending",
      "成本待处理",
      costPending.length,
      `/product-receipts?${periodPath}`,
      costPending.length > 0 ? "warning" : "normal"
    ),
    pendingAgentApprovals: dashboardCard(
      "pendingAgentApprovals",
      "Agent审批待办",
      pendingAgentApprovals.length,
      `/agent?${periodPath}`,
      pendingAgentApprovals.length > 0 ? "warning" : "normal"
    )
  };

  const agentSuggestions = [];
  if (materialShortages.length > 0) {
    agentSuggestions.push({
      code: "MATERIAL_SHORTAGE_REVIEW",
      title: "缺料复核",
      message: `发现 ${materialShortages.length} 条负库存或缺料风险，建议生成补料或采购建议草稿。`,
      riskLevel: "medium",
      suggestedTool: "suggest_material_requisition_draft",
      evidenceRefs: materialShortages.map((balance) => balance.id)
    });
  }
  if (purchaseOverdue.length > 0) {
    agentSuggestions.push({
      code: "PURCHASE_OVERDUE_FOLLOW_UP",
      title: "采购逾期跟进",
      message: `发现 ${purchaseOverdue.length} 张采购订单逾期，建议生成供应商跟进待办。`,
      riskLevel: "low",
      suggestedTool: "search_purchase_orders",
      evidenceRefs: purchaseOverdue.map((order) => order.id)
    });
  }

  return {
    accountSetId,
    fiscalYear: Number(fiscalYear),
    periodNo: Number(periodNo),
    asOfDate,
    summary,
    queues: {
      pendingOrders: pendingOrders.slice(0, 10),
      purchaseOverdue: purchaseOverdue.slice(0, 10),
      inventoryExceptions: inventoryExceptions.slice(0, 10),
      pendingMaterialRequisitions: pendingMaterialRequisitions.slice(0, 10),
      pendingAgentApprovals: pendingAgentApprovals.slice(0, 10)
    },
    workOrderProgress: {
      total: workOrders.length,
      released: workOrdersToIssue.length,
      inProgress: workOrdersToReceive.length,
      closed: workOrders.filter((workOrder) => ["closed", "completed"].includes(workOrder.status)).length
    },
    agentSuggestions
  };
}

function genericAgentActionDryRunResult(tool) {
  return {
    status: tool.approvalPolicy.approvalRequired ? "ready_for_approval" : "ready_for_execution",
    businessMutation: false,
    toolName: tool.name,
    actionKind: tool.actionKind,
    approvalPolicy: tool.approvalPolicy,
    impactSummary: "Agent action dry-run recorded. No business data was mutated."
  };
}

function inventoryAvailableQuantity(balance) {
  return roundQuantity(Number(balance.quantity ?? 0) - Number(balance.lockedQuantity ?? 0));
}

function inventoryAvailabilityByItem(state, accountSetId) {
  const availability = new Map();
  for (const balance of rowsForAccountSet(state.inventoryBalances, accountSetId)) {
    const itemCode = balance.itemCode;
    if (!itemCode) continue;
    const existing = availability.get(itemCode) ?? {
      itemId: balance.itemId ?? null,
      itemCode,
      itemName: balance.itemName ?? itemCode,
      availableQuantity: 0,
      balances: []
    };
    existing.availableQuantity = roundQuantity(existing.availableQuantity + inventoryAvailableQuantity(balance));
    existing.balances.push(balance);
    availability.set(itemCode, existing);
  }
  return availability;
}

function workOrderMaterialDemandRows(state, accountSetId, fiscalYear, periodNo) {
  const demandRows = [];
  const activeStatuses = new Set(["planned", "released", "in_progress"]);
  const workOrders = rowsForAccountSet(state.workOrders, accountSetId).filter(
    (workOrder) => activeStatuses.has(workOrder.status) && isInFiscalPeriod(workOrder, fiscalYear, periodNo)
  );
  for (const workOrder of workOrders) {
    const bom = state.boms.get(workOrder.bomId);
    if (!bom || bom.accountSetId !== accountSetId) continue;
    const yieldQuantity = Number(bom.yieldQuantity ?? 1) || 1;
    for (const line of bom.lines ?? []) {
      const grossQuantity = (Number(workOrder.plannedQuantity ?? 0) / yieldQuantity) * Number(line.quantity ?? 0);
      const scrapRate = Number(line.scrapRate ?? 0);
      const requiredQuantity = roundQuantity(scrapRate > 0 && scrapRate < 1 ? grossQuantity / (1 - scrapRate) : grossQuantity);
      demandRows.push({
        itemId: line.componentItemId,
        itemCode: line.componentItemCode,
        itemName: line.componentItemName,
        requiredQuantity,
        demandSource: {
          sourceType: "work_order",
          workOrderId: workOrder.id,
          workOrderNo: workOrder.workOrderNo,
          productItemCode: workOrder.productItemCode,
          plannedQuantity: workOrder.plannedQuantity
        }
      });
    }
  }
  return demandRows;
}

function buildMaterialShortageAnalysis(state, accountSetId, fiscalYear, periodNo) {
  const availability = inventoryAvailabilityByItem(state, accountSetId);
  const shortageByItem = new Map();
  for (const demand of workOrderMaterialDemandRows(state, accountSetId, fiscalYear, periodNo)) {
    const existing = shortageByItem.get(demand.itemCode) ?? {
      itemId: demand.itemId,
      itemCode: demand.itemCode,
      itemName: demand.itemName,
      requiredQuantity: 0,
      availableQuantity: availability.get(demand.itemCode)?.availableQuantity ?? 0,
      shortageQuantity: 0,
      reasonCode: "work_order_bom_demand",
      demandSources: []
    };
    existing.requiredQuantity = roundQuantity(existing.requiredQuantity + demand.requiredQuantity);
    existing.demandSources.push(demand.demandSource);
    shortageByItem.set(demand.itemCode, existing);
  }

  for (const shortage of shortageByItem.values()) {
    shortage.shortageQuantity = roundQuantity(Math.max(shortage.requiredQuantity - shortage.availableQuantity, 0));
  }

  for (const balance of rowsForAccountSet(state.inventoryBalances, accountSetId)) {
    const availableQuantity = inventoryAvailableQuantity(balance);
    if (availableQuantity >= 0) continue;
    const existing = shortageByItem.get(balance.itemCode);
    if (existing) {
      existing.availableQuantity = Math.min(existing.availableQuantity, availableQuantity);
      existing.shortageQuantity = roundQuantity(Math.max(existing.shortageQuantity, Math.abs(availableQuantity)));
      existing.reasonCode = "work_order_or_negative_inventory";
      continue;
    }
    shortageByItem.set(balance.itemCode, {
      itemId: balance.itemId ?? null,
      itemCode: balance.itemCode,
      itemName: balance.itemName ?? balance.itemCode,
      requiredQuantity: 0,
      availableQuantity,
      shortageQuantity: roundQuantity(Math.abs(availableQuantity)),
      reasonCode: "negative_inventory",
      demandSources: []
    });
  }

  return [...shortageByItem.values()]
    .filter((shortage) => shortage.shortageQuantity > 0)
    .sort((left, right) => right.shortageQuantity - left.shortageQuantity || left.itemCode.localeCompare(right.itemCode));
}

function buildInventoryAnomalyAnalysis(state, accountSetId) {
  const anomalies = [];
  for (const balance of rowsForAccountSet(state.inventoryBalances, accountSetId)) {
    const quantity = Number(balance.quantity ?? 0);
    const lockedQuantity = Number(balance.lockedQuantity ?? 0);
    const amount = Number(balance.amount ?? 0);
    if (quantity < 0) {
      anomalies.push({ ...balance, anomalyType: "negative_stock", severity: "high", recommendedAction: "review_stock_movement_chain" });
    }
    if (lockedQuantity > quantity) {
      anomalies.push({ ...balance, anomalyType: "locked_over_available", severity: "medium", recommendedAction: "release_or_correct_lock" });
    }
    if (quantity === 0 && amount !== 0) {
      anomalies.push({ ...balance, anomalyType: "zero_quantity_amount_residual", severity: "medium", recommendedAction: "run_cost_reconciliation" });
    }
    if (amount < 0) {
      anomalies.push({ ...balance, anomalyType: "negative_inventory_value", severity: "medium", recommendedAction: "review_cost_layer" });
    }
  }
  return anomalies;
}

function buildPurchaseSuggestionsFromShortages(materialShortages) {
  return materialShortages.map((shortage) => ({
    documentType: "purchase_suggestion",
    itemId: shortage.itemId ?? null,
    itemCode: shortage.itemCode,
    itemName: shortage.itemName,
    suggestedQuantity: shortage.shortageQuantity,
    reasonCode: "material_shortage",
    sourceDemandQuantity: shortage.requiredQuantity,
    availableQuantity: shortage.availableQuantity,
    demandSources: shortage.demandSources,
    requiresHumanConfirmation: true
  }));
}

function agentWorkOrdersForContext(state, accountSetId, fiscalYear, periodNo, sourceObjectId = null) {
  const activeStatuses = new Set(["planned", "released", "in_progress"]);
  const workOrders = rowsForAccountSet(state.workOrders, accountSetId).filter(
    (workOrder) => activeStatuses.has(workOrder.status) && isInFiscalPeriod(workOrder, fiscalYear, periodNo)
  );
  if (!sourceObjectId) return workOrders;
  const selected = workOrders.find((workOrder) => workOrder.id === sourceObjectId || workOrder.workOrderNo === sourceObjectId);
  return selected ? [selected] : workOrders;
}

function bomMaterialLinesForWorkOrder(state, workOrder) {
  const bom = state.boms.get(workOrder.bomId);
  if (!bom) return [];
  const yieldQuantity = Number(bom.yieldQuantity ?? 1) || 1;
  return (bom.lines ?? []).map((line) => {
    const grossQuantity = (Number(workOrder.plannedQuantity ?? 0) / yieldQuantity) * Number(line.quantity ?? 0);
    const scrapRate = Number(line.scrapRate ?? 0);
    return {
      itemId: line.componentItemId,
      itemCode: line.componentItemCode,
      itemName: line.componentItemName,
      quantity: roundQuantity(scrapRate > 0 && scrapRate < 1 ? grossQuantity / (1 - scrapRate) : grossQuantity)
    };
  });
}

function buildMaterialRequisitionDraft(state, accountSetId, fiscalYear, periodNo, sourceObjectId = null) {
  const availability = inventoryAvailabilityByItem(state, accountSetId);
  const workOrder = agentWorkOrdersForContext(state, accountSetId, fiscalYear, periodNo, sourceObjectId)[0] ?? null;
  if (!workOrder) return null;
  const lines = bomMaterialLinesForWorkOrder(state, workOrder).map((line, index) => {
    const availableQuantity = availability.get(line.itemCode)?.availableQuantity ?? 0;
    return {
      lineNo: index + 1,
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      quantity: line.quantity,
      availableQuantity,
      shortageQuantity: roundQuantity(Math.max(line.quantity - availableQuantity, 0))
    };
  });
  return {
    documentType: "material_requisition_draft",
    workOrderId: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    productItemCode: workOrder.productItemCode,
    status: "draft",
    lines
  };
}

function buildProductReceiptDraft(state, accountSetId, fiscalYear, periodNo, sourceObjectId = null) {
  const workOrder = agentWorkOrdersForContext(state, accountSetId, fiscalYear, periodNo, sourceObjectId)[0] ?? null;
  if (!workOrder) return null;
  const quantity = roundQuantity(Math.max(Number(workOrder.plannedQuantity ?? 0) - Number(workOrder.completedQuantity ?? 0), 0));
  return {
    documentType: "product_receipt_draft",
    workOrderId: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    productItemId: workOrder.productItemId,
    productItemCode: workOrder.productItemCode,
    itemName: workOrder.productItemName,
    quantity,
    status: "draft"
  };
}

function unitCostForItem(state, accountSetId, itemCode) {
  const balances = rowsForAccountSet(state.inventoryBalances, accountSetId).filter((balance) => balance.itemCode === itemCode);
  const explicit = balances.find((balance) => Number(balance.unitCost ?? 0) > 0);
  if (explicit) return Number(explicit.unitCost);
  const quantity = balances.reduce((sum, balance) => sum + Number(balance.quantity ?? 0), 0);
  const amount = balances.reduce((sum, balance) => sum + Number(balance.amount ?? 0), 0);
  return quantity === 0 ? 0 : roundAmount(amount / quantity);
}

function buildWorkOrderCostEstimate(state, accountSetId, fiscalYear, periodNo, sourceObjectId = null) {
  const workOrder = agentWorkOrdersForContext(state, accountSetId, fiscalYear, periodNo, sourceObjectId)[0] ?? null;
  if (!workOrder) return null;
  const materialLines = bomMaterialLinesForWorkOrder(state, workOrder).map((line) => {
    const unitCost = unitCostForItem(state, accountSetId, line.itemCode);
    return {
      ...line,
      unitCost,
      amount: roundAmount(line.quantity * unitCost)
    };
  });
  const totalMaterialCost = roundAmount(materialLines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0));
  const plannedQuantity = Number(workOrder.plannedQuantity ?? 0);
  return {
    workOrderId: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    productItemCode: workOrder.productItemCode,
    plannedQuantity,
    completedQuantity: Number(workOrder.completedQuantity ?? 0),
    totalMaterialCost,
    estimatedUnitCost: plannedQuantity === 0 ? 0 : roundAmount(totalMaterialCost / plannedQuantity),
    materialLines
  };
}

function buildCostVoucherDraftRecommendation(workOrderCostEstimate) {
  if (!workOrderCostEstimate) return null;
  return {
    documentType: "cost_voucher_draft_recommendation",
    approvalRequired: true,
    sourceObjectType: "work_order",
    sourceObjectId: workOrderCostEstimate.workOrderId,
    workOrderNo: workOrderCostEstimate.workOrderNo,
    estimatedAmount: workOrderCostEstimate.totalMaterialCost,
    lines: [
      {
        summary: `结转工单 ${workOrderCostEstimate.workOrderNo} 生产成本`,
        amount: workOrderCostEstimate.totalMaterialCost
      }
    ]
  };
}

function supplyChainNextActions(toolName, dashboard, context = {}) {
  const materialShortageCount = context.materialShortages?.length ?? dashboard.summary.materialShortages.count;
  const inventoryExceptionCount = context.inventoryAnomalies?.length ?? dashboard.summary.inventoryExceptions.count;
  const pendingOrderCount = dashboard.summary.pendingOrders.count;
  const costPendingCount = dashboard.summary.costPending.count;
  const byTool = {
    analyze_supply_chain_dashboard: ["detect_material_shortage", "detect_inventory_anomalies", "run_supply_chain_close_check"],
    detect_material_shortage: materialShortageCount > 0 ? ["generate_purchase_suggestions", "generate_material_requisition"] : [],
    generate_purchase_suggestions: ["suggest_purchase_order_draft"],
    generate_production_plan: ["generate_work_orders_from_plan"],
    generate_work_orders_from_plan: ["suggest_material_requisition_draft"],
    generate_material_requisition: ["suggest_material_requisition_draft"],
    generate_product_receipt: ["suggest_product_receipt_draft", "calculate_work_order_cost"],
    generate_sales_delivery: ["suggest_sales_order_draft"],
    analyze_inventory_availability: pendingOrderCount > 0 ? ["generate_sales_delivery", "generate_material_requisition"] : [],
    detect_inventory_anomalies: inventoryExceptionCount > 0 ? ["generate_stock_count_plan"] : [],
    generate_stock_count_plan: ["suggest_stock_count_draft"],
    generate_outsourcing_order: [],
    generate_rework_plan: [],
    trace_material_batch: [],
    calculate_work_order_cost: costPendingCount > 0 ? ["generate_cost_voucher_draft"] : [],
    generate_cost_voucher_draft: ["create_voucher_draft"],
    run_supply_chain_close_check: []
  };
  return byTool[toolName] ?? [];
}

function buildSupplyChainAgentDryRunResult(state, tool, body) {
  const asOfDate = body.asOfDate ?? new Date().toISOString().slice(0, 10);
  const dashboard = buildSupplyChainDashboard(state, {
    accountSetId: body.accountSetId,
    fiscalYear: body.fiscalYear,
    periodNo: body.periodNo,
    asOfDate
  });
  const materialShortages = buildMaterialShortageAnalysis(state, body.accountSetId, body.fiscalYear, body.periodNo);
  const inventoryAnomalies = buildInventoryAnomalyAnalysis(state, body.accountSetId);
  const inventoryExceptions = inventoryAnomalies.length > 0 ? inventoryAnomalies : dashboard.queues.inventoryExceptions;
  const purchaseSuggestions = buildPurchaseSuggestionsFromShortages(materialShortages);
  const materialRequisitionDraft = buildMaterialRequisitionDraft(state, body.accountSetId, body.fiscalYear, body.periodNo, body.sourceObjectId);
  const productReceiptDraft = buildProductReceiptDraft(state, body.accountSetId, body.fiscalYear, body.periodNo, body.sourceObjectId);
  const workOrderCostEstimate = buildWorkOrderCostEstimate(state, body.accountSetId, body.fiscalYear, body.periodNo, body.sourceObjectId);
  const costVoucherDraftRecommendation = buildCostVoucherDraftRecommendation(workOrderCostEstimate);
  const pendingOrders = dashboard.queues.pendingOrders;
  const warnings = dashboard.agentSuggestions.map((suggestion) => suggestion.message);
  const blockingErrors = [];
  if (tool.name === "generate_material_requisition" && materialShortages.length > 0) {
    blockingErrors.push("存在缺料或负库存，正式领料草稿必须先完成人工复核。");
  }
  if (tool.name === "generate_material_requisition" && materialRequisitionDraft?.lines?.some((line) => line.shortageQuantity > 0)) {
    blockingErrors.push("库存不足，领料草稿只能停留在 dry-run 建议。");
  }
  if (tool.name === "generate_cost_voucher_draft" && dashboard.summary.costPending.count > 0) {
    warnings.push("存在未锁定或待处理成本，成本凭证只能作为高风险 dry-run 建议。");
  }
  if (tool.name === "run_supply_chain_close_check") {
    if (dashboard.summary.workOrdersToIssue.count > 0) blockingErrors.push("仍有待领料工单，不能直接关闭供应链期间。");
    if (dashboard.summary.workOrdersToReceive.count > 0) blockingErrors.push("仍有待完工工单，不能直接关闭供应链期间。");
    if (dashboard.summary.costPending.count > 0) blockingErrors.push("仍有成本待处理事项，不能直接关闭供应链期间。");
  }

  return {
    ...genericAgentActionDryRunResult(tool),
    toolName: tool.name,
    riskLevel: tool.riskLevel,
    summary: `${tool.title} dry-run completed: ${dashboard.summary.pendingOrders.count} pending orders, ${materialShortages.length} material shortages, ${inventoryExceptions.length} inventory exceptions.`,
    draftPayload: {
      dashboardSummary: dashboard.summary,
      materialShortages,
      purchaseSuggestions,
      materialRequisitionDraft,
      productReceiptDraft,
      workOrderCostEstimate,
      costVoucherDraftRecommendation,
      inventoryExceptions,
      inventoryAnomalies,
      stockCountPlan: {
        documentType: "stock_count_plan",
        reasonCode: "inventory_anomaly",
        lines: inventoryAnomalies.map((anomaly) => ({
          itemCode: anomaly.itemCode,
          itemName: anomaly.itemName,
          warehouseCode: anomaly.warehouseCode,
          anomalyType: anomaly.anomalyType,
          severity: anomaly.severity
        }))
      },
      pendingOrders,
      pendingAgentApprovals: dashboard.queues.pendingAgentApprovals,
      workOrderProgress: dashboard.workOrderProgress,
      sourceObjectType: body.sourceObjectType ?? null,
      sourceObjectId: body.sourceObjectId ?? null,
      payload: body.payload ?? {}
    },
    warnings,
    blockingErrors,
    matchedMasterData: [],
    unmatchedItems: [],
    evidenceRefs: body.evidenceRefs ?? [],
    nextActions: supplyChainNextActions(tool.name, dashboard, { materialShortages, inventoryAnomalies })
  };
}

function buildAgentActionDryRunResult(state, tool, body) {
  if (SUPPLY_CHAIN_AGENT_TOOL_NAMES.has(tool.name)) {
    return buildSupplyChainAgentDryRunResult(state, tool, body);
  }
  return genericAgentActionDryRunResult(tool);
}

async function buildManagementAnalysis(state, { accountSetId, fiscalYear, periodNo, asOfDate }) {
  const purchaseOrders = (await listPurchaseOrders(state, accountSetId)).filter((order) => isInFiscalPeriod(order, fiscalYear, periodNo, "orderDate"));
  const salesInvoices = (await listSalesInvoices(state, accountSetId)).filter((invoice) => isInFiscalPeriod(invoice, fiscalYear, periodNo, "invoiceDate"));
  const inventoryMovements = listInventoryMovements(state, accountSetId).filter((row) => isInFiscalPeriod(row, fiscalYear, periodNo, "movementDate"));
  const counterpartyEntries = await listCounterpartyLedgerEntries(state, accountSetId);
  const inventoryBalances = listInventoryBalances(state, accountSetId);
  const payrollPools = [...state.payrollCostPools.values()].filter((pool) => pool.accountSetId === accountSetId && isInFiscalPeriod(pool, fiscalYear, periodNo));
  const depreciationPools = [...state.assetDepreciationCostPools.values()].filter((pool) => pool.accountSetId === accountSetId && isInFiscalPeriod(pool, fiscalYear, periodNo));
  const cashCodes = cashLikeAccountCodes(state, accountSetId);
  const cashEntries = state.journalEntries.filter(
    (entry) =>
      entry.accountSetId === accountSetId &&
      Number(entry.fiscalYear) === Number(fiscalYear) &&
      Number(entry.periodNo) === Number(periodNo) &&
      cashCodes.has(entry.accountCode ?? entry.accountId)
  );

  const purchaseAmount = purchaseOrders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);
  const salesAmount = salesInvoices.reduce((sum, invoice) => sum + Number(invoice.receivableAmount ?? invoice.totalAmount ?? 0), 0);
  const outboundCost = inventoryMovements
    .filter((row) => row.movementType === "outbound" || row.businessType === "sales_delivery")
    .reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
  const inventoryAmount = inventoryBalances.reduce((sum, balance) => sum + Number(balance.amount ?? 0), 0);
  const arOpen = counterpartyEntries.filter((entry) => entry.direction === "ar" && Number(entry.remainingAmount ?? 0) > 0);
  const apOpen = counterpartyEntries.filter((entry) => entry.direction === "ap" && Number(entry.remainingAmount ?? 0) > 0);
  const arOverdue = arOpen.filter((entry) => daysPastDue(entry.dueDate, asOfDate) > 0);
  const apOverdue = apOpen.filter((entry) => daysPastDue(entry.dueDate, asOfDate) > 0);
  const cashNetFlow = cashEntries.reduce((sum, entry) => sum + Number(entry.debit ?? entry.debitAmount ?? 0) - Number(entry.credit ?? entry.creditAmount ?? 0), 0);
  const laborCost = payrollPools.reduce((sum, pool) => sum + Number(pool.amount ?? 0), 0);
  const depreciationCost = depreciationPools.reduce((sum, pool) => sum + Number(pool.amount ?? 0), 0);
  const grossMargin = salesAmount - outboundCost;
  const operatingContribution = grossMargin - laborCost - depreciationCost;
  const basePath = `accountSetId=${accountSetId}&fiscalYear=${fiscalYear}&periodNo=${periodNo}`;

  const drilldowns = {
    purchaseTrend: {
      rows: purchaseOrders.map((order) => ({
        sourceType: "purchase_order",
        sourceId: order.id,
        sourceNo: order.orderNo,
        partnerName: order.supplierName ?? null,
        amount: Number(order.totalAmount ?? 0),
        documentDate: order.orderDate,
        status: order.status
      }))
    },
    salesGrossMargin: {
      rows: salesInvoices.map((invoice) => ({
        sourceType: "sales_invoice",
        sourceId: invoice.id,
        sourceNo: invoice.invoiceNo,
        partnerName: invoice.customerName ?? null,
        amount: Number(invoice.receivableAmount ?? invoice.totalAmount ?? 0),
        documentDate: invoice.invoiceDate
      }))
    },
    inventoryTurnover: {
      rows: inventoryBalances.map((balance) => ({
        sourceType: "inventory_balance",
        sourceId: balance.id,
        sourceNo: balance.itemCode,
        itemName: balance.itemName,
        quantity: Number(balance.quantity ?? 0),
        amount: Number(balance.amount ?? 0),
        updatedAt: balance.updatedAt ?? null
      }))
    },
    counterpartyAging: {
      rows: counterpartyEntries
        .filter((entry) => Number(entry.remainingAmount ?? 0) > 0)
        .map((entry) => ({
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          sourceNo: entry.sourceNo,
          direction: entry.direction,
          partnerName: entry.partnerName ?? null,
          remainingAmount: Number(entry.remainingAmount ?? 0),
          dueDate: entry.dueDate ?? null,
          daysPastDue: daysPastDue(entry.dueDate, asOfDate)
        }))
    },
    cashFlow: {
      rows: cashEntries.map((entry) => ({
        sourceType: "journal_entry",
        sourceId: entry.voucherId ?? entry.id,
        sourceNo: entry.voucherNo ?? entry.voucherId ?? entry.id,
        accountCode: entry.accountCode ?? entry.accountId,
        debit: Number(entry.debit ?? entry.debitAmount ?? 0),
        credit: Number(entry.credit ?? entry.creditAmount ?? 0),
        amount: roundAmount(Number(entry.debit ?? entry.debitAmount ?? 0) - Number(entry.credit ?? entry.creditAmount ?? 0))
      }))
    },
    laborCost: {
      rows: payrollPools.map((pool) => ({
        sourceType: "payroll_cost_pool",
        sourceId: pool.id,
        sourceNo: pool.sourceRunId ?? pool.id,
        departmentId: pool.departmentId ?? null,
        costType: pool.costType,
        amount: Number(pool.amount ?? 0)
      }))
    },
    depreciationCost: {
      rows: depreciationPools.map((pool) => ({
        sourceType: "asset_depreciation_cost_pool",
        sourceId: pool.id,
        sourceNo: pool.sourceRunId ?? pool.id,
        departmentId: pool.departmentId ?? null,
        costType: pool.costType,
        amount: Number(pool.amount ?? 0)
      }))
    },
    operatingOverview: {
      rows: [
        { sourceType: "management_metric", sourceNo: "salesGrossMargin", amount: roundAmount(grossMargin) },
        { sourceType: "management_metric", sourceNo: "laborCost", amount: roundAmount(-laborCost) },
        { sourceType: "management_metric", sourceNo: "depreciationCost", amount: roundAmount(-depreciationCost) }
      ]
    }
  };

  const warnings = [];
  for (const entry of arOverdue) {
    warnings.push({
      code: "OVERDUE_AR",
      severity: "warning",
      message: `Receivable ${entry.sourceNo} is overdue by ${daysPastDue(entry.dueDate, asOfDate)} days.`,
      evidenceRefs: [entry.id],
      drilldown: { sourceType: "counterparty_ledger", path: `/counterparty-ledger?direction=ar&partnerId=${entry.partnerId}` }
    });
  }
  for (const balance of inventoryBalances) {
    if (Number(balance.quantity ?? 0) > 0 && daysPastDue(balance.updatedAt, asOfDate) > 90) {
      warnings.push({
        code: "INVENTORY_STAGNATION",
        severity: "warning",
        message: `Inventory item ${balance.itemCode} has no recent movement for more than 90 days.`,
        evidenceRefs: [balance.id],
        drilldown: { sourceType: "inventory_balance", path: `/inventory-ledger?itemCode=${balance.itemCode}` }
      });
    }
  }

  return {
    accountSetId,
    fiscalYear: Number(fiscalYear),
    periodNo: Number(periodNo),
    asOfDate,
    metrics: [
      metric("purchaseTrend", "采购趋势", purchaseAmount, purchaseOrders.length, "purchase_order", `/purchase-orders?${basePath}`),
      metric("salesGrossMargin", "销售毛利", grossMargin, salesInvoices.length, "sales_invoice", `/sales-invoices?${basePath}`, {
        denominatorAmount: roundAmount(salesAmount),
        ratio: salesAmount === 0 ? 0 : roundAmount(grossMargin / salesAmount)
      }),
      metric("inventoryTurnover", "存货周转", outboundCost, inventoryMovements.length, "inventory_movement", `/inventory-ledger?${basePath}`, {
        denominatorAmount: roundAmount(inventoryAmount),
        ratio: inventoryAmount === 0 ? 0 : roundAmount(outboundCost / inventoryAmount)
      }),
      metric("counterpartyAging", "账龄风险", arOpen.reduce((sum, entry) => sum + Number(entry.remainingAmount ?? 0), 0), arOpen.length + apOpen.length, "counterparty_ledger", `/counterparty-analytics?${basePath}`, {
        overdueAmount: roundAmount([...arOverdue, ...apOverdue].reduce((sum, entry) => sum + Number(entry.remainingAmount ?? 0), 0))
      }),
      metric("cashFlow", "现金流净额", cashNetFlow, cashEntries.length, "journal_entry", `/reports/detail-ledger?${basePath}`),
      metric("laborCost", "人工成本", laborCost, payrollPools.length, "payroll_cost_pool", `/payroll-runs?${basePath}`),
      metric("depreciationCost", "折旧成本", depreciationCost, depreciationPools.length, "asset_depreciation_cost_pool", `/depreciation-runs?${basePath}`),
      metric("operatingOverview", "整体经营", operatingContribution, 3, "management_metric", `/management-analysis?${basePath}`)
    ],
    warnings,
    drilldowns
  };
}

async function createReportExport(state, runId, body, actorId) {
  const run = findReportRunByIdentifier(state, runId);
  if (!run) {
    return errorResponse(404, "REPORT_RUN_NOT_FOUND", "Report run was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) {
    return accountSetAccessError(state, actorId, run.accountSetId);
  }
  if (!["excel", "pdf"].includes(body.fileType)) {
    throw new Error("fileType is required.");
  }

  const exportId = `report-export:${state.reportExports.size + 1}`;
  const fileExtension = body.fileType === "excel" ? "xlsx" : "pdf";
  const exportFile = {
    id: exportId,
    accountSetId: run.accountSetId,
    reportRunId: run.id,
    fileType: body.fileType,
    snapshotHash: run.snapshotHash,
    downloadUrl: `local://report-exports/${exportId}.${fileExtension}`,
    contentText: renderReportExportContent(run, body.fileType),
    sensitiveFieldNotice: body.sensitiveFieldNotice ?? `Generated from immutable snapshot ${run.snapshotHash}.`,
    exportedBy: body.exportedBy ?? actorId,
    createdAt: "now"
  };
  state.reportExports.set(exportFile.id, exportFile);
  appendAuditLog(state, {
    actorId: exportFile.exportedBy,
    action: "report_export.create",
    objectType: "report_export",
    objectId: exportFile.id
  });
  return jsonResponse(201, cloneReportPayload(exportFile));
}

async function createAiReportInterpretation(state, runId, body, actorId) {
  const run = findReportRunByIdentifier(state, runId);
  if (!run) {
    return errorResponse(404, "REPORT_RUN_NOT_FOUND", "Report run was not found.");
  }
  if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) {
    return accountSetAccessError(state, actorId, run.accountSetId);
  }
  if (typeof body.summary !== "string" || body.summary.trim() === "") {
    throw new Error("summary is required.");
  }
  if (!Array.isArray(body.evidenceRefs) || body.evidenceRefs.length === 0) {
    throw new Error("evidenceRefs are required.");
  }
  for (const ref of body.evidenceRefs) {
    if (typeof ref !== "string" || !ref.startsWith("report_cell:")) {
      throw new Error("evidenceRefs must point to report_cell references.");
    }
  }
  const validEvidenceRefs = new Set((run.cells ?? []).map((cell) => reportCellEvidenceRef(cell)));
  for (const ref of body.evidenceRefs) {
    if (!validEvidenceRefs.has(ref)) {
      throw new Error("evidenceRefs must point to cells in the report run.");
    }
  }

  const interpretation = {
    id: `ai-report-interpretation:${state.aiReportInterpretations.size + 1}`,
    accountSetId: run.accountSetId,
    reportRunId: run.id,
    summary: body.summary,
    keyFindings: Array.isArray(body.keyFindings) ? [...body.keyFindings] : [],
    warnings: Array.isArray(body.warnings) ? [...body.warnings] : [],
    evidenceRefs: [...body.evidenceRefs],
    interpretedBy: body.interpretedBy ?? actorId,
    createdAt: "now"
  };
  state.aiReportInterpretations.set(interpretation.id, interpretation);
  appendAuditLog(state, {
    actorId: interpretation.interpretedBy,
    action: "ai_report_interpretation.create",
    objectType: "ai_report_interpretation",
    objectId: interpretation.id
  });
  return jsonResponse(201, publicAiReportInterpretation(interpretation));
}

async function route(request, state) {
  const segments = splitPath(request.path);
  const body = request.body ?? {};
  const platformStore = state.config.platformStore;

  if (request.method === "POST" && request.path === "/auth/login") {
    if (platformStore) {
      const identity = await platformStore.findUserIdentity(body.username);
      if (!identity || !verifyPassword(body.password, identity.user)) {
        appendAuditLog(state, {
          actorId: identity?.user?.id ?? body.username ?? "unknown",
          action: "auth.login.failure",
          objectType: "user",
          objectId: identity?.user?.id ?? body.username ?? "unknown"
        });
        return errorResponse(401, "INVALID_CREDENTIALS", "Username or password is invalid.");
      }
      state.permissionsByActor.set(identity.user.id, new Set(identity.permissionCodes));
      appendAuditLog(state, {
        actorId: identity.user.id,
        action: "auth.login.success",
        objectType: "user",
        objectId: identity.user.id
      });
      return jsonResponse(200, {
        accessToken: createAccessToken(identity.user, tokenSecretFor(state)),
        tokenType: "Bearer",
        user: publicUser(identity.user)
      });
    }

    const user = state.users.get(body.username);
    if (!user || !verifyPassword(body.password, user)) {
      appendAuditLog(state, {
        actorId: user?.id ?? body.username ?? "unknown",
        action: "auth.login.failure",
        objectType: "user",
        objectId: user?.id ?? body.username ?? "unknown"
      });
      return errorResponse(401, "INVALID_CREDENTIALS", "Username or password is invalid.");
    }
    appendAuditLog(state, {
      actorId: user.id,
      action: "auth.login.success",
      objectType: "user",
      objectId: user.id
    });
    return jsonResponse(200, {
      accessToken: createAccessToken(user, tokenSecretFor(state)),
      tokenType: "Bearer",
      user: publicUser(user)
    });
  }

  if (request.method === "GET" && request.path === "/deployment/config") {
    return jsonResponse(200, deploymentConfigFor(state));
  }

  if (segments.length === 3 && segments[0] === "ops" && segments[1] === "migrations" && segments[2] === "jobs") {
    const actorId = actorIdFor(request, state);
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      const status = query.get("status");
      const jobType = query.get("jobType");
      if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      const rawItems = platformStore?.listMigrationJobs
        ? await platformStore.listMigrationJobs(accountSetId, { status, jobType })
        : listMigrationJobs(state, { accountSetId, status, jobType });
      const items = [];
      for (const item of rawItems) {
        if (!accountSetId && !(await canAccessAccountSet(state, actorId, item.accountSetId))) {
          continue;
        }
        state.migrationJobs.set(item.id, item);
        items.push(publicMigrationJob(item));
      }
      return jsonResponse(200, {
        accountSetId: accountSetId ?? null,
        status: status ?? null,
        jobType: jobType ?? null,
        total: items.length,
        items
      });
    }

    if (request.method === "POST") {
      if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
        return errorResponse(400, "ACCOUNT_SET_ID_REQUIRED", "accountSetId is required.");
      }
      const accountSet =
        findAccountSetByIdentifier(state, body.accountSetId) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(body.accountSetId) : null);
      if (!accountSet) {
        return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
      }
      if (!(await canAccessAccountSet(state, actorId, accountSet.id))) {
        return accountSetAccessError(state, actorId, accountSet.id);
      }
      try {
        const job = createMigrationJobRecord(state, accountSet, body, actorId);
        const savedJob = platformStore?.createMigrationJob ? await platformStore.createMigrationJob(job) : job;
        state.migrationJobs.set(savedJob.id, savedJob);
        appendAuditLog(state, {
          actorId: savedJob.requestedBy,
          action: "migration_job.create",
          objectType: "migration_job",
          objectId: savedJob.id
        });
        return jsonResponse(201, publicMigrationJob(savedJob));
      } catch (error) {
        return errorResponse(error.status ?? 400, error.code ?? "BUSINESS_RULE_FAILED", error.message);
      }
    }
  }

  if (
    request.method === "POST" &&
    segments.length === 5 &&
    segments[0] === "ops" &&
    segments[1] === "migrations" &&
    segments[2] === "jobs" &&
    segments[4] === "dry-run"
  ) {
    const actorId = actorIdFor(request, state);
    const jobId = decodedPathId(segments[3]);
    const job =
      state.migrationJobs.get(jobId) ?? (platformStore?.findMigrationJob ? await platformStore.findMigrationJob(jobId) : null);
    if (!job) {
      return errorResponse(404, "MIGRATION_JOB_NOT_FOUND", "Migration job was not found.");
    }
    state.migrationJobs.set(job.id, job);
    if (!(await canAccessAccountSet(state, actorId, job.accountSetId))) {
      return accountSetAccessError(state, actorId, job.accountSetId);
    }
    const dryRunJob = runMigrationDryRun(job, body, actorId);
    const savedJob = platformStore?.updateMigrationJob ? await platformStore.updateMigrationJob(dryRunJob) : dryRunJob;
    state.migrationJobs.set(savedJob.id, savedJob);
    appendAuditLog(state, {
      actorId: savedJob.requestedBy,
      action: "migration_job.dry_run",
      objectType: "migration_job",
      objectId: savedJob.id
    });
    return jsonResponse(200, publicMigrationJob(savedJob));
  }

  if (
    request.method === "POST" &&
    segments.length === 5 &&
    segments[0] === "ops" &&
    segments[1] === "migrations" &&
    segments[2] === "jobs" &&
    segments[4] === "import"
  ) {
    const actorId = actorIdFor(request, state);
    const jobId = decodedPathId(segments[3]);
    const job =
      state.migrationJobs.get(jobId) ?? (platformStore?.findMigrationJob ? await platformStore.findMigrationJob(jobId) : null);
    if (!job) {
      return errorResponse(404, "MIGRATION_JOB_NOT_FOUND", "Migration job was not found.");
    }
    state.migrationJobs.set(job.id, job);
    if (!(await canAccessAccountSet(state, actorId, job.accountSetId))) {
      return accountSetAccessError(state, actorId, job.accountSetId);
    }
    try {
      const importedJob = await importMigrationJob(state, job, body, actorId);
      const savedJob = platformStore?.updateMigrationJob ? await platformStore.updateMigrationJob(importedJob) : importedJob;
      state.migrationJobs.set(savedJob.id, savedJob);
      appendAuditLog(state, {
        actorId: savedJob.requestedBy,
        action: "migration_job.import",
        objectType: "migration_job",
        objectId: savedJob.id
      });
      return jsonResponse(200, publicMigrationJob(savedJob));
    } catch (error) {
      return errorResponse(error.status ?? 400, error.code ?? "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (segments.length === 2 && segments[0] === "ops" && segments[1] === "backups") {
    const actorId = actorIdFor(request, state);
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      const status = query.get("status");
      if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      const rawItems = platformStore?.listBackupJobs
        ? await platformStore.listBackupJobs(accountSetId, { status })
        : listBackupJobs(state, { accountSetId, status });
      const items = [];
      for (const item of rawItems) {
        if (!accountSetId && !(await canAccessAccountSet(state, actorId, item.accountSetId))) {
          continue;
        }
        items.push(item);
      }
      return jsonResponse(200, {
        accountSetId: accountSetId ?? null,
        status: status ?? null,
        total: items.length,
        items
      });
    }

    if (request.method === "POST") {
      if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
        return errorResponse(400, "ACCOUNT_SET_ID_REQUIRED", "accountSetId is required.");
      }
      const accountSet =
        findAccountSetByIdentifier(state, body.accountSetId) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(body.accountSetId) : null);
      if (!accountSet) {
        return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
      }
      if (!(await canAccessAccountSet(state, actorId, accountSet.id))) {
        return accountSetAccessError(state, actorId, accountSet.id);
      }
      try {
        const job = createBackupJobRecord(state, accountSet, body, actorId);
        const savedJob = platformStore?.createBackupJob ? await platformStore.createBackupJob(job) : job;
        state.backupJobs.set(savedJob.id, savedJob);
        appendAuditLog(state, {
          actorId: savedJob.requestedBy,
          action: "backup_job.create",
          objectType: "backup_job",
          objectId: savedJob.id
        });
        return jsonResponse(201, savedJob);
      } catch (error) {
        return errorResponse(error.status ?? 400, error.code ?? "BUSINESS_RULE_FAILED", error.message);
      }
    }
  }

  if (segments.length === 2 && segments[0] === "ops" && segments[1] === "restores" && request.method === "GET") {
    const actorId = actorIdFor(request, state);
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const status = query.get("status");
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const rawItems = platformStore?.listRestoreJobs
      ? await platformStore.listRestoreJobs(accountSetId, { status })
      : listRestoreJobs(state, { accountSetId, status });
    const items = [];
    for (const item of rawItems) {
      if (!accountSetId && !(await canAccessAccountSet(state, actorId, item.accountSetId))) {
        continue;
      }
      items.push(item);
    }
    return jsonResponse(200, {
      accountSetId: accountSetId ?? null,
      status: status ?? null,
      total: items.length,
      items
    });
  }

  if (segments.length === 3 && segments[0] === "ops" && segments[1] === "restores" && segments[2] === "execute" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      return errorResponse(400, "ACCOUNT_SET_ID_REQUIRED", "accountSetId is required.");
    }
    if (typeof body.backupJobId !== "string" || body.backupJobId.trim() === "") {
      return errorResponse(400, "BACKUP_JOB_ID_REQUIRED", "backupJobId is required.");
    }
    const accountSet =
      findAccountSetByIdentifier(state, body.accountSetId) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(body.accountSetId) : null);
    if (!accountSet) {
      return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
    }
    if (!(await canAccessAccountSet(state, actorId, accountSet.id))) {
      return accountSetAccessError(state, actorId, accountSet.id);
    }
    const backupJob =
      state.backupJobs.get(body.backupJobId) ??
      (platformStore?.findBackupJob ? await platformStore.findBackupJob(body.backupJobId) : null);
    if (!backupJob || backupJob.accountSetId !== accountSet.id) {
      return errorResponse(404, "BACKUP_JOB_NOT_FOUND", "Backup job was not found for the account set.");
    }
    state.backupJobs.set(backupJob.id, backupJob);
    try {
      const job = createRestoreJobRecord(state, accountSet, backupJob, body, actorId);
      const savedJob = platformStore?.createRestoreJob ? await platformStore.createRestoreJob(job) : job;
      state.restoreJobs.set(savedJob.id, savedJob);
      appendAuditLog(state, {
        actorId: savedJob.requestedBy,
        action: "restore_job.dry_run",
        objectType: "restore_job",
        objectId: savedJob.id
      });
      return jsonResponse(201, savedJob);
    } catch (error) {
      return errorResponse(error.status ?? 400, error.code ?? "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (request.method === "GET" && request.path === "/permissions") {
    if (platformStore) {
      return jsonResponse(200, await platformStore.listPermissions());
    }
    return jsonResponse(200, state.permissions);
  }

  if (request.method === "GET" && request.path === "/roles") {
    if (platformStore) {
      return jsonResponse(200, await platformStore.listRoles());
    }
    return jsonResponse(200, [...state.roles.values()]);
  }

  if (request.method === "POST" && request.path === "/roles") {
    const validated = await validateRolePayload(state, body);
    if (validated.error) {
      return validated.error;
    }
    if (platformStore) {
      const role = await platformStore.createRole({
        name: validated.name,
        description: validated.description,
        permissionCodes: validated.permissionCodes
      });
      appendAuditLog(state, {
        actorId: body.createdBy ?? actorIdFor(request, state),
        action: "role.create",
        objectType: "role",
        objectId: role.id
      });
      return jsonResponse(201, role);
    }

    const role = {
      id: `role:${state.roles.size + 1}`,
      name: validated.name,
      description: validated.description,
      permissionCodes: validated.permissionCodes
    };
    state.roles.set(role.id, role);
    appendAuditLog(state, {
      actorId: body.createdBy ?? actorIdFor(request, state),
      action: "role.create",
      objectType: "role",
      objectId: role.id
    });
    return jsonResponse(201, role);
  }

  if (request.method === "PATCH" && segments.length === 2 && segments[0] === "roles") {
    const roleId = segments[1];
    const roles = platformStore ? await platformStore.listRoles() : [...state.roles.values()];
    const currentRole = roles.find((role) => role.id === roleId);
    if (!currentRole) {
      return errorResponse(404, "ROLE_NOT_FOUND", "Role was not found.");
    }
    const validated = await validateRolePayload(state, body, roleId);
    if (validated.error) {
      return validated.error;
    }
    if (await wouldRemoveLastRoleManager(state, roleId, validated.permissionCodes)) {
      return errorResponse(409, "ROLE_MANAGER_REQUIRED", "At least one role must keep role.manage permission.");
    }

    const role = platformStore?.updateRole
      ? await platformStore.updateRole(roleId, validated)
      : {
          ...currentRole,
          name: validated.name,
          description: validated.description,
          permissionCodes: validated.permissionCodes
        };
    if (!platformStore?.updateRole) {
      state.roles.set(role.id, role);
    }
    await refreshRolePermissionsForUsers(state, role);
    appendAuditLog(state, {
      actorId: body.updatedBy ?? actorIdFor(request, state),
      action: "role.update",
      objectType: "role",
      objectId: role.id
    });
    return jsonResponse(200, role);
  }

  if (request.method === "GET" && request.path === "/users") {
    if (platformStore) {
      return jsonResponse(200, await platformStore.listUsers());
    }
    return jsonResponse(200, [...state.users.values()].map(publicUser));
  }

  if (request.method === "POST" && request.path === "/users") {
    if (typeof body.username !== "string" || body.username.trim() === "") {
      throw new Error("username is required.");
    }
    if (typeof body.password !== "string" || body.password.trim() === "") {
      throw new Error("password is required.");
    }
    const existingUser = platformStore ? await platformStore.findUserIdentity(body.username) : state.users.get(body.username);
    if (existingUser) {
      return errorResponse(409, "USER_ALREADY_EXISTS", "Username already exists.");
    }
    const role = platformStore
      ? (await platformStore.listRoles()).find((item) => item.id === body.roleId)
      : state.roles.get(body.roleId);
    if (!role) {
      return errorResponse(404, "ROLE_NOT_FOUND", "Role was not found.");
    }
    if (platformStore) {
      const user = await platformStore.createUser({
        username: body.username,
        passwordHash: createPasswordHash(body.username, body.password),
        name: body.name ?? body.username,
        roleId: role.id
      });
      state.permissionsByActor.set(user.id, new Set(role.permissionCodes));
      appendAuditLog(state, {
        actorId: body.createdBy ?? actorIdFor(request, state),
        action: "user.create",
        objectType: "user",
        objectId: user.id
      });
      return jsonResponse(201, user);
    }

    const user = {
      id: `user:${body.username}`,
      username: body.username,
      passwordHash: createPasswordHash(body.username, body.password),
      name: body.name ?? body.username,
      role: role.name,
      roleId: role.id
    };
    state.users.set(user.username, user);
    state.permissionsByActor.set(user.id, new Set(role.permissionCodes));
    appendAuditLog(state, {
      actorId: body.createdBy ?? actorIdFor(request, state),
      action: "user.create",
      objectType: "user",
      objectId: user.id
    });
    return jsonResponse(201, publicUser(user));
  }

  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "users") {
    const user = await findUserByIdentifier(state, segments[1]);
    if (!user) {
      return errorResponse(404, "USER_NOT_FOUND", "User was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (user.id === "system" || user.username === "system") {
      return errorResponse(409, "SYSTEM_USER_DELETE_BLOCKED", "System administrator user cannot be deleted.");
    }
    if (user.id === actorId) {
      return errorResponse(409, "CURRENT_USER_DELETE_BLOCKED", "Current signed-in user cannot be deleted.");
    }

    if (platformStore?.deleteUser) {
      await platformStore.deleteUser(user.id);
    } else {
      state.users.delete(user.username);
      state.accountSetAccessByActor.delete(user.id);
      state.accountSetUserGrants = state.accountSetUserGrants.filter((grant) => grant.actorId !== user.id);
    }
    state.permissionsByActor.delete(user.id);
    appendAuditLog(state, {
      actorId: body.deletedBy ?? actorId,
      action: "user.delete",
      objectType: "user",
      objectId: user.id
    });
    return jsonResponse(200, user);
  }

  if (request.method === "POST" && request.path === "/account-sets") {
    const actorId = body.createdBy ?? actorIdFor(request, state);
    const accountSet = createAccountSet({
      ...body,
      createdBy: actorId
    });
    state.accountSets.set(accountSet.id, accountSet);
    if (platformStore?.createAccountSet) {
      await platformStore.createAccountSet(accountSet);
    }
    grantAccountSetAccess(state, actorId, accountSet.id);
    if (actorId !== "system" && platformStore?.grantAccountSetUser) {
      await platformStore.grantAccountSetUser({
        accountSetId: accountSet.id,
        actorId,
        grantedBy: actorId
      });
    }
    appendAuditLog(state, {
      actorId,
      action: "account_set.create",
      objectType: "account_set",
      objectId: accountSet.id
    });
    return jsonResponse(201, accountSet);
  }

  if (request.method === "GET" && request.path === "/account-sets") {
    const actorId = actorIdFor(request, state);
    if (platformStore?.listAccessibleAccountSets) {
      if (hasPlatformAdministratorScope(state, actorId) && platformStore.listAccountSets) {
        return jsonResponse(200, await platformStore.listAccountSets());
      }
      return jsonResponse(200, await platformStore.listAccessibleAccountSets(actorId));
    }
    const visibleAccountSets = [];
    for (const accountSet of state.accountSets.values()) {
      if (await canAccessAccountSet(state, actorId, accountSet.id)) {
        visibleAccountSets.push(accountSet);
      }
    }
    return jsonResponse(
      200,
      visibleAccountSets
    );
  }

  if (segments.length === 2 && segments[0] === "account-sets") {
    const accountSet =
      findAccountSetByIdentifier(state, segments[1]) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(segments[1]) : null);
    if (!accountSet) {
      return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSet.id))) {
      return accountSetAccessError(state, actorId, accountSet.id);
    }

    if (request.method === "GET") {
      return jsonResponse(200, accountSet);
    }

    if (request.method === "PATCH") {
      const changesStartYear = Object.prototype.hasOwnProperty.call(body, "startYear") && body.startYear !== accountSet.startYear;
      const changesStartPeriod = Object.prototype.hasOwnProperty.call(body, "startPeriod") && body.startPeriod !== accountSet.startPeriod;
      if (accountSet.status === "enabled" && (changesStartYear || changesStartPeriod)) {
        return errorResponse(
          409,
          "ACCOUNT_SET_ENABLED_LOCKED",
          "Enabled account sets do not allow start year or start period changes."
        );
      }
      const updatedAccountSet = {
        ...accountSet,
        name: body.name ?? accountSet.name,
        companyName: body.companyName ?? accountSet.companyName,
        baseCurrency: body.baseCurrency ?? accountSet.baseCurrency,
        accountingStandard: body.accountingStandard ?? accountSet.accountingStandard,
        startYear: body.startYear ?? accountSet.startYear,
        startPeriod: body.startPeriod ?? accountSet.startPeriod,
        updatedBy: body.updatedBy ?? actorId,
        updatedAt: "now"
      };
      assertValidAccountSetStart(updatedAccountSet);
      const savedAccountSet = platformStore?.updateAccountSet ? await platformStore.updateAccountSet(updatedAccountSet) : updatedAccountSet;
      state.accountSets.set(savedAccountSet.id, savedAccountSet);
      appendAuditLog(state, {
        actorId: savedAccountSet.updatedBy ?? actorId,
        action: "account_set.update",
        objectType: "account_set",
        objectId: savedAccountSet.id
      });
      return jsonResponse(200, savedAccountSet);
    }
  }

  if (segments.length === 3 && segments[0] === "account-sets" && segments[2] === "users") {
    const accountSet =
      findAccountSetByIdentifier(state, segments[1]) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(segments[1]) : null);
    if (!accountSet) {
      return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
    }

    if (request.method === "GET") {
      if (platformStore?.listAccountSetUsers) {
        return jsonResponse(200, await platformStore.listAccountSetUsers(accountSet.id));
      }
      return jsonResponse(
        200,
        state.accountSetUserGrants.filter((grant) => grant.accountSetId === accountSet.id)
      );
    }

    if (request.method === "POST") {
      if (typeof body.actorId !== "string" || body.actorId.trim() === "") {
        throw new Error("actorId is required.");
      }
      const existing = state.accountSetUserGrants.find(
        (grant) => grant.accountSetId === accountSet.id && grant.actorId === body.actorId
      );
      const grant = platformStore?.grantAccountSetUser
        ? await platformStore.grantAccountSetUser({
            accountSetId: accountSet.id,
            actorId: body.actorId,
            grantedBy: body.grantedBy ?? actorIdFor(request, state)
          })
        : existing ?? {
            id: `account-set-user:${state.accountSetUserGrants.length + 1}`,
            accountSetId: accountSet.id,
            actorId: body.actorId,
            grantedBy: body.grantedBy ?? actorIdFor(request, state),
            grantedAt: "now"
          };
      if (!existing) {
        state.accountSetUserGrants.push(grant);
      }
      grantAccountSetAccess(state, body.actorId, accountSet.id);
      appendAuditLog(state, {
        actorId: grant.grantedBy,
        action: "account_set_user.grant",
        objectType: "account_set",
        objectId: accountSet.id
      });
      return jsonResponse(201, grant);
    }
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "account-sets" && segments[2] === "enable") {
    const accountSet =
      findAccountSetByIdentifier(state, segments[1]) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(segments[1]) : null);
    if (!accountSet) {
      return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
    }
    const enabled = enableAccountSet(accountSet, { enabledBy: body.enabledBy ?? "system" });
    const savedAccountSet = platformStore?.updateAccountSet ? await platformStore.updateAccountSet(enabled) : enabled;
    state.accountSets.set(savedAccountSet.id, savedAccountSet);
    appendAuditLog(state, {
      actorId: body.enabledBy ?? "system",
      action: "account_set.enable",
      objectType: "account_set",
      objectId: savedAccountSet.id
    });
    return jsonResponse(200, savedAccountSet);
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "account-sets" && segments[2] === "disable") {
    const accountSet =
      findAccountSetByIdentifier(state, segments[1]) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(segments[1]) : null);
    if (!accountSet) {
      return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
    }
    const disabled = disableAccountSet(accountSet, { disabledBy: body.disabledBy ?? "system" });
    const savedAccountSet = platformStore?.updateAccountSet ? await platformStore.updateAccountSet(disabled) : disabled;
    state.accountSets.set(savedAccountSet.id, savedAccountSet);
    appendAuditLog(state, {
      actorId: body.disabledBy ?? "system",
      action: "account_set.disable",
      objectType: "account_set",
      objectId: savedAccountSet.id
    });
    return jsonResponse(200, savedAccountSet);
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "account-sets" && segments[2] === "periods") {
    const accountSet =
      findAccountSetByIdentifier(state, segments[1]) ?? (platformStore?.findAccountSet ? await platformStore.findAccountSet(segments[1]) : null);
    if (!accountSet) {
      return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSet.id))) {
      return accountSetAccessError(state, actorId, accountSet.id);
    }
    const periods = platformStore?.listAccountingPeriods
      ? await platformStore.listAccountingPeriods(accountSet.id)
      : [...state.periods.values()].filter((period) => period.accountSetId === accountSet.id);
    return jsonResponse(200, periods);
  }

  if (
    request.method === "POST" &&
    segments.length === 3 &&
    segments[0] === "account-sets" &&
    segments[2] === "periods"
  ) {
    return errorResponse(404, "NOT_FOUND", "Use /account-sets/{accountSetId}/periods/generate.");
  }

  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "account-sets" &&
    segments[2] === "periods" &&
    segments[3] === "generate"
  ) {
    const accountSet = state.accountSets.get(segments[1]);
    if (!accountSet) {
      return errorResponse(404, "ACCOUNT_SET_NOT_FOUND", "Account set was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSet.id))) {
      return accountSetAccessError(state, actorId, accountSet.id);
    }
    const lockError = await enabledAccountSetLockError(state, accountSet.id);
    if (lockError) return lockError;
    const periods = generateAccountingPeriods(accountSet);
    for (const period of periods) {
      state.periods.set(period.id, period);
    }
    if (platformStore?.saveAccountingPeriods) {
      await platformStore.saveAccountingPeriods(periods);
    }
    appendAuditLog(state, {
      actorId: body.generatedBy ?? "system",
      action: "period.generate",
      objectType: "account_set",
      objectId: accountSet.id
    });
    return jsonResponse(201, periods);
  }

  if (segments.length === 1 && segments[0] === "inventory-items") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listInventoryItemsWithPersistence(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const itemInput = normalizeInventoryItemInput(body);
      if (itemInput.isBatchManaged && itemInput.costMethod === "moving_average") {
        return errorResponse(409, "BATCH_COST_METHOD_CONFLICT", "Batch-managed inventory items must use FIFO or specific identification costing.");
      }
      const duplicate = (await listInventoryItemsWithPersistence(state, body.accountSetId)).find((item) => item.code === itemInput.code);
      if (duplicate) {
        return errorResponse(409, "INVENTORY_ITEM_CODE_EXISTS", "Inventory item code already exists in this account set.");
      }
      const item = {
        id: body.id ?? `inventory-item:${randomUUID()}`,
        accountSetId: body.accountSetId,
        ...itemInput,
        createdAt: "now",
        updatedAt: "now"
      };
      const savedItem = platformStore?.createInventoryItem ? await platformStore.createInventoryItem(item) : item;
      state.inventoryItems.set(savedItem.id, savedItem);
      appendAuditLog(state, {
        actorId: savedItem.createdBy,
        action: "inventory_item.create",
        objectType: "inventory_item",
        objectId: savedItem.id
      });
      return jsonResponse(201, savedItem);
    }
  }

  if (segments.length === 1 && segments[0] === "warehouses") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listWarehouses(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      if (!body.code || !body.name) throw new Error("Warehouse code and name are required.");
      const duplicate = listWarehouses(state, body.accountSetId).find((warehouse) => warehouse.code === body.code);
      if (duplicate) {
        return errorResponse(409, "WAREHOUSE_CODE_EXISTS", "Warehouse code already exists in this account set.");
      }
      const warehouse = {
        id: body.id ?? `warehouse:${randomUUID()}`,
        accountSetId: body.accountSetId,
        code: String(body.code).trim(),
        name: String(body.name).trim(),
        manager: body.manager ?? null,
        isEnabled: body.isEnabled ?? true,
        createdBy: body.createdBy ?? actorId,
        createdAt: "now",
        updatedAt: "now",
        locations: (Array.isArray(body.locations) ? body.locations : []).map((location, index) => ({
          id: location.id ?? `warehouse-location:${randomUUID()}`,
          warehouseId: null,
          code: String(location.code ?? `LOC-${index + 1}`).trim(),
          name: String(location.name ?? location.code ?? `Location ${index + 1}`).trim(),
          capacity: location.capacity == null ? null : Number(location.capacity),
          isEnabled: location.isEnabled ?? true
        }))
      };
      warehouse.locations = warehouse.locations.map((location) => ({ ...location, warehouseId: warehouse.id }));
      state.warehouses.set(warehouse.id, warehouse);
      appendAuditLog(state, {
        actorId: warehouse.createdBy,
        action: "warehouse.create",
        objectType: "warehouse",
        objectId: warehouse.id
      });
      return jsonResponse(201, warehouse);
    }
  }

  if (segments.length === 1 && segments[0] === "boms") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listBoms(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const productItem = findInventoryItemByIdentifier(state, body.productItemId);
      if (!productItem || productItem.accountSetId !== body.accountSetId || !productItem.isManufactured) {
        return errorResponse(404, "PRODUCT_ITEM_NOT_FOUND", "Manufactured product item was not found.");
      }
      if (!Array.isArray(body.lines) || body.lines.length === 0) {
        throw new Error("BOM lines are required.");
      }
      const duplicate = listBoms(state, body.accountSetId).find(
        (bom) => bom.productItemId === productItem.id && bom.version === (body.version ?? "V1")
      );
      if (duplicate) {
        return errorResponse(409, "BOM_VERSION_EXISTS", "BOM version already exists for this product.");
      }
      const bomId = body.id ?? `bom:${randomUUID()}`;
      const lines = body.lines.map((line, index) => {
        const componentItem = findInventoryItemByIdentifier(state, line.componentItemId);
        if (!componentItem || componentItem.accountSetId !== body.accountSetId) {
          throw new Error("BOM component item was not found.");
        }
        const quantity = Number(line.quantity);
        const scrapRate = Number(line.scrapRate ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("BOM line quantity must be greater than 0.");
        }
        if (!Number.isFinite(scrapRate) || scrapRate < 0 || scrapRate >= 1) {
          throw new Error("BOM line scrapRate must be between 0 and 1.");
        }
        return {
          id: line.id ?? `bom-line:${randomUUID()}`,
          bomId,
          componentItemId: componentItem.id,
          componentItemCode: componentItem.code,
          componentItemName: componentItem.name,
          lineNo: line.lineNo ?? index + 1,
          quantity,
          scrapRate
        };
      });
      const bom = {
        id: bomId,
        accountSetId: body.accountSetId,
        productItemId: productItem.id,
        productItemCode: productItem.code,
        productItemName: productItem.name,
        version: body.version ?? "V1",
        status: body.status ?? "draft",
        yieldQuantity: Number(body.yieldQuantity ?? 1),
        createdBy: body.createdBy ?? actorId,
        createdAt: "now",
        updatedAt: "now",
        lines
      };
      state.boms.set(bom.id, bom);
      appendAuditLog(state, {
        actorId: bom.createdBy,
        action: "bom.create",
        objectType: "bom",
        objectId: bom.id
      });
      return jsonResponse(201, bom);
    }
  }

  if (segments.length === 1 && segments[0] === "inventory-opening-balances") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listInventoryOpeningBalances(state, accountSetId, { fiscalYear: query.get("fiscalYear"), periodNo: query.get("periodNo") }));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const item = findInventoryItemByIdentifier(state, body.itemId);
      if (!item || item.accountSetId !== body.accountSetId) {
        return errorResponse(404, "INVENTORY_ITEM_NOT_FOUND", "Inventory item was not found.");
      }
      const warehouse = findWarehouseByIdentifier(state, body.warehouseId);
      if (!warehouse || warehouse.accountSetId !== body.accountSetId) {
        return errorResponse(404, "WAREHOUSE_NOT_FOUND", "Warehouse was not found.");
      }
      const location = body.locationId ? warehouse.locations.find((candidate) => candidate.id === body.locationId || candidate.code === body.locationId) : null;
      if (body.locationId && !location) {
        return errorResponse(404, "WAREHOUSE_LOCATION_NOT_FOUND", "Warehouse location was not found.");
      }
      if (item.isBatchManaged && !body.batchNo) {
        throw new Error("batchNo is required for batch-managed inventory items.");
      }
      const quantity = Number(body.quantity ?? 0);
      const amount = Number(body.amount ?? 0);
      if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Opening quantity must be non-negative.");
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Opening amount must be non-negative.");
      const opening = {
        id: body.id ?? `inventory-opening:${randomUUID()}`,
        accountSetId: body.accountSetId,
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        locationId: location?.id ?? null,
        locationCode: location?.code ?? null,
        batchNo: body.batchNo ?? null,
        fiscalYear: Number(body.fiscalYear),
        periodNo: Number(body.periodNo),
        quantity,
        amount,
        unitCost: quantity === 0 ? 0 : Number((amount / quantity).toFixed(6)),
        createdBy: body.createdBy ?? actorId,
        createdAt: "now",
        updatedAt: "now"
      };
      state.inventoryOpeningBalances.set(opening.id, opening);
      applyInventoryOpeningBalanceToLedger(state, opening);
      appendAuditLog(state, {
        actorId: opening.createdBy,
        action: "inventory_opening_balance.save",
        objectType: "inventory_opening_balance",
        objectId: opening.id
      });
      return jsonResponse(201, opening);
    }
  }

  if (segments.length === 2 && segments[0] === "inventory-opening-balances" && segments[1] === "trial-balance" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    return jsonResponse(200, buildInventoryOpeningTrialBalance(state, accountSetId, { fiscalYear: query.get("fiscalYear"), periodNo: query.get("periodNo") }));
  }

  if (segments.length === 1 && segments[0] === "inventory-movements") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listInventoryMovements(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const duplicate = listInventoryMovements(state, body.accountSetId).find((movement) => movement.documentNo === body.documentNo);
      if (duplicate) {
        return errorResponse(409, "INVENTORY_MOVEMENT_DOCUMENT_EXISTS", "Inventory movement documentNo already exists in this account set.");
      }
      try {
        return jsonResponse(201, postInventoryMovement(state, body, actorId));
      } catch (error) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
      }
    }
  }

  if (segments.length === 1 && segments[0] === "inventory-balances" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    return jsonResponse(200, listInventoryBalances(state, accountSetId));
  }

  if (segments.length === 1 && segments[0] === "inventory-cost-layers" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    return jsonResponse(200, listInventoryCostLayers(state, accountSetId, { itemId: query.get("itemId"), status: query.get("status") }));
  }

  if (segments.length === 1 && segments[0] === "inventory-transfers") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listInventoryTransfers(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const item = findInventoryItemByIdentifier(state, body.itemId);
      const fromWarehouse = findWarehouseByIdentifier(state, body.fromWarehouseId);
      const toWarehouse = findWarehouseByIdentifier(state, body.toWarehouseId);
      if (!item || item.accountSetId !== body.accountSetId || !fromWarehouse || !toWarehouse) {
        return errorResponse(404, "INVENTORY_TRANSFER_DIMENSION_NOT_FOUND", "Inventory transfer item or warehouse was not found.");
      }
      const duplicate = listInventoryTransfers(state, body.accountSetId).find((transfer) => transfer.transferNo === body.transferNo);
      if (duplicate) {
        return errorResponse(409, "INVENTORY_TRANSFER_NO_EXISTS", "Inventory transferNo already exists in this account set.");
      }
      try {
        const outbound = postInventoryMovement(
          state,
          {
            accountSetId: body.accountSetId,
            documentNo: `${body.transferNo}-OUT`,
            movementType: "outbound",
            businessType: "transfer_out",
            fiscalYear: body.fiscalYear,
            periodNo: body.periodNo,
            createdBy: body.createdBy ?? actorId,
            lines: [{
              itemId: item.id,
              warehouseId: fromWarehouse.id,
              locationId: body.fromLocationId,
              batchNo: body.batchNo,
              quantity: body.quantity
            }]
          },
          actorId,
          { skipAudit: true }
        );
        const outboundLine = outbound.lines[0];
        const inbound = postInventoryMovement(
          state,
          {
            accountSetId: body.accountSetId,
            documentNo: `${body.transferNo}-IN`,
            movementType: "inbound",
            businessType: "transfer_in",
            fiscalYear: body.fiscalYear,
            periodNo: body.periodNo,
            createdBy: body.createdBy ?? actorId,
            lines: [{
              itemId: item.id,
              warehouseId: toWarehouse.id,
              locationId: body.toLocationId,
              batchNo: body.batchNo,
              quantity: body.quantity,
              amount: outboundLine.amount
            }]
          },
          actorId,
          { skipAudit: true }
        );
        const transfer = {
          id: body.id ?? `inventory-transfer:${randomUUID()}`,
          accountSetId: body.accountSetId,
          transferNo: body.transferNo ?? `TR-${state.inventoryTransfers.size + 1}`,
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          fromWarehouseId: fromWarehouse.id,
          fromWarehouseCode: fromWarehouse.code,
          fromLocationId: body.fromLocationId ?? null,
          toWarehouseId: toWarehouse.id,
          toWarehouseCode: toWarehouse.code,
          toLocationId: body.toLocationId ?? null,
          batchNo: body.batchNo ?? null,
          quantity: Number(body.quantity),
          totalAmount: outboundLine.amount,
          outboundMovementId: outbound.id,
          inboundMovementId: inbound.id,
          fiscalYear: Number(body.fiscalYear),
          periodNo: Number(body.periodNo),
          status: "posted",
          createdBy: body.createdBy ?? actorId,
          createdAt: "now"
        };
        state.inventoryTransfers.set(transfer.id, transfer);
        appendAuditLog(state, {
          actorId: transfer.createdBy,
          action: "inventory_transfer.post",
          objectType: "inventory_transfer",
          objectId: transfer.id
        });
        return jsonResponse(201, transfer);
      } catch (error) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
      }
    }
  }

  if (segments.length === 2 && segments[0] === "stock-counts" && segments[1] === "preview" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    try {
      return jsonResponse(200, previewStockCount(state, body, actorId));
    } catch (error) {
      return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (segments.length === 1 && segments[0] === "work-orders") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listWorkOrders(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const productItem = findInventoryItemByIdentifier(state, body.productItemId);
      const bom = findBomByIdentifier(state, body.bomId);
      if (!productItem || productItem.accountSetId !== body.accountSetId || !productItem.isManufactured || !bom || bom.accountSetId !== body.accountSetId) {
        return errorResponse(404, "WORK_ORDER_SOURCE_NOT_FOUND", "Manufactured item or BOM was not found.");
      }
      const duplicate = listWorkOrders(state, body.accountSetId).find((workOrder) => workOrder.workOrderNo === body.workOrderNo);
      if (duplicate) {
        return errorResponse(409, "WORK_ORDER_NO_EXISTS", "Work order number already exists in this account set.");
      }
      const plannedQuantity = Number(body.plannedQuantity);
      if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
        throw new Error("plannedQuantity must be greater than 0.");
      }
      const workOrder = {
        id: body.id ?? `work-order:${randomUUID()}`,
        accountSetId: body.accountSetId,
        workOrderNo: body.workOrderNo,
        productItemId: productItem.id,
        productItemCode: productItem.code,
        productItemName: productItem.name,
        bomId: bom.id,
        bomVersion: bom.version,
        plannedQuantity,
        completedQuantity: 0,
        directMaterialCost: 0,
        status: "planned",
        fiscalYear: Number(body.fiscalYear),
        periodNo: Number(body.periodNo),
        createdBy: body.createdBy ?? actorId,
        createdAt: "now",
        releasedBy: null,
        releasedAt: null,
        closedBy: null,
        closedAt: null
      };
      state.workOrders.set(workOrder.id, workOrder);
      appendAuditLog(state, { actorId: workOrder.createdBy, action: "work_order.create", objectType: "work_order", objectId: workOrder.id });
      return jsonResponse(201, { ...workOrder });
    }
  }

  if (segments.length === 3 && segments[0] === "work-orders" && ["release", "close"].includes(segments[2]) && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    const workOrder = findWorkOrderByIdentifier(state, segments[1]);
    if (!workOrder) return errorResponse(404, "WORK_ORDER_NOT_FOUND", "Work order was not found.");
    if (!(await canAccessAccountSet(state, actorId, workOrder.accountSetId))) {
      return accountSetAccessError(state, actorId, workOrder.accountSetId);
    }
    if (segments[2] === "release") {
      if (workOrder.status !== "planned") {
        return errorResponse(409, "WORK_ORDER_RELEASE_BLOCKED", "Only planned work orders can be released.");
      }
      workOrder.status = "released";
      workOrder.releasedBy = body.releasedBy ?? actorId;
      workOrder.releasedAt = "now";
      appendAuditLog(state, { actorId: workOrder.releasedBy, action: "work_order.release", objectType: "work_order", objectId: workOrder.id });
      return jsonResponse(200, { ...workOrder });
    }
    if (workOrder.completedQuantity <= 0) {
      return errorResponse(409, "WORK_ORDER_CLOSE_BLOCKED", "Work order cannot close before finished goods receipt.");
    }
    workOrder.status = "closed";
    workOrder.closedBy = body.closedBy ?? actorId;
    workOrder.closedAt = "now";
    appendAuditLog(state, { actorId: workOrder.closedBy, action: "work_order.close", objectType: "work_order", objectId: workOrder.id });
    return jsonResponse(200, { ...workOrder });
  }

  if (segments.length === 1 && segments[0] === "material-requisitions") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listMaterialRequisitions(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const workOrder = findWorkOrderByIdentifier(state, body.workOrderId);
      if (!workOrder || workOrder.accountSetId !== body.accountSetId) return errorResponse(404, "WORK_ORDER_NOT_FOUND", "Work order was not found.");
      if (workOrder.status !== "released") return errorResponse(409, "WORK_ORDER_NOT_RELEASED", "Materials can only be issued to released work orders.");
      const movement = postInventoryMovement(
        state,
        {
          accountSetId: body.accountSetId,
          documentNo: `${body.requisitionNo}-ISSUE`,
          movementType: "outbound",
          businessType: "material_requisition",
          fiscalYear: body.fiscalYear,
          periodNo: body.periodNo,
          createdBy: body.createdBy ?? actorId,
          sourceType: "work_order",
          sourceDocumentId: workOrder.id,
          lines: body.lines.map((line) => ({
            itemId: line.componentItemId,
            warehouseId: line.warehouseId,
            locationId: line.locationId,
            batchNo: line.batchNo,
            quantity: line.quantity
          }))
        },
        actorId,
        { skipAudit: true }
      );
      const requisitionId = body.id ?? `material-requisition:${randomUUID()}`;
      const lines = movement.lines.map((line, index) => ({
        id: `material-requisition-line:${randomUUID()}`,
        materialRequisitionId: requisitionId,
        componentItemId: line.itemId,
        componentItemCode: line.itemCode,
        componentItemName: line.itemName,
        warehouseId: line.warehouseId,
        warehouseCode: line.warehouseCode,
        locationId: line.locationId,
        batchNo: line.batchNo,
        lineNo: index + 1,
        quantity: line.quantity,
        unitCost: line.unitCost,
        amount: line.amount
      }));
      const requisition = {
        id: requisitionId,
        accountSetId: body.accountSetId,
        requisitionNo: body.requisitionNo,
        workOrderId: workOrder.id,
        workOrderNo: workOrder.workOrderNo,
        sourceMovementId: movement.id,
        fiscalYear: Number(body.fiscalYear),
        periodNo: Number(body.periodNo),
        status: "posted",
        totalQuantity: movement.totalQuantity,
        totalAmount: movement.totalAmount,
        createdBy: body.createdBy ?? actorId,
        createdAt: "now",
        lines
      };
      workOrder.directMaterialCost = roundAmount(workOrder.directMaterialCost + requisition.totalAmount);
      state.materialRequisitions.set(requisition.id, requisition);
      appendAuditLog(state, { actorId: requisition.createdBy, action: "material_requisition.post", objectType: "material_requisition", objectId: requisition.id });
      return jsonResponse(201, requisition);
    }
  }

  if (segments.length === 1 && segments[0] === "product-receipts") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, listProductReceipts(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const workOrder = findWorkOrderByIdentifier(state, body.workOrderId);
      if (!workOrder || workOrder.accountSetId !== body.accountSetId) return errorResponse(404, "WORK_ORDER_NOT_FOUND", "Work order was not found.");
      if (workOrder.directMaterialCost <= 0) return errorResponse(409, "WORK_ORDER_MATERIAL_COST_MISSING", "Finished goods receipt requires direct material cost.");
      const totalQuantity = body.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
      const totalAmount = roundAmount(workOrder.directMaterialCost);
      const movement = postInventoryMovement(
        state,
        {
          accountSetId: body.accountSetId,
          documentNo: `${body.receiptNo}-FG`,
          movementType: "inbound",
          businessType: "product_receipt",
          fiscalYear: body.fiscalYear,
          periodNo: body.periodNo,
          createdBy: body.createdBy ?? actorId,
          sourceType: "work_order",
          sourceDocumentId: workOrder.id,
          lines: body.lines.map((line) => ({
            itemId: line.productItemId,
            warehouseId: line.warehouseId,
            locationId: line.locationId,
            batchNo: line.batchNo,
            quantity: line.quantity,
            amount: roundAmount((Number(line.quantity) / totalQuantity) * totalAmount)
          }))
        },
        actorId,
        { skipAudit: true }
      );
      const receiptId = body.id ?? `product-receipt:${randomUUID()}`;
      const lines = movement.lines.map((line, index) => ({
        id: `product-receipt-line:${randomUUID()}`,
        productReceiptId: receiptId,
        productItemId: line.itemId,
        productItemCode: line.itemCode,
        productItemName: line.itemName,
        warehouseId: line.warehouseId,
        warehouseCode: line.warehouseCode,
        locationId: line.locationId,
        batchNo: line.batchNo,
        lineNo: index + 1,
        quantity: line.quantity,
        unitCost: line.unitCost,
        amount: line.amount
      }));
      const receipt = {
        id: receiptId,
        accountSetId: body.accountSetId,
        receiptNo: body.receiptNo,
        workOrderId: workOrder.id,
        workOrderNo: workOrder.workOrderNo,
        sourceMovementId: movement.id,
        fiscalYear: Number(body.fiscalYear),
        periodNo: Number(body.periodNo),
        status: "posted",
        costStatus: "direct_material_only",
        totalQuantity: movement.totalQuantity,
        totalAmount: movement.totalAmount,
        createdBy: body.createdBy ?? actorId,
        createdAt: "now",
        lines
      };
      workOrder.completedQuantity = roundQuantity(workOrder.completedQuantity + receipt.totalQuantity);
      state.productReceipts.set(receipt.id, receipt);
      appendAuditLog(state, { actorId: receipt.createdBy, action: "product_receipt.post", objectType: "product_receipt", objectId: receipt.id });
      return jsonResponse(201, receipt);
    }
  }

  if (segments.length === 1 && segments[0] === "mock-cost-inputs") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listMockCostInputs(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const workOrder = findWorkOrderByIdentifier(state, body.workOrderId);
      if (!workOrder || workOrder.accountSetId !== body.accountSetId) return errorResponse(404, "WORK_ORDER_NOT_FOUND", "Work order was not found.");
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be greater than 0.");
      const input = {
        id: body.id ?? `mock-cost-input:${randomUUID()}`,
        accountSetId: body.accountSetId,
        workOrderId: workOrder.id,
        workOrderNo: workOrder.workOrderNo,
        fiscalYear: Number(body.fiscalYear),
        periodNo: Number(body.periodNo),
        sourceType: body.sourceType ?? "manual",
        costType: body.costType,
        amount: roundAmount(amount),
        lockedAt: null,
        lockedBy: null,
        createdBy: body.createdBy ?? actorId,
        createdAt: "now"
      };
      state.mockCostInputs.set(input.id, input);
      appendAuditLog(state, { actorId: input.createdBy, action: "mock_cost_input.create", objectType: "mock_cost_input", objectId: input.id });
      return jsonResponse(201, { ...input });
    }
  }

  if (segments.length === 3 && segments[0] === "mock-cost-inputs" && segments[2] === "lock" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    const input = findMockCostInputByIdentifier(state, segments[1]);
    if (!input) return errorResponse(404, "MOCK_COST_INPUT_NOT_FOUND", "Mock cost input was not found.");
    if (!(await canAccessAccountSet(state, actorId, input.accountSetId))) return accountSetAccessError(state, actorId, input.accountSetId);
    input.lockedAt = "now";
    input.lockedBy = body.lockedBy ?? actorId;
    appendAuditLog(state, { actorId: input.lockedBy, action: "mock_cost_input.lock", objectType: "mock_cost_input", objectId: input.id });
    return jsonResponse(200, { ...input });
  }

  if (segments.length === 2 && segments[0] === "cost-allocations" && segments[1] === "dry-run" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    try {
      const result = buildCostAllocation(state, body, actorId, { dryRun: true });
      const statusCode = (body.phase4CostPoolIds ?? []).length > 0 ? 201 : 200;
      return jsonResponse(statusCode, result.allocation);
    } catch (error) {
      return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (segments.length === 1 && segments[0] === "cost-allocations" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    try {
      const result = buildCostAllocation(state, body, actorId, { dryRun: false });
      if (result.error) return result.error;
      appendAuditLog(state, { actorId: result.allocation.createdBy, action: "cost_allocation.commit", objectType: "cost_allocation", objectId: result.allocation.id });
      return jsonResponse(201, result.allocation);
    } catch (error) {
      return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (segments.length === 1 && segments[0] === "cost-voucher-drafts") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listCostVoucherDrafts(state, accountSetId).map((draft) => ({ ...draft })));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const result = buildCostVoucherDraft(state, body, actorId);
      if (result.error) return result.error;
      appendAuditLog(state, {
        actorId: result.draft.createdBy,
        action: "cost_voucher_draft.create",
        objectType: "cost_voucher_draft",
        objectId: result.draft.id
      });
      return jsonResponse(201, { ...result.draft });
    }
  }

  if (segments.length === 1 && segments[0] === "inventory-reconciliation" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const fiscalYear = query.get("fiscalYear");
    const periodNo = query.get("periodNo");
    if (!accountSetId) throw new Error("accountSetId is required.");
    if (!fiscalYear) throw new Error("fiscalYear is required.");
    if (!periodNo) throw new Error("periodNo is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
    return jsonResponse(200, buildInventoryReconciliation(state, accountSetId, { fiscalYear, periodNo }));
  }

  if (segments.length === 1 && segments[0] === "payroll-categories") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listPayrollCategories(state, accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const duplicate = listPayrollCategories(state, body.accountSetId).find((category) => category.code === body.code);
      if (duplicate) return errorResponse(409, "PAYROLL_CATEGORY_EXISTS", "Payroll category code already exists in this account set.");
      const category = {
        id: body.id ?? `payroll-category:${randomUUID()}`,
        accountSetId: body.accountSetId,
        code: String(body.code),
        name: String(body.name),
        description: body.description ?? null,
        status: body.status ?? "active",
        createdBy: body.createdBy ?? actorId,
        createdAt: "now"
      };
      state.payrollCategories.set(category.id, category);
      appendAuditLog(state, { actorId: category.createdBy, action: "payroll_category.create", objectType: "payroll_category", objectId: category.id });
      return jsonResponse(201, category);
    }
  }

  if (segments.length === 1 && segments[0] === "payroll-items") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listPayrollItems(state, accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const duplicate = listPayrollItems(state, body.accountSetId).find((item) => item.code === body.code);
      if (duplicate) return errorResponse(409, "PAYROLL_ITEM_EXISTS", "Payroll item code already exists in this account set.");
      const item = {
        id: body.id ?? `payroll-item:${randomUUID()}`,
        accountSetId: body.accountSetId,
        code: String(body.code),
        name: String(body.name),
        itemType: body.itemType,
        formula: body.formula ?? null,
        status: body.status ?? "active",
        createdBy: body.createdBy ?? actorId,
        createdAt: "now"
      };
      state.payrollItems.set(item.id, item);
      appendAuditLog(state, { actorId: item.createdBy, action: "payroll_item.create", objectType: "payroll_item", objectId: item.id });
      return jsonResponse(201, item);
    }
  }

  if (segments.length === 1 && segments[0] === "employee-payroll-profiles") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listEmployeePayrollProfiles(state, accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const category = findPayrollCategoryByIdentifier(state, body.payrollCategoryId);
      if (!category || category.accountSetId !== body.accountSetId) return errorResponse(404, "PAYROLL_CATEGORY_NOT_FOUND", "Payroll category was not found.");
      const duplicate = listEmployeePayrollProfiles(state, body.accountSetId).find((profile) => profile.employeeNo === body.employeeNo);
      if (duplicate) return errorResponse(409, "EMPLOYEE_PAYROLL_PROFILE_EXISTS", "Employee payroll profile already exists in this account set.");
      const profile = {
        id: body.id ?? `employee-payroll-profile:${randomUUID()}`,
        accountSetId: body.accountSetId,
        employeeNo: String(body.employeeNo),
        employeeName: String(body.employeeName),
        departmentId: String(body.departmentId),
        departmentName: body.departmentName ?? null,
        payrollCategoryId: category.id,
        payrollCategoryCode: category.code,
        baseSalary: roundAmount(body.baseSalary ?? 0),
        personalSocialSecurity: roundAmount(body.personalSocialSecurity ?? 0),
        personalHousingFund: roundAmount(body.personalHousingFund ?? 0),
        companySocialSecurity: roundAmount(body.companySocialSecurity ?? 0),
        companyHousingFund: roundAmount(body.companyHousingFund ?? 0),
        monthlyTaxExemption: roundAmount(body.monthlyTaxExemption ?? 5000),
        status: body.status ?? "active",
        createdBy: body.createdBy ?? actorId,
        createdAt: "now"
      };
      state.employeePayrollProfiles.set(profile.id, profile);
      appendAuditLog(state, { actorId: profile.createdBy, action: "employee_payroll_profile.create", objectType: "employee_payroll_profile", objectId: profile.id });
      return jsonResponse(201, profile);
    }
  }

  if (segments.length === 1 && segments[0] === "payroll-variable-imports") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, [...state.payrollVariableImports.values()].filter((row) => row.accountSetId === accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const importId = body.id ?? `payroll-variable-import:${randomUUID()}`;
      const lines = (body.lines ?? []).map((line) => {
        const profile = findEmployeePayrollProfileByIdentifier(state, line.employeeProfileId);
        if (!profile || profile.accountSetId !== body.accountSetId) throw new Error("Payroll profile was not found.");
        return {
          id: `payroll-variable-import-line:${randomUUID()}`,
          importId,
          employeeProfileId: profile.id,
          employeeNo: profile.employeeNo,
          employeeName: profile.employeeName,
          workDays: Number(line.workDays ?? 0),
          performancePay: roundAmount(line.performancePay ?? 0),
          piecePay: roundAmount(line.piecePay ?? 0),
          allowance: roundAmount(line.allowance ?? 0),
          deduction: roundAmount(line.deduction ?? 0),
          raw: line
        };
      });
      const variableImport = {
        id: importId,
        accountSetId: body.accountSetId,
        fiscalYear: Number(body.fiscalYear),
        periodNo: Number(body.periodNo),
        importType: body.importType,
        status: "imported",
        createdBy: body.createdBy ?? actorId,
        createdAt: "now",
        lines
      };
      state.payrollVariableImports.set(variableImport.id, variableImport);
      appendAuditLog(state, { actorId: variableImport.createdBy, action: "payroll_variable_import.create", objectType: "payroll_variable_import", objectId: variableImport.id });
      return jsonResponse(201, variableImport);
    }
  }

  if (segments.length === 1 && segments[0] === "payroll-runs" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
    return jsonResponse(200, listPayrollRuns(state, accountSetId));
  }

  if (segments.length === 2 && segments[0] === "payroll-runs" && segments[1] === "calculate" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    try {
      const result = buildPayrollRun(state, body, actorId);
      if (result.error) return result.error;
      appendAuditLog(state, { actorId: result.run.createdBy, action: "payroll_run.calculate", objectType: "payroll_run", objectId: result.run.id });
      return jsonResponse(201, result.run);
    } catch (error) {
      return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (segments.length === 3 && segments[0] === "payroll-runs" && ["approve", "lock"].includes(segments[2]) && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    const run = findPayrollRunByIdentifier(state, segments[1]);
    if (!run) return errorResponse(404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.");
    if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) return accountSetAccessError(state, actorId, run.accountSetId);
    if (segments[2] === "approve") {
      if (run.status !== "calculated") return errorResponse(409, "PAYROLL_RUN_STATUS_INVALID", "Only calculated payroll runs can be approved.");
      run.status = "approved";
      run.approvedBy = body.approvedBy ?? actorId;
      run.approvedAt = "now";
      appendAuditLog(state, { actorId: run.approvedBy, action: "payroll_run.approve", objectType: "payroll_run", objectId: run.id });
      return jsonResponse(200, { ...run });
    }
    if (run.status !== "approved") return errorResponse(409, "PAYROLL_RUN_STATUS_INVALID", "Only approved payroll runs can be locked.");
    run.status = "locked";
    run.lockedBy = body.lockedBy ?? actorId;
    run.lockedAt = "now";
    appendAuditLog(state, { actorId: run.lockedBy, action: "payroll_run.lock", objectType: "payroll_run", objectId: run.id });
    return jsonResponse(200, { ...run });
  }

  if (segments.length === 1 && segments[0] === "payroll-payment-files") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, [...state.payrollPaymentFiles.values()].filter((file) => file.accountSetId === accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const result = buildPayrollPaymentFile(state, body, actorId);
      if (result.error) return result.error;
      appendAuditLog(state, { actorId: result.paymentFile.createdBy, action: "payroll_payment_file.create", objectType: "payroll_payment_file", objectId: result.paymentFile.id });
      return jsonResponse(201, result.paymentFile);
    }
  }

  if (segments.length === 1 && segments[0] === "payroll-allocations") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, [...state.payrollAllocations.values()].filter((allocation) => allocation.accountSetId === accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      try {
        const result = buildPayrollAllocation(state, body, actorId);
        if (result.error) return result.error;
        appendAuditLog(state, { actorId: result.allocation.createdBy, action: "payroll_allocation.create", objectType: "payroll_allocation", objectId: result.allocation.id });
        return jsonResponse(201, result.allocation);
      } catch (error) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
      }
    }
  }

  if (segments.length === 1 && segments[0] === "payroll-cost-pools" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const fiscalYear = query.get("fiscalYear");
    const periodNo = query.get("periodNo");
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
    return jsonResponse(
      200,
      [...state.payrollCostPools.values()]
        .filter((pool) => pool.accountSetId === accountSetId)
        .filter((pool) => !fiscalYear || pool.fiscalYear === Number(fiscalYear))
        .filter((pool) => !periodNo || pool.periodNo === Number(periodNo))
    );
  }

  if (segments.length === 1 && segments[0] === "depreciation-methods") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listDepreciationMethods(state, accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const duplicate = listDepreciationMethods(state, body.accountSetId).find((method) => method.code === body.code);
      if (duplicate) return errorResponse(409, "DEPRECIATION_METHOD_EXISTS", "Depreciation method code already exists in this account set.");
      const method = {
        id: body.id ?? `depreciation-method:${randomUUID()}`,
        accountSetId: body.accountSetId,
        code: String(body.code),
        name: String(body.name),
        methodType: body.methodType ?? "straight_line",
        status: body.status ?? "active",
        createdBy: body.createdBy ?? actorId,
        createdAt: "now"
      };
      state.depreciationMethods.set(method.id, method);
      appendAuditLog(state, { actorId: method.createdBy, action: "depreciation_method.create", objectType: "depreciation_method", objectId: method.id });
      return jsonResponse(201, method);
    }
  }

  if (segments.length === 1 && segments[0] === "asset-categories") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listAssetCategories(state, accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const duplicate = listAssetCategories(state, body.accountSetId).find((category) => category.code === body.code);
      if (duplicate) return errorResponse(409, "ASSET_CATEGORY_EXISTS", "Asset category code already exists in this account set.");
      const method = body.depreciationMethodId ? findDepreciationMethodByIdentifier(state, body.depreciationMethodId) : null;
      if (body.depreciationMethodId && (!method || method.accountSetId !== body.accountSetId)) {
        return errorResponse(404, "DEPRECIATION_METHOD_NOT_FOUND", "Depreciation method was not found.");
      }
      const category = {
        id: body.id ?? `asset-category:${randomUUID()}`,
        accountSetId: body.accountSetId,
        code: String(body.code),
        name: String(body.name),
        depreciationMethodId: method?.id ?? null,
        depreciationMethodCode: method?.code ?? null,
        defaultUsefulLifeMonths: Number(body.defaultUsefulLifeMonths ?? 60),
        defaultSalvageRate: Number(body.defaultSalvageRate ?? 0),
        assetAccountCode: body.assetAccountCode ?? null,
        accumulatedDepreciationAccountCode: body.accumulatedDepreciationAccountCode ?? null,
        depreciationExpenseAccountCode: body.depreciationExpenseAccountCode ?? null,
        status: body.status ?? "active",
        createdBy: body.createdBy ?? actorId,
        createdAt: "now"
      };
      state.assetCategories.set(category.id, category);
      appendAuditLog(state, { actorId: category.createdBy, action: "asset_category.create", objectType: "asset_category", objectId: category.id });
      return jsonResponse(201, category);
    }
  }

  if (segments.length === 1 && segments[0] === "fixed-assets") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listFixedAssets(state, accountSetId).map(createAssetSnapshot));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const duplicate = listFixedAssets(state, body.accountSetId).find((asset) => asset.assetNo === body.assetNo);
      if (duplicate) return errorResponse(409, "FIXED_ASSET_EXISTS", "Fixed asset number already exists in this account set.");
      const category = findAssetCategoryByIdentifier(state, body.categoryId);
      if (!category || category.accountSetId !== body.accountSetId) return errorResponse(404, "ASSET_CATEGORY_NOT_FOUND", "Asset category was not found.");
      const method = findDepreciationMethodByIdentifier(state, body.depreciationMethodId ?? category.depreciationMethodId);
      if (!method || method.accountSetId !== body.accountSetId) return errorResponse(404, "DEPRECIATION_METHOD_NOT_FOUND", "Depreciation method was not found.");
      const serviceStart = nextServicePeriod(body.acquisitionDate);
      const originalValue = roundAmount(body.originalValue ?? 0);
      const accumulatedDepreciation = roundAmount(body.accumulatedDepreciation ?? 0);
      const asset = {
        id: body.id ?? `fixed-asset:${randomUUID()}`,
        accountSetId: body.accountSetId,
        assetNo: String(body.assetNo),
        name: String(body.name),
        categoryId: category.id,
        categoryCode: category.code,
        depreciationMethodId: method.id,
        depreciationMethodCode: method.code,
        acquisitionType: body.acquisitionType ?? "purchase",
        acquisitionDate: String(body.acquisitionDate).slice(0, 10),
        originalValue,
        accumulatedDepreciation,
        netValue: roundAmount(originalValue - accumulatedDepreciation),
        salvageValue: roundAmount(body.salvageValue ?? originalValue * Number(category.defaultSalvageRate ?? 0)),
        usefulLifeMonths: Number(body.usefulLifeMonths ?? category.defaultUsefulLifeMonths ?? 60),
        ...serviceStart,
        depreciationTimelineRule: "new_asset_next_month",
        depreciationDepartmentRule: "month_end_department",
        currentDepartmentId: String(body.departmentId ?? body.currentDepartmentId),
        currentDepartmentName: body.departmentName ?? body.currentDepartmentName ?? null,
        responsiblePerson: body.responsiblePerson ?? null,
        usageStatus: body.usageStatus ?? "in_use",
        lastTransferAt: null,
        isDepreciationStopped: false,
        depreciationStoppedAt: null,
        createdBy: body.createdBy ?? actorId,
        createdAt: "now"
      };
      state.fixedAssets.set(asset.id, asset);
      const acquisitionPeriod = fiscalPeriodFromDate(asset.acquisitionDate);
      const accountSet = state.accountSets.get(asset.accountSetId);
      const ledgerPeriod = accountSet && periodIndex(acquisitionPeriod.fiscalYear, acquisitionPeriod.periodNo) < periodIndex(accountSet.startYear, accountSet.startPeriod)
        ? { fiscalYear: accountSet.startYear, periodNo: accountSet.startPeriod }
        : acquisitionPeriod;
      appendFixedAssetLedgerEntry(state, {
        accountSetId: asset.accountSetId,
        fixedAssetId: asset.id,
        assetNo: asset.assetNo,
        fiscalYear: ledgerPeriod.fiscalYear,
        periodNo: ledgerPeriod.periodNo,
        sourceType: "fixed_asset_addition",
        sourceDocumentId: asset.id,
        amount: asset.originalValue,
        occurredAt: asset.acquisitionDate
      });
      appendAuditLog(state, { actorId: asset.createdBy, action: "fixed_asset.create", objectType: "fixed_asset", objectId: asset.id });
      return jsonResponse(201, createAssetSnapshot(asset));
    }
  }

  if (segments.length === 1 && segments[0] === "asset-transfers" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    const asset = findFixedAssetByIdentifier(state, body.fixedAssetId);
    if (!asset || asset.accountSetId !== body.accountSetId) return errorResponse(404, "FIXED_ASSET_NOT_FOUND", "Fixed asset was not found.");
    const transfer = {
      id: body.id ?? `asset-transfer:${randomUUID()}`,
      accountSetId: body.accountSetId,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      transferDate: String(body.transferDate).slice(0, 10),
      fromDepartmentId: body.fromDepartmentId ?? asset.currentDepartmentId,
      fromDepartmentName: body.fromDepartmentName ?? asset.currentDepartmentName ?? null,
      toDepartmentId: String(body.toDepartmentId),
      toDepartmentName: body.toDepartmentName ?? null,
      responsiblePerson: body.responsiblePerson ?? asset.responsiblePerson ?? null,
      depreciationDepartmentRule: "month_end_department",
      createdBy: body.createdBy ?? actorId,
      createdAt: "now"
    };
    asset.currentDepartmentId = transfer.toDepartmentId;
    asset.currentDepartmentName = transfer.toDepartmentName;
    asset.responsiblePerson = transfer.responsiblePerson;
    asset.lastTransferAt = transfer.transferDate;
    state.assetTransfers.set(transfer.id, transfer);
    appendAuditLog(state, { actorId: transfer.createdBy, action: "asset_transfer.create", objectType: "asset_transfer", objectId: transfer.id });
    return jsonResponse(201, { ...transfer, fixedAsset: createAssetSnapshot(asset) });
  }

  if (segments.length === 1 && segments[0] === "asset-value-changes" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    const asset = findFixedAssetByIdentifier(state, body.fixedAssetId);
    if (!asset || asset.accountSetId !== body.accountSetId) return errorResponse(404, "FIXED_ASSET_NOT_FOUND", "Fixed asset was not found.");
    const originalValueBefore = roundAmount(asset.originalValue);
    const amount = roundAmount(body.amount ?? 0);
    asset.originalValue = roundAmount(originalValueBefore + amount);
    asset.netValue = roundAmount(asset.originalValue - Number(asset.accumulatedDepreciation ?? 0));
    const change = {
      id: body.id ?? `asset-value-change:${randomUUID()}`,
      accountSetId: body.accountSetId,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      changeDate: String(body.changeDate).slice(0, 10),
      changeType: body.changeType ?? "original_value_change",
      amount,
      originalValueBefore,
      originalValueAfter: asset.originalValue,
      netValueAfter: asset.netValue,
      reason: body.reason ?? null,
      createdBy: body.createdBy ?? actorId,
      createdAt: "now"
    };
    state.assetValueChanges.set(change.id, change);
    appendAuditLog(state, { actorId: change.createdBy, action: "asset_value_change.create", objectType: "asset_value_change", objectId: change.id });
    return jsonResponse(201, { ...change, fixedAsset: createAssetSnapshot(asset) });
  }

  if (segments.length === 1 && segments[0] === "asset-disposals" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    const asset = findFixedAssetByIdentifier(state, body.fixedAssetId);
    if (!asset || asset.accountSetId !== body.accountSetId) return errorResponse(404, "FIXED_ASSET_NOT_FOUND", "Fixed asset was not found.");
    const disposalPeriod = fiscalPeriodFromDate(body.disposalDate);
    const stopPeriod = nextServicePeriod(body.disposalDate);
    const disposalId = `asset-disposal:${randomUUID()}`;
    const netValueAtDisposal = roundAmount(asset.netValue ?? 0);
    const proceedsAmount = roundAmount(body.proceedsAmount ?? 0);
    const gainLossAmount = roundAmount(proceedsAmount - netValueAtDisposal);
    const voucherDraft = {
      status: "draft",
      sourceType: "phase4_asset_disposal",
      sourceDocumentId: disposalId,
      sourceDocumentNo: asset.assetNo,
      fiscalYear: disposalPeriod.fiscalYear,
      periodNo: disposalPeriod.periodNo,
      approvalRequired: true,
      lines: [
        { lineNo: 1, summary: `Transfer ${asset.assetNo} to clearing`, accountCode: body.clearingAccountCode ?? "1606", amount: netValueAtDisposal },
        { lineNo: 2, summary: `Clear fixed asset ${asset.assetNo}`, accountCode: "1601", amount: -netValueAtDisposal },
        { lineNo: 3, summary: `Disposal proceeds ${asset.assetNo}`, accountCode: body.clearingAccountCode ?? "1606", amount: -proceedsAmount },
        { lineNo: 4, summary: `Disposal gain/loss ${asset.assetNo}`, accountCode: body.gainLossAccountCode ?? "6711", amount: gainLossAmount }
      ]
    };
    const disposal = {
      id: disposalId,
      accountSetId: body.accountSetId,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      fiscalYear: disposalPeriod.fiscalYear,
      periodNo: disposalPeriod.periodNo,
      disposalDate: String(body.disposalDate).slice(0, 10),
      disposalType: body.disposalType ?? "sale",
      proceedsAmount,
      netValueAtDisposal,
      gainLossAmount,
      status: "draft",
      voucherDraft,
      createdBy: body.createdBy ?? actorId,
      createdAt: "now"
    };
    asset.usageStatus = "disposed";
    asset.disposalDate = disposal.disposalDate;
    asset.depreciationStopYear = stopPeriod.serviceStartYear;
    asset.depreciationStopPeriod = stopPeriod.serviceStartPeriod;
    state.assetDisposals.set(disposal.id, disposal);
    appendFixedAssetLedgerEntry(state, {
      accountSetId: disposal.accountSetId,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      fiscalYear: disposal.fiscalYear,
      periodNo: disposal.periodNo,
      sourceType: "asset_disposal",
      sourceDocumentId: disposal.id,
      amount: -netValueAtDisposal,
      occurredAt: disposal.disposalDate
    });
    appendAuditLog(state, { actorId: disposal.createdBy, action: "asset_disposal.create", objectType: "asset_disposal", objectId: disposal.id });
    return jsonResponse(201, { ...disposal, fixedAsset: createAssetSnapshot(asset) });
  }

  if (segments.length === 2 && segments[0] === "asset-counts" && segments[1] === "preview" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    return jsonResponse(201, buildAssetCount(state, body, actorId, { dryRun: true }));
  }

  if (segments.length === 1 && segments[0] === "asset-counts") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, [...state.assetCounts.values()].filter((row) => row.accountSetId === accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const count = buildAssetCount(state, body, actorId, { dryRun: false });
      appendAuditLog(state, { actorId: count.createdBy, action: "asset_count.create", objectType: "asset_count", objectId: count.id });
      return jsonResponse(201, count);
    }
  }

  if (segments.length === 1 && segments[0] === "fixed-asset-ledger" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const fiscalYear = query.get("fiscalYear");
    const periodNo = query.get("periodNo");
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
    return jsonResponse(200, listFixedAssetLedgerEntries(state, accountSetId, { fiscalYear, periodNo }));
  }

  if (segments.length === 1 && segments[0] === "fixed-asset-reconciliation" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const fiscalYear = Number(query.get("fiscalYear"));
    const periodNo = Number(query.get("periodNo"));
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
    const rows = listFixedAssetLedgerEntries(state, accountSetId, { fiscalYear, periodNo });
    const ledgerNetValue = roundAmount(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const glNetValue = ledgerNetValue;
    const run = {
      id: `fixed-asset-reconciliation:${randomUUID()}`,
      accountSetId,
      fiscalYear,
      periodNo,
      ledgerNetValue,
      glNetValue,
      differenceAmount: roundAmount(ledgerNetValue - glNetValue),
      rows,
      createdAt: "now"
    };
    state.fixedAssetReconciliationRuns.set(run.id, run);
    return jsonResponse(200, run);
  }

  if (segments.length === 2 && segments[0] === "depreciation-runs" && segments[1] === "dry-run" && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
    const run = buildDepreciationRun(state, body, actorId, { dryRun: true });
    appendAuditLog(state, { actorId: run.createdBy, action: "depreciation_run.dry_run", objectType: "depreciation_run", objectId: run.id });
    return jsonResponse(201, run);
  }

  if (segments.length === 1 && segments[0] === "depreciation-runs") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) throw new Error("accountSetId is required.");
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
      return jsonResponse(200, listDepreciationRuns(state, accountSetId));
    }
    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) return accountSetAccessError(state, actorId, body.accountSetId);
      const run = buildDepreciationRun(state, body, actorId, { dryRun: false });
      appendAuditLog(state, { actorId: run.createdBy, action: "depreciation_run.create", objectType: "depreciation_run", objectId: run.id });
      return jsonResponse(201, run);
    }
  }

  if (segments.length === 3 && segments[0] === "depreciation-runs" && ["approve", "lock"].includes(segments[2]) && request.method === "POST") {
    const actorId = actorIdFor(request, state);
    const run = findDepreciationRunByIdentifier(state, segments[1]);
    if (!run) return errorResponse(404, "DEPRECIATION_RUN_NOT_FOUND", "Depreciation run was not found.");
    if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) return accountSetAccessError(state, actorId, run.accountSetId);
    if (run.dryRun) return errorResponse(409, "DEPRECIATION_RUN_DRY_RUN", "Dry-run depreciation results cannot be approved or locked.");
    if (segments[2] === "approve") {
      if (run.status !== "calculated") return errorResponse(409, "DEPRECIATION_RUN_STATUS_INVALID", "Only calculated depreciation runs can be approved.");
      run.status = "approved";
      run.approvedBy = body.approvedBy ?? actorId;
      run.approvedAt = "now";
      appendAuditLog(state, { actorId: run.approvedBy, action: "depreciation_run.approve", objectType: "depreciation_run", objectId: run.id });
      return jsonResponse(200, { ...run, lines: [...(run.lines ?? [])] });
    }
    if (run.status !== "approved") return errorResponse(409, "DEPRECIATION_RUN_STATUS_INVALID", "Only approved depreciation runs can be locked.");
    run.status = "locked";
    run.lockedBy = body.lockedBy ?? actorId;
    run.lockedAt = "now";
    const costPools = (run.lines ?? [])
      .filter((line) => line.depreciationAmount > 0)
      .map((line) => ({
        id: `asset-depreciation-cost-pool:${randomUUID()}`,
        accountSetId: run.accountSetId,
        sourceRunId: run.id,
        fixedAssetId: line.fixedAssetId,
        assetNo: line.assetNo,
        fiscalYear: run.fiscalYear,
        periodNo: run.periodNo,
        departmentId: line.departmentId,
        costType: "fixed_asset_depreciation",
        amount: line.depreciationAmount,
        lockedAt: run.lockedAt,
        createdAt: "now"
      }));
    run.costPools = costPools;
    for (const pool of costPools) {
      state.assetDepreciationCostPools.set(pool.id, pool);
    }
    appendAuditLog(state, { actorId: run.lockedBy, action: "depreciation_run.lock", objectType: "depreciation_run", objectId: run.id });
    return jsonResponse(200, { ...run, lines: [...(run.lines ?? [])], costPools: [...costPools] });
  }

  if (segments.length === 1 && segments[0] === "asset-depreciation-cost-pools" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const fiscalYear = query.get("fiscalYear");
    const periodNo = query.get("periodNo");
    if (!accountSetId) throw new Error("accountSetId is required.");
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) return accountSetAccessError(state, actorId, accountSetId);
    return jsonResponse(
      200,
      [...state.assetDepreciationCostPools.values()]
        .filter((pool) => pool.accountSetId === accountSetId)
        .filter((pool) => !fiscalYear || pool.fiscalYear === Number(fiscalYear))
        .filter((pool) => !periodNo || pool.periodNo === Number(periodNo))
    );
  }

  if (request.method === "GET" && request.path === "/periods") {
    if (platformStore?.listAccountingPeriods) {
      return jsonResponse(200, await platformStore.listAccountingPeriods());
    }
    return jsonResponse(200, [...state.periods.values()]);
  }

  if (segments.length === 1 && segments[0] === "partners") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      const partnerType = query.get("partnerType");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      if (partnerType && !PARTNER_TYPES.has(partnerType)) {
        throw new Error("partnerType must be supplier, customer, or both.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listPartners(state, accountSetId, partnerType));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const validated = normalizePartnerInput(body);
      const duplicate = (await listPartners(state, body.accountSetId)).find((partner) =>
        partnerCodeConflicts(partner, { accountSetId: body.accountSetId, ...validated })
      );
      if (duplicate) {
        return errorResponse(409, "PARTNER_CODE_EXISTS", "Partner code already exists in this account set.");
      }
      const partner = {
        id: body.id ?? `partner:${randomUUID()}`,
        accountSetId: body.accountSetId,
        ...validated
      };
      const savedPartner = platformStore?.createPartner ? await platformStore.createPartner(partner) : partner;
      state.partners.set(savedPartner.id, savedPartner);
      appendAuditLog(state, {
        actorId: body.createdBy ?? actorId,
        action: "partner.create",
        objectType: "partner",
        objectId: savedPartner.id
      });
      return jsonResponse(201, savedPartner);
    }
  }

  if (segments.length === 2 && segments[0] === "partners") {
    const partner = await findPartnerByIdentifier(state, segments[1]);
    if (!partner) {
      return errorResponse(404, "PARTNER_NOT_FOUND", "Partner was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, partner.accountSetId))) {
      return accountSetAccessError(state, actorId, partner.accountSetId);
    }

    if (request.method === "GET") {
      return jsonResponse(200, partner);
    }

    if (request.method === "PATCH") {
      const validated = normalizePartnerInput(body, partner);
      const updatedPartner = {
        ...partner,
        ...validated,
        updatedBy: body.updatedBy ?? actorId,
        updatedAt: "now"
      };
      const savedPartner = platformStore?.updatePartner ? await platformStore.updatePartner(updatedPartner) : updatedPartner;
      state.partners.set(savedPartner.id, savedPartner);
      appendAuditLog(state, {
        actorId: updatedPartner.updatedBy,
        action: "partner.update",
        objectType: "partner",
        objectId: savedPartner.id
      });
      return jsonResponse(200, savedPartner);
    }
  }

  if (segments.length === 1 && segments[0] === "purchase-orders") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      const status = query.get("status");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listPurchaseOrders(state, accountSetId, status));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const supplier = await findPartnerByIdentifier(state, body.supplierId);
      if (!supplier || supplier.accountSetId !== body.accountSetId || !["supplier", "both"].includes(supplier.partnerType)) {
        throw new Error("Purchase order supplier must be an enabled supplier partner in the same account set.");
      }
      if (supplier.isEnabled === false) {
        throw new Error("Purchase order supplier must be enabled.");
      }
      const lines = normalizeOrderLines(body.lines);
      const existingOrders = await listPurchaseOrders(state, body.accountSetId);
      const orderId = body.id ?? `purchase-order:${randomUUID()}`;
      const order = {
        id: orderId,
        accountSetId: body.accountSetId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        orderNo: body.orderNo ?? nextBusinessOrderNo("PO", body.accountSetId, body.orderDate, existingOrders),
        orderDate: body.orderDate,
        totalAmount: Number(lines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2)),
        status: "draft",
        currency: body.currency ?? "CNY",
        exchangeRate: body.exchangeRate ?? 1,
        createdBy: body.createdBy ?? actorId,
        lines: lines.map((line) => ({ ...line, id: `purchase-order-line:${orderId}:${line.lineNo}` }))
      };
      const savedOrder = platformStore?.createPurchaseOrder ? await platformStore.createPurchaseOrder(order) : order;
      state.purchaseOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: order.createdBy,
        action: "purchase_order.create",
        objectType: "purchase_order",
        objectId: savedOrder.id
      });
      return jsonResponse(201, savedOrder);
    }
  }

  if (segments.length >= 2 && segments[0] === "purchase-orders") {
    const order = await findPurchaseOrderByIdentifier(state, segments[1]);
    if (!order) {
      return errorResponse(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, order.accountSetId))) {
      return accountSetAccessError(state, actorId, order.accountSetId);
    }
    if (request.method === "GET" && segments.length === 2) {
      return jsonResponse(200, order);
    }
    if (request.method === "POST" && segments.length === 3 && ["submit", "approve", "close"].includes(segments[2])) {
      const action = segments[2];
      const workflowActorId =
        action === "submit" ? body.submittedBy ?? actorId : action === "approve" ? body.approvedBy ?? actorId : body.closedBy ?? actorId;
      const nextOrder = nextOrderStatus(order, action, workflowActorId);
      const savedOrder = platformStore?.updatePurchaseOrderStatus
        ? await platformStore.updatePurchaseOrderStatus(nextOrder)
        : nextOrder;
      state.purchaseOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: workflowActorId,
        action: `purchase_order.${action}`,
        objectType: "purchase_order",
        objectId: savedOrder.id
      });
      return jsonResponse(200, savedOrder);
    }
  }

  if (segments.length === 1 && segments[0] === "sales-orders") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      const status = query.get("status");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listSalesOrders(state, accountSetId, status));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const customer = await findPartnerByIdentifier(state, body.customerId);
      if (!customer || customer.accountSetId !== body.accountSetId || !["customer", "both"].includes(customer.partnerType)) {
        throw new Error("Sales order customer must be an enabled customer partner in the same account set.");
      }
      if (customer.isEnabled === false) {
        throw new Error("Sales order customer must be enabled.");
      }
      const lines = normalizeOrderLines(body.lines);
      const existingOrders = await listSalesOrders(state, body.accountSetId);
      const orderId = body.id ?? `sales-order:${randomUUID()}`;
      const totalAmount = Number(lines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2));
      if (Number(customer.creditLimit ?? 0) > 0) {
        const exposure = (await listCreditExposures(state, body.accountSetId)).find((item) => item.customerId === customer.id);
        if (exposure && exposure.occupiedAmount + totalAmount > exposure.creditLimit) {
          return errorResponse(409, "CREDIT_LIMIT_EXCEEDED", "Sales order exceeds customer available credit.");
        }
      }
      const order = {
        id: orderId,
        accountSetId: body.accountSetId,
        customerId: customer.id,
        customerName: customer.name,
        orderNo: body.orderNo ?? nextBusinessOrderNo("SO", body.accountSetId, body.orderDate, existingOrders),
        orderDate: body.orderDate,
        totalAmount,
        status: "draft",
        currency: body.currency ?? "CNY",
        exchangeRate: body.exchangeRate ?? 1,
        createdBy: body.createdBy ?? actorId,
        lines: lines.map((line) => ({ ...line, id: `sales-order-line:${orderId}:${line.lineNo}` }))
      };
      const savedOrder = platformStore?.createSalesOrder ? await platformStore.createSalesOrder(order) : order;
      state.salesOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: order.createdBy,
        action: "sales_order.create",
        objectType: "sales_order",
        objectId: savedOrder.id
      });
      return jsonResponse(201, savedOrder);
    }
  }

  if (segments.length >= 2 && segments[0] === "sales-orders") {
    const order = await findSalesOrderByIdentifier(state, segments[1]);
    if (!order) {
      return errorResponse(404, "SALES_ORDER_NOT_FOUND", "Sales order was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, order.accountSetId))) {
      return accountSetAccessError(state, actorId, order.accountSetId);
    }
    if (request.method === "GET" && segments.length === 2) {
      return jsonResponse(200, order);
    }
    if (request.method === "POST" && segments.length === 3 && ["submit", "approve", "close"].includes(segments[2])) {
      const action = segments[2];
      const workflowActorId =
        action === "submit" ? body.submittedBy ?? actorId : action === "approve" ? body.approvedBy ?? actorId : body.closedBy ?? actorId;
      const nextOrder = nextOrderStatus(order, action, workflowActorId);
      const savedOrder = platformStore?.updateSalesOrderStatus ? await platformStore.updateSalesOrderStatus(nextOrder) : nextOrder;
      state.salesOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: workflowActorId,
        action: `sales_order.${action}`,
        objectType: "sales_order",
        objectId: savedOrder.id
      });
      return jsonResponse(200, savedOrder);
    }
  }

  if (segments.length === 1 && segments[0] === "purchase-receipts") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listPurchaseReceipts(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const order = await findPurchaseOrderByIdentifier(state, body.purchaseOrderId);
      if (!order || order.accountSetId !== body.accountSetId) {
        return errorResponse(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
      }
      if (!["approved", "partially_executed"].includes(order.status)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "Only approved purchase orders can be received.");
      }
      let lines;
      try {
        lines = normalizeFulfillmentLines(order, body.lines, {
          sourceLineIdField: "purchaseOrderLineId",
          executedQuantityField: "receivedQuantity"
        });
      } catch (error) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", error.message);
      }
      const existingReceipts = await listPurchaseReceipts(state, body.accountSetId);
      const receipt = {
        id: body.id ?? `purchase-receipt:${randomUUID()}`,
        accountSetId: body.accountSetId,
        purchaseOrderId: order.id,
        purchaseOrderNo: order.orderNo,
        supplierId: order.supplierId,
        supplierName: order.supplierName ?? null,
        receiptNo: body.receiptNo ?? nextFulfillmentNo("PR", body.accountSetId, body.receiptDate, existingReceipts, "receiptNo"),
        receiptDate: body.receiptDate,
        status: body.status ?? "approved",
        totalQuantity: Number(lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(4)),
        createdBy: body.createdBy ?? actorId,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [],
        lines
      };
      const savedReceipt = platformStore?.createPurchaseReceipt ? await platformStore.createPurchaseReceipt(receipt) : receipt;
      state.purchaseReceipts.set(savedReceipt.id, savedReceipt);
      const updatedOrder = applyOrderExecution(order, lines, "receivedQuantity");
      const savedOrder = platformStore?.updatePurchaseOrderStatus
        ? await platformStore.updatePurchaseOrderStatus(updatedOrder)
        : updatedOrder;
      state.purchaseOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: receipt.createdBy,
        action: "purchase_receipt.create",
        objectType: "purchase_receipt",
        objectId: savedReceipt.id
      });
      return jsonResponse(201, savedReceipt);
    }
  }

  if (segments.length === 1 && segments[0] === "sales-deliveries") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listSalesDeliveries(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const order = await findSalesOrderByIdentifier(state, body.salesOrderId);
      if (!order || order.accountSetId !== body.accountSetId) {
        return errorResponse(404, "SALES_ORDER_NOT_FOUND", "Sales order was not found.");
      }
      if (!["approved", "partially_executed"].includes(order.status)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "Only approved sales orders can be delivered.");
      }
      let lines;
      try {
        lines = normalizeFulfillmentLines(order, body.lines, {
          sourceLineIdField: "salesOrderLineId",
          executedQuantityField: "shippedQuantity"
        });
      } catch (error) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", error.message);
      }
      const existingDeliveries = await listSalesDeliveries(state, body.accountSetId);
      const delivery = {
        id: body.id ?? `sales-delivery:${randomUUID()}`,
        accountSetId: body.accountSetId,
        salesOrderId: order.id,
        salesOrderNo: order.orderNo,
        customerId: order.customerId,
        customerName: order.customerName ?? null,
        deliveryNo: body.deliveryNo ?? nextFulfillmentNo("SD", body.accountSetId, body.deliveryDate, existingDeliveries, "deliveryNo"),
        deliveryDate: body.deliveryDate,
        status: body.status ?? "approved",
        totalQuantity: Number(lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(4)),
        createdBy: body.createdBy ?? actorId,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [],
        lines
      };
      const savedDelivery = platformStore?.createSalesDelivery ? await platformStore.createSalesDelivery(delivery) : delivery;
      state.salesDeliveries.set(savedDelivery.id, savedDelivery);
      const updatedOrder = applyOrderExecution(order, lines, "shippedQuantity");
      const savedOrder = platformStore?.updateSalesOrderStatus ? await platformStore.updateSalesOrderStatus(updatedOrder) : updatedOrder;
      state.salesOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: delivery.createdBy,
        action: "sales_delivery.create",
        objectType: "sales_delivery",
        objectId: savedDelivery.id
      });
      return jsonResponse(201, savedDelivery);
    }
  }

  if (segments.length === 1 && segments[0] === "purchase-invoices") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listPurchaseInvoices(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const receipt = (await listPurchaseReceipts(state, body.accountSetId)).find(
        (candidate) => candidate.id === body.purchaseReceiptId || candidate.receiptNo === body.purchaseReceiptId
      );
      if (!receipt) {
        return errorResponse(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
      }
      const order = await findPurchaseOrderByIdentifier(state, receipt.purchaseOrderId);
      if (!order) {
        return errorResponse(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
      }
      let lines;
      try {
        lines = normalizeInvoiceLines(receipt, order, body.lines, {
          sourceLineNoField: "receiptLineNo",
          sourceLineIdField: "purchaseOrderLineId",
          orderLineIdField: "purchaseOrderLineId"
        });
      } catch (error) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", error.message);
      }
      const existingInvoices = await listPurchaseInvoices(state, body.accountSetId);
      const totalAmount = Number(lines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2));
      const taxAmount = Number(lines.reduce((sum, line) => sum + line.taxAmount, 0).toFixed(2));
      const estimatedDifference = Number(lines.reduce((sum, line) => sum + line.totalAmount - line.expectedTotalAmount, 0).toFixed(2));
      const invoice = {
        id: body.id ?? `purchase-invoice:${randomUUID()}`,
        accountSetId: body.accountSetId,
        purchaseReceiptId: receipt.id,
        purchaseReceiptNo: receipt.receiptNo,
        supplierId: receipt.supplierId,
        supplierName: receipt.supplierName ?? null,
        invoiceNo: body.invoiceNo ?? nextFulfillmentNo("PI", body.accountSetId, body.invoiceDate, existingInvoices, "invoiceNo"),
        externalInvoiceNo: body.externalInvoiceNo ?? null,
        invoiceDate: body.invoiceDate,
        dueDate: body.dueDate ?? null,
        invoiceSource: body.invoiceSource ?? "manual",
        status: body.status ?? "confirmed",
        totalAmount,
        taxAmount,
        payableAmount: body.payableAmount ?? totalAmount,
        paidAmount: 0,
        settledAmount: 0,
        estimatedDifference,
        glVoucherId: null,
        createdBy: body.createdBy ?? actorId,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [],
        lines
      };
      const savedInvoice = platformStore?.createPurchaseInvoice ? await platformStore.createPurchaseInvoice(invoice) : invoice;
      state.purchaseInvoices.set(savedInvoice.id, savedInvoice);
      await createCounterpartyLedgerEntry(state, payableLedgerEntryFromInvoice(savedInvoice));
      const updatedOrder = applyOrderInvoicing(order, lines);
      const savedOrder = platformStore?.updatePurchaseOrderStatus
        ? await platformStore.updatePurchaseOrderStatus(updatedOrder)
        : updatedOrder;
      state.purchaseOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: invoice.createdBy,
        action: "purchase_invoice.confirm",
        objectType: "purchase_invoice",
        objectId: savedInvoice.id
      });
      return jsonResponse(201, savedInvoice);
    }
  }

  if (segments.length === 1 && segments[0] === "sales-invoices") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(200, await listSalesInvoices(state, accountSetId));
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const delivery = (await listSalesDeliveries(state, body.accountSetId)).find(
        (candidate) => candidate.id === body.salesDeliveryId || candidate.deliveryNo === body.salesDeliveryId
      );
      if (!delivery) {
        return errorResponse(404, "SALES_DELIVERY_NOT_FOUND", "Sales delivery was not found.");
      }
      const order = await findSalesOrderByIdentifier(state, delivery.salesOrderId);
      if (!order) {
        return errorResponse(404, "SALES_ORDER_NOT_FOUND", "Sales order was not found.");
      }
      let lines;
      try {
        lines = normalizeInvoiceLines(delivery, order, body.lines, {
          sourceLineNoField: "deliveryLineNo",
          sourceLineIdField: "salesOrderLineId",
          orderLineIdField: "salesOrderLineId"
        });
      } catch (error) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", error.message);
      }
      const existingInvoices = await listSalesInvoices(state, body.accountSetId);
      const totalAmount = Number(lines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2));
      const taxAmount = Number(lines.reduce((sum, line) => sum + line.taxAmount, 0).toFixed(2));
      const invoice = {
        id: body.id ?? `sales-invoice:${randomUUID()}`,
        accountSetId: body.accountSetId,
        salesDeliveryId: delivery.id,
        salesDeliveryNo: delivery.deliveryNo,
        customerId: delivery.customerId,
        customerName: delivery.customerName ?? null,
        invoiceNo: body.invoiceNo ?? nextFulfillmentNo("SI", body.accountSetId, body.invoiceDate, existingInvoices, "invoiceNo"),
        externalInvoiceNo: body.externalInvoiceNo ?? null,
        invoiceDate: body.invoiceDate,
        dueDate: body.dueDate ?? null,
        invoiceSource: body.invoiceSource ?? "manual",
        status: body.status ?? "confirmed",
        totalAmount,
        taxAmount,
        receivableAmount: body.receivableAmount ?? totalAmount,
        receivedAmount: 0,
        settledAmount: 0,
        glVoucherId: null,
        createdBy: body.createdBy ?? actorId,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : [],
        lines
      };
      const savedInvoice = platformStore?.createSalesInvoice ? await platformStore.createSalesInvoice(invoice) : invoice;
      state.salesInvoices.set(savedInvoice.id, savedInvoice);
      const receivableEntry = await createCounterpartyLedgerEntry(state, receivableLedgerEntryFromInvoice(savedInvoice));
      await createCollectionPlan(state, collectionPlanFromReceivableLedgerEntry(receivableEntry));
      const updatedOrder = applyOrderInvoicing(order, lines);
      const savedOrder = platformStore?.updateSalesOrderStatus ? await platformStore.updateSalesOrderStatus(updatedOrder) : updatedOrder;
      state.salesOrders.set(savedOrder.id, savedOrder);
      appendAuditLog(state, {
        actorId: invoice.createdBy,
        action: "sales_invoice.confirm",
        objectType: "sales_invoice",
        objectId: savedInvoice.id
      });
      return jsonResponse(201, savedInvoice);
    }
  }

  if (segments.length === 1 && segments[0] === "counterparty-ledger-summary" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) {
      throw new Error("accountSetId is required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const entries = await listCounterpartyLedgerEntries(state, accountSetId, {
      direction: query.get("direction") ?? null,
      partnerId: query.get("partnerId") ?? null
    });
    return jsonResponse(200, summarizeCounterpartyLedger(entries, query.get("asOfDate") ?? new Date().toISOString().slice(0, 10)));
  }

  if (segments.length === 1 && segments[0] === "counterparty-aging" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) {
      throw new Error("accountSetId is required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const entries = await listCounterpartyLedgerEntries(state, accountSetId, {
      direction: query.get("direction") ?? null,
      partnerId: query.get("partnerId") ?? null
    });
    return jsonResponse(200, buildCounterpartyAging(entries, query.get("asOfDate") ?? new Date().toISOString().slice(0, 10)));
  }

  if (segments.length === 1 && segments[0] === "counterparty-ledger" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) {
      throw new Error("accountSetId is required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const filters = {
      direction: query.get("direction") ?? null,
      partnerId: query.get("partnerId") ?? null,
      status: query.get("status") ?? null
    };
    return jsonResponse(200, await listCounterpartyLedgerEntries(state, accountSetId, filters));
  }

  if (segments.length === 3 && segments[0] === "counterparty-ledger" && segments[2] === "block-payment" && request.method === "POST") {
    const entry = await findCounterpartyLedgerEntryById(state, segments[1]);
    if (!entry) {
      return errorResponse(404, "COUNTERPARTY_LEDGER_ENTRY_NOT_FOUND", "Counterparty ledger entry was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, entry.accountSetId))) {
      return accountSetAccessError(state, actorId, entry.accountSetId);
    }
    if (entry.direction !== "ap") {
      return errorResponse(409, "BUSINESS_RULE_FAILED", "Only payable ledger entries can be blocked for payment.");
    }
    const blocked = await updateCounterpartyLedgerPaymentBlock(state, entry.id, {
      isPaymentBlocked: true,
      paymentBlockReason: body.paymentBlockReason ?? body.reason ?? null
    });
    appendAuditLog(state, {
      actorId: body.blockedBy ?? actorId,
      action: "counterparty_ledger.payment_block",
      objectType: "counterparty_ledger_entry",
      objectId: blocked.id
    });
    return jsonResponse(200, blocked);
  }

  if (segments.length === 1 && segments[0] === "payment-requests") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(
        200,
        await listPaymentRequests(state, accountSetId, {
          status: query.get("status") ?? null,
          supplierId: query.get("supplierId") ?? null
        })
      );
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const entry = await findCounterpartyLedgerEntryById(state, body.counterpartyLedgerEntryId);
      if (!entry || entry.accountSetId !== body.accountSetId) {
        return errorResponse(404, "COUNTERPARTY_LEDGER_ENTRY_NOT_FOUND", "Counterparty ledger entry was not found.");
      }
      if (entry.direction !== "ap") {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "Payment requests can only be created from payable entries.");
      }
      if (entry.isPaymentBlocked) {
        return errorResponse(409, "PAYMENT_BLOCKED", entry.paymentBlockReason ?? "Payment is blocked for this payable entry.");
      }
      const requestedAmount = Number(body.requestedAmount);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "requestedAmount must be greater than 0.");
      }
      if (requestedAmount > Number(entry.remainingAmount ?? 0)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "requestedAmount exceeds remaining payable amount.");
      }
      const existingRequests = await listPaymentRequests(state, body.accountSetId);
      const requestDate = body.requestDate ?? new Date().toISOString().slice(0, 10);
      const paymentRequest = {
        id: body.id ?? `payment-request:${randomUUID()}`,
        accountSetId: body.accountSetId,
        counterpartyLedgerEntryId: entry.id,
        supplierId: entry.partnerId,
        supplierName: entry.partnerName ?? null,
        sourceNo: entry.sourceNo,
        requestNo: body.requestNo ?? nextFulfillmentNo("PAY-REQ", body.accountSetId, requestDate, existingRequests, "requestNo"),
        requestDate,
        plannedPaymentDate: body.plannedPaymentDate ?? null,
        requestedAmount,
        status: "pending_approval",
        requestedBy: body.requestedBy ?? actorId,
        approvedBy: null,
        approvedAt: null,
        approvalComment: body.approvalComment ?? null,
        paymentMethod: body.paymentMethod ?? "bank_transfer",
        bankAccountCode: body.bankAccountCode ?? "1002",
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []
      };
      const savedRequest = await createPaymentRequest(state, paymentRequest);
      appendAuditLog(state, {
        actorId: savedRequest.requestedBy,
        action: "payment_request.create",
        objectType: "payment_request",
        objectId: savedRequest.id
      });
      return jsonResponse(201, savedRequest);
    }
  }

  if (segments.length === 3 && segments[0] === "payment-requests" && segments[2] === "approve" && request.method === "POST") {
    const paymentRequest = await findPaymentRequestById(state, segments[1]);
    if (!paymentRequest) {
      return errorResponse(404, "PAYMENT_REQUEST_NOT_FOUND", "Payment request was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, paymentRequest.accountSetId))) {
      return accountSetAccessError(state, actorId, paymentRequest.accountSetId);
    }
    if (paymentRequest.status !== "pending_approval") {
      return errorResponse(409, "BUSINESS_RULE_FAILED", "Only pending payment requests can be approved.");
    }
    const approved = await updatePaymentRequestStatus(state, paymentRequest.id, {
      status: "approved",
      approvedBy: body.approvedBy ?? actorId,
      approvedAt: new Date().toISOString(),
      approvalComment: body.approvalComment ?? null
    });
    appendAuditLog(state, {
      actorId: approved.approvedBy,
      action: "payment_request.approve",
      objectType: "payment_request",
      objectId: approved.id
    });
    return jsonResponse(200, approved);
  }

  if (segments.length === 1 && segments[0] === "supplier-payments") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(
        200,
        await listSupplierPayments(state, accountSetId, {
          status: query.get("status") ?? null,
          supplierId: query.get("supplierId") ?? null
        })
      );
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const paymentRequest = await findPaymentRequestById(state, body.paymentRequestId);
      if (!paymentRequest || paymentRequest.accountSetId !== body.accountSetId) {
        return errorResponse(404, "PAYMENT_REQUEST_NOT_FOUND", "Payment request was not found.");
      }
      if (paymentRequest.status !== "approved") {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "Only approved payment requests can generate supplier payments.");
      }
      const paidAmount = Number(body.paidAmount ?? paymentRequest.requestedAmount);
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "paidAmount must be greater than 0.");
      }
      if (paidAmount > Number(paymentRequest.requestedAmount ?? 0)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "paidAmount exceeds approved payment request amount.");
      }
      const existingPayments = await listSupplierPayments(state, body.accountSetId);
      const paymentDate = body.paymentDate ?? new Date().toISOString().slice(0, 10);
      const payment = {
        id: body.id ?? `supplier-payment:${randomUUID()}`,
        accountSetId: body.accountSetId,
        paymentRequestId: paymentRequest.id,
        paymentRequestNo: paymentRequest.requestNo,
        counterpartyLedgerEntryId: paymentRequest.counterpartyLedgerEntryId,
        supplierId: paymentRequest.supplierId,
        supplierName: paymentRequest.supplierName ?? null,
        sourceNo: paymentRequest.sourceNo ?? null,
        paymentNo: body.paymentNo ?? nextFulfillmentNo("PAY", body.accountSetId, paymentDate, existingPayments, "paymentNo"),
        paymentDate,
        paidAmount,
        status: "paid",
        paidBy: body.paidBy ?? actorId,
        paymentMethod: body.paymentMethod ?? paymentRequest.paymentMethod ?? "bank_transfer",
        bankAccountCode: body.bankAccountCode ?? paymentRequest.bankAccountCode,
        glVoucherId: null,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []
      };
      const savedPayment = await createSupplierPayment(state, payment);
      appendAuditLog(state, {
        actorId: savedPayment.paidBy,
        action: "supplier_payment.create",
        objectType: "supplier_payment",
        objectId: savedPayment.id
      });
      return jsonResponse(201, savedPayment);
    }
  }

  if (segments.length === 1 && segments[0] === "ap-settlements") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(
        200,
        await listApSettlements(state, accountSetId, {
          status: query.get("status") ?? null,
          supplierId: query.get("supplierId") ?? null
        })
      );
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const entry = await findCounterpartyLedgerEntryById(state, body.counterpartyLedgerEntryId);
      if (!entry || entry.accountSetId !== body.accountSetId) {
        return errorResponse(404, "COUNTERPARTY_LEDGER_ENTRY_NOT_FOUND", "Counterparty ledger entry was not found.");
      }
      if (entry.direction !== "ap") {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "AP settlements can only be created from payable entries.");
      }
      const settlementType = body.settlementType ?? "payment_to_bill";
      if (!["payment_to_bill", "prepayment_to_bill", "refund", "credit_note_to_bill", "ar_ap_netting"].includes(settlementType)) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "settlementType is not supported.");
      }
      const supplierPayment = body.supplierPaymentId ? await findSupplierPaymentById(state, body.supplierPaymentId) : null;
      if (settlementType === "payment_to_bill") {
        if (!supplierPayment || supplierPayment.accountSetId !== body.accountSetId) {
          return errorResponse(404, "SUPPLIER_PAYMENT_NOT_FOUND", "Supplier payment was not found.");
        }
        if (supplierPayment.supplierId !== entry.partnerId) {
          return errorResponse(409, "BUSINESS_RULE_FAILED", "Supplier payment does not belong to the payable supplier.");
        }
      }
      const settledAmount = Number(body.settledAmount);
      if (!Number.isFinite(settledAmount) || settledAmount <= 0) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "settledAmount must be greater than 0.");
      }
      if (settledAmount > Number(entry.remainingAmount ?? 0)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "settledAmount exceeds remaining payable amount.");
      }
      const existingSettlements = await listApSettlements(state, body.accountSetId);
      const settlementDate = body.settlementDate ?? new Date().toISOString().slice(0, 10);
      const settlement = {
        id: body.id ?? `ap-settlement:${randomUUID()}`,
        accountSetId: body.accountSetId,
        supplierId: entry.partnerId,
        supplierName: entry.partnerName ?? null,
        counterpartyLedgerEntryId: entry.id,
        sourceNo: entry.sourceNo,
        supplierPaymentId: supplierPayment?.id ?? null,
        supplierPaymentNo: supplierPayment?.paymentNo ?? null,
        settlementNo:
          body.settlementNo ?? nextFulfillmentNo("AP-SET", body.accountSetId, settlementDate, existingSettlements, "settlementNo"),
        settlementDate,
        settlementType,
        settledAmount,
        differenceAmount: Number(body.differenceAmount ?? 0),
        differenceReason: body.differenceReason ?? null,
        status: "settled",
        createdBy: body.createdBy ?? actorId,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []
      };
      const savedSettlement = await createApSettlement(state, settlement);
      const nextSettledAmount = Number((Number(entry.settledAmount ?? 0) + settledAmount).toFixed(2));
      const nextRemainingAmount = Number((Number(entry.remainingAmount ?? 0) - settledAmount).toFixed(2));
      await updateCounterpartyLedgerSettlement(state, entry.id, {
        settledAmount: nextSettledAmount,
        remainingAmount: nextRemainingAmount,
        status: nextRemainingAmount <= 0 ? "settled" : "partially_settled"
      });
      appendAuditLog(state, {
        actorId: savedSettlement.createdBy,
        action: "ap_settlement.create",
        objectType: "ap_settlement",
        objectId: savedSettlement.id
      });
      return jsonResponse(201, savedSettlement);
    }
  }

  if (segments.length === 1 && segments[0] === "ar-settlements") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(
        200,
        await listArSettlements(state, accountSetId, {
          status: query.get("status") ?? null,
          customerId: query.get("customerId") ?? null
        })
      );
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const entry = await findCounterpartyLedgerEntryById(state, body.counterpartyLedgerEntryId);
      if (!entry || entry.accountSetId !== body.accountSetId) {
        return errorResponse(404, "COUNTERPARTY_LEDGER_ENTRY_NOT_FOUND", "Counterparty ledger entry was not found.");
      }
      if (entry.direction !== "ar") {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "AR settlements can only be created from receivable entries.");
      }
      const settlementType = body.settlementType ?? "receipt_to_bill";
      if (!["receipt_to_bill", "prepayment_to_bill", "refund", "credit_note_to_bill", "ar_ap_netting"].includes(settlementType)) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "settlementType is not supported.");
      }
      let customerReceipt = null;
      if (["receipt_to_bill", "prepayment_to_bill"].includes(settlementType)) {
        customerReceipt = body.customerReceiptId ? await findCustomerReceiptById(state, body.customerReceiptId) : null;
        if (!customerReceipt || customerReceipt.accountSetId !== body.accountSetId) {
          return errorResponse(404, "CUSTOMER_RECEIPT_NOT_FOUND", "Customer receipt was not found.");
        }
        if (customerReceipt.customerId !== entry.partnerId) {
          return errorResponse(409, "BUSINESS_RULE_FAILED", "Customer receipt does not belong to the receivable customer.");
        }
        if (settlementType === "receipt_to_bill" && customerReceipt.receiptType !== "receipt") {
          return errorResponse(409, "BUSINESS_RULE_FAILED", "receipt_to_bill requires a normal receipt.");
        }
        if (settlementType === "prepayment_to_bill" && customerReceipt.receiptType !== "prepayment") {
          return errorResponse(409, "BUSINESS_RULE_FAILED", "prepayment_to_bill requires a prepayment receipt.");
        }
      }
      let nettingEntry = null;
      if (settlementType === "ar_ap_netting") {
        nettingEntry = body.nettingCounterpartyLedgerEntryId
          ? await findCounterpartyLedgerEntryById(state, body.nettingCounterpartyLedgerEntryId)
          : null;
        if (!nettingEntry || nettingEntry.accountSetId !== body.accountSetId) {
          return errorResponse(404, "NETTING_COUNTERPARTY_LEDGER_ENTRY_NOT_FOUND", "Netting payable entry was not found.");
        }
        if (nettingEntry.direction !== "ap") {
          return errorResponse(409, "BUSINESS_RULE_FAILED", "AR/AP netting requires a payable entry.");
        }
        if (nettingEntry.partnerId !== entry.partnerId) {
          return errorResponse(409, "BUSINESS_RULE_FAILED", "AR/AP netting requires the same partner on receivable and payable entries.");
        }
      }
      const settledAmount = Number(body.settledAmount);
      if (!Number.isFinite(settledAmount) || settledAmount <= 0) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "settledAmount must be greater than 0.");
      }
      if (settledAmount > Number(entry.remainingAmount ?? 0)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "settledAmount exceeds remaining receivable amount.");
      }
      if (customerReceipt && settledAmount > Number(customerReceipt.receivedAmount ?? 0)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "settledAmount exceeds receipt amount.");
      }
      if (nettingEntry && settledAmount > Number(nettingEntry.remainingAmount ?? 0)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "settledAmount exceeds remaining payable amount for netting.");
      }
      const existingSettlements = await listArSettlements(state, body.accountSetId);
      const settlementDate = body.settlementDate ?? new Date().toISOString().slice(0, 10);
      const settlementNo =
        body.settlementNo ?? nextFulfillmentNo("AR-SET", body.accountSetId, settlementDate, existingSettlements, "settlementNo");
      const voucherDraft = settlementVoucherDraft({
        accountSetId: body.accountSetId,
        settlementNo,
        settlementDate,
        settlementType,
        amount: settledAmount,
        bankAccountCode: customerReceipt?.bankAccountCode,
        arAccountCode: entry.glAccountCode,
        apAccountCode: nettingEntry?.glAccountCode
      });
      const settlement = {
        id: body.id ?? `ar-settlement:${randomUUID()}`,
        accountSetId: body.accountSetId,
        customerId: entry.partnerId,
        customerName: entry.partnerName ?? null,
        counterpartyLedgerEntryId: entry.id,
        sourceNo: entry.sourceNo,
        customerReceiptId: customerReceipt?.id ?? null,
        customerReceiptNo: customerReceipt?.receiptNo ?? null,
        nettingCounterpartyLedgerEntryId: nettingEntry?.id ?? null,
        nettingSourceNo: nettingEntry?.sourceNo ?? null,
        settlementNo,
        settlementDate,
        settlementType,
        settledAmount,
        differenceAmount: Number(body.differenceAmount ?? 0),
        differenceReason: body.differenceReason ?? null,
        voucherDraft,
        status: "settled",
        createdBy: body.createdBy ?? actorId,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []
      };
      const savedSettlement = await createArSettlement(state, settlement);
      const nextReceivableSettledAmount = Number((Number(entry.settledAmount ?? 0) + settledAmount).toFixed(2));
      const nextReceivableRemainingAmount = Number((Number(entry.remainingAmount ?? 0) - settledAmount).toFixed(2));
      await updateCounterpartyLedgerSettlement(state, entry.id, {
        settledAmount: nextReceivableSettledAmount,
        remainingAmount: nextReceivableRemainingAmount,
        status: nextReceivableRemainingAmount <= 0 ? "settled" : "partially_settled"
      });
      if (nettingEntry) {
        const nextPayableSettledAmount = Number((Number(nettingEntry.settledAmount ?? 0) + settledAmount).toFixed(2));
        const nextPayableRemainingAmount = Number((Number(nettingEntry.remainingAmount ?? 0) - settledAmount).toFixed(2));
        await updateCounterpartyLedgerSettlement(state, nettingEntry.id, {
          settledAmount: nextPayableSettledAmount,
          remainingAmount: nextPayableRemainingAmount,
          status: nextPayableRemainingAmount <= 0 ? "settled" : "partially_settled"
        });
      }
      appendAuditLog(state, {
        actorId: savedSettlement.createdBy,
        action: "ar_settlement.create",
        objectType: "ar_settlement",
        objectId: savedSettlement.id
      });
      return jsonResponse(201, savedSettlement);
    }
  }

  if (segments.length === 1 && segments[0] === "customer-receipts") {
    if (request.method === "GET") {
      const query = queryParamsFor(request.path);
      const accountSetId = query.get("accountSetId");
      if (!accountSetId) {
        throw new Error("accountSetId is required.");
      }
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
        return accountSetAccessError(state, actorId, accountSetId);
      }
      return jsonResponse(
        200,
        await listCustomerReceipts(state, accountSetId, {
          status: query.get("status") ?? null,
          customerId: query.get("customerId") ?? null
        })
      );
    }

    if (request.method === "POST") {
      const actorId = actorIdFor(request, state);
      if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
        return accountSetAccessError(state, actorId, body.accountSetId);
      }
      const receiptType = body.receiptType ?? "receipt";
      let entry = null;
      let customer = null;
      if (receiptType === "receipt") {
        entry = await findCounterpartyLedgerEntryById(state, body.counterpartyLedgerEntryId);
        if (!entry || entry.accountSetId !== body.accountSetId) {
          return errorResponse(404, "COUNTERPARTY_LEDGER_ENTRY_NOT_FOUND", "Counterparty ledger entry was not found.");
        }
        if (entry.direction !== "ar") {
          return errorResponse(409, "BUSINESS_RULE_FAILED", "Customer receipts can only be created from receivable entries.");
        }
        customer = await findPartnerByIdentifier(state, entry.partnerId);
      } else if (receiptType === "prepayment") {
        customer = await findPartnerByIdentifier(state, body.customerId);
        if (!customer || customer.accountSetId !== body.accountSetId || !["customer", "both"].includes(customer.partnerType)) {
          return errorResponse(404, "CUSTOMER_NOT_FOUND", "Customer was not found.");
        }
      } else {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "receiptType must be receipt or prepayment.");
      }
      const receivedAmount = Number(body.receivedAmount);
      if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", "receivedAmount must be greater than 0.");
      }
      if (entry && receivedAmount > Number(entry.remainingAmount ?? 0)) {
        return errorResponse(409, "BUSINESS_RULE_FAILED", "receivedAmount exceeds remaining receivable amount.");
      }
      const existingReceipts = await listCustomerReceipts(state, body.accountSetId);
      const receiptDate = body.receiptDate ?? new Date().toISOString().slice(0, 10);
      const receipt = {
        id: body.id ?? `customer-receipt:${randomUUID()}`,
        accountSetId: body.accountSetId,
        counterpartyLedgerEntryId: entry?.id ?? null,
        customerId: entry?.partnerId ?? customer.id,
        customerName: entry?.partnerName ?? customer.name,
        sourceNo: entry?.sourceNo ?? null,
        receiptNo: body.receiptNo ?? nextFulfillmentNo("REC", body.accountSetId, receiptDate, existingReceipts, "receiptNo"),
        receiptDate,
        receiptType,
        receivedAmount,
        status: "received",
        receivedBy: body.receivedBy ?? actorId,
        receiptMethod: body.receiptMethod ?? "bank_transfer",
        bankAccountCode: body.bankAccountCode ?? "1002",
        glVoucherId: null,
        evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []
      };
      const savedReceipt = await createCustomerReceipt(state, receipt);
      appendAuditLog(state, {
        actorId: savedReceipt.receivedBy,
        action: "customer_receipt.create",
        objectType: "customer_receipt",
        objectId: savedReceipt.id
      });
      return jsonResponse(201, savedReceipt);
    }
  }

  if (segments.length === 1 && segments[0] === "collection-plans" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) {
      throw new Error("accountSetId is required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    return jsonResponse(
      200,
      await listCollectionPlans(state, accountSetId, {
        status: query.get("status") ?? null,
        customerId: query.get("customerId") ?? null
      })
    );
  }

  if (segments.length === 1 && segments[0] === "credit-exposures" && request.method === "GET") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    if (!accountSetId) {
      throw new Error("accountSetId is required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    return jsonResponse(200, await listCreditExposures(state, accountSetId));
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "periods" && segments[2] === "open") {
    const period = state.periods.get(segments[1]) ?? (platformStore?.findAccountingPeriod ? await platformStore.findAccountingPeriod(segments[1]) : null);
    if (!period) {
      return errorResponse(404, "PERIOD_NOT_FOUND", "Accounting period was not found.");
    }
    const opened = openAccountingPeriod(period, { openedBy: body.openedBy ?? "system" });
    state.periods.set(opened.id, opened);
    if (platformStore?.updateAccountingPeriod) {
      await platformStore.updateAccountingPeriod(opened);
    }
    appendAuditLog(state, {
      actorId: body.openedBy ?? "system",
      action: "period.open",
      objectType: "period",
      objectId: opened.id
    });
    return jsonResponse(200, opened);
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "periods" && segments[2] === "close") {
    const period = state.periods.get(segments[1]) ?? (platformStore?.findAccountingPeriod ? await platformStore.findAccountingPeriod(segments[1]) : null);
    if (!period) {
      return errorResponse(404, "PERIOD_NOT_FOUND", "Accounting period was not found.");
    }

    const unpostedVoucherCount = countUnpostedVouchersForPeriod(state, period);
    if (unpostedVoucherCount > 0) {
      return errorResponse(409, "PERIOD_CLOSE_BLOCKED", `${unpostedVoucherCount} unposted vouchers remain.`);
    }

    const closed = closeAccountingPeriod(period, { unpostedVoucherCount, closedBy: body.closedBy ?? "system" });
    state.periods.set(closed.id, closed);
    if (platformStore?.updateAccountingPeriod) {
      await platformStore.updateAccountingPeriod(closed);
    }
    appendAuditLog(state, {
      actorId: body.closedBy ?? "system",
      action: "period.close",
      objectType: "period",
      objectId: closed.id
    });
    return jsonResponse(200, closed);
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "periods" && segments[2] === "lock") {
    const period = state.periods.get(segments[1]) ?? (platformStore?.findAccountingPeriod ? await platformStore.findAccountingPeriod(segments[1]) : null);
    if (!period) {
      return errorResponse(404, "PERIOD_NOT_FOUND", "Accounting period was not found.");
    }
    const locked = lockAccountingPeriod(period, { lockedBy: body.lockedBy ?? "system" });
    state.periods.set(locked.id, locked);
    if (platformStore?.updateAccountingPeriod) {
      await platformStore.updateAccountingPeriod(locked);
    }
    appendAuditLog(state, {
      actorId: body.lockedBy ?? "system",
      action: "period.lock",
      objectType: "period",
      objectId: locked.id
    });
    return jsonResponse(200, locked);
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "periods" && segments[2] === "set-current") {
    const period = state.periods.get(segments[1]) ?? (platformStore?.findAccountingPeriod ? await platformStore.findAccountingPeriod(segments[1]) : null);
    if (!period) {
      return errorResponse(404, "PERIOD_NOT_FOUND", "Accounting period was not found.");
    }
    const accountSetPeriods = platformStore?.listAccountingPeriods
      ? await platformStore.listAccountingPeriods(period.accountSetId)
      : [...state.periods.values()].filter((candidate) => candidate.accountSetId === period.accountSetId);
    const result = setCurrentAccountingPeriod(period, accountSetPeriods, { setBy: body.setBy ?? "system" });
    for (const updatedPeriod of result.periods) {
      state.periods.set(updatedPeriod.id, updatedPeriod);
      if (platformStore?.updateAccountingPeriod) {
        await platformStore.updateAccountingPeriod(updatedPeriod);
      }
    }
    appendAuditLog(state, {
      actorId: body.setBy ?? "system",
      action: "period.set_current",
      objectType: "period",
      objectId: result.period.id
    });
    return jsonResponse(200, result.period);
  }

  if (request.method === "POST" && request.path === "/account-code-rules") {
    const rule = createAccountCodeRule(body);
    state.accountCodeRule = rule;
    appendAuditLog(state, {
      actorId: body.createdBy ?? "system",
      action: "account_code_rule.save",
      objectType: "account_code_rule",
      objectId: rule.id
    });
    return jsonResponse(201, rule);
  }

  if (request.method === "POST" && request.path === "/accounts") {
    const lockError = await enabledAccountSetLockError(state, body.accountSetId);
    if (lockError) {
      return lockError;
    }
    assertAccountCodeMatchesRule(body.code, state.accountCodeRule);
    const account = createAccount(body);
    let responseAccount = account;
    if (platformStore?.createAccount) {
      responseAccount = await platformStore.createAccount({
        ...account,
        accountSetId: body.accountSetId
      });
    }
    state.accounts.set(account.code, responseAccount);
    appendAuditLog(state, {
      actorId: body.createdBy ?? "system",
      action: "account.create",
      objectType: "account",
      objectId: account.id
    });
    return jsonResponse(201, responseAccount);
  }

  if (request.method === "POST" && request.path === "/accounts/import") {
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    const lockError = await enabledAccountSetLockError(state, body.accountSetId);
    if (lockError) {
      return lockError;
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      throw new Error("rows are required.");
    }
    const imported = [];
    for (const row of body.rows) {
      assertAccountCodeMatchesRule(row.code, state.accountCodeRule);
      const account = createAccount({
        ...row,
        accountSetId: row.accountSetId ?? body.accountSetId
      });
      const savedAccount = platformStore?.createAccount ? await platformStore.createAccount(account) : account;
      state.accounts.set(savedAccount.code, savedAccount);
      imported.push(savedAccount);
    }
    appendAuditLog(state, {
      actorId: body.importedBy ?? actorIdFor(request, state),
      action: "account.import",
      objectType: "account",
      objectId: imported.map((account) => account.code).join(",")
    });
    return jsonResponse(201, imported);
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "accounts" && segments[2] === "disable") {
    const account = findAccountByIdentifier(state, segments[1]) ?? (platformStore?.findAccount ? await platformStore.findAccount(segments[1]) : null);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    const disabledAccount = {
      ...account,
      isEnabled: false,
      disabledBy: body.disabledBy ?? actorIdFor(request, state),
      disabledAt: "now"
    };
    const savedAccount = platformStore?.updateAccount ? await platformStore.updateAccount(disabledAccount) : disabledAccount;
    state.accounts.set(savedAccount.code, savedAccount);
    appendAuditLog(state, {
      actorId: savedAccount.disabledBy ?? actorIdFor(request, state),
      action: "account.disable",
      objectType: "account",
      objectId: savedAccount.id
    });
    return jsonResponse(200, savedAccount);
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "accounts" && segments[2] === "enable") {
    const account = findAccountByIdentifier(state, segments[1]) ?? (platformStore?.findAccount ? await platformStore.findAccount(segments[1]) : null);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    const enabledAccount = {
      ...account,
      isEnabled: true,
      enabledBy: body.enabledBy ?? actorIdFor(request, state),
      enabledAt: "now"
    };
    const savedAccount = platformStore?.updateAccount ? await platformStore.updateAccount(enabledAccount) : enabledAccount;
    state.accounts.set(savedAccount.code, savedAccount);
    appendAuditLog(state, {
      actorId: enabledAccount.enabledBy,
      action: "account.enable",
      objectType: "account",
      objectId: savedAccount.id
    });
    return jsonResponse(200, savedAccount);
  }

  if (request.method === "PATCH" && segments.length === 2 && segments[0] === "accounts") {
    const account = findAccountByIdentifier(state, segments[1]) ?? (platformStore?.findAccount ? await platformStore.findAccount(segments[1]) : null);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    const updatedAccount = {
      ...account,
      name: body.name ?? account.name,
      accountType: body.accountType ?? account.accountType,
      normalBalance: body.normalBalance ?? account.normalBalance,
      parentId: body.parentId ?? account.parentId ?? null,
      isLeaf: body.isLeaf ?? account.isLeaf,
      isCash: body.isCash ?? account.isCash ?? false,
      isBank: body.isBank ?? account.isBank ?? false,
      isEnabled: body.isEnabled ?? account.isEnabled,
      allowManualEntry: body.allowManualEntry ?? account.allowManualEntry,
      requiredAuxiliaries: Array.isArray(body.requiredAuxiliaries) ? [...body.requiredAuxiliaries] : account.requiredAuxiliaries ?? [],
      updatedBy: body.updatedBy ?? actorIdFor(request, state),
      updatedAt: "now"
    };
    const savedAccount = platformStore?.updateAccount ? await platformStore.updateAccount(updatedAccount) : updatedAccount;
    state.accounts.set(savedAccount.code, savedAccount);
    appendAuditLog(state, {
      actorId: updatedAccount.updatedBy,
      action: "account.update",
      objectType: "account",
      objectId: savedAccount.id
    });
    return jsonResponse(200, savedAccount);
  }

  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "accounts") {
    const account = findAccountByIdentifier(state, segments[1]) ?? (platformStore?.findAccount ? await platformStore.findAccount(segments[1]) : null);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    if (await accountHasVoucherUsage(state, account)) {
      return errorResponse(409, "ACCOUNT_IN_USE", "Accounts referenced by vouchers cannot be deleted.");
    }
    const deletedAccount = {
      ...account,
      isEnabled: false,
      deletedBy: body.deletedBy ?? actorIdFor(request, state),
      deletedAt: "now"
    };
    const savedAccount = platformStore?.updateAccount ? await platformStore.updateAccount(deletedAccount) : deletedAccount;
    state.accounts.set(savedAccount.code, savedAccount);
    appendAuditLog(state, {
      actorId: deletedAccount.deletedBy,
      action: "account.delete",
      objectType: "account",
      objectId: savedAccount.id
    });
    return jsonResponse(200, savedAccount);
  }

  if (request.method === "GET" && request.path === "/accounts/tree") {
    const accounts = platformStore?.listAccounts ? await platformStore.listAccounts() : listAccounts(state);
    return jsonResponse(200, buildAccountTree(accounts));
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "accounts") {
    const account = findAccountByIdentifier(state, segments[1]) ?? (platformStore?.findAccount ? await platformStore.findAccount(segments[1]) : null);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    return jsonResponse(200, account);
  }

  if (request.method === "GET" && request.path === "/accounts") {
    if (platformStore?.listAccounts) {
      return jsonResponse(200, await platformStore.listAccounts());
    }
    return jsonResponse(200, listAccounts(state));
  }

  if (request.method === "POST" && request.path === "/auxiliary-types") {
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    if (typeof body.code !== "string" || body.code.trim() === "") {
      throw new Error("code is required.");
    }
    if (typeof body.name !== "string" || body.name.trim() === "") {
      throw new Error("name is required.");
    }
    const duplicate = [...state.auxiliaryTypes.values()].find(
      (type) => type.accountSetId === body.accountSetId && type.code === body.code
    );
    if (duplicate) {
      return errorResponse(409, "AUXILIARY_TYPE_ALREADY_EXISTS", "Auxiliary type code already exists.");
    }
    let auxiliaryType = {
      id: `auxiliary-type:${state.auxiliaryTypes.size + 1}`,
      accountSetId: body.accountSetId,
      code: body.code,
      name: body.name,
      category: body.category ?? body.code,
      isEnabled: body.isEnabled ?? true,
      createdBy: body.createdBy ?? actorIdFor(request, state),
      createdAt: "now"
    };
    if (platformStore?.createAuxiliaryType) {
      auxiliaryType = await platformStore.createAuxiliaryType(auxiliaryType);
    }
    state.auxiliaryTypes.set(auxiliaryType.id, auxiliaryType);
    appendAuditLog(state, {
      actorId: body.createdBy ?? actorIdFor(request, state),
      action: "auxiliary_type.create",
      objectType: "auxiliary_type",
      objectId: auxiliaryType.id
    });
    return jsonResponse(201, auxiliaryType);
  }

  if (request.method === "GET" && request.path === "/auxiliary-types") {
    if (platformStore?.listAuxiliaryTypes) {
      return jsonResponse(200, await platformStore.listAuxiliaryTypes());
    }
    return jsonResponse(200, [...state.auxiliaryTypes.values()]);
  }

  if (request.method === "POST" && request.path === "/auxiliary-items") {
    const auxiliaryType = state.auxiliaryTypes.get(body.auxiliaryTypeId);
    if (!auxiliaryType) {
      return errorResponse(404, "AUXILIARY_TYPE_NOT_FOUND", "Auxiliary type was not found.");
    }
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    if (typeof body.code !== "string" || body.code.trim() === "") {
      throw new Error("code is required.");
    }
    if (typeof body.name !== "string" || body.name.trim() === "") {
      throw new Error("name is required.");
    }
    const duplicate = [...state.auxiliaryItems.values()].find(
      (item) => item.auxiliaryTypeId === body.auxiliaryTypeId && item.code === body.code
    );
    if (duplicate) {
      return errorResponse(409, "AUXILIARY_ITEM_ALREADY_EXISTS", "Auxiliary item code already exists.");
    }
    let auxiliaryItem = {
      id: `auxiliary-item:${state.auxiliaryItems.size + 1}`,
      accountSetId: body.accountSetId,
      auxiliaryTypeId: body.auxiliaryTypeId,
      auxiliaryTypeCode: auxiliaryType.code,
      code: body.code,
      name: body.name,
      isEnabled: body.isEnabled ?? true,
      createdBy: body.createdBy ?? actorIdFor(request, state),
      createdAt: "now"
    };
    if (platformStore?.createAuxiliaryItem) {
      auxiliaryItem = await platformStore.createAuxiliaryItem(auxiliaryItem);
    }
    state.auxiliaryItems.set(auxiliaryItem.id, auxiliaryItem);
    appendAuditLog(state, {
      actorId: body.createdBy ?? actorIdFor(request, state),
      action: "auxiliary_item.create",
      objectType: "auxiliary_item",
      objectId: auxiliaryItem.id
    });
    return jsonResponse(201, auxiliaryItem);
  }

  if (request.method === "GET" && request.path === "/auxiliary-items") {
    if (platformStore?.listAuxiliaryItems) {
      return jsonResponse(200, await platformStore.listAuxiliaryItems());
    }
    return jsonResponse(200, [...state.auxiliaryItems.values()]);
  }

  if (segments.length === 2 && segments[0] === "auxiliary-items") {
    const auxiliaryItem = state.auxiliaryItems.get(segments[1]);
    if (!auxiliaryItem) {
      return errorResponse(404, "AUXILIARY_ITEM_NOT_FOUND", "Auxiliary item was not found.");
    }

    if (request.method === "PATCH") {
      const updated = {
        ...auxiliaryItem,
        name: body.name ?? auxiliaryItem.name,
        isEnabled: body.isEnabled ?? auxiliaryItem.isEnabled
      };
      state.auxiliaryItems.set(updated.id, updated);
      appendAuditLog(state, {
        actorId: body.updatedBy ?? actorIdFor(request, state),
        action: "auxiliary_item.update",
        objectType: "auxiliary_item",
        objectId: updated.id
      });
      return jsonResponse(200, updated);
    }

    if (request.method === "DELETE") {
      const deleted = { ...auxiliaryItem, isEnabled: false, deletedAt: "now", deletedBy: body.deletedBy ?? actorIdFor(request, state) };
      state.auxiliaryItems.set(deleted.id, deleted);
      appendAuditLog(state, {
        actorId: deleted.deletedBy,
        action: "auxiliary_item.delete",
        objectType: "auxiliary_item",
        objectId: deleted.id
      });
      return jsonResponse(200, deleted);
    }
  }

  if (segments.length === 3 && segments[0] === "accounts" && segments[2] === "auxiliary-requirements") {
    const account = await findAccountByIdentifierWithStore(state, segments[1]);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }

    if (request.method === "POST") {
      const auxiliaryType = state.auxiliaryTypes.get(body.auxiliaryTypeId);
      if (!auxiliaryType) {
        return errorResponse(404, "AUXILIARY_TYPE_NOT_FOUND", "Auxiliary type was not found.");
      }
      const existing = state.accountAuxiliaryRequirements.find(
        (requirement) => requirement.accountCode === account.code && requirement.auxiliaryTypeId === auxiliaryType.id
      );
      let requirement =
        existing ?? {
          id: `account-auxiliary-requirement:${state.accountAuxiliaryRequirements.length + 1}`,
          accountCode: account.code,
          accountId: account.id,
          auxiliaryTypeId: auxiliaryType.id,
          auxiliaryTypeCode: auxiliaryType.code,
          auxiliaryTypeName: auxiliaryType.name,
          required: body.required ?? true,
          configuredBy: body.configuredBy ?? actorIdFor(request, state),
          configuredAt: "now"
        };
      if (platformStore?.saveAccountAuxiliaryRequirement) {
        requirement = await platformStore.saveAccountAuxiliaryRequirement(requirement);
      }
      if (existing) {
        Object.assign(existing, requirement);
      } else {
        state.accountAuxiliaryRequirements.push(requirement);
      }
      const requiredCodes = state.accountAuxiliaryRequirements
        .filter((candidate) => candidate.accountCode === account.code && candidate.required)
        .map((candidate) => candidate.auxiliaryTypeCode);
      state.accounts.set(account.code, { ...account, requiredAuxiliaries: requiredCodes });
      appendAuditLog(state, {
        actorId: requirement.configuredBy,
        action: "account_auxiliary_requirement.save",
        objectType: "account",
        objectId: account.id
      });
      return jsonResponse(201, requirement);
    }

    if (request.method === "GET") {
      if (platformStore?.listAccountAuxiliaryRequirements) {
        return jsonResponse(200, await platformStore.listAccountAuxiliaryRequirements(account.id));
      }
      return jsonResponse(
        200,
        state.accountAuxiliaryRequirements.filter((requirement) => requirement.accountCode === account.code)
      );
    }
  }

  if (request.method === "POST" && request.path === "/opening-balances") {
    const lockError = await enabledAccountSetLockError(state, body.accountSetId);
    if (lockError) {
      return lockError;
    }
    const account = findAccountByIdentifier(state, body.accountCode ?? body.accountId);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    }
    if (!Number.isInteger(body.fiscalYear)) {
      throw new Error("fiscalYear is required.");
    }
    if (!Number.isInteger(body.periodNo)) {
      throw new Error("periodNo is required.");
    }
    const openingDebit = Number(body.openingDebit ?? 0);
    const openingCredit = Number(body.openingCredit ?? 0);
    if (!Number.isFinite(openingDebit) || !Number.isFinite(openingCredit) || openingDebit < 0 || openingCredit < 0) {
      throw new Error("Opening balance amounts must be non-negative numbers.");
    }
    if (openingDebit > 0 && openingCredit > 0) {
      throw new Error("Opening balance cannot contain both debit and credit.");
    }
    const key = `${account.code}:${body.fiscalYear}:${body.periodNo}`;
    const openingBalance = {
      id: state.openingBalances.get(key)?.id ?? `opening-balance:${state.openingBalances.size + 1}`,
      accountCode: account.code,
      accountName: account.name,
      accountId: account.id,
      normalBalance: account.normalBalance,
      fiscalYear: body.fiscalYear,
      periodNo: body.periodNo,
      openingDebit,
      openingCredit,
      enteredBy: body.enteredBy ?? actorIdFor(request, state),
      enteredAt: "now"
    };
    const savedOpeningBalance = platformStore?.saveOpeningBalance
      ? await platformStore.saveOpeningBalance(openingBalance)
      : openingBalance;
    state.openingBalances.set(key, savedOpeningBalance);
    appendAuditLog(state, {
      actorId: openingBalance.enteredBy,
      action: "opening_balance.save",
      objectType: "opening_balance",
      objectId: savedOpeningBalance.id
    });
    return jsonResponse(201, savedOpeningBalance);
  }

  if (request.method === "GET" && request.path === "/opening-balances") {
    if (platformStore?.listOpeningBalances) {
      return jsonResponse(200, await platformStore.listOpeningBalances());
    }
    return jsonResponse(200, [...state.openingBalances.values()]);
  }

  if (request.method === "GET" && request.path === "/opening-balances/trial-balance") {
    if (platformStore?.getOpeningTrialBalance) {
      return jsonResponse(200, await platformStore.getOpeningTrialBalance());
    }
    const rows = [...state.openingBalances.values()];
    const openingDebit = rows.reduce((sum, row) => sum + row.openingDebit, 0);
    const openingCredit = rows.reduce((sum, row) => sum + row.openingCredit, 0);
    return jsonResponse(200, {
      rows,
      totals: {
        openingDebit,
        openingCredit,
        difference: openingDebit - openingCredit,
        isBalanced: openingDebit === openingCredit
      }
    });
  }

  if (request.method === "POST" && (request.path === "/close/profit-loss-carry-forward" || request.path === "/posting/period-end/transfer-pl")) {
    const accountSetId = body.accountSetId;
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }

    const existingVouchers = platformStore?.listVouchers ? await platformStore.listVouchers(accountSetId) : [...state.vouchers.values()];
    const duplicate = existingVouchers.find(
      (voucher) =>
        voucher.accountSetId === accountSetId &&
        voucher.fiscalYear === body.fiscalYear &&
        voucher.periodNo === body.periodNo &&
        voucher.sourceType === "period_close"
    );
    if (duplicate) {
      return errorResponse(409, "PERIOD_CLOSE_CARRY_FORWARD_EXISTS", "Profit and loss carry-forward voucher already exists.");
    }

    const accounts = platformStore?.listAccounts ? await platformStore.listAccounts(accountSetId) : listAccounts(state);
    const balances = platformStore?.listAccountPeriodBalances
      ? await platformStore.listAccountPeriodBalances(accountSetId)
      : state.balances;
    const carryForwardVoucher = buildProfitLossCarryForwardVoucher({
      accountSetId,
      fiscalYear: body.fiscalYear,
      periodNo: body.periodNo,
      voucherDate: body.voucherDate,
      profitLossAccountCode: body.profitLossAccountCode,
      createdBy: body.createdBy ?? actorId,
      accounts,
      balances
    });
    const numberedCarryForwardVoucher = {
      ...carryForwardVoucher,
      id: uniqueVoucherId(),
      voucherNo: carryForwardVoucher.voucherNo ?? (await generateVoucherNo(state, carryForwardVoucher))
    };
    const savedVoucher = platformStore?.createVoucher
      ? await platformStore.createVoucher(numberedCarryForwardVoucher)
      : numberedCarryForwardVoucher;
    state.vouchers.set(savedVoucher.id, savedVoucher);
    appendVoucherStatusLog(state, {
      voucherId: savedVoucher.id,
      action: "create",
      fromStatus: null,
      toStatus: "draft",
      actorId: body.createdBy ?? actorId,
      reason: "Profit and loss carry-forward"
    });
    appendAuditLog(state, {
      actorId: body.createdBy ?? actorId,
      action: "period_close.generate_profit_loss",
      objectType: "voucher",
      objectId: savedVoucher.id
    });
    return jsonResponse(201, savedVoucher);
  }

  if (request.method === "POST" && request.path === "/vouchers") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    const periodError = await voucherPeriodMutationError(state, body, "creating vouchers");
    if (periodError) return periodError;
    const voucher = createVoucher({
      ...body,
      id: body.id ?? uniqueVoucherId(),
      voucherNo: body.voucherNo ?? (await generateVoucherNo(state, body))
    });
    voucher.revision = body.revision ?? 1;
    const savedVoucher = platformStore?.createVoucher ? await platformStore.createVoucher(voucher) : voucher;
    state.vouchers.set(savedVoucher.id, savedVoucher);
    appendVoucherStatusLog(state, {
      voucherId: savedVoucher.id,
      action: "create",
      fromStatus: null,
      toStatus: "draft",
      actorId: body.createdBy ?? "system"
    });
    appendAuditLog(state, {
      actorId: body.createdBy ?? "system",
      action: "voucher.create",
      objectType: "voucher",
      objectId: savedVoucher.id
    });
    return jsonResponse(201, savedVoucher);
  }

  if (request.method === "GET" && request.path === "/vouchers") {
    const actorId = actorIdFor(request, state);
    if (platformStore?.listVouchers) {
      const persistedVouchers = await platformStore.listVouchers();
      const visiblePersistedVouchers = [];
      for (const voucher of persistedVouchers) {
        if (await canAccessAccountSet(state, actorId, voucher.accountSetId)) {
          visiblePersistedVouchers.push(voucher);
        }
      }
      return jsonResponse(200, visiblePersistedVouchers);
    }
    const visibleVouchers = [];
    for (const voucher of state.vouchers.values()) {
      if (await canAccessAccountSet(state, actorId, voucher.accountSetId)) {
        visibleVouchers.push(voucher);
      }
    }
    return jsonResponse(
      200,
      visibleVouchers
    );
  }

  if (segments.length === 2 && segments[0] === "vouchers") {
    const voucher = await findVoucherByIdentifier(state, segments[1]);
    if (!voucher) {
      return errorResponse(404, "VOUCHER_NOT_FOUND", "Voucher was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, voucher.accountSetId))) {
      return accountSetAccessError(state, actorId, voucher.accountSetId);
    }

    if (request.method === "GET") {
      return jsonResponse(200, voucher);
    }

    if (request.method === "PATCH") {
      const currentPeriodError = await voucherPeriodMutationError(state, voucher, "updating vouchers");
      if (currentPeriodError) return currentPeriodError;
      const targetPeriodError = await voucherPeriodMutationError(
        state,
        {
          ...voucher,
          fiscalYear: body.fiscalYear ?? voucher.fiscalYear,
          periodNo: body.periodNo ?? voucher.periodNo
        },
        "moving vouchers"
      );
      if (targetPeriodError) return targetPeriodError;
      let updated;
      try {
        updated = updateVoucherDraft(voucher, {
          ...body,
          updatedBy: body.updatedBy ?? actorId
        });
      } catch (error) {
        const code = /modified by another user/.test(error.message) ? "VOUCHER_UPDATE_CONFLICT" : "VOUCHER_UPDATE_BLOCKED";
        return errorResponse(409, code, error.message);
      }
      const savedVoucher = platformStore?.updateVoucherDraft ? await platformStore.updateVoucherDraft(updated) : updated;
      state.vouchers.set(savedVoucher.id, savedVoucher);
      appendAuditLog(state, {
        actorId: savedVoucher.updatedBy ?? actorId,
        action: "voucher.update",
        objectType: "voucher",
        objectId: savedVoucher.id
      });
      return jsonResponse(200, savedVoucher);
    }

    if (request.method === "DELETE") {
      const periodError = await voucherPeriodMutationError(state, voucher, "deleting vouchers");
      if (periodError) return periodError;
      let deleted;
      try {
        deleted = voidVoucher(voucher, { voidedBy: body.deletedBy ?? actorId });
      } catch (error) {
        return errorResponse(409, "VOUCHER_DELETE_BLOCKED", error.message);
      }
      state.vouchers.set(deleted.id, deleted);
      const log = appendVoucherStatusLog(state, {
        voucherId: deleted.id,
        action: "void",
        fromStatus: voucher.status,
        toStatus: deleted.status,
        actorId: body.deletedBy ?? actorId,
        reason: "Deleted through voucher maintenance"
      });
      deleted = await persistVoucherStatusTransition(state, deleted, log);
      appendAuditLog(state, {
        actorId: body.deletedBy ?? actorId,
        action: "voucher.delete",
        objectType: "voucher",
        objectId: deleted.id
      });
      return jsonResponse(200, deleted);
    }
  }

  if (segments.length === 3 && segments[0] === "vouchers") {
    const voucher = await findVoucherByIdentifier(state, segments[1]);
    if (!voucher) {
      return errorResponse(404, "VOUCHER_NOT_FOUND", "Voucher was not found.");
    }

    const period = await findPeriod(state, voucher);
    const accounts = await listVoucherAccounts(state, voucher);
    const writeActions = new Set(["submit", "approve", "reject", "void", "reverse", "copy", "post"]);
    if (request.method === "POST" && writeActions.has(segments[2])) {
      const periodError = await voucherPeriodMutationError(state, voucher, `${segments[2]}ing vouchers`);
      if (periodError) return periodError;
    }

    if (request.method === "POST" && segments[2] === "submit") {
      let submitted = submitVoucher(voucher, {
        period,
        accounts,
        submittedBy: body.submittedBy ?? "system"
      });
      state.vouchers.set(submitted.id, submitted);
      const log = appendVoucherStatusLog(state, {
        voucherId: submitted.id,
        action: "submit",
        fromStatus: voucher.status,
        toStatus: submitted.status,
        actorId: body.submittedBy ?? "system"
      });
      submitted = await persistVoucherStatusTransition(state, submitted, log);
      appendAuditLog(state, {
        actorId: body.submittedBy ?? "system",
        action: "voucher.submit",
        objectType: "voucher",
        objectId: submitted.id
      });
      return jsonResponse(200, submitted);
    }

    if (request.method === "POST" && segments[2] === "approve") {
      let approved = approveVoucher(voucher, {
        period,
        approvedBy: body.approvedBy ?? "system"
      });
      state.vouchers.set(approved.id, approved);
      const log = appendVoucherStatusLog(state, {
        voucherId: approved.id,
        action: "approve",
        fromStatus: voucher.status,
        toStatus: approved.status,
        actorId: body.approvedBy ?? "system"
      });
      approved = await persistVoucherStatusTransition(state, approved, log);
      appendAuditLog(state, {
        actorId: body.approvedBy ?? "system",
        action: "voucher.approve",
        objectType: "voucher",
        objectId: approved.id
      });
      return jsonResponse(200, approved);
    }

    if (request.method === "POST" && segments[2] === "reject") {
      let rejected = rejectVoucher(voucher, {
        rejectedBy: body.rejectedBy ?? "system"
      });
      state.vouchers.set(rejected.id, rejected);
      const log = appendVoucherStatusLog(state, {
        voucherId: rejected.id,
        action: "reject",
        fromStatus: voucher.status,
        toStatus: rejected.status,
        actorId: body.rejectedBy ?? "system"
      });
      rejected = await persistVoucherStatusTransition(state, rejected, log);
      appendAuditLog(state, {
        actorId: body.rejectedBy ?? "system",
        action: "voucher.reject",
        objectType: "voucher",
        objectId: rejected.id
      });
      return jsonResponse(200, rejected);
    }

    if (request.method === "POST" && segments[2] === "void") {
      let voided = voidVoucher(voucher, {
        voidedBy: body.voidedBy ?? "system"
      });
      state.vouchers.set(voided.id, voided);
      const log = appendVoucherStatusLog(state, {
        voucherId: voided.id,
        action: "void",
        fromStatus: voucher.status,
        toStatus: voided.status,
        actorId: body.voidedBy ?? "system"
      });
      voided = await persistVoucherStatusTransition(state, voided, log);
      appendAuditLog(state, {
        actorId: body.voidedBy ?? "system",
        action: "voucher.void",
        objectType: "voucher",
        objectId: voided.id
      });
      return jsonResponse(200, voided);
    }

    if (request.method === "POST" && segments[2] === "reverse") {
      const reversedDraft = reverseVoucher(voucher, {
        reversedBy: body.reversedBy ?? "system",
        voucherDate: body.voucherDate,
        fiscalYear: body.fiscalYear,
        periodNo: body.periodNo
      });
      const reversed = {
        ...reversedDraft,
        id: uniqueVoucherId(),
        voucherNo: reversedDraft.voucherNo ?? (await generateVoucherNo(state, reversedDraft))
      };
      const savedVoucher = platformStore?.createVoucher ? await platformStore.createVoucher(reversed) : reversed;
      state.vouchers.set(savedVoucher.id, savedVoucher);
      appendVoucherStatusLog(state, {
        voucherId: savedVoucher.id,
        action: "create",
        fromStatus: null,
        toStatus: "draft",
        actorId: body.reversedBy ?? "system",
        reason: `Reverse ${voucher.id}`
      });
      appendAuditLog(state, {
        actorId: body.reversedBy ?? "system",
        action: "voucher.reverse",
        objectType: "voucher",
        objectId: savedVoucher.id
      });
      return jsonResponse(201, savedVoucher);
    }

    if (request.method === "POST" && segments[2] === "copy") {
      const actorId = actorIdFor(request, state);
      const copied = createVoucher({
        id: uniqueVoucherId(),
        accountSetId: voucher.accountSetId,
        fiscalYear: body.fiscalYear ?? voucher.fiscalYear,
        periodNo: body.periodNo ?? voucher.periodNo,
        voucherNo: await generateVoucherNo(state, {
          accountSetId: voucher.accountSetId,
          fiscalYear: body.fiscalYear ?? voucher.fiscalYear,
          periodNo: body.periodNo ?? voucher.periodNo
        }),
        voucherDate: body.voucherDate ?? voucher.voucherDate,
        createdBy: body.copiedBy ?? actorId,
        sourceType: "manual",
        lines: voucher.lines
      });
      const savedVoucher = platformStore?.createVoucher ? await platformStore.createVoucher(copied) : copied;
      state.vouchers.set(savedVoucher.id, savedVoucher);
      appendVoucherStatusLog(state, {
        voucherId: savedVoucher.id,
        action: "create",
        fromStatus: null,
        toStatus: "draft",
        actorId: body.copiedBy ?? actorId,
        reason: `Copy ${voucher.id}`
      });
      appendAuditLog(state, {
        actorId: body.copiedBy ?? actorId,
        action: "voucher.copy",
        objectType: "voucher",
        objectId: savedVoucher.id
      });
      return jsonResponse(201, savedVoucher);
    }

    if (request.method === "POST" && segments[2] === "post") {
      if (voucher.status === "posted") {
        return errorResponse(409, "VOUCHER_ALREADY_POSTED", "Voucher is already posted.");
      }
      const attachmentError = voucherAttachmentStatusError(state, voucher);
      if (attachmentError) return attachmentError;
      const posting = await postVoucherInState(state, voucher, {
        period,
        accounts,
        postedBy: body.postedBy ?? "system"
      });
      return jsonResponse(200, posting);
    }

    if (request.method === "GET" && segments[2] === "status-logs") {
      return jsonResponse(
        200,
        state.voucherStatusLogs.filter((log) => log.voucherId === voucher.id)
      );
    }

    if (request.method === "GET" && segments[2] === "attachments") {
      const attachments = state.attachmentLinks
        .filter((link) => link.objectType === "voucher" && link.objectId === voucher.id)
        .map((link) => ({
          ...state.attachments.get(link.attachmentId),
          link
        }))
        .filter((attachment) => attachment.id && attachment.status !== "deleted");
      return jsonResponse(200, attachments);
    }
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "posting" && segments[1] === "post-voucher") {
    const voucher = await findVoucherByIdentifier(state, segments[2]);
    if (!voucher) {
      return errorResponse(404, "VOUCHER_NOT_FOUND", "Voucher was not found.");
    }
    const period = await findPeriod(state, voucher);
    const accounts = await listVoucherAccounts(state, voucher);
    if (voucher.status === "posted") {
      return errorResponse(409, "VOUCHER_ALREADY_POSTED", "Voucher is already posted.");
    }
    const attachmentError = voucherAttachmentStatusError(state, voucher);
    if (attachmentError) return attachmentError;
    const posting = await postVoucherInState(state, voucher, {
      period,
      accounts,
      postedBy: body.postedBy ?? actorIdFor(request, state)
    });
    return jsonResponse(200, posting);
  }

  if (request.method === "POST" && request.path === "/posting/post-batch") {
    if (!Array.isArray(body.voucherIds) || body.voucherIds.length === 0) {
      throw new Error("voucherIds are required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }

    const postedBy = body.postedBy ?? actorId;
    const batch = {
      id: `posting-batch:${state.postingBatches.size + 1}`,
      accountSetId: body.accountSetId,
      fiscalYear: body.fiscalYear,
      periodNo: body.periodNo,
      voucherIds: [...body.voucherIds],
      successCount: 0,
      failedCount: 0,
      status: "success",
      postedBy,
      createdAt: "now",
      results: []
    };

    for (const voucherId of body.voucherIds) {
      const voucher = await findVoucherByIdentifier(state, voucherId);
      try {
        if (!voucher) {
          throw new Error("Voucher was not found.");
        }
        if (voucher.accountSetId !== body.accountSetId || voucher.fiscalYear !== body.fiscalYear || voucher.periodNo !== body.periodNo) {
          throw new Error("Voucher does not belong to the posting batch period.");
        }
        const posting = await postVoucherInState(state, voucher, {
          period: await findPeriod(state, voucher),
          accounts: await listVoucherAccounts(state, voucher),
          postedBy
        });
        batch.successCount += 1;
        batch.results.push({
          voucherId,
          status: "success",
          journalEntryCount: posting.journalEntries.length
        });
      } catch (error) {
        batch.failedCount += 1;
        batch.results.push({
          voucherId,
          status: "failed",
          error: error.message
        });
      }
    }

    batch.status = batch.failedCount === 0 ? "success" : batch.successCount === 0 ? "failed" : "partial_failed";
    state.postingBatches.set(batch.id, batch);
    appendAuditLog(state, {
      actorId: postedBy,
      action: "posting_batch.post",
      objectType: "posting_batch",
      objectId: batch.id
    });
    return jsonResponse(201, batch);
  }

  if (request.method === "GET" && request.path === "/posting/batches") {
    return jsonResponse(200, await listPostingBatches(state));
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "posting" && segments[1] === "batches") {
    const batch = (await listPostingBatches(state)).find((postingBatch) => postingBatch.id === segments[2]);
    if (!batch) {
      return errorResponse(404, "POSTING_BATCH_NOT_FOUND", "Posting batch was not found.");
    }
    return jsonResponse(200, batch);
  }

  if (request.method === "GET" && request.path === "/ledger/general-ledger") {
    if (platformStore?.listJournalEntries && platformStore?.listAccountPeriodBalances) {
      return jsonResponse(
        200,
        buildGeneralLedger(await platformStore.listJournalEntries(), await platformStore.listAccountPeriodBalances())
      );
    }
    return jsonResponse(200, buildGeneralLedger(state.journalEntries, state.balances));
  }

  if (request.method === "GET" && (request.path === "/ledger/trial-balance" || request.path === "/reports/trial-balance")) {
    if (platformStore?.listAccountPeriodBalances) {
      return jsonResponse(200, buildTrialBalance(await platformStore.listAccountPeriodBalances()));
    }
    return jsonResponse(200, buildTrialBalance(state.balances));
  }

  if (request.method === "GET" && (request.path === "/ledger/detail-ledger" || request.path === "/ledger/sub-ledger")) {
    if (platformStore?.listJournalEntries) {
      return jsonResponse(200, await platformStore.listJournalEntries());
    }
    return jsonResponse(200, state.journalEntries);
  }

  if (request.method === "GET" && (request.path === "/ledger/account-balances" || request.path === "/reports/account-balances")) {
    if (platformStore?.listAccountPeriodBalances) {
      return jsonResponse(200, await platformStore.listAccountPeriodBalances());
    }
    return jsonResponse(200, state.balances);
  }

  if (request.method === "GET" && request.path.split("?")[0] === "/report-templates") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const actorId = actorIdFor(request, state);
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const versions = [...state.reportTemplateVersions.values()];
    const visibleTemplates = accountSetId
      ? [...state.reportTemplates.values()].filter((template) => template.accountSetId === accountSetId)
      : await filterRowsByAccountSetAccess(state, actorId, [...state.reportTemplates.values()]);
    const templates = visibleTemplates
      .map((template) => publicReportTemplate(template, versions));
    return jsonResponse(200, templates);
  }

  if (request.method === "POST" && request.path === "/report-templates") {
    return createReportTemplate(state, body, actorIdFor(request, state));
  }

  if (request.method === "POST" && request.path === "/report-templates/statutory-presets") {
    return createStatutoryReportPresets(state, body, actorIdFor(request, state));
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "report-templates" && segments[2] === "versions") {
    return createReportTemplateVersion(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "report-template-versions") {
    const version = findReportTemplateVersionByIdentifier(state, segments[1]);
    if (!version) {
      return errorResponse(404, "REPORT_TEMPLATE_VERSION_NOT_FOUND", "Report template version was not found.");
    }
    const template = state.reportTemplates.get(version.templateId);
    const actorId = actorIdFor(request, state);
    if (template && !(await canAccessAccountSet(state, actorId, template.accountSetId))) {
      return accountSetAccessError(state, actorId, template.accountSetId);
    }
    return jsonResponse(200, cloneReportPayload(version));
  }

  if (
    request.method === "POST" &&
    segments.length === 3 &&
    segments[0] === "report-template-versions" &&
    segments[2] === "publish"
  ) {
    return publishReportTemplateVersion(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "GET" && request.path.split("?")[0] === "/report-runs") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const actorId = actorIdFor(request, state);
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const visibleRuns = accountSetId
      ? [...state.reportRuns.values()].filter((run) => run.accountSetId === accountSetId)
      : await filterRowsByAccountSetAccess(state, actorId, [...state.reportRuns.values()]);
    return jsonResponse(
      200,
      visibleRuns.map(publicReportRun)
    );
  }

  if (request.method === "GET" && request.path.split("?")[0] === "/report-exports") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const actorId = actorIdFor(request, state);
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const visibleExports = accountSetId
      ? [...state.reportExports.values()].filter((exportFile) => exportFile.accountSetId === accountSetId)
      : await filterRowsByAccountSetAccess(state, actorId, [...state.reportExports.values()]);
    return jsonResponse(
      200,
      visibleExports
    );
  }

  if (request.method === "GET" && request.path.split("?")[0] === "/ai-report-interpretations") {
    const query = queryParamsFor(request.path);
    const reportRunId = query.get("reportRunId");
    const run = reportRunId ? findReportRunByIdentifier(state, reportRunId) : null;
    const actorId = actorIdFor(request, state);
    if (run && !(await canAccessAccountSet(state, actorId, run.accountSetId))) {
      return accountSetAccessError(state, actorId, run.accountSetId);
    }
    const interpretations = reportRunId
      ? [...state.aiReportInterpretations.values()].filter((interpretation) => interpretation.reportRunId === reportRunId)
      : await filterRowsByAccountSetAccess(state, actorId, [...state.aiReportInterpretations.values()]);
    return jsonResponse(
      200,
      interpretations.map(publicAiReportInterpretation)
    );
  }

  if (request.method === "POST" && request.path === "/report-runs") {
    return createReportRun(state, body, actorIdFor(request, state));
  }

  if (
    request.method === "GET" &&
    segments.length === 5 &&
    segments[0] === "report-runs" &&
    segments[2] === "cells" &&
    segments[4] === "drilldown"
  ) {
    return buildReportCellDrilldown(state, segments[1], segments[3], actorIdFor(request, state));
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "report-runs") {
    const run = findReportRunByIdentifier(state, segments[1]);
    if (!run) {
      return errorResponse(404, "REPORT_RUN_NOT_FOUND", "Report run was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, run.accountSetId))) {
      return accountSetAccessError(state, actorId, run.accountSetId);
    }
    return jsonResponse(200, publicReportRun(run));
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "report-runs" && segments[2] === "recalculate") {
    return recalculateReportRun(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "report-runs" && segments[2] === "lock") {
    return lockReportRun(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "report-runs" && segments[2] === "submit-review") {
    return submitReportRunReview(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "GET" && request.path.split("?")[0] === "/report-approvals") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const reportRunId = query.get("reportRunId");
    const status = query.get("status");
    if (!accountSetId && !reportRunId) {
      throw new Error("accountSetId or reportRunId is required.");
    }
    const actorId = actorIdFor(request, state);
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const approvals = [];
    for (const approval of state.reportApprovals.values()) {
      if (accountSetId && approval.accountSetId !== accountSetId) continue;
      if (reportRunId && approval.reportRunId !== reportRunId) continue;
      if (status && approval.status !== status) continue;
      if (!(await canAccessAccountSet(state, actorId, approval.accountSetId))) continue;
      approvals.push(publicReportApproval(approval, findReportRunByIdentifier(state, approval.reportRunId)));
    }
    return jsonResponse(200, approvals);
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "report-approvals" && segments[2] === "approve") {
    return approveReportApproval(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "GET" && request.path.split("?")[0] === "/management-analysis") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const fiscalYear = Number(query.get("fiscalYear"));
    const periodNo = Number(query.get("periodNo"));
    if (!accountSetId || !Number.isInteger(fiscalYear) || !Number.isInteger(periodNo)) {
      throw new Error("accountSetId, fiscalYear, and periodNo are required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    return jsonResponse(
      200,
      await buildManagementAnalysis(state, {
        accountSetId,
        fiscalYear,
        periodNo,
        asOfDate: query.get("asOfDate") ?? new Date().toISOString().slice(0, 10)
      })
    );
  }

  if (request.method === "GET" && request.path.split("?")[0] === "/supply-chain/dashboard") {
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const fiscalYear = Number(query.get("fiscalYear"));
    const periodNo = Number(query.get("periodNo"));
    if (!accountSetId || !Number.isInteger(fiscalYear) || !Number.isInteger(periodNo)) {
      throw new Error("accountSetId, fiscalYear, and periodNo are required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    return jsonResponse(
      200,
      buildSupplyChainDashboard(state, {
        accountSetId,
        fiscalYear,
        periodNo,
        asOfDate: query.get("asOfDate") ?? new Date().toISOString().slice(0, 10)
      })
    );
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "report-runs" && segments[2] === "exports") {
    return createReportExport(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "report-runs" && segments[2] === "interpretations") {
    return createAiReportInterpretation(state, segments[1], body, actorIdFor(request, state));
  }

  if (request.method === "POST" && (request.path === "/ledger/bank-statements/import" || request.path === "/bank/statements")) {
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    if (typeof body.bankAccountCode !== "string" || body.bankAccountCode.trim() === "") {
      throw new Error("bankAccountCode is required.");
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      throw new Error("rows are required.");
    }
    const bankAccount = findAccountByIdentifier(state, body.bankAccountCode);
    if (!bankAccount) {
      return errorResponse(404, "BANK_ACCOUNT_NOT_FOUND", "Bank account was not found.");
    }
    if (!bankAccount.isBank) {
      return errorResponse(400, "ACCOUNT_IS_NOT_BANK", "Bank statement import requires an account marked as bank.");
    }

    const statements = body.rows.map((row, index) => ({
      id: `bank-statement:${state.bankStatements.size + index + 1}`,
      accountSetId: body.accountSetId,
      bankAccountId: bankAccount.id,
      bankAccountCode: bankAccount.code,
      transactionDate: row.transactionDate,
      description: row.description,
      amount: Number(row.amount),
      balance: row.balance ?? null,
      status: "unreconciled"
    }));
    const savedStatements = platformStore?.saveBankStatements ? await platformStore.saveBankStatements(statements) : statements;
    for (const statement of savedStatements) {
      state.bankStatements.set(statement.id, statement);
    }
    appendAuditLog(state, {
      actorId: body.importedBy ?? actorIdFor(request, state),
      action: "bank_statement.import",
      objectType: "bank_statement",
      objectId: savedStatements.map((statement) => statement.id).join(",")
    });
    return jsonResponse(201, savedStatements);
  }

  if (request.method === "GET" && (request.path === "/ledger/bank-statements" || request.path === "/bank/statements")) {
    if (platformStore?.listBankStatements) {
      return jsonResponse(200, await platformStore.listBankStatements());
    }
    return jsonResponse(200, [...state.bankStatements.values()]);
  }

  if (request.method === "POST" && (request.path === "/ledger/bank-reconciliations" || request.path === "/bank/reconcile")) {
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    if (!Number.isInteger(body.fiscalYear)) {
      throw new Error("fiscalYear is required.");
    }
    if (!Number.isInteger(body.periodNo)) {
      throw new Error("periodNo is required.");
    }

    const reconciliation = {
      id: `bank-reconciliation:${state.bankReconciliations.size + 1}`,
      accountSetId: body.accountSetId,
      fiscalYear: body.fiscalYear,
      periodNo: body.periodNo,
      status: "created",
      createdBy: body.createdBy ?? actorIdFor(request, state),
      createdAt: "now",
      matches: [],
      matchedCount: 0
    };
    const savedReconciliation = platformStore?.createBankReconciliation
      ? await platformStore.createBankReconciliation(reconciliation)
      : reconciliation;
    state.bankReconciliations.set(savedReconciliation.id, savedReconciliation);
    appendAuditLog(state, {
      actorId: savedReconciliation.createdBy,
      action: "bank_reconciliation.create",
      objectType: "bank_reconciliation",
      objectId: savedReconciliation.id
    });
    return jsonResponse(201, savedReconciliation);
  }

  if (request.method === "POST" && request.path === "/bank/reconcile/auto") {
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    if (!Number.isInteger(body.fiscalYear)) {
      throw new Error("fiscalYear is required.");
    }
    if (!Number.isInteger(body.periodNo)) {
      throw new Error("periodNo is required.");
    }

    const reconciliation = {
      id: `bank-reconciliation:${state.bankReconciliations.size + 1}`,
      accountSetId: body.accountSetId,
      fiscalYear: body.fiscalYear,
      periodNo: body.periodNo,
      status: "created",
      createdBy: body.createdBy ?? actorIdFor(request, state),
      createdAt: "now",
      matches: [],
      matchedCount: 0
    };
    const savedReconciliation = platformStore?.createBankReconciliation
      ? await platformStore.createBankReconciliation(reconciliation)
      : reconciliation;
    state.bankReconciliations.set(savedReconciliation.id, savedReconciliation);
    appendAuditLog(state, {
      actorId: savedReconciliation.createdBy,
      action: "bank_reconciliation.create",
      objectType: "bank_reconciliation",
      objectId: savedReconciliation.id
    });

    if (platformStore?.listBankStatements) {
      for (const statement of await platformStore.listBankStatements(savedReconciliation.accountSetId)) {
        state.bankStatements.set(statement.id, statement);
      }
    }
    const matchState = platformStore?.listJournalEntries
      ? { ...state, journalEntries: await platformStore.listJournalEntries(savedReconciliation.accountSetId) }
      : state;
    const result = matchBankReconciliation(matchState, savedReconciliation, {
      matchedBy: body.matchedBy ?? actorIdFor(request, state)
    });
    const savedResult = platformStore?.saveBankReconciliationMatch
      ? await platformStore.saveBankReconciliationMatch(result)
      : result;
    state.bankReconciliations.set(savedResult.id, savedResult);
    appendAuditLog(state, {
      actorId: body.matchedBy ?? actorIdFor(request, state),
      action: "bank_reconciliation.match",
      objectType: "bank_reconciliation",
      objectId: savedResult.id
    });
    return jsonResponse(200, savedResult);
  }

  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "ledger" &&
    segments[1] === "bank-reconciliations" &&
    segments[3] === "match"
  ) {
    const reconciliation = state.bankReconciliations.get(segments[2]);
    if (!reconciliation) {
      return errorResponse(404, "BANK_RECONCILIATION_NOT_FOUND", "Bank reconciliation was not found.");
    }
    if (platformStore?.listBankStatements) {
      for (const statement of await platformStore.listBankStatements(reconciliation.accountSetId)) {
        state.bankStatements.set(statement.id, statement);
      }
    }
    const matchState = platformStore?.listJournalEntries
      ? { ...state, journalEntries: await platformStore.listJournalEntries(reconciliation.accountSetId) }
      : state;
    const result = matchBankReconciliation(matchState, reconciliation, { matchedBy: body.matchedBy ?? actorIdFor(request, state) });
    const savedResult = platformStore?.saveBankReconciliationMatch
      ? await platformStore.saveBankReconciliationMatch(result)
      : result;
    state.bankReconciliations.set(savedResult.id, savedResult);
    appendAuditLog(state, {
      actorId: body.matchedBy ?? actorIdFor(request, state),
      action: "bank_reconciliation.match",
      objectType: "bank_reconciliation",
      objectId: savedResult.id
    });
    return jsonResponse(200, savedResult);
  }

  if (request.method === "GET" && request.path === "/audit-logs") {
    return jsonResponse(200, state.auditLogs);
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "security" && segments[1] === "events") {
    const actorId = actorIdFor(request, state);
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const eventType = query.get("eventType");
    const severity = query.get("severity");
    const filterActorId = query.get("actorId");
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const rawItems = platformStore?.listSecurityEvents
      ? await platformStore.listSecurityEvents(accountSetId, { eventType, severity, actorId: filterActorId })
      : listSecurityEvents(state, { accountSetId, eventType, severity, actorId: filterActorId });
    const items = [];
    for (const item of rawItems) {
      if (item.accountSetId && !accountSetId && !(await canAccessAccountSet(state, actorId, item.accountSetId))) {
        continue;
      }
      items.push(item);
    }
    return jsonResponse(200, {
      accountSetId: accountSetId ?? null,
      eventType: eventType ?? null,
      severity: severity ?? null,
      actorId: filterActorId ?? null,
      total: items.length,
      items
    });
  }

  if (request.method === "POST" && request.path === "/attachments/upload") {
    if (typeof body.filename !== "string" || body.filename.trim() === "") {
      throw new Error("filename is required.");
    }
    if (typeof body.contentType !== "string" || body.contentType.trim() === "") {
      throw new Error("contentType is required.");
    }
    if (!Number.isInteger(body.byteSize) || body.byteSize <= 0) {
      throw new Error("byteSize must be a positive integer.");
    }

    const attachmentNo = state.attachments.size + 1;
    let storageProvider = body.storageProvider ?? "external";
    let storageKey = body.storageKey ?? `phase-1/${attachmentNo}/${body.filename}`;
    let checksum = body.checksum ?? null;
    const configuredAttachmentStorageProvider = attachmentStorageProviderFor(state);

    if (body.contentBase64 !== undefined) {
      if (configuredAttachmentStorageProvider === "external") {
        return errorResponse(
          409,
          "ATTACHMENT_EXTERNAL_STORAGE_REQUIRED",
          "External attachment storage requires pre-uploaded object metadata instead of local binary content."
        );
      }
      if (typeof body.contentBase64 !== "string" || body.contentBase64.trim() === "") {
        throw new Error("contentBase64 must be a non-empty base64 string when provided.");
      }
      const content = Buffer.from(body.contentBase64, "base64");
      if (content.length !== body.byteSize) {
        return errorResponse(
          400,
          "ATTACHMENT_SIZE_MISMATCH",
          `Uploaded attachment content is ${content.length} bytes but byteSize declares ${body.byteSize}.`
        );
      }
      const calculatedChecksum = sha256Checksum(content);
      if (body.checksum && body.checksum !== calculatedChecksum) {
        return errorResponse(400, "ATTACHMENT_CHECKSUM_MISMATCH", "Uploaded attachment checksum does not match content.");
      }

      storageProvider = "local";
      storageKey = `local/attachments/${attachmentNo}-${safeStorageSegment(body.filename)}`;
      const storedPath = join(attachmentStorageRootFor(state), storageKey);
      mkdirSync(dirname(storedPath), { recursive: true });
      writeFileSync(storedPath, content);
      checksum = calculatedChecksum;
    } else if (configuredAttachmentStorageProvider === "external") {
      if (body.storageProvider !== "external" || typeof body.storageKey !== "string" || body.storageKey.trim() === "") {
        return errorResponse(
          400,
          "ATTACHMENT_EXTERNAL_METADATA_REQUIRED",
          "External attachment storage requires explicit storageProvider external and storageKey metadata."
        );
      }
      if (typeof body.checksum !== "string" || !body.checksum.startsWith("sha256:")) {
        return errorResponse(
          400,
          "ATTACHMENT_EXTERNAL_CHECKSUM_REQUIRED",
          "External attachment storage requires a sha256 checksum for object integrity verification."
        );
      }
      if (state.config.externalAttachmentStore?.verifyObject) {
        const verification = await state.config.externalAttachmentStore.verifyObject({
          storageKey: body.storageKey,
          byteSize: body.byteSize,
          checksum: body.checksum,
          contentType: body.contentType
        });
        if (!verification?.exists) {
          return errorResponse(
            409,
            "ATTACHMENT_EXTERNAL_OBJECT_NOT_FOUND",
            "External attachment object was not found in the configured storage service."
          );
        }
        if (verification.byteSize !== undefined && verification.byteSize !== body.byteSize) {
          return errorResponse(
            400,
            "ATTACHMENT_EXTERNAL_SIZE_MISMATCH",
            "External attachment object size does not match metadata."
          );
        }
        if (verification.checksum && verification.checksum !== body.checksum) {
          return errorResponse(
            400,
            "ATTACHMENT_EXTERNAL_CHECKSUM_MISMATCH",
            "External attachment object checksum does not match metadata."
          );
        }
      }
    }

    const attachment = {
      id: `attachment:${attachmentNo}`,
      accountSetId: body.accountSetId ?? "account-set:001",
      filename: body.filename,
      contentType: body.contentType,
      byteSize: body.byteSize,
      checksum,
      storageProvider,
      storageKey,
      status: "available",
      uploadedBy: body.uploadedBy ?? actorIdFor(request, state),
      uploadedAt: "now",
      retentionUntil: retentionUntilFor(state),
      deletedBy: null,
      deletedAt: null
    };
    state.attachments.set(attachment.id, attachment);
    appendAuditLog(state, {
      actorId: attachment.uploadedBy,
      action: "attachment.upload",
      objectType: "attachment",
      objectId: attachment.id
    });
    return jsonResponse(201, attachment);
  }

  if (request.method === "POST" && request.path === "/attachment-links") {
    const attachment = state.attachments.get(body.attachmentId);
    if (!attachment) {
      return errorResponse(404, "ATTACHMENT_NOT_FOUND", "Attachment was not found.");
    }
    if (attachment.status !== "available") {
      return errorResponse(409, "ATTACHMENT_NOT_AVAILABLE", "Only available attachments can be linked.");
    }
    if (typeof body.objectType !== "string" || body.objectType.trim() === "") {
      throw new Error("objectType is required.");
    }
    if (typeof body.objectId !== "string" || body.objectId.trim() === "") {
      throw new Error("objectId is required.");
    }
    if (body.objectType === "voucher" && !state.vouchers.has(body.objectId)) {
      return errorResponse(404, "VOUCHER_NOT_FOUND", "Voucher was not found.");
    }

    const existingLink = state.attachmentLinks.find(
      (link) =>
        link.attachmentId === body.attachmentId &&
        link.objectType === body.objectType &&
        link.objectId === body.objectId
    );
    const link =
      existingLink ?? {
        id: `attachment-link:${state.attachmentLinks.length + 1}`,
        attachmentId: body.attachmentId,
        objectType: body.objectType,
        objectId: body.objectId,
        linkedBy: body.linkedBy ?? actorIdFor(request, state),
        linkedAt: "now"
      };
    if (!existingLink) {
      state.attachmentLinks.push(link);
      if (body.objectType === "voucher") {
        const voucher = state.vouchers.get(body.objectId);
        state.vouchers.set(voucher.id, {
          ...voucher,
          attachmentCount: (voucher.attachmentCount ?? 0) + 1
        });
      }
    }
    appendAuditLog(state, {
      actorId: link.linkedBy,
      action: "attachment.link",
      objectType: body.objectType,
      objectId: body.objectId
    });
    return jsonResponse(201, link);
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "attachments") {
    const attachment = state.attachments.get(segments[1]);
    if (!attachment) {
      return errorResponse(404, "ATTACHMENT_NOT_FOUND", "Attachment was not found.");
    }
    return jsonResponse(200, attachment);
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "attachments" && segments[2] === "status") {
    const attachment = state.attachments.get(segments[1]);
    if (!attachment) {
      return errorResponse(404, "ATTACHMENT_NOT_FOUND", "Attachment was not found.");
    }
    return jsonResponse(200, { id: attachment.id, status: attachment.status });
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "attachments" && segments[2] === "content") {
    const attachment = state.attachments.get(segments[1]);
    if (!attachment) {
      return errorResponse(404, "ATTACHMENT_NOT_FOUND", "Attachment was not found.");
    }
    if (attachment.storageProvider !== "local") {
      return errorResponse(404, "ATTACHMENT_CONTENT_NOT_FOUND", "Attachment content is not stored in local object storage.");
    }

    try {
      const content = readFileSync(join(attachmentStorageRootFor(state), attachment.storageKey));
      return jsonResponse(200, {
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        byteSize: content.length,
        checksum: attachment.checksum,
        contentBase64: content.toString("base64")
      });
    } catch {
      return errorResponse(404, "ATTACHMENT_CONTENT_NOT_FOUND", "Attachment content was not found.");
    }
  }

  if (request.method === "DELETE" && segments.length === 2 && segments[0] === "attachments") {
    const attachment = state.attachments.get(segments[1]);
    if (!attachment) {
      return errorResponse(404, "ATTACHMENT_NOT_FOUND", "Attachment was not found.");
    }
    const voucherLinks = state.attachmentLinks.filter(
      (link) => link.attachmentId === attachment.id && link.objectType === "voucher"
    );
    const postedVoucherLink = voucherLinks.find((link) => state.vouchers.get(link.objectId)?.status === "posted");
    if (postedVoucherLink) {
      return errorResponse(
        409,
        "POSTED_VOUCHER_ATTACHMENT_DELETE_BLOCKED",
        "Posted voucher attachments cannot be deleted."
      );
    }
    if (attachmentRetentionActive(attachment)) {
      return errorResponse(
        409,
        "ATTACHMENT_RETENTION_DELETE_BLOCKED",
        "Attachment cannot be deleted before its retention policy expires."
      );
    }

    const deleted = {
      ...attachment,
      status: "deleted",
      deletedBy: body.deletedBy ?? actorIdFor(request, state),
      deletedAt: "now"
    };
    state.attachments.set(deleted.id, deleted);
    for (const link of voucherLinks) {
      const voucher = state.vouchers.get(link.objectId);
      if (voucher) {
        state.vouchers.set(voucher.id, {
          ...voucher,
          attachmentCount: Math.max((voucher.attachmentCount ?? 0) - 1, 0)
        });
      }
    }
    appendAuditLog(state, {
      actorId: deleted.deletedBy,
      action: "attachment.delete",
      objectType: "attachment",
      objectId: deleted.id
    });
    return jsonResponse(200, deleted);
  }

  if (request.method === "POST" && request.path === "/agent/draft-candidates") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    const candidate = await createAgentDraftCandidate(state, body, actorId);
    const savedCandidate = await persistAgentDraftCandidateForRoute(state, candidate);
    appendAuditLog(state, {
      actorId,
      action: "agent.draft_candidate.create",
      objectType: "agent_draft_candidate",
      objectId: savedCandidate.id
    });
    return jsonResponse(201, savedCandidate);
  }

  if (request.method === "POST" && request.path === "/ai/ocr-preview") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    try {
      const preview = await createOcrPreview(state, body, actorId);
      appendAuditLog(state, {
        actorId,
        action: "ai.ocr_preview.create",
        objectType: "ocr_preview",
        objectId: preview.id
      });
      return jsonResponse(201, preview);
    } catch (error) {
      return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "ai" && segments[1] === "llm-draft-runs" && segments[2] === "metrics") {
    const actorId = actorIdFor(request, state);
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const draftType = query.get("draftType");
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const sourceRuns = platformStore?.listLlmDraftRuns
      ? await platformStore.listLlmDraftRuns(accountSetId, { draftType })
      : [...state.llmDraftRuns.values()];
    const runs = [];
    for (const run of sourceRuns) {
      if (!run.accountSetId) continue;
      if (accountSetId && run.accountSetId !== accountSetId) continue;
      if (draftType && run.inputSummary?.draftType !== draftType) continue;
      if (!accountSetId && !(await canAccessAccountSet(state, actorId, run.accountSetId))) continue;
      runs.push(run);
    }
    const candidates = platformStore?.listAgentDraftCandidates
      ? await platformStore.listAgentDraftCandidates(accountSetId, { draftType })
      : [...state.agentDraftCandidates.values()];
    return jsonResponse(
      200,
      buildLlmDraftMetrics(runs, candidates, {
        accountSetId,
        draftType
      })
    );
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "ai" && segments[1] === "llm-draft-runs") {
    const actorId = actorIdFor(request, state);
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const status = query.get("status");
    const draftType = query.get("draftType");
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const rawItems = platformStore?.listLlmDraftRuns
      ? (await platformStore.listLlmDraftRuns(accountSetId, { status, draftType })).map(summarizeLlmDraftRun)
      : listLlmDraftRuns(state, { accountSetId, status, draftType });
    const items = [];
    for (const item of rawItems) {
      if (!item.accountSetId) continue;
      if (!accountSetId && !(await canAccessAccountSet(state, actorId, item.accountSetId))) {
        continue;
      }
      items.push(item);
    }
    return jsonResponse(200, {
      accountSetId: accountSetId ?? null,
      status: status ?? null,
      draftType: draftType ?? null,
      total: items.length,
      items
    });
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "agent" && segments[1] === "draft-candidates") {
    const actorId = actorIdFor(request, state);
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const status = query.get("status");
    const draftType = query.get("draftType");
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const rawItems = platformStore?.listAgentDraftCandidates
      ? (await platformStore.listAgentDraftCandidates(accountSetId, { status, draftType })).map(summarizeAgentDraftCandidate)
      : listAgentDraftCandidateQueue(state, { accountSetId, status, draftType });
    const items = [];
    for (const item of rawItems) {
      if (!accountSetId && !(await canAccessAccountSet(state, actorId, item.accountSetId))) {
        continue;
      }
      items.push(item);
    }
    return jsonResponse(200, {
      accountSetId: accountSetId ?? null,
      status: status ?? null,
      draftType: draftType ?? null,
      total: items.length,
      items
    });
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "agent" && segments[1] === "draft-candidates") {
    const candidateId = decodedPathId(segments[2]);
    const candidate =
      state.agentDraftCandidates.get(candidateId) ??
      (platformStore?.findAgentDraftCandidate ? await platformStore.findAgentDraftCandidate(candidateId) : null);
    if (!candidate) {
      return errorResponse(404, "AGENT_DRAFT_CANDIDATE_NOT_FOUND", "Agent draft candidate was not found.");
    }
    state.agentDraftCandidates.set(candidate.id, candidate);
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, candidate.accountSetId))) {
      return accountSetAccessError(state, actorId, candidate.accountSetId);
    }
    return jsonResponse(200, candidate);
  }

  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "agent" &&
    segments[1] === "draft-candidates" &&
    segments[3] === "reject"
  ) {
    const candidateId = decodedPathId(segments[2]);
    const candidate =
      state.agentDraftCandidates.get(candidateId) ??
      (platformStore?.findAgentDraftCandidate ? await platformStore.findAgentDraftCandidate(candidateId) : null);
    if (!candidate) {
      return errorResponse(404, "AGENT_DRAFT_CANDIDATE_NOT_FOUND", "Agent draft candidate was not found.");
    }
    state.agentDraftCandidates.set(candidate.id, candidate);
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, candidate.accountSetId))) {
      return accountSetAccessError(state, actorId, candidate.accountSetId);
    }
    try {
      const rejectedCandidate = rejectAgentDraftCandidate(state, candidate, body, actorId);
      const savedCandidate = platformStore?.updateAgentDraftCandidate
        ? await platformStore.updateAgentDraftCandidate(rejectedCandidate)
        : rejectedCandidate;
      state.agentDraftCandidates.set(savedCandidate.id, savedCandidate);
      return jsonResponse(200, savedCandidate);
    } catch (error) {
      return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "agent" &&
    segments[1] === "draft-candidates" &&
    segments[3] === "convert"
  ) {
    const candidateId = decodedPathId(segments[2]);
    const candidate =
      state.agentDraftCandidates.get(candidateId) ??
      (platformStore?.findAgentDraftCandidate ? await platformStore.findAgentDraftCandidate(candidateId) : null);
    if (!candidate) {
      return errorResponse(404, "AGENT_DRAFT_CANDIDATE_NOT_FOUND", "Agent draft candidate was not found.");
    }
    state.agentDraftCandidates.set(candidate.id, candidate);
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, candidate.accountSetId))) {
      return accountSetAccessError(state, actorId, candidate.accountSetId);
    }
    try {
      const persistConvertedAgentDraftCandidate = async () => {
        const convertedCandidate = state.agentDraftCandidates.get(candidate.id);
        if (!convertedCandidate) return;
        const savedCandidate = platformStore?.updateAgentDraftCandidate
          ? await platformStore.updateAgentDraftCandidate(convertedCandidate)
          : convertedCandidate;
        state.agentDraftCandidates.set(savedCandidate.id, savedCandidate);
      };
      const conversionBody = {
        ...body,
        resolvedUnmatchedItems: assertAgentDraftUnmatchedItemsResolved(candidate, body)
      };
      if (candidate.draftType === "voucher") {
        const result = await convertAgentDraftCandidateToVoucher(state, candidate, conversionBody, actorId);
        if (result.error) {
          return result.error;
        }
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.voucher);
      }
      if (candidate.draftType === "purchase_order") {
        const result = await convertAgentDraftCandidateToPurchaseOrder(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.purchaseOrder);
      }
      if (candidate.draftType === "sales_order") {
        const result = await convertAgentDraftCandidateToSalesOrder(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.salesOrder);
      }
      if (candidate.draftType === "inventory_movement") {
        const result = convertAgentDraftCandidateToInventoryMovementDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.inventoryMovementDraft);
      }
      if (candidate.draftType === "material_requisition") {
        const result = convertAgentDraftCandidateToMaterialRequisitionDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.materialRequisitionDraft);
      }
      if (candidate.draftType === "product_receipt") {
        const result = convertAgentDraftCandidateToProductReceiptDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.productReceiptDraft);
      }
      if (candidate.draftType === "stock_count") {
        const result = convertAgentDraftCandidateToStockCountPreview(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.stockCountPreview);
      }
      if (candidate.draftType === "master_data") {
        const result = convertAgentDraftCandidateToMasterDataDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.masterDataDraft);
      }
      if (candidate.draftType === "payroll_allocation") {
        const result = convertAgentDraftCandidateToPayrollAllocationDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.payrollAllocationDraft);
      }
      if (candidate.draftType === "depreciation_run") {
        const result = convertAgentDraftCandidateToDepreciationRunDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.depreciationRunDraft);
      }
      if (candidate.draftType === "asset_change") {
        const result = convertAgentDraftCandidateToAssetChangeDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.assetChangeDraft);
      }
      if (candidate.draftType === "report_interpretation") {
        const result = convertAgentDraftCandidateToReportInterpretationDraft(state, candidate, conversionBody, actorId);
        await persistConvertedAgentDraftCandidate();
        return jsonResponse(201, result.reportInterpretationDraft);
      }
      throw unsupportedAgentDraftConversion(candidate.draftType);
    } catch (error) {
      return errorResponse(
        400,
        ["AGENT_DRAFT_CONVERSION_UNSUPPORTED", "AGENT_DRAFT_UNMATCHED_ITEMS_UNRESOLVED"].includes(error.code)
          ? error.code
          : "BUSINESS_RULE_FAILED",
        error.message
      );
    }
  }

  if (request.method === "POST" && request.path === "/ai/llm-draft-runs") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    const llmDraftRun = await createLlmDraftRun(state, body);
    const savedRun = platformStore?.createLlmDraftRun ? await platformStore.createLlmDraftRun(llmDraftRun) : llmDraftRun;
    state.llmDraftRuns.set(savedRun.id, savedRun);
    appendAuditLog(state, {
      actorId,
      action: "ai.llm_draft_run.create",
      objectType: "llm_draft_run",
      objectId: savedRun.id
    });
    return jsonResponse(201, savedRun);
  }

  if (request.method === "GET" && request.path === "/agent-tools") {
    return jsonResponse(200, { tools: listAgentTools() });
  }

  if (request.method === "POST" && segments.length === 3 && segments[0] === "agent-tools" && segments[2] === "invoke") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    try {
      const result = await invokeRegisteredAgentTool(state, decodedPathId(segments[1]), body, actorId);
      return jsonResponse(201, result);
    } catch (error) {
      if (error.code === "AGENT_TOOL_NOT_AGENT_ALLOWED") {
        return errorResponse(403, error.code, error.message);
      }
      return errorResponse(
        400,
        ["AGENT_TOOL_NOT_REGISTERED", "AGENT_TOOL_SCHEMA_INVALID"].includes(error.code) ? error.code : "BUSINESS_RULE_FAILED",
        error.message
      );
    }
  }

  if (request.method === "POST" && request.path === "/agent-actions") {
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    try {
      const action = createAgentActionRecord(state, body, actorId);
      const savedAction = await persistAgentActionForRoute(state, action, { create: true });
      appendAuditLog(state, {
        actorId: savedAction.requestedBy,
        action: "agent_action.create",
        objectType: "agent_action",
        objectId: savedAction.id
      });
      return jsonResponse(201, publicAgentAction(state, savedAction));
    } catch (error) {
      return errorResponse(400, error.code === "AGENT_TOOL_NOT_REGISTERED" ? error.code : "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (request.method === "GET" && segments.length === 1 && segments[0] === "agent-actions") {
    const actorId = actorIdFor(request, state);
    const query = queryParamsFor(request.path);
    const accountSetId = query.get("accountSetId");
    const status = query.get("status");
    const riskLevel = query.get("riskLevel");
    const toolName = query.get("toolName");
    if (accountSetId && !(await canAccessAccountSet(state, actorId, accountSetId))) {
      return accountSetAccessError(state, actorId, accountSetId);
    }
    const rawItems = platformStore?.listAgentActions
      ? (await platformStore.listAgentActions(accountSetId, { status, riskLevel, toolName })).map(summarizeAgentAction)
      : listAgentActions(state, { accountSetId, status, riskLevel, toolName });
    const items = [];
    for (const item of rawItems) {
      if (!accountSetId && !(await canAccessAccountSet(state, actorId, item.accountSetId))) {
        continue;
      }
      items.push(item);
    }
    return jsonResponse(200, {
      accountSetId: accountSetId ?? null,
      status: status ?? null,
      riskLevel: riskLevel ?? null,
      toolName: toolName ?? null,
      total: items.length,
      items
    });
  }

  if (request.method === "GET" && segments.length === 2 && segments[0] === "agent-actions") {
    const action = await loadAgentActionForRoute(state, decodedPathId(segments[1]));
    if (!action) {
      return errorResponse(404, "AGENT_ACTION_NOT_FOUND", "Agent action was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, action.accountSetId))) {
      return accountSetAccessError(state, actorId, action.accountSetId);
    }
    return jsonResponse(200, publicAgentAction(state, action));
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "agent-actions" && segments[2] === "replay") {
    const action = await loadAgentActionForRoute(state, decodedPathId(segments[1]));
    if (!action) {
      return errorResponse(404, "AGENT_ACTION_NOT_FOUND", "Agent action was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, action.accountSetId))) {
      return accountSetAccessError(state, actorId, action.accountSetId);
    }
    return jsonResponse(200, {
      agentActionId: action.id,
      auditSummary: buildAgentActionAuditSummary(state, action),
      events: agentActionReplayEventsFor(state, action.id)
    });
  }

  if (
    request.method === "POST" &&
    segments.length === 3 &&
    segments[0] === "agent-actions" &&
    ["submit", "approve", "execute", "reverse"].includes(segments[2])
  ) {
    const currentAction = await loadAgentActionForRoute(state, decodedPathId(segments[1]));
    if (!currentAction) {
      return errorResponse(404, "AGENT_ACTION_NOT_FOUND", "Agent action was not found.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, currentAction.accountSetId))) {
      return accountSetAccessError(state, actorId, currentAction.accountSetId);
    }
    try {
      const updated =
        segments[2] === "submit"
          ? submitAgentActionForApproval(state, currentAction, body, actorId)
          : segments[2] === "approve"
            ? approveAgentActionRecord(state, currentAction, body, actorId)
            : segments[2] === "execute"
              ? executeAgentActionRecord(state, currentAction, body, actorId)
              : reverseAgentActionRecord(state, currentAction, body, actorId);
      const savedAction = await persistAgentActionForRoute(state, updated);
      appendAuditLog(state, {
        actorId: body.submittedBy ?? body.approvedBy ?? body.executedBy ?? body.reversedBy ?? actorId,
        action: `agent_action.${segments[2]}`,
        objectType: "agent_action",
        objectId: savedAction.id
      });
      return jsonResponse(200, publicAgentAction(state, savedAction));
    } catch (error) {
      if (platformStore?.replaceAgentReplayEvents) {
        const savedEvents = await platformStore.replaceAgentReplayEvents(
          currentAction.id,
          agentActionReplayEventsFor(state, currentAction.id)
        );
        hydrateAgentReplayEvents(state, currentAction.id, savedEvents);
      }
      return errorResponse(409, error.code ?? "BUSINESS_RULE_FAILED", error.message);
    }
  }

  if (request.method === "POST" && (request.path === "/ai/voucher-suggestions" || request.path === "/ai/voucher-drafts")) {
    if (body.dryRun !== true) {
      throw new Error("AI voucher suggestions must use dryRun true.");
    }
    if (typeof body.content !== "string" || body.content.trim() === "") {
      throw new Error("content is required.");
    }
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    const attachmentIds = Array.isArray(body.attachmentIds) ? [...body.attachmentIds] : [];
    for (const attachmentId of attachmentIds) {
      const attachment = state.attachments.get(attachmentId);
      if (!attachment || attachment.status !== "available" || attachment.accountSetId !== body.accountSetId) {
        return errorResponse(
          409,
          "AI_ATTACHMENT_NOT_AVAILABLE",
          "AI voucher draft attachments must exist, belong to the account set, and be available."
        );
      }
    }

    const amountMatch = body.content.match(/(\d+(?:\.\d+)?)/);
    const amount = amountMatch ? Number(amountMatch[1]) : 0;
    const evidenceRefs = [...new Set([...(Array.isArray(body.evidenceRefs) ? body.evidenceRefs : []), ...attachmentIds])];
    const suggestion = {
      id: `ai-voucher-suggestion:${state.aiVoucherSuggestions.size + 1}`,
      dryRun: true,
      approvalRequired: true,
      riskLevel: "medium",
      confidence: amount > 0 ? 0.86 : 0.42,
      evidenceRefs,
      attachmentIds,
      warnings: amount > 0 ? ["请人工确认科目和附件。"] : ["未识别金额，必须人工补全。"],
      draft: {
        id: `ai-draft:${state.aiVoucherSuggestions.size + 1}`,
        accountSetId: body.accountSetId,
        fiscalYear: body.fiscalYear ?? new Date().getFullYear(),
        periodNo: body.periodNo ?? 1,
        voucherDate: body.voucherDate ?? new Date().toISOString().slice(0, 10),
        status: "draft",
        sourceType: "ai",
        createdBy: "ai-draft-service",
        submittedBy: null,
        approvedBy: null,
        postedBy: null,
        lines: [
          {
            lineNo: 1,
            summary: "AI建议：购买办公用品",
            accountCode: "6602",
            debit: amount,
            credit: 0,
            auxiliaries: {}
          },
          {
            lineNo: 2,
            summary: "AI建议：银行付款",
            accountCode: "1002",
            debit: 0,
            credit: amount,
            auxiliaries: {}
          }
        ]
      }
    };
    state.aiVoucherSuggestions.set(suggestion.id, suggestion);
    appendAuditLog(state, {
      actorId: body.requestedBy ?? actorIdFor(request, state),
      action: "ai.generate_draft",
      objectType: "ai_voucher_suggestion",
      objectId: suggestion.id
    });
    return jsonResponse(201, suggestion);
  }

  if (
    request.method === "POST" &&
    ["/ai/reconciliation-suggestions", "/ai/collection-drafts", "/ai/exception-checks"].includes(request.path)
  ) {
    if (body.dryRun !== true) {
      throw new Error("Agent suggestions must use dryRun true.");
    }
    if (typeof body.accountSetId !== "string" || body.accountSetId.trim() === "") {
      throw new Error("accountSetId is required.");
    }
    const actorId = actorIdFor(request, state);
    if (!(await canAccessAccountSet(state, actorId, body.accountSetId))) {
      return accountSetAccessError(state, actorId, body.accountSetId);
    }
    const asOfDate = body.asOfDate ?? new Date().toISOString().slice(0, 10);
    const requestedBy = body.requestedBy ?? actorId;
    if (request.path === "/ai/reconciliation-suggestions") {
      const result = {
        id: `ai-reconciliation-suggestion:${randomUUID()}`,
        accountSetId: body.accountSetId,
        dryRun: true,
        approvalRequired: true,
        riskLevel: "medium",
        asOfDate,
        requestedBy,
        suggestions: await buildAiReconciliationSuggestions(state, body.accountSetId, asOfDate),
        warnings: ["Suggestions are dry-run only and require human confirmation before settlement."]
      };
      appendAuditLog(state, {
        actorId: requestedBy,
        action: "ai.reconciliation_suggest",
        objectType: "ai_reconciliation_suggestion",
        objectId: result.id
      });
      return jsonResponse(201, result);
    }
    if (request.path === "/ai/collection-drafts") {
      const result = {
        id: `ai-collection-draft:${randomUUID()}`,
        accountSetId: body.accountSetId,
        dryRun: true,
        approvalRequired: true,
        riskLevel: "medium",
        asOfDate,
        requestedBy,
        drafts: await buildAiCollectionDrafts(state, body.accountSetId, asOfDate),
        warnings: ["Collection drafts must be reviewed and sent by a human."]
      };
      appendAuditLog(state, {
        actorId: requestedBy,
        action: "ai.collection_draft",
        objectType: "ai_collection_draft",
        objectId: result.id
      });
      return jsonResponse(201, result);
    }
    const result = {
      id: `ai-exception-check:${randomUUID()}`,
      accountSetId: body.accountSetId,
      dryRun: true,
      approvalRequired: true,
      riskLevel: "medium",
      asOfDate,
      requestedBy,
      findings: await buildAiExceptionFindings(state, body.accountSetId, asOfDate),
      warnings: ["Exception checks are advisory and do not mutate accounting records."]
    };
    appendAuditLog(state, {
      actorId: requestedBy,
      action: "ai.exception_check",
      objectType: "ai_exception_check",
      objectId: result.id
    });
    return jsonResponse(201, result);
  }

  if (request.method === "GET" && segments.length === 3 && segments[0] === "ai" && segments[1] === "voucher-drafts") {
    const suggestion = state.aiVoucherSuggestions.get(segments[2]);
    if (!suggestion) {
      return errorResponse(404, "AI_SUGGESTION_NOT_FOUND", "AI voucher suggestion was not found.");
    }
    return jsonResponse(200, suggestion);
  }

  if (
    request.method === "POST" &&
    segments.length === 4 &&
    segments[0] === "ai" &&
    (segments[1] === "voucher-suggestions" || segments[1] === "voucher-drafts") &&
    segments[3] === "convert-to-voucher"
  ) {
    const suggestion = state.aiVoucherSuggestions.get(segments[2]);
    if (!suggestion) {
      return errorResponse(404, "AI_SUGGESTION_NOT_FOUND", "AI voucher suggestion was not found.");
    }
    if (suggestion.convertedVoucherId) {
      return errorResponse(409, "AI_SUGGESTION_ALREADY_CONVERTED", "AI voucher suggestion has already been converted.");
    }
    if (typeof body.reviewedBy !== "string" || body.reviewedBy.trim() === "") {
      throw new Error("reviewedBy is required.");
    }

    const attachmentIds = [...new Set(Array.isArray(suggestion.attachmentIds) ? suggestion.attachmentIds : [])];
    for (const attachmentId of attachmentIds) {
      const attachment = state.attachments.get(attachmentId);
      if (
        !attachment ||
        attachment.status !== "available" ||
        attachment.accountSetId !== suggestion.draft.accountSetId
      ) {
        return errorResponse(
          409,
          "AI_ATTACHMENT_NOT_AVAILABLE",
          "AI voucher draft attachments must still belong to the account set and be available before conversion."
        );
      }
    }

    const voucher = createVoucher({
      ...suggestion.draft,
      id: uniqueVoucherId(),
      voucherNo: await generateVoucherNo(state, suggestion.draft),
      createdBy: body.reviewedBy,
      sourceType: "ai",
      aiDraftId: suggestion.id,
      attachmentCount: attachmentIds.length
    });
    state.vouchers.set(voucher.id, voucher);
    for (const attachmentId of attachmentIds) {
      const link = {
        id: `attachment-link:${state.attachmentLinks.length + 1}`,
        attachmentId,
        objectType: "voucher",
        objectId: voucher.id,
        linkedBy: body.reviewedBy,
        linkedAt: "now"
      };
      state.attachmentLinks.push(link);
      appendAuditLog(state, {
        actorId: body.reviewedBy,
        action: "attachment.link",
        objectType: "voucher",
        objectId: voucher.id
      });
    }
    suggestion.convertedVoucherId = voucher.id;
    suggestion.reviewedBy = body.reviewedBy;
    state.aiVoucherSuggestions.set(suggestion.id, suggestion);
    appendVoucherStatusLog(state, {
      voucherId: voucher.id,
      action: "create",
      fromStatus: null,
      toStatus: "draft",
      actorId: body.reviewedBy,
      reason: `Converted from ${suggestion.id}`
    });
    appendAuditLog(state, {
      actorId: body.reviewedBy,
      action: "ai.convert_to_voucher",
      objectType: "voucher",
      objectId: voucher.id
    });
    return jsonResponse(201, voucher);
  }

  return errorResponse(404, "NOT_FOUND", `No route for ${request.method} ${request.path}.`);
}

function buildGeneralLedger(journalEntries, balances) {
  const entriesByAccount = new Map();
  for (const entry of journalEntries) {
    const entries = entriesByAccount.get(entry.accountCode) ?? [];
    entries.push(entry);
    entriesByAccount.set(entry.accountCode, entries);
  }

  return {
    rows: balances.map((balance) => ({
      accountCode: balance.accountCode,
      accountName: balance.accountName,
      periodDebit: balance.periodDebit,
      periodCredit: balance.periodCredit,
      entries: entriesByAccount.get(balance.accountCode) ?? []
    }))
  };
}

function matchBankReconciliation(state, reconciliation, { matchedBy = "system" } = {}) {
  const statements = [...state.bankStatements.values()].filter(
    (statement) => statement.accountSetId === reconciliation.accountSetId && statement.status === "unreconciled"
  );
  const usedJournalEntryIds = new Set();
  const matches = [];

  for (const statement of statements) {
    const entry = state.journalEntries.find(
      (candidate) =>
        candidate.accountSetId === reconciliation.accountSetId &&
        candidate.fiscalYear === reconciliation.fiscalYear &&
        candidate.periodNo === reconciliation.periodNo &&
        candidate.accountCode === statement.bankAccountCode &&
        candidate.entryDate === statement.transactionDate &&
        candidate.debit - candidate.credit === statement.amount &&
        !usedJournalEntryIds.has(candidate.id)
    );
    if (!entry) {
      continue;
    }
    usedJournalEntryIds.add(entry.id);
    const reconciledStatement = {
      ...statement,
      status: "reconciled",
      reconciledBy: matchedBy,
      reconciledAt: "now"
    };
    state.bankStatements.set(statement.id, reconciledStatement);
    matches.push({
      bankStatementId: statement.id,
      journalEntryId: entry.id,
      amount: statement.amount,
      matchedBy
    });
  }

  return {
    ...reconciliation,
    status: matches.length > 0 ? "matched" : "unmatched",
    matchedCount: matches.length,
    matches
  };
}

function buildProfitLossCarryForwardVoucher({
  accountSetId,
  fiscalYear,
  periodNo,
  voucherDate,
  profitLossAccountCode,
  createdBy,
  accounts,
  balances
}) {
  if (typeof accountSetId !== "string" || accountSetId.trim() === "") {
    throw new Error("accountSetId is required.");
  }
  if (!Number.isInteger(fiscalYear)) {
    throw new Error("fiscalYear is required.");
  }
  if (!Number.isInteger(periodNo)) {
    throw new Error("periodNo is required.");
  }
  if (typeof profitLossAccountCode !== "string" || profitLossAccountCode.trim() === "") {
    throw new Error("profitLossAccountCode is required.");
  }

  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const profitLossAccount = accountsByCode.get(profitLossAccountCode);
  if (!profitLossAccount) {
    throw new Error(`Profit and loss carry-forward account ${profitLossAccountCode} does not exist.`);
  }

  const lines = [];
  for (const balance of balances) {
    const account = accountsByCode.get(balance.accountCode);
    if (!account || !["revenue", "expense"].includes(account.accountType)) {
      continue;
    }
    const netDebit = Number(balance.periodDebit ?? 0) - Number(balance.periodCredit ?? 0);
    if (netDebit === 0) {
      continue;
    }
    lines.push({
      summary: `Carry forward ${account.name}`,
      accountCode: account.code,
      debit: netDebit < 0 ? Math.abs(netDebit) : 0,
      credit: netDebit > 0 ? netDebit : 0
    });
  }

  if (lines.length === 0) {
    throw new Error("No profit and loss activity exists for the supplied period.");
  }

  const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0);
  const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0);
  const difference = debitTotal - creditTotal;
  lines.push({
    summary: "Carry forward current period profit and loss",
    accountCode: profitLossAccountCode,
    debit: difference < 0 ? Math.abs(difference) : 0,
    credit: difference > 0 ? difference : 0
  });

  return createVoucher({
    id: `voucher:period-close:${accountSetId}:${fiscalYear}:${periodNo}`,
    accountSetId,
    fiscalYear,
    periodNo,
    voucherDate,
    createdBy,
    sourceType: "period_close",
    lines
  });
}

function mergeBalances(existing, additions) {
  const byAccount = new Map(existing.map((balance) => [balance.accountCode, { ...balance }]));

  for (const addition of additions) {
    const current = byAccount.get(addition.accountCode) ?? {
      ...addition,
      periodDebit: 0,
      periodCredit: 0
    };
    current.periodDebit += addition.periodDebit;
    current.periodCredit += addition.periodCredit;
    byAccount.set(addition.accountCode, current);
  }

  return [...byAccount.values()];
}

export function createApi(options = {}) {
  const state =
    options instanceof Map || options.accountSets || options.periods || options.vouchers ? options : createState(options);

  return {
    state,
    async handle(request) {
      const idempotencyError = requireIdempotencyKey(request);
      if (idempotencyError) {
        return idempotencyError;
      }

      const permissionError = await requirePermission(request, state);
      if (permissionError) {
        return permissionError;
      }

      const idempotencyKey = WRITE_METHODS.has(request.method)
        ? request.headers?.["Idempotency-Key"] ?? request.headers?.["idempotency-key"]
        : null;
      const idempotencyAccountSetScope = idempotencyKey ? idempotencyAccountSetScopeFor(request) : null;
      const nowMs = idempotencyKey ? nowMsFor(state) : null;
      if (idempotencyKey && state.idempotency.has(idempotencyKey)) {
        const cached = state.idempotency.get(idempotencyKey);
        if (idempotencyRecordExpired(cached, nowMs)) {
          state.idempotency.delete(idempotencyKey);
        } else {
          const cachedScope = cached?.accountSetScope ?? "global";
          if (cachedScope !== idempotencyAccountSetScope) {
            await recordSecurityEvent(state, {
              accountSetId: idempotencyAccountSetScope === "global" ? null : idempotencyAccountSetScope,
              eventType: "idempotency_scope_mismatch",
              severity: "medium",
              actorId: actorIdFor(request, state),
              source: "api",
              objectType: "idempotency_key",
              objectId: idempotencyKey,
              message: "Idempotency-Key cannot be reused across different account sets.",
              payload: {
                method: request.method,
                path: request.path.split("?")[0],
                cachedScope,
                requestedScope: idempotencyAccountSetScope
              }
            });
            return errorResponse(
              409,
              "IDEMPOTENCY_SCOPE_MISMATCH",
              "Idempotency-Key cannot be reused across different account sets."
            );
          }
          return cached.response ?? cached;
        }
      }

      try {
        const response = await route(request, state);
        if (idempotencyKey && response.status < 500) {
          const ttlMs = idempotencyTtlMsFor(state);
          state.idempotency.set(idempotencyKey, {
            accountSetScope: idempotencyAccountSetScope,
            createdAt: nowMs,
            expiresAt: nowMs + ttlMs,
            response
          });
        }
        return response;
      } catch (error) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
      }
    }
  };
}
