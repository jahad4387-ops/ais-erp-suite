import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

test("local desktop Prisma runtime seeds the system administrator login when missing", async () => {
  const createdUsers = [];
  const api = await createRuntimeApi(
    { AIS_PLATFORM_STORE: "prisma", DATABASE_URL: "file:./desktop-dev.db", AIS_DEPLOYMENT_MODE: "local" },
    {
      prisma: {
        $queryRawUnsafe: async () => [{ journal_mode: "wal" }]
      },
      createPlatformPersistence: () => ({
        ensureSystemAdministratorPermissions: async () => ({
          id: "role:system-admin",
          name: "系统管理员",
          permissionCodes: ["platform.manage"]
        }),
        findUserIdentity: async (username) => {
          const user = createdUsers.find((item) => item.username === username);
          return user
            ? {
                user,
                permissionCodes: ["platform.manage"]
              }
            : null;
        },
        createUser: async (user) => {
          createdUsers.push({
            id: "system",
            username: user.username,
            name: user.name,
            passwordHash: user.passwordHash,
            status: "active",
            roleId: user.roleId
          });
          return createdUsers.at(-1);
        }
      })
    }
  );

  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    body: { username: "system", password: "system" }
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, "system");
  assert.equal(createdUsers.length, 1);
  assert.match(createdUsers[0].passwordHash, /^sha256:/);
});

