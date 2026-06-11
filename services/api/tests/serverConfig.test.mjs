import { test } from "node:test";
import assert from "node:assert/strict";
import { createRuntimeApi } from "../src/server.mjs";

const externalAttachmentStorageEnv = {
  AIS_ATTACHMENT_EXTERNAL_ENDPOINT: "https://objects.internal",
  AIS_ATTACHMENT_EXTERNAL_BUCKET: "ais-phase-1",
  AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF: "secret://ais/attachments",
  AIS_ATTACHMENT_RETENTION_DAYS: "2555"
};

const jwtRotationEnv = {
  AIS_JWT_ROTATION_APPROVED_BY: "security-lead",
  AIS_JWT_ROTATION_EXPIRES_AT: "2099-01-01T00:00:00.000Z",
  AIS_JWT_ROTATION_MONITOR_REF: "monitor://jwt-rotation",
  AIS_JWT_ROTATION_ROLLBACK_REF: "runbook://jwt-rollback"
};

test("runtime API can enable Prisma platform persistence from environment", async () => {
  const calls = [];
  const syncedPermissionCodes = [];
  const prisma = {
    marker: "prisma-client",
    $queryRawUnsafe: async (sql) => {
      calls.push(sql);
      return [{ journal_mode: "wal" }];
    }
  };
  const api = await createRuntimeApi(
    { AIS_PLATFORM_STORE: "prisma", DATABASE_URL: "file:./dev.db" },
    {
      prisma,
      createPlatformPersistence: (client) => ({
        kind: "platform-store",
        client,
        ensureSystemAdministratorPermissions: async (permissionCodes) => {
          syncedPermissionCodes.push(...permissionCodes);
        }
      })
    }
  );

  assert.equal(api.state.config.platformStore.kind, "platform-store");
  assert.equal(api.state.config.platformStore.client, prisma);
  assert.deepEqual(calls, ["PRAGMA journal_mode=WAL"]);
  assert.ok(syncedPermissionCodes.includes("partner.manage"));
  assert.ok(syncedPermissionCodes.includes("inventory_item.manage"));
  assert.ok(syncedPermissionCodes.includes("payroll_setup.manage"));
  assert.ok(syncedPermissionCodes.includes("fixed_asset_setup.manage"));
  assert.ok(syncedPermissionCodes.includes("report_approval.manage"));
});

