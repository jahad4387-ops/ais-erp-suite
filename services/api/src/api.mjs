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

function uniqueVoucherId() {
  return `voucher:${randomUUID()}`;
}

function uniqueVoucherStatusLogId() {
  return `voucher-status-log:${randomUUID()}`;
}
const DEFAULT_TOKEN_SECRET = "phase-1-local-secret";
const DEFAULT_ATTACHMENT_STORAGE_ROOT = fileURLToPath(new URL("../.attachment-storage", import.meta.url));
const DEFAULT_PERMISSION_CODES = [
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
  "sales_order.manage"
];
const DEFAULT_ACTOR_PERMISSIONS = new Map([
  [
    "viewer",
    new Set(["account_set.view", "period.view", "account.view", "voucher.view", "ledger.view", "audit_log.view"])
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
    permissionCodes: [
      "account_set.create",
      "account_set.manage",
      "account_set.view",
      "account_set_user.manage",
      "audit_log.view",
      "user.manage",
      "role.manage"
    ]
  },
  {
    id: "role:viewer",
    name: "查询用户",
    permissionCodes: ["account_set.view", "period.view", "account.view", "voucher.view", "ledger.view", "report.view"]
  }
];

function jsonResponse(status, body) {
  return { status, body };
}

function errorResponse(status, code, message) {
  return jsonResponse(status, {
    code,
    message,
    traceId: "local-api"
  });
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

function createPasswordHash(username, password) {
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
  if (segments[0] === "partners") {
    return "partner.manage";
  }
  if (segments[0] === "purchase-orders") {
    return "purchase_order.manage";
  }
  if (segments[0] === "sales-orders") {
    return "sales_order.manage";
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

function requirePermission(request, state) {
  const permission = permissionFor(request);
  if (!permission) {
    return null;
  }

  const actorId = actorIdFor(request, state);
  const permissions = state.permissionsByActor.get(actorId) ?? new Set();
  if (permissions.has("*") || permissions.has(permission)) {
    return null;
  }

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
      platformStore: options.platformStore,
      deploymentMode: options.deploymentMode,
      databaseUrl: options.databaseUrl,
      platformStoreMode: options.platformStoreMode
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
    auditLogs: [],
    aiVoucherSuggestions: new Map(),
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

async function canAccessAccountSet(state, actorId, accountSetId) {
  const permissions = state.permissionsByActor.get(actorId) ?? new Set();
  if (permissions.has("*")) {
    return true;
  }
  if (state.accountSetAccessByActor.get(actorId)?.has(accountSetId)) {
    return true;
  }
  return state.config.platformStore?.canAccessAccountSet
    ? state.config.platformStore.canAccessAccountSet(actorId, accountSetId)
    : false;
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
    const permissions = state.permissionsByActor.get(actorId) ?? new Set();
    if (platformStore?.listAccessibleAccountSets) {
      if (permissions.has("*") && platformStore.listAccountSets) {
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
      const duplicate = (await listPartners(state, body.accountSetId)).find((partner) => partner.code === validated.code);
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
      const order = {
        id: body.id ?? `purchase-order:${randomUUID()}`,
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
        lines
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
      const order = {
        id: body.id ?? `sales-order:${randomUUID()}`,
        accountSetId: body.accountSetId,
        customerId: customer.id,
        customerName: customer.name,
        orderNo: body.orderNo ?? nextBusinessOrderNo("SO", body.accountSetId, body.orderDate, existingOrders),
        orderDate: body.orderDate,
        totalAmount: Number(lines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2)),
        status: "draft",
        currency: body.currency ?? "CNY",
        exchangeRate: body.exchangeRate ?? 1,
        createdBy: body.createdBy ?? actorId,
        lines
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
    const account = findAccountByIdentifier(state, segments[1]);
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

      const permissionError = requirePermission(request, state);
      if (permissionError) {
        return permissionError;
      }

      const idempotencyKey = request.headers?.["Idempotency-Key"] ?? request.headers?.["idempotency-key"];
      if (idempotencyKey && state.idempotency.has(idempotencyKey)) {
        return state.idempotency.get(idempotencyKey);
      }

      try {
        const response = await route(request, state);
        if (idempotencyKey && response.status < 500) {
          state.idempotency.set(idempotencyKey, response);
        }
        return response;
      } catch (error) {
        return errorResponse(400, "BUSINESS_RULE_FAILED", error.message);
      }
    }
  };
}