test("runtime applies bundled SQLite migrations and continues when earlier objects already exist", async () => {
  const migrationsRoot = mkdtempSync(join(tmpdir(), "ais-sqlite-migrations-"));
  try {
    const phase1Dir = join(migrationsRoot, "20260607120000_phase1_init");
    const phase2Dir = join(migrationsRoot, "20260610090000_phase2_partner_master_data");
    mkdirSync(phase1Dir, { recursive: true });
    mkdirSync(phase2Dir, { recursive: true });
    writeFileSync(join(phase1Dir, "migration.sql"), 'CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);\n', "utf8");
    writeFileSync(join(phase2Dir, "migration.sql"), 'CREATE TABLE "Partner" ("id" TEXT NOT NULL PRIMARY KEY);\n', "utf8");

    const executed = [];
    const prisma = {
      $queryRawUnsafe: async () => [{ journal_mode: "wal" }],
      $executeRawUnsafe: async (sql) => {
        executed.push(sql);
        if (sql.includes('"User"')) {
          throw new Error('table "User" already exists');
        }
        return 0;
      }
    };

    await createRuntimeApi(
      { AIS_PLATFORM_STORE: "prisma", DATABASE_URL: "file:./desktop-dev.db" },
      {
        prisma,
        sqliteMigrationsRoot: migrationsRoot,
        createPlatformPersistence: () => ({
          ensureSystemAdministratorPermissions: async () => {}
        })
      }
    );

    assert.deepEqual(executed, [
      'CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY)',
      'CREATE TABLE "Partner" ("id" TEXT NOT NULL PRIMARY KEY)'
    ]);
  } finally {
    rmSync(migrationsRoot, { recursive: true, force: true });
  }
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

test("deployment config endpoint reports Phase 6 OCR and LLM draft adapter status", async () => {
  const api = await createRuntimeApi(
    {
      DATABASE_URL: "file:./dev.db",
      AIS_PLATFORM_STORE: "memory",
      AIS_ATTACHMENT_STORAGE_ROOT: "./data/attachments",
      AIS_OCR_PROVIDER: "configured-local-ocr",
      AIS_OCR_MODEL: "ppocr-v4",
      AIS_LLM_DRAFT_PROVIDER: "openai-compatible",
      AIS_LLM_DRAFT_MODEL: "gpt-4.1-mini",
      AIS_LLM_DRAFT_TIMEOUT_MS: "15000",
      AIS_LLM_DRAFT_MAX_TOKENS: "2048",
      AIS_LLM_DRAFT_BASE_URL: "https://llm.internal/v1",
      AIS_LLM_DRAFT_API_KEY_REF: "secret://ais/llm",
      AIS_LLM_DRAFT_REDACTION: "enabled",
      AIS_IDEMPOTENCY_TTL_HOURS: "48"
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
  assert.equal(response.body.ai.ocr.provider, "configured-local-ocr");
  assert.equal(response.body.ai.ocr.model, "ppocr-v4");
  assert.equal(response.body.ai.ocr.configured, true);
  assert.equal(response.body.ai.ocr.commandPresent, false);
  assert.equal(response.body.ai.llmDraft.provider, "openai-compatible");
  assert.equal(response.body.ai.llmDraft.model, "gpt-4.1-mini");
  assert.equal(response.body.ai.llmDraft.configured, true);
  assert.equal(response.body.ai.llmDraft.timeoutMs, 15000);
  assert.equal(response.body.ai.llmDraft.maxTokens, 2048);
  assert.equal(response.body.ai.llmDraft.baseUrlPresent, true);
  assert.equal(response.body.ai.llmDraft.apiKeyRefPresent, true);
  assert.equal(response.body.ai.llmDraft.redaction, "enabled");
  assert.equal(response.body.idempotency.ttlHours, 48);
  assert.equal(response.body.idempotency.ttlMs, 48 * 60 * 60 * 1000);
});

test("deployment config endpoint reports restore-drill silent sandbox status", async () => {
  const api = await createRuntimeApi(
    {
      DATABASE_URL: "file:./restore-drill.db",
      AIS_PLATFORM_STORE: "memory",
      AIS_ATTACHMENT_STORAGE_ROOT: "./data/attachments",
      RESTORE_DRILL: "true"
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
  assert.equal(response.body.restoreDrill.enabled, true);
  assert.equal(response.body.restoreDrill.silentSandbox, true);
  assert.equal(response.body.restoreDrill.outboundBlocked, true);
  assert.deepEqual(response.body.restoreDrill.blockedChannels, ["webhook", "email", "bank_api"]);
  assert.equal(response.body.restoreDrill.envVar, "RESTORE_DRILL");
});

test("runtime local OCR command adapter extracts uploaded image text before draft generation", async () => {
  const attachmentRoot = mkdtempSync(join(tmpdir(), "ais-ocr-command-"));
  const execCalls = [];
  try {
    const api = await createRuntimeApi(
      {
        AIS_PLATFORM_STORE: "memory",
        AIS_ATTACHMENT_STORAGE_ROOT: attachmentRoot,
        AIS_OCR_PROVIDER: "local-command-ocr",
        AIS_OCR_MODEL: "fake-local-ocr-v1",
        AIS_OCR_COMMAND: "fake-ocr",
        AIS_OCR_COMMAND_ARGS: '["--input","{input}","--filename","{filename}","--type","{contentType}"]'
      },
      {
        execFile: async (command, args) => {
          execCalls.push({ command, args, inputBytes: readFileSync(args[1]) });
          return { stdout: "OCR command: C material 4 units price 6", stderr: "" };
        }
      }
    );
    const accountSet = await api.handle({
      method: "POST",
      path: "/account-sets",
      headers: { "Idempotency-Key": "phase6-local-ocr-command-account" },
      body: {
        code: "P6OCRCMD",
        name: "Phase 6 OCR Command",
        companyName: "Phase 6 OCR Command Co.",
        baseCurrency: "CNY",
        accountingStandard: "Small Business Accounting Standards",
        startYear: 2026,
        startPeriod: 1
      }
    });
    const imageContent = Buffer.from("fake png bytes");
    const attachment = await api.handle({
      method: "POST",
      path: "/attachments/upload",
      headers: { "Idempotency-Key": "phase6-local-ocr-command-upload" },
      body: {
        accountSetId: accountSet.body.id,
        filename: "quote.png",
        contentType: "image/png",
        byteSize: imageContent.length,
        contentBase64: imageContent.toString("base64"),
        uploadedBy: "agent-user"
      }
    });

    const candidate = await api.handle({
      method: "POST",
      path: "/agent/draft-candidates",
      headers: { "Idempotency-Key": "phase6-local-ocr-command-candidate" },
      body: {
        accountSetId: accountSet.body.id,
        draftType: "purchase_order",
        userInstruction: "Generate a purchase order draft from the uploaded quote.",
        attachmentIds: [attachment.body.id],
        evidenceRefs: ["quote:local-command"],
        dryRun: true
      }
    });

    assert.equal(candidate.status, 201);
    assert.equal(execCalls.length, 1);
    assert.equal(execCalls[0].command, "fake-ocr");
    assert.deepEqual(execCalls[0].inputBytes, imageContent);
    assert.equal(candidate.body.ocrResults[0].provider, "local-command-ocr");
    assert.equal(candidate.body.ocrResults[0].model, "fake-local-ocr-v1");
    assert.equal(candidate.body.ocrResults[0].status, "completed");
    assert.match(candidate.body.ocrResults[0].extractedText, /C material 4 units price 6/);
    assert.match(candidate.body.llmDraftRun.inputSummary.ocrText, /C material 4 units price 6/);
    assert.equal(candidate.body.draftPayload.lines[0].quantity, 4);
    assert.equal(candidate.body.draftPayload.lines[0].unitPrice, 6);
    const config = await api.handle({ method: "GET", path: "/deployment/config", headers: {}, body: null });
    assert.equal(config.body.ai.ocr.commandPresent, true);
  } finally {
    rmSync(attachmentRoot, { recursive: true, force: true });
  }
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

test("production-like runtime requires complete Phase 6 AI adapter configuration", async () => {
  const productionBase = {
    AIS_DEPLOYMENT_MODE: "private-cloud",
    AIS_PLATFORM_STORE: "memory",
    AIS_JWT_SECRET: "phase-6-managed-secret",
    AIS_ATTACHMENT_STORAGE_PROVIDER: "external",
    ...externalAttachmentStorageEnv
  };

  await assert.rejects(
    () =>
      createRuntimeApi(
        {
          ...productionBase,
          AIS_OCR_PROVIDER: "configured-local-ocr"
        },
        {}
      ),
    /AIS_OCR_MODEL is required/
  );

  await assert.rejects(
    () =>
      createRuntimeApi(
        {
          ...productionBase,
          AIS_LLM_DRAFT_PROVIDER: "openai-compatible",
          AIS_LLM_DRAFT_MODEL: "gpt-4.1-mini"
        },
        {}
      ),
    /AIS_LLM_DRAFT_BASE_URL and AIS_LLM_DRAFT_API_KEY_REF are required/
  );

  const api = await createRuntimeApi(
    {
      ...productionBase,
      AIS_OCR_PROVIDER: "configured-local-ocr",
      AIS_OCR_MODEL: "ppocr-v4",
      AIS_LLM_DRAFT_PROVIDER: "openai-compatible",
      AIS_LLM_DRAFT_MODEL: "gpt-4.1-mini",
      AIS_LLM_DRAFT_BASE_URL: "https://llm.internal/v1",
      AIS_LLM_DRAFT_API_KEY_REF: "secret://ais/llm",
      AIS_LLM_DRAFT_TIMEOUT_MS: "12000",
      AIS_LLM_DRAFT_MAX_TOKENS: "2048",
      AIS_LLM_DRAFT_REDACTION: "enabled"
    },
    {}
  );
  const response = await api.handle({ method: "GET", path: "/deployment/config", headers: {}, body: null });

  assert.equal(response.status, 200);
  assert.equal(response.body.ai.ocr.configured, true);
  assert.equal(response.body.ai.llmDraft.configured, true);
});

test("openai-compatible LLM draft adapter calls the configured gateway with redacted input", async () => {
  const calls = [];
  const api = await createRuntimeApi(
    {
      AIS_PLATFORM_STORE: "memory",
      AIS_ATTACHMENT_STORAGE_ROOT: "./data/attachments",
      AIS_LLM_DRAFT_PROVIDER: "openai-compatible",
      AIS_LLM_DRAFT_MODEL: "gpt-4.1-mini",
      AIS_LLM_DRAFT_BASE_URL: "https://llm.internal/v1",
      AIS_LLM_DRAFT_API_KEY_REF: "env:AIS_LLM_DRAFT_TOKEN",
      AIS_LLM_DRAFT_TOKEN: "test-llm-token",
      AIS_LLM_DRAFT_TIMEOUT_MS: "5000",
      AIS_LLM_DRAFT_MAX_TOKENS: "1024",
      AIS_LLM_DRAFT_REDACTION: "enabled"
    },
    {
      fetch: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    draftPayload: {
                      documentType: "purchase_order",
                      businessDate: "2026-06-12",
                      counterpartyId: null,
                      lines: [{ itemId: null, itemName: "adapter item", quantity: 6, unitPrice: 15, amount: 90 }]
                    },
                    unmatchedItems: [{ field: "supplierId", reason: "Supplier must be selected before saving." }]
                  })
                }
              }
            ]
          })
        };
      }
    }
  );
  const accountSet = await api.handle({
    method: "POST",
    path: "/account-sets",
    headers: { "Idempotency-Key": "phase6-openai-account" },
    body: {
      code: "P6OA",
      name: "Phase 6 OpenAI Adapter",
      companyName: "Phase 6 OpenAI Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    }
  });

  const candidate = await api.handle({
    method: "POST",
    path: "/agent/draft-candidates",
    headers: { "Idempotency-Key": "phase6-openai-candidate" },
    body: {
      accountSetId: accountSet.body.id,
      draftType: "purchase_order",
      userInstruction: "Generate a purchase order for phone 13812345678 and bank 6222020202020202020.",
      evidenceRefs: ["quote:openai-compatible"],
      dryRun: true
    }
  });

  assert.equal(candidate.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://llm.internal/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-llm-token");
  assert.equal(calls[0].body.model, "gpt-4.1-mini");
  assert.equal(calls[0].body.max_tokens, 1024);
  assert.match(JSON.stringify(calls[0].body.messages), /138\*\*\*\*5678/);
  assert.doesNotMatch(JSON.stringify(calls[0].body.messages), /13812345678/);
  assert.equal(candidate.body.llmDraftRun.provider, "openai-compatible");
  assert.equal(candidate.body.llmDraftRun.model, "gpt-4.1-mini");
  assert.equal(candidate.body.draftPayload.lines[0].quantity, 6);
  assert.equal(candidate.body.draftPayload.lines[0].unitPrice, 15);
  assert.equal(api.state.llmDraftRuns.get(candidate.body.llmDraftRun.id).status, "completed");
});

test("openai-compatible LLM draft run records provider failures without creating business drafts", async () => {
  const api = await createRuntimeApi(
    {
      AIS_PLATFORM_STORE: "memory",
      AIS_ATTACHMENT_STORAGE_ROOT: "./data/attachments",
      AIS_LLM_DRAFT_PROVIDER: "openai-compatible",
      AIS_LLM_DRAFT_MODEL: "gpt-4.1-mini",
      AIS_LLM_DRAFT_BASE_URL: "https://llm.internal/v1",
      AIS_LLM_DRAFT_API_KEY_REF: "env:AIS_LLM_DRAFT_TOKEN",
      AIS_LLM_DRAFT_TOKEN: "test-llm-token"
    },
    {
      fetch: async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "provider unavailable" } })
      })
    }
  );

  const run = await api.handle({
    method: "POST",
    path: "/ai/llm-draft-runs",
    headers: { "Idempotency-Key": "phase6-openai-failed-run" },
    body: {
      accountSetId: "account-set:llm-failure",
      draftType: "voucher",
      userInstruction: "Generate a voucher draft.",
      evidenceRefs: ["receipt:failed-provider"],
      dryRun: true
    }
  });

  assert.equal(run.status, 201);
  assert.equal(run.body.provider, "openai-compatible");
  assert.equal(run.body.status, "failed");
  assert.match(run.body.errorMessage, /HTTP 503/);
  assert.equal(api.state.llmDraftRuns.get(run.body.id).status, "failed");
  assert.equal(api.state.agentDraftCandidates.size, 0);
});