test("deployment config endpoint reports database and attachment storage status", async () => {
  const api = await createRuntimeApi(
    {
      DATABASE_URL: "file:./dev.db",
      AIS_PLATFORM_STORE: "memory",
      AIS_ATTACHMENT_STORAGE_ROOT: "./data/attachments",
      AIS_DEPLOYMENT_MODE: "lan"
    },
    {}
  );

  const response = await api.handle({
    method: "GET",
    path: "/deployment/config",
    headers: {},
    body: null
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.deploymentMode, "lan");
  assert.equal(response.body.database.provider, "sqlite");
  assert.equal(response.body.database.configured, true);
  assert.equal(response.body.attachmentStorage.provider, "local");
  assert.equal(response.body.attachmentStorage.configured, true);
});

test("production-like runtime requires an explicit managed JWT secret", async () => {
  await assert.rejects(
    () =>
      createRuntimeApi(
        {
          DEPLOYMENT_MODE: "private-cloud",
          AIS_PLATFORM_STORE: "memory"
        },
        {}
      ),
    /AIS_JWT_SECRET is required/
  );

  const api = await createRuntimeApi(
    {
      DEPLOYMENT_MODE: "private-cloud",
      AIS_PLATFORM_STORE: "memory",
      AIS_JWT_SECRET: "phase-1-managed-secret",
      AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
      ...externalAttachmentStorageEnv
    },
    {}
  );

  const response = await api.handle({
    method: "GET",
    path: "/deployment/config",
    headers: {},
    body: null
  });

  assert.equal(response.body.deploymentMode, "private-cloud");
  assert.equal(api.state.config.tokenSecret, "phase-1-managed-secret");
});

test("production-like runtime requires explicit attachment storage configuration", async () => {
  await assert.rejects(
    () =>
      createRuntimeApi(
        {
          AIS_DEPLOYMENT_MODE: "private-cloud",
          AIS_PLATFORM_STORE: "memory",
          AIS_JWT_SECRET: "phase-1-managed-secret"
        },
        {}
      ),
    /AIS_ATTACHMENT_STORAGE_ROOT or AIS_ATTACHMENT_STORAGE_PROVIDER=external is required/
  );

  await assert.rejects(
    () =>
      createRuntimeApi(
        {
          AIS_DEPLOYMENT_MODE: "private-cloud",
          AIS_PLATFORM_STORE: "memory",
          AIS_JWT_SECRET: "phase-1-managed-secret",
          AIS_ATTACHMENT_STORAGE_PROVIDER: "external"
        },
        {}
      ),
    /AIS_ATTACHMENT_EXTERNAL_ENDPOINT, AIS_ATTACHMENT_EXTERNAL_BUCKET, AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF, and AIS_ATTACHMENT_RETENTION_DAYS are required/
  );

  const api = await createRuntimeApi(
    {
      AIS_DEPLOYMENT_MODE: "private-cloud",
      AIS_PLATFORM_STORE: "memory",
      AIS_JWT_SECRET: "phase-1-managed-secret",
      AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
      ...externalAttachmentStorageEnv
    },
    {}
  );

  const response = await api.handle({
    method: "GET",
    path: "/deployment/config",
    headers: {},
    body: null
  });

  assert.equal(response.body.attachmentStorage.provider, "external");
  assert.equal(response.body.attachmentStorage.configured, true);
  assert.equal(response.body.attachmentStorage.rootPresent, false);
  assert.equal(response.body.attachmentStorage.external.endpointPresent, true);
  assert.equal(response.body.attachmentStorage.external.bucketPresent, true);
  assert.equal(response.body.attachmentStorage.external.credentialRefPresent, true);
  assert.equal(response.body.attachmentStorage.external.retentionDays, 2555);
});

test("runtime accepts previous JWT secrets during rotation while signing new tokens with the current secret", async () => {
  const oldApi = await createRuntimeApi({ AIS_JWT_SECRET: "old-secret" }, {});
  const oldLogin = await oldApi.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "viewer",
      password: "viewer"
    }
  });

  const rotatedApi = await createRuntimeApi(
    {
      AIS_JWT_SECRET: "current-secret",
      AIS_JWT_PREVIOUS_SECRETS: "old-secret"
    },
    {}
  );
  rotatedApi.state.permissionsByActor.set("system", new Set());
  const oldTokenAccess = await rotatedApi.handle({
    method: "GET",
    path: "/account-sets",
    headers: {
      Authorization: `Bearer ${oldLogin.body.accessToken}`
    },
    body: null
  });
  const currentLogin = await rotatedApi.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "viewer",
      password: "viewer"
    }
  });
  oldApi.state.permissionsByActor.set("system", new Set());
  const currentTokenAgainstOldSecret = await oldApi.handle({
    method: "GET",
    path: "/account-sets",
    headers: {
      Authorization: `Bearer ${currentLogin.body.accessToken}`
    },
    body: null
  });

  assert.equal(oldLogin.status, 200);
  assert.equal(oldTokenAccess.status, 200);
  assert.equal(currentLogin.status, 200);
  assert.equal(currentTokenAgainstOldSecret.status, 403);
});