test("openai-compatible LLM draft adapter rejects schema-invalid model output before candidate creation", async () => {
  const api = await createRuntimeApi(
    {
      AIS_PLATFORM_STORE: "memory",
      AIS_ATTACHMENT_STORAGE_ROOT: "./data/attachments",
      AIS_LLM_DRAFT_PROVIDER: "openai-compatible",
      AIS_LLM_DRAFT_MODEL: "gpt-4.1-mini",
      AIS_LLM_DRAFT_BASE_URL: "https://llm.internal/v1",
      AIS_LLM_DRAFT_API_KEY_REF: "env:AIS_LLM_DRAFT_TOKEN",
      AIS_LLM_DRAFT_TOKEN: "test-llm-token"
    },
    {
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  draftPayload: {
                    documentType: "purchase_order"
                  },
                  unmatchedItems: []
                })
              }
            }
          ]
        })
      })
    }
  );
  const accountSet = await api.handle({
    method: "POST",
    path: "/account-sets",
    headers: { "Idempotency-Key": "phase6-openai-invalid-schema-account" },
    body: {
      code: "P6BADLLM",
      name: "Phase 6 Bad LLM Output",
      companyName: "Phase 6 Bad LLM Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    }
  });

  const candidate = await api.handle({
    method: "POST",
    path: "/agent/draft-candidates",
    headers: { "Idempotency-Key": "phase6-openai-invalid-schema-candidate" },
    body: {
      accountSetId: accountSet.body.id,
      draftType: "purchase_order",
      userInstruction: "Generate a purchase order draft.",
      evidenceRefs: ["quote:invalid-schema"],
      dryRun: true
    }
  });

  const failedRuns = [...api.state.llmDraftRuns.values()].filter((run) => run.status === "failed");

  assert.equal(candidate.status, 400);
  assert.equal(candidate.body.code, "BUSINESS_RULE_FAILED");
  assert.match(candidate.body.message, /draftPayload\.lines is required/);
  assert.equal(api.state.agentDraftCandidates.size, 0);
  assert.equal(failedRuns.length, 1);
  assert.equal(failedRuns[0].provider, "openai-compatible");
  assert.match(failedRuns[0].errorMessage, /draftPayload\.lines is required/);
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

test("desktop packaging prepares Prisma client from the current database schema", () => {
  const script = readFileSync(new URL("../../../scripts/prepare-electron-prisma.mjs", import.meta.url), "utf8");

  assert.match(script, /prisma generate/);
  assert.match(script, /packages["']?, ["']database["']?, ["']prisma["']?, ["']schema\.prisma/);
});