test("production-like JWT previous-secret rotation requires approval, monitoring, expiry, and rollback metadata", async () => {
  await assert.rejects(
    () =>
      createRuntimeApi(
        {
          AIS_DEPLOYMENT_MODE: "private-cloud",
          AIS_PLATFORM_STORE: "memory",
          AIS_JWT_SECRET: "current-secret",
          AIS_JWT_PREVIOUS_SECRETS: "old-secret",
          AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
          ...externalAttachmentStorageEnv
        },
        {}
      ),
    /AIS_JWT_ROTATION_APPROVED_BY, AIS_JWT_ROTATION_EXPIRES_AT, AIS_JWT_ROTATION_MONITOR_REF, and AIS_JWT_ROTATION_ROLLBACK_REF are required/
  );

  await assert.rejects(
    () =>
      createRuntimeApi(
        {
          AIS_DEPLOYMENT_MODE: "private-cloud",
          AIS_PLATFORM_STORE: "memory",
          AIS_JWT_SECRET: "current-secret",
          AIS_JWT_PREVIOUS_SECRETS: "old-secret",
          AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
          ...externalAttachmentStorageEnv,
          ...jwtRotationEnv,
          AIS_JWT_ROTATION_EXPIRES_AT: "2000-01-01T00:00:00.000Z"
        },
        {}
      ),
    /AIS_JWT_ROTATION_EXPIRES_AT must be a future ISO timestamp/
  );

  const api = await createRuntimeApi(
    {
      AIS_DEPLOYMENT_MODE: "private-cloud",
      AIS_PLATFORM_STORE: "memory",
      AIS_JWT_SECRET: "current-secret",
      AIS_JWT_PREVIOUS_SECRETS: "old-secret",
      AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
      ...externalAttachmentStorageEnv,
      ...jwtRotationEnv
    },
    {}
  );

  const response = await api.handle({
    method: "GET",
    path: "/deployment/config",
    headers: {},
    body: null
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.jwt.previousSecretsPresent, true);
  assert.equal(response.body.jwt.rotation.approvedByPresent, true);
  assert.equal(response.body.jwt.rotation.expiresAt, jwtRotationEnv.AIS_JWT_ROTATION_EXPIRES_AT);
  assert.equal(response.body.jwt.rotation.monitorRefPresent, true);
  assert.equal(response.body.jwt.rotation.rollbackRefPresent, true);
});

test("runtime external attachment storage verifies objects through configured storage service", async () => {
  const calls = [];
  const responses = [
    { ok: false, headers: { get: () => null } },
    {
      ok: true,
      headers: {
        get(name) {
          return (
            {
              "content-length": "21",
              "x-ais-sha256-checksum": "sha256:external-object"
            }[name.toLowerCase()] ?? null
          );
        }
      }
    }
  ];
  const api = await createRuntimeApi(
    {
      AIS_DEPLOYMENT_MODE: "private-cloud",
      AIS_PLATFORM_STORE: "memory",
      AIS_JWT_SECRET: "phase-1-managed-secret",
      AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
      ...externalAttachmentStorageEnv,
      AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF: "env:AIS_ATTACHMENT_EXTERNAL_TOKEN",
      AIS_ATTACHMENT_EXTERNAL_TOKEN: "object-store-token"
    },
    {
      fetch: async (url, options) => {
        calls.push({ url: String(url), method: options?.method, authorization: options?.headers?.Authorization });
        return responses.shift();
      }
    }
  );

  const missingObject = await api.handle({
    method: "POST",
    path: "/attachments/upload",
    headers: { "Idempotency-Key": "runtime-external-missing-object" },
    body: {
      filename: "external-missing.txt",
      contentType: "text/plain",
      byteSize: 21,
      checksum: "sha256:external-object",
      storageProvider: "external",
      storageKey: "invoices/2026/external-missing.txt",
      uploadedBy: "zhang-san"
    }
  });
  const verifiedObject = await api.handle({
    method: "POST",
    path: "/attachments/upload",
    headers: { "Idempotency-Key": "runtime-external-verified-object" },
    body: {
      filename: "external-verified.txt",
      contentType: "text/plain",
      byteSize: 21,
      checksum: "sha256:external-object",
      storageProvider: "external",
      storageKey: "invoices/2026/external-verified.txt",
      uploadedBy: "zhang-san"
    }
  });

  assert.equal(missingObject.status, 409);
  assert.equal(missingObject.body.code, "ATTACHMENT_EXTERNAL_OBJECT_NOT_FOUND");
  assert.equal(verifiedObject.status, 201);
  assert.deepEqual(calls, [
    {
      url: "https://objects.internal/ais-phase-1/invoices/2026/external-missing.txt",
      method: "HEAD",
      authorization: "Bearer object-store-token"
    },
    {
      url: "https://objects.internal/ais-phase-1/invoices/2026/external-verified.txt",
      method: "HEAD",
      authorization: "Bearer object-store-token"
    }
  ]);
});

test("runtime external attachment storage supports custom header credential refs", async () => {
  const calls = [];
  const api = await createRuntimeApi(
    {
      AIS_DEPLOYMENT_MODE: "private-cloud",
      AIS_PLATFORM_STORE: "memory",
      AIS_JWT_SECRET: "phase-1-managed-secret",
      AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
      ...externalAttachmentStorageEnv,
      AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF: "header:x-api-key=env:AIS_ATTACHMENT_EXTERNAL_API_KEY",
      AIS_ATTACHMENT_EXTERNAL_API_KEY: "object-store-api-key"
    },
    {
      fetch: async (url, options) => {
        calls.push({ url: String(url), method: options?.method, apiKey: options?.headers?.["x-api-key"] });
        return {
          ok: true,
          headers: {
            get(name) {
              return (
                {
                  "content-length": "21",
                  "x-ais-sha256-checksum": "sha256:external-object"
                }[name.toLowerCase()] ?? null
              );
            }
          }
        };
      }
    }
  );

  const verifiedObject = await api.handle({
    method: "POST",
    path: "/attachments/upload",
    headers: { "Idempotency-Key": "runtime-external-custom-header" },
    body: {
      filename: "external-api-key.txt",
      contentType: "text/plain",
      byteSize: 21,
      checksum: "sha256:external-object",
      storageProvider: "external",
      storageKey: "invoices/2026/external-api-key.txt",
      uploadedBy: "zhang-san"
    }
  });

  assert.equal(verifiedObject.status, 201);
  assert.deepEqual(calls, [
    {
      url: "https://objects.internal/ais-phase-1/invoices/2026/external-api-key.txt",
      method: "HEAD",
      apiKey: "object-store-api-key"
    }
  ]);
});
