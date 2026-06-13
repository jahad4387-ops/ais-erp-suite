import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApi } from "../src/api.mjs";

async function request(api, method, path, body, idempotencyKey = "test-key-0001") {
  return api.handle({
    method,
    path,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body
  });
}

function resolveAgentUnmatchedItems(candidate, resolvedValue = "reviewed_in_draft_payload") {
  return (candidate.body?.unmatchedItems ?? candidate.unmatchedItems ?? []).map((item) => ({
    field: item.field,
    resolution: "selected_by_reviewer",
    resolvedValue
  }));
}

test("write endpoints reject missing idempotency key", async () => {
  const api = createApi();

  const response = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "001",
      name: "Demo Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    null
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "IDEMPOTENCY_KEY_REQUIRED");
});

test("write idempotency keys are bound to the target account set", async () => {
  const api = createApi();
  const firstAccountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "IDEMP-A",
      name: "Idempotency Account A",
      companyName: "Idempotency A Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "idempotency-scope-account-a"
  );
  const secondAccountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "IDEMP-B",
      name: "Idempotency Account B",
      companyName: "Idempotency B Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "idempotency-scope-account-b"
  );

  const firstAction = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: firstAccountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: [],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "agent-user"
    },
    "same-agent-idempotency-key"
  );
  const secondAction = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: secondAccountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: [],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "agent-user"
    },
    "same-agent-idempotency-key"
  );

  assert.equal(firstAction.status, 201);
  assert.equal(secondAction.status, 409);
  assert.equal(secondAction.body.code, "IDEMPOTENCY_SCOPE_MISMATCH");
  assert.equal(api.state.agentActions.size, 1);
});

test("Phase 6 security events persist permission and idempotency anomalies through platform store restarts", async () => {
  const accountSets = new Map();
  const securityEvents = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, structuredClone(accountSet));
      return structuredClone(accountSet);
    },
    findAccountSet: async (identifier) =>
      structuredClone([...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null),
    listAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    listAccessibleAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createSecurityEvent: async (event) => {
      securityEvents.set(event.id, structuredClone(event));
      return structuredClone(securityEvents.get(event.id));
    },
    listSecurityEvents: async (accountSetId = null, filters = {}) =>
      [...securityEvents.values()]
        .filter((event) => !accountSetId || event.accountSetId === accountSetId)
        .filter((event) => !filters.eventType || event.eventType === filters.eventType)
        .filter((event) => !filters.severity || event.severity === filters.severity)
        .filter((event) => !filters.actorId || event.actorId === filters.actorId)
        .sort(byCreatedDesc)
        .map((event) => structuredClone(event))
  };
  const firstApi = createApi({ platformStore });
  const firstAccountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6SEC1",
      name: "Phase 6 Security One",
      companyName: "Phase 6 Security One Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-security-account-one"
  );
  const secondAccountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6SEC2",
      name: "Phase 6 Security Two",
      companyName: "Phase 6 Security Two Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-security-account-two"
  );
  const denied = await firstApi.handle({
    method: "POST",
    path: "/agent-actions",
    headers: {
      "Actor-Id": "viewer",
      "Idempotency-Key": "phase6-security-denied-agent-action"
    },
    body: {
      accountSetId: firstAccountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: [],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "viewer"
    }
  });
  const firstAction = await request(
    firstApi,
    "POST",
    "/agent-actions",
    {
      accountSetId: firstAccountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: [],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "security-agent"
    },
    "phase6-security-shared-idempotency"
  );
  const scopeMismatch = await request(
    firstApi,
    "POST",
    "/agent-actions",
    {
      accountSetId: secondAccountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: [],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "security-agent"
    },
    "phase6-security-shared-idempotency"
  );
  const restartedApi = createApi({ platformStore });
  const deniedEvents = await request(
    restartedApi,
    "GET",
    `/security/events?accountSetId=${encodeURIComponent(firstAccountSet.body.id)}&eventType=permission_denied&actorId=viewer`
  );
  const mismatchEvents = await request(
    restartedApi,
    "GET",
    `/security/events?eventType=idempotency_scope_mismatch&severity=medium`
  );

  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "PERMISSION_DENIED");
  assert.equal(firstAction.status, 201);
  assert.equal(scopeMismatch.status, 409);
  assert.equal(scopeMismatch.body.code, "IDEMPOTENCY_SCOPE_MISMATCH");
  assert.equal(deniedEvents.status, 200);
  assert.equal(deniedEvents.body.total, 1);
  assert.equal(deniedEvents.body.items[0].objectId, "agent_action.create");
  assert.equal(deniedEvents.body.items[0].payload.path, "/agent-actions");
  assert.equal(mismatchEvents.status, 200);
  assert.equal(mismatchEvents.body.total, 1);
  assert.equal(mismatchEvents.body.items[0].payload.cachedScope, firstAccountSet.body.id);
  assert.equal(mismatchEvents.body.items[0].payload.requestedScope, secondAccountSet.body.id);
});

test("write idempotency keys expire after their configured TTL", async () => {
  let now = Date.parse("2026-06-01T00:00:00.000Z");
  const ttlMs = 7 * 24 * 60 * 60 * 1000;
  const api = createApi({
    idempotencyTtlMs: ttlMs,
    now: () => now
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "IDEMP-TTL",
      name: "Idempotency TTL Account",
      companyName: "Idempotency TTL Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "idempotency-ttl-account"
  );

  const firstAction = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: [],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "agent-user"
    },
    "same-agent-idempotency-key-after-ttl"
  );

  now += ttlMs + 1;
  const secondAction = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: [],
      payload: { fiscalYear: 2026, periodNo: 2 },
      requestedBy: "agent-user"
    },
    "same-agent-idempotency-key-after-ttl"
  );

  assert.equal(firstAction.status, 201);
  assert.equal(secondAction.status, 201);
  assert.notEqual(secondAction.body.id, firstAction.body.id);
  assert.equal(api.state.agentActions.size, 2);
  assert.equal(api.state.idempotency.get("same-agent-idempotency-key-after-ttl").expiresAt, now + ttlMs);
});

test("login returns a bearer token that identifies the current user", async () => {
  const api = createApi();

  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "viewer",
      password: "viewer"
    }
  });
  const accountSets = await api.handle({
    method: "GET",
    path: "/account-sets",
    headers: {
      Authorization: `Bearer ${login.body.accessToken}`
    }
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, "viewer");
  assert.ok(login.body.accessToken);
  assert.equal(accountSets.status, 200);
});

test("login rejects invalid credentials", async () => {
  const api = createApi();

  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "viewer",
      password: "wrong-password"
    }
  });

  assert.equal(login.status, 401);
  assert.equal(login.body.code, "INVALID_CREDENTIALS");
});

test("login attempts append audit logs for successful and invalid credentials", async () => {
  const api = createApi();

  await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "viewer",
      password: "viewer"
    }
  });
  await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "viewer",
      password: "wrong-password"
    }
  });

  assert.ok(
    api.state.auditLogs.some(
      (log) => log.actorId === "viewer" && log.action === "auth.login.success" && log.objectType === "user"
    )
  );
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.actorId === "viewer" && log.action === "auth.login.failure" && log.objectType === "user"
    )
  );
});

test("roles assign permissions to newly created users and login uses the assigned identity", async () => {
  const api = createApi();

  const permissions = await request(api, "GET", "/permissions", null, null);
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "制单员",
      permissionCodes: ["voucher.create", "voucher.view", "attachment.upload"]
    },
    "rbac-role-create"
  );
  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "maker-1",
      password: "maker-password",
      name: "Maker One",
      roleId: role.body.id
    },
    "rbac-user-create"
  );
  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "maker-1",
      password: "maker-password"
    }
  });

  assert.equal(permissions.status, 200);
  assert.ok(permissions.body.some((permission) => permission.code === "voucher.create"));
  assert.equal(role.status, 201);
  assert.deepEqual(role.body.permissionCodes, ["voucher.create", "voucher.view", "attachment.upload"]);
  assert.equal(user.status, 201);
  assert.equal(user.body.password, undefined);
  assert.equal(api.state.permissionsByActor.get(user.body.id).has("voucher.create"), true);
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, user.body.id);
  assert.equal(login.body.user.role, "制单员");
});

test("system administrator role includes Phase 2-4 business permissions for created admin users", async () => {
  const api = createApi();

  const roles = await request(api, "GET", "/roles", null, null);
  const systemAdminRole = roles.body.find((role) => role.id === "role:system-admin");
  const requiredPermissions = [
    "partner.manage",
    "purchase_order.manage",
    "inventory_item.manage",
    "cost_allocation.manage",
    "payroll_run.manage",
    "fixed_asset_card.manage",
    "fixed_asset_depreciation.manage"
  ];

  assert.equal(roles.status, 200);
  for (const code of requiredPermissions) {
    assert.ok(systemAdminRole.permissionCodes.includes(code), `system administrator should include ${code}`);
  }

  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "business-admin",
      password: "admin-password",
      name: "Business Admin",
      roleId: systemAdminRole.id
    },
    "business-admin-create"
  );
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "BUS-ADMIN",
      name: "Business Admin Set",
      companyName: "Business Admin Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1,
      fiscalYearStartMonth: 1
    },
    "business-admin-account-set"
  );
  const grant = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/users`,
    {
      actorId: user.body.id,
      grantType: "member",
      grantedBy: "system"
    },
    "business-admin-account-set-grant"
  );
  const partner = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": user.body.id, "Idempotency-Key": "business-admin-supplier" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "SUP-ADMIN",
      name: "Admin Supplier"
    }
  });

  assert.equal(user.status, 201);
  assert.equal(grant.status, 201);
  assert.equal(partner.status, 201);
  assert.equal(partner.body.name, "Admin Supplier");
});

test("system administrator role can operate Phase 2-4 account-set modules without a separate grant", async () => {
  const api = createApi();
  const roles = await request(api, "GET", "/roles", null, null);
  const systemAdminRole = roles.body.find((role) => role.id === "role:system-admin");
  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "business-root",
      password: "admin-password",
      name: "Business Root",
      roleId: systemAdminRole.id
    },
    "business-root-create"
  );
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "BUS-ROOT",
      name: "Business Root Set",
      companyName: "Business Root Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1,
      fiscalYearStartMonth: 1
    },
    "business-root-account-set"
  );
  const supplier = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": user.body.id, "Idempotency-Key": "business-root-supplier" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "SUP-ROOT",
      name: "Root Supplier"
    }
  });
  const item = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": user.body.id, "Idempotency-Key": "business-root-item" },
    body: {
      accountSetId: accountSet.body.id,
      code: "RM-ROOT",
      name: "Root Material",
      itemType: "raw_material",
      unit: "kg",
      costMethod: "moving_average",
      createdBy: user.body.id
    }
  });
  const payrollCategory = await api.handle({
    method: "POST",
    path: "/payroll-categories",
    headers: { "Actor-Id": user.body.id, "Idempotency-Key": "business-root-payroll-category" },
    body: { accountSetId: accountSet.body.id, code: "ROOT-PAY", name: "Root payroll", createdBy: user.body.id }
  });
  const depreciationMethod = await api.handle({
    method: "POST",
    path: "/depreciation-methods",
    headers: { "Actor-Id": user.body.id, "Idempotency-Key": "business-root-fa-method" },
    body: {
      accountSetId: accountSet.body.id,
      code: "ROOT-SL",
      name: "Root straight line",
      methodType: "straight_line",
      createdBy: user.body.id
    }
  });

  assert.equal(user.status, 201);
  assert.equal(supplier.status, 201);
  assert.equal(item.status, 201);
  assert.equal(payrollCategory.status, 201);
  assert.equal(depreciationMethod.status, 201);
});

test("platform administrator scope lists all persisted account sets without explicit grants", async () => {
  const api = createApi();
  const adminId = "persisted-admin";
  const persistedAccountSets = [
    {
      id: "account-set:persisted-a",
      code: "PA",
      name: "Persisted A",
      companyName: "Persisted A Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1,
      status: "enabled"
    }
  ];
  api.state.permissionsByActor.set(
    adminId,
    new Set(["role.manage", "user.manage", "account_set.manage", "account_set_user.manage", "account_set.view"])
  );
  api.state.config.platformStore = {
    listAccessibleAccountSets: async () => [],
    listAccountSets: async () => persistedAccountSets,
    canAccessAccountSet: async () => false
  };

  const listed = await api.handle({
    method: "GET",
    path: "/account-sets",
    headers: { "Actor-Id": adminId }
  });

  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body, persistedAccountSets);
});

test("legacy platform administrator permissions cover Phase 2-4 module permissions after upgrade", async () => {
  const api = createApi();
  const actorId = "legacy-admin";
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "LEGACY-ADMIN",
      name: "Legacy Admin Set",
      companyName: "Legacy Admin Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1,
      fiscalYearStartMonth: 1
    },
    "legacy-admin-account-set"
  );
  api.state.permissionsByActor.set(
    actorId,
    new Set(["role.manage", "user.manage", "account_set.manage", "account_set_user.manage", "account_set.view"])
  );

  const supplier = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "legacy-admin-supplier" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "SUP-LEGACY",
      name: "Legacy Supplier"
    }
  });
  const item = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "legacy-admin-item" },
    body: {
      accountSetId: accountSet.body.id,
      code: "RM-LEGACY",
      name: "Legacy Material",
      itemType: "raw_material",
      unit: "kg",
      costMethod: "moving_average",
      createdBy: actorId
    }
  });
  const payrollCategory = await api.handle({
    method: "POST",
    path: "/payroll-categories",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "legacy-admin-payroll-category" },
    body: { accountSetId: accountSet.body.id, code: "LEGACY-PAY", name: "Legacy payroll", createdBy: actorId }
  });
  const depreciationMethod = await api.handle({
    method: "POST",
    path: "/depreciation-methods",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "legacy-admin-fa-method" },
    body: {
      accountSetId: accountSet.body.id,
      code: "LEGACY-SL",
      name: "Legacy straight line",
      methodType: "straight_line",
      createdBy: actorId
    }
  });

  assert.equal(supplier.status, 201);
  assert.equal(item.status, 201);
  assert.equal(payrollCategory.status, 201);
  assert.equal(depreciationMethod.status, 201);
});

test("roles can be edited and updated permissions apply to the next login", async () => {
  const api = createApi();
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "可编辑角色",
      permissionCodes: ["voucher.view"]
    },
    "editable-role-create"
  );
  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "editable-user",
      password: "editable-password",
      name: "Editable User",
      roleId: role.body.id
    },
    "editable-role-user"
  );

  const updated = await request(
    api,
    "PATCH",
    `/roles/${role.body.id}`,
    {
      name: "可编辑角色",
      description: "已更新",
      permissionCodes: ["voucher.view", "voucher.create"],
      updatedBy: "system"
    },
    "editable-role-update"
  );
  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "editable-user",
      password: "editable-password"
    }
  });

  assert.equal(updated.status, 200);
  assert.deepEqual(updated.body.permissionCodes, ["voucher.view", "voucher.create"]);
  assert.equal(updated.body.description, "已更新");
  assert.equal(user.status, 201);
  assert.equal(login.status, 200);
  assert.equal(api.state.permissionsByActor.get(user.body.id).has("voucher.create"), true);
});

test("last role manager permission cannot be removed", async () => {
  const api = createApi();

  const response = await request(
    api,
    "PATCH",
    "/roles/role:system-admin",
    {
      name: "系统管理员",
      permissionCodes: ["account_set.view"],
      updatedBy: "system"
    },
    "last-role-manager-protection"
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "ROLE_MANAGER_REQUIRED");
});

test("created users store password hashes instead of plaintext passwords", async () => {
  const api = createApi();
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "Secure Maker",
      permissionCodes: ["voucher.create", "voucher.view"]
    },
    "secure-role-create"
  );

  await request(
    api,
    "POST",
    "/users",
    {
      username: "secure-maker",
      password: "not-stored-in-plain",
      name: "Secure Maker",
      roleId: role.body.id
    },
    "secure-user-create"
  );
  const storedUser = api.state.users.get("secure-maker");
  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "secure-maker",
      password: "not-stored-in-plain"
    }
  });

  assert.equal(storedUser.password, undefined);
  assert.notEqual(storedUser.passwordHash, "not-stored-in-plain");
  assert.match(storedUser.passwordHash, /^sha256:/);
  assert.equal(login.status, 200);
});

test("users can be deleted except system and the current actor", async () => {
  const api = createApi();
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "Deletable User Role",
      permissionCodes: ["voucher.view"]
    },
    "deletable-user-role"
  );
  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "delete-me",
      password: "delete-me-password",
      roleId: role.body.id
    },
    "deletable-user-create"
  );

  const deleted = await request(api, "DELETE", `/users/${user.body.id}`, { deletedBy: "system" }, "deletable-user-delete");
  const users = await request(api, "GET", "/users", null, null);
  const systemDelete = await request(api, "DELETE", "/users/system", { deletedBy: "system" }, "delete-system-user");
  api.state.permissionsByActor.set("viewer", new Set(["user.manage"]));
  const selfDelete = await api.handle({
    method: "DELETE",
    path: "/users/viewer",
    headers: {
      "Actor-Id": "viewer",
      "Idempotency-Key": "delete-current-user"
    },
    body: { deletedBy: "viewer" }
  });

  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.id, user.body.id);
  assert.equal(api.state.permissionsByActor.has(user.body.id), false);
  assert.equal(users.body.some((item) => item.id === user.body.id), false);
  assert.equal(systemDelete.status, 409);
  assert.equal(systemDelete.body.code, "SYSTEM_USER_DELETE_BLOCKED");
  assert.equal(selfDelete.status, 409);
  assert.equal(selfDelete.body.code, "CURRENT_USER_DELETE_BLOCKED");
});

test("API can use persisted platform store for roles, users, and login", async () => {
  let storedRole = null;
  let storedUser = null;
  const platformStore = {
    listPermissions: async () => [
      { code: "voucher.create", description: "voucher.create" },
      { code: "voucher.view", description: "voucher.view" }
    ],
    listRoles: async () => (storedRole ? [storedRole] : []),
    createRole: async (role) => {
      storedRole = {
        id: "persisted-role:maker",
        name: role.name,
        description: role.description,
        permissionCodes: role.permissionCodes
      };
      return storedRole;
    },
    listUsers: async () => (storedUser ? [{ id: storedUser.id, username: storedUser.username, name: storedUser.name }] : []),
    createUser: async (user) => {
      storedUser = {
        id: "persisted-user:maker",
        username: user.username,
        name: user.name,
        role: storedRole.name,
        roleId: user.roleId,
        passwordHash: user.passwordHash
      };
      return { id: storedUser.id, username: storedUser.username, name: storedUser.name, roleId: storedUser.roleId };
    },
    findUserIdentity: async (username) =>
      username === storedUser?.username
        ? {
            user: storedUser,
            permissionCodes: storedRole.permissionCodes
          }
        : null
  };
  const api = createApi({ platformStore });

  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "Persisted Maker",
      permissionCodes: ["voucher.create", "voucher.view"]
    },
    "persisted-role"
  );
  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "persisted-maker",
      name: "Persisted Maker",
      password: "maker-password",
      roleId: role.body.id
    },
    "persisted-user"
  );
  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "persisted-maker",
      password: "maker-password"
    }
  });

  assert.equal(role.status, 201);
  assert.equal(user.status, 201);
  assert.notEqual(storedUser.passwordHash, "maker-password");
  assert.match(storedUser.passwordHash, /^sha256:/);
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, "persisted-user:maker");
});

test("access tokens are signed with the configured token secret", async () => {
  const api = createApi({ tokenSecret: "phase-1-test-secret" });
  const login = await api.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: {
      username: "viewer",
      password: "viewer"
    }
  });
  const [, payload, signature] = login.body.accessToken.split(".");
  const expected = createHmac("sha256", "phase-1-test-secret").update(login.body.accessToken.split(".").slice(0, 2).join(".")).digest("base64url");

  assert.equal(login.status, 200);
  assert.equal(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).sub, "viewer");
  assert.equal(signature, expected);
});

test("persisted token requests reload role permissions after API restart", async () => {
  const persistedUser = {
    id: "persisted-admin-id",
    username: "persisted-admin",
    password: "admin-password",
    name: "Persisted Admin",
    role: "系统管理员",
    roleId: "role:persisted-admin"
  };
  const permissionCodes = [
    "account_set.view",
    "role.manage",
    "user.manage",
    "account_set.manage",
    "account_set_user.manage",
    "partner.manage"
  ];
  const platformStore = {
    findUserIdentity: async (username) =>
      username === persistedUser.username ? { user: persistedUser, permissionCodes } : null,
    findUserIdentityById: async (userId) =>
      userId === persistedUser.id ? { user: persistedUser, permissionCodes } : null,
    canAccessAccountSet: async () => false
  };
  const firstApi = createApi({ tokenSecret: "persisted-token-secret", platformStore });
  const login = await firstApi.handle({
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: { username: persistedUser.username, password: persistedUser.password }
  });
  const restartedApi = createApi({ tokenSecret: "persisted-token-secret", platformStore });
  const supplier = await restartedApi.handle({
    method: "POST",
    path: "/partners",
    headers: {
      Authorization: `Bearer ${login.body.accessToken}`,
      "Idempotency-Key": "persisted-token-supplier"
    },
    body: {
      accountSetId: "account-set:persisted",
      partnerType: "supplier",
      code: "SUP-TOKEN",
      name: "Token Supplier"
    }
  });

  assert.equal(login.status, 200);
  assert.equal(supplier.status, 201);
  assert.equal(supplier.body.name, "Token Supplier");
  assert.equal(restartedApi.state.permissionsByActor.get(persistedUser.id).has("partner.manage"), true);
});

test("account-set authorization isolates vouchers between users with the same business permissions", async () => {
  const api = createApi();
  const permissions = new Set(["account_set.create", "account_set.view", "period.open", "account.create", "voucher.create", "voucher.view"]);
  api.state.permissionsByActor.set("alice", permissions);
  api.state.permissionsByActor.set("bob", permissions);

  const aliceSet = await api.handle({
    method: "POST",
    path: "/account-sets",
    headers: {
      "Idempotency-Key": "scope-alice-set",
      "Actor-Id": "alice"
    },
    body: {
      code: "A001",
      name: "Alice Account Set",
      companyName: "Alice Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1,
      createdBy: "alice"
    }
  });
  const bobSet = await api.handle({
    method: "POST",
    path: "/account-sets",
    headers: {
      "Idempotency-Key": "scope-bob-set",
      "Actor-Id": "bob"
    },
    body: {
      code: "B001",
      name: "Bob Account Set",
      companyName: "Bob Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1,
      createdBy: "bob"
    }
  });

  const aliceSets = await api.handle({ method: "GET", path: "/account-sets", headers: { "Actor-Id": "alice" } });
  const bobGenerateAlicePeriods = await api.handle({
    method: "POST",
    path: `/account-sets/${aliceSet.body.id}/periods/generate`,
    headers: {
      "Idempotency-Key": "scope-bob-period-generate-denied",
      "Actor-Id": "bob"
    },
    body: {}
  });
  await api.handle({
    method: "POST",
    path: `/account-sets/${aliceSet.body.id}/periods/generate`,
    headers: {
      "Idempotency-Key": "scope-alice-period-generate",
      "Actor-Id": "alice"
    },
    body: {}
  });
  const bobWriteToAliceSet = await api.handle({
    method: "POST",
    path: "/vouchers",
    headers: {
      "Idempotency-Key": "scope-bob-voucher-denied",
      "Actor-Id": "bob"
    },
    body: {
      accountSetId: aliceSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "bob",
      lines: [
        { summary: "Expense", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    }
  });
  const aliceWriteToOwnSet = await api.handle({
    method: "POST",
    path: "/vouchers",
    headers: {
      "Idempotency-Key": "scope-alice-voucher",
      "Actor-Id": "alice"
    },
    body: {
      accountSetId: aliceSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "alice",
      lines: [
        { summary: "Expense", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    }
  });
  const bobVouchers = await api.handle({ method: "GET", path: "/vouchers", headers: { "Actor-Id": "bob" } });

  assert.equal(aliceSet.status, 201);
  assert.equal(bobSet.status, 201);
  assert.deepEqual(aliceSets.body.map((accountSet) => accountSet.id), [aliceSet.body.id]);
  assert.equal(bobGenerateAlicePeriods.status, 403);
  assert.equal(bobGenerateAlicePeriods.body.code, "ACCOUNT_SET_ACCESS_DENIED");
  assert.equal(bobWriteToAliceSet.status, 403);
  assert.equal(bobWriteToAliceSet.body.code, "ACCOUNT_SET_ACCESS_DENIED");
  assert.equal(aliceWriteToOwnSet.status, 201);
  assert.deepEqual(bobVouchers.body, []);
  assert.ok(
    api.state.auditLogs.some(
      (log) =>
        log.action === "account_set.access_denied" &&
        log.actorId === "bob" &&
        log.objectId === aliceSet.body.id
    )
  );
});

test("account set user grants explicitly add users to an account set", async () => {
  const api = createApi();
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "Scoped Viewer",
      permissionCodes: ["account_set.view", "voucher.view"]
    },
    "scope-grant-role"
  );
  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "scoped-viewer",
      password: "viewer-password",
      name: "Scoped Viewer",
      roleId: role.body.id
    },
    "scope-grant-user"
  );
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "S001",
      name: "Scoped Account Set",
      companyName: "Scoped Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "scope-grant-account-set"
  );
  const beforeGrant = await api.handle({
    method: "GET",
    path: "/account-sets",
    headers: { "Actor-Id": user.body.id }
  });
  const grant = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/users`,
    {
      actorId: user.body.id,
      grantedBy: "system"
    },
    "scope-grant-user-to-set"
  );
  const afterGrant = await api.handle({
    method: "GET",
    path: "/account-sets",
    headers: { "Actor-Id": user.body.id }
  });

  assert.equal(beforeGrant.status, 200);
  assert.deepEqual(beforeGrant.body, []);
  assert.equal(grant.status, 201);
  assert.equal(grant.body.actorId, user.body.id);
  assert.equal(grant.body.accountSetId, accountSet.body.id);
  assert.deepEqual(afterGrant.body.map((item) => item.id), [accountSet.body.id]);
});

test("Phase 2 partners create, filter, update, and enforce account-set isolation", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P2-001",
      name: "Phase 2 Partner Set",
      companyName: "Phase 2 Trading Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase2-partner-account-set"
  );
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "往来档案维护员",
      permissionCodes: ["account_set.view", "partner.manage"]
    },
    "phase2-partner-role"
  );
  const alice = await request(
    api,
    "POST",
    "/users",
    {
      username: "partner-alice",
      password: "partner-password",
      name: "Partner Alice",
      roleId: role.body.id
    },
    "phase2-partner-alice"
  );
  const bob = await request(
    api,
    "POST",
    "/users",
    {
      username: "partner-bob",
      password: "partner-password",
      name: "Partner Bob",
      roleId: role.body.id
    },
    "phase2-partner-bob"
  );
  await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/users`,
    {
      actorId: alice.body.id,
      grantedBy: "system"
    },
    "phase2-partner-grant-alice"
  );

  const supplier = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": alice.body.id, "Idempotency-Key": "phase2-supplier-create" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "S001",
      name: "North Supplier",
      taxRate: 0.13,
      creditLimit: 50000,
      paymentTerms: "NET30",
      settlementMethod: "bank_transfer"
    }
  });
  const both = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": alice.body.id, "Idempotency-Key": "phase2-both-create" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "both",
      code: "B001",
      name: "Dual Role Partner",
      taxRate: 0.06,
      creditLimit: 80000,
      paymentTerms: "NET15",
      settlementMethod: "bank_acceptance"
    }
  });
  const customerWithSupplierCode = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": alice.body.id, "Idempotency-Key": "phase2-customer-same-code-create" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "customer",
      code: "S001",
      name: "Customer Using Supplier Code",
      taxRate: 0.13,
      creditLimit: 30000,
      paymentTerms: "NET15",
      settlementMethod: "bank_transfer"
    }
  });
  const suppliers = await api.handle({
    method: "GET",
    path: `/partners?accountSetId=${accountSet.body.id}&partnerType=supplier`,
    headers: { "Actor-Id": alice.body.id }
  });
  const updated = await api.handle({
    method: "PATCH",
    path: `/partners/${supplier.body.id}`,
    headers: { "Actor-Id": alice.body.id, "Idempotency-Key": "phase2-supplier-update" },
    body: {
      creditLimit: 65000,
      paymentTerms: "NET45",
      settlementMethod: "bank_transfer",
      isEnabled: false,
      updatedBy: alice.body.id
    }
  });
  const denied = await api.handle({
    method: "GET",
    path: `/partners?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": bob.body.id }
  });

  assert.equal(supplier.status, 201);
  assert.equal(supplier.body.partnerType, "supplier");
  assert.equal(supplier.body.paymentTerms, "NET30");
  assert.equal(both.status, 201);
  assert.equal(customerWithSupplierCode.status, 201);
  assert.equal(customerWithSupplierCode.body.partnerType, "customer");
  assert.equal(suppliers.status, 200);
  assert.deepEqual(
    suppliers.body.map((partner) => partner.code).sort(),
    ["B001", "S001"]
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.creditLimit, 65000);
  assert.equal(updated.body.paymentTerms, "NET45");
  assert.equal(updated.body.isEnabled, false);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "ACCOUNT_SET_ACCESS_DENIED");
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "partner.create" && log.objectType === "partner" && log.objectId === supplier.body.id
    )
  );
});

test("Phase 2 purchase and sales orders use partner master data and status workflow", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P2-ORD",
      name: "Phase 2 Order Set",
      companyName: "Phase 2 Order Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase2-order-account-set"
  );
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "订单维护员",
      permissionCodes: ["account_set.view", "partner.manage", "purchase_order.manage", "sales_order.manage"]
    },
    "phase2-order-role"
  );
  const actor = await request(
    api,
    "POST",
    "/users",
    {
      username: "order-actor",
      password: "order-password",
      name: "Order Actor",
      roleId: role.body.id
    },
    "phase2-order-actor"
  );
  await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/users`,
    { actorId: actor.body.id, grantedBy: "system" },
    "phase2-order-grant"
  );
  const supplier = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-order-supplier" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "SUP-001",
      name: "Order Supplier",
      paymentTerms: "NET30",
      settlementMethod: "bank_transfer"
    }
  });
  const customer = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-order-customer" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "customer",
      code: "CUS-001",
      name: "Order Customer",
      paymentTerms: "NET15",
      settlementMethod: "bank_transfer"
    }
  });

  const purchaseOrder = await api.handle({
    method: "POST",
    path: "/purchase-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-purchase-order" },
    body: {
      accountSetId: accountSet.body.id,
      supplierId: supplier.body.id,
      orderDate: "2026-01-12",
      currency: "CNY",
      exchangeRate: 1,
      createdBy: actor.body.id,
      lines: [
        {
          itemCode: "MAT-001",
          itemName: "办公耗材",
          quantity: 10,
          unitPrice: 100,
          taxRate: 0.13
        }
      ]
    }
  });
  const invalidPurchaseOrder = await api.handle({
    method: "POST",
    path: "/purchase-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-purchase-order-invalid" },
    body: {
      accountSetId: accountSet.body.id,
      supplierId: customer.body.id,
      orderDate: "2026-01-12",
      lines: [{ itemCode: "MAT-002", itemName: "错误供应商", quantity: 1, unitPrice: 1 }]
    }
  });
  const submittedPurchase = await api.handle({
    method: "POST",
    path: `/purchase-orders/${purchaseOrder.body.id}/submit`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-purchase-submit" },
    body: { submittedBy: actor.body.id }
  });
  const approvedPurchase = await api.handle({
    method: "POST",
    path: `/purchase-orders/${purchaseOrder.body.id}/approve`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-purchase-approve" },
    body: { approvedBy: actor.body.id }
  });
  const purchaseOrders = await api.handle({
    method: "GET",
    path: `/purchase-orders?accountSetId=${accountSet.body.id}&status=approved`,
    headers: { "Actor-Id": actor.body.id }
  });

  const salesOrder = await api.handle({
    method: "POST",
    path: "/sales-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-sales-order" },
    body: {
      accountSetId: accountSet.body.id,
      customerId: customer.body.id,
      orderDate: "2026-01-13",
      currency: "CNY",
      exchangeRate: 1,
      createdBy: actor.body.id,
      lines: [
        {
          itemCode: "SKU-001",
          itemName: "软件服务",
          quantity: 2,
          unitPrice: 3000,
          taxRate: 0.06
        }
      ]
    }
  });
  const invalidSalesOrder = await api.handle({
    method: "POST",
    path: "/sales-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-sales-order-invalid" },
    body: {
      accountSetId: accountSet.body.id,
      customerId: supplier.body.id,
      orderDate: "2026-01-13",
      lines: [{ itemCode: "SKU-002", itemName: "错误客户", quantity: 1, unitPrice: 1 }]
    }
  });

  assert.equal(purchaseOrder.status, 201);
  assert.equal(purchaseOrder.body.status, "draft");
  assert.equal(purchaseOrder.body.totalAmount, 1130);
  assert.equal(invalidPurchaseOrder.status, 400);
  assert.equal(invalidPurchaseOrder.body.code, "BUSINESS_RULE_FAILED");
  assert.equal(submittedPurchase.body.status, "submitted");
  assert.equal(approvedPurchase.body.status, "approved");
  assert.deepEqual(purchaseOrders.body.map((order) => order.orderNo), [purchaseOrder.body.orderNo]);
  assert.equal(salesOrder.status, 201);
  assert.equal(salesOrder.body.status, "draft");
  assert.equal(salesOrder.body.totalAmount, 6360);
  assert.equal(invalidSalesOrder.status, 400);
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "purchase_order.approve" && log.objectId === purchaseOrder.body.id
    )
  );
});

test("Phase 2 fulfillment documents update source order execution progress", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P2-FUL",
      name: "Phase 2 Fulfillment Set",
      companyName: "Phase 2 Fulfillment Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase2-fulfillment-account-set"
  );
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "履约维护员",
      permissionCodes: [
        "account_set.view",
        "partner.manage",
        "purchase_order.manage",
        "sales_order.manage",
        "purchase_receipt.manage",
        "sales_delivery.manage"
      ]
    },
    "phase2-fulfillment-role"
  );
  const actor = await request(
    api,
    "POST",
    "/users",
    {
      username: "fulfillment-actor",
      password: "fulfillment-password",
      name: "Fulfillment Actor",
      roleId: role.body.id
    },
    "phase2-fulfillment-actor"
  );
  await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/users`,
    { actorId: actor.body.id, grantedBy: "system" },
    "phase2-fulfillment-grant"
  );
  const supplier = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-supplier" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "SUP-FUL",
      name: "Fulfillment Supplier"
    }
  });
  const customer = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-customer" },
    body: {
      accountSetId: accountSet.body.id,
      partnerType: "customer",
      code: "CUS-FUL",
      name: "Fulfillment Customer"
    }
  });
  const purchaseOrder = await api.handle({
    method: "POST",
    path: "/purchase-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-purchase-order" },
    body: {
      accountSetId: accountSet.body.id,
      supplierId: supplier.body.id,
      orderDate: "2026-02-01",
      createdBy: actor.body.id,
      lines: [{ itemCode: "MAT-FUL", itemName: "履约材料", quantity: 10, unitPrice: 100, taxRate: 0.13 }]
    }
  });
  const salesOrder = await api.handle({
    method: "POST",
    path: "/sales-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-sales-order" },
    body: {
      accountSetId: accountSet.body.id,
      customerId: customer.body.id,
      orderDate: "2026-02-02",
      createdBy: actor.body.id,
      lines: [{ itemCode: "SKU-FUL", itemName: "履约商品", quantity: 4, unitPrice: 500, taxRate: 0.06 }]
    }
  });
  const draftReceipt = await api.handle({
    method: "POST",
    path: "/purchase-receipts",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-draft-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      purchaseOrderId: purchaseOrder.body.id,
      receiptDate: "2026-02-03",
      lines: [{ orderLineNo: 1, quantity: 1 }]
    }
  });

  await api.handle({
    method: "POST",
    path: `/purchase-orders/${purchaseOrder.body.id}/submit`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-purchase-submit" },
    body: { submittedBy: actor.body.id }
  });
  await api.handle({
    method: "POST",
    path: `/purchase-orders/${purchaseOrder.body.id}/approve`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-purchase-approve" },
    body: { approvedBy: actor.body.id }
  });
  await api.handle({
    method: "POST",
    path: `/sales-orders/${salesOrder.body.id}/submit`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-sales-submit" },
    body: { submittedBy: actor.body.id }
  });
  await api.handle({
    method: "POST",
    path: `/sales-orders/${salesOrder.body.id}/approve`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-fulfillment-sales-approve" },
    body: { approvedBy: actor.body.id }
  });

  const receipt = await api.handle({
    method: "POST",
    path: "/purchase-receipts",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-purchase-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      purchaseOrderId: purchaseOrder.body.id,
      receiptDate: "2026-02-03",
      createdBy: actor.body.id,
      evidenceRefs: ["attachment:receipt-photo"],
      lines: [{ orderLineNo: 1, quantity: 6 }]
    }
  });
  const overReceipt = await api.handle({
    method: "POST",
    path: "/purchase-receipts",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-over-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      purchaseOrderId: purchaseOrder.body.id,
      receiptDate: "2026-02-04",
      lines: [{ orderLineNo: 1, quantity: 5 }]
    }
  });
  const delivery = await api.handle({
    method: "POST",
    path: "/sales-deliveries",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-sales-delivery" },
    body: {
      accountSetId: accountSet.body.id,
      salesOrderId: salesOrder.body.id,
      deliveryDate: "2026-02-04",
      createdBy: actor.body.id,
      evidenceRefs: ["attachment:delivery-slip"],
      lines: [{ orderLineNo: 1, quantity: 4 }]
    }
  });
  const updatedPurchaseOrder = await api.handle({
    method: "GET",
    path: `/purchase-orders/${purchaseOrder.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const updatedSalesOrder = await api.handle({
    method: "GET",
    path: `/sales-orders/${salesOrder.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const receipts = await api.handle({
    method: "GET",
    path: `/purchase-receipts?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const deliveries = await api.handle({
    method: "GET",
    path: `/sales-deliveries?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });

  assert.equal(draftReceipt.status, 409);
  assert.equal(draftReceipt.body.code, "BUSINESS_RULE_FAILED");
  assert.equal(receipt.status, 201);
  assert.equal(receipt.body.purchaseOrderNo, purchaseOrder.body.orderNo);
  assert.equal(receipt.body.totalQuantity, 6);
  assert.deepEqual(receipt.body.evidenceRefs, ["attachment:receipt-photo"]);
  assert.equal(overReceipt.status, 409);
  assert.equal(overReceipt.body.code, "BUSINESS_RULE_FAILED");
  assert.equal(updatedPurchaseOrder.body.status, "partially_executed");
  assert.equal(updatedPurchaseOrder.body.lines[0].receivedQuantity, 6);
  assert.equal(delivery.status, 201);
  assert.equal(delivery.body.salesOrderNo, salesOrder.body.orderNo);
  assert.equal(updatedSalesOrder.body.status, "executed");
  assert.equal(updatedSalesOrder.body.lines[0].shippedQuantity, 4);
  assert.deepEqual(receipts.body.map((row) => row.receiptNo), [receipt.body.receiptNo]);
  assert.deepEqual(deliveries.body.map((row) => row.deliveryNo), [delivery.body.deliveryNo]);
  assert.ok(
    api.state.auditLogs.some((log) => log.action === "purchase_receipt.create" && log.objectId === receipt.body.id)
  );
  assert.ok(
    api.state.auditLogs.some((log) => log.action === "sales_delivery.create" && log.objectId === delivery.body.id)
  );
});

test("Phase 2 invoices confirm AP and AR from fulfilled source documents", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P2-INV",
      name: "Phase 2 Invoice Set",
      companyName: "Phase 2 Invoice Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase2-invoice-account-set"
  );
  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "发票确认员",
      permissionCodes: [
        "account_set.view",
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
        "ar_settlement.manage"
      ]
    },
    "phase2-invoice-role"
  );
  const actor = await request(
    api,
    "POST",
    "/users",
    {
      username: "invoice-actor",
      password: "invoice-password",
      name: "Invoice Actor",
      roleId: role.body.id
    },
    "phase2-invoice-actor"
  );
  await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/users`,
    { actorId: actor.body.id, grantedBy: "system" },
    "phase2-invoice-grant"
  );
  const supplier = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-supplier" },
    body: { accountSetId: accountSet.body.id, partnerType: "supplier", code: "SUP-INV", name: "Invoice Supplier" }
  });
  const customer = await api.handle({
    method: "POST",
    path: "/partners",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-customer" },
    body: { accountSetId: accountSet.body.id, partnerType: "customer", code: "CUS-INV", name: "Invoice Customer", creditLimit: 3000 }
  });
  const purchaseOrder = await api.handle({
    method: "POST",
    path: "/purchase-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-purchase-order" },
    body: {
      accountSetId: accountSet.body.id,
      supplierId: supplier.body.id,
      orderDate: "2026-04-01",
      createdBy: actor.body.id,
      lines: [{ itemCode: "MAT-INV", itemName: "发票材料", quantity: 10, unitPrice: 100, taxRate: 0.13 }]
    }
  });
  const salesOrder = await api.handle({
    method: "POST",
    path: "/sales-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-sales-order" },
    body: {
      accountSetId: accountSet.body.id,
      customerId: customer.body.id,
      orderDate: "2026-04-02",
      createdBy: actor.body.id,
      lines: [{ itemCode: "SKU-INV", itemName: "发票商品", quantity: 4, unitPrice: 500, taxRate: 0.06 }]
    }
  });
  await api.handle({
    method: "POST",
    path: `/purchase-orders/${purchaseOrder.body.id}/submit`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-purchase-submit" },
    body: { submittedBy: actor.body.id }
  });
  await api.handle({
    method: "POST",
    path: `/purchase-orders/${purchaseOrder.body.id}/approve`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-purchase-approve" },
    body: { approvedBy: actor.body.id }
  });
  await api.handle({
    method: "POST",
    path: `/sales-orders/${salesOrder.body.id}/submit`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-sales-submit" },
    body: { submittedBy: actor.body.id }
  });
  await api.handle({
    method: "POST",
    path: `/sales-orders/${salesOrder.body.id}/approve`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-sales-approve" },
    body: { approvedBy: actor.body.id }
  });
  const receipt = await api.handle({
    method: "POST",
    path: "/purchase-receipts",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      purchaseOrderId: purchaseOrder.body.id,
      receiptDate: "2026-04-03",
      lines: [{ orderLineNo: 1, quantity: 10 }]
    }
  });
  const delivery = await api.handle({
    method: "POST",
    path: "/sales-deliveries",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-invoice-delivery" },
    body: {
      accountSetId: accountSet.body.id,
      salesOrderId: salesOrder.body.id,
      deliveryDate: "2026-04-04",
      lines: [{ orderLineNo: 1, quantity: 4 }]
    }
  });

  const purchaseInvoice = await api.handle({
    method: "POST",
    path: "/purchase-invoices",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-purchase-invoice" },
    body: {
      accountSetId: accountSet.body.id,
      purchaseReceiptId: receipt.body.id,
      invoiceDate: "2026-04-05",
      dueDate: "2026-05-05",
      invoiceSource: "ocr",
      externalInvoiceNo: "VAT-202604-001",
      evidenceRefs: ["attachment:vat-202604-001"],
      createdBy: actor.body.id,
      lines: [{ receiptLineNo: 1, quantity: 10, unitPrice: 103, taxRate: 0.1262, taxAmount: 130 }]
    }
  });
  const overPurchaseInvoice = await api.handle({
    method: "POST",
    path: "/purchase-invoices",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-purchase-invoice-over" },
    body: {
      accountSetId: accountSet.body.id,
      purchaseReceiptId: receipt.body.id,
      invoiceDate: "2026-04-06",
      lines: [{ receiptLineNo: 1, quantity: 1, unitPrice: 100, taxRate: 0.13 }]
    }
  });
  const salesInvoice = await api.handle({
    method: "POST",
    path: "/sales-invoices",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-sales-invoice" },
    body: {
      accountSetId: accountSet.body.id,
      salesDeliveryId: delivery.body.id,
      invoiceDate: "2026-04-06",
      dueDate: "2026-04-21",
      invoiceSource: "import",
      externalInvoiceNo: "OUT-202604-001",
      evidenceRefs: ["attachment:out-202604-001"],
      createdBy: actor.body.id,
      lines: [{ deliveryLineNo: 1, quantity: 4, unitPrice: 500, taxRate: 0.06 }]
    }
  });
  const updatedPurchaseOrder = await api.handle({
    method: "GET",
    path: `/purchase-orders/${purchaseOrder.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const updatedSalesOrder = await api.handle({
    method: "GET",
    path: `/sales-orders/${salesOrder.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const purchaseInvoices = await api.handle({
    method: "GET",
    path: `/purchase-invoices?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const salesInvoices = await api.handle({
    method: "GET",
    path: `/sales-invoices?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const payableLedger = await api.handle({
    method: "GET",
    path: `/counterparty-ledger?accountSetId=${accountSet.body.id}&direction=ap`,
    headers: { "Actor-Id": actor.body.id }
  });
  const receivableLedger = await api.handle({
    method: "GET",
    path: `/counterparty-ledger?accountSetId=${accountSet.body.id}&direction=ar`,
    headers: { "Actor-Id": actor.body.id }
  });
  const collectionPlans = await api.handle({
    method: "GET",
    path: `/collection-plans?accountSetId=${accountSet.body.id}&customerId=${customer.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const creditExposures = await api.handle({
    method: "GET",
    path: `/credit-exposures?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const customerReceipt = await api.handle({
    method: "POST",
    path: "/customer-receipts",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-customer-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      counterpartyLedgerEntryId: receivableLedger.body[0].id,
      receiptDate: "2026-04-22",
      receiptType: "receipt",
      receivedAmount: 1200,
      receivedBy: actor.body.id,
      receiptMethod: "bank_transfer",
      bankAccountCode: "1002",
      evidenceRefs: ["attachment:receipt-bank-slip"]
    }
  });
  const prepaymentReceipt = await api.handle({
    method: "POST",
    path: "/customer-receipts",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-customer-prepayment" },
    body: {
      accountSetId: accountSet.body.id,
      customerId: customer.body.id,
      receiptDate: "2026-04-23",
      receiptType: "prepayment",
      receivedAmount: 300,
      receivedBy: actor.body.id,
      receiptMethod: "bank_transfer",
      bankAccountCode: "1002"
    }
  });
  const customerReceipts = await api.handle({
    method: "GET",
    path: `/customer-receipts?accountSetId=${accountSet.body.id}&customerId=${customer.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const creditBlockedSalesOrder = await api.handle({
    method: "POST",
    path: "/sales-orders",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-credit-blocked-sales-order" },
    body: {
      accountSetId: accountSet.body.id,
      customerId: customer.body.id,
      orderDate: "2026-04-24",
      createdBy: actor.body.id,
      lines: [{ itemCode: "SKU-CREDIT", itemName: "Credit Blocked SKU", quantity: 1, unitPrice: 1000, taxRate: 0 }]
    }
  });
  const paymentRequest = await api.handle({
    method: "POST",
    path: "/payment-requests",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-payment-request" },
    body: {
      accountSetId: accountSet.body.id,
      counterpartyLedgerEntryId: payableLedger.body[0].id,
      requestDate: "2026-04-08",
      plannedPaymentDate: "2026-04-18",
      requestedAmount: 600,
      requestedBy: actor.body.id,
      paymentMethod: "bank_transfer",
      bankAccountCode: "1002",
      evidenceRefs: ["attachment:payment-approval"]
    }
  });
  const approvedPaymentRequest = await api.handle({
    method: "POST",
    path: `/payment-requests/${paymentRequest.body.id}/approve`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-payment-request-approve" },
    body: { approvedBy: actor.body.id, approvalComment: "Pay this week" }
  });
  const supplierPayment = await api.handle({
    method: "POST",
    path: "/supplier-payments",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-supplier-payment" },
    body: {
      accountSetId: accountSet.body.id,
      paymentRequestId: approvedPaymentRequest.body.id,
      paymentDate: "2026-04-19",
      paidAmount: 600,
      paidBy: actor.body.id,
      bankAccountCode: "1002",
      evidenceRefs: ["attachment:bank-slip"]
    }
  });
  const apSettlement = await api.handle({
    method: "POST",
    path: "/ap-settlements",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-ap-settlement" },
    body: {
      accountSetId: accountSet.body.id,
      counterpartyLedgerEntryId: payableLedger.body[0].id,
      supplierPaymentId: supplierPayment.body.id,
      settlementDate: "2026-04-20",
      settlementType: "payment_to_bill",
      settledAmount: 600,
      differenceAmount: 10,
      differenceReason: "Bank fee difference",
      createdBy: actor.body.id,
      evidenceRefs: ["attachment:ap-settlement"]
    }
  });
  const apSettlements = await api.handle({
    method: "GET",
    path: `/ap-settlements?accountSetId=${accountSet.body.id}&supplierId=${supplier.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const arSettlement = await api.handle({
    method: "POST",
    path: "/ar-settlements",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-ar-settlement" },
    body: {
      accountSetId: accountSet.body.id,
      counterpartyLedgerEntryId: receivableLedger.body[0].id,
      customerReceiptId: customerReceipt.body.id,
      settlementDate: "2026-04-23",
      settlementType: "receipt_to_bill",
      settledAmount: 1200,
      differenceAmount: 5,
      differenceReason: "Collection fee difference",
      createdBy: actor.body.id,
      evidenceRefs: ["attachment:ar-settlement"]
    }
  });
  const arSettlements = await api.handle({
    method: "GET",
    path: `/ar-settlements?accountSetId=${accountSet.body.id}&customerId=${customer.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const settledPayableLedger = await api.handle({
    method: "GET",
    path: `/counterparty-ledger?accountSetId=${accountSet.body.id}&direction=ap`,
    headers: { "Actor-Id": actor.body.id }
  });
  const settledReceivableLedger = await api.handle({
    method: "GET",
    path: `/counterparty-ledger?accountSetId=${accountSet.body.id}&direction=ar`,
    headers: { "Actor-Id": actor.body.id }
  });
  const approvedPaymentRequests = await api.handle({
    method: "GET",
    path: `/payment-requests?accountSetId=${accountSet.body.id}&status=approved`,
    headers: { "Actor-Id": actor.body.id }
  });
  const supplierPayments = await api.handle({
    method: "GET",
    path: `/supplier-payments?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actor.body.id }
  });
  const blockedLedger = await api.handle({
    method: "POST",
    path: `/counterparty-ledger/${payableLedger.body[0].id}/block-payment`,
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-block-payment" },
    body: { blockedBy: actor.body.id, paymentBlockReason: "Supplier bank account under review" }
  });
  const blockedPaymentRequest = await api.handle({
    method: "POST",
    path: "/payment-requests",
    headers: { "Actor-Id": actor.body.id, "Idempotency-Key": "phase2-blocked-payment-request" },
    body: {
      accountSetId: accountSet.body.id,
      counterpartyLedgerEntryId: payableLedger.body[0].id,
      requestDate: "2026-04-09",
      requestedAmount: 100,
      requestedBy: actor.body.id,
      paymentMethod: "bank_transfer",
      bankAccountCode: "1002"
    }
  });

  assert.equal(purchaseInvoice.status, 201);
  assert.equal(purchaseInvoice.body.status, "confirmed");
  assert.equal(purchaseInvoice.body.purchaseReceiptNo, receipt.body.receiptNo);
  assert.equal(purchaseInvoice.body.payableAmount, 1160);
  assert.equal(purchaseInvoice.body.estimatedDifference, 30);
  assert.deepEqual(purchaseInvoice.body.evidenceRefs, ["attachment:vat-202604-001"]);
  assert.equal(overPurchaseInvoice.status, 409);
  assert.equal(overPurchaseInvoice.body.code, "BUSINESS_RULE_FAILED");
  assert.equal(salesInvoice.status, 201);
  assert.equal(salesInvoice.body.status, "confirmed");
  assert.equal(salesInvoice.body.salesDeliveryNo, delivery.body.deliveryNo);
  assert.equal(salesInvoice.body.receivableAmount, 2120);
  assert.equal(updatedPurchaseOrder.body.lines[0].invoicedQuantity, 10);
  assert.equal(updatedSalesOrder.body.lines[0].invoicedQuantity, 4);
  assert.deepEqual(purchaseInvoices.body.map((invoice) => invoice.invoiceNo), [purchaseInvoice.body.invoiceNo]);
  assert.deepEqual(salesInvoices.body.map((invoice) => invoice.invoiceNo), [salesInvoice.body.invoiceNo]);
  assert.equal(payableLedger.status, 200);
  assert.deepEqual(payableLedger.body.map((entry) => entry.sourceNo), [purchaseInvoice.body.invoiceNo]);
  assert.equal(payableLedger.body[0].sourceType, "purchase_invoice");
  assert.equal(payableLedger.body[0].sourceId, purchaseInvoice.body.id);
  assert.equal(payableLedger.body[0].partnerId, supplier.body.id);
  assert.equal(payableLedger.body[0].originalAmount, 1160);
  assert.equal(payableLedger.body[0].remainingAmount, 1160);
  assert.equal(payableLedger.body[0].glAccountCode, "2202");
  assert.equal(payableLedger.body[0].auxiliaryType, "supplier");
  assert.equal(payableLedger.body[0].auxiliaryPartnerId, supplier.body.id);
  assert.equal(receivableLedger.status, 200);
  assert.deepEqual(receivableLedger.body.map((entry) => entry.sourceNo), [salesInvoice.body.invoiceNo]);
  assert.equal(receivableLedger.body[0].sourceType, "sales_invoice");
  assert.equal(receivableLedger.body[0].sourceId, salesInvoice.body.id);
  assert.equal(receivableLedger.body[0].partnerId, customer.body.id);
  assert.equal(receivableLedger.body[0].originalAmount, 2120);
  assert.equal(receivableLedger.body[0].remainingAmount, 2120);
  assert.equal(receivableLedger.body[0].glAccountCode, "1122");
  assert.equal(receivableLedger.body[0].auxiliaryType, "customer");
  assert.equal(receivableLedger.body[0].auxiliaryPartnerId, customer.body.id);
  assert.equal(collectionPlans.status, 200);
  assert.deepEqual(collectionPlans.body.map((plan) => plan.sourceNo), [salesInvoice.body.invoiceNo]);
  assert.equal(collectionPlans.body[0].plannedReceiptDate, "2026-04-21");
  assert.equal(collectionPlans.body[0].plannedAmount, 2120);
  assert.equal(creditExposures.status, 200);
  assert.equal(creditExposures.body[0].customerId, customer.body.id);
  assert.equal(creditExposures.body[0].creditLimit, 3000);
  assert.equal(creditExposures.body[0].occupiedAmount, 2120);
  assert.equal(creditExposures.body[0].availableCredit, 880);
  assert.equal(customerReceipt.status, 201);
  assert.equal(customerReceipt.body.receiptType, "receipt");
  assert.equal(customerReceipt.body.sourceNo, salesInvoice.body.invoiceNo);
  assert.equal(customerReceipt.body.receivedAmount, 1200);
  assert.equal(prepaymentReceipt.status, 201);
  assert.equal(prepaymentReceipt.body.receiptType, "prepayment");
  assert.equal(prepaymentReceipt.body.counterpartyLedgerEntryId, null);
  assert.deepEqual(customerReceipts.body.map((receipt) => receipt.receiptNo), [
    customerReceipt.body.receiptNo,
    prepaymentReceipt.body.receiptNo
  ]);
  assert.equal(creditBlockedSalesOrder.status, 409);
  assert.equal(creditBlockedSalesOrder.body.code, "CREDIT_LIMIT_EXCEEDED");
  assert.equal(paymentRequest.status, 201);
  assert.equal(paymentRequest.body.status, "pending_approval");
  assert.equal(paymentRequest.body.supplierId, supplier.body.id);
  assert.equal(paymentRequest.body.requestedAmount, 600);
  assert.equal(paymentRequest.body.sourceNo, purchaseInvoice.body.invoiceNo);
  assert.equal(approvedPaymentRequest.status, 200);
  assert.equal(approvedPaymentRequest.body.status, "approved");
  assert.equal(approvedPaymentRequest.body.approvedBy, actor.body.id);
  assert.equal(supplierPayment.status, 201);
  assert.equal(supplierPayment.body.status, "paid");
  assert.equal(supplierPayment.body.paymentRequestNo, paymentRequest.body.requestNo);
  assert.equal(supplierPayment.body.paidAmount, 600);
  assert.equal(apSettlement.status, 201);
  assert.equal(apSettlement.body.settlementType, "payment_to_bill");
  assert.equal(apSettlement.body.sourceNo, purchaseInvoice.body.invoiceNo);
  assert.equal(apSettlement.body.supplierPaymentNo, supplierPayment.body.paymentNo);
  assert.equal(apSettlement.body.settledAmount, 600);
  assert.equal(apSettlement.body.differenceAmount, 10);
  assert.equal(apSettlement.body.differenceReason, "Bank fee difference");
  assert.deepEqual(apSettlements.body.map((settlement) => settlement.settlementNo), [apSettlement.body.settlementNo]);
  assert.equal(arSettlement.status, 201);
  assert.equal(arSettlement.body.settlementType, "receipt_to_bill");
  assert.equal(arSettlement.body.sourceNo, salesInvoice.body.invoiceNo);
  assert.equal(arSettlement.body.customerReceiptNo, customerReceipt.body.receiptNo);
  assert.equal(arSettlement.body.settledAmount, 1200);
  assert.equal(arSettlement.body.differenceAmount, 5);
  assert.equal(arSettlement.body.differenceReason, "Collection fee difference");
  assert.equal(arSettlement.body.voucherDraft.status, "draft");
  assert.equal(arSettlement.body.voucherDraft.lines[1].accountCode, "1122");
  assert.deepEqual(arSettlements.body.map((settlement) => settlement.settlementNo), [arSettlement.body.settlementNo]);
  assert.equal(settledPayableLedger.body[0].settledAmount, 600);
  assert.equal(settledPayableLedger.body[0].remainingAmount, 560);
  assert.equal(settledPayableLedger.body[0].status, "partially_settled");
  assert.equal(settledReceivableLedger.body[0].settledAmount, 1200);
  assert.equal(settledReceivableLedger.body[0].remainingAmount, 920);
  assert.equal(settledReceivableLedger.body[0].status, "partially_settled");
  assert.deepEqual(approvedPaymentRequests.body.map((request) => request.requestNo), [paymentRequest.body.requestNo]);
  assert.deepEqual(supplierPayments.body.map((payment) => payment.paymentNo), [supplierPayment.body.paymentNo]);
  assert.equal(blockedLedger.status, 200);
  assert.equal(blockedLedger.body.isPaymentBlocked, true);
  assert.equal(blockedLedger.body.paymentBlockReason, "Supplier bank account under review");
  assert.equal(blockedPaymentRequest.status, 409);
  assert.equal(blockedPaymentRequest.body.code, "PAYMENT_BLOCKED");
  assert.ok(api.state.auditLogs.some((log) => log.action === "purchase_invoice.confirm" && log.objectId === purchaseInvoice.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "sales_invoice.confirm" && log.objectId === salesInvoice.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "payment_request.approve" && log.objectId === paymentRequest.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "supplier_payment.create" && log.objectId === supplierPayment.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "ap_settlement.create" && log.objectId === apSettlement.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "ar_settlement.create" && log.objectId === arSettlement.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "customer_receipt.create" && log.objectId === customerReceipt.body.id));
});

test("Phase 2 AR/AP netting settles receivable and payable entries for the same partner", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P2-NET",
      name: "Phase 2 Netting Set",
      companyName: "Phase 2 Netting Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase2-netting-account-set"
  );
  const actorId = "netting-actor";
  const partner = {
    id: "partner:netting",
    accountSetId: accountSet.body.id,
    partnerType: "both",
    code: "BOTH-001",
    name: "Netting Counterparty",
    taxRate: 0,
    creditLimit: 0,
    paymentTerms: "NET30",
    settlementMethod: "bank_transfer",
    isEnabled: true
  };
  api.state.permissionsByActor.set(actorId, new Set(["ar_settlement.manage", "counterparty_ledger.view"]));
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));
  api.state.partners.set(partner.id, partner);
  api.state.counterpartyLedgerEntries.set("ledger:ar:netting", {
    id: "ledger:ar:netting",
    accountSetId: accountSet.body.id,
    partnerId: partner.id,
    partnerName: partner.name,
    direction: "ar",
    sourceType: "sales_invoice",
    sourceId: "sales-invoice:netting",
    sourceNo: "SI-NET-001",
    documentDate: "2026-05-01",
    dueDate: "2026-05-31",
    originalAmount: 800,
    settledAmount: 0,
    remainingAmount: 800,
    status: "open",
    glAccountCode: "1122",
    auxiliaryType: "customer",
    auxiliaryPartnerId: partner.id,
    createdBy: actorId
  });
  api.state.counterpartyLedgerEntries.set("ledger:ap:netting", {
    id: "ledger:ap:netting",
    accountSetId: accountSet.body.id,
    partnerId: partner.id,
    partnerName: partner.name,
    direction: "ap",
    sourceType: "purchase_invoice",
    sourceId: "purchase-invoice:netting",
    sourceNo: "PI-NET-001",
    documentDate: "2026-05-02",
    dueDate: "2026-05-30",
    originalAmount: 500,
    settledAmount: 0,
    remainingAmount: 500,
    status: "open",
    glAccountCode: "2202",
    auxiliaryType: "supplier",
    auxiliaryPartnerId: partner.id,
    isPaymentBlocked: false,
    paymentBlockReason: null,
    createdBy: actorId
  });

  const netting = await api.handle({
    method: "POST",
    path: "/ar-settlements",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase2-ar-ap-netting" },
    body: {
      accountSetId: accountSet.body.id,
      counterpartyLedgerEntryId: "ledger:ar:netting",
      nettingCounterpartyLedgerEntryId: "ledger:ap:netting",
      settlementDate: "2026-05-10",
      settlementType: "ar_ap_netting",
      settledAmount: 300,
      createdBy: actorId
    }
  });

  assert.equal(netting.status, 201);
  assert.equal(netting.body.settlementType, "ar_ap_netting");
  assert.equal(netting.body.nettingSourceNo, "PI-NET-001");
  assert.equal(netting.body.voucherDraft.lines[0].accountCode, "2202");
  assert.equal(netting.body.voucherDraft.lines[0].debit, 300);
  assert.equal(netting.body.voucherDraft.lines[1].accountCode, "1122");
  assert.equal(api.state.counterpartyLedgerEntries.get("ledger:ar:netting").remainingAmount, 500);
  assert.equal(api.state.counterpartyLedgerEntries.get("ledger:ap:netting").remainingAmount, 200);
});

test("Phase 2 counterparty analytics summarize supplier/customer ledgers and aging buckets", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P2-AGE",
      name: "Phase 2 Aging Set",
      companyName: "Phase 2 Aging Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase2-aging-account-set"
  );
  const actorId = "aging-actor";
  api.state.permissionsByActor.set(actorId, new Set(["counterparty_ledger.view"]));
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));
  api.state.counterpartyLedgerEntries.set("ledger:ar:aging", {
    id: "ledger:ar:aging",
    accountSetId: accountSet.body.id,
    partnerId: "customer:aging",
    partnerName: "Aging Customer",
    direction: "ar",
    sourceType: "sales_invoice",
    sourceId: "sales-invoice:aging",
    sourceNo: "SI-AGE-001",
    documentDate: "2026-05-01",
    dueDate: "2026-06-10",
    originalAmount: 500,
    settledAmount: 400,
    remainingAmount: 100,
    status: "partially_settled",
    glAccountCode: "1122",
    auxiliaryType: "customer",
    auxiliaryPartnerId: "customer:aging",
    createdBy: actorId
  });
  api.state.counterpartyLedgerEntries.set("ledger:ap:aging", {
    id: "ledger:ap:aging",
    accountSetId: accountSet.body.id,
    partnerId: "supplier:aging",
    partnerName: "Aging Supplier",
    direction: "ap",
    sourceType: "purchase_invoice",
    sourceId: "purchase-invoice:aging",
    sourceNo: "PI-AGE-001",
    documentDate: "2026-02-01",
    dueDate: "2026-03-01",
    originalAmount: 300,
    settledAmount: 100,
    remainingAmount: 200,
    status: "partially_settled",
    glAccountCode: "2202",
    auxiliaryType: "supplier",
    auxiliaryPartnerId: "supplier:aging",
    isPaymentBlocked: false,
    paymentBlockReason: null,
    createdBy: actorId
  });

  const summary = await api.handle({
    method: "GET",
    path: `/counterparty-ledger-summary?accountSetId=${accountSet.body.id}&asOfDate=2026-06-15`,
    headers: { "Actor-Id": actorId }
  });
  const arAging = await api.handle({
    method: "GET",
    path: `/counterparty-aging?accountSetId=${accountSet.body.id}&direction=ar&asOfDate=2026-06-15`,
    headers: { "Actor-Id": actorId }
  });
  const apAging = await api.handle({
    method: "GET",
    path: `/counterparty-aging?accountSetId=${accountSet.body.id}&direction=ap&asOfDate=2026-06-15`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(summary.status, 200);
  assert.equal(summary.body.length, 2);
  assert.equal(summary.body.find((row) => row.direction === "ar").remainingAmount, 100);
  assert.equal(summary.body.find((row) => row.direction === "ar").overdueAmount, 100);
  assert.equal(summary.body.find((row) => row.direction === "ap").remainingAmount, 200);
  assert.equal(arAging.status, 200);
  assert.equal(arAging.body[0].bucket1To30, 100);
  assert.equal(arAging.body[0].detailRows[0].sourceNo, "SI-AGE-001");
  assert.equal(apAging.status, 200);
  assert.equal(apAging.body[0].bucketOver90, 200);
});

test("Phase 3 inventory foundation manages items, BOMs, warehouses, and opening balances", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P3-INV",
      name: "Phase 3 Inventory Set",
      companyName: "Phase 3 Manufacturing Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase3-inventory-account-set"
  );
  const actorId = "phase3-inventory-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set(["inventory_item.manage", "bom.manage", "warehouse.manage", "inventory_balance.manage"])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const invalidBatchItem = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-invalid-batch-item" },
    body: {
      accountSetId: accountSet.body.id,
      code: "RM-BAD",
      name: "Invalid Batch Material",
      itemType: "raw_material",
      unit: "kg",
      costMethod: "moving_average",
      isBatchManaged: true,
      isSerialManaged: false,
      isManufactured: false,
      createdBy: actorId
    }
  });
  const material = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-material-item" },
    body: {
      accountSetId: accountSet.body.id,
      code: "RM-STEEL",
      name: "Steel Coil",
      category: "raw",
      itemType: "raw_material",
      unit: "kg",
      costMethod: "fifo",
      isBatchManaged: true,
      shelfLifeDays: 180,
      createdBy: actorId
    }
  });
  const product = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-product-item" },
    body: {
      accountSetId: accountSet.body.id,
      code: "FG-PUMP",
      name: "Finished Pump",
      category: "finished",
      itemType: "finished_good",
      unit: "pcs",
      costMethod: "monthly_weighted_average",
      isManufactured: true,
      createdBy: actorId
    }
  });
  const warehouse = await api.handle({
    method: "POST",
    path: "/warehouses",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-warehouse" },
    body: {
      accountSetId: accountSet.body.id,
      code: "WH-MAIN",
      name: "Main Warehouse",
      manager: "Warehouse Lead",
      locations: [{ code: "A-01", name: "Aisle A Bin 01", capacity: 5000 }],
      createdBy: actorId
    }
  });
  const bom = await api.handle({
    method: "POST",
    path: "/boms",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-bom" },
    body: {
      accountSetId: accountSet.body.id,
      productItemId: product.body.id,
      version: "V1",
      status: "active",
      yieldQuantity: 1,
      createdBy: actorId,
      lines: [{ componentItemId: material.body.id, quantity: 2.5, scrapRate: 0.03, lineNo: 1 }]
    }
  });
  const opening = await api.handle({
    method: "POST",
    path: "/inventory-opening-balances",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-opening-balance" },
    body: {
      accountSetId: accountSet.body.id,
      itemId: material.body.id,
      warehouseId: warehouse.body.id,
      locationId: warehouse.body.locations[0].id,
      batchNo: "BATCH-2026-01",
      fiscalYear: 2026,
      periodNo: 1,
      quantity: 100,
      amount: 1200,
      createdBy: actorId
    }
  });
  const trial = await api.handle({
    method: "GET",
    path: `/inventory-opening-balances/trial-balance?accountSetId=${accountSet.body.id}&fiscalYear=2026&periodNo=1`,
    headers: { "Actor-Id": actorId }
  });
  const items = await api.handle({
    method: "GET",
    path: `/inventory-items?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(invalidBatchItem.status, 409);
  assert.equal(invalidBatchItem.body.code, "BATCH_COST_METHOD_CONFLICT");
  assert.equal(material.status, 201);
  assert.equal(material.body.costMethod, "fifo");
  assert.equal(material.body.isBatchManaged, true);
  assert.equal(product.status, 201);
  assert.equal(product.body.isManufactured, true);
  assert.equal(warehouse.status, 201);
  assert.equal(warehouse.body.locations[0].code, "A-01");
  assert.equal(bom.status, 201);
  assert.equal(bom.body.lines[0].componentItemId, material.body.id);
  assert.equal(bom.body.lines[0].scrapRate, 0.03);
  assert.equal(opening.status, 201);
  assert.equal(opening.body.batchNo, "BATCH-2026-01");
  assert.equal(opening.body.unitCost, 12);
  assert.equal(trial.status, 200);
  assert.equal(trial.body.totalQuantity, 100);
  assert.equal(trial.body.totalAmount, 1200);
  assert.equal(trial.body.rows[0].itemCode, "RM-STEEL");
  assert.deepEqual(items.body.map((item) => item.code), ["FG-PUMP", "RM-STEEL"]);
  assert.ok(api.state.auditLogs.some((log) => log.action === "inventory_item.create" && log.objectId === material.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "inventory_opening_balance.save" && log.objectId === opening.body.id));
});

test("Phase 3 stock movements calculate moving-average and FIFO costs with transfers and stock-count preview", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P3-MOVE",
      name: "Phase 3 Movement Set",
      companyName: "Phase 3 Movement Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase3-movement-account-set"
  );
  const actorId = "phase3-movement-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set([
      "inventory_item.manage",
      "warehouse.manage",
      "inventory_balance.manage",
      "inventory_movement.manage",
      "inventory_transfer.manage",
      "stock_count.manage"
    ])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const movingItem = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-moving-item" },
    body: {
      accountSetId: accountSet.body.id,
      code: "RM-MA",
      name: "Moving Average Material",
      itemType: "raw_material",
      unit: "kg",
      costMethod: "moving_average",
      createdBy: actorId
    }
  });
  const fifoItem = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-fifo-item" },
    body: {
      accountSetId: accountSet.body.id,
      code: "RM-FIFO",
      name: "FIFO Batch Material",
      itemType: "raw_material",
      unit: "kg",
      costMethod: "fifo",
      isBatchManaged: true,
      createdBy: actorId
    }
  });
  const mainWarehouse = await api.handle({
    method: "POST",
    path: "/warehouses",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-main-warehouse" },
    body: {
      accountSetId: accountSet.body.id,
      code: "WH-A",
      name: "Main Warehouse",
      locations: [{ code: "A-01", name: "A Bin" }],
      createdBy: actorId
    }
  });
  const secondaryWarehouse = await api.handle({
    method: "POST",
    path: "/warehouses",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-secondary-warehouse" },
    body: {
      accountSetId: accountSet.body.id,
      code: "WH-B",
      name: "Secondary Warehouse",
      locations: [{ code: "B-01", name: "B Bin" }],
      createdBy: actorId
    }
  });

  await api.handle({
    method: "POST",
    path: "/inventory-opening-balances",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-moving-opening" },
    body: {
      accountSetId: accountSet.body.id,
      itemId: movingItem.body.id,
      warehouseId: mainWarehouse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      quantity: 10,
      amount: 100,
      createdBy: actorId
    }
  });
  await api.handle({
    method: "POST",
    path: "/inventory-opening-balances",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-fifo-opening" },
    body: {
      accountSetId: accountSet.body.id,
      itemId: fifoItem.body.id,
      warehouseId: mainWarehouse.body.id,
      locationId: mainWarehouse.body.locations[0].id,
      batchNo: "FIFO-A",
      fiscalYear: 2026,
      periodNo: 1,
      quantity: 10,
      amount: 100,
      createdBy: actorId
    }
  });

  const movingIssue = await api.handle({
    method: "POST",
    path: "/inventory-movements",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-moving-issue-1" },
    body: {
      accountSetId: accountSet.body.id,
      documentNo: "OUT-MA-001",
      movementType: "outbound",
      businessType: "other_outbound",
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{ itemId: movingItem.body.id, warehouseId: mainWarehouse.body.id, quantity: 4 }]
    }
  });
  const movingReceipt = await api.handle({
    method: "POST",
    path: "/inventory-movements",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-moving-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      documentNo: "IN-MA-001",
      movementType: "inbound",
      businessType: "other_inbound",
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{ itemId: movingItem.body.id, warehouseId: mainWarehouse.body.id, quantity: 4, unitCost: 15 }]
    }
  });
  const movingFinalIssue = await api.handle({
    method: "POST",
    path: "/inventory-movements",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-moving-issue-2" },
    body: {
      accountSetId: accountSet.body.id,
      documentNo: "OUT-MA-002",
      movementType: "outbound",
      businessType: "other_outbound",
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{ itemId: movingItem.body.id, warehouseId: mainWarehouse.body.id, quantity: 10 }]
    }
  });
  const fifoReceipt = await api.handle({
    method: "POST",
    path: "/inventory-movements",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-fifo-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      documentNo: "IN-FIFO-001",
      movementType: "inbound",
      businessType: "purchase_inbound",
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{
        itemId: fifoItem.body.id,
        warehouseId: mainWarehouse.body.id,
        locationId: mainWarehouse.body.locations[0].id,
        batchNo: "FIFO-B",
        quantity: 5,
        unitCost: 14
      }]
    }
  });
  const fifoIssue = await api.handle({
    method: "POST",
    path: "/inventory-movements",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-fifo-issue" },
    body: {
      accountSetId: accountSet.body.id,
      documentNo: "OUT-FIFO-001",
      movementType: "outbound",
      businessType: "sales_outbound",
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{ itemId: fifoItem.body.id, warehouseId: mainWarehouse.body.id, quantity: 12 }]
    }
  });
  const transfer = await api.handle({
    method: "POST",
    path: "/inventory-transfers",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-transfer" },
    body: {
      accountSetId: accountSet.body.id,
      transferNo: "TR-001",
      fiscalYear: 2026,
      periodNo: 1,
      itemId: fifoItem.body.id,
      fromWarehouseId: mainWarehouse.body.id,
      fromLocationId: mainWarehouse.body.locations[0].id,
      toWarehouseId: secondaryWarehouse.body.id,
      toLocationId: secondaryWarehouse.body.locations[0].id,
      batchNo: "FIFO-B",
      quantity: 2,
      createdBy: actorId
    }
  });
  const countPreview = await api.handle({
    method: "POST",
    path: "/stock-counts/preview",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-count-preview" },
    body: {
      accountSetId: accountSet.body.id,
      countNo: "SC-001",
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{
        itemId: fifoItem.body.id,
        warehouseId: secondaryWarehouse.body.id,
        locationId: secondaryWarehouse.body.locations[0].id,
        batchNo: "FIFO-B",
        actualQuantity: 1
      }]
    }
  });
  const balances = await api.handle({
    method: "GET",
    path: `/inventory-balances?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actorId }
  });
  const fifoLayers = await api.handle({
    method: "GET",
    path: `/inventory-cost-layers?accountSetId=${accountSet.body.id}&itemId=${fifoItem.body.id}`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(movingIssue.status, 201);
  assert.equal(movingIssue.body.lines[0].unitCost, 10);
  assert.equal(movingIssue.body.lines[0].amount, 40);
  assert.equal(movingReceipt.body.lines[0].amount, 60);
  assert.equal(movingFinalIssue.body.lines[0].unitCost, 12);
  assert.equal(movingFinalIssue.body.lines[0].amount, 120);
  assert.equal(movingFinalIssue.body.lines[0].zeroResidualAdjustment, 0);
  assert.equal(fifoReceipt.status, 201);
  assert.equal(fifoIssue.body.lines[0].amount, 128);
  assert.deepEqual(
    fifoIssue.body.lines[0].costBreakdown.map((layer) => ({ batchNo: layer.batchNo, quantity: layer.quantity, amount: layer.amount })),
    [
      { batchNo: "FIFO-A", quantity: 10, amount: 100 },
      { batchNo: "FIFO-B", quantity: 2, amount: 28 }
    ]
  );
  assert.equal(transfer.status, 201);
  assert.equal(transfer.body.totalAmount, 28);
  assert.equal(transfer.body.outboundMovementId.startsWith("inventory-movement:"), true);
  assert.equal(transfer.body.inboundMovementId.startsWith("inventory-movement:"), true);
  assert.equal(countPreview.status, 200);
  assert.equal(countPreview.body.lines[0].bookQuantity, 2);
  assert.equal(countPreview.body.lines[0].differenceQuantity, -1);
  assert.equal(countPreview.body.lines[0].adjustmentAmount, -14);
  assert.equal(balances.status, 200);
  assert.deepEqual(
    balances.body
      .filter((balance) => balance.itemCode === "RM-MA" || balance.itemCode === "RM-FIFO")
      .map((balance) => ({
        itemCode: balance.itemCode,
        warehouseCode: balance.warehouseCode,
        batchNo: balance.batchNo,
        quantity: balance.quantity,
        amount: balance.amount
      })),
    [
      { itemCode: "RM-FIFO", warehouseCode: "WH-A", batchNo: "FIFO-B", quantity: 1, amount: 14 },
      { itemCode: "RM-FIFO", warehouseCode: "WH-B", batchNo: "FIFO-B", quantity: 2, amount: 28 },
      { itemCode: "RM-MA", warehouseCode: "WH-A", batchNo: null, quantity: 0, amount: 0 }
    ]
  );
  assert.deepEqual(
    fifoLayers.body.map((layer) => ({ batchNo: layer.batchNo, remainingQuantity: layer.remainingQuantity, remainingAmount: layer.remainingAmount, status: layer.status })),
    [
      { batchNo: "FIFO-A", remainingQuantity: 0, remainingAmount: 0, status: "closed" },
      { batchNo: "FIFO-B", remainingQuantity: 1, remainingAmount: 14, status: "open" },
      { batchNo: "FIFO-B", remainingQuantity: 2, remainingAmount: 28, status: "open" }
    ]
  );
  assert.ok(api.state.auditLogs.some((log) => log.action === "inventory_movement.post" && log.objectId === fifoIssue.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "inventory_transfer.post" && log.objectId === transfer.body.id));
});

test("Phase 3 production workflow releases work orders, issues materials, and receives finished goods", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P3-PROD",
      name: "Phase 3 Production Set",
      companyName: "Phase 3 Factory Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase3-production-account-set"
  );
  const actorId = "phase3-production-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set([
      "inventory_item.manage",
      "bom.manage",
      "warehouse.manage",
      "inventory_balance.manage",
      "inventory_movement.manage",
      "work_order.manage",
      "material_requisition.manage",
      "product_receipt.manage"
    ])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const rawMaterial = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-prod-raw" },
    body: {
      accountSetId: accountSet.body.id,
      code: "RM-MOTOR",
      name: "Motor",
      unit: "pcs",
      costMethod: "fifo",
      isBatchManaged: true,
      createdBy: actorId
    }
  });
  const finishedGood = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-prod-fg" },
    body: {
      accountSetId: accountSet.body.id,
      code: "FG-FAN",
      name: "Finished Fan",
      unit: "pcs",
      costMethod: "moving_average",
      isManufactured: true,
      createdBy: actorId
    }
  });
  const warehouse = await api.handle({
    method: "POST",
    path: "/warehouses",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-prod-warehouse" },
    body: {
      accountSetId: accountSet.body.id,
      code: "WH-PROD",
      name: "Production Warehouse",
      createdBy: actorId
    }
  });
  await api.handle({
    method: "POST",
    path: "/inventory-opening-balances",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-prod-opening" },
    body: {
      accountSetId: accountSet.body.id,
      itemId: rawMaterial.body.id,
      warehouseId: warehouse.body.id,
      batchNo: "MOTOR-A",
      fiscalYear: 2026,
      periodNo: 1,
      quantity: 20,
      amount: 200,
      createdBy: actorId
    }
  });
  const bom = await api.handle({
    method: "POST",
    path: "/boms",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-prod-bom" },
    body: {
      accountSetId: accountSet.body.id,
      productItemId: finishedGood.body.id,
      version: "V1",
      status: "active",
      yieldQuantity: 1,
      createdBy: actorId,
      lines: [{ componentItemId: rawMaterial.body.id, quantity: 2, scrapRate: 0, lineNo: 1 }]
    }
  });

  const workOrder = await api.handle({
    method: "POST",
    path: "/work-orders",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-work-order" },
    body: {
      accountSetId: accountSet.body.id,
      workOrderNo: "WO-001",
      productItemId: finishedGood.body.id,
      bomId: bom.body.id,
      plannedQuantity: 4,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId
    }
  });
  const release = await api.handle({
    method: "POST",
    path: `/work-orders/${workOrder.body.id}/release`,
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-work-order-release" },
    body: { releasedBy: actorId }
  });
  const requisition = await api.handle({
    method: "POST",
    path: "/material-requisitions",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-material-requisition" },
    body: {
      accountSetId: accountSet.body.id,
      requisitionNo: "MR-001",
      workOrderId: workOrder.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{ componentItemId: rawMaterial.body.id, warehouseId: warehouse.body.id, batchNo: "MOTOR-A", quantity: 8 }]
    }
  });
  const receipt = await api.handle({
    method: "POST",
    path: "/product-receipts",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-product-receipt" },
    body: {
      accountSetId: accountSet.body.id,
      receiptNo: "PR-001",
      workOrderId: workOrder.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      lines: [{ productItemId: finishedGood.body.id, warehouseId: warehouse.body.id, quantity: 4 }]
    }
  });
  const close = await api.handle({
    method: "POST",
    path: `/work-orders/${workOrder.body.id}/close`,
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-work-order-close" },
    body: { closedBy: actorId }
  });
  const workOrders = await api.handle({
    method: "GET",
    path: `/work-orders?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actorId }
  });
  const balances = await api.handle({
    method: "GET",
    path: `/inventory-balances?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(workOrder.status, 201);
  assert.equal(workOrder.body.status, "planned");
  assert.equal(workOrder.body.productItemCode, "FG-FAN");
  assert.equal(release.status, 200);
  assert.equal(release.body.status, "released");
  assert.equal(requisition.status, 201);
  assert.equal(requisition.body.totalAmount, 80);
  assert.equal(requisition.body.lines[0].unitCost, 10);
  assert.equal(requisition.body.sourceMovementId.startsWith("inventory-movement:"), true);
  assert.equal(receipt.status, 201);
  assert.equal(receipt.body.totalAmount, 80);
  assert.equal(receipt.body.costStatus, "direct_material_only");
  assert.equal(receipt.body.lines[0].unitCost, 20);
  assert.equal(receipt.body.sourceMovementId.startsWith("inventory-movement:"), true);
  assert.equal(close.status, 200);
  assert.equal(close.body.status, "closed");
  assert.equal(close.body.directMaterialCost, 80);
  assert.equal(close.body.completedQuantity, 4);
  assert.equal(workOrders.body[0].status, "closed");
  assert.deepEqual(
    balances.body
      .filter((balance) => ["RM-MOTOR", "FG-FAN"].includes(balance.itemCode))
      .map((balance) => ({ itemCode: balance.itemCode, quantity: balance.quantity, amount: balance.amount })),
    [
      { itemCode: "FG-FAN", quantity: 4, amount: 80 },
      { itemCode: "RM-MOTOR", quantity: 12, amount: 120 }
    ]
  );
  assert.ok(api.state.auditLogs.some((log) => log.action === "work_order.release" && log.objectId === workOrder.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "material_requisition.post" && log.objectId === requisition.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "product_receipt.post" && log.objectId === receipt.body.id));
});

test("Phase 3 cost allocation uses locked mock inputs and adjusts finished-goods inventory cost", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P3-COST",
      name: "Phase 3 Cost Set",
      companyName: "Phase 3 Cost Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase3-cost-account-set"
  );
  const actorId = "phase3-cost-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set([
      "inventory_item.manage",
      "bom.manage",
      "warehouse.manage",
      "inventory_balance.manage",
      "inventory_movement.manage",
      "work_order.manage",
      "material_requisition.manage",
      "product_receipt.manage",
      "mock_cost_input.manage",
      "cost_allocation.manage"
    ])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const material = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-raw" },
    body: { accountSetId: accountSet.body.id, code: "RM-LAB", name: "Labor Material", unit: "kg", costMethod: "fifo", isBatchManaged: true, createdBy: actorId }
  });
  const product = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-fg" },
    body: { accountSetId: accountSet.body.id, code: "FG-COST", name: "Costed Finished Good", unit: "pcs", costMethod: "moving_average", isManufactured: true, createdBy: actorId }
  });
  const warehouse = await api.handle({
    method: "POST",
    path: "/warehouses",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-warehouse" },
    body: { accountSetId: accountSet.body.id, code: "WH-COST", name: "Cost Warehouse", createdBy: actorId }
  });
  await api.handle({
    method: "POST",
    path: "/inventory-opening-balances",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-opening" },
    body: { accountSetId: accountSet.body.id, itemId: material.body.id, warehouseId: warehouse.body.id, batchNo: "LAB-A", fiscalYear: 2026, periodNo: 1, quantity: 20, amount: 200, createdBy: actorId }
  });
  const bom = await api.handle({
    method: "POST",
    path: "/boms",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-bom" },
    body: { accountSetId: accountSet.body.id, productItemId: product.body.id, version: "V1", status: "active", yieldQuantity: 1, createdBy: actorId, lines: [{ componentItemId: material.body.id, quantity: 2 }] }
  });
  const workOrder = await api.handle({
    method: "POST",
    path: "/work-orders",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-wo" },
    body: { accountSetId: accountSet.body.id, workOrderNo: "WO-COST-001", productItemId: product.body.id, bomId: bom.body.id, plannedQuantity: 4, fiscalYear: 2026, periodNo: 1, createdBy: actorId }
  });
  await api.handle({ method: "POST", path: `/work-orders/${workOrder.body.id}/release`, headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-release" }, body: { releasedBy: actorId } });
  await api.handle({
    method: "POST",
    path: "/material-requisitions",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-mr" },
    body: { accountSetId: accountSet.body.id, requisitionNo: "MR-COST-001", workOrderId: workOrder.body.id, fiscalYear: 2026, periodNo: 1, createdBy: actorId, lines: [{ componentItemId: material.body.id, warehouseId: warehouse.body.id, batchNo: "LAB-A", quantity: 8 }] }
  });
  const receipt = await api.handle({
    method: "POST",
    path: "/product-receipts",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-pr" },
    body: { accountSetId: accountSet.body.id, receiptNo: "PR-COST-001", workOrderId: workOrder.body.id, fiscalYear: 2026, periodNo: 1, createdBy: actorId, lines: [{ productItemId: product.body.id, warehouseId: warehouse.body.id, quantity: 4 }] }
  });
  const costInput = await api.handle({
    method: "POST",
    path: "/mock-cost-inputs",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-input" },
    body: {
      accountSetId: accountSet.body.id,
      workOrderId: workOrder.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      sourceType: "manual",
      costType: "direct_labor",
      amount: 40,
      createdBy: actorId
    }
  });
  const dryRun = await api.handle({
    method: "POST",
    path: "/cost-allocations/dry-run",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-dry-run" },
    body: { accountSetId: accountSet.body.id, workOrderId: workOrder.body.id, fiscalYear: 2026, periodNo: 1, costInputIds: [costInput.body.id], createdBy: actorId }
  });
  const blockedCommit = await api.handle({
    method: "POST",
    path: "/cost-allocations",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-blocked" },
    body: { accountSetId: accountSet.body.id, workOrderId: workOrder.body.id, fiscalYear: 2026, periodNo: 1, costInputIds: [costInput.body.id], createdBy: actorId }
  });
  const lockedInput = await api.handle({
    method: "POST",
    path: `/mock-cost-inputs/${costInput.body.id}/lock`,
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-lock" },
    body: { lockedBy: actorId }
  });
  const allocation = await api.handle({
    method: "POST",
    path: "/cost-allocations",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-cost-commit" },
    body: { accountSetId: accountSet.body.id, workOrderId: workOrder.body.id, fiscalYear: 2026, periodNo: 1, costInputIds: [costInput.body.id], createdBy: actorId }
  });
  const balances = await api.handle({
    method: "GET",
    path: `/inventory-balances?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(receipt.body.totalAmount, 80);
  assert.equal(costInput.status, 201);
  assert.equal(costInput.body.sourceType, "manual");
  assert.equal(costInput.body.lockedAt, null);
  assert.equal(dryRun.status, 200);
  assert.equal(dryRun.body.dryRun, true);
  assert.equal(dryRun.body.totalAllocatedAmount, 40);
  assert.deepEqual(dryRun.body.warningCodes, ["PHASE4_SOURCE_MISSING"]);
  assert.equal(blockedCommit.status, 409);
  assert.equal(blockedCommit.body.code, "COST_INPUT_NOT_LOCKED");
  assert.equal(lockedInput.body.lockedAt, "now");
  assert.equal(allocation.status, 201);
  assert.equal(allocation.body.dryRun, false);
  assert.equal(allocation.body.totalAllocatedAmount, 40);
  assert.equal(allocation.body.lines[0].allocatedAmount, 40);
  assert.equal(allocation.body.adjustments[0].amount, 40);
  assert.deepEqual(
    balances.body
      .filter((balance) => balance.itemCode === "FG-COST")
      .map((balance) => ({ quantity: balance.quantity, amount: balance.amount, unitCost: balance.unitCost })),
    [{ quantity: 4, amount: 120, unitCost: 30 }]
  );
  assert.ok(api.state.auditLogs.some((log) => log.action === "mock_cost_input.lock" && log.objectId === costInput.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "cost_allocation.commit" && log.objectId === allocation.body.id));
});

test("Phase 3 cost voucher drafts and inventory reconciliation close the self-test costing loop", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P3-FINAL",
      name: "Phase 3 Final Set",
      companyName: "Phase 3 Final Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase3-final-account-set"
  );
  const actorId = "phase3-final-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set(["inventory_item.manage", "warehouse.manage", "inventory_balance.manage", "cost_allocation.manage", "cost_voucher.manage", "inventory_reconciliation.view"])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));
  const product = await api.handle({
    method: "POST",
    path: "/inventory-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-final-item" },
    body: { accountSetId: accountSet.body.id, code: "FG-FINAL", name: "Final Costed Good", unit: "pcs", costMethod: "moving_average", isManufactured: true, createdBy: actorId }
  });
  const warehouse = await api.handle({
    method: "POST",
    path: "/warehouses",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-final-warehouse" },
    body: { accountSetId: accountSet.body.id, code: "WH-FINAL", name: "Final Warehouse", createdBy: actorId }
  });
  await api.handle({
    method: "POST",
    path: "/inventory-opening-balances",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-final-opening" },
    body: { accountSetId: accountSet.body.id, itemId: product.body.id, warehouseId: warehouse.body.id, fiscalYear: 2026, periodNo: 1, quantity: 4, amount: 120, createdBy: actorId }
  });
  api.state.workOrders.set("work-order:final", {
    id: "work-order:final",
    accountSetId: accountSet.body.id,
    workOrderNo: "WO-FINAL",
    productItemId: product.body.id,
    productItemCode: product.body.code,
    plannedQuantity: 4,
    completedQuantity: 4,
    directMaterialCost: 80,
    status: "closed",
    fiscalYear: 2026,
    periodNo: 1
  });
  api.state.costAllocations.set("cost-allocation:final", {
    id: "cost-allocation:final",
    accountSetId: accountSet.body.id,
    workOrderId: "work-order:final",
    workOrderNo: "WO-FINAL",
    fiscalYear: 2026,
    periodNo: 1,
    dryRun: false,
    status: "committed",
    totalAllocatedAmount: 40,
    warningCodes: ["PHASE4_SOURCE_MISSING"],
    lines: [{ id: "line:final", costType: "direct_labor", allocatedAmount: 40 }],
    adjustments: [{ id: "adj:final", itemId: product.body.id, itemCode: product.body.code, amount: 40 }]
  });

  const draft = await api.handle({
    method: "POST",
    path: "/cost-voucher-drafts",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase3-final-draft" },
    body: { accountSetId: accountSet.body.id, costAllocationId: "cost-allocation:final", fiscalYear: 2026, periodNo: 1, createdBy: actorId }
  });
  const reconciliation = await api.handle({
    method: "GET",
    path: `/inventory-reconciliation?accountSetId=${accountSet.body.id}&fiscalYear=2026&periodNo=1`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(draft.status, 201);
  assert.equal(draft.body.approvalRequired, true);
  assert.equal(draft.body.voucherDraft.sourceType, "phase3_cost_allocation");
  assert.equal(draft.body.voucherDraft.totalAmount, 120);
  assert.deepEqual(draft.body.voucherDraft.lines.map((line) => line.amount), [120, -120]);
  assert.deepEqual(draft.body.warningCodes, ["PHASE4_SOURCE_MISSING"]);
  assert.equal(reconciliation.status, 200);
  assert.equal(reconciliation.body.inventoryBalanceTotal, 120);
  assert.equal(reconciliation.body.differenceAmount, 0);
  assert.deepEqual(reconciliation.body.rows.map((row) => ({ itemCode: row.itemCode, amount: row.amount })), [{ itemCode: "FG-FINAL", amount: 120 }]);
  assert.ok(api.state.auditLogs.some((log) => log.action === "cost_voucher_draft.create" && log.objectId === draft.body.id));
});

test("Phase 4 payroll foundation calculates imported variable pay with monthly cumulative tax and manual adjustments", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P4-PAY",
      name: "Phase 4 Payroll Set",
      companyName: "Phase 4 Payroll Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase4-payroll-account-set"
  );
  const actorId = "phase4-payroll-actor";
  api.state.permissionsByActor.set(actorId, new Set(["payroll_setup.manage", "payroll_run.manage"]));
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const category = await api.handle({
    method: "POST",
    path: "/payroll-categories",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-payroll-category" },
    body: { accountSetId: accountSet.body.id, code: "MONTHLY", name: "Monthly payroll", createdBy: actorId }
  });
  const item = await api.handle({
    method: "POST",
    path: "/payroll-items",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-payroll-item" },
    body: { accountSetId: accountSet.body.id, code: "PERF", name: "Performance pay", itemType: "earning", formula: "import.performancePay", createdBy: actorId }
  });
  const profile = await api.handle({
    method: "POST",
    path: "/employee-payroll-profiles",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-payroll-profile" },
    body: {
      accountSetId: accountSet.body.id,
      employeeNo: "E001",
      employeeName: "Lin Mei",
      departmentId: "D-PROD",
      departmentName: "Production",
      payrollCategoryId: category.body.id,
      baseSalary: 10000,
      personalSocialSecurity: 1000,
      personalHousingFund: 500,
      companySocialSecurity: 1600,
      companyHousingFund: 1200,
      monthlyTaxExemption: 5000,
      createdBy: actorId
    }
  });
  const firstImport = await api.handle({
    method: "POST",
    path: "/payroll-variable-imports",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-payroll-import-1" },
    body: {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      importType: "attendance_performance",
      createdBy: actorId,
      lines: [{ employeeProfileId: profile.body.id, workDays: 22, performancePay: 1000, piecePay: 0, allowance: 200, deduction: 100 }]
    }
  });
  const firstRun = await api.handle({
    method: "POST",
    path: "/payroll-runs/calculate",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-payroll-run-1" },
    body: {
      accountSetId: accountSet.body.id,
      runNo: "PAY-202601-01",
      payrollCategoryId: category.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      variableImportId: firstImport.body.id,
      createdBy: actorId,
      manualAdjustments: [{ employeeProfileId: profile.body.id, field: "individualIncomeTax", amount: 170, reason: "official tax rounding" }]
    }
  });
  const secondImport = await api.handle({
    method: "POST",
    path: "/payroll-variable-imports",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-payroll-import-2" },
    body: {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      importType: "bonus",
      createdBy: actorId,
      lines: [{ employeeProfileId: profile.body.id, workDays: 0, performancePay: 3000, piecePay: 0, allowance: 0, deduction: 0 }]
    }
  });
  const secondRun = await api.handle({
    method: "POST",
    path: "/payroll-runs/calculate",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-payroll-run-2" },
    body: {
      accountSetId: accountSet.body.id,
      runNo: "PAY-202601-02",
      payrollCategoryId: category.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      variableImportId: secondImport.body.id,
      createdBy: actorId
    }
  });
  const runs = await api.handle({
    method: "GET",
    path: `/payroll-runs?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(category.status, 201);
  assert.equal(item.status, 201);
  assert.equal(profile.status, 201);
  assert.equal(firstImport.status, 201);
  assert.equal(firstImport.body.lines[0].performancePay, 1000);
  assert.equal(firstRun.status, 201);
  assert.equal(firstRun.body.status, "calculated");
  assert.equal(firstRun.body.lineCount, 1);
  assert.equal(firstRun.body.totalGrossAmount, 11200);
  assert.equal(firstRun.body.lines[0].individualIncomeTax, 170);
  assert.equal(firstRun.body.lines[0].manualAdjustmentAmount, 32);
  assert.equal(firstRun.body.lines[0].cumulativeTaxableIncome, 9600);
  assert.equal(firstRun.body.lines[0].netPay, 9430);
  assert.equal(secondRun.status, 201);
  assert.equal(secondRun.body.lines[0].grossAmount, 3000);
  assert.equal(secondRun.body.lines[0].cumulativeTaxableIncome, 12600);
  assert.equal(secondRun.body.lines[0].individualIncomeTax, 58);
  assert.equal(secondRun.body.lines[0].netPay, 2942);
  assert.deepEqual(runs.body.map((run) => run.runNo), ["PAY-202601-01", "PAY-202601-02"]);
  assert.ok(api.state.auditLogs.some((log) => log.action === "payroll_variable_import.create" && log.objectId === firstImport.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "payroll_run.calculate" && log.objectId === secondRun.body.id));
});

test("Phase 4 payroll workflow approves, locks, pays, allocates, and outputs formal labor cost pools", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P4-PAY-WF",
      name: "Phase 4 Payroll Workflow Set",
      companyName: "Phase 4 Workflow Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase4-payroll-workflow-account-set"
  );
  const actorId = "phase4-payroll-workflow-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set(["payroll_setup.manage", "payroll_run.manage", "payroll_payment.manage", "payroll_allocation.manage", "payroll_cost_pool.view"])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const category = await api.handle({
    method: "POST",
    path: "/payroll-categories",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-category" },
    body: { accountSetId: accountSet.body.id, code: "MONTHLY", name: "Monthly payroll", createdBy: actorId }
  });
  const profile = await api.handle({
    method: "POST",
    path: "/employee-payroll-profiles",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-profile" },
    body: {
      accountSetId: accountSet.body.id,
      employeeNo: "E002",
      employeeName: "Chen Wei",
      departmentId: "D-PROD",
      departmentName: "Production",
      payrollCategoryId: category.body.id,
      baseSalary: 10000,
      personalSocialSecurity: 1000,
      personalHousingFund: 500,
      companySocialSecurity: 1600,
      companyHousingFund: 1200,
      monthlyTaxExemption: 5000,
      createdBy: actorId
    }
  });
  const variableImport = await api.handle({
    method: "POST",
    path: "/payroll-variable-imports",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-import" },
    body: {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      importType: "attendance_performance",
      createdBy: actorId,
      lines: [{ employeeProfileId: profile.body.id, workDays: 22, performancePay: 1000, allowance: 200, deduction: 100 }]
    }
  });
  const run = await api.handle({
    method: "POST",
    path: "/payroll-runs/calculate",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-run" },
    body: {
      accountSetId: accountSet.body.id,
      runNo: "PAY-202601-WF",
      payrollCategoryId: category.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      variableImportId: variableImport.body.id,
      createdBy: actorId
    }
  });
  api.state.workOrders.set("work-order:p4-payroll", {
    id: "work-order:p4-payroll",
    accountSetId: accountSet.body.id,
    workOrderNo: "WO-P4-PAYROLL",
    status: "closed",
    fiscalYear: 2026,
    periodNo: 1
  });

  const blockedPayment = await api.handle({
    method: "POST",
    path: "/payroll-payment-files",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-payment-blocked" },
    body: { accountSetId: accountSet.body.id, payrollRunId: run.body.id, bankAccountCode: "1002", createdBy: actorId }
  });
  const approved = await api.handle({
    method: "POST",
    path: `/payroll-runs/${run.body.id}/approve`,
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-approve" },
    body: { approvedBy: actorId }
  });
  const locked = await api.handle({
    method: "POST",
    path: `/payroll-runs/${run.body.id}/lock`,
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-lock" },
    body: { lockedBy: actorId }
  });
  const paymentFile = await api.handle({
    method: "POST",
    path: "/payroll-payment-files",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-payment" },
    body: { accountSetId: accountSet.body.id, payrollRunId: run.body.id, bankAccountCode: "1002", createdBy: actorId }
  });
  const allocation = await api.handle({
    method: "POST",
    path: "/payroll-allocations",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-wf-allocation" },
    body: {
      accountSetId: accountSet.body.id,
      payrollRunId: run.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: actorId,
      rules: [{ departmentId: "D-PROD", targetType: "work_order", workOrderId: "work-order:p4-payroll", costType: "direct_labor", allocationRate: 1 }]
    }
  });
  const costPools = await api.handle({
    method: "GET",
    path: `/payroll-cost-pools?accountSetId=${accountSet.body.id}&fiscalYear=2026&periodNo=1`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(run.body.totalCompanyCost, 14000);
  assert.equal(blockedPayment.status, 409);
  assert.equal(blockedPayment.body.code, "PAYROLL_RUN_NOT_LOCKED");
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, "approved");
  assert.equal(locked.status, 200);
  assert.equal(locked.body.status, "locked");
  assert.equal(locked.body.lockedAt, "now");
  assert.equal(paymentFile.status, 201);
  assert.equal(paymentFile.body.totalAmount, run.body.totalNetPay);
  assert.equal(paymentFile.body.lines[0].amount, run.body.lines[0].netPay);
  assert.equal(allocation.status, 201);
  assert.equal(allocation.body.status, "allocated");
  assert.equal(allocation.body.totalAllocatedAmount, 14000);
  assert.equal(allocation.body.voucherDraft.sourceType, "phase4_payroll_allocation");
  assert.equal(allocation.body.voucherDraft.approvalRequired, true);
  assert.deepEqual(allocation.body.voucherDraft.lines.map((line) => line.amount), [14000, -14000]);
  assert.equal(costPools.status, 200);
  assert.deepEqual(
    costPools.body.map((pool) => ({
      sourceRunId: pool.sourceRunId,
      workOrderId: pool.workOrderId,
      costType: pool.costType,
      amount: pool.amount,
      lockedAt: pool.lockedAt
    })),
    [{ sourceRunId: run.body.id, workOrderId: "work-order:p4-payroll", costType: "direct_labor", amount: 14000, lockedAt: "now" }]
  );
  assert.ok(api.state.auditLogs.some((log) => log.action === "payroll_run.lock" && log.objectId === run.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "payroll_allocation.create" && log.objectId === allocation.body.id));
});

test("Phase 4 fixed asset foundation manages cards, additions, value changes, and month-end department ownership", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P4-FA",
      name: "Phase 4 Fixed Asset Set",
      companyName: "Phase 4 Fixed Asset Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase4-fixed-asset-account-set"
  );
  const actorId = "phase4-fixed-asset-actor";
  api.state.permissionsByActor.set(actorId, new Set(["fixed_asset_setup.manage", "fixed_asset_card.manage", "fixed_asset_transfer.manage"]));
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const depreciationMethod = await api.handle({
    method: "POST",
    path: "/depreciation-methods",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-method" },
    body: {
      accountSetId: accountSet.body.id,
      code: "SL",
      name: "Straight line",
      methodType: "straight_line",
      createdBy: actorId
    }
  });
  const category = await api.handle({
    method: "POST",
    path: "/asset-categories",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-category" },
    body: {
      accountSetId: accountSet.body.id,
      code: "MACHINE",
      name: "Production machinery",
      depreciationMethodId: depreciationMethod.body.id,
      defaultUsefulLifeMonths: 60,
      defaultSalvageRate: 0.05,
      assetAccountCode: "1601",
      accumulatedDepreciationAccountCode: "1602",
      depreciationExpenseAccountCode: "5101",
      createdBy: actorId
    }
  });
  const fixedAsset = await api.handle({
    method: "POST",
    path: "/fixed-assets",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-card" },
    body: {
      accountSetId: accountSet.body.id,
      assetNo: "FA-2026-001",
      name: "CNC machine",
      categoryId: category.body.id,
      depreciationMethodId: depreciationMethod.body.id,
      acquisitionType: "purchase",
      acquisitionDate: "2026-01-15",
      originalValue: 120000,
      salvageValue: 6000,
      usefulLifeMonths: 60,
      departmentId: "D-MFG",
      departmentName: "Manufacturing",
      responsiblePerson: "Zhao",
      createdBy: actorId
    }
  });
  const transfer = await api.handle({
    method: "POST",
    path: "/asset-transfers",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-transfer" },
    body: {
      accountSetId: accountSet.body.id,
      fixedAssetId: fixedAsset.body.id,
      transferDate: "2026-02-15",
      fromDepartmentId: "D-MFG",
      fromDepartmentName: "Manufacturing",
      toDepartmentId: "D-QA",
      toDepartmentName: "Quality Assurance",
      responsiblePerson: "Qian",
      createdBy: actorId
    }
  });
  const valueChange = await api.handle({
    method: "POST",
    path: "/asset-value-changes",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-value-change" },
    body: {
      accountSetId: accountSet.body.id,
      fixedAssetId: fixedAsset.body.id,
      changeDate: "2026-02-20",
      changeType: "improvement",
      amount: 10000,
      reason: "Capitalized improvement",
      createdBy: actorId
    }
  });
  const assets = await api.handle({
    method: "GET",
    path: `/fixed-assets?accountSetId=${accountSet.body.id}`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(depreciationMethod.status, 201);
  assert.equal(category.status, 201);
  assert.equal(fixedAsset.status, 201);
  assert.equal(fixedAsset.body.serviceStartYear, 2026);
  assert.equal(fixedAsset.body.serviceStartPeriod, 2);
  assert.equal(fixedAsset.body.depreciationTimelineRule, "new_asset_next_month");
  assert.equal(fixedAsset.body.netValue, 120000);
  assert.equal(transfer.status, 201);
  assert.equal(transfer.body.depreciationDepartmentRule, "month_end_department");
  assert.equal(transfer.body.fixedAsset.currentDepartmentId, "D-QA");
  assert.equal(transfer.body.fixedAsset.lastTransferAt, "2026-02-15");
  assert.equal(valueChange.status, 201);
  assert.equal(valueChange.body.fixedAsset.originalValue, 130000);
  assert.equal(valueChange.body.fixedAsset.netValue, 130000);
  assert.deepEqual(
    assets.body.map((asset) => ({
      assetNo: asset.assetNo,
      currentDepartmentId: asset.currentDepartmentId,
      serviceStartPeriod: asset.serviceStartPeriod,
      depreciationDepartmentRule: asset.depreciationDepartmentRule
    })),
    [{ assetNo: "FA-2026-001", currentDepartmentId: "D-QA", serviceStartPeriod: 2, depreciationDepartmentRule: "month_end_department" }]
  );
  assert.ok(api.state.auditLogs.some((log) => log.action === "fixed_asset.create" && log.objectId === fixedAsset.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "asset_transfer.create" && log.objectId === transfer.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "asset_value_change.create" && log.objectId === valueChange.body.id));
});

test("Phase 4 depreciation engine dry-runs timelines, applies net-value brake, locks cost pools", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P4-DEP",
      name: "Phase 4 Depreciation Set",
      companyName: "Phase 4 Depreciation Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase4-depreciation-account-set"
  );
  const actorId = "phase4-depreciation-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set([
      "fixed_asset_setup.manage",
      "fixed_asset_card.manage",
      "fixed_asset_transfer.manage",
      "fixed_asset_depreciation.manage",
      "fixed_asset_depreciation_pool.view"
    ])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const method = await api.handle({
    method: "POST",
    path: "/depreciation-methods",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-method" },
    body: { accountSetId: accountSet.body.id, code: "SL", name: "Straight line", methodType: "straight_line", createdBy: actorId }
  });
  const category = await api.handle({
    method: "POST",
    path: "/asset-categories",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-category" },
    body: { accountSetId: accountSet.body.id, code: "MACHINE", name: "Machine", depreciationMethodId: method.body.id, defaultUsefulLifeMonths: 60, defaultSalvageRate: 0.05, createdBy: actorId }
  });
  const newAsset = await api.handle({
    method: "POST",
    path: "/fixed-assets",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-new-asset" },
    body: {
      accountSetId: accountSet.body.id,
      assetNo: "FA-DEP-NEW",
      name: "New CNC",
      categoryId: category.body.id,
      depreciationMethodId: method.body.id,
      acquisitionDate: "2026-01-15",
      originalValue: 120000,
      salvageValue: 6000,
      usefulLifeMonths: 60,
      departmentId: "D-MFG",
      departmentName: "Manufacturing",
      createdBy: actorId
    }
  });
  const brakeAsset = await api.handle({
    method: "POST",
    path: "/fixed-assets",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-brake-asset" },
    body: {
      accountSetId: accountSet.body.id,
      assetNo: "FA-DEP-BRAKE",
      name: "Nearly fully depreciated press",
      categoryId: category.body.id,
      depreciationMethodId: method.body.id,
      acquisitionDate: "2025-12-15",
      originalValue: 10000,
      accumulatedDepreciation: 8900,
      salvageValue: 1000,
      usefulLifeMonths: 60,
      departmentId: "D-MFG",
      departmentName: "Manufacturing",
      createdBy: actorId
    }
  });
  await api.handle({
    method: "POST",
    path: "/asset-transfers",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-transfer" },
    body: { accountSetId: accountSet.body.id, fixedAssetId: newAsset.body.id, transferDate: "2026-02-15", toDepartmentId: "D-QA", toDepartmentName: "Quality Assurance", createdBy: actorId }
  });

  const januaryDryRun = await api.handle({
    method: "POST",
    path: "/depreciation-runs/dry-run",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-dry-jan" },
    body: { accountSetId: accountSet.body.id, runNo: "DEP-202601-DRY", fiscalYear: 2026, periodNo: 1, createdBy: actorId }
  });
  const februaryDryRun = await api.handle({
    method: "POST",
    path: "/depreciation-runs/dry-run",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-dry-feb" },
    body: { accountSetId: accountSet.body.id, runNo: "DEP-202602-DRY", fiscalYear: 2026, periodNo: 2, createdBy: actorId }
  });
  const formalRun = await api.handle({
    method: "POST",
    path: "/depreciation-runs",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-run-jan" },
    body: { accountSetId: accountSet.body.id, runNo: "DEP-202601", fiscalYear: 2026, periodNo: 1, createdBy: actorId }
  });
  const approved = await api.handle({
    method: "POST",
    path: `/depreciation-runs/${formalRun.body.id}/approve`,
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-approve" },
    body: { approvedBy: actorId }
  });
  const locked = await api.handle({
    method: "POST",
    path: `/depreciation-runs/${formalRun.body.id}/lock`,
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-dep-lock" },
    body: { lockedBy: actorId }
  });
  const costPools = await api.handle({
    method: "GET",
    path: `/asset-depreciation-cost-pools?accountSetId=${accountSet.body.id}&fiscalYear=2026&periodNo=1`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(januaryDryRun.status, 201);
  assert.equal(januaryDryRun.body.dryRun, true);
  assert.equal(januaryDryRun.body.lines.find((line) => line.fixedAssetId === newAsset.body.id).depreciationAmount, 0);
  assert.equal(januaryDryRun.body.lines.find((line) => line.fixedAssetId === newAsset.body.id).skippedReason, "NEW_ASSET_NOT_STARTED");
  assert.equal(februaryDryRun.status, 201);
  assert.equal(februaryDryRun.body.lines.find((line) => line.fixedAssetId === newAsset.body.id).depreciationAmount, 1900);
  assert.equal(februaryDryRun.body.lines.find((line) => line.fixedAssetId === newAsset.body.id).departmentId, "D-QA");
  assert.equal(februaryDryRun.body.lines.find((line) => line.fixedAssetId === newAsset.body.id).depreciationDepartmentRule, "month_end_department");
  assert.equal(formalRun.status, 201);
  assert.equal(formalRun.body.dryRun, false);
  assert.equal(formalRun.body.lines.find((line) => line.fixedAssetId === brakeAsset.body.id).depreciationAmount, 100);
  assert.equal(formalRun.body.lines.find((line) => line.fixedAssetId === brakeAsset.body.id).brakeApplied, true);
  assert.equal(formalRun.body.lines.find((line) => line.fixedAssetId === brakeAsset.body.id).netValueAfter, 1000);
  assert.equal(api.state.fixedAssets.get(brakeAsset.body.id).isDepreciationStopped, true);
  assert.equal(api.state.fixedAssets.get(brakeAsset.body.id).netValue, 1000);
  assert.equal(approved.body.status, "approved");
  assert.equal(locked.body.status, "locked");
  assert.equal(costPools.status, 200);
  assert.deepEqual(
    costPools.body.map((pool) => ({
      sourceRunId: pool.sourceRunId,
      fixedAssetId: pool.fixedAssetId,
      departmentId: pool.departmentId,
      costType: pool.costType,
      amount: pool.amount,
      lockedAt: pool.lockedAt
    })),
    [{ sourceRunId: formalRun.body.id, fixedAssetId: brakeAsset.body.id, departmentId: "D-MFG", costType: "fixed_asset_depreciation", amount: 100, lockedAt: "now" }]
  );
  assert.ok(api.state.auditLogs.some((log) => log.action === "depreciation_run.create" && log.objectId === formalRun.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "depreciation_run.lock" && log.objectId === formalRun.body.id));
});

test("Phase 4 fixed asset final workflow disposes assets, counts variances, and reconciles the asset ledger", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P4-FA-FINAL",
      name: "Phase 4 Fixed Asset Final Set",
      companyName: "Phase 4 Fixed Asset Final Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase4-fixed-asset-final-account-set"
  );
  const actorId = "phase4-fixed-asset-final-actor";
  api.state.permissionsByActor.set(
    actorId,
    new Set([
      "fixed_asset_setup.manage",
      "fixed_asset_card.manage",
      "fixed_asset_disposal.manage",
      "fixed_asset_count.manage",
      "fixed_asset_depreciation.manage",
      "fixed_asset_reconciliation.view"
    ])
  );
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));

  const method = await api.handle({
    method: "POST",
    path: "/depreciation-methods",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-method" },
    body: { accountSetId: accountSet.body.id, code: "SL", name: "Straight line", methodType: "straight_line", createdBy: actorId }
  });
  const category = await api.handle({
    method: "POST",
    path: "/asset-categories",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-category" },
    body: { accountSetId: accountSet.body.id, code: "MACHINE", name: "Machine", depreciationMethodId: method.body.id, defaultUsefulLifeMonths: 12, defaultSalvageRate: 0, createdBy: actorId }
  });
  const asset = await api.handle({
    method: "POST",
    path: "/fixed-assets",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-asset" },
    body: {
      accountSetId: accountSet.body.id,
      assetNo: "FA-FINAL-001",
      name: "Packing machine",
      categoryId: category.body.id,
      depreciationMethodId: method.body.id,
      acquisitionDate: "2025-12-15",
      originalValue: 12000,
      salvageValue: 0,
      usefulLifeMonths: 12,
      departmentId: "D-MFG",
      departmentName: "Manufacturing",
      createdBy: actorId
    }
  });
  const disposal = await api.handle({
    method: "POST",
    path: "/asset-disposals",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-disposal" },
    body: {
      accountSetId: accountSet.body.id,
      fixedAssetId: asset.body.id,
      disposalDate: "2026-01-20",
      disposalType: "sale",
      proceedsAmount: 4500,
      clearingAccountCode: "1606",
      gainLossAccountCode: "6711",
      createdBy: actorId
    }
  });
  const januaryDryRun = await api.handle({
    method: "POST",
    path: "/depreciation-runs/dry-run",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-dep-jan" },
    body: { accountSetId: accountSet.body.id, runNo: "DEP-FINAL-202601", fiscalYear: 2026, periodNo: 1, createdBy: actorId }
  });
  const februaryDryRun = await api.handle({
    method: "POST",
    path: "/depreciation-runs/dry-run",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-dep-feb" },
    body: { accountSetId: accountSet.body.id, runNo: "DEP-FINAL-202602", fiscalYear: 2026, periodNo: 2, createdBy: actorId }
  });
  const countPreview = await api.handle({
    method: "POST",
    path: "/asset-counts/preview",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-count-preview" },
    body: {
      accountSetId: accountSet.body.id,
      countNo: "FACOUNT-202601",
      fiscalYear: 2026,
      periodNo: 1,
      countDate: "2026-01-31",
      createdBy: actorId,
      lines: [
        { fixedAssetId: asset.body.id, actualStatus: "missing", remark: "Not found during count" },
        { assetNo: "FA-SURPLUS-001", assetName: "Found tooling", actualStatus: "surplus", estimatedValue: 2500, departmentId: "D-MFG", departmentName: "Manufacturing" }
      ]
    }
  });
  const count = await api.handle({
    method: "POST",
    path: "/asset-counts",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-fa-final-count" },
    body: {
      accountSetId: accountSet.body.id,
      countNo: "FACOUNT-202601",
      fiscalYear: 2026,
      periodNo: 1,
      countDate: "2026-01-31",
      createdBy: actorId,
      lines: countPreview.body.lines
    }
  });
  const ledger = await api.handle({
    method: "GET",
    path: `/fixed-asset-ledger?accountSetId=${accountSet.body.id}&fiscalYear=2026&periodNo=1`,
    headers: { "Actor-Id": actorId }
  });
  const reconciliation = await api.handle({
    method: "GET",
    path: `/fixed-asset-reconciliation?accountSetId=${accountSet.body.id}&fiscalYear=2026&periodNo=1`,
    headers: { "Actor-Id": actorId }
  });

  assert.equal(disposal.status, 201);
  assert.equal(disposal.body.status, "draft");
  assert.equal(disposal.body.voucherDraft.sourceType, "phase4_asset_disposal");
  assert.equal(disposal.body.voucherDraft.approvalRequired, true);
  assert.equal(disposal.body.fixedAsset.usageStatus, "disposed");
  assert.equal(disposal.body.fixedAsset.disposalDate, "2026-01-20");
  assert.equal(disposal.body.fixedAsset.depreciationStopYear, 2026);
  assert.equal(disposal.body.fixedAsset.depreciationStopPeriod, 2);
  assert.equal(januaryDryRun.body.lines.find((line) => line.fixedAssetId === asset.body.id).depreciationAmount, 1000);
  assert.equal(februaryDryRun.body.lines.find((line) => line.fixedAssetId === asset.body.id).depreciationAmount, 0);
  assert.equal(februaryDryRun.body.lines.find((line) => line.fixedAssetId === asset.body.id).skippedReason, "DISPOSED_BEFORE_PERIOD");
  assert.equal(countPreview.status, 201);
  assert.equal(countPreview.body.dryRun, true);
  assert.deepEqual(countPreview.body.lines.map((line) => line.varianceType), ["inventory_loss", "inventory_surplus"]);
  assert.equal(countPreview.body.voucherDraft.sourceType, "phase4_asset_count");
  assert.equal(count.status, 201);
  assert.equal(count.body.status, "counted");
  assert.equal(ledger.status, 200);
  assert.deepEqual(ledger.body.map((entry) => entry.sourceType), ["fixed_asset_addition", "asset_disposal", "asset_count", "asset_count"]);
  assert.equal(reconciliation.status, 200);
  assert.equal(reconciliation.body.ledgerNetValue, reconciliation.body.glNetValue);
  assert.equal(reconciliation.body.differenceAmount, 0);
  assert.ok(api.state.auditLogs.some((log) => log.action === "asset_disposal.create" && log.objectId === disposal.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "asset_count.create" && log.objectId === count.body.id));
});

test("Phase 4 month-end integration consumes locked payroll and depreciation cost pools without mock warnings", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P4-E2E",
      name: "Phase 4 End To End Set",
      companyName: "Phase 4 E2E Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase4-e2e-account-set"
  );
  const actorId = "phase4-e2e-actor";
  api.state.permissionsByActor.set(actorId, new Set(["cost_allocation.manage", "cost_voucher.manage"]));
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));
  api.state.workOrders.set("work-order:p4-e2e", {
    id: "work-order:p4-e2e",
    accountSetId: accountSet.body.id,
    workOrderNo: "WO-P4-E2E",
    status: "closed",
    fiscalYear: 2026,
    periodNo: 1,
    directMaterialCost: 3000,
    completedQuantity: 10
  });
  api.state.payrollCostPools.set("payroll-cost-pool:p4-e2e", {
    id: "payroll-cost-pool:p4-e2e",
    accountSetId: accountSet.body.id,
    sourceRunId: "payroll-run:p4-e2e",
    fiscalYear: 2026,
    periodNo: 1,
    departmentId: "D-MFG",
    workOrderId: "work-order:p4-e2e",
    costType: "direct_labor",
    amount: 1400,
    lockedAt: "now"
  });
  api.state.assetDepreciationCostPools.set("asset-depreciation-cost-pool:p4-e2e", {
    id: "asset-depreciation-cost-pool:p4-e2e",
    accountSetId: accountSet.body.id,
    sourceRunId: "depreciation-run:p4-e2e",
    fixedAssetId: "fixed-asset:p4-e2e",
    fiscalYear: 2026,
    periodNo: 1,
    departmentId: "D-MFG",
    costType: "fixed_asset_depreciation",
    amount: 600,
    lockedAt: "now"
  });

  const dryRun = await api.handle({
    method: "POST",
    path: "/cost-allocations/dry-run",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-e2e-allocation-preview" },
    body: {
      accountSetId: accountSet.body.id,
      workOrderId: "work-order:p4-e2e",
      fiscalYear: 2026,
      periodNo: 1,
      phase4CostPoolIds: ["payroll-cost-pool:p4-e2e", "asset-depreciation-cost-pool:p4-e2e"],
      createdBy: actorId
    }
  });
  const allocation = await api.handle({
    method: "POST",
    path: "/cost-allocations",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-e2e-allocation" },
    body: {
      accountSetId: accountSet.body.id,
      workOrderId: "work-order:p4-e2e",
      fiscalYear: 2026,
      periodNo: 1,
      phase4CostPoolIds: ["payroll-cost-pool:p4-e2e", "asset-depreciation-cost-pool:p4-e2e"],
      createdBy: actorId
    }
  });
  const draft = await api.handle({
    method: "POST",
    path: "/cost-voucher-drafts",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase4-e2e-draft" },
    body: { accountSetId: accountSet.body.id, costAllocationId: allocation.body.id, fiscalYear: 2026, periodNo: 1, createdBy: actorId }
  });

  assert.equal(dryRun.status, 201);
  assert.equal(dryRun.body.totalAllocatedAmount, 2000);
  assert.deepEqual(dryRun.body.warningCodes, []);
  assert.deepEqual(dryRun.body.lines.map((line) => ({ sourceType: line.sourceType, costType: line.costType, amount: line.allocatedAmount })), [
    { sourceType: "phase4_payroll_cost_pool", costType: "direct_labor", amount: 1400 },
    { sourceType: "phase4_depreciation_cost_pool", costType: "fixed_asset_depreciation", amount: 600 }
  ]);
  assert.equal(allocation.status, 201);
  assert.equal(allocation.body.totalAllocatedAmount, 2000);
  assert.deepEqual(allocation.body.warningCodes, []);
  assert.equal(draft.status, 201);
  assert.equal(draft.body.totalAmount, 5000);
  assert.deepEqual(draft.body.warningCodes, []);
  assert.notDeepEqual(draft.body.warningCodes, ["PHASE4_SOURCE_MISSING"]);
});

test("API can persist account sets and scoped grants through platform store", async () => {
  let storedRole = null;
  let storedUser = null;
  let storedAccountSet = null;
  let storedGrant = null;
  const platformStore = {
    listPermissions: async () => [
      { code: "account_set.create", description: "account_set.create" },
      { code: "account_set.view", description: "account_set.view" },
      { code: "account_set_user.manage", description: "account_set_user.manage" }
    ],
    listRoles: async () => (storedRole ? [storedRole] : []),
    createRole: async (role) => {
      storedRole = { id: "persisted-role:viewer", ...role };
      return storedRole;
    },
    listUsers: async () => (storedUser ? [storedUser] : []),
    createUser: async (user) => {
      storedUser = {
        id: "persisted-user:viewer",
        username: user.username,
        name: user.name,
        roleId: user.roleId,
        role: storedRole.name,
        passwordHash: user.passwordHash
      };
      return { ...storedUser, passwordHash: undefined };
    },
    findUserIdentity: async (username) =>
      username === storedUser?.username
        ? { user: storedUser, permissionCodes: storedRole.permissionCodes }
        : null,
    createAccountSet: async (accountSet) => {
      storedAccountSet = { ...accountSet };
      return storedAccountSet;
    },
    listAccessibleAccountSets: async (actorId) =>
      storedGrant?.actorId === actorId ? [storedAccountSet] : [],
    listAccountSetUsers: async (accountSetId) =>
      storedGrant?.accountSetId === accountSetId ? [storedGrant] : [],
    grantAccountSetUser: async (grant) => {
      storedGrant = {
        id: "persisted-grant:1",
        accountSetId: grant.accountSetId,
        actorId: grant.actorId,
        grantedBy: grant.grantedBy
      };
      return storedGrant;
    },
    canAccessAccountSet: async (actorId, accountSetId) =>
      storedGrant?.actorId === actorId && storedGrant?.accountSetId === accountSetId
  };
  const api = createApi({ platformStore });

  const role = await request(
    api,
    "POST",
    "/roles",
    {
      name: "Persisted Scoped Viewer",
      permissionCodes: ["account_set.view"]
    },
    "persisted-scope-role"
  );
  const user = await request(
    api,
    "POST",
    "/users",
    {
      username: "persisted-scoped-viewer",
      password: "viewer-password",
      name: "Persisted Scoped Viewer",
      roleId: role.body.id
    },
    "persisted-scope-user"
  );
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "PS001",
      name: "Persisted Scoped Account Set",
      companyName: "Persisted Scoped Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "persisted-scope-account-set"
  );
  const beforeGrant = await api.handle({
    method: "GET",
    path: "/account-sets",
    headers: { "Actor-Id": user.body.id }
  });
  const grant = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/users`,
    {
      actorId: user.body.id,
      grantedBy: "system"
    },
    "persisted-scope-grant"
  );
  const afterGrant = await api.handle({
    method: "GET",
    path: "/account-sets",
    headers: { "Actor-Id": user.body.id }
  });
  const persistedUsers = await api.handle({
    method: "GET",
    path: `/account-sets/${accountSet.body.id}/users`,
    headers: {}
  });

  assert.equal(accountSet.status, 201);
  assert.equal(storedAccountSet.id, accountSet.body.id);
  assert.deepEqual(beforeGrant.body, []);
  assert.equal(grant.status, 201);
  assert.equal(storedGrant.actorId, user.body.id);
  assert.deepEqual(afterGrant.body.map((item) => item.id), [accountSet.body.id]);
  assert.deepEqual(persistedUsers.body.map((item) => item.actorId), [user.body.id]);
});

test("persisted account set grants work after runtime restart without in-memory account sets", async () => {
  const storedAccountSet = {
    id: "persisted-account-set:restart",
    code: "RST001",
    name: "Restart Persisted Account Set",
    companyName: "Restart Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    status: "enabled",
    createdBy: "system"
  };
  let storedGrant = null;
  const platformStore = {
    findAccountSet: async (identifier) =>
      identifier === storedAccountSet.id || identifier === storedAccountSet.code ? storedAccountSet : null,
    listAccessibleAccountSets: async (actorId) =>
      storedGrant?.actorId === actorId ? [storedAccountSet] : [],
    grantAccountSetUser: async (grant) => {
      storedGrant = {
        id: "persisted-grant:restart",
        accountSetId: grant.accountSetId,
        actorId: grant.actorId,
        grantedBy: grant.grantedBy
      };
      return storedGrant;
    },
    listAccountSetUsers: async (accountSetId) =>
      storedGrant?.accountSetId === accountSetId ? [storedGrant] : []
  };
  const api = createApi({ platformStore });

  const grant = await api.handle({
    method: "POST",
    path: `/account-sets/${storedAccountSet.id}/users`,
    headers: { "Actor-Id": "system", "Idempotency-Key": "restart-grant" },
    body: {
      actorId: "viewer",
      grantedBy: "system"
    }
  });
  const visible = await api.handle({
    method: "GET",
    path: "/account-sets",
    headers: { "Actor-Id": "viewer" }
  });

  assert.equal(grant.status, 201);
  assert.equal(grant.body.accountSetId, storedAccountSet.id);
  assert.deepEqual(visible.body.map((item) => item.id), [storedAccountSet.id]);
});

test("API persists account set enable and disable lifecycle through platform store", async () => {
  let storedAccountSet = null;
  const platformStore = {
    createAccountSet: async (accountSet) => {
      storedAccountSet = { ...accountSet };
      return storedAccountSet;
    },
    listAccountSets: async () => (storedAccountSet ? [storedAccountSet] : []),
    listAccessibleAccountSets: async () => (storedAccountSet ? [storedAccountSet] : []),
    findAccountSet: async (identifier) =>
      storedAccountSet && (storedAccountSet.id === identifier || storedAccountSet.code === identifier) ? storedAccountSet : null,
    updateAccountSet: async (accountSet) => {
      storedAccountSet = { ...accountSet };
      return storedAccountSet;
    }
  };
  const api = createApi({ platformStore });

  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "PL001",
      name: "Persisted Lifecycle Account Set",
      companyName: "Persisted Lifecycle Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "persisted-lifecycle-account-set"
  );
  const enabled = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/enable`,
    { enabledBy: "system" },
    "persisted-lifecycle-enable"
  );
  const listedAfterEnable = await request(api, "GET", "/account-sets", null, null);
  const disabled = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/disable`,
    { disabledBy: "system" },
    "persisted-lifecycle-disable"
  );

  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.status, "enabled");
  assert.equal(listedAfterEnable.body[0].status, "enabled");
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.status, "disabled");
  assert.equal(storedAccountSet.status, "disabled");
});

test("API can persist generated accounting periods through platform store", async () => {
  let storedAccountSet = null;
  let storedPeriods = [];
  const platformStore = {
    createAccountSet: async (accountSet) => {
      storedAccountSet = { ...accountSet };
      return storedAccountSet;
    },
    listAccountSets: async () => (storedAccountSet ? [storedAccountSet] : []),
    listAccessibleAccountSets: async () => [],
    saveAccountingPeriods: async (periods) => {
      storedPeriods = periods.map((period) => ({ ...period }));
      return storedPeriods;
    },
    listAccountingPeriods: async () => storedPeriods
  };
  const api = createApi({ platformStore });

  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "PP001",
      name: "Persisted Period Account Set",
      companyName: "Persisted Period Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 3
    },
    "persisted-period-account-set"
  );
  const generated = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/periods/generate`,
    {},
    "persisted-period-generate"
  );
  const listed = await request(api, "GET", "/periods", null, null);

  assert.equal(generated.status, 201);
  assert.equal(storedPeriods.length, 12);
  assert.equal(storedPeriods.find((period) => period.periodNo === 3).isCurrent, true);
  assert.deepEqual(listed.body.map((period) => period.periodNo), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("API uses persisted accounting periods for voucher period validation", async () => {
  const storedAccounts = new Map();
  const storedVouchers = new Map();
  const storedPeriods = [
    {
      id: "account-set:persisted-open-period:period:2026:6",
      accountSetId: "account-set:persisted-open-period",
      fiscalYear: 2026,
      periodNo: 6,
      status: "open",
      isCurrent: true
    }
  ];
  const platformStore = {
    canAccessAccountSet: async () => true,
    createAccount: async (account) => {
      const stored = { ...account, accountSetId: account.accountSetId };
      storedAccounts.set(stored.code, stored);
      return stored;
    },
    listAccounts: async () => [...storedAccounts.values()],
    listAccountingPeriods: async () => storedPeriods,
    createVoucher: async (voucher) => {
      const stored = { ...voucher, voucherNo: voucher.voucherNo ?? voucher.id, lines: voucher.lines.map((line) => ({ ...line })) };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    listVouchers: async () => [...storedVouchers.values()]
  };
  const api = createApi({ platformStore });

  await request(api, "POST", "/accounts", {
    accountSetId: "account-set:persisted-open-period",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit"
  }, "persisted-period-bank");
  await request(api, "POST", "/accounts", {
    accountSetId: "account-set:persisted-open-period",
    code: "6602",
    name: "Office Expense",
    accountType: "expense",
    normalBalance: "debit"
  }, "persisted-period-expense");

  const created = await request(api, "POST", "/vouchers", {
    accountSetId: "account-set:persisted-open-period",
    fiscalYear: 2026,
    periodNo: 6,
    voucherDate: "2026-06-08",
    createdBy: "maker",
    lines: [
      { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
      { summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500 }
    ]
  }, "persisted-period-voucher");

  assert.equal(created.status, 201);
  assert.equal(created.body.periodNo, 6);
});

test("API can persist chart of accounts through platform store", async () => {
  let storedAccount = null;
  const platformStore = {
    createAccount: async (account) => {
      storedAccount = { ...account, accountSetId: account.accountSetId };
      return storedAccount;
    },
    listAccounts: async () => (storedAccount ? [storedAccount] : [])
  };
  const api = createApi({ platformStore });

  const created = await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:persisted-accounts",
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "persisted-account-create"
  );
  const listed = await request(api, "GET", "/accounts", null, null);

  assert.equal(created.status, 201);
  assert.equal(storedAccount.accountSetId, "account-set:persisted-accounts");
  assert.equal(storedAccount.code, "1002");
  assert.deepEqual(listed.body.map((account) => account.code), ["1002"]);
});

test("persisted chart accounts can configure auxiliary requirements by code", async () => {
  const persistedAccount = {
    id: "account:persisted-bank",
    accountSetId: "account-set:persisted",
    code: "1002",
    name: "银行存款",
    accountType: "asset",
    normalBalance: "debit",
    isLeaf: true,
    allowManualEntry: true,
    requiredAuxiliaries: []
  };
  const savedRequirements = [];
  const platformStore = {
    findAccount: async (identifier) => (identifier === persistedAccount.code || identifier === persistedAccount.id ? persistedAccount : null),
    saveAccountAuxiliaryRequirement: async (requirement) => {
      savedRequirements.push(requirement);
      return requirement;
    },
    listAccountAuxiliaryRequirements: async (accountId) =>
      savedRequirements.filter((requirement) => requirement.accountId === accountId)
  };
  const api = createApi({ platformStore });
  api.state.auxiliaryTypes.set("auxiliary-type:department", {
    id: "auxiliary-type:department",
    accountSetId: "account-set:persisted",
    code: "department",
    name: "部门",
    category: "department",
    isEnabled: true
  });

  const saved = await request(
    api,
    "POST",
    "/accounts/1002/auxiliary-requirements",
    {
      auxiliaryTypeId: "auxiliary-type:department",
      required: true,
      configuredBy: "system"
    },
    "persisted-account-auxiliary-requirement"
  );
  const listed = await request(api, "GET", "/accounts/1002/auxiliary-requirements", null, null);

  assert.equal(saved.status, 201);
  assert.equal(saved.body.accountCode, "1002");
  assert.equal(saved.body.accountId, "account:persisted-bank");
  assert.deepEqual(api.state.accounts.get("1002").requiredAuxiliaries, ["department"]);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
});

test("API can persist auxiliary accounting master data through platform store", async () => {
  const storedAccounts = new Map();
  const storedTypes = new Map();
  const storedItems = new Map();
  const calls = [];
  let storedRequirement = null;
  const platformStore = {
    createAccount: async (account) => {
      calls.push("createAccount");
      const stored = { ...account, accountSetId: account.accountSetId };
      storedAccounts.set(stored.code, stored);
      return stored;
    },
    listAccounts: async () => {
      calls.push("listAccounts");
      return [...storedAccounts.values()];
    },
    createAuxiliaryType: async (type) => {
      calls.push("createAuxiliaryType");
      storedTypes.set(type.id, { ...type });
      return storedTypes.get(type.id);
    },
    listAuxiliaryTypes: async () => {
      calls.push("listAuxiliaryTypes");
      return [...storedTypes.values()];
    },
    createAuxiliaryItem: async (item) => {
      calls.push("createAuxiliaryItem");
      const type = storedTypes.get(item.auxiliaryTypeId);
      storedItems.set(item.id, { ...item, auxiliaryTypeCode: type.code });
      return storedItems.get(item.id);
    },
    listAuxiliaryItems: async () => {
      calls.push("listAuxiliaryItems");
      return [...storedItems.values()];
    },
    saveAccountAuxiliaryRequirement: async (requirement) => {
      calls.push("saveAccountAuxiliaryRequirement");
      const account = [...storedAccounts.values()].find((candidate) => candidate.id === requirement.accountId);
      const type = storedTypes.get(requirement.auxiliaryTypeId);
      storedRequirement = {
        id: `account-auxiliary-requirement:${account.code}:${type.code}`,
        accountCode: account.code,
        accountId: account.id,
        auxiliaryTypeId: type.id,
        auxiliaryTypeCode: type.code,
        auxiliaryTypeName: type.name,
        required: requirement.required
      };
      return storedRequirement;
    },
    listAccountAuxiliaryRequirements: async () => {
      calls.push("listAccountAuxiliaryRequirements");
      return storedRequirement ? [storedRequirement] : [];
    }
  };
  const api = createApi({ platformStore });

  const account = await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:aux-api",
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    },
    "persisted-aux-account"
  );
  const type = await request(
    api,
    "POST",
    "/auxiliary-types",
    {
      accountSetId: "account-set:aux-api",
      code: "department",
      name: "Department"
    },
    "persisted-aux-type"
  );
  const item = await request(
    api,
    "POST",
    "/auxiliary-items",
    {
      accountSetId: "account-set:aux-api",
      auxiliaryTypeId: type.body.id,
      code: "D001",
      name: "Finance Department"
    },
    "persisted-aux-item"
  );
  const requirement = await request(
    api,
    "POST",
    `/accounts/${account.body.code}/auxiliary-requirements`,
    { auxiliaryTypeId: type.body.id, required: true },
    "persisted-aux-requirement"
  );
  const listedTypes = await request(api, "GET", "/auxiliary-types", null, null);
  const listedItems = await request(api, "GET", "/auxiliary-items", null, null);
  const listedRequirements = await request(api, "GET", `/accounts/${account.body.code}/auxiliary-requirements`, null, null);

  assert.equal(type.status, 201);
  assert.equal(item.body.auxiliaryTypeCode, "department");
  assert.equal(requirement.body.auxiliaryTypeCode, "department");
  assert.deepEqual(listedTypes.body.map((candidate) => candidate.code), ["department"]);
  assert.deepEqual(listedItems.body.map((candidate) => candidate.code), ["D001"]);
  assert.deepEqual(listedRequirements.body.map((candidate) => candidate.auxiliaryTypeCode), ["department"]);
  assert.deepEqual(calls, [
    "createAccount",
    "createAuxiliaryType",
    "createAuxiliaryItem",
    "saveAccountAuxiliaryRequirement",
    "listAuxiliaryTypes",
    "listAuxiliaryItems",
    "listAccountAuxiliaryRequirements"
  ]);
});

test("API can persist opening balances through platform store", async () => {
  const storedAccounts = new Map();
  const storedBalances = new Map();
  const calls = [];
  const platformStore = {
    createAccount: async (account) => {
      calls.push("createAccount");
      const stored = { ...account, accountSetId: account.accountSetId };
      storedAccounts.set(stored.code, stored);
      return stored;
    },
    listAccounts: async () => [...storedAccounts.values()],
    saveOpeningBalance: async (openingBalance) => {
      calls.push("saveOpeningBalance");
      const account = [...storedAccounts.values()].find((candidate) => candidate.id === openingBalance.accountId);
      const stored = {
        id: `opening-balance:${account.code}:${openingBalance.fiscalYear}:${openingBalance.periodNo}`,
        accountCode: account.code,
        accountName: account.name,
        normalBalance: account.normalBalance,
        fiscalYear: openingBalance.fiscalYear,
        periodNo: openingBalance.periodNo,
        openingDebit: openingBalance.openingDebit,
        openingCredit: openingBalance.openingCredit
      };
      storedBalances.set(`${account.code}:${openingBalance.fiscalYear}:${openingBalance.periodNo}`, stored);
      return stored;
    },
    listOpeningBalances: async () => {
      calls.push("listOpeningBalances");
      return [...storedBalances.values()];
    },
    getOpeningTrialBalance: async () => {
      calls.push("getOpeningTrialBalance");
      const rows = [...storedBalances.values()];
      const openingDebit = rows.reduce((sum, row) => sum + row.openingDebit, 0);
      const openingCredit = rows.reduce((sum, row) => sum + row.openingCredit, 0);
      return {
        rows,
        totals: {
          openingDebit,
          openingCredit,
          difference: openingDebit - openingCredit,
          isBalanced: openingDebit === openingCredit
        }
      };
    }
  };
  const api = createApi({ platformStore });

  const asset = await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:opening-api",
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "persisted-opening-asset"
  );
  const saved = await request(
    api,
    "POST",
    "/opening-balances",
    {
      accountCode: asset.body.code,
      fiscalYear: 2026,
      periodNo: 1,
      openingDebit: 1200,
      openingCredit: 0
    },
    "persisted-opening-save"
  );
  const listed = await request(api, "GET", "/opening-balances", null, null);
  const trialBalance = await request(api, "GET", "/opening-balances/trial-balance", null, null);

  assert.equal(saved.status, 201);
  assert.equal(saved.body.accountCode, "1002");
  assert.deepEqual(listed.body.map((row) => row.accountCode), ["1002"]);
  assert.equal(trialBalance.body.totals.difference, 1200);
  assert.deepEqual(calls, ["createAccount", "saveOpeningBalance", "listOpeningBalances", "getOpeningTrialBalance"]);
});

test("API can persist voucher drafts through platform store", async () => {
  const storedAccounts = new Map();
  const storedVouchers = new Map();
  const calls = [];
  const platformStore = {
    createAccount: async (account) => {
      const stored = { ...account, accountSetId: account.accountSetId };
      storedAccounts.set(stored.code, stored);
      return stored;
    },
    listAccounts: async () => [...storedAccounts.values()],
    createVoucher: async (voucher) => {
      calls.push("createVoucher");
      const stored = {
        ...voucher,
        voucherNo: voucher.id,
        lines: voucher.lines.map((line) => ({ ...line }))
      };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    listVouchers: async () => {
      calls.push("listVouchers");
      return [...storedVouchers.values()];
    }
  };
  const api = createApi({ platformStore });

  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:voucher-api",
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "persisted-voucher-bank"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:voucher-api",
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    },
    "persisted-voucher-expense"
  );
  api.state.permissionsByActor.set("maker", new Set(["voucher.create", "voucher.view"]));
  api.state.accountSetAccessByActor.set("maker", new Set(["account-set:voucher-api"]));
  api.state.periods.set("account-set:voucher-api:period:2026:1", {
    id: "account-set:voucher-api:period:2026:1",
    accountSetId: "account-set:voucher-api",
    fiscalYear: 2026,
    periodNo: 1,
    status: "open",
    isCurrent: true
  });

  const created = await api.handle({
    method: "POST",
    path: "/vouchers",
    headers: { "Actor-Id": "maker", "Idempotency-Key": "persisted-voucher-create" },
    body: {
      accountSetId: "account-set:voucher-api",
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "maker",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    }
  });
  const listed = await api.handle({
    method: "GET",
    path: "/vouchers",
    headers: { "Actor-Id": "maker" }
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.lines.length, 2);
  assert.equal(created.body.lines[0].accountCode, "6602");
  assert.deepEqual(listed.body.map((voucher) => voucher.id), [created.body.id]);
  assert.deepEqual(calls, ["listVouchers", "createVoucher", "listVouchers"]);
});

test("persisted voucher creation avoids id collisions after runtime restart", async () => {
  const accountSetId = "account-set:restart-voucher-id";
  const existingId = `voucher:${accountSetId}:2026:1:maker:1`;
  const storedVouchers = new Map([
    [
      existingId,
      {
        id: existingId,
        accountSetId,
        fiscalYear: 2026,
        periodNo: 1,
        voucherNo: "记-001",
        voucherDate: "2026-01-10",
        status: "posted",
        revision: 1,
        sourceType: "manual",
        attachmentCount: 0,
        createdBy: "maker",
        submittedBy: "maker",
        approvedBy: "auditor",
        postedBy: "poster",
        postedAt: "posted",
        lines: [
          { lineNo: 1, summary: "Old expense", accountCode: "6602", debit: 100, credit: 0, auxiliaries: {} },
          { lineNo: 2, summary: "Old payment", accountCode: "1002", debit: 0, credit: 100, auxiliaries: {} }
        ]
      }
    ]
  ]);
  const platformStore = {
    listVouchers: async () => [...storedVouchers.values()],
    createVoucher: async (voucher) => {
      if (storedVouchers.has(voucher.id)) {
        throw new Error("Duplicate voucher id.");
      }
      storedVouchers.set(voucher.id, voucher);
      return voucher;
    }
  };
  const api = createApi({ platformStore });
  api.state.permissionsByActor.set("maker", new Set(["voucher.create", "voucher.view"]));
  api.state.accountSetAccessByActor.set("maker", new Set([accountSetId]));
  api.state.periods.set(`${accountSetId}:period:2026:1`, {
    id: `${accountSetId}:period:2026:1`,
    accountSetId,
    fiscalYear: 2026,
    periodNo: 1,
    status: "open",
    isCurrent: true
  });

  const created = await api.handle({
    method: "POST",
    path: "/vouchers",
    headers: { "Actor-Id": "maker", "Idempotency-Key": "restart-voucher-id" },
    body: {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-11",
      createdBy: "maker",
      lines: [
        { summary: "New expense", accountCode: "6602", debit: 300, credit: 0 },
        { summary: "New payment", accountCode: "1002", debit: 0, credit: 300 }
      ]
    }
  });

  assert.equal(created.status, 201);
  assert.notEqual(created.body.id, existingId);
  assert.equal(created.body.voucherNo, "记-002");
  assert.equal(storedVouchers.has(created.body.id), true);
});

test("API can persist voucher status transitions through platform store", async () => {
  const storedAccounts = new Map();
  const storedVouchers = new Map();
  const calls = [];
  const platformStore = {
    createAccount: async (account) => {
      const stored = { ...account, accountSetId: account.accountSetId };
      storedAccounts.set(stored.code, stored);
      return stored;
    },
    listAccounts: async () => [...storedAccounts.values()],
    createVoucher: async (voucher) => {
      const stored = {
        ...voucher,
        voucherNo: voucher.id,
        lines: voucher.lines.map((line) => ({ ...line }))
      };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    listVouchers: async () => [...storedVouchers.values()],
    updateVoucherStatus: async (voucher) => {
      calls.push(`update:${voucher.status}`);
      const stored = { ...storedVouchers.get(voucher.id), ...voucher };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    createVoucherStatusLog: async (log) => {
      calls.push(`log:${log.action}:${log.toStatus}`);
      return log;
    }
  };
  const api = createApi({ platformStore });
  api.state.periods.set("period:voucher-status", {
    id: "period:voucher-status",
    accountSetId: "account-set:voucher-status-api",
    fiscalYear: 2026,
    periodNo: 1,
    status: "open",
    isCurrent: true
  });

  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:voucher-status-api",
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "persisted-status-bank"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:voucher-status-api",
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    },
    "persisted-status-expense"
  );
  const created = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: "account-set:voucher-status-api",
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "maker",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "persisted-status-voucher"
  );
  const submitted = await request(
    api,
    "POST",
    `/vouchers/${created.body.id}/submit`,
    { submittedBy: "maker" },
    "persisted-status-submit"
  );
  const approved = await request(
    api,
    "POST",
    `/vouchers/${created.body.id}/approve`,
    { approvedBy: "approver" },
    "persisted-status-approve"
  );

  assert.equal(submitted.body.status, "submitted");
  assert.equal(approved.body.status, "approved");
  assert.deepEqual(calls, [
    "update:submitted",
    "log:submit:submitted",
    "update:approved",
    "log:approve:approved"
  ]);
});

test("persisted voucher status log ids do not collide after runtime restart", async () => {
  const storedAccounts = new Map();
  const storedVouchers = new Map();
  const storedLogIds = new Set(["voucher-status-log:1"]);
  const platformStore = {
    createAccount: async (account) => {
      const stored = { ...account, accountSetId: account.accountSetId };
      storedAccounts.set(stored.code, stored);
      return stored;
    },
    listAccounts: async () => [...storedAccounts.values()],
    createVoucher: async (voucher) => {
      const stored = {
        ...voucher,
        voucherNo: voucher.id,
        lines: voucher.lines.map((line) => ({ ...line }))
      };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    listVouchers: async () => [...storedVouchers.values()],
    updateVoucherStatus: async (voucher) => {
      const stored = { ...storedVouchers.get(voucher.id), ...voucher };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    createVoucherStatusLog: async (log) => {
      if (storedLogIds.has(log.id)) {
        throw new Error(`Duplicate status log id: ${log.id}`);
      }
      storedLogIds.add(log.id);
      return log;
    }
  };
  const api = createApi({ platformStore });
  api.state.periods.set("period:status-log-restart", {
    id: "period:status-log-restart",
    accountSetId: "account-set:status-log-restart",
    fiscalYear: 2026,
    periodNo: 1,
    status: "open",
    isCurrent: true
  });

  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:status-log-restart",
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "status-log-restart-bank"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:status-log-restart",
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    },
    "status-log-restart-expense"
  );
  const created = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: "account-set:status-log-restart",
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "maker",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 200, credit: 0 },
        { summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 200 }
      ]
    },
    "status-log-restart-voucher"
  );
  api.state.voucherStatusLogs.length = 0;

  const submitted = await request(
    api,
    "POST",
    `/vouchers/${created.body.id}/submit`,
    { submittedBy: "maker" },
    "status-log-restart-submit"
  );

  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.status, "submitted");
  assert.equal(storedLogIds.has("voucher-status-log:1"), true);
  assert.equal(storedLogIds.size, 2);
});

test("API can persist posting journal entries and balances through platform store", async () => {
  const storedAccounts = new Map();
  const storedVouchers = new Map();
  let storedJournalEntries = [];
  let storedBalances = [];
  const calls = [];
  const platformStore = {
    createAccount: async (account) => {
      const stored = { ...account, accountSetId: account.accountSetId };
      storedAccounts.set(stored.code, stored);
      return stored;
    },
    listAccounts: async () => [...storedAccounts.values()],
    createVoucher: async (voucher) => {
      const stored = {
        ...voucher,
        voucherNo: voucher.id,
        lines: voucher.lines.map((line) => ({ ...line }))
      };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    listVouchers: async () => [...storedVouchers.values()],
    updateVoucherStatus: async (voucher) => {
      const stored = { ...storedVouchers.get(voucher.id), ...voucher };
      storedVouchers.set(stored.id, stored);
      return stored;
    },
    createVoucherStatusLog: async (log) => log,
    savePostingResult: async ({ journalEntries, balances }) => {
      calls.push("savePostingResult");
      storedJournalEntries = journalEntries.map((entry) => ({ ...entry }));
      storedBalances = balances.map((balance) => ({ ...balance }));
      return { journalEntries: storedJournalEntries, balances: storedBalances };
    },
    listJournalEntries: async () => {
      calls.push("listJournalEntries");
      return storedJournalEntries;
    },
    listAccountPeriodBalances: async () => {
      calls.push("listAccountPeriodBalances");
      return storedBalances;
    }
  };
  const api = createApi({ platformStore });
  api.state.periods.set("period:posting", {
    id: "period:posting",
    accountSetId: "account-set:posting-api",
    fiscalYear: 2026,
    periodNo: 1,
    status: "open",
    isCurrent: true
  });

  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:posting-api",
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "persisted-posting-bank"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: "account-set:posting-api",
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    },
    "persisted-posting-expense"
  );
  const created = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: "account-set:posting-api",
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "maker",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "persisted-posting-voucher"
  );
  await request(api, "POST", `/vouchers/${created.body.id}/submit`, { submittedBy: "maker" }, "persisted-posting-submit");
  await request(api, "POST", `/vouchers/${created.body.id}/approve`, { approvedBy: "approver" }, "persisted-posting-approve");
  const posted = await request(api, "POST", `/vouchers/${created.body.id}/post`, { postedBy: "poster" }, "persisted-posting-post");
  const detailLedger = await request(api, "GET", "/ledger/detail-ledger", null, null);
  const balances = await request(api, "GET", "/ledger/account-balances", null, null);
  const trialBalance = await request(api, "GET", "/ledger/trial-balance", null, null);

  assert.equal(posted.status, 200);
  assert.equal(posted.body.journalEntries.length, 2);
  assert.deepEqual(detailLedger.body.map((entry) => entry.accountCode), ["6602", "1002"]);
  assert.deepEqual(balances.body.map((balance) => balance.accountCode), ["6602", "1002"]);
  assert.deepEqual(trialBalance.body.totals, { debit: 500, credit: 500, difference: 0 });
  assert.deepEqual(calls, ["savePostingResult", "listJournalEntries", "listAccountPeriodBalances", "listAccountPeriodBalances"]);
});

test("auxiliary types, items, and account requirements can be configured", async () => {
  const api = createApi();

  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "014",
      name: "Auxiliary Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "aux-account-set"
  );
  const account = await request(
    api,
    "POST",
    "/accounts",
    { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit", isLeaf: true },
    "aux-account"
  );
  const type = await request(
    api,
    "POST",
    "/auxiliary-types",
    {
      accountSetId: accountSet.body.id,
      code: "department",
      name: "Department",
      category: "department",
      createdBy: "system"
    },
    "aux-type"
  );
  const item = await request(
    api,
    "POST",
    "/auxiliary-items",
    {
      accountSetId: accountSet.body.id,
      auxiliaryTypeId: type.body.id,
      code: "D001",
      name: "Finance Department",
      createdBy: "system"
    },
    "aux-item"
  );
  const requirement = await request(
    api,
    "POST",
    `/accounts/${account.body.code}/auxiliary-requirements`,
    {
      auxiliaryTypeId: type.body.id,
      required: true,
      configuredBy: "system"
    },
    "aux-requirement"
  );
  const requirements = await request(api, "GET", `/accounts/${account.body.code}/auxiliary-requirements`, null, null);
  const types = await request(api, "GET", "/auxiliary-types", null, null);
  const items = await request(api, "GET", "/auxiliary-items", null, null);
  const updatedItem = await request(api, "PATCH", `/auxiliary-items/${item.body.id}`, { name: "Finance Team" }, "aux-item-update");
  const deletedItem = await request(api, "DELETE", `/auxiliary-items/${item.body.id}`, { deletedBy: "system" }, "aux-item-delete");

  assert.equal(type.status, 201);
  assert.equal(item.status, 201);
  assert.equal(updatedItem.status, 200);
  assert.equal(updatedItem.body.name, "Finance Team");
  assert.equal(deletedItem.status, 200);
  assert.equal(deletedItem.body.isEnabled, false);
  assert.equal(requirement.status, 201);
  assert.equal(requirement.body.accountCode, "6602");
  assert.equal(requirements.body.length, 1);
  assert.equal(requirements.body[0].auxiliaryTypeCode, "department");
  assert.equal(types.body.length, 1);
  assert.equal(items.body[0].name, "Finance Department");
});

test("opening balances record debit and credit and expose trial balance difference", async () => {
  const api = createApi();

  const asset = await request(
    api,
    "POST",
    "/accounts",
    { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isLeaf: true },
    "opening-asset"
  );
  const equity = await request(
    api,
    "POST",
    "/accounts",
    { code: "3001", name: "Owner Equity", accountType: "equity", normalBalance: "credit", isLeaf: true },
    "opening-equity"
  );
  await request(
    api,
    "POST",
    "/opening-balances",
    {
      accountCode: asset.body.code,
      fiscalYear: 2026,
      periodNo: 1,
      openingDebit: 1000,
      openingCredit: 0,
      enteredBy: "system"
    },
    "opening-debit"
  );
  await request(
    api,
    "POST",
    "/opening-balances",
    {
      accountCode: equity.body.code,
      fiscalYear: 2026,
      periodNo: 1,
      openingDebit: 0,
      openingCredit: 1000,
      enteredBy: "system"
    },
    "opening-credit"
  );
  const balanced = await request(api, "GET", "/opening-balances/trial-balance", null, null);
  await request(
    api,
    "POST",
    "/opening-balances",
    {
      accountCode: equity.body.code,
      fiscalYear: 2026,
      periodNo: 1,
      openingDebit: 0,
      openingCredit: 900,
      enteredBy: "system"
    },
    "opening-credit-update"
  );
  const unbalanced = await request(api, "GET", "/opening-balances/trial-balance", null, null);

  assert.equal(balanced.status, 200);
  assert.deepEqual(balanced.body.totals, { openingDebit: 1000, openingCredit: 1000, difference: 0, isBalanced: true });
  assert.equal(unbalanced.body.totals.difference, 100);
  assert.equal(unbalanced.body.totals.isBalanced, false);
});

test("API runs Phase 1 account set to posting and trial balance flow", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "ais-erp-final-flow-"));
  const api = createApi({ attachmentStorageRoot: storageRoot });

  try {
    const accountSetResponse = await request(
      api,
      "POST",
      "/account-sets",
      {
        code: "001",
        name: "Demo Account Set",
        companyName: "Demo Technology Co., Ltd.",
        baseCurrency: "CNY",
        accountingStandard: "Small Business Accounting Standards",
        startYear: 2026,
        startPeriod: 1
      },
      "create-account-set"
    );

    assert.equal(accountSetResponse.status, 201);

    const accountSetId = accountSetResponse.body.id;
    const periodsResponse = await request(
      api,
      "POST",
      `/account-sets/${accountSetId}/periods/generate`,
      {},
      "generate-periods"
    );

    assert.equal(periodsResponse.status, 201);
    assert.equal(periodsResponse.body[0].status, "open");

    for (const [key, account] of [
      [
        "create-bank",
        {
          code: "1002",
          name: "Bank Deposits",
          accountType: "asset",
          normalBalance: "debit"
        }
      ],
      [
        "create-expense",
        {
          code: "6602",
          name: "Office Expense",
          accountType: "expense",
          normalBalance: "debit"
        }
      ]
    ]) {
      const response = await request(api, "POST", "/accounts", account, key);
      assert.equal(response.status, 201);
    }

    const voucherResponse = await request(
      api,
      "POST",
      "/vouchers",
      {
        accountSetId,
        fiscalYear: 2026,
        periodNo: 1,
        voucherDate: "2026-01-15",
        createdBy: "zhang-san",
        lines: [
          { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
          { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
        ]
      },
      "create-voucher"
    );

    assert.equal(voucherResponse.status, 201);

    const voucherId = voucherResponse.body.id;
    const invoiceContent = Buffer.from("invoice for office supplies 500", "utf8");
    const attachment = await request(
      api,
      "POST",
      "/attachments/upload",
      {
        accountSetId,
        filename: "invoice-2026-01.txt",
        contentType: "text/plain",
        byteSize: invoiceContent.length,
        contentBase64: invoiceContent.toString("base64"),
        uploadedBy: "zhang-san"
      },
      "final-flow-upload-invoice"
    );
    const attachmentLink = await request(
      api,
      "POST",
      "/attachment-links",
      {
        attachmentId: attachment.body.id,
        objectType: "voucher",
        objectId: voucherId,
        linkedBy: "zhang-san"
      },
      "final-flow-link-invoice"
    );
    const submitted = await request(api, "POST", `/vouchers/${voucherId}/submit`, { submittedBy: "zhang-san" }, "submit");
    const approved = await request(api, "POST", `/vouchers/${voucherId}/approve`, { approvedBy: "li-si" }, "approve");
    const posted = await request(api, "POST", `/vouchers/${voucherId}/post`, { postedBy: "wang-wu" }, "post");
    const duplicatePost = await request(api, "POST", `/vouchers/${voucherId}/post`, { postedBy: "zhao-liu" }, "post-duplicate");
    const generalLedger = await request(api, "GET", "/ledger/general-ledger", null, null);
    const detailLedger = await request(api, "GET", "/ledger/detail-ledger", null, null);
    const accountBalances = await request(api, "GET", "/ledger/account-balances", null, null);
    const trialBalance = await request(api, "GET", "/ledger/trial-balance", null, null);
    const voucherAttachments = await request(api, "GET", `/vouchers/${voucherId}/attachments`, null, null);
    const downloadedAttachment = await request(api, "GET", `/attachments/${attachment.body.id}/content`, null, null);
    const statusLogs = await request(api, "GET", `/vouchers/${voucherId}/status-logs`, null, null);

    assert.equal(attachment.status, 201);
    assert.equal(attachment.body.status, "available");
    assert.equal(attachmentLink.status, 201);
    assert.equal(submitted.body.status, "submitted");
    assert.equal(approved.body.status, "approved");
    assert.equal(posted.body.voucher.status, "posted");
    assert.equal(duplicatePost.status, 409);
    assert.equal(duplicatePost.body.code, "VOUCHER_ALREADY_POSTED");
    assert.equal(api.state.journalEntries.length, 2);
    assert.deepEqual(
      generalLedger.body.rows.map((row) => [row.accountCode, row.periodDebit, row.periodCredit, row.entries.length]),
      [
        ["6602", 500, 0, 1],
        ["1002", 0, 500, 1]
      ]
    );
    assert.deepEqual(
      detailLedger.body.map((entry) => [entry.voucherId, entry.accountCode, entry.debit, entry.credit]),
      [
        [voucherId, "6602", 500, 0],
        [voucherId, "1002", 0, 500]
      ]
    );
    assert.deepEqual(
      accountBalances.body.map((balance) => [balance.accountCode, balance.periodDebit, balance.periodCredit]),
      [
        ["6602", 500, 0],
        ["1002", 0, 500]
      ]
    );
    assert.deepEqual(trialBalance.body.totals, { debit: 500, credit: 500, difference: 0 });
    assert.equal(voucherAttachments.status, 200);
    assert.equal(voucherAttachments.body[0].id, attachment.body.id);
    assert.equal(downloadedAttachment.status, 200);
    assert.equal(Buffer.from(downloadedAttachment.body.contentBase64, "base64").toString("utf8"), invoiceContent.toString("utf8"));
    assert.deepEqual(
      statusLogs.body.map((log) => [log.action, log.fromStatus, log.toStatus, log.actorId]),
      [
        ["create", null, "draft", "zhang-san"],
        ["submit", "draft", "submitted", "zhang-san"],
        ["approve", "submitted", "approved", "li-si"],
        ["post", "approved", "posted", "wang-wu"]
      ]
    );
    assert.ok(api.state.auditLogs.some((log) => log.action === "attachment.link" && log.objectId === voucherId));
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("period close is blocked while vouchers remain unposted", async () => {
  const api = createApi();
  const accountSetResponse = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "002",
      name: "Close Check Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "close-account-set"
  );
  const periodsResponse = await request(
    api,
    "POST",
    `/account-sets/${accountSetResponse.body.id}/periods/generate`,
    {},
    "close-periods"
  );

  for (const [key, account] of [
    ["close-bank", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }],
    ["close-expense", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }]
  ]) {
    await request(api, "POST", "/accounts", account, key);
  }

  await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-20",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 300, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 300 }
      ]
    },
    "close-voucher"
  );

  const closeBlocked = await request(
    api,
    "POST",
    `/periods/${periodsResponse.body[0].id}/close`,
    { closedBy: "wang-wu" },
    "close-blocked"
  );

  assert.equal(closeBlocked.status, 409);
  assert.equal(closeBlocked.body.code, "PERIOD_CLOSE_BLOCKED");
  assert.match(closeBlocked.body.message, /unposted vouchers/);
});

test("closed and locked periods block voucher create and update mutations", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "035",
      name: "Period Mutation Lock Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "period-mutation-lock-account-set"
  );
  const periods = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/periods/generate`,
    {},
    "period-mutation-lock-periods"
  );
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "period-mutation-lock-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "period-mutation-lock-expense");

  const secondPeriod = periods.body.find((period) => period.periodNo === 2);
  const draft = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-25",
      createdBy: "zhang-san",
      lines: [
        { summary: "Open period office supplies", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "period-mutation-lock-draft"
  );
  await request(api, "POST", `/periods/${periods.body[0].id}/lock`, { lockedBy: "admin" }, "period-mutation-lock-lock");
  await request(api, "POST", `/periods/${secondPeriod.id}/open`, { openedBy: "admin" }, "period-mutation-lock-open-second");
  await request(api, "POST", `/periods/${secondPeriod.id}/close`, { closedBy: "admin" }, "period-mutation-lock-close-second");

  const updateLockedDraft = await request(
    api,
    "PATCH",
    `/vouchers/${draft.body.id}`,
    {
      voucherDate: "2026-01-26",
      updatedBy: "zhang-san",
      lines: [
        { summary: "Updated supplies in locked period", accountCode: "6602", debit: 120, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 120 }
      ]
    },
    "period-mutation-lock-update"
  );
  const createInClosedPeriod = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 2,
      voucherDate: "2026-02-01",
      createdBy: "zhang-san",
      lines: [
        { summary: "Closed period office supplies", accountCode: "6602", debit: 80, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 80 }
      ]
    },
    "period-mutation-lock-create-closed"
  );

  assert.equal(updateLockedDraft.status, 409);
  assert.equal(updateLockedDraft.body.code, "VOUCHER_PERIOD_CLOSED");
  assert.equal(createInClosedPeriod.status, 409);
  assert.equal(createInClosedPeriod.body.code, "VOUCHER_PERIOD_CLOSED");
  assert.equal(api.state.vouchers.get(draft.body.id).voucherDate, "2026-01-25");
});

test("successful write operations append audit logs", async () => {
  const api = createApi();

  await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "003",
      name: "Audit Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "audit-account-set"
  );

  const logs = await request(api, "GET", "/audit-logs", null, null);

  assert.equal(logs.status, 200);
  assert.equal(logs.body.length, 1);
  assert.equal(logs.body[0].action, "account_set.create");
  assert.equal(logs.body[0].actorId, "system");
});

test("period can close after all vouchers are posted", async () => {
  const api = createApi();

  const accountSetResponse = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "004",
      name: "Closable Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "closable-account-set"
  );
  const periodsResponse = await request(
    api,
    "POST",
    `/account-sets/${accountSetResponse.body.id}/periods/generate`,
    {},
    "closable-periods"
  );

  for (const [key, account] of [
    ["closable-bank", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }],
    ["closable-expense", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }]
  ]) {
    await request(api, "POST", "/accounts", account, key);
  }

  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-22",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 200, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 200 }
      ]
    },
    "closable-voucher"
  );

  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "closable-submit");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, "closable-approve");
  await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "wang-wu" }, "closable-post");

  const close = await request(
    api,
    "POST",
    `/periods/${periodsResponse.body[0].id}/close`,
    { closedBy: "wang-wu" },
    "closable-close"
  );

  assert.equal(close.status, 200);
  assert.equal(close.body.status, "closed");
  assert.equal(close.body.closedBy, "wang-wu");
});

test("period close can generate a profit and loss carry-forward voucher draft", async () => {
  const api = createApi();

  const accountSetResponse = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "013",
      name: "Profit Loss Close Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "pl-close-account-set"
  );
  const periodsResponse = await request(
    api,
    "POST",
    `/account-sets/${accountSetResponse.body.id}/periods/generate`,
    {},
    "pl-close-periods"
  );

  for (const [key, account] of [
    ["pl-close-bank", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isBank: true }],
    ["pl-close-revenue", { code: "6001", name: "Service Revenue", accountType: "revenue", normalBalance: "credit" }],
    ["pl-close-expense", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }],
    ["pl-close-profit", { code: "3103", name: "Current Year Profit", accountType: "equity", normalBalance: "credit" }]
  ]) {
    await request(api, "POST", "/accounts", account, key);
  }

  const revenueVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-10",
      createdBy: "zhang-san",
      lines: [
        { summary: "Receive service income", accountCode: "1002", debit: 800, credit: 0 },
        { summary: "Recognize service income", accountCode: "6001", debit: 0, credit: 800 }
      ]
    },
    "pl-close-revenue-voucher"
  );
  await request(api, "POST", `/vouchers/${revenueVoucher.body.id}/submit`, { submittedBy: "zhang-san" }, "pl-close-revenue-submit");
  await request(api, "POST", `/vouchers/${revenueVoucher.body.id}/approve`, { approvedBy: "li-si" }, "pl-close-revenue-approve");
  await request(api, "POST", `/vouchers/${revenueVoucher.body.id}/post`, { postedBy: "wang-wu" }, "pl-close-revenue-post");

  const expenseVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-20",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "pl-close-expense-voucher"
  );
  await request(api, "POST", `/vouchers/${expenseVoucher.body.id}/submit`, { submittedBy: "zhang-san" }, "pl-close-expense-submit");
  await request(api, "POST", `/vouchers/${expenseVoucher.body.id}/approve`, { approvedBy: "li-si" }, "pl-close-expense-approve");
  await request(api, "POST", `/vouchers/${expenseVoucher.body.id}/post`, { postedBy: "wang-wu" }, "pl-close-expense-post");

  const carryForward = await request(
    api,
    "POST",
    "/close/profit-loss-carry-forward",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-31",
      profitLossAccountCode: "3103",
      createdBy: "close-user"
    },
    "pl-close-generate"
  );
  const closeBlocked = await request(
    api,
    "POST",
    `/periods/${periodsResponse.body[0].id}/close`,
    { closedBy: "close-user" },
    "pl-close-blocked"
  );

  assert.equal(carryForward.status, 201);
  assert.equal(carryForward.body.status, "draft");
  assert.equal(carryForward.body.sourceType, "period_close");
  assert.deepEqual(
    carryForward.body.lines.map((line) => [line.accountCode, line.debit, line.credit]),
    [
      ["6001", 800, 0],
      ["6602", 0, 500],
      ["3103", 0, 300]
    ]
  );
  assert.equal(closeBlocked.status, 409);
  assert.match(closeBlocked.body.message, /unposted vouchers/);
  assert.ok(api.state.auditLogs.some((log) => log.action === "period_close.generate_profit_loss"));
});

test("plan-compatible posting endpoints post one voucher and generate period-end transfer draft", async () => {
  const api = createApi();
  const accountSetResponse = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "113",
      name: "Plan Posting Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "plan-posting-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSetResponse.body.id}/periods/generate`, {}, "plan-posting-periods");

  for (const [key, account] of [
    ["plan-posting-bank", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isBank: true }],
    ["plan-posting-revenue", { code: "6001", name: "Service Revenue", accountType: "revenue", normalBalance: "credit" }],
    ["plan-posting-expense", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }],
    ["plan-posting-profit", { code: "3103", name: "Current Year Profit", accountType: "equity", normalBalance: "credit" }]
  ]) {
    await request(api, "POST", "/accounts", account, key);
  }

  const revenueVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-10",
      createdBy: "zhang-san",
      lines: [
        { summary: "Receive service income", accountCode: "1002", debit: 800, credit: 0 },
        { summary: "Recognize service income", accountCode: "6001", debit: 0, credit: 800 }
      ]
    },
    "plan-posting-revenue-voucher"
  );
  await request(api, "POST", `/vouchers/${revenueVoucher.body.id}/submit`, { submittedBy: "zhang-san" }, "plan-posting-revenue-submit");
  await request(api, "POST", `/vouchers/${revenueVoucher.body.id}/approve`, { approvedBy: "li-si" }, "plan-posting-revenue-approve");
  const postedRevenue = await request(
    api,
    "POST",
    `/posting/post-voucher/${revenueVoucher.body.id}`,
    { postedBy: "wang-wu" },
    "plan-posting-revenue-post"
  );

  const expenseVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-20",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "plan-posting-expense-voucher"
  );
  await request(api, "POST", `/vouchers/${expenseVoucher.body.id}/submit`, { submittedBy: "zhang-san" }, "plan-posting-expense-submit");
  await request(api, "POST", `/vouchers/${expenseVoucher.body.id}/approve`, { approvedBy: "li-si" }, "plan-posting-expense-approve");
  await request(api, "POST", `/posting/post-voucher/${expenseVoucher.body.id}`, { postedBy: "wang-wu" }, "plan-posting-expense-post");

  const carryForward = await request(
    api,
    "POST",
    "/posting/period-end/transfer-pl",
    {
      accountSetId: accountSetResponse.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-31",
      profitLossAccountCode: "3103",
      createdBy: "close-user"
    },
    "plan-posting-transfer-pl"
  );

  assert.equal(postedRevenue.status, 200);
  assert.equal(postedRevenue.body.voucher.status, "posted");
  assert.equal(carryForward.status, 201);
  assert.equal(carryForward.body.sourceType, "period_close");
  assert.deepEqual(
    carryForward.body.lines.map((line) => [line.accountCode, line.debit, line.credit]),
    [
      ["6001", 800, 0],
      ["6602", 0, 500],
      ["3103", 0, 300]
    ]
  );
});

test("API rejects users without the required permission", async () => {
  const api = createApi();

  const response = await api.handle({
    method: "POST",
    path: "/vouchers",
    headers: {
      "Idempotency-Key": "unauthorized-voucher",
      "Actor-Id": "viewer"
    },
    body: {
      accountSetId: "account-set:001",
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "viewer",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "PERMISSION_DENIED");
});

test("API accepts users with the required permission", async () => {
  const api = createApi();
  api.state.permissionsByActor.set("maker", new Set(["voucher.create"]));
  api.state.accountSetAccessByActor.set("maker", new Set(["account-set:001"]));
  api.state.periods.set("account-set:001:period:2026:1", {
    id: "account-set:001:period:2026:1",
    accountSetId: "account-set:001",
    fiscalYear: 2026,
    periodNo: 1,
    status: "open",
    isCurrent: true
  });

  const response = await api.handle({
    method: "POST",
    path: "/vouchers",
    headers: {
      "Idempotency-Key": "authorized-voucher",
      "Actor-Id": "maker"
    },
    body: {
      accountSetId: "account-set:001",
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "maker",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    }
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.createdBy, "maker");
});

test("account code rule rejects accounts with invalid code length", async () => {
  const api = createApi();

  const rule = await request(
    api,
    "POST",
    "/account-code-rules",
    {
      segments: [4, 2, 2, 2]
    },
    "code-rule"
  );
  const invalidAccount = await request(
    api,
    "POST",
    "/accounts",
    {
      code: "1002012",
      name: "Invalid Length Account",
      accountType: "asset",
      normalBalance: "debit"
    },
    "invalid-account-code"
  );

  assert.equal(rule.status, 201);
  assert.equal(invalidAccount.status, 400);
  assert.match(invalidAccount.body.message, /does not match account code rule/);
});

test("voucher creation auto-generates sequential voucher numbers", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "015",
      name: "Voucher Number Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "voucher-number-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "voucher-number-periods");

  const first = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "maker",
      lines: [
        { summary: "Office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Bank payment", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "voucher-number-first"
  );
  const second = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-16",
      createdBy: "maker",
      lines: [
        { summary: "Office supplies", accountCode: "6602", debit: 300, credit: 0 },
        { summary: "Bank payment", accountCode: "1002", debit: 0, credit: 300 }
      ]
    },
    "voucher-number-second"
  );

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.voucherNo, "记-001");
  assert.equal(second.body.voucherNo, "记-002");
  assert.notEqual(first.body.voucherNo, second.body.voucherNo);
});

test("enabled account sets lock initialization master data and period generation changes", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "016",
      name: "Enabled Lock Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "enabled-lock-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/enable`, { enabledBy: "admin" }, "enabled-lock-enable");

  const createAccountResponse = await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "enabled-lock-create-account"
  );
  const importAccountResponse = await request(
    api,
    "POST",
    "/accounts/import",
    {
      accountSetId: accountSet.body.id,
      importedBy: "master-data-user",
      rows: [{ code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }]
    },
    "enabled-lock-import-accounts"
  );
  const openingBalanceResponse = await request(
    api,
    "POST",
    "/opening-balances",
    {
      accountSetId: accountSet.body.id,
      accountCode: "1002",
      fiscalYear: 2026,
      periodNo: 1,
      debit: 100,
      credit: 0
    },
    "enabled-lock-opening-balance"
  );
  const periodGenerationResponse = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/periods/generate`,
    {},
    "enabled-lock-period-generate"
  );

  assert.equal(createAccountResponse.status, 409);
  assert.equal(createAccountResponse.body.code, "ACCOUNT_SET_ENABLED_LOCKED");
  assert.equal(importAccountResponse.status, 409);
  assert.equal(openingBalanceResponse.status, 409);
  assert.equal(periodGenerationResponse.status, 409);
  assert.equal(periodGenerationResponse.body.code, "ACCOUNT_SET_ENABLED_LOCKED");
});

test("accounts can be imported and disabled accounts cannot be submitted on vouchers", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "014",
      name: "Account Import Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "account-import-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "account-import-periods");

  const imported = await request(
    api,
    "POST",
    "/accounts/import",
    {
      accountSetId: accountSet.body.id,
      importedBy: "master-data-user",
      rows: [
        { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isBank: true },
        { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }
      ]
    },
    "account-import"
  );
  const disabled = await request(
    api,
    "POST",
    "/accounts/6602/disable",
    { disabledBy: "master-data-user" },
    "account-disable"
  );
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "account-disable-voucher"
  );
  const submit = await request(
    api,
    "POST",
    `/vouchers/${voucher.body.id}/submit`,
    { submittedBy: "zhang-san" },
    "account-disable-submit"
  );

  assert.equal(imported.status, 201);
  assert.equal(imported.body.length, 2);
  assert.equal(imported.body[0].accountSetId, accountSet.body.id);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.isEnabled, false);
  assert.equal(submit.status, 400);
  assert.match(submit.body.message, /disabled/);
  assert.ok(api.state.auditLogs.some((log) => log.action === "account.import"));
  assert.ok(api.state.auditLogs.some((log) => log.action === "account.disable"));
});

test("accounts can be edited and manual-entry-disabled accounts cannot be submitted on vouchers", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "015",
      name: "Account Edit Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "account-edit-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "account-edit-periods");
  await request(
    api,
    "POST",
    "/accounts/import",
    {
      accountSetId: accountSet.body.id,
      rows: [
        { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isBank: true },
        { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }
      ]
    },
    "account-edit-import"
  );
  const edited = await request(
    api,
    "PATCH",
    "/accounts/6602",
    {
      name: "Office Expense - Locked",
      allowManualEntry: false,
      updatedBy: "master-data-user"
    },
    "account-edit"
  );
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-16",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "account-edit-voucher"
  );
  const submit = await request(
    api,
    "POST",
    `/vouchers/${voucher.body.id}/submit`,
    { submittedBy: "zhang-san" },
    "account-edit-submit"
  );

  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, "Office Expense - Locked");
  assert.equal(edited.body.allowManualEntry, false);
  assert.equal(submit.status, 400);
  assert.match(submit.body.message, /does not allow manual entry/);
  assert.ok(api.state.auditLogs.some((log) => log.action === "account.update"));
});

test("account tree, lookup, enable, and delete endpoints support chart maintenance", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "016",
      name: "Account Maintenance Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "account-maintenance-account-set"
  );
  const parent = await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "5000",
      name: "Operating Costs",
      accountType: "cost",
      normalBalance: "debit",
      isLeaf: false,
      allowManualEntry: false
    },
    "account-tree-parent"
  );
  const child = await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "500101",
      name: "Manufacturing Materials",
      accountType: "cost",
      normalBalance: "debit",
      parentId: parent.body.id
    },
    "account-tree-child"
  );

  const tree = await request(api, "GET", "/accounts/tree", null, null);
  const lookup = await request(api, "GET", "/accounts/500101", null, null);
  const disabled = await request(api, "POST", "/accounts/500101/disable", { disabledBy: "master-data-user" }, "account-disable-for-enable");
  const enabled = await request(api, "POST", "/accounts/500101/enable", { enabledBy: "master-data-user" }, "account-enable");
  const deleted = await request(api, "DELETE", "/accounts/500101", { deletedBy: "master-data-user" }, "account-delete");

  assert.equal(parent.status, 201);
  assert.equal(child.status, 201);
  assert.equal(child.body.parentId, parent.body.id);
  assert.equal(tree.status, 200);
  assert.equal(tree.body.find((account) => account.code === "5000")?.children?.[0]?.code, "500101");
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.code, "500101");
  assert.equal(disabled.body.isEnabled, false);
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.isEnabled, true);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.isEnabled, false);
  assert.ok(api.state.auditLogs.some((log) => log.action === "account.enable"));
  assert.ok(api.state.auditLogs.some((log) => log.action === "account.delete"));
});

test("accounts referenced by vouchers cannot be deleted", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "036",
      name: "Used Account Delete Lock Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "used-account-delete-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "used-account-delete-periods");
  await request(api, "POST", "/accounts", { accountSetId: accountSet.body.id, code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "used-account-delete-bank");
  await request(api, "POST", "/accounts", { accountSetId: accountSet.body.id, code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "used-account-delete-expense");
  await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-18",
      createdBy: "zhang-san",
      lines: [
        { summary: "Referenced expense", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "used-account-delete-voucher"
  );

  const deleted = await request(api, "DELETE", "/accounts/6602", { deletedBy: "master-data-user" }, "used-account-delete");

  assert.equal(deleted.status, 409);
  assert.equal(deleted.body.code, "ACCOUNT_IN_USE");
  assert.equal(api.state.accounts.get("6602").isEnabled, true);
});

test("voucher lines cannot use non-leaf accounts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "005",
      name: "Leaf Control Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "leaf-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "leaf-periods");
  await request(
    api,
    "POST",
    "/accounts",
    {
      code: "6602",
      name: "Expense Parent",
      accountType: "expense",
      normalBalance: "debit",
      isLeaf: false
    },
    "leaf-parent-account"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "leaf-bank-account"
  );
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-25",
      createdBy: "zhang-san",
      lines: [
        { summary: "Use parent account", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "leaf-voucher"
  );
  const submitted = await request(
    api,
    "POST",
    `/vouchers/${voucher.body.id}/submit`,
    { submittedBy: "zhang-san" },
    "leaf-submit"
  );

  assert.equal(submitted.status, 400);
  assert.match(submitted.body.message, /is not a leaf account/);
});

test("voucher submit requires configured auxiliary values", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "006",
      name: "Auxiliary Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "aux-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "aux-periods");
  await request(
    api,
    "POST",
    "/accounts",
    {
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit",
      requiredAuxiliaries: ["department"]
    },
    "aux-expense-account"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "aux-bank-account"
  );

  const missingAuxVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-26",
      createdBy: "zhang-san",
      lines: [
        { summary: "Missing department", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "aux-missing-voucher"
  );
  const missingAuxSubmit = await request(
    api,
    "POST",
    `/vouchers/${missingAuxVoucher.body.id}/submit`,
    { submittedBy: "zhang-san" },
    "aux-missing-submit"
  );

  const completeVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      id: "voucher:aux-complete",
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-26",
      createdBy: "zhang-san",
      lines: [
        {
          summary: "Has department",
          accountCode: "6602",
          debit: 100,
          credit: 0,
          auxiliaries: { department: "ADMIN" }
        },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "aux-complete-voucher"
  );
  const completeSubmit = await request(
    api,
    "POST",
    `/vouchers/${completeVoucher.body.id}/submit`,
    { submittedBy: "zhang-san" },
    "aux-complete-submit"
  );

  assert.equal(missingAuxSubmit.status, 400);
  assert.match(missingAuxSubmit.body.message, /requires auxiliary department/);
  assert.equal(completeSubmit.status, 200);
  assert.equal(completeSubmit.body.status, "submitted");
});

test("API supports reject, void, and reverse voucher actions", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "007",
      name: "Actions Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "actions-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "actions-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "actions-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "actions-expense");

  // Test Reject & Void
  const voucher1 = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "actions-voucher1"
  );

  await request(api, "POST", `/vouchers/${voucher1.body.id}/submit`, { submittedBy: "zhang-san" }, "actions-submit1");
  const rejected = await request(api, "POST", `/vouchers/${voucher1.body.id}/reject`, { rejectedBy: "li-si" }, "actions-reject1");
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, "rejected");

  const voided = await request(api, "POST", `/vouchers/${voucher1.body.id}/void`, { voidedBy: "zhang-san" }, "actions-void1");
  assert.equal(voided.status, 200);
  assert.equal(voided.body.status, "voided");

  // Test Reverse
  const voucher2 = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-20",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 300, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 300 }
      ]
    },
    "actions-voucher2"
  );

  await request(api, "POST", `/vouchers/${voucher2.body.id}/submit`, { submittedBy: "zhang-san" }, "actions-submit2");
  await request(api, "POST", `/vouchers/${voucher2.body.id}/approve`, { approvedBy: "li-si" }, "actions-approve2");
  const posted = await request(api, "POST", `/vouchers/${voucher2.body.id}/post`, { postedBy: "wang-wu" }, "actions-post2");
  assert.equal(posted.status, 200);

  const reversed = await request(
    api,
    "POST",
    `/vouchers/${voucher2.body.id}/reverse`,
    { reversedBy: "wang-wu", voucherDate: "2026-01-21", fiscalYear: 2026, periodNo: 1 },
    "actions-reverse2"
  );
  assert.equal(reversed.status, 201);
  assert.equal(reversed.body.status, "draft");
  assert.equal(reversed.body.lines[0].debit, 0);
  assert.equal(reversed.body.lines[0].credit, 300);
});

test("reverse voucher action persists the generated red-letter draft", async () => {
  const accountSetId = "account-set:persisted-reverse";
  const accounts = [
    {
      id: "account:persisted-reverse-bank",
      accountSetId,
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit",
      isEnabled: true,
      isLeaf: true,
      allowManualEntry: true,
      requiredAuxiliaries: []
    },
    {
      id: "account:persisted-reverse-expense",
      accountSetId,
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit",
      isEnabled: true,
      isLeaf: true,
      allowManualEntry: true,
      requiredAuxiliaries: []
    }
  ];
  const postedVoucher = {
    id: "voucher:persisted-reverse:1",
    accountSetId,
    fiscalYear: 2026,
    periodNo: 1,
    voucherNo: "记-001",
    voucherDate: "2026-01-20",
    status: "posted",
    revision: 1,
    sourceType: "manual",
    attachmentCount: 0,
    createdBy: "maker",
    submittedBy: "maker",
    approvedBy: "auditor",
    postedBy: "poster",
    postedAt: "posted",
    lines: [
      { lineNo: 1, summary: "Posted office supplies", accountCode: "6602", debit: 300, credit: 0, auxiliaries: {} },
      { lineNo: 2, summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 300, auxiliaries: {} }
    ]
  };
  const storedVouchers = new Map([[postedVoucher.id, postedVoucher]]);
  const platformStore = {
    listVouchers: async (filterAccountSetId) =>
      [...storedVouchers.values()].filter((voucher) => !filterAccountSetId || voucher.accountSetId === filterAccountSetId),
    listAccountingPeriods: async () => [
      {
        id: "period:persisted-reverse:2026:1",
        accountSetId,
        fiscalYear: 2026,
        periodNo: 1,
        status: "open",
        isCurrent: true
      }
    ],
    listAccounts: async () => accounts,
    createVoucher: async (voucher) => {
      storedVouchers.set(voucher.id, voucher);
      return voucher;
    }
  };
  const api = createApi({ platformStore });

  const reversed = await request(
    api,
    "POST",
    `/vouchers/${postedVoucher.id}/reverse`,
    { reversedBy: "poster", voucherDate: "2026-01-21", fiscalYear: 2026, periodNo: 1 },
    "persisted-reverse"
  );

  assert.equal(reversed.status, 201);
  assert.equal(reversed.body.status, "draft");
  assert.equal(reversed.body.lines[0].debit, 0);
  assert.equal(reversed.body.lines[0].credit, 300);
  assert.equal(storedVouchers.get(reversed.body.id)?.id, reversed.body.id);
});

test("voucher drafts can be queried, edited, copied, and deleted through maintenance endpoints", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "021",
      name: "Voucher Maintenance Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "voucher-maint-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "voucher-maint-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "voucher-maint-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "voucher-maint-expense");

  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-12",
      createdBy: "zhang-san",
      lines: [
        { summary: "Initial supplies", accountCode: "6602", debit: 100, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
      ]
    },
    "voucher-maint-create"
  );
  const detail = await request(api, "GET", `/vouchers/${voucher.body.id}`, null, null);
  const updated = await request(
    api,
    "PATCH",
    `/vouchers/${voucher.body.id}`,
    {
      voucherDate: "2026-01-13",
      expectedRevision: 1,
      updatedBy: "zhang-san",
      lines: [
        { summary: "Updated supplies", accountCode: "6602", debit: 150, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 150 }
      ]
    },
    "voucher-maint-update"
  );
  const staleUpdate = await request(
    api,
    "PATCH",
    `/vouchers/${voucher.body.id}`,
    {
      voucherDate: "2026-01-16",
      expectedRevision: 1,
      updatedBy: "wang-wu",
      lines: [
        { summary: "Stale supplies", accountCode: "6602", debit: 180, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 180 }
      ]
    },
    "voucher-maint-stale-update"
  );
  const copied = await request(
    api,
    "POST",
    `/vouchers/${voucher.body.id}/copy`,
    { copiedBy: "li-si", voucherDate: "2026-01-14" },
    "voucher-maint-copy"
  );
  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "voucher-maint-submit");
  const updateSubmitted = await request(
    api,
    "PATCH",
    `/vouchers/${voucher.body.id}`,
    { voucherDate: "2026-01-15", updatedBy: "zhang-san" },
    "voucher-maint-update-submitted"
  );
  const deletedCopy = await request(
    api,
    "DELETE",
    `/vouchers/${copied.body.id}`,
    { deletedBy: "li-si" },
    "voucher-maint-delete-copy"
  );

  assert.equal(detail.status, 200);
  assert.equal(detail.body.id, voucher.body.id);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.voucherDate, "2026-01-13");
  assert.equal(updated.body.revision, 2);
  assert.equal(updated.body.lines[0].summary, "Updated supplies");
  assert.equal(updated.body.lines[0].debit, 150);
  assert.equal(staleUpdate.status, 409);
  assert.equal(staleUpdate.body.code, "VOUCHER_UPDATE_CONFLICT");
  assert.equal(api.state.vouchers.get(voucher.body.id).voucherDate, "2026-01-13");
  assert.equal(copied.status, 201);
  assert.notEqual(copied.body.id, voucher.body.id);
  assert.equal(copied.body.status, "draft");
  assert.equal(copied.body.createdBy, "li-si");
  assert.equal(copied.body.lines[0].summary, "Updated supplies");
  assert.equal(updateSubmitted.status, 409);
  assert.match(updateSubmitted.body.message, /Only draft or rejected vouchers can be updated/);
  assert.equal(deletedCopy.status, 200);
  assert.equal(deletedCopy.body.status, "voided");
  assert.ok(api.state.auditLogs.some((log) => log.action === "voucher.update"));
  assert.ok(api.state.auditLogs.some((log) => log.action === "voucher.copy"));
  assert.ok(api.state.auditLogs.some((log) => log.action === "voucher.delete"));
});

test("approved vouchers can be posted in a batch and queried by batch id", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "017",
      name: "Posting Batch Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "posting-batch-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "posting-batch-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "posting-batch-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "posting-batch-expense");

  const voucherIds = [];
  for (const [index, amount] of [120, 80].entries()) {
    const voucher = await request(
      api,
      "POST",
      "/vouchers",
      {
        accountSetId: accountSet.body.id,
        fiscalYear: 2026,
        periodNo: 1,
        voucherDate: `2026-01-${20 + index}`,
        createdBy: "zhang-san",
        lines: [
          { summary: "Batch office supplies", accountCode: "6602", debit: amount, credit: 0 },
          { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: amount }
        ]
      },
      `posting-batch-voucher-${index}`
    );
    await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, `posting-batch-submit-${index}`);
    await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, `posting-batch-approve-${index}`);
    voucherIds.push(voucher.body.id);
  }

  const batch = await request(
    api,
    "POST",
    "/posting/post-batch",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherIds,
      postedBy: "wang-wu"
    },
    "posting-batch"
  );
  const batches = await request(api, "GET", "/posting/batches", null, null);
  const detail = await request(api, "GET", `/posting/batches/${batch.body.id}`, null, null);

  assert.equal(batch.status, 201);
  assert.equal(batch.body.successCount, 2);
  assert.equal(batch.body.failedCount, 0);
  assert.equal(batch.body.status, "success");
  assert.equal(batches.body.length, 1);
  assert.equal(detail.body.id, batch.body.id);
  assert.deepEqual(detail.body.voucherIds, voucherIds);
  assert.equal(api.state.vouchers.get(voucherIds[0]).status, "posted");
  assert.equal(api.state.vouchers.get(voucherIds[1]).status, "posted");
  assert.ok(api.state.auditLogs.some((log) => log.action === "posting_batch.post"));
});

test("posting batches can be queried from persisted platform store after runtime restart", async () => {
  const persistedBatch = {
    id: "posting-batch:persisted-1",
    accountSetId: "account-set:persisted-batches",
    fiscalYear: 2026,
    periodNo: 6,
    voucherIds: ["voucher:persisted-posted-1"],
    successCount: 1,
    failedCount: 0,
    status: "success",
    postedBy: "accountant",
    createdAt: "2026-06-10T00:00:00.000Z",
    results: [{ voucherId: "voucher:persisted-posted-1", status: "success", journalEntryCount: 2 }]
  };
  const api = createApi({
    platformStore: {
      listPostingBatches: async () => [persistedBatch]
    }
  });

  const batches = await request(api, "GET", "/posting/batches", null, null);
  const detail = await request(api, "GET", `/posting/batches/${persistedBatch.id}`, null, null);

  assert.equal(batches.status, 200);
  assert.deepEqual(batches.body, [persistedBatch]);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body, persistedBatch);
});

test("batch posting can post persisted vouchers after runtime restart", async () => {
  const accountSetId = "account-set:persisted-batch";
  const accounts = [
    {
      id: "account:persisted-bank",
      accountSetId,
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit",
      isEnabled: true,
      isLeaf: true,
      allowManualEntry: true,
      requiredAuxiliaries: []
    },
    {
      id: "account:persisted-expense",
      accountSetId,
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit",
      isEnabled: true,
      isLeaf: true,
      allowManualEntry: true,
      requiredAuxiliaries: []
    }
  ];
  let storedVoucher = {
    id: "voucher:persisted-batch:1",
    accountSetId,
    fiscalYear: 2026,
    periodNo: 1,
    voucherNo: "记-001",
    voucherDate: "2026-01-20",
    status: "approved",
    revision: 1,
    sourceType: "manual",
    attachmentCount: 0,
    createdBy: "maker",
    submittedBy: "maker",
    approvedBy: "auditor",
    postedBy: null,
    postedAt: null,
    lines: [
      { lineNo: 1, summary: "Persisted office supplies", accountCode: "6602", debit: 120, credit: 0, auxiliaries: {} },
      { lineNo: 2, summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 120, auxiliaries: {} }
    ]
  };
  const platformStore = {
    canAccessAccountSet: async () => true,
    listVouchers: async () => [storedVoucher],
    listAccountingPeriods: async () => [
      {
        id: "period:persisted-batch:2026:1",
        accountSetId,
        fiscalYear: 2026,
        periodNo: 1,
        status: "open",
        isCurrent: true
      }
    ],
    listAccounts: async () => accounts,
    updateVoucherStatus: async (voucher) => {
      storedVoucher = { ...storedVoucher, ...voucher };
      return storedVoucher;
    },
    createVoucherStatusLog: async (log) => log
  };
  const api = createApi({ platformStore });

  const batch = await request(
    api,
    "POST",
    "/posting/post-batch",
    {
      accountSetId,
      fiscalYear: 2026,
      periodNo: 1,
      voucherIds: [storedVoucher.id],
      postedBy: "poster"
    },
    "persisted-batch-post"
  );

  assert.equal(batch.status, 201);
  assert.equal(batch.body.successCount, 1);
  assert.equal(batch.body.failedCount, 0);
  assert.equal(batch.body.status, "success");
  assert.equal(storedVoucher.status, "posted");
  assert.equal(storedVoucher.postedBy, "poster");
});

test("batch posting reports partial failure when voucher status changes before posting", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "034",
      name: "Posting Batch Partial Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "posting-batch-partial-account-set"
  );

  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "posting-batch-partial-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "posting-batch-partial-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "posting-batch-partial-expense");

  const approvedVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-21",
      createdBy: "zhang-san",
      lines: [
        { summary: "Approved office supplies", accountCode: "6602", debit: 120, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 120 }
      ]
    },
    "posting-batch-partial-approved-voucher"
  );
  const draftVoucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-22",
      createdBy: "zhang-san",
      lines: [
        { summary: "Draft office supplies", accountCode: "6602", debit: 80, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 80 }
      ]
    },
    "posting-batch-partial-draft-voucher"
  );
  await request(api, "POST", `/vouchers/${approvedVoucher.body.id}/submit`, { submittedBy: "zhang-san" }, "posting-batch-partial-submit");
  await request(api, "POST", `/vouchers/${approvedVoucher.body.id}/approve`, { approvedBy: "li-si" }, "posting-batch-partial-approve");

  const batch = await request(
    api,
    "POST",
    "/posting/post-batch",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherIds: [approvedVoucher.body.id, draftVoucher.body.id],
      postedBy: "wang-wu"
    },
    "posting-batch-partial"
  );
  const failedResult = batch.body.results.find((result) => result.voucherId === draftVoucher.body.id);

  assert.equal(batch.status, 201);
  assert.equal(batch.body.status, "partial_failed");
  assert.equal(batch.body.successCount, 1);
  assert.equal(batch.body.failedCount, 1);
  assert.equal(api.state.vouchers.get(approvedVoucher.body.id).status, "posted");
  assert.equal(api.state.vouchers.get(draftVoucher.body.id).status, "draft");
  assert.equal(failedResult.status, "failed");
  assert.match(failedResult.error, /Only approved vouchers can be posted/);
});

test("account sets can be enabled and disabled through explicit lifecycle actions", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "008",
      name: "Lifecycle Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "lifecycle-account-set"
  );

  const enabled = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/enable`,
    { enabledBy: "admin" },
    "lifecycle-enable"
  );
  const updateStartAfterEnable = await request(
    api,
    "PATCH",
    `/account-sets/${accountSet.body.id}`,
    { startYear: 2027, startPeriod: 2, updatedBy: "admin" },
    "lifecycle-update-start-after-enable"
  );
  const disabled = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/disable`,
    { disabledBy: "admin" },
    "lifecycle-disable"
  );

  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.status, "enabled");
  assert.equal(updateStartAfterEnable.status, 409);
  assert.equal(updateStartAfterEnable.body.code, "ACCOUNT_SET_ENABLED_LOCKED");
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.status, "disabled");
});

test("account sets can be queried and edited by id", async () => {
  const api = createApi();
  const created = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "018",
      name: "Editable Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1,
      createdBy: "setup-user"
    },
    "editable-account-set"
  );
  const detail = await request(api, "GET", `/account-sets/${created.body.id}`, null, null);
  const updated = await request(
    api,
    "PATCH",
    `/account-sets/${created.body.id}`,
    {
      name: "Renamed Account Set",
      companyName: "Renamed Demo Co., Ltd.",
      baseCurrency: "USD",
      accountingStandard: "Enterprise Accounting Standards",
      startYear: 2027,
      startPeriod: 2,
      updatedBy: "setup-user"
    },
    "editable-account-set-update"
  );
  const updatedDetail = await request(api, "GET", `/account-sets/${created.body.id}`, null, null);

  assert.equal(detail.status, 200);
  assert.equal(detail.body.id, created.body.id);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, "Renamed Account Set");
  assert.equal(updated.body.companyName, "Renamed Demo Co., Ltd.");
  assert.equal(updated.body.baseCurrency, "USD");
  assert.equal(updated.body.accountingStandard, "Enterprise Accounting Standards");
  assert.equal(updated.body.startYear, 2027);
  assert.equal(updated.body.startPeriod, 2);
  assert.equal(updatedDetail.body.name, "Renamed Account Set");
  assert.ok(api.state.auditLogs.some((log) => log.action === "account_set.update"));
});

test("periods support open, lock, and exactly-one-current transitions", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "009",
      name: "Period Transition Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "period-transition-account-set"
  );
  const periods = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/periods/generate`,
    {},
    "period-transition-generate"
  );
  const firstPeriod = periods.body[0];
  const secondPeriod = periods.body[1];

  const opened = await request(
    api,
    "POST",
    `/periods/${secondPeriod.id}/open`,
    { openedBy: "admin" },
    "period-transition-open"
  );
  const current = await request(
    api,
    "POST",
    `/periods/${secondPeriod.id}/set-current`,
    { setBy: "admin" },
    "period-transition-current"
  );
  const locked = await request(
    api,
    "POST",
    `/periods/${firstPeriod.id}/lock`,
    { lockedBy: "admin" },
    "period-transition-lock"
  );

  assert.equal(opened.status, 200);
  assert.equal(opened.body.status, "open");
  assert.equal(current.status, 200);
  assert.equal(current.body.isCurrent, true);
  assert.equal(locked.status, 200);
  assert.equal(locked.body.status, "locked");
  assert.equal([...api.state.periods.values()].filter((period) => period.isCurrent).length, 1);
});

test("account-set periods can be queried by account set id", async () => {
  const api = createApi();
  const firstAccountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "019",
      name: "First Period Query Account Set",
      companyName: "First Period Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 3
    },
    "period-query-first-account-set"
  );
  const secondAccountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "020",
      name: "Second Period Query Account Set",
      companyName: "Second Period Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2027,
      startPeriod: 5
    },
    "period-query-second-account-set"
  );
  await request(api, "POST", `/account-sets/${firstAccountSet.body.id}/periods/generate`, {}, "period-query-first-generate");
  await request(api, "POST", `/account-sets/${secondAccountSet.body.id}/periods/generate`, {}, "period-query-second-generate");

  const periods = await request(api, "GET", `/account-sets/${firstAccountSet.body.id}/periods`, null, null);

  assert.equal(periods.status, 200);
  assert.equal(periods.body.length, 12);
  assert.equal(periods.body.every((period) => period.accountSetId === firstAccountSet.body.id), true);
  assert.equal(periods.body.find((period) => period.periodNo === 3).isCurrent, true);
});

test("voucher status logs record every formal state transition", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "010",
      name: "Status Log Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "status-log-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "status-log-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "status-log-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "status-log-expense");
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "status-log-voucher"
  );

  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "status-log-submit");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, "status-log-approve");
  await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "wang-wu" }, "status-log-post");

  const logs = await request(api, "GET", `/vouchers/${voucher.body.id}/status-logs`, null, null);

  assert.equal(logs.status, 200);
  assert.deepEqual(
    logs.body.map((log) => [log.action, log.fromStatus, log.toStatus]),
    [
      ["create", null, "draft"],
      ["submit", "draft", "submitted"],
      ["approve", "submitted", "approved"],
      ["post", "approved", "posted"]
    ]
  );
});

test("ledger queries expose general ledger, detail ledger, account balances, and trial balance", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "011",
      name: "Ledger Query Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "ledger-query-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "ledger-query-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "ledger-query-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "ledger-query-expense");
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "ledger-query-voucher"
  );

  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "ledger-query-submit");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, "ledger-query-approve");
  await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "wang-wu" }, "ledger-query-post");

  const generalLedger = await request(api, "GET", "/ledger/general-ledger", null, null);
  const detailLedger = await request(api, "GET", "/ledger/detail-ledger", null, null);
  const balances = await request(api, "GET", "/ledger/account-balances", null, null);
  const trialBalance = await request(api, "GET", "/ledger/trial-balance", null, null);
  const subLedger = await request(api, "GET", "/ledger/sub-ledger", null, null);
  const reportBalances = await request(api, "GET", "/reports/account-balances", null, null);
  const reportTrialBalance = await request(api, "GET", "/reports/trial-balance", null, null);

  assert.equal(generalLedger.status, 200);
  assert.equal(generalLedger.body.rows.length, 2);
  assert.equal(detailLedger.body.length, 2);
  assert.equal(balances.body.length, 2);
  assert.deepEqual(trialBalance.body.totals, { debit: 500, credit: 500, difference: 0 });
  assert.deepEqual(subLedger.body, detailLedger.body);
  assert.deepEqual(reportBalances.body, balances.body);
  assert.deepEqual(reportTrialBalance.body, trialBalance.body);
});

test("bank reconciliation imports statements and matches bank journal entries", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "012",
      name: "Bank Reconciliation Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "bank-rec-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "bank-rec-periods");
  await request(
    api,
    "POST",
    "/accounts",
    { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isBank: true },
    "bank-rec-bank"
  );
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "bank-rec-expense");
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "bank-rec-voucher"
  );

  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "bank-rec-submit");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, "bank-rec-approve");
  await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "wang-wu" }, "bank-rec-post");

  const imported = await request(
    api,
    "POST",
    "/ledger/bank-statements/import",
    {
      accountSetId: accountSet.body.id,
      bankAccountCode: "1002",
      importedBy: "wang-wu",
      rows: [
        {
          transactionDate: "2026-01-15",
          description: "Bank payment for office supplies",
          amount: -500,
          balance: 9500
        }
      ]
    },
    "bank-rec-import"
  );
  const reconciliation = await request(
    api,
    "POST",
    "/ledger/bank-reconciliations",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: "wang-wu"
    },
    "bank-rec-create"
  );
  const match = await request(
    api,
    "POST",
    `/ledger/bank-reconciliations/${reconciliation.body.id}/match`,
    { matchedBy: "wang-wu" },
    "bank-rec-match"
  );
  const statements = await request(api, "GET", "/ledger/bank-statements", null, null);

  assert.equal(imported.status, 201);
  assert.equal(imported.body.length, 1);
  assert.equal(imported.body[0].status, "unreconciled");
  assert.equal(reconciliation.status, 201);
  assert.equal(match.status, 200);
  assert.equal(match.body.status, "matched");
  assert.equal(match.body.matchedCount, 1);
  assert.equal(match.body.matches[0].bankStatementId, imported.body[0].id);
  assert.equal(match.body.matches[0].journalEntryId, api.state.journalEntries[1].id);
  assert.equal(statements.body[0].status, "reconciled");
  assert.ok(api.state.auditLogs.some((log) => log.action === "bank_reconciliation.match"));
});

test("plan-compatible bank endpoints import, list, create, and auto-match statements", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "112",
      name: "Plan Bank Reconciliation Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "plan-bank-rec-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "plan-bank-rec-periods");
  await request(
    api,
    "POST",
    "/accounts",
    { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isBank: true },
    "plan-bank-rec-bank"
  );
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "plan-bank-rec-expense");
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "plan-bank-rec-voucher"
  );
  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "plan-bank-rec-submit");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, "plan-bank-rec-approve");
  await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "wang-wu" }, "plan-bank-rec-post");

  const imported = await request(
    api,
    "POST",
    "/bank/statements",
    {
      accountSetId: accountSet.body.id,
      bankAccountCode: "1002",
      importedBy: "wang-wu",
      rows: [
        {
          transactionDate: "2026-01-15",
          description: "Bank payment for office supplies",
          amount: -500,
          balance: 9500
        }
      ]
    },
    "plan-bank-rec-import"
  );
  const statements = await request(api, "GET", "/bank/statements", null, null);
  const reconciliation = await request(
    api,
    "POST",
    "/bank/reconcile",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: "wang-wu"
    },
    "plan-bank-rec-create"
  );
  const autoMatch = await request(
    api,
    "POST",
    "/bank/reconcile/auto",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: "wang-wu",
      matchedBy: "wang-wu"
    },
    "plan-bank-rec-auto"
  );

  assert.equal(imported.status, 201);
  assert.equal(statements.status, 200);
  assert.equal(statements.body.length, 1);
  assert.equal(reconciliation.status, 201);
  assert.equal(autoMatch.status, 200);
  assert.equal(autoMatch.body.status, "matched");
  assert.equal(autoMatch.body.matchedCount, 1);
  assert.equal(autoMatch.body.matches[0].bankStatementId, imported.body[0].id);
});

test("AI voucher suggestions are dry-run drafts and do not create formal vouchers", async () => {
  const api = createApi();
  api.state.permissionsByActor.set("ai-user", new Set(["ai.generate_draft", "voucher.view"]));

  const suggestion = await api.handle({
    method: "POST",
    path: "/ai/voucher-suggestions",
    headers: {
      "Idempotency-Key": "ai-suggestion-dry-run",
      "Actor-Id": "ai-user"
    },
    body: {
      accountSetId: "account-set:demo",
      dryRun: true,
      content: "购买办公用品500元，银行付款",
      evidenceRefs: ["attachment:invoice-001"]
    }
  });
  const vouchers = await api.handle({
    method: "GET",
    path: "/vouchers",
    headers: { "Actor-Id": "ai-user" }
  });

  assert.equal(suggestion.status, 201);
  assert.equal(suggestion.body.dryRun, true);
  assert.equal(suggestion.body.approvalRequired, true);
  assert.equal(suggestion.body.riskLevel, "medium");
  assert.deepEqual(suggestion.body.evidenceRefs, ["attachment:invoice-001"]);
  assert.equal(suggestion.body.draft.status, "draft");
  assert.equal(suggestion.body.draft.sourceType, "ai");
  assert.equal(vouchers.status, 200);
  assert.deepEqual(vouchers.body, []);
});

test("AI voucher suggestions require dryRun true", async () => {
  const api = createApi();
  api.state.permissionsByActor.set("ai-user", new Set(["ai.generate_draft"]));

  const response = await api.handle({
    method: "POST",
    path: "/ai/voucher-suggestions",
    headers: {
      "Idempotency-Key": "ai-suggestion-no-dry-run",
      "Actor-Id": "ai-user"
    },
    body: {
      accountSetId: "account-set:demo",
      dryRun: false,
      content: "购买办公用品500元，银行付款",
      evidenceRefs: []
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "BUSINESS_RULE_FAILED");
  assert.match(response.body.message, /dryRun true/);
});

test("Phase 2 Agent dry-run suggests reconciliation, collection drafts, and exception checks without posting", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P2-AI",
      name: "Phase 2 Agent Set",
      companyName: "Phase 2 Agent Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase2-ai-account-set"
  );
  const actorId = "phase2-ai-agent";
  api.state.permissionsByActor.set(actorId, new Set(["ai.generate_draft"]));
  api.state.accountSetAccessByActor.set(actorId, new Set([accountSet.body.id]));
  api.state.counterpartyLedgerEntries.set("ledger:ar:agent", {
    id: "ledger:ar:agent",
    accountSetId: accountSet.body.id,
    partnerId: "customer:agent",
    partnerName: "Agent Customer",
    direction: "ar",
    sourceType: "sales_invoice",
    sourceId: "sales-invoice:agent",
    sourceNo: "SI-AI-001",
    documentDate: "2026-03-01",
    dueDate: "2026-03-31",
    originalAmount: 1000,
    settledAmount: 0,
    remainingAmount: 1000,
    status: "open",
    glAccountCode: "1122",
    auxiliaryType: "customer",
    auxiliaryPartnerId: "customer:agent",
    createdBy: actorId
  });
  api.state.counterpartyLedgerEntries.set("ledger:ap:agent", {
    id: "ledger:ap:agent",
    accountSetId: accountSet.body.id,
    partnerId: "supplier:agent",
    partnerName: "Agent Supplier",
    direction: "ap",
    sourceType: "purchase_invoice",
    sourceId: "purchase-invoice:agent",
    sourceNo: "PI-AI-001",
    documentDate: "2026-04-01",
    dueDate: "2026-04-15",
    originalAmount: 800,
    settledAmount: 0,
    remainingAmount: 800,
    status: "open",
    glAccountCode: "2202",
    auxiliaryType: "supplier",
    auxiliaryPartnerId: "supplier:agent",
    isPaymentBlocked: true,
    paymentBlockReason: "Bank account review",
    createdBy: actorId
  });
  api.state.customerReceipts.set("customer-receipt:agent", {
    id: "customer-receipt:agent",
    accountSetId: accountSet.body.id,
    counterpartyLedgerEntryId: "ledger:ar:agent",
    customerId: "customer:agent",
    customerName: "Agent Customer",
    sourceNo: "SI-AI-001",
    receiptNo: "REC-AI-001",
    receiptDate: "2026-04-10",
    receiptType: "receipt",
    receivedAmount: 600,
    status: "received",
    receivedBy: actorId,
    receiptMethod: "bank_transfer",
    bankAccountCode: "1002",
    glVoucherId: null,
    evidenceRefs: ["attachment:receipt-agent"]
  });
  api.state.supplierPayments.set("supplier-payment:agent", {
    id: "supplier-payment:agent",
    accountSetId: accountSet.body.id,
    paymentRequestId: "payment-request:agent",
    counterpartyLedgerEntryId: "ledger:ap:agent",
    supplierId: "supplier:agent",
    supplierName: "Agent Supplier",
    sourceNo: "PI-AI-001",
    paymentNo: "PAY-AI-001",
    paymentDate: "2026-04-18",
    paidAmount: 300,
    status: "paid",
    paidBy: actorId,
    paymentMethod: "bank_transfer",
    bankAccountCode: "1002",
    glVoucherId: null,
    evidenceRefs: ["attachment:payment-agent"]
  });

  const reconciliation = await api.handle({
    method: "POST",
    path: "/ai/reconciliation-suggestions",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase2-ai-reconciliation" },
    body: { accountSetId: accountSet.body.id, dryRun: true, asOfDate: "2026-06-15", requestedBy: actorId }
  });
  const collectionDraft = await api.handle({
    method: "POST",
    path: "/ai/collection-drafts",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase2-ai-collection" },
    body: { accountSetId: accountSet.body.id, dryRun: true, asOfDate: "2026-06-15", requestedBy: actorId }
  });
  const exceptionCheck = await api.handle({
    method: "POST",
    path: "/ai/exception-checks",
    headers: { "Actor-Id": actorId, "Idempotency-Key": "phase2-ai-exception" },
    body: { accountSetId: accountSet.body.id, dryRun: true, asOfDate: "2026-06-15", requestedBy: actorId }
  });

  assert.equal(reconciliation.status, 201);
  assert.equal(reconciliation.body.dryRun, true);
  assert.equal(reconciliation.body.suggestions[0].counterpartyLedgerEntryId, "ledger:ar:agent");
  assert.equal(reconciliation.body.suggestions[0].matchSourceNo, "REC-AI-001");
  assert.equal(reconciliation.body.suggestions[0].suggestedAmount, 600);
  assert.equal(collectionDraft.status, 201);
  assert.equal(collectionDraft.body.dryRun, true);
  assert.equal(collectionDraft.body.drafts[0].customerId, "customer:agent");
  assert.match(collectionDraft.body.drafts[0].body, /SI-AI-001/);
  assert.equal(exceptionCheck.status, 201);
  assert.equal(exceptionCheck.body.dryRun, true);
  assert.ok(exceptionCheck.body.findings.some((finding) => finding.code === "OVERDUE_AR"));
  assert.ok(exceptionCheck.body.findings.some((finding) => finding.code === "PAYMENT_BLOCKED"));
  assert.equal(api.state.arSettlements.size, 0);
  assert.equal(api.state.apSettlements.size, 0);
});

test("Phase 6 Agent draft candidate generation keeps LLM output in dry-run review state", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6DRAFT",
      name: "Phase 6 Draft Candidates",
      companyName: "Phase 6 Draft Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-draft-account-set"
  );

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalPeriodId: "period:p6draft:2026:6",
      draftType: "purchase_order",
      sourceObjectType: "free_text",
      userInstruction: "根据报价单给华东供应商生成采购订单草稿，A材料 100 件，单价 20 元",
      evidenceRefs: ["quote:hd-001"],
      dryRun: true
    },
    "phase6-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.draftType, "purchase_order");
  assert.equal(candidate.body.status, "candidate");
  assert.equal(candidate.body.dryRun, true);
  assert.equal(candidate.body.requiresHumanConfirmation, true);
  assert.equal(candidate.body.llmDraftRun.provider, "local-rule-based");
  assert.equal(candidate.body.draftPayload.documentType, "purchase_order");
  assert.equal(candidate.body.draftPayload.lines[0].quantity, 100);
  assert.equal(candidate.body.draftPayload.lines[0].unitPrice, 20);
  assert.deepEqual(candidate.body.evidenceRefs, ["quote:hd-001"]);
  assert.ok(candidate.body.unmatchedItems.some((item) => item.field === "supplierId"));
  assert.equal(candidate.body.dryRunResult.status, "review_required");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).id, candidate.body.id);
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent.draft_candidate.create" && log.objectType === "agent_draft_candidate" && log.objectId === candidate.body.id
    )
  );
});

test("Phase 6 Agent draft candidates extract uploaded files with local OCR before LLM draft generation", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6OCR",
      name: "Phase 6 OCR Draft",
      companyName: "Phase 6 OCR Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-ocr-account-set"
  );
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "quote.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("华东供应商 A材料 300 件 单价 9 元"),
      contentBase64: Buffer.from("华东供应商 A材料 300 件 单价 9 元").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-ocr-upload"
  );

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalPeriodId: "period:p6ocr:2026:6",
      draftType: "purchase_order",
      sourceObjectType: "uploaded_quote",
      userInstruction: "根据上传的报价单生成采购订单草稿",
      attachmentIds: [attachment.body.id],
      evidenceRefs: ["quote:manual-context"],
      dryRun: true
    },
    "phase6-ocr-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.ocrResults[0].attachmentId, attachment.body.id);
  assert.equal(candidate.body.ocrResults[0].provider, "local-ocr-placeholder");
  assert.match(candidate.body.ocrResults[0].extractedText, /A材料 300 件 单价 9/);
  assert.match(candidate.body.llmDraftRun.inputSummary.ocrText, /A材料 300 件 单价 9/);
  assert.equal(candidate.body.draftPayload.lines[0].quantity, 300);
  assert.equal(candidate.body.draftPayload.lines[0].unitPrice, 9);
  assert.deepEqual(candidate.body.evidenceRefs, ["quote:manual-context", attachment.body.id]);
});

test("Phase 6 Agent draft generation uses configured OCR and LLM adapters", async () => {
  const calls = { ocr: [], llm: [] };
  const api = createApi({
    ocrAdapter: {
      provider: "local-paddle-ocr",
      model: "ppocr-v4",
      async extractText({ attachment, content }) {
        calls.ocr.push({ filename: attachment.filename, byteSize: content.length });
        return {
          provider: "local-paddle-ocr",
          model: "ppocr-v4",
          status: "completed",
          extractedText: "OCR adapter: B material 7 units price 11",
          confidence: 0.93
        };
      }
    },
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "erp-draft-model",
      async generateDraft(input) {
        calls.llm.push(input);
        return {
          provider: "openai-compatible",
          model: "erp-draft-model",
          status: "completed",
          draftPayload: {
            documentType: "purchase_order",
            businessDate: "2026-06-01",
            counterpartyId: null,
            lines: [{ itemId: null, itemName: "B material", quantity: 7, unitPrice: 11, amount: 77 }]
          },
          unmatchedItems: [{ field: "supplierId", reason: "Supplier must be selected before saving." }],
          outputSchema: "purchase_order"
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6ADAPT",
      name: "Phase 6 Adapter Draft",
      companyName: "Phase 6 Adapter Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-adapter-account-set"
  );
  const imageContent = Buffer.from("pretend image bytes");
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "quote.png",
      contentType: "image/png",
      byteSize: imageContent.length,
      contentBase64: imageContent.toString("base64"),
      uploadedBy: "system"
    },
    "phase6-adapter-upload"
  );

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "purchase_order",
      sourceObjectType: "uploaded_quote",
      userInstruction: "Generate a purchase order draft from the uploaded quote.",
      attachmentIds: [attachment.body.id],
      evidenceRefs: ["quote:adapter"],
      dryRun: true
    },
    "phase6-adapter-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(calls.ocr.length, 1);
  assert.deepEqual(calls.ocr[0], { filename: "quote.png", byteSize: imageContent.length });
  assert.equal(calls.llm.length, 1);
  assert.equal(calls.llm[0].draftType, "purchase_order");
  assert.match(calls.llm[0].ocrText, /B material 7 units price 11/);
  assert.deepEqual(calls.llm[0].evidenceRefs, ["quote:adapter", attachment.body.id]);
  assert.equal(candidate.body.ocrResults[0].provider, "local-paddle-ocr");
  assert.equal(candidate.body.ocrResults[0].model, "ppocr-v4");
  assert.equal(candidate.body.llmDraftRun.provider, "openai-compatible");
  assert.equal(candidate.body.llmDraftRun.model, "erp-draft-model");
  assert.equal(candidate.body.draftPayload.lines[0].quantity, 7);
  assert.equal(candidate.body.draftPayload.lines[0].unitPrice, 11);
});

test("Phase 6 Agent draft generation matches supplier and inventory item master data before review", async () => {
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "match-model",
      async generateDraft() {
        return {
          provider: "openai-compatible",
          model: "match-model",
          status: "completed",
          draftPayload: {
            documentType: "purchase_order",
            businessDate: "2026-06-13",
            supplierCode: "SUP-MATCH",
            lines: [{ itemCode: "ITEM-MATCH", itemName: "Matched Item", quantity: 4, unitPrice: 25, amount: 100 }]
          },
          unmatchedItems: [],
          outputSchema: "purchase_order"
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6MATCH",
      name: "Phase 6 Match Draft",
      companyName: "Phase 6 Match Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-match-account-set"
  );
  const supplier = await request(
    api,
    "POST",
    "/partners",
    {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "SUP-MATCH",
      name: "Matched Supplier",
      createdBy: "master-data-user"
    },
    "phase6-match-supplier"
  );
  const item = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "ITEM-MATCH",
      name: "Matched Item",
      unit: "pcs",
      costMethod: "moving_average",
      createdBy: "master-data-user"
    },
    "phase6-match-item"
  );

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "purchase_order",
      sourceObjectType: "uploaded_quote",
      userInstruction: "Generate a purchase order draft for SUP-MATCH and ITEM-MATCH.",
      evidenceRefs: ["quote:match-001"],
      dryRun: true
    },
    "phase6-match-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.draftPayload.supplierId, supplier.body.id);
  assert.equal(candidate.body.draftPayload.lines[0].itemId, item.body.id);
  assert.ok(candidate.body.matchedMasterData.some((match) => match.field === "supplierId" && match.objectId === supplier.body.id));
  assert.ok(candidate.body.matchedMasterData.some((match) => match.field === "lines[0].itemId" && match.objectId === item.body.id));
  assert.ok(!candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "supplierId"));
  assert.ok(!candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "lines[0].itemId"));
  assert.equal(candidate.body.dryRunResult.status, "ready_for_confirmation");
});

test("Phase 6 Agent voucher draft generation matches chart accounts before review", async () => {
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "voucher-match-model",
      async generateDraft() {
        return {
          provider: "openai-compatible",
          model: "voucher-match-model",
          status: "completed",
          draftPayload: {
            documentType: "voucher",
            lines: [
              { summary: "Office supplies", accountName: "Office Expense", debit: 100, credit: 0 },
              { summary: "Bank payment", accountName: "Bank Deposits", debit: 0, credit: 100 }
            ]
          },
          unmatchedItems: [],
          outputSchema: "voucher"
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6VMATCH",
      name: "Phase 6 Voucher Match",
      companyName: "Phase 6 Voucher Match Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-voucher-match-account-set"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    },
    "phase6-voucher-match-expense"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "phase6-voucher-match-bank"
  );

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "voucher",
      sourceObjectType: "uploaded_invoice",
      userInstruction: "Generate a voucher draft for office supplies paid by bank.",
      evidenceRefs: ["invoice:voucher-match"],
      dryRun: true
    },
    "phase6-voucher-match-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.draftPayload.lines[0].accountCode, "6602");
  assert.equal(candidate.body.draftPayload.lines[1].accountCode, "1002");
  assert.ok(candidate.body.matchedMasterData.some((match) => match.field === "lines[0].accountCode" && match.objectType === "account"));
  assert.ok(candidate.body.matchedMasterData.some((match) => match.field === "lines[1].accountCode" && match.objectType === "account"));
  assert.ok(!candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "lines[0].accountCode"));
  assert.ok(!candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "lines[1].accountCode"));
  assert.equal(candidate.body.dryRunResult.status, "ready_for_confirmation");
});

test("Phase 6 Agent OCR preview supports human-corrected text before LLM draft generation", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6OCRREV",
      name: "Phase 6 OCR Review",
      companyName: "Phase 6 OCR Review Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-ocr-review-account-set"
  );
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "warehouse-note.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("raw OCR says 5 units price 6"),
      contentBase64: Buffer.from("raw OCR says 5 units price 6").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-ocr-review-upload"
  );

  const preview = await request(
    api,
    "POST",
    "/ai/ocr-preview",
    {
      accountSetId: accountSet.body.id,
      attachmentIds: [attachment.body.id],
      requestedBy: "system",
      dryRun: true
    },
    "phase6-ocr-preview"
  );

  assert.equal(preview.status, 201);
  assert.equal(preview.body.accountSetId, accountSet.body.id);
  assert.equal(preview.body.results[0].attachmentId, attachment.body.id);
  assert.match(preview.body.results[0].extractedText, /5 units price 6/);
  assert.equal(api.state.agentDraftCandidates.size, 0);

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "inventory_movement",
      sourceObjectType: "ocr_preview",
      userInstruction: "Create warehouse inbound draft from reviewed OCR.",
      attachmentIds: [attachment.body.id],
      reviewedOcrResults: [
        {
          attachmentId: attachment.body.id,
          extractedText: "reviewed OCR says 12 units price 34",
          reviewedBy: "warehouse-user"
        }
      ],
      dryRun: true
    },
    "phase6-ocr-reviewed-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.ocrResults[0].extractedText, "reviewed OCR says 12 units price 34");
  assert.match(candidate.body.ocrResults[0].originalExtractedText, /5 units price 6/);
  assert.equal(candidate.body.ocrResults[0].reviewedBy, "warehouse-user");
  assert.match(candidate.body.llmDraftRun.inputSummary.ocrText, /12 units price 34/);
  assert.doesNotMatch(candidate.body.llmDraftRun.inputSummary.ocrText, /5 units price 6/);
  assert.equal(candidate.body.draftPayload.lines[0].quantity, 12);
  assert.equal(candidate.body.draftPayload.lines[0].unitCost, 34);
});

test("Phase 6 LLM draft run endpoint exposes the provider-neutral adapter without saving business drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6LLM",
      name: "Phase 6 LLM Draft Run",
      companyName: "Phase 6 LLM Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-llm-account-set"
  );

  const run = await request(
    api,
    "POST",
    "/ai/llm-draft-runs",
    {
      accountSetId: accountSet.body.id,
      draftType: "voucher",
      userInstruction: "根据银行回单生成 500 元办公费凭证草稿",
      evidenceRefs: ["bank-receipt:001"],
      dryRun: true
    },
    "phase6-llm-draft-run"
  );

  assert.equal(run.status, 201);
  assert.equal(run.body.provider, "local-rule-based");
  assert.equal(run.body.status, "completed");
  assert.equal(run.body.inputSummary.draftType, "voucher");
  assert.deepEqual(run.body.inputSummary.evidenceRefs, ["bank-receipt:001"]);
  assert.equal(api.state.llmDraftRuns.get(run.body.id).id, run.body.id);
  assert.equal(api.state.agentDraftCandidates.size, 0);
});

test("Phase 6 LLM draft runs can be listed by account set for Agent observability", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6LLMLIST",
      name: "Phase 6 LLM Run List",
      companyName: "Phase 6 LLM List Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-llm-list-account-set"
  );
  const otherAccountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6LLMOTHER",
      name: "Phase 6 LLM Other",
      companyName: "Phase 6 LLM Other Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-llm-other-account-set"
  );

  const purchaseRun = await request(
    api,
    "POST",
    "/ai/llm-draft-runs",
    {
      accountSetId: accountSet.body.id,
      draftType: "purchase_order",
      userInstruction: "Generate purchase order draft for 2 units at 9 each.",
      evidenceRefs: ["quote:001"],
      dryRun: true
    },
    "phase6-llm-list-run-purchase"
  );
  await request(
    api,
    "POST",
    "/ai/llm-draft-runs",
    {
      accountSetId: accountSet.body.id,
      draftType: "voucher",
      userInstruction: "Generate a 500 CNY expense voucher draft.",
      evidenceRefs: ["receipt:001"],
      dryRun: true
    },
    "phase6-llm-list-run-voucher"
  );
  await request(
    api,
    "POST",
    "/ai/llm-draft-runs",
    {
      accountSetId: otherAccountSet.body.id,
      draftType: "voucher",
      userInstruction: "Other tenant voucher.",
      dryRun: true
    },
    "phase6-llm-list-run-other"
  );

  const list = await request(api, "GET", `/ai/llm-draft-runs?accountSetId=${encodeURIComponent(accountSet.body.id)}`);

  assert.equal(list.status, 200);
  assert.equal(list.body.accountSetId, accountSet.body.id);
  assert.equal(list.body.total, 2);
  assert.deepEqual(
    list.body.items.map((run) => run.accountSetId),
    [accountSet.body.id, accountSet.body.id]
  );
  assert.match(list.body.items[0].id, /^llm-draft-run:/);
  assert.equal(list.body.items[0].status, "completed");
  assert.equal(list.body.items[0].errorMessage, null);
  assert.ok(list.body.items.some((run) => run.id === purchaseRun.body.id));

  const purchaseList = await request(
    api,
    "GET",
    `/ai/llm-draft-runs?accountSetId=${encodeURIComponent(accountSet.body.id)}&draftType=purchase_order&status=completed`
  );

  assert.equal(purchaseList.status, 200);
  assert.equal(purchaseList.body.total, 1);
  assert.equal(purchaseList.body.items[0].id, purchaseRun.body.id);
  assert.equal(purchaseList.body.items[0].draftType, "purchase_order");
});

test("Phase 6 LLM draft metrics summarize schema success and human review outcomes", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6MET",
      name: "Phase 6 LLM Metrics",
      companyName: "Phase 6 Metrics Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-llm-metrics-account-set"
  );
  const item = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "P6-MET-ITEM",
      name: "Phase 6 Metrics Item",
      unit: "pcs",
      costMethod: "moving_average",
      createdBy: "warehouse-reviewer"
    },
    "phase6-llm-metrics-item"
  );
  const warehouse = await request(
    api,
    "POST",
    "/warehouses",
    {
      accountSetId: accountSet.body.id,
      code: "P6-MET-WH",
      name: "Phase 6 Metrics Warehouse",
      locations: [{ code: "A-01", name: "A Bin" }],
      createdBy: "warehouse-reviewer"
    },
    "phase6-llm-metrics-warehouse"
  );
  const convertedCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "inventory_movement",
      userInstruction: "Generate a warehouse receipt draft",
      evidenceRefs: ["warehouse:metrics-converted"],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-llm-metrics-converted-candidate"
  );
  const rejectedCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "inventory_movement",
      userInstruction: "Generate a warehouse receipt draft that will be rejected",
      evidenceRefs: ["warehouse:metrics-rejected"],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-llm-metrics-rejected-candidate"
  );
  const pendingCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "inventory_movement",
      userInstruction: "Generate a warehouse receipt draft still pending review",
      evidenceRefs: ["warehouse:metrics-pending"],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-llm-metrics-pending-candidate"
  );

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(convertedCandidate.body.id)}/convert`,
    {
      reviewedBy: "warehouse-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(convertedCandidate, {
        itemId: item.body.id,
        warehouseId: warehouse.body.id
      }),
      reviewedDraftPayload: {
        documentType: "inventory_movement",
        movementType: "inbound",
        businessType: "other_inbound",
        fiscalYear: 2026,
        periodNo: 1,
        lines: [{ itemId: item.body.id, warehouseId: warehouse.body.id, locationId: warehouse.body.locations[0].id, quantity: 1, unitCost: 10 }]
      }
    },
    "phase6-llm-metrics-convert"
  );
  const rejected = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(rejectedCandidate.body.id)}/reject`,
    {
      rejectedBy: "warehouse-reviewer",
      rejectionReason: "Model output did not match warehouse evidence."
    },
    "phase6-llm-metrics-reject"
  );

  const originalAdapter = api.state.config.llmDraftAdapter;
  api.state.config.llmDraftAdapter = {
    provider: "openai-compatible",
    model: "metrics-model",
    async generateDraft() {
      throw new Error("LLM draft output schema validation failed: draftPayload.lines is required.");
    }
  };
  const failedRun = await request(
    api,
    "POST",
    "/ai/llm-draft-runs",
    {
      accountSetId: accountSet.body.id,
      draftType: "inventory_movement",
      userInstruction: "Generate an invalid metrics draft",
      evidenceRefs: ["warehouse:metrics-failed"],
      dryRun: true
    },
    "phase6-llm-metrics-failed-run"
  );
  api.state.config.llmDraftAdapter = originalAdapter;

  const metrics = await request(
    api,
    "GET",
    `/ai/llm-draft-runs/metrics?accountSetId=${encodeURIComponent(accountSet.body.id)}&draftType=inventory_movement`
  );

  assert.equal(converted.status, 201);
  assert.equal(rejected.status, 200);
  assert.equal(pendingCandidate.status, 201);
  assert.equal(failedRun.status, 201);
  assert.equal(failedRun.body.status, "failed");
  assert.equal(metrics.status, 200);
  assert.equal(metrics.body.accountSetId, accountSet.body.id);
  assert.equal(metrics.body.draftType, "inventory_movement");
  assert.equal(metrics.body.totalRuns, 4);
  assert.equal(metrics.body.completedRuns, 3);
  assert.equal(metrics.body.failedRuns, 1);
  assert.equal(metrics.body.schemaSuccessRate, 0.75);
  assert.equal(metrics.body.candidateCount, 3);
  assert.equal(metrics.body.convertedCandidates, 1);
  assert.equal(metrics.body.rejectedCandidates, 1);
  assert.equal(metrics.body.pendingCandidates, 1);
  assert.equal(metrics.body.adoptionRate, 0.33);
  assert.equal(metrics.body.rejectionRate, 0.33);
  assert.equal(metrics.body.humanCorrectionRate, 0.33);
  assert.ok(metrics.body.providerBreakdown.some((item) => item.provider === "local-rule-based" && item.completedRuns === 3));
  assert.ok(metrics.body.providerBreakdown.some((item) => item.provider === "openai-compatible" && item.failedRuns === 1));
});

test("Phase 6 Agent draft candidates can be reviewed and converted into voucher drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6CONV",
      name: "Phase 6 Draft Convert",
      companyName: "Phase 6 Convert Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-convert-account-set"
  );
  await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/periods/generate`,
    { fiscalYear: 2026, startPeriod: 1, endPeriod: 12 },
    "phase6-convert-periods"
  );
  await request(
    api,
    "POST",
    "/accounts",
    { accountSetId: accountSet.body.id, code: "6602", name: "管理费用", normalBalance: "debit" },
    "phase6-convert-account-6602"
  );
  await request(
    api,
    "POST",
    "/accounts",
    { accountSetId: accountSet.body.id, code: "1002", name: "银行存款", normalBalance: "debit" },
    "phase6-convert-account-1002"
  );
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "bank-receipt.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("银行回单 办公费 500 元"),
      contentBase64: Buffer.from("银行回单 办公费 500 元").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-convert-upload"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "voucher",
      sourceObjectType: "bank_receipt",
      userInstruction: "根据银行回单生成办公费 500 元记账凭证草稿",
      attachmentIds: [attachment.body.id],
      dryRun: true
    },
    "phase6-convert-candidate"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "phase6-convert-periods");

  const loaded = await request(api, "GET", `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}`);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.id, candidate.body.id);
  assert.equal(loaded.body.status, "candidate");

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "reviewer:p6",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, ["6602", "1002"]),
      reviewedDraftPayload: {
        documentType: "voucher",
        accountSetId: accountSet.body.id,
        fiscalYear: 2026,
        periodNo: 1,
        voucherDate: "2026-01-31",
        lines: [
          { summary: "办公费", accountCode: "6602", debit: 500, credit: 0 },
          { summary: "银行付款", accountCode: "1002", debit: 0, credit: 500 }
        ]
      }
    },
    "phase6-convert-candidate-to-voucher"
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.attachmentCount, 1);
  assert.equal(converted.body.lines[0].accountCode, "6602");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectId, converted.body.id);
  assert.ok(api.state.attachmentLinks.some((link) => link.attachmentId === attachment.body.id && link.objectId === converted.body.id));
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent.draft_candidate.convert" && log.objectType === "voucher" && log.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent draft conversion requires unresolved fields to be reviewed", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6MATCH",
      name: "Phase 6 Match Gate",
      companyName: "Phase 6 Match Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-match-account-set"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "voucher",
      sourceObjectType: "bank_receipt",
      userInstruction: "根据银行回单生成办公费 300 元记账凭证草稿",
      dryRun: true
    },
    "phase6-match-candidate"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "phase6-match-periods");
  const reviewedDraftPayload = {
    documentType: "voucher",
    accountSetId: accountSet.body.id,
    fiscalYear: 2026,
    periodNo: 1,
    voucherDate: "2026-01-31",
    lines: [
      { summary: "办公费", accountCode: "6602", debit: 300, credit: 0 },
      { summary: "银行付款", accountCode: "1002", debit: 0, credit: 300 }
    ]
  };

  const blocked = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "reviewer:p6",
      reviewedDraftPayload
    },
    "phase6-match-convert-blocked"
  );
  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "reviewer:p6",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, ["6602", "1002"]),
      reviewedDraftPayload
    },
    "phase6-match-convert-resolved"
  );

  assert.equal(candidate.status, 201);
  assert.ok(candidate.body.unmatchedItems.length > 0);
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.code, "AGENT_DRAFT_UNMATCHED_ITEMS_UNRESOLVED");
  assert.equal(converted.status, 201);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.deepEqual(
    api.state.agentDraftCandidates.get(candidate.body.id).resolvedUnmatchedItems.map((item) => item.field),
    candidate.body.unmatchedItems.map((item) => item.field)
  );
});

test("Phase 6 Agent draft candidates can be rejected with review reason", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6REJ",
      name: "Phase 6 Reject Draft",
      companyName: "Phase 6 Reject Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-reject-account-set"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "purchase_order",
      userInstruction: "Generate a purchase order candidate that should be rejected",
      evidenceRefs: ["quote:reject"],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-reject-candidate"
  );

  const rejected = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/reject`,
    {
      rejectedBy: "purchase-reviewer",
      rejectionReason: "Supplier and item matching were not trustworthy."
    },
    "phase6-reject-candidate-action"
  );
  const convertAfterReject = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "purchase-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, "manual"),
      reviewedDraftPayload: {
        documentType: "purchase_order",
        supplierId: "partner:missing",
        orderDate: "2026-01-31",
        lines: [{ itemCode: "P6-REJ", itemName: "Rejected item", quantity: 1, unitPrice: 1, taxRate: 0 }]
      }
    },
    "phase6-reject-convert-after"
  );
  const rejectedQueue = await request(
    api,
    "GET",
    `/agent/draft-candidates?accountSetId=${encodeURIComponent(accountSet.body.id)}&status=rejected`
  );

  assert.equal(candidate.status, 201);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, "rejected");
  assert.equal(rejected.body.rejectedBy, "purchase-reviewer");
  assert.equal(rejected.body.rejectionReason, "Supplier and item matching were not trustworthy.");
  assert.equal(convertAfterReject.status, 400);
  assert.match(convertAfterReject.body.message, /Only candidate Agent drafts can be converted/);
  assert.equal(rejectedQueue.body.total, 1);
  assert.equal(rejectedQueue.body.items[0].id, candidate.body.id);
  assert.equal(rejectedQueue.body.items[0].status, "rejected");
  assert.ok(
    api.state.auditLogs.some(
      (log) =>
        log.action === "agent.draft_candidate.reject" &&
        log.objectType === "agent_draft_candidate" &&
        log.objectId === candidate.body.id
    )
  );
});

test("Phase 6 Agent purchase-order draft candidates convert into purchase order drafts after review", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6PO",
      name: "Phase 6 Purchase Drafts",
      companyName: "Phase 6 Purchase Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-purchase-draft-account-set"
  );
  const supplier = await request(
    api,
    "POST",
    "/partners",
    {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "P6-SUP",
      name: "Phase 6 Supplier",
      paymentTerms: "NET30",
      settlementMethod: "bank_transfer"
    },
    "phase6-purchase-draft-supplier"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "purchase_order",
      userInstruction: "Generate a purchase order draft for materials",
      evidenceRefs: ["quote:PO-001"],
      attachmentIds: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-purchase-draft-candidate"
  );

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "purchase-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, supplier.body.id),
      reviewedDraftPayload: {
        documentType: "purchase_order",
        supplierId: supplier.body.id,
        orderDate: "2026-01-18",
        currency: "CNY",
        exchangeRate: 1,
        lines: [{ itemCode: "MAT-P6", itemName: "Phase 6 material", quantity: 3, unitPrice: 200, taxRate: 0.13 }]
      }
    },
    "phase6-convert-candidate-to-purchase-order"
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.supplierId, supplier.body.id);
  assert.equal(converted.body.totalAmount, 678);
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "purchase_order");
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent.draft_candidate.convert" && log.objectType === "purchase_order" && log.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent sales-order draft candidates convert into sales order drafts after review", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6SO",
      name: "Phase 6 Sales Drafts",
      companyName: "Phase 6 Sales Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-sales-draft-account-set"
  );
  const customer = await request(
    api,
    "POST",
    "/partners",
    {
      accountSetId: accountSet.body.id,
      partnerType: "customer",
      code: "P6-CUS",
      name: "Phase 6 Customer",
      creditLimit: 100000,
      isEnabled: true
    },
    "phase6-sales-draft-customer"
  );
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "sales-order.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("customer order material 2 price 300"),
      contentBase64: Buffer.from("customer order material 2 price 300").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-sales-draft-upload"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "sales_order",
      sourceObjectType: "uploaded_customer_order",
      userInstruction: "Create sales order draft for customer order, material 2 price 300.",
      attachmentIds: [attachment.body.id],
      dryRun: true
    },
    "phase6-sales-draft-candidate"
  );

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "reviewer:p6-sales",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, customer.body.id),
      reviewedDraftPayload: {
        documentType: "sales_order",
        customerId: customer.body.id,
        orderDate: "2026-06-12",
        currency: "CNY",
        exchangeRate: 1,
        lines: [{ itemCode: "SO-MAT", itemName: "Sales material", quantity: 2, unitPrice: 300, taxRate: 0.13 }]
      }
    },
    "phase6-convert-candidate-to-sales-order"
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.customerId, customer.body.id);
  assert.equal(converted.body.totalAmount, 678);
  assert.equal(converted.body.lines[0].quantity, 2);
  assert.equal(converted.body.lines[0].unitPrice, 300);
  assert.equal(api.state.salesOrders.get(converted.body.id).id, converted.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "sales_order");
  assert.ok(
    api.state.attachmentLinks.some(
      (link) => link.attachmentId === attachment.body.id && link.objectType === "sales_order" && link.objectId === converted.body.id
    )
  );
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent.draft_candidate.convert" && log.objectType === "sales_order" && log.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent inventory movement candidates convert into non-mutating warehouse drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6INV",
      name: "Phase 6 Inventory Drafts",
      companyName: "Phase 6 Inventory Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-inventory-draft-account-set"
  );
  const item = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "P6-MAT",
      name: "Phase 6 Material",
      unit: "pcs",
      costMethod: "moving_average",
      createdBy: "warehouse-reviewer"
    },
    "phase6-inventory-draft-item"
  );
  const warehouse = await request(
    api,
    "POST",
    "/warehouses",
    {
      accountSetId: accountSet.body.id,
      code: "P6-WH",
      name: "Phase 6 Warehouse",
      locations: [{ code: "A-01", name: "A Bin" }],
      createdBy: "warehouse-reviewer"
    },
    "phase6-inventory-draft-warehouse"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "inventory_movement",
      userInstruction: "Generate a warehouse receipt draft",
      evidenceRefs: ["warehouse:instruction"],
      attachmentIds: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-inventory-draft-candidate"
  );

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "warehouse-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, {
        itemId: item.body.id,
        warehouseId: warehouse.body.id
      }),
      reviewedDraftPayload: {
        documentType: "inventory_movement",
        movementType: "inbound",
        businessType: "other_inbound",
        fiscalYear: 2026,
        periodNo: 1,
        lines: [{ itemId: item.body.id, warehouseId: warehouse.body.id, locationId: warehouse.body.locations[0].id, quantity: 1, unitCost: 10 }]
      }
    },
    "phase6-convert-candidate-to-inventory-movement"
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.movementType, "inbound");
  assert.equal(converted.body.costStatus, "not_calculated");
  assert.equal(converted.body.lines[0].itemId, item.body.id);
  assert.equal(api.state.inventoryMovements.size, 0);
  assert.equal(api.state.inventoryBalances.size, 0);
  assert.equal(api.state.inventoryMovementDrafts.size, 1);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "inventory_movement_draft");
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent.draft_candidate.convert" && log.objectType === "inventory_movement_draft" && log.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent production candidates convert into non-mutating material issue and receipt drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6PROD",
      name: "Phase 6 Production Drafts",
      companyName: "Phase 6 Production Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-production-draft-account-set"
  );
  const rawMaterial = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "P6-RM",
      name: "Phase 6 Raw Material",
      unit: "pcs",
      costMethod: "moving_average",
      createdBy: "production-reviewer"
    },
    "phase6-production-draft-raw"
  );
  const finishedGood = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "P6-FG",
      name: "Phase 6 Finished Good",
      unit: "pcs",
      costMethod: "moving_average",
      isManufactured: true,
      createdBy: "production-reviewer"
    },
    "phase6-production-draft-fg"
  );
  const warehouse = await request(
    api,
    "POST",
    "/warehouses",
    {
      accountSetId: accountSet.body.id,
      code: "P6-PROD-WH",
      name: "Phase 6 Production Warehouse",
      locations: [{ code: "LINE-01", name: "Line 01" }],
      createdBy: "production-reviewer"
    },
    "phase6-production-draft-warehouse"
  );
  const bom = await request(
    api,
    "POST",
    "/boms",
    {
      accountSetId: accountSet.body.id,
      productItemId: finishedGood.body.id,
      version: "V1",
      status: "active",
      yieldQuantity: 1,
      createdBy: "production-reviewer",
      lines: [{ componentItemId: rawMaterial.body.id, quantity: 2, scrapRate: 0, lineNo: 1 }]
    },
    "phase6-production-draft-bom"
  );
  const workOrder = await request(
    api,
    "POST",
    "/work-orders",
    {
      accountSetId: accountSet.body.id,
      workOrderNo: "P6-WO-001",
      productItemId: finishedGood.body.id,
      bomId: bom.body.id,
      plannedQuantity: 5,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: "production-reviewer"
    },
    "phase6-production-draft-work-order"
  );
  await request(
    api,
    "POST",
    `/work-orders/${encodeURIComponent(workOrder.body.id)}/release`,
    { releasedBy: "production-reviewer" },
    "phase6-production-draft-release"
  );
  const initialMovementCount = api.state.inventoryMovements.size;

  const requisitionCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "material_requisition",
      sourceObjectType: "work_order",
      sourceObjectId: workOrder.body.id,
      userInstruction: "Generate material issue draft for work order P6-WO-001.",
      evidenceRefs: ["work-order:P6-WO-001"],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-production-requisition-candidate"
  );
  const receiptCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "product_receipt",
      sourceObjectType: "work_order",
      sourceObjectId: workOrder.body.id,
      userInstruction: "Generate finished goods receipt draft for work order P6-WO-001.",
      evidenceRefs: ["work-order:P6-WO-001"],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-production-receipt-candidate"
  );

  const requisitionDraft = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(requisitionCandidate.body.id)}/convert`,
    {
      reviewedBy: "production-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(requisitionCandidate, {
        workOrderId: workOrder.body.id,
        componentItemId: rawMaterial.body.id,
        warehouseId: warehouse.body.id
      }),
      reviewedDraftPayload: {
        documentType: "material_requisition",
        requisitionNo: "P6-MR-DRAFT",
        workOrderId: workOrder.body.id,
        fiscalYear: 2026,
        periodNo: 1,
        lines: [
          {
            componentItemId: rawMaterial.body.id,
            warehouseId: warehouse.body.id,
            locationId: warehouse.body.locations[0].id,
            quantity: 10
          }
        ]
      }
    },
    "phase6-production-requisition-convert"
  );
  const receiptDraft = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(receiptCandidate.body.id)}/convert`,
    {
      reviewedBy: "production-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(receiptCandidate, {
        workOrderId: workOrder.body.id,
        productItemId: finishedGood.body.id,
        warehouseId: warehouse.body.id
      }),
      reviewedDraftPayload: {
        documentType: "product_receipt",
        receiptNo: "P6-PR-DRAFT",
        workOrderId: workOrder.body.id,
        fiscalYear: 2026,
        periodNo: 1,
        lines: [
          {
            productItemId: finishedGood.body.id,
            warehouseId: warehouse.body.id,
            locationId: warehouse.body.locations[0].id,
            quantity: 5
          }
        ]
      }
    },
    "phase6-production-receipt-convert"
  );

  assert.equal(requisitionCandidate.status, 201);
  assert.equal(receiptCandidate.status, 201);
  assert.equal(requisitionDraft.status, 201);
  assert.equal(requisitionDraft.body.status, "draft");
  assert.equal(requisitionDraft.body.sourceType, "agent_draft");
  assert.equal(requisitionDraft.body.sourceMovementId, null);
  assert.equal(requisitionDraft.body.agentDraftCandidateId, requisitionCandidate.body.id);
  assert.equal(requisitionDraft.body.lines[0].componentItemId, rawMaterial.body.id);
  assert.equal(receiptDraft.status, 201);
  assert.equal(receiptDraft.body.status, "draft");
  assert.equal(receiptDraft.body.costStatus, "draft_pending_cost");
  assert.equal(receiptDraft.body.sourceType, "agent_draft");
  assert.equal(receiptDraft.body.sourceMovementId, null);
  assert.equal(receiptDraft.body.agentDraftCandidateId, receiptCandidate.body.id);
  assert.equal(receiptDraft.body.lines[0].productItemId, finishedGood.body.id);
  assert.equal(api.state.inventoryMovements.size, initialMovementCount);
  assert.equal(api.state.workOrders.get(workOrder.body.id).directMaterialCost, 0);
  assert.equal(api.state.workOrders.get(workOrder.body.id).completedQuantity, 0);
  assert.equal(api.state.agentDraftCandidates.get(requisitionCandidate.body.id).convertedObjectType, "material_requisition_draft");
  assert.equal(api.state.agentDraftCandidates.get(receiptCandidate.body.id).convertedObjectType, "product_receipt_draft");
});

test("Phase 6 Agent draft generation hydrates work-order source context for LLM production drafts", async () => {
  const calls = { llm: [] };
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "source-context-model",
      async generateDraft(input) {
        calls.llm.push(input);
        return {
          provider: "openai-compatible",
          model: "source-context-model",
          status: "completed",
          outputSchema: input.draftType
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6CTX",
      name: "Phase 6 Source Context",
      companyName: "Phase 6 Source Context Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-source-context-account-set"
  );
  const rawMaterial = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "CTX-RM",
      name: "Context Raw Material",
      unit: "pcs",
      costMethod: "moving_average",
      createdBy: "context-reviewer"
    },
    "phase6-source-context-raw"
  );
  const finishedGood = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "CTX-FG",
      name: "Context Finished Good",
      unit: "pcs",
      costMethod: "moving_average",
      isManufactured: true,
      createdBy: "context-reviewer"
    },
    "phase6-source-context-fg"
  );
  const bom = await request(
    api,
    "POST",
    "/boms",
    {
      accountSetId: accountSet.body.id,
      productItemId: finishedGood.body.id,
      version: "CTX-V1",
      status: "active",
      yieldQuantity: 1,
      createdBy: "context-reviewer",
      lines: [{ componentItemId: rawMaterial.body.id, quantity: 2, scrapRate: 0, lineNo: 1 }]
    },
    "phase6-source-context-bom"
  );
  const workOrder = await request(
    api,
    "POST",
    "/work-orders",
    {
      accountSetId: accountSet.body.id,
      workOrderNo: "CTX-WO-001",
      productItemId: finishedGood.body.id,
      bomId: bom.body.id,
      plannedQuantity: 6,
      fiscalYear: 2026,
      periodNo: 1,
      createdBy: "context-reviewer"
    },
    "phase6-source-context-work-order"
  );

  const requisitionCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "material_requisition",
      sourceObjectType: "work_order",
      sourceObjectId: workOrder.body.id,
      userInstruction: "Generate material issue draft from the selected work order.",
      evidenceRefs: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-source-context-requisition-candidate"
  );
  const receiptCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "product_receipt",
      sourceObjectType: "work_order",
      sourceObjectId: workOrder.body.id,
      userInstruction: "Generate finished goods receipt draft from the selected work order.",
      evidenceRefs: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-source-context-receipt-candidate"
  );

  assert.equal(requisitionCandidate.status, 201);
  assert.equal(receiptCandidate.status, 201);
  assert.equal(calls.llm.length, 2);
  assert.equal(calls.llm[0].sourceContext.sourceObject.objectType, "work_order");
  assert.equal(calls.llm[0].sourceContext.sourceObject.workOrderNo, "CTX-WO-001");
  assert.equal(calls.llm[0].sourceContext.sourceObject.productItemId, finishedGood.body.id);
  assert.equal(calls.llm[0].sourceContext.sourceObject.bomLines[0].componentItemId, rawMaterial.body.id);
  assert.equal(requisitionCandidate.body.sourceContext.sourceObject.workOrderNo, "CTX-WO-001");
  assert.equal(requisitionCandidate.body.draftPayload.workOrderId, workOrder.body.id);
  assert.equal(requisitionCandidate.body.draftPayload.lines[0].componentItemId, rawMaterial.body.id);
  assert.equal(requisitionCandidate.body.draftPayload.lines[0].quantity, 12);
  assert.ok(!requisitionCandidate.body.unmatchedItems.some((item) => item.field === "workOrderId"));
  assert.ok(!requisitionCandidate.body.unmatchedItems.some((item) => item.field === "lines[0].componentItemId"));
  assert.ok(requisitionCandidate.body.unmatchedItems.some((item) => item.field === "lines[0].warehouseId"));
  assert.equal(receiptCandidate.body.draftPayload.workOrderId, workOrder.body.id);
  assert.equal(receiptCandidate.body.draftPayload.lines[0].productItemId, finishedGood.body.id);
  assert.equal(receiptCandidate.body.draftPayload.lines[0].quantity, 6);
  assert.match(receiptCandidate.body.llmDraftRun.inputSummary.sourceContext.sourceObject.workOrderNo, /CTX-WO-001/);
});

test("Phase 6 Agent draft generation hydrates order source context for LLM order drafts", async () => {
  const calls = { llm: [] };
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "order-source-context-model",
      async generateDraft(input) {
        calls.llm.push(input);
        return {
          provider: "openai-compatible",
          model: "order-source-context-model",
          status: "completed",
          outputSchema: input.draftType
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6ORDCTX",
      name: "Phase 6 Order Source Context",
      companyName: "Phase 6 Order Context Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-order-source-context-account-set"
  );
  const supplier = await request(
    api,
    "POST",
    "/partners",
    {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "ORDCTX-SUP",
      name: "Order Context Supplier",
      paymentTerms: "NET30",
      settlementMethod: "bank_transfer"
    },
    "phase6-order-source-context-supplier"
  );
  const customer = await request(
    api,
    "POST",
    "/partners",
    {
      accountSetId: accountSet.body.id,
      partnerType: "customer",
      code: "ORDCTX-CUS",
      name: "Order Context Customer",
      paymentTerms: "NET15",
      settlementMethod: "bank_transfer"
    },
    "phase6-order-source-context-customer"
  );
  const purchaseOrder = await request(
    api,
    "POST",
    "/purchase-orders",
    {
      accountSetId: accountSet.body.id,
      supplierId: supplier.body.id,
      orderDate: "2026-06-08",
      currency: "CNY",
      exchangeRate: 1,
      createdBy: "agent-user",
      lines: [{ itemCode: "PO-CTX-ITEM", itemName: "Purchase Context Item", quantity: 5, unitPrice: 18, taxRate: 0.13 }]
    },
    "phase6-order-source-context-purchase-order"
  );
  const salesOrder = await request(
    api,
    "POST",
    "/sales-orders",
    {
      accountSetId: accountSet.body.id,
      customerId: customer.body.id,
      orderDate: "2026-06-09",
      currency: "CNY",
      exchangeRate: 1,
      createdBy: "agent-user",
      lines: [{ itemCode: "SO-CTX-ITEM", itemName: "Sales Context Item", quantity: 3, unitPrice: 40, taxRate: 0.06 }]
    },
    "phase6-order-source-context-sales-order"
  );

  const purchaseCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "purchase_order",
      sourceObjectType: "purchase_order",
      sourceObjectId: purchaseOrder.body.id,
      userInstruction: "Generate a purchase order draft from the selected purchase order.",
      evidenceRefs: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-order-source-context-purchase-candidate"
  );
  const salesCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "sales_order",
      sourceObjectType: "sales_order",
      sourceObjectId: salesOrder.body.id,
      userInstruction: "Generate a sales order draft from the selected sales order.",
      evidenceRefs: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-order-source-context-sales-candidate"
  );

  assert.equal(purchaseCandidate.status, 201);
  assert.equal(salesCandidate.status, 201);
  assert.equal(calls.llm.length, 2);
  assert.equal(calls.llm[0].sourceContext.sourceObject.objectType, "purchase_order");
  assert.equal(calls.llm[0].sourceContext.sourceObject.orderNo, purchaseOrder.body.orderNo);
  assert.equal(calls.llm[0].sourceContext.sourceObject.supplierId, supplier.body.id);
  assert.equal(calls.llm[0].sourceContext.sourceObject.lines[0].itemCode, "PO-CTX-ITEM");
  assert.equal(calls.llm[1].sourceContext.sourceObject.objectType, "sales_order");
  assert.equal(calls.llm[1].sourceContext.sourceObject.orderNo, salesOrder.body.orderNo);
  assert.equal(calls.llm[1].sourceContext.sourceObject.customerId, customer.body.id);
  assert.equal(calls.llm[1].sourceContext.sourceObject.lines[0].itemCode, "SO-CTX-ITEM");
  assert.equal(purchaseCandidate.body.sourceContext.sourceObject.orderNo, purchaseOrder.body.orderNo);
  assert.equal(purchaseCandidate.body.draftPayload.supplierId, supplier.body.id);
  assert.equal(purchaseCandidate.body.draftPayload.orderDate, "2026-06-08");
  assert.equal(purchaseCandidate.body.draftPayload.lines[0].itemCode, "PO-CTX-ITEM");
  assert.equal(purchaseCandidate.body.draftPayload.lines[0].quantity, 5);
  assert.equal(purchaseCandidate.body.draftPayload.lines[0].unitPrice, 18);
  assert.ok(!purchaseCandidate.body.unmatchedItems.some((item) => item.field === "supplierId"));
  assert.ok(purchaseCandidate.body.unmatchedItems.some((item) => item.field === "lines[0].itemId"));
  assert.equal(salesCandidate.body.sourceContext.sourceObject.orderNo, salesOrder.body.orderNo);
  assert.equal(salesCandidate.body.draftPayload.customerId, customer.body.id);
  assert.equal(salesCandidate.body.draftPayload.orderDate, "2026-06-09");
  assert.equal(salesCandidate.body.draftPayload.lines[0].itemCode, "SO-CTX-ITEM");
  assert.equal(salesCandidate.body.draftPayload.lines[0].quantity, 3);
  assert.equal(salesCandidate.body.draftPayload.lines[0].unitPrice, 40);
  assert.ok(!salesCandidate.body.unmatchedItems.some((item) => item.field === "customerId"));
  assert.ok(salesCandidate.body.llmDraftRun.inputSummary.sourceContext.sourceObject.lines[0].itemCode === "SO-CTX-ITEM");
});

test("Phase 6 Agent draft generation hydrates warehouse source context for LLM inventory drafts", async () => {
  const calls = { llm: [] };
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "warehouse-source-context-model",
      async generateDraft(input) {
        calls.llm.push(input);
        return {
          provider: "openai-compatible",
          model: "warehouse-source-context-model",
          status: "completed",
          outputSchema: input.draftType
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6WHCTX",
      name: "Phase 6 Warehouse Source Context",
      companyName: "Phase 6 Warehouse Context Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-warehouse-source-context-account-set"
  );
  const item = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "WH-CTX-ITEM",
      name: "Warehouse Context Item",
      unit: "pcs",
      costMethod: "moving_average",
      createdBy: "warehouse-reviewer"
    },
    "phase6-warehouse-source-context-item"
  );
  const warehouse = await request(
    api,
    "POST",
    "/warehouses",
    {
      accountSetId: accountSet.body.id,
      code: "WH-CTX",
      name: "Warehouse Context",
      locations: [{ code: "BIN-01", name: "Bin 01" }],
      createdBy: "warehouse-reviewer"
    },
    "phase6-warehouse-source-context-warehouse"
  );
  await request(
    api,
    "POST",
    "/inventory-opening-balances",
    {
      accountSetId: accountSet.body.id,
      itemId: item.body.id,
      warehouseId: warehouse.body.id,
      locationId: warehouse.body.locations[0].id,
      fiscalYear: 2026,
      periodNo: 6,
      quantity: 10,
      amount: 100,
      createdBy: "warehouse-reviewer"
    },
    "phase6-warehouse-source-context-opening"
  );
  const movement = await request(
    api,
    "POST",
    "/inventory-movements",
    {
      accountSetId: accountSet.body.id,
      documentNo: "WHCTX-IN-001",
      movementType: "inbound",
      businessType: "other_inbound",
      fiscalYear: 2026,
      periodNo: 6,
      movementDate: "2026-06-10",
      createdBy: "warehouse-reviewer",
      lines: [
        {
          itemId: item.body.id,
          warehouseId: warehouse.body.id,
          locationId: warehouse.body.locations[0].id,
          quantity: 4,
          unitCost: 12
        }
      ]
    },
    "phase6-warehouse-source-context-movement"
  );
  const stockPreview = await request(
    api,
    "POST",
    "/stock-counts/preview",
    {
      accountSetId: accountSet.body.id,
      countNo: "WHCTX-SC-001",
      fiscalYear: 2026,
      periodNo: 6,
      createdBy: "warehouse-reviewer",
      lines: [
        {
          itemId: item.body.id,
          warehouseId: warehouse.body.id,
          locationId: warehouse.body.locations[0].id,
          actualQuantity: 12,
          reason: "cycle count"
        }
      ]
    },
    "phase6-warehouse-source-context-stock-preview"
  );
  api.state.stockCounts.set(stockPreview.body.id, stockPreview.body);

  const movementCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "inventory_movement",
      sourceObjectType: "inventory_movement",
      sourceObjectId: movement.body.id,
      userInstruction: "Generate an inventory movement draft from the selected warehouse movement.",
      evidenceRefs: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-warehouse-source-context-movement-candidate"
  );
  const stockCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "stock_count",
      sourceObjectType: "stock_count",
      sourceObjectId: stockPreview.body.id,
      userInstruction: "Generate a stock count draft from the selected count preview.",
      evidenceRefs: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-warehouse-source-context-stock-candidate"
  );

  assert.equal(movementCandidate.status, 201);
  assert.equal(stockCandidate.status, 201);
  assert.equal(calls.llm.length, 2);
  assert.equal(calls.llm[0].sourceContext.sourceObject.objectType, "inventory_movement");
  assert.equal(calls.llm[0].sourceContext.sourceObject.documentNo, "WHCTX-IN-001");
  assert.equal(calls.llm[0].sourceContext.sourceObject.lines[0].warehouseId, warehouse.body.id);
  assert.equal(calls.llm[0].sourceContext.sourceObject.lines[0].itemId, item.body.id);
  assert.equal(calls.llm[1].sourceContext.sourceObject.objectType, "stock_count");
  assert.equal(calls.llm[1].sourceContext.sourceObject.countNo, "WHCTX-SC-001");
  assert.equal(calls.llm[1].sourceContext.sourceObject.lines[0].actualQuantity, 12);
  assert.equal(movementCandidate.body.sourceContext.sourceObject.documentNo, "WHCTX-IN-001");
  assert.equal(movementCandidate.body.draftPayload.sourceMovementId, movement.body.id);
  assert.equal(movementCandidate.body.draftPayload.movementType, "inbound");
  assert.equal(movementCandidate.body.draftPayload.warehouseId, warehouse.body.id);
  assert.equal(movementCandidate.body.draftPayload.lines[0].itemId, item.body.id);
  assert.equal(movementCandidate.body.draftPayload.lines[0].quantity, 4);
  assert.equal(movementCandidate.body.draftPayload.lines[0].unitCost, 12);
  assert.ok(!movementCandidate.body.unmatchedItems.some((unmatched) => unmatched.field === "warehouseId"));
  assert.ok(!movementCandidate.body.unmatchedItems.some((unmatched) => unmatched.field === "lines[0].itemId"));
  assert.equal(stockCandidate.body.sourceContext.sourceObject.countNo, "WHCTX-SC-001");
  assert.equal(stockCandidate.body.draftPayload.sourceStockCountId, stockPreview.body.id);
  assert.equal(stockCandidate.body.draftPayload.lines[0].itemId, item.body.id);
  assert.equal(stockCandidate.body.draftPayload.lines[0].warehouseId, warehouse.body.id);
  assert.equal(stockCandidate.body.draftPayload.lines[0].actualQuantity, 12);
  assert.ok(!stockCandidate.body.unmatchedItems.some((unmatched) => unmatched.field === "lines[0].itemId"));
});

test("Phase 6 Agent draft generation hydrates voucher source context for LLM voucher drafts", async () => {
  const calls = { llm: [] };
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "voucher-source-context-model",
      async generateDraft(input) {
        calls.llm.push(input);
        return {
          provider: "openai-compatible",
          model: "voucher-source-context-model",
          status: "completed",
          outputSchema: input.draftType
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6VCHCTX",
      name: "Phase 6 Voucher Source Context",
      companyName: "Phase 6 Voucher Context Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-voucher-source-context-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "phase6-voucher-source-context-periods");
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    },
    "phase6-voucher-source-context-bank"
  );
  await request(
    api,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    },
    "phase6-voucher-source-context-expense"
  );
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherNo: "VCHCTX-001",
      voucherDate: "2026-06-12",
      createdBy: "voucher-reviewer",
      lines: [
        { summary: "Office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Bank payment", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "phase6-voucher-source-context-voucher"
  );

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "voucher",
      sourceObjectType: "voucher",
      sourceObjectId: voucher.body.id,
      userInstruction: "Generate a voucher draft from the selected voucher.",
      evidenceRefs: [`voucher:${voucher.body.id}`],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-voucher-source-context-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(calls.llm.length, 1);
  assert.equal(calls.llm[0].sourceContext.sourceObject.objectType, "voucher");
  assert.equal(calls.llm[0].sourceContext.sourceObject.voucherNo, "VCHCTX-001");
  assert.equal(calls.llm[0].sourceContext.sourceObject.fiscalYear, 2026);
  assert.equal(calls.llm[0].sourceContext.sourceObject.periodNo, 1);
  assert.equal(calls.llm[0].sourceContext.sourceObject.lines[0].accountCode, "6602");
  assert.equal(calls.llm[0].sourceContext.sourceObject.lines[0].accountName, "Office Expense");
  assert.equal(candidate.body.sourceContext.sourceObject.voucherNo, "VCHCTX-001");
  assert.equal(candidate.body.draftPayload.sourceVoucherId, voucher.body.id);
  assert.equal(candidate.body.draftPayload.sourceVoucherNo, "VCHCTX-001");
  assert.equal(candidate.body.draftPayload.voucherDate, "2026-06-12");
  assert.equal(candidate.body.draftPayload.lines[0].summary, "Office supplies");
  assert.equal(candidate.body.draftPayload.lines[0].accountCode, "6602");
  assert.equal(candidate.body.draftPayload.lines[0].accountName, "Office Expense");
  assert.equal(candidate.body.draftPayload.lines[0].debit, 500);
  assert.equal(candidate.body.draftPayload.lines[1].credit, 500);
  assert.ok(!candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "lines[].accountCode"));
  assert.equal(candidate.body.dryRunResult.status, "ready_for_confirmation");
});

test("Phase 6 Agent draft generation hydrates payroll and fixed-asset source context for LLM drafts", async () => {
  const calls = { llm: [] };
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "phase6-payroll-asset-context-model",
      async generateDraft(input) {
        calls.llm.push(input);
        return {
          provider: "openai-compatible",
          model: "phase6-payroll-asset-context-model",
          status: "completed",
          outputSchema: input.draftType
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6PACTX",
      name: "Phase 6 Payroll Asset Source Context",
      companyName: "Phase 6 Payroll Asset Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-payroll-asset-context-account-set"
  );
  const payrollCategory = await request(
    api,
    "POST",
    "/payroll-categories",
    { accountSetId: accountSet.body.id, code: "MONTHLY", name: "Monthly payroll", createdBy: "payroll-reviewer" },
    "phase6-payroll-context-category"
  );
  const profile = await request(
    api,
    "POST",
    "/employee-payroll-profiles",
    {
      accountSetId: accountSet.body.id,
      employeeNo: "P6-E001",
      employeeName: "Payroll Context Employee",
      departmentId: "D-PROD",
      departmentName: "Production",
      payrollCategoryId: payrollCategory.body.id,
      baseSalary: 10000,
      personalSocialSecurity: 1000,
      personalHousingFund: 500,
      companySocialSecurity: 1600,
      companyHousingFund: 1200,
      monthlyTaxExemption: 5000,
      createdBy: "payroll-reviewer"
    },
    "phase6-payroll-context-profile"
  );
  const variableImport = await request(
    api,
    "POST",
    "/payroll-variable-imports",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      importType: "attendance_performance",
      createdBy: "payroll-reviewer",
      lines: [{ employeeProfileId: profile.body.id, workDays: 22, performancePay: 1000, allowance: 200, deduction: 100 }]
    },
    "phase6-payroll-context-import"
  );
  const payrollRun = await request(
    api,
    "POST",
    "/payroll-runs/calculate",
    {
      accountSetId: accountSet.body.id,
      runNo: "PAY-P6-CTX",
      payrollCategoryId: payrollCategory.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      variableImportId: variableImport.body.id,
      createdBy: "payroll-reviewer"
    },
    "phase6-payroll-context-run"
  );
  const depreciationMethod = await request(
    api,
    "POST",
    "/depreciation-methods",
    {
      accountSetId: accountSet.body.id,
      code: "SL",
      name: "Straight Line",
      methodType: "straight_line",
      createdBy: "asset-reviewer"
    },
    "phase6-asset-context-method"
  );
  const assetCategory = await request(
    api,
    "POST",
    "/asset-categories",
    {
      accountSetId: accountSet.body.id,
      code: "MACHINE",
      name: "Machine",
      depreciationMethodId: depreciationMethod.body.id,
      defaultUsefulLifeMonths: 60,
      defaultSalvageRate: 0.05,
      createdBy: "asset-reviewer"
    },
    "phase6-asset-context-category"
  );
  const fixedAsset = await request(
    api,
    "POST",
    "/fixed-assets",
    {
      accountSetId: accountSet.body.id,
      assetNo: "FA-P6-CTX",
      name: "Context CNC machine",
      categoryId: assetCategory.body.id,
      depreciationMethodId: depreciationMethod.body.id,
      acquisitionType: "purchase",
      acquisitionDate: "2026-05-20",
      originalValue: 120000,
      accumulatedDepreciation: 20000,
      salvageValue: 6000,
      usefulLifeMonths: 60,
      departmentId: "D-MFG",
      departmentName: "Manufacturing",
      responsiblePerson: "Asset Owner",
      createdBy: "asset-reviewer"
    },
    "phase6-asset-context-asset"
  );

  const payrollCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "payroll_allocation",
      sourceObjectType: "payroll_run",
      sourceObjectId: payrollRun.body.id,
      userInstruction: "Generate payroll allocation draft from selected payroll run.",
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-payroll-context-candidate"
  );
  const assetCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "asset_change",
      sourceObjectType: "fixed_asset",
      sourceObjectId: fixedAsset.body.id,
      userInstruction: "Generate fixed asset improvement draft for selected asset, increase value 2500.",
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-asset-context-candidate"
  );

  assert.equal(payrollCandidate.status, 201);
  assert.equal(assetCandidate.status, 201);
  assert.equal(calls.llm.length, 2);
  assert.equal(calls.llm[0].sourceContext.sourceObject.objectType, "payroll_run");
  assert.equal(calls.llm[0].sourceContext.sourceObject.runNo, "PAY-P6-CTX");
  assert.equal(calls.llm[0].sourceContext.sourceObject.totalCompanyCost, 14000);
  assert.equal(calls.llm[0].sourceContext.sourceObject.lines[0].employeeNo, "P6-E001");
  assert.equal(calls.llm[0].sourceContext.sourceObject.lines[0].departmentId, "D-PROD");
  assert.equal(payrollCandidate.body.draftPayload.payrollRunId, payrollRun.body.id);
  assert.equal(payrollCandidate.body.draftPayload.runNo, "PAY-P6-CTX");
  assert.equal(payrollCandidate.body.draftPayload.rules[0].departmentId, "D-PROD");
  assert.equal(payrollCandidate.body.draftPayload.rules[0].amount, 14000);
  assert.equal(payrollCandidate.body.draftPayload.rules[0].allocationRate, 1);
  assert.equal(calls.llm[1].sourceContext.sourceObject.objectType, "fixed_asset");
  assert.equal(calls.llm[1].sourceContext.sourceObject.assetNo, "FA-P6-CTX");
  assert.equal(calls.llm[1].sourceContext.sourceObject.netValue, 100000);
  assert.equal(calls.llm[1].sourceContext.sourceObject.currentDepartmentId, "D-MFG");
  assert.equal(assetCandidate.body.draftPayload.fixedAssetId, fixedAsset.body.id);
  assert.equal(assetCandidate.body.draftPayload.assetNo, "FA-P6-CTX");
  assert.equal(assetCandidate.body.draftPayload.changeKind, "value_change");
  assert.equal(assetCandidate.body.draftPayload.fromDepartmentId, "D-MFG");
  assert.equal(assetCandidate.body.draftPayload.amount, 2500);
  assert.ok(!assetCandidate.body.unmatchedItems.some((unmatched) => unmatched.field === "fixedAssetId"));
});

test("Phase 6 Agent draft generation hydrates report-run source context for LLM interpretation drafts", async () => {
  const calls = { llm: [] };
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "report-source-context-model",
      async generateDraft(input) {
        calls.llm.push(input);
        return {
          provider: "openai-compatible",
          model: "report-source-context-model",
          status: "completed",
          outputSchema: input.draftType
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6RPTCTX",
      name: "Phase 6 Report Source Context",
      companyName: "Phase 6 Report Context Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-report-source-context-account-set"
  );
  const reportRun = {
    id: "report-run:p6-source-context",
    accountSetId: accountSet.body.id,
    templateVersionId: "report-template-version:p6-source-context",
    fiscalYear: 2026,
    periodNo: 6,
    includeUnposted: false,
    runMode: "formal",
    status: "calculated",
    snapshotHash: "sha256:p6-report-source-context",
    cells: [
      {
        id: "report-run-cell:p6-source-context-cash",
        sheetCode: "BS",
        cellAddress: "B10",
        label: "Cash",
        formulaText: "QC(1001)",
        calculatedValue: 120
      },
      {
        id: "report-run-cell:p6-source-context-revenue",
        sheetCode: "PL",
        cellAddress: "C20",
        label: "Revenue",
        formulaText: "FS(6001)",
        value: 800
      }
    ],
    traceLinks: [
      {
        id: "report-trace-link:p6-source-context-cash",
        traceId: "trace:cash",
        sourceType: "ledger_balance",
        accountCode: "1001",
        amount: 120
      }
    ]
  };
  api.state.reportRuns.set(reportRun.id, reportRun);

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "report_interpretation",
      sourceObjectType: "report_run",
      sourceObjectId: reportRun.id,
      userInstruction: "Generate a report interpretation draft from the selected report run.",
      evidenceRefs: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-report-source-context-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(calls.llm.length, 1);
  assert.equal(calls.llm[0].sourceContext.sourceObject.objectType, "report_run");
  assert.equal(calls.llm[0].sourceContext.sourceObject.snapshotHash, "sha256:p6-report-source-context");
  assert.equal(calls.llm[0].sourceContext.sourceObject.cells[0].evidenceRef, "report_cell:BS!B10");
  assert.equal(calls.llm[0].sourceContext.sourceObject.cells[1].calculatedValue, 800);
  assert.equal(calls.llm[0].sourceContext.sourceObject.traceLinks[0].accountCode, "1001");
  assert.equal(candidate.body.sourceContext.sourceObject.cellCount, 2);
  assert.equal(candidate.body.draftPayload.reportRunId, reportRun.id);
  assert.match(candidate.body.draftPayload.summary, /Generate a report interpretation/);
  assert.deepEqual(candidate.body.draftPayload.evidenceRefs, ["report_cell:BS!B10", "report_cell:PL!C20"]);
  assert.match(candidate.body.llmDraftRun.inputSummary.sourceContext.sourceObject.snapshotHash, /p6-report-source-context/);
});

test("Phase 6 Agent stock-count candidates convert into non-mutating stock count previews", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6STK",
      name: "Phase 6 Stock Count Drafts",
      companyName: "Phase 6 Stock Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-stock-count-account-set"
  );
  const item = await request(
    api,
    "POST",
    "/inventory-items",
    {
      accountSetId: accountSet.body.id,
      code: "P6-STK",
      name: "Phase 6 Counted Item",
      unit: "pcs",
      costMethod: "moving_average",
      createdBy: "stock-reviewer"
    },
    "phase6-stock-count-item"
  );
  const warehouse = await request(
    api,
    "POST",
    "/warehouses",
    {
      accountSetId: accountSet.body.id,
      code: "P6-SC-WH",
      name: "Phase 6 Count Warehouse",
      locations: [{ code: "C-01", name: "Count Bin" }],
      createdBy: "stock-reviewer"
    },
    "phase6-stock-count-warehouse"
  );
  await request(
    api,
    "POST",
    "/inventory-opening-balances",
    {
      accountSetId: accountSet.body.id,
      itemId: item.body.id,
      warehouseId: warehouse.body.id,
      locationId: warehouse.body.locations[0].id,
      fiscalYear: 2026,
      periodNo: 1,
      quantity: 10,
      amount: 100,
      createdBy: "stock-reviewer"
    },
    "phase6-stock-count-opening"
  );
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "stock-count.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("stock count actual quantity 8"),
      contentBase64: Buffer.from("stock count actual quantity 8").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-stock-count-upload"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "stock_count",
      sourceObjectType: "uploaded_stock_count_sheet",
      userInstruction: "Create stock count preview from uploaded sheet.",
      attachmentIds: [attachment.body.id],
      dryRun: true
    },
    "phase6-stock-count-candidate"
  );
  const balanceBefore = [...api.state.inventoryBalances.values()].find(
    (balance) => balance.accountSetId === accountSet.body.id && balance.itemId === item.body.id
  );

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "stock-reviewer",
      reviewedDraftPayload: {
        documentType: "stock_count",
        countNo: "SC-P6-AGENT",
        fiscalYear: 2026,
        periodNo: 1,
        lines: [
          {
            itemId: item.body.id,
            warehouseId: warehouse.body.id,
            locationId: warehouse.body.locations[0].id,
            actualQuantity: 8,
            reason: "Agent OCR reviewed count"
          }
        ]
      }
    },
    "phase6-convert-candidate-to-stock-count-preview"
  );
  const balanceAfter = [...api.state.inventoryBalances.values()].find(
    (balance) => balance.accountSetId === accountSet.body.id && balance.itemId === item.body.id
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "preview");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.countNo, "SC-P6-AGENT");
  assert.equal(converted.body.lines[0].bookQuantity, 10);
  assert.equal(converted.body.lines[0].actualQuantity, 8);
  assert.equal(converted.body.lines[0].differenceQuantity, -2);
  assert.equal(converted.body.totalAdjustmentAmount, -20);
  assert.equal(balanceAfter.quantity, balanceBefore.quantity);
  assert.equal(balanceAfter.amount, balanceBefore.amount);
  assert.equal(api.state.stockCounts.get(converted.body.id).id, converted.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "stock_count");
  assert.ok(
    api.state.attachmentLinks.some(
      (link) => link.attachmentId === attachment.body.id && link.objectType === "stock_count" && link.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent master-data candidates convert into non-mutating master data drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6MD",
      name: "Phase 6 Master Data Drafts",
      companyName: "Phase 6 Master Data Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-master-data-account-set"
  );
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "supplier-card.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("supplier code SUP-A name Alpha Supplier"),
      contentBase64: Buffer.from("supplier code SUP-A name Alpha Supplier").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-master-data-upload"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "master_data",
      sourceObjectType: "uploaded_supplier_card",
      userInstruction: "Create a supplier master data draft from the uploaded card.",
      attachmentIds: [attachment.body.id],
      dryRun: true
    },
    "phase6-master-data-candidate"
  );
  const partnerCountBefore = api.state.partners.size;
  const itemCountBefore = api.state.inventoryItems.size;

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "master-data-reviewer",
      reviewedDraftPayload: {
        documentType: "master_data",
        masterDataType: "supplier",
        code: "SUP-A",
        name: "Alpha Supplier",
        fields: {
          partnerType: "supplier",
          paymentTerms: "NET30",
          settlementMethod: "bank_transfer"
        }
      }
    },
    "phase6-convert-candidate-to-master-data-draft"
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.masterDataType, "supplier");
  assert.equal(converted.body.code, "SUP-A");
  assert.equal(converted.body.name, "Alpha Supplier");
  assert.equal(converted.body.fields.paymentTerms, "NET30");
  assert.equal(api.state.partners.size, partnerCountBefore);
  assert.equal(api.state.inventoryItems.size, itemCountBefore);
  assert.equal(api.state.agentMasterDataDrafts.get(converted.body.id).id, converted.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "master_data_draft");
  assert.ok(
    api.state.attachmentLinks.some(
      (link) => link.attachmentId === attachment.body.id && link.objectType === "master_data_draft" && link.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent payroll allocation candidates convert into non-mutating payroll allocation drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6PAY",
      name: "Phase 6 Payroll Drafts",
      companyName: "Phase 6 Payroll Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-payroll-draft-account-set"
  );
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "payroll-allocation.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("allocate payroll run PAY-202606 to production"),
      contentBase64: Buffer.from("allocate payroll run PAY-202606 to production").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-payroll-draft-upload"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "payroll_allocation",
      sourceObjectType: "uploaded_payroll_allocation_sheet",
      userInstruction: "Create a payroll allocation draft from uploaded reviewed OCR.",
      attachmentIds: [attachment.body.id],
      dryRun: true
    },
    "phase6-payroll-draft-candidate"
  );
  assert.ok(candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "payrollRunId"));
  const payrollAllocationCountBefore = api.state.payrollAllocations.size;
  const payrollCostPoolCountBefore = api.state.payrollCostPools.size;

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "payroll-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, "PAY-202606"),
      reviewedDraftPayload: {
        documentType: "payroll_allocation",
        payrollRunId: "PAY-202606",
        fiscalYear: 2026,
        periodNo: 6,
        rules: [
          {
            departmentId: "D-PROD",
            targetType: "work_order",
            workOrderId: "WO-AGENT-001",
            costType: "direct_labor",
            allocationRate: 1,
            amount: 14000
          }
        ]
      }
    },
    "phase6-convert-candidate-to-payroll-allocation-draft"
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.documentType, "payroll_allocation");
  assert.equal(converted.body.payrollRunId, "PAY-202606");
  assert.equal(converted.body.totalAllocatedAmount, 14000);
  assert.equal(converted.body.rules[0].workOrderId, "WO-AGENT-001");
  assert.equal(api.state.payrollAllocations.size, payrollAllocationCountBefore);
  assert.equal(api.state.payrollCostPools.size, payrollCostPoolCountBefore);
  assert.equal(api.state.agentPayrollAllocationDrafts.get(converted.body.id).id, converted.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "payroll_allocation_draft");
  assert.ok(
    api.state.attachmentLinks.some(
      (link) => link.attachmentId === attachment.body.id && link.objectType === "payroll_allocation_draft" && link.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent payroll allocation draft generation matches payroll run before review", async () => {
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "payroll-match-model",
      async generateDraft() {
        return {
          provider: "openai-compatible",
          model: "payroll-match-model",
          status: "completed",
          draftPayload: {
            documentType: "payroll_allocation",
            runNo: "PAY-MATCH-202606",
            fiscalYear: 2026,
            periodNo: 6,
            rules: [
              {
                departmentId: "D-PROD",
                targetType: "department",
                costType: "direct_labor",
                allocationRate: 1,
                amount: 12000
              }
            ]
          },
          unmatchedItems: [],
          outputSchema: "payroll_allocation"
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6PAYMATCH",
      name: "Phase 6 Payroll Match",
      companyName: "Phase 6 Payroll Match Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-payroll-match-account-set"
  );
  api.state.payrollRuns.set("payroll-run:p6-match", {
    id: "payroll-run:p6-match",
    accountSetId: accountSet.body.id,
    runNo: "PAY-MATCH-202606",
    fiscalYear: 2026,
    periodNo: 6,
    status: "approved",
    totalCompanyCost: 12000,
    createdBy: "payroll-user",
    createdAt: "now",
    lines: []
  });

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "payroll_allocation",
      sourceObjectType: "uploaded_payroll_allocation_sheet",
      userInstruction: "Generate payroll allocation for PAY-MATCH-202606.",
      evidenceRefs: ["payroll:match"],
      dryRun: true
    },
    "phase6-payroll-match-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.draftPayload.payrollRunId, "payroll-run:p6-match");
  assert.equal(candidate.body.draftPayload.runNo, "PAY-MATCH-202606");
  assert.ok(candidate.body.matchedMasterData.some((match) => match.field === "payrollRunId" && match.objectId === "payroll-run:p6-match"));
  assert.ok(!candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "payrollRunId"));
  assert.equal(candidate.body.dryRunResult.status, "ready_for_confirmation");
});

test("Phase 6 Agent asset-change candidates convert into non-mutating fixed asset change drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6FA",
      name: "Phase 6 Asset Drafts",
      companyName: "Phase 6 Asset Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-asset-draft-account-set"
  );
  api.state.fixedAssets.set("fixed-asset:p6-agent", {
    id: "fixed-asset:p6-agent",
    accountSetId: accountSet.body.id,
    assetNo: "FA-P6-001",
    name: "Agent CNC machine",
    originalValue: 120000,
    accumulatedDepreciation: 20000,
    netValue: 100000,
    currentDepartmentId: "D-MFG",
    usageStatus: "in_use"
  });
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "asset-change.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("asset FA-P6-001 transfer to QA and increase value 5000"),
      contentBase64: Buffer.from("asset FA-P6-001 transfer to QA and increase value 5000").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-asset-draft-upload"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "asset_change",
      sourceObjectType: "uploaded_asset_change_request",
      userInstruction: "Create an asset change draft from uploaded reviewed OCR.",
      attachmentIds: [attachment.body.id],
      dryRun: true
    },
    "phase6-asset-draft-candidate"
  );
  assert.ok(candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "fixedAssetId"));
  const assetBefore = api.state.fixedAssets.get("fixed-asset:p6-agent");
  const transferCountBefore = api.state.assetTransfers.size;
  const valueChangeCountBefore = api.state.assetValueChanges.size;

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "asset-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(candidate, "fixed-asset:p6-agent"),
      reviewedDraftPayload: {
        documentType: "asset_change",
        changeKind: "transfer",
        fixedAssetId: "fixed-asset:p6-agent",
        assetNo: "FA-P6-001",
        changeDate: "2026-06-12",
        toDepartmentId: "D-QA",
        toDepartmentName: "Quality Assurance",
        amount: 5000,
        reason: "Agent reviewed OCR request"
      }
    },
    "phase6-convert-candidate-to-asset-change-draft"
  );
  const assetAfter = api.state.fixedAssets.get("fixed-asset:p6-agent");

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.documentType, "asset_change");
  assert.equal(converted.body.changeKind, "transfer");
  assert.equal(converted.body.fixedAssetId, "fixed-asset:p6-agent");
  assert.equal(converted.body.toDepartmentId, "D-QA");
  assert.equal(converted.body.amount, 5000);
  assert.equal(assetAfter.originalValue, assetBefore.originalValue);
  assert.equal(assetAfter.currentDepartmentId, assetBefore.currentDepartmentId);
  assert.equal(api.state.assetTransfers.size, transferCountBefore);
  assert.equal(api.state.assetValueChanges.size, valueChangeCountBefore);
  assert.equal(api.state.agentAssetChangeDrafts.get(converted.body.id).id, converted.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "asset_change_draft");
  assert.ok(
    api.state.attachmentLinks.some(
      (link) => link.attachmentId === attachment.body.id && link.objectType === "asset_change_draft" && link.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent asset-change draft generation matches fixed asset master data before review", async () => {
  const api = createApi({
    llmDraftAdapter: {
      provider: "openai-compatible",
      model: "asset-match-model",
      async generateDraft() {
        return {
          provider: "openai-compatible",
          model: "asset-match-model",
          status: "completed",
          draftPayload: {
            documentType: "asset_change",
            changeKind: "transfer",
            assetNo: "FA-P6-MATCH",
            changeDate: "2026-06-13",
            toDepartmentId: "D-QA",
            toDepartmentName: "Quality Assurance",
            amount: null,
            reason: "Move matched asset to QA."
          },
          unmatchedItems: [],
          outputSchema: "asset_change"
        };
      }
    }
  });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6FAMATCH",
      name: "Phase 6 Asset Match",
      companyName: "Phase 6 Asset Match Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-asset-match-account-set"
  );
  api.state.fixedAssets.set("fixed-asset:p6-match", {
    id: "fixed-asset:p6-match",
    accountSetId: accountSet.body.id,
    assetNo: "FA-P6-MATCH",
    assetName: "Matched fixed asset",
    originalValue: 88000,
    accumulatedDepreciation: 8000,
    netValue: 80000,
    currentDepartmentId: "D-MFG",
    currentDepartmentName: "Manufacturing",
    usageStatus: "in_use"
  });

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      draftType: "asset_change",
      sourceObjectType: "uploaded_asset_change_request",
      userInstruction: "Generate an asset change draft for FA-P6-MATCH.",
      evidenceRefs: ["asset-change:match"],
      dryRun: true
    },
    "phase6-asset-match-draft-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.draftPayload.fixedAssetId, "fixed-asset:p6-match");
  assert.equal(candidate.body.draftPayload.assetNo, "FA-P6-MATCH");
  assert.ok(candidate.body.matchedMasterData.some((match) => match.field === "fixedAssetId" && match.objectId === "fixed-asset:p6-match"));
  assert.ok(!candidate.body.unmatchedItems.some((unmatched) => unmatched.field === "fixedAssetId"));
  assert.equal(candidate.body.dryRunResult.status, "ready_for_confirmation");
});

test("Phase 6 Agent depreciation-run candidates convert into non-mutating depreciation dry-run drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6DEP",
      name: "Phase 6 Depreciation Agent Drafts",
      companyName: "Phase 6 Depreciation Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-depreciation-agent-account-set"
  );
  const method = await request(
    api,
    "POST",
    "/depreciation-methods",
    {
      accountSetId: accountSet.body.id,
      code: "SL",
      name: "Straight line",
      methodType: "straight_line",
      createdBy: "asset-reviewer"
    },
    "phase6-depreciation-agent-method"
  );
  const category = await request(
    api,
    "POST",
    "/asset-categories",
    {
      accountSetId: accountSet.body.id,
      code: "MACHINE",
      name: "Machine",
      depreciationMethodId: method.body.id,
      defaultUsefulLifeMonths: 60,
      defaultSalvageRate: 0.05,
      createdBy: "asset-reviewer"
    },
    "phase6-depreciation-agent-category"
  );
  const fixedAsset = await request(
    api,
    "POST",
    "/fixed-assets",
    {
      accountSetId: accountSet.body.id,
      assetNo: "FA-P6-DEP",
      name: "Agent depreciation machine",
      categoryId: category.body.id,
      depreciationMethodId: method.body.id,
      acquisitionDate: "2026-01-15",
      originalValue: 120000,
      salvageValue: 6000,
      usefulLifeMonths: 60,
      departmentId: "D-MFG",
      departmentName: "Manufacturing",
      createdBy: "asset-reviewer"
    },
    "phase6-depreciation-agent-asset"
  );
  const initialRunCount = api.state.depreciationRuns.size;
  const initialLineCount = api.state.depreciationRunLines.size;
  const initialCostPoolCount = api.state.assetDepreciationCostPools.size;
  const assetBefore = { ...api.state.fixedAssets.get(fixedAsset.body.id) };

  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 2,
      draftType: "depreciation_run",
      sourceObjectType: "depreciation_run_page",
      userInstruction: "Generate depreciation dry-run candidate for February 2026.",
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-depreciation-agent-candidate"
  );

  assert.equal(candidate.status, 201);
  assert.equal(candidate.body.draftType, "depreciation_run");
  assert.equal(candidate.body.draftPayload.documentType, "depreciation_run");
  assert.equal(candidate.body.draftPayload.dryRun, true);
  assert.equal(candidate.body.draftPayload.fiscalYear, 2026);
  assert.equal(candidate.body.draftPayload.periodNo, 2);
  assert.match(candidate.body.draftPayload.runNo, /AGENT-DEP-202602/);

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "asset-reviewer",
      reviewedDraftPayload: {
        documentType: "depreciation_run",
        runNo: "AGENT-DEP-202602-REVIEWED",
        fiscalYear: 2026,
        periodNo: 2,
        dryRun: true
      }
    },
    "phase6-convert-candidate-to-depreciation-dry-run"
  );
  const assetAfter = api.state.fixedAssets.get(fixedAsset.body.id);

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.documentType, "depreciation_run");
  assert.equal(converted.body.dryRun, true);
  assert.equal(converted.body.runNo, "AGENT-DEP-202602-REVIEWED");
  assert.equal(converted.body.totalDepreciationAmount, 1900);
  assert.equal(converted.body.lines[0].fixedAssetId, fixedAsset.body.id);
  assert.equal(converted.body.lines[0].depreciationAmount, 1900);
  assert.equal(converted.body.lines[0].netValueAfter, 118100);
  assert.equal(api.state.depreciationRuns.size, initialRunCount);
  assert.equal(api.state.depreciationRunLines.size, initialLineCount);
  assert.equal(api.state.assetDepreciationCostPools.size, initialCostPoolCount);
  assert.equal(assetAfter.accumulatedDepreciation, assetBefore.accumulatedDepreciation);
  assert.equal(assetAfter.netValue, assetBefore.netValue);
  assert.equal(api.state.agentDepreciationRunDrafts.get(converted.body.id).id, converted.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "depreciation_run_draft");
});

test("Phase 6 Agent report-interpretation candidates convert into non-mutating report interpretation drafts", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6RPT",
      name: "Phase 6 Report Interpretation Drafts",
      companyName: "Phase 6 Report Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-report-interpretation-account-set"
  );
  const reportRun = {
    id: "report-run:p6-agent",
    accountSetId: accountSet.body.id,
    templateVersionId: "report-template-version:p6-agent",
    fiscalYear: 2026,
    periodNo: 6,
    includeUnposted: false,
    runMode: "formal",
    status: "calculated",
    snapshotHash: "snapshot:p6-agent-before",
    cells: [
      {
        id: "report-run-cell:p6-agent-cash",
        sheetCode: "BS",
        cellAddress: "B10",
        label: "Cash",
        value: 120,
        valueType: "formula"
      }
    ],
    traceLinks: []
  };
  api.state.reportRuns.set(reportRun.id, reportRun);
  const attachment = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      accountSetId: accountSet.body.id,
      filename: "report-note.txt",
      contentType: "text/plain",
      byteSize: Buffer.byteLength("cash increased based on BS B10"),
      contentBase64: Buffer.from("cash increased based on BS B10").toString("base64"),
      uploadedBy: "system"
    },
    "phase6-report-interpretation-upload"
  );
  const candidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      draftType: "report_interpretation",
      sourceObjectType: "report_run",
      sourceObjectId: reportRun.id,
      userInstruction: "Create a report interpretation draft for the selected report cell.",
      attachmentIds: [attachment.body.id],
      dryRun: true
    },
    "phase6-report-interpretation-candidate"
  );
  const snapshotBefore = api.state.reportRuns.get(reportRun.id).snapshotHash;
  const cellsBefore = api.state.reportRuns.get(reportRun.id).cells.length;

  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/convert`,
    {
      reviewedBy: "report-reviewer",
      reviewedDraftPayload: {
        documentType: "report_interpretation",
        reportRunId: reportRun.id,
        summary: "Cash increased.",
        keyFindings: ["Cash closing balance is 120."],
        warnings: ["Confirm whether the increase is recurring."],
        evidenceRefs: ["report_cell:BS!B10"]
      }
    },
    "phase6-convert-candidate-to-report-interpretation"
  );

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "agent_draft");
  assert.equal(converted.body.agentDraftCandidateId, candidate.body.id);
  assert.equal(converted.body.reportRunId, reportRun.id);
  assert.equal(converted.body.summary, "Cash increased.");
  assert.deepEqual(converted.body.evidenceRefs, ["report_cell:BS!B10"]);
  assert.equal(api.state.reportRuns.get(reportRun.id).snapshotHash, snapshotBefore);
  assert.equal(api.state.reportRuns.get(reportRun.id).cells.length, cellsBefore);
  assert.equal(api.state.aiReportInterpretations.get(converted.body.id).id, converted.body.id);
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).status, "converted");
  assert.equal(api.state.agentDraftCandidates.get(candidate.body.id).convertedObjectType, "report_interpretation_draft");
  assert.ok(
    api.state.attachmentLinks.some(
      (link) => link.attachmentId === attachment.body.id && link.objectType === "report_interpretation_draft" && link.objectId === converted.body.id
    )
  );
});

test("Phase 6 Agent draft candidate queue lists pending and converted drafts by account set", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6Q",
      name: "Phase 6 Draft Queue",
      companyName: "Phase 6 Queue Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-draft-queue-account-set"
  );
  const supplier = await request(
    api,
    "POST",
    "/partners",
    {
      accountSetId: accountSet.body.id,
      partnerType: "supplier",
      code: "P6Q-SUP",
      name: "Phase 6 Queue Supplier",
      paymentTerms: "NET30",
      settlementMethod: "bank_transfer"
    },
    "phase6-draft-queue-supplier"
  );
  const pending = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "voucher",
      userInstruction: "Generate a voucher candidate for queue review",
      evidenceRefs: ["queue:evidence"],
      attachmentIds: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-draft-queue-pending"
  );
  const convertedCandidate = await request(
    api,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "purchase_order",
      userInstruction: "Generate a purchase order candidate for queue review",
      evidenceRefs: ["queue:quote"],
      attachmentIds: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-draft-queue-converted-candidate"
  );
  const converted = await request(
    api,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(convertedCandidate.body.id)}/convert`,
    {
      reviewedBy: "purchase-reviewer",
      resolvedUnmatchedItems: resolveAgentUnmatchedItems(convertedCandidate, supplier.body.id),
      reviewedDraftPayload: {
        documentType: "purchase_order",
        supplierId: supplier.body.id,
        orderDate: "2026-01-20",
        lines: [{ itemCode: "P6Q-MAT", itemName: "Phase 6 queue material", quantity: 1, unitPrice: 100, taxRate: 0 }]
      }
    },
    "phase6-draft-queue-convert"
  );

  const queue = await request(api, "GET", `/agent/draft-candidates?accountSetId=${encodeURIComponent(accountSet.body.id)}`);
  const purchaseOnly = await request(
    api,
    "GET",
    `/agent/draft-candidates?accountSetId=${encodeURIComponent(accountSet.body.id)}&draftType=purchase_order&status=converted`
  );

  assert.equal(queue.status, 200);
  assert.equal(queue.body.accountSetId, accountSet.body.id);
  assert.equal(queue.body.total, 2);
  assert.deepEqual(
    queue.body.items.map((item) => item.id).sort(),
    [pending.body.id, convertedCandidate.body.id].sort()
  );
  const convertedRow = queue.body.items.find((item) => item.id === convertedCandidate.body.id);
  assert.equal(convertedRow.status, "converted");
  assert.equal(convertedRow.convertedObjectType, "purchase_order");
  assert.equal(convertedRow.convertedObjectId, converted.body.id);
  assert.equal(purchaseOnly.body.total, 1);
  assert.equal(purchaseOnly.body.items[0].draftType, "purchase_order");
});

test("Phase 6 Agent draft candidates and LLM draft runs persist through platform store restarts", async () => {
  const accountSets = new Map();
  const llmDraftRuns = new Map();
  const agentDraftCandidates = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, accountSet);
      return accountSet;
    },
    findAccountSet: async (identifier) =>
      [...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null,
    listAccountSets: async () => [...accountSets.values()],
    listAccessibleAccountSets: async () => [...accountSets.values()],
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createLlmDraftRun: async (run) => {
      llmDraftRuns.set(run.id, { ...run });
      return llmDraftRuns.get(run.id);
    },
    listLlmDraftRuns: async (accountSetId = null, { status = null, draftType = null } = {}) =>
      [...llmDraftRuns.values()]
        .filter((run) => (!accountSetId || run.accountSetId === accountSetId) && (!status || run.status === status))
        .filter((run) => !draftType || run.inputSummary?.draftType === draftType)
        .sort(byCreatedDesc),
    createAgentDraftCandidate: async (candidate) => {
      agentDraftCandidates.set(candidate.id, { ...candidate });
      return agentDraftCandidates.get(candidate.id);
    },
    updateAgentDraftCandidate: async (candidate) => {
      agentDraftCandidates.set(candidate.id, { ...candidate });
      return agentDraftCandidates.get(candidate.id);
    },
    findAgentDraftCandidate: async (id) => agentDraftCandidates.get(id) ?? null,
    listAgentDraftCandidates: async (accountSetId = null, { status = null, draftType = null } = {}) =>
      [...agentDraftCandidates.values()]
        .filter((candidate) => (!accountSetId || candidate.accountSetId === accountSetId) && (!status || candidate.status === status))
        .filter((candidate) => !draftType || candidate.draftType === draftType)
        .sort(byCreatedDesc)
  };
  const firstApi = createApi({ platformStore });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6DRAFTP",
      name: "Phase 6 Persisted Drafts",
      companyName: "Phase 6 Persisted Drafts Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-persisted-drafts-account-set"
  );
  const candidate = await request(
    firstApi,
    "POST",
    "/agent/draft-candidates",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      draftType: "voucher",
      userInstruction: "Generate a persisted voucher candidate for 880 CNY office expense.",
      evidenceRefs: ["receipt:persisted"],
      attachmentIds: [],
      requestedBy: "agent-user",
      dryRun: true
    },
    "phase6-persisted-draft-candidate"
  );
  const restartedApi = createApi({ platformStore });
  const queue = await request(
    restartedApi,
    "GET",
    `/agent/draft-candidates?accountSetId=${encodeURIComponent(accountSet.body.id)}`
  );
  const detail = await request(
    restartedApi,
    "GET",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}`
  );
  const runs = await request(
    restartedApi,
    "GET",
    `/ai/llm-draft-runs?accountSetId=${encodeURIComponent(accountSet.body.id)}&draftType=voucher`
  );
  const rejected = await request(
    restartedApi,
    "POST",
    `/agent/draft-candidates/${encodeURIComponent(candidate.body.id)}/reject`,
    {
      rejectedBy: "finance-reviewer",
      rejectionReason: "Need clearer supplier invoice evidence."
    },
    "phase6-persisted-draft-reject"
  );
  const afterRejectApi = createApi({ platformStore });
  const rejectedQueue = await request(
    afterRejectApi,
    "GET",
    `/agent/draft-candidates?accountSetId=${encodeURIComponent(accountSet.body.id)}&status=rejected`
  );

  assert.equal(candidate.status, 201);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.total, 1);
  assert.equal(queue.body.items[0].id, candidate.body.id);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.llmDraftRun.id, candidate.body.llmDraftRun.id);
  assert.equal(runs.status, 200);
  assert.equal(runs.body.total, 1);
  assert.equal(runs.body.items[0].id, candidate.body.llmDraftRun.id);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, "rejected");
  assert.equal(rejectedQueue.body.total, 1);
  assert.equal(rejectedQueue.body.items[0].rejectedBy, "finance-reviewer");
});

test("Phase 6 Agent actions move through approval and replay without mutating business data", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6ACT",
      name: "Phase 6 Agent Actions",
      companyName: "Phase 6 Action Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-action-account-set"
  );

  const action = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: ["period:2026-01"],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "agent-user"
    },
    "phase6-agent-action-create"
  );

  assert.equal(action.status, 201);
  assert.equal(action.body.status, "dry_run_completed");
  assert.equal(action.body.riskLevel, "high");
  assert.equal(action.body.approvalRequired, true);
  assert.deepEqual(action.body.approvalProgress, { approvedCount: 0, requiredCount: 2, remainingCount: 2 });
  assert.equal(action.body.dryRunResult.status, "ready_for_approval");
  assert.equal(action.body.executionResult, null);
  assert.deepEqual(action.body.evidenceRefs, ["period:2026-01"]);
  assert.equal(api.state.vouchers.size, 0);

  const loaded = await request(api, "GET", `/agent-actions/${encodeURIComponent(action.body.id)}`);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.id, action.body.id);

  const submitted = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/submit`,
    { submittedBy: "agent-user", approvalComment: "请审批月结检查" },
    "phase6-agent-action-submit"
  );
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.status, "submitted_for_approval");

  const approved = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
    { approvedBy: "controller", approvalComment: "dry-run evidence accepted" },
    "phase6-agent-action-approve"
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, "submitted_for_approval");
  assert.equal(approved.body.approvalHistory.length, 1);
  assert.deepEqual(approved.body.approvalProgress, { approvedCount: 1, requiredCount: 2, remainingCount: 1 });

  const duplicateApproval = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
    { approvedBy: "controller", approvalComment: "duplicate approval should be blocked" },
    "phase6-agent-action-duplicate-approve"
  );
  assert.equal(duplicateApproval.status, 409);
  assert.equal(duplicateApproval.body.code, "AGENT_APPROVAL_DUPLICATE_APPROVER");

  const executeBeforeSecondApproval = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/execute`,
    { executedBy: "controller" },
    "phase6-agent-action-execute-before-second-approval"
  );
  assert.equal(executeBeforeSecondApproval.status, 409);

  const secondApproval = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
    { approvedBy: "cfo", approvalComment: "second approval accepted" },
    "phase6-agent-action-second-approve"
  );
  assert.equal(secondApproval.status, 200);
  assert.equal(secondApproval.body.status, "approved");
  assert.equal(secondApproval.body.approvalHistory.length, 2);
  assert.deepEqual(secondApproval.body.approvalProgress, { approvedCount: 2, requiredCount: 2, remainingCount: 0 });

  const executeWithoutUserToken = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/execute`,
    { executedBy: "controller" },
    "phase6-agent-action-execute"
  );
  assert.equal(executeWithoutUserToken.status, 409);
  assert.equal(executeWithoutUserToken.body.code, "AGENT_ACTION_USER_TOKEN_REQUIRED");

  const executed = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/execute`,
    { executedBy: "controller", userTokenConfirmed: true },
    "phase6-agent-action-execute-confirmed"
  );
  assert.equal(executed.status, 200);
  assert.equal(executed.body.status, "executed");
  assert.equal(executed.body.executionResult.status, "recorded_without_business_mutation");
  assert.equal(executed.body.executionResult.userTokenConfirmed, true);
  assert.equal(api.state.vouchers.size, 0);

  const loadedAfterExecution = await request(api, "GET", `/agent-actions/${encodeURIComponent(action.body.id)}`);
  assert.equal(loadedAfterExecution.status, 200);
  assert.equal(loadedAfterExecution.body.auditSummary.status, "executed");
  assert.equal(loadedAfterExecution.body.auditSummary.toolName, "run_close_checklist");
  assert.deepEqual(loadedAfterExecution.body.auditSummary.approvals, {
    approvedCount: 2,
    requiredCount: 2,
    remainingCount: 0
  });
  assert.deepEqual(loadedAfterExecution.body.auditSummary.evidence, {
    snapshotCount: 0,
    verificationStatus: "verified",
    failedCount: 0
  });
  assert.equal(loadedAfterExecution.body.auditSummary.dryRunStatus, "ready_for_approval");
  assert.equal(loadedAfterExecution.body.auditSummary.executionStatus, "recorded_without_business_mutation");
  assert.equal(loadedAfterExecution.body.auditSummary.mutationState, "executed_without_business_mutation");
  assert.deepEqual(loadedAfterExecution.body.auditSummary.nextActions, ["reverse"]);
  assert.deepEqual(loadedAfterExecution.body.auditSummary.replay.eventTypes, [
    "input_received",
    "dry_run_completed",
    "submitted_for_approval",
    "evidence_verified",
    "approved",
    "evidence_verified",
    "approved",
    "evidence_verified",
    "executed"
  ]);

  const replay = await request(api, "GET", `/agent-actions/${encodeURIComponent(action.body.id)}/replay`);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.auditSummary.agentActionId, action.body.id);
  assert.equal(replay.body.auditSummary.replay.eventCount, 9);
  assert.equal(replay.body.auditSummary.replay.lastEventType, "executed");
  assert.deepEqual(
    replay.body.events.map((event) => event.eventType),
    [
      "input_received",
      "dry_run_completed",
      "submitted_for_approval",
      "evidence_verified",
      "approved",
      "evidence_verified",
      "approved",
      "evidence_verified",
      "executed"
    ]
  );
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent_action.execute" && log.objectType === "agent_action" && log.objectId === action.body.id
    )
  );
});

test("Phase 6 Agent actions approvals and replay persist through platform store restarts", async () => {
  const accountSets = new Map();
  const agentActions = new Map();
  const replayEventsByAction = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, accountSet);
      return accountSet;
    },
    findAccountSet: async (identifier) =>
      [...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null,
    listAccountSets: async () => [...accountSets.values()],
    listAccessibleAccountSets: async () => [...accountSets.values()],
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createAgentAction: async (action) => {
      agentActions.set(action.id, structuredClone(action));
      return structuredClone(agentActions.get(action.id));
    },
    updateAgentAction: async (action) => {
      agentActions.set(action.id, structuredClone(action));
      return structuredClone(agentActions.get(action.id));
    },
    findAgentAction: async (id) => structuredClone(agentActions.get(id) ?? null),
    listAgentActions: async (accountSetId = null, filters = {}) =>
      [...agentActions.values()]
        .filter((action) => (!accountSetId || action.accountSetId === accountSetId) && (!filters.status || action.status === filters.status))
        .filter((action) => !filters.riskLevel || action.riskLevel === filters.riskLevel)
        .filter((action) => !filters.toolName || action.toolName === filters.toolName)
        .sort(byCreatedDesc)
        .map((action) => structuredClone(action)),
    replaceAgentReplayEvents: async (agentActionId, events) => {
      replayEventsByAction.set(agentActionId, events.map((event) => structuredClone(event)));
      return replayEventsByAction.get(agentActionId).map((event) => structuredClone(event));
    },
    listAgentReplayEvents: async (agentActionId) => (replayEventsByAction.get(agentActionId) ?? []).map((event) => structuredClone(event))
  };
  const firstApi = createApi({ platformStore });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6AAP",
      name: "Phase 6 Agent Action Persisted",
      companyName: "Phase 6 Agent Action Persisted Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-persisted-agent-action-account-set"
  );
  const created = await request(
    firstApi,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: ["period:2026-06"],
      payload: { fiscalYear: 2026, periodNo: 6 },
      requestedBy: "agent-user"
    },
    "phase6-persisted-agent-action-create"
  );
  const secondApi = createApi({ platformStore });
  const loaded = await request(secondApi, "GET", `/agent-actions/${encodeURIComponent(created.body.id)}`);
  const submitted = await request(
    secondApi,
    "POST",
    `/agent-actions/${encodeURIComponent(created.body.id)}/submit`,
    { submittedBy: "agent-user", approvalComment: "submit after restart" },
    "phase6-persisted-agent-action-submit"
  );
  const thirdApi = createApi({ platformStore });
  const firstApproval = await request(
    thirdApi,
    "POST",
    `/agent-actions/${encodeURIComponent(created.body.id)}/approve`,
    { approvedBy: "controller", approvalComment: "first persisted approval" },
    "phase6-persisted-agent-action-approve-1"
  );
  const fourthApi = createApi({ platformStore });
  const secondApproval = await request(
    fourthApi,
    "POST",
    `/agent-actions/${encodeURIComponent(created.body.id)}/approve`,
    { approvedBy: "cfo", approvalComment: "second persisted approval" },
    "phase6-persisted-agent-action-approve-2"
  );
  const executed = await request(
    fourthApi,
    "POST",
    `/agent-actions/${encodeURIComponent(created.body.id)}/execute`,
    { executedBy: "controller", userTokenConfirmed: true },
    "phase6-persisted-agent-action-execute"
  );
  const finalApi = createApi({ platformStore });
  const queue = await request(finalApi, "GET", `/agent-actions?accountSetId=${encodeURIComponent(accountSet.body.id)}&status=executed`);
  const replay = await request(finalApi, "GET", `/agent-actions/${encodeURIComponent(created.body.id)}/replay`);

  assert.equal(created.status, 201);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.auditSummary.replay.eventCount, 2);
  assert.equal(submitted.status, 200);
  assert.equal(firstApproval.status, 200);
  assert.equal(secondApproval.status, 200);
  assert.equal(executed.status, 200);
  assert.equal(executed.body.status, "executed");
  assert.equal(queue.status, 200);
  assert.equal(queue.body.total, 1);
  assert.equal(queue.body.items[0].id, created.body.id);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.auditSummary.replay.eventCount, 9);
  assert.deepEqual(
    replay.body.events.map((event) => event.eventType),
    [
      "input_received",
      "dry_run_completed",
      "submitted_for_approval",
      "evidence_verified",
      "approved",
      "evidence_verified",
      "approved",
      "evidence_verified",
      "executed"
    ]
  );
});

test("Phase 6 restore drill blocks external Agent executions after approval", async () => {
  const api = createApi({ restoreDrill: true });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6RDS",
      name: "Phase 6 Restore Drill Sandbox",
      companyName: "Phase 6 Restore Drill Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-restore-drill-account-set"
  );

  const action = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "execute_approved_payment",
      dryRun: true,
      evidenceRefs: ["payment:restore-drill"],
      payload: { paymentId: "payment:restore-drill" },
      requestedBy: "agent-user"
    },
    "phase6-restore-drill-action"
  );
  assert.equal(action.status, 201);
  assert.equal(action.body.actionKind, "external_execution");

  await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/submit`,
    { submittedBy: "agent-user", approvalComment: "restore drill external boundary test" },
    "phase6-restore-drill-submit"
  );
  await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
    { approvedBy: "controller", approvalComment: "first approval" },
    "phase6-restore-drill-approve-1"
  );
  const approved = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
    { approvedBy: "cfo", approvalComment: "second approval" },
    "phase6-restore-drill-approve-2"
  );
  assert.equal(approved.body.status, "approved");

  const blocked = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/execute`,
    { executedBy: "controller", userTokenConfirmed: true },
    "phase6-restore-drill-execute"
  );

  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "RESTORE_DRILL_OUTBOUND_BLOCKED");
  const stillApproved = api.state.agentActions.get(action.body.id);
  assert.equal(stillApproved.status, "approved");
  assert.equal(stillApproved.executionResult, null);
  assert.ok(
    api.state.agentReplayEvents.some(
      (event) => event.agentActionId === action.body.id && event.eventType === "restore_drill_outbound_blocked"
    )
  );
});

test("Phase 6 Ops backup jobs create auditable manifests and restore dry-runs require restore-drill sandbox", async () => {
  const api = createApi({ restoreDrill: true });
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6OPS",
      name: "Phase 6 Ops Jobs",
      companyName: "Phase 6 Ops Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-ops-account-set"
  );

  const backup = await request(
    api,
    "POST",
    "/ops/backups",
    {
      accountSetId: accountSet.body.id,
      backupType: "full",
      includeAttachments: true,
      retentionDays: 30,
      requestedBy: "ops-user"
    },
    "phase6-ops-backup"
  );

  assert.equal(backup.status, 201);
  assert.equal(backup.body.accountSetId, accountSet.body.id);
  assert.equal(backup.body.backupType, "full");
  assert.equal(backup.body.status, "completed");
  assert.equal(backup.body.businessMutation, false);
  assert.equal(backup.body.manifest.accountSetId, accountSet.body.id);
  assert.equal(backup.body.manifest.tableCounts.vouchers, 0);
  assert.equal(backup.body.attachmentHashVerification.status, "completed_empty");
  assert.match(backup.body.checksum, /^sha256:/);
  assert.equal(api.state.backupJobs.size, 1);

  const backups = await request(api, "GET", `/ops/backups?accountSetId=${encodeURIComponent(accountSet.body.id)}`);
  assert.equal(backups.status, 200);
  assert.equal(backups.body.total, 1);
  assert.equal(backups.body.items[0].id, backup.body.id);

  const restore = await request(
    api,
    "POST",
    "/ops/restores/execute",
    {
      accountSetId: accountSet.body.id,
      backupJobId: backup.body.id,
      dryRun: true,
      targetEnvironment: "restore_drill",
      restorePointLabel: "phase6-sandbox-drill",
      requestedBy: "ops-user"
    },
    "phase6-ops-restore"
  );

  assert.equal(restore.status, 201);
  assert.equal(restore.body.accountSetId, accountSet.body.id);
  assert.equal(restore.body.sourceBackupJobId, backup.body.id);
  assert.equal(restore.body.status, "dry_run_completed");
  assert.equal(restore.body.restoreMode, "silent_sandbox");
  assert.equal(restore.body.businessMutation, false);
  assert.equal(restore.body.outboundBlocked, true);
  assert.deepEqual(restore.body.blockedChannels, ["webhook", "email", "bank_api"]);
  assert.equal(restore.body.impactScope.accountSetId, accountSet.body.id);
  assert.equal(api.state.restoreJobs.size, 1);
  assert.ok(api.state.auditLogs.some((log) => log.action === "backup_job.create" && log.objectId === backup.body.id));
  assert.ok(api.state.auditLogs.some((log) => log.action === "restore_job.dry_run" && log.objectId === restore.body.id));

  const restores = await request(api, "GET", `/ops/restores?accountSetId=${encodeURIComponent(accountSet.body.id)}`);
  assert.equal(restores.status, 200);
  assert.equal(restores.body.total, 1);
  assert.equal(restores.body.items[0].id, restore.body.id);

  const liveApi = createApi();
  const liveAccountSet = await request(
    liveApi,
    "POST",
    "/account-sets",
    {
      code: "P6OPL",
      name: "Phase 6 Ops Live",
      companyName: "Phase 6 Ops Live Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-ops-live-account-set"
  );
  const liveBackup = await request(
    liveApi,
    "POST",
    "/ops/backups",
    {
      accountSetId: liveAccountSet.body.id,
      backupType: "full",
      requestedBy: "ops-user"
    },
    "phase6-ops-live-backup"
  );
  const blockedRestore = await request(
    liveApi,
    "POST",
    "/ops/restores/execute",
    {
      accountSetId: liveAccountSet.body.id,
      backupJobId: liveBackup.body.id,
      dryRun: true,
      targetEnvironment: "restore_drill",
      requestedBy: "ops-user"
    },
    "phase6-ops-live-restore"
  );

  assert.equal(blockedRestore.status, 409);
  assert.equal(blockedRestore.body.code, "RESTORE_DRILL_REQUIRED");
});

test("Phase 6 Ops backup and restore jobs persist through platform store restarts", async () => {
  const accountSets = new Map();
  const backupJobs = new Map();
  const restoreJobs = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, accountSet);
      return accountSet;
    },
    findAccountSet: async (identifier) =>
      [...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null,
    listAccountSets: async () => [...accountSets.values()],
    listAccessibleAccountSets: async () => [...accountSets.values()],
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createBackupJob: async (job) => {
      backupJobs.set(job.id, { ...job });
      return backupJobs.get(job.id);
    },
    listBackupJobs: async (accountSetId = null, { status = null } = {}) =>
      [...backupJobs.values()]
        .filter((job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status))
        .sort(byCreatedDesc),
    findBackupJob: async (identifier) =>
      [...backupJobs.values()].find((job) => job.id === identifier || job.snapshotRef === identifier) ?? null,
    createRestoreJob: async (job) => {
      restoreJobs.set(job.id, { ...job });
      return restoreJobs.get(job.id);
    },
    listRestoreJobs: async (accountSetId = null, { status = null } = {}) =>
      [...restoreJobs.values()]
        .filter((job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status))
        .sort(byCreatedDesc)
  };
  const firstApi = createApi({ platformStore, restoreDrill: true });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6OPP",
      name: "Phase 6 Ops Persisted",
      companyName: "Phase 6 Ops Persisted Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-ops-persisted-account-set"
  );
  const backup = await request(
    firstApi,
    "POST",
    "/ops/backups",
    {
      accountSetId: accountSet.body.id,
      backupType: "full",
      includeAttachments: true,
      requestedBy: "ops-user"
    },
    "phase6-ops-persisted-backup"
  );
  const firstRestore = await request(
    firstApi,
    "POST",
    "/ops/restores/execute",
    {
      accountSetId: accountSet.body.id,
      backupJobId: backup.body.id,
      dryRun: true,
      targetEnvironment: "restore_drill",
      requestedBy: "ops-user"
    },
    "phase6-ops-persisted-restore"
  );
  const restartedApi = createApi({ platformStore, restoreDrill: true });
  const persistedBackups = await request(
    restartedApi,
    "GET",
    `/ops/backups?accountSetId=${encodeURIComponent(accountSet.body.id)}`
  );
  const restartedRestore = await request(
    restartedApi,
    "POST",
    "/ops/restores/execute",
    {
      accountSetId: accountSet.body.id,
      backupJobId: backup.body.id,
      dryRun: true,
      targetEnvironment: "restore_drill",
      restorePointLabel: "phase6-restarted-drill",
      requestedBy: "ops-user"
    },
    "phase6-ops-restarted-restore"
  );
  const persistedRestores = await request(
    restartedApi,
    "GET",
    `/ops/restores?accountSetId=${encodeURIComponent(accountSet.body.id)}`
  );

  assert.equal(backup.status, 201);
  assert.equal(firstRestore.status, 201);
  assert.equal(persistedBackups.status, 200);
  assert.equal(persistedBackups.body.total, 1);
  assert.equal(persistedBackups.body.items[0].id, backup.body.id);
  assert.equal(persistedBackups.body.items[0].manifest.accountSetCode, "P6OPP");
  assert.equal(restartedRestore.status, 201);
  assert.equal(restartedRestore.body.sourceBackupJobId, backup.body.id);
  assert.equal(persistedRestores.status, 200);
  assert.equal(persistedRestores.body.total, 2);
  assert.ok(persistedRestores.body.items.some((item) => item.id === firstRestore.body.id));
  assert.ok(persistedRestores.body.items.some((item) => item.id === restartedRestore.body.id));
});

test("Phase 6 migration jobs dry-run and persist through platform store restarts", async () => {
  const accountSets = new Map();
  const migrationJobs = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, structuredClone(accountSet));
      return structuredClone(accountSet);
    },
    findAccountSet: async (identifier) =>
      structuredClone([...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null),
    listAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    listAccessibleAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    updateMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    findMigrationJob: async (id) => structuredClone(migrationJobs.get(id) ?? null),
    listMigrationJobs: async (accountSetId = null, { status = null, jobType = null } = {}) =>
      [...migrationJobs.values()]
        .filter((job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status))
        .filter((job) => !jobType || job.jobType === jobType)
        .sort(byCreatedDesc)
        .map((job) => structuredClone(job))
  };
  const firstApi = createApi({ platformStore });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6MIG",
      name: "Phase 6 Migration",
      companyName: "Phase 6 Migration Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-migration-account-set"
  );
  const job = await request(
    firstApi,
    "POST",
    "/ops/migrations/jobs",
    {
      accountSetId: accountSet.body.id,
      jobType: "opening_balance",
      sourceType: "excel",
      targetObjectType: "opening_balance",
      fieldMapping: {
        accountCode: "accountCode",
        debit: "debit",
        credit: "credit"
      },
      sourceRows: [
        { accountCode: "1002", debit: 500, credit: 0 },
        { accountCode: "3001", debit: 0, credit: 500 }
      ],
      requestedBy: "migration-user"
    },
    "phase6-migration-job"
  );
  const dryRun = await request(
    firstApi,
    "POST",
    `/ops/migrations/jobs/${encodeURIComponent(job.body.id)}/dry-run`,
    {
      requestedBy: "migration-user"
    },
    "phase6-migration-dry-run"
  );
  const restartedApi = createApi({ platformStore });
  const listed = await request(
    restartedApi,
    "GET",
    `/ops/migrations/jobs?accountSetId=${encodeURIComponent(accountSet.body.id)}&status=dry_run_completed&jobType=opening_balance`
  );

  assert.equal(job.status, 201);
  assert.equal(job.body.status, "draft");
  assert.equal(dryRun.status, 200);
  assert.equal(dryRun.body.status, "dry_run_completed");
  assert.equal(dryRun.body.businessMutation, false);
  assert.equal(dryRun.body.validation.status, "passed");
  assert.equal(dryRun.body.validation.trialBalance.difference, 0);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.total, 1);
  assert.equal(listed.body.items[0].id, job.body.id);
  assert.equal(listed.body.items[0].validation.status, "passed");
});

test("Phase 6 migration import writes approved opening balances and persists import summary", async () => {
  const accountSets = new Map();
  const migrationJobs = new Map();
  const openingBalances = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, structuredClone(accountSet));
      return structuredClone(accountSet);
    },
    findAccountSet: async (identifier) =>
      structuredClone([...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null),
    listAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    listAccessibleAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    updateMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    findMigrationJob: async (id) => structuredClone(migrationJobs.get(id) ?? null),
    listMigrationJobs: async (accountSetId = null, { status = null, jobType = null } = {}) =>
      [...migrationJobs.values()]
        .filter((job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status))
        .filter((job) => !jobType || job.jobType === jobType)
        .sort(byCreatedDesc)
        .map((job) => structuredClone(job)),
    saveOpeningBalance: async (openingBalance) => {
      const saved = {
        ...structuredClone(openingBalance),
        id: `opening-balance:${openingBalance.accountCode}:${openingBalance.fiscalYear}:${openingBalance.periodNo}`
      };
      openingBalances.set(`${openingBalance.accountCode}:${openingBalance.fiscalYear}:${openingBalance.periodNo}`, saved);
      return structuredClone(saved);
    },
    listOpeningBalances: async () => [...openingBalances.values()].map((balance) => structuredClone(balance))
  };
  const firstApi = createApi({ platformStore });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6IMPO",
      name: "Phase 6 Import",
      companyName: "Phase 6 Import Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-import-account-set"
  );
  await request(
    firstApi,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "1002",
      name: "Bank Deposit",
      accountType: "asset",
      normalBalance: "debit",
      isCashEquivalent: true
    },
    "phase6-import-account-bank"
  );
  await request(
    firstApi,
    "POST",
    "/accounts",
    {
      accountSetId: accountSet.body.id,
      code: "3001",
      name: "Paid-in Capital",
      accountType: "equity",
      normalBalance: "credit"
    },
    "phase6-import-account-capital"
  );
  const job = await request(
    firstApi,
    "POST",
    "/ops/migrations/jobs",
    {
      accountSetId: accountSet.body.id,
      jobType: "opening_balance",
      sourceType: "excel",
      targetObjectType: "opening_balance",
      fieldMapping: {
        accountCode: "accountCode",
        debit: "debit",
        credit: "credit"
      },
      sourceRows: [
        { accountCode: "1002", debit: 900, credit: 0 },
        { accountCode: "3001", debit: 0, credit: 900 }
      ],
      requestedBy: "migration-user"
    },
    "phase6-import-job"
  );
  await request(
    firstApi,
    "POST",
    `/ops/migrations/jobs/${encodeURIComponent(job.body.id)}/dry-run`,
    {
      requestedBy: "migration-user"
    },
    "phase6-import-dry-run"
  );
  const imported = await request(
    firstApi,
    "POST",
    `/ops/migrations/jobs/${encodeURIComponent(job.body.id)}/import`,
    {
      fiscalYear: 2026,
      periodNo: 1,
      requestedBy: "migration-user"
    },
    "phase6-import-apply"
  );
  const restartedApi = createApi({ platformStore });
  const balances = await request(restartedApi, "GET", "/opening-balances", null, null);
  const importedJobs = await request(
    restartedApi,
    "GET",
    `/ops/migrations/jobs?accountSetId=${encodeURIComponent(accountSet.body.id)}&status=imported&jobType=opening_balance`
  );

  assert.equal(imported.status, 200);
  assert.equal(imported.body.status, "imported");
  assert.equal(imported.body.businessMutation, true);
  assert.equal(imported.body.importSummary.importedCount, 2);
  assert.equal(imported.body.importSummary.targetObjectType, "opening_balance");
  assert.equal(balances.status, 200);
  assert.deepEqual(
    balances.body.map((balance) => [balance.accountCode, balance.openingDebit, balance.openingCredit]).sort(),
    [
      ["1002", 900, 0],
      ["3001", 0, 900]
    ]
  );
  assert.equal(importedJobs.status, 200);
  assert.equal(importedJobs.body.total, 1);
  assert.equal(importedJobs.body.items[0].importSummary.importedCount, 2);
});

test("Phase 6 migration import writes approved partner master data and persists import summary", async () => {
  const accountSets = new Map();
  const migrationJobs = new Map();
  const partners = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, structuredClone(accountSet));
      return structuredClone(accountSet);
    },
    findAccountSet: async (identifier) =>
      structuredClone([...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null),
    listAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    listAccessibleAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    updateMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    findMigrationJob: async (id) => structuredClone(migrationJobs.get(id) ?? null),
    listMigrationJobs: async (accountSetId = null, { status = null, jobType = null } = {}) =>
      [...migrationJobs.values()]
        .filter((job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status))
        .filter((job) => !jobType || job.jobType === jobType)
        .sort(byCreatedDesc)
        .map((job) => structuredClone(job)),
    createPartner: async (partner) => {
      partners.set(partner.id, structuredClone(partner));
      return structuredClone(partner);
    },
    listPartners: async (accountSetId, partnerType = null) =>
      [...partners.values()]
        .filter((partner) => partner.accountSetId === accountSetId)
        .filter((partner) => !partnerType || partner.partnerType === partnerType || partner.partnerType === "both")
        .sort((left, right) => left.code.localeCompare(right.code))
        .map((partner) => structuredClone(partner)),
    findPartner: async (identifier) =>
      structuredClone([...partners.values()].find((partner) => partner.id === identifier || partner.code === identifier) ?? null)
  };
  const firstApi = createApi({ platformStore });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6PMI",
      name: "Phase 6 Partner Migration",
      companyName: "Phase 6 Partner Migration Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-partner-import-account-set"
  );
  const job = await request(
    firstApi,
    "POST",
    "/ops/migrations/jobs",
    {
      accountSetId: accountSet.body.id,
      jobType: "partner_master",
      sourceType: "legacy_erp",
      targetObjectType: "partner",
      fieldMapping: {
        code: "legacyCode",
        name: "partnerName",
        partnerType: "type",
        taxRate: "taxRate",
        creditLimit: "creditLimit",
        paymentTerms: "paymentTerms",
        settlementMethod: "settlementMethod",
        isEnabled: "enabled"
      },
      sourceRows: [
        {
          legacyCode: "S-P6-001",
          partnerName: "Phase 6 Imported Supplier",
          type: "supplier",
          taxRate: 0.13,
          creditLimit: 0,
          paymentTerms: "30D",
          settlementMethod: "bank",
          enabled: true
        },
        {
          legacyCode: "C-P6-001",
          partnerName: "Phase 6 Imported Customer",
          type: "customer",
          taxRate: 0.06,
          creditLimit: 5000,
          paymentTerms: "COD",
          settlementMethod: "bank",
          enabled: true
        }
      ],
      requestedBy: "migration-user"
    },
    "phase6-partner-import-job"
  );
  const dryRun = await request(
    firstApi,
    "POST",
    `/ops/migrations/jobs/${encodeURIComponent(job.body.id)}/dry-run`,
    {
      requestedBy: "migration-user"
    },
    "phase6-partner-import-dry-run"
  );
  const imported = await request(
    firstApi,
    "POST",
    `/ops/migrations/jobs/${encodeURIComponent(job.body.id)}/import`,
    {
      requestedBy: "migration-user"
    },
    "phase6-partner-import-apply"
  );
  const restartedApi = createApi({ platformStore });
  const partnerList = await request(restartedApi, "GET", `/partners?accountSetId=${encodeURIComponent(accountSet.body.id)}`);
  const importedJobs = await request(
    restartedApi,
    "GET",
    `/ops/migrations/jobs?accountSetId=${encodeURIComponent(accountSet.body.id)}&status=imported&jobType=partner_master`
  );

  assert.equal(job.status, 201);
  assert.equal(dryRun.status, 200);
  assert.equal(dryRun.body.validation.status, "passed");
  assert.equal(imported.status, 200);
  assert.equal(imported.body.status, "imported");
  assert.equal(imported.body.businessMutation, true);
  assert.equal(imported.body.importSummary.targetObjectType, "partner");
  assert.equal(imported.body.importSummary.importedCount, 2);
  assert.equal(partnerList.status, 200);
  assert.deepEqual(
    partnerList.body.map((partner) => [partner.code, partner.name, partner.partnerType]).sort(),
    [
      ["C-P6-001", "Phase 6 Imported Customer", "customer"],
      ["S-P6-001", "Phase 6 Imported Supplier", "supplier"]
    ]
  );
  assert.equal(importedJobs.status, 200);
  assert.equal(importedJobs.body.total, 1);
  assert.equal(importedJobs.body.items[0].importSummary.importedCount, 2);
  assert.equal(importedJobs.body.items[0].importSummary.objectIds.length, 2);
});

test("Phase 6 migration import writes approved inventory item master data", async () => {
  const accountSets = new Map();
  const migrationJobs = new Map();
  const inventoryItems = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, structuredClone(accountSet));
      return structuredClone(accountSet);
    },
    findAccountSet: async (identifier) =>
      structuredClone([...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null),
    listAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    listAccessibleAccountSets: async () => [...accountSets.values()].map((accountSet) => structuredClone(accountSet)),
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    updateMigrationJob: async (job) => {
      migrationJobs.set(job.id, structuredClone(job));
      return structuredClone(migrationJobs.get(job.id));
    },
    findMigrationJob: async (id) => structuredClone(migrationJobs.get(id) ?? null),
    listMigrationJobs: async (accountSetId = null, { status = null, jobType = null } = {}) =>
      [...migrationJobs.values()]
        .filter((job) => (!accountSetId || job.accountSetId === accountSetId) && (!status || job.status === status))
        .filter((job) => !jobType || job.jobType === jobType)
        .sort(byCreatedDesc)
        .map((job) => structuredClone(job)),
    createInventoryItem: async (item) => {
      inventoryItems.set(item.id, structuredClone(item));
      return structuredClone(item);
    },
    listInventoryItems: async (accountSetId) =>
      [...inventoryItems.values()]
        .filter((item) => item.accountSetId === accountSetId)
        .sort((left, right) => left.code.localeCompare(right.code))
        .map((item) => structuredClone(item)),
    findInventoryItem: async (identifier) =>
      structuredClone([...inventoryItems.values()].find((item) => item.id === identifier || item.code === identifier) ?? null)
  };
  const firstApi = createApi({ platformStore });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6IIM",
      name: "Phase 6 Inventory Item Migration",
      companyName: "Phase 6 Inventory Migration Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-inventory-item-import-account-set"
  );
  const job = await request(
    firstApi,
    "POST",
    "/ops/migrations/jobs",
    {
      accountSetId: accountSet.body.id,
      jobType: "inventory_item_master",
      sourceType: "legacy_erp",
      targetObjectType: "inventory_item",
      fieldMapping: {
        code: "legacySku",
        name: "itemName",
        unit: "uom",
        category: "category",
        itemType: "itemType",
        costMethod: "costMethod",
        isBatchManaged: "batchManaged",
        isManufactured: "manufactured"
      },
      sourceRows: [
        {
          legacySku: "RM-P6-001",
          itemName: "Phase 6 Raw Material",
          uom: "kg",
          category: "raw",
          itemType: "raw_material",
          costMethod: "fifo",
          batchManaged: true,
          manufactured: false
        },
        {
          legacySku: "FG-P6-001",
          itemName: "Phase 6 Finished Good",
          uom: "pcs",
          category: "finished",
          itemType: "finished_good",
          costMethod: "moving_average",
          batchManaged: false,
          manufactured: true
        }
      ],
      requestedBy: "migration-user"
    },
    "phase6-inventory-item-import-job"
  );
  const dryRun = await request(
    firstApi,
    "POST",
    `/ops/migrations/jobs/${encodeURIComponent(job.body.id)}/dry-run`,
    {
      requestedBy: "migration-user"
    },
    "phase6-inventory-item-import-dry-run"
  );
  const imported = await request(
    firstApi,
    "POST",
    `/ops/migrations/jobs/${encodeURIComponent(job.body.id)}/import`,
    {
      requestedBy: "migration-user"
    },
    "phase6-inventory-item-import-apply"
  );
  const restartedApi = createApi({ platformStore });
  const itemList = await request(restartedApi, "GET", `/inventory-items?accountSetId=${encodeURIComponent(accountSet.body.id)}`);

  assert.equal(job.status, 201);
  assert.equal(dryRun.status, 200);
  assert.equal(dryRun.body.validation.status, "passed");
  assert.equal(imported.status, 200);
  assert.equal(imported.body.status, "imported");
  assert.equal(imported.body.businessMutation, true);
  assert.equal(imported.body.importSummary.targetObjectType, "inventory_item");
  assert.equal(imported.body.importSummary.importedCount, 2);
  assert.equal(itemList.status, 200);
  assert.deepEqual(
    itemList.body.map((item) => [item.code, item.name, item.unit, item.costMethod, item.isBatchManaged, item.isManufactured]).sort(),
    [
      ["FG-P6-001", "Phase 6 Finished Good", "pcs", "moving_average", false, true],
      ["RM-P6-001", "Phase 6 Raw Material", "kg", "fifo", true, false]
    ]
  );
});

test("Phase 6 Agent actions can be listed by account set and approval status", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6AQL",
      name: "Phase 6 Agent Action Queue",
      companyName: "Phase 6 Action Queue Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-action-queue-account-set"
  );
  const otherAccountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6AQO",
      name: "Phase 6 Agent Action Other",
      companyName: "Phase 6 Action Other Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-action-queue-other-account-set"
  );

  const dryRun = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: ["period:2026-01"],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "agent-user"
    },
    "phase6-action-queue-dry-run"
  );
  const submitted = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: ["period:2026-02"],
      payload: { fiscalYear: 2026, periodNo: 2 },
      requestedBy: "agent-user"
    },
    "phase6-action-queue-submit-source"
  );
  await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(submitted.body.id)}/submit`,
    { submittedBy: "agent-user", approvalComment: "ready for queue review" },
    "phase6-action-queue-submit"
  );
  await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: otherAccountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: ["period:2026-03"],
      payload: { fiscalYear: 2026, periodNo: 3 },
      requestedBy: "other-agent"
    },
    "phase6-action-queue-other"
  );

  const queue = await request(api, "GET", `/agent-actions?accountSetId=${encodeURIComponent(accountSet.body.id)}`);
  const submittedQueue = await request(
    api,
    "GET",
    `/agent-actions?accountSetId=${encodeURIComponent(accountSet.body.id)}&status=submitted_for_approval`
  );

  assert.equal(queue.status, 200);
  assert.equal(queue.body.accountSetId, accountSet.body.id);
  assert.equal(queue.body.total, 2);
  assert.deepEqual(
    queue.body.items.map((item) => item.accountSetId),
    [accountSet.body.id, accountSet.body.id]
  );
  assert.ok(queue.body.items.some((item) => item.id === dryRun.body.id && item.status === "dry_run_completed"));
  assert.ok(queue.body.items.some((item) => item.id === submitted.body.id && item.status === "submitted_for_approval"));
  assert.equal(submittedQueue.status, 200);
  assert.equal(submittedQueue.body.total, 1);
  assert.equal(submittedQueue.body.items[0].id, submitted.body.id);
  assert.equal(submittedQueue.body.items[0].approvalProgress.remainingCount, 2);
});

test("Phase 6 Agent action queue supports pagination for production workloads", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6PAGE",
      name: "Phase 6 Agent Action Pagination",
      companyName: "Phase 6 Agent Pagination Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-agent-pagination-account-set"
  );
  for (const periodNo of [1, 2, 3]) {
    await request(
      api,
      "POST",
      "/agent-actions",
      {
        accountSetId: accountSet.body.id,
        toolName: "run_close_checklist",
        dryRun: true,
        evidenceRefs: [`period:2026-${String(periodNo).padStart(2, "0")}`],
        payload: { fiscalYear: 2026, periodNo },
        requestedBy: "agent-user"
      },
      `phase6-agent-pagination-action-${periodNo}`
    );
  }

  const firstPage = await request(api, "GET", `/agent-actions?accountSetId=${encodeURIComponent(accountSet.body.id)}&page=1&pageSize=1`);
  const secondPage = await request(api, "GET", `/agent-actions?accountSetId=${encodeURIComponent(accountSet.body.id)}&page=2&pageSize=1`);

  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.total, 3);
  assert.equal(firstPage.body.page, 1);
  assert.equal(firstPage.body.pageSize, 1);
  assert.equal(firstPage.body.items.length, 1);
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.total, 3);
  assert.equal(secondPage.body.page, 2);
  assert.equal(secondPage.body.pageSize, 1);
  assert.equal(secondPage.body.items.length, 1);
  assert.notEqual(secondPage.body.items[0].id, firstPage.body.items[0].id);
});

test("Phase 6 Agent actions reverse executed records through the audit trail", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6REV",
      name: "Phase 6 Agent Reverse",
      companyName: "Phase 6 Reverse Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-agent-reverse-account-set"
  );

  const action = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "run_close_checklist",
      dryRun: true,
      evidenceRefs: ["period:2026-01"],
      payload: { fiscalYear: 2026, periodNo: 1 },
      requestedBy: "agent-user"
    },
    "phase6-agent-reverse-action-create"
  );
  const reverseBeforeExecute = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/reverse`,
    { reversedBy: "controller", reversalReason: "premature reversal should fail" },
    "phase6-agent-reverse-before-execute"
  );
  await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/submit`,
    { submittedBy: "agent-user" },
    "phase6-agent-reverse-submit"
  );
  await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
    { approvedBy: "controller" },
    "phase6-agent-reverse-approve-controller"
  );
  await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
    { approvedBy: "cfo" },
    "phase6-agent-reverse-approve-cfo"
  );
  const executed = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/execute`,
    { executedBy: "controller", userTokenConfirmed: true },
    "phase6-agent-reverse-execute"
  );
  const reversed = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/reverse`,
    { reversedBy: "controller", reversalReason: "rollback after execution review" },
    "phase6-agent-reverse"
  );
  const reverseAgain = await request(
    api,
    "POST",
    `/agent-actions/${encodeURIComponent(action.body.id)}/reverse`,
    { reversedBy: "controller", reversalReason: "duplicate reversal should fail" },
    "phase6-agent-reverse-duplicate"
  );
  const replay = await request(api, "GET", `/agent-actions/${encodeURIComponent(action.body.id)}/replay`);

  assert.equal(reverseBeforeExecute.status, 409);
  assert.equal(executed.status, 200);
  assert.equal(executed.body.status, "executed");
  assert.equal(reversed.status, 200);
  assert.equal(reversed.body.status, "reversed");
  assert.equal(reversed.body.reversalResult.status, "reversed_without_business_mutation");
  assert.equal(reversed.body.reversalResult.reversedBy, "controller");
  assert.equal(reversed.body.reversalResult.reversalReason, "rollback after execution review");
  assert.equal(reverseAgain.status, 409);
  assert.ok(replay.body.events.some((event) => event.eventType === "reversed"));
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent_action.reverse" && log.objectType === "agent_action" && log.objectId === action.body.id
    )
  );
});

test("Phase 6 Agent action execution blocks tampered attachment evidence", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "ais-agent-evidence-"));
  const api = createApi({ attachmentStorageRoot: storageRoot });
  try {
    const accountSet = await request(
      api,
      "POST",
      "/account-sets",
      {
        code: "P6EVD",
        name: "Phase 6 Agent Evidence",
        companyName: "Phase 6 Evidence Co.",
        baseCurrency: "CNY",
        accountingStandard: "Small Business Accounting Standards",
        startYear: 2026,
        startPeriod: 1
      },
      "phase6-evidence-account-set"
    );
    const evidenceContent = Buffer.from("period close proof");
    const upload = await request(
      api,
      "POST",
      "/attachments/upload",
      {
        accountSetId: accountSet.body.id,
        filename: "close-evidence.txt",
        contentType: "text/plain",
        byteSize: evidenceContent.length,
        contentBase64: evidenceContent.toString("base64"),
        uploadedBy: "agent-user"
      },
      "phase6-evidence-upload"
    );
    const action = await request(
      api,
      "POST",
      "/agent-actions",
      {
        accountSetId: accountSet.body.id,
        toolName: "run_close_checklist",
        dryRun: true,
        evidenceRefs: [upload.body.id],
        payload: { fiscalYear: 2026, periodNo: 1 },
        requestedBy: "agent-user"
      },
      "phase6-evidence-action"
    );

    await request(
      api,
      "POST",
      `/agent-actions/${encodeURIComponent(action.body.id)}/submit`,
      { submittedBy: "agent-user" },
      "phase6-evidence-submit"
    );
    await request(
      api,
      "POST",
      `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
      { approvedBy: "controller" },
      "phase6-evidence-approve"
    );
    await request(
      api,
      "POST",
      `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
      { approvedBy: "cfo" },
      "phase6-evidence-second-approve"
    );
    api.state.attachments.set(upload.body.id, {
      ...api.state.attachments.get(upload.body.id),
      checksum: "sha256:tampered-after-approval"
    });

    const executed = await request(
      api,
      "POST",
      `/agent-actions/${encodeURIComponent(action.body.id)}/execute`,
      { executedBy: "controller", userTokenConfirmed: true },
      "phase6-evidence-execute"
    );

    assert.equal(upload.status, 201);
    assert.equal(action.status, 201);
    assert.deepEqual(action.body.evidenceRefs, [upload.body.id]);
    assert.equal(action.body.evidenceSnapshots[0].checksum, upload.body.checksum);
    assert.equal(executed.status, 409);
    assert.equal(executed.body.code, "AGENT_EVIDENCE_HASH_MISMATCH");
    assert.equal(api.state.agentActions.get(action.body.id).status, "approved");
    assert.ok(
      api.state.agentReplayEvents.some(
        (event) => event.agentActionId === action.body.id && event.eventType === "evidence_verification_failed"
      )
    );
    const securityEvents = await request(
      api,
      "GET",
      `/security/events?accountSetId=${encodeURIComponent(accountSet.body.id)}&eventType=evidence_verification_failed&severity=high`
    );
    assert.equal(securityEvents.status, 200);
    assert.equal(securityEvents.body.total, 1);
    assert.equal(securityEvents.body.items[0].objectType, "agent_action");
    assert.equal(securityEvents.body.items[0].objectId, action.body.id);
    assert.equal(securityEvents.body.items[0].actorId, "controller");
    assert.equal(securityEvents.body.items[0].payload.mismatches[0].attachmentId, upload.body.id);
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("Phase 6 Agent approval blocks tampered attachment evidence", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "ais-agent-approval-evidence-"));
  const api = createApi({ attachmentStorageRoot: storageRoot });
  try {
    const accountSet = await request(
      api,
      "POST",
      "/account-sets",
      {
        code: "P6APPEVD",
        name: "Phase 6 Approval Evidence",
        companyName: "Phase 6 Approval Evidence Co.",
        baseCurrency: "CNY",
        accountingStandard: "Small Business Accounting Standards",
        startYear: 2026,
        startPeriod: 1
      },
      "phase6-approval-evidence-account-set"
    );
    const evidenceContent = Buffer.from("approval proof");
    const upload = await request(
      api,
      "POST",
      "/attachments/upload",
      {
        accountSetId: accountSet.body.id,
        filename: "approval-evidence.txt",
        contentType: "text/plain",
        byteSize: evidenceContent.length,
        contentBase64: evidenceContent.toString("base64"),
        uploadedBy: "agent-user"
      },
      "phase6-approval-evidence-upload"
    );
    const action = await request(
      api,
      "POST",
      "/agent-actions",
      {
        accountSetId: accountSet.body.id,
        toolName: "run_close_checklist",
        dryRun: true,
        evidenceRefs: [upload.body.id],
        payload: { fiscalYear: 2026, periodNo: 1 },
        requestedBy: "agent-user"
      },
      "phase6-approval-evidence-action"
    );
    await request(
      api,
      "POST",
      `/agent-actions/${encodeURIComponent(action.body.id)}/submit`,
      { submittedBy: "agent-user" },
      "phase6-approval-evidence-submit"
    );
    api.state.attachments.set(upload.body.id, {
      ...api.state.attachments.get(upload.body.id),
      checksum: "sha256:tampered-before-approval"
    });

    const approved = await request(
      api,
      "POST",
      `/agent-actions/${encodeURIComponent(action.body.id)}/approve`,
      { approvedBy: "controller" },
      "phase6-approval-evidence-approve"
    );

    assert.equal(approved.status, 409);
    assert.equal(approved.body.code, "AGENT_EVIDENCE_HASH_MISMATCH");
    assert.equal(api.state.agentActions.get(action.body.id).status, "submitted_for_approval");
    assert.ok(
      api.state.agentReplayEvents.some(
        (event) => event.agentActionId === action.body.id && event.eventType === "evidence_verification_failed"
      )
    );
    const securityEvents = await request(
      api,
      "GET",
      `/security/events?accountSetId=${encodeURIComponent(accountSet.body.id)}&eventType=evidence_verification_failed&severity=high`
    );
    assert.equal(securityEvents.status, 200);
    assert.equal(securityEvents.body.total, 1);
    assert.equal(securityEvents.body.items[0].objectType, "agent_action");
    assert.equal(securityEvents.body.items[0].objectId, action.body.id);
    assert.equal(securityEvents.body.items[0].actorId, "controller");
    assert.equal(securityEvents.body.items[0].payload.mismatches[0].attachmentId, upload.body.id);
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("Phase 6 Agent tool registry exposes schemas, risk, and approval policy", async () => {
  const api = createApi();

  const response = await request(api, "GET", "/agent-tools");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.tools));
  const toolNames = response.body.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("suggest_purchase_order_draft"));
  assert.ok(toolNames.includes("suggest_inventory_movement_draft"));
  assert.ok(toolNames.includes("suggest_material_requisition_draft"));
  assert.ok(toolNames.includes("suggest_product_receipt_draft"));
  assert.ok(toolNames.includes("create_voucher_draft"));
  assert.ok(toolNames.includes("post_approved_voucher"));

  const purchaseTool = response.body.tools.find((tool) => tool.name === "suggest_purchase_order_draft");
  assert.equal(purchaseTool.riskLevel, "medium");
  assert.equal(purchaseTool.actionKind, "draft_generation");
  assert.equal(purchaseTool.draftType, "purchase_order");
  assert.equal(purchaseTool.agentTokenAllowed, true);
  assert.equal(purchaseTool.approvalPolicy.requiresHumanConfirmation, true);
  assert.deepEqual(purchaseTool.inputSchema.required, ["accountSetId", "userInstruction"]);
  assert.ok(purchaseTool.outputSchema.required.includes("draftPayload"));
  assert.ok(purchaseTool.outputSchema.required.includes("unmatchedItems"));

  const requisitionTool = response.body.tools.find((tool) => tool.name === "suggest_material_requisition_draft");
  assert.equal(requisitionTool.draftType, "material_requisition");
  assert.equal(requisitionTool.approvalPolicy.requiresHumanConfirmation, true);

  const receiptTool = response.body.tools.find((tool) => tool.name === "suggest_product_receipt_draft");
  assert.equal(receiptTool.draftType, "product_receipt");
  assert.equal(receiptTool.approvalPolicy.requiresHumanConfirmation, true);

  const postTool = response.body.tools.find((tool) => tool.name === "post_approved_voucher");
  assert.equal(postTool.riskLevel, "high");
  assert.equal(postTool.approvalPolicy.minApprovals, 2);
  assert.equal(postTool.agentTokenAllowed, false);
});

test("Phase 6 Agent tool invocation creates draft candidates through the registry", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6INV",
      name: "Phase 6 Invoke Tool",
      companyName: "Phase 6 Invoke Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-tool-invoke-account-set"
  );

  const response = await request(
    api,
    "POST",
    "/agent-tools/suggest_purchase_order_draft/invoke",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      userInstruction: "Generate a purchase order draft for 5 units at 20 CNY.",
      evidenceRefs: ["quote:AGENT-PO-1"],
      attachmentIds: [],
      requestedBy: "external-agent",
      dryRun: true
    },
    "phase6-agent-tool-invoke-purchase"
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.toolName, "suggest_purchase_order_draft");
  assert.equal(response.body.resultType, "agent_draft_candidate");
  assert.equal(response.body.result.draftType, "purchase_order");
  assert.equal(response.body.result.status, "candidate");
  assert.equal(response.body.result.dryRun, true);
  assert.equal(response.body.result.requiresHumanConfirmation, true);
  assert.equal(api.state.agentDraftCandidates.get(response.body.result.id).id, response.body.result.id);
  assert.ok(
    api.state.auditLogs.some(
      (log) => log.action === "agent_tool.invoke" && log.objectType === "agent_tool" && log.objectId === "suggest_purchase_order_draft"
    )
  );
});

test("Phase 6 Agent tool draft invocation persists candidates and LLM runs through platform store restarts", async () => {
  const accountSets = new Map();
  const llmDraftRuns = new Map();
  const agentDraftCandidates = new Map();
  const byCreatedDesc = (left, right) => String(right.createdAt).localeCompare(String(left.createdAt));
  const platformStore = {
    createAccountSet: async (accountSet) => {
      accountSets.set(accountSet.id, accountSet);
      return accountSet;
    },
    findAccountSet: async (identifier) =>
      [...accountSets.values()].find((accountSet) => accountSet.id === identifier || accountSet.code === identifier) ?? null,
    listAccountSets: async () => [...accountSets.values()],
    listAccessibleAccountSets: async () => [...accountSets.values()],
    canAccessAccountSet: async (_actorId, accountSetId) => accountSets.has(accountSetId),
    createLlmDraftRun: async (run) => {
      llmDraftRuns.set(run.id, structuredClone(run));
      return structuredClone(llmDraftRuns.get(run.id));
    },
    listLlmDraftRuns: async (accountSetId = null, filters = {}) =>
      [...llmDraftRuns.values()]
        .filter((run) => (!accountSetId || run.accountSetId === accountSetId) && (!filters.status || run.status === filters.status))
        .filter((run) => !filters.draftType || run.inputSummary?.draftType === filters.draftType)
        .sort(byCreatedDesc)
        .map((run) => structuredClone(run)),
    createAgentDraftCandidate: async (candidate) => {
      agentDraftCandidates.set(candidate.id, structuredClone(candidate));
      return structuredClone(agentDraftCandidates.get(candidate.id));
    },
    updateAgentDraftCandidate: async (candidate) => {
      agentDraftCandidates.set(candidate.id, structuredClone(candidate));
      return structuredClone(agentDraftCandidates.get(candidate.id));
    },
    findAgentDraftCandidate: async (id) => structuredClone(agentDraftCandidates.get(id) ?? null),
    listAgentDraftCandidates: async (accountSetId = null, filters = {}) =>
      [...agentDraftCandidates.values()]
        .filter((candidate) => (!accountSetId || candidate.accountSetId === accountSetId) && (!filters.status || candidate.status === filters.status))
        .filter((candidate) => !filters.draftType || candidate.draftType === filters.draftType)
        .sort(byCreatedDesc)
        .map((candidate) => structuredClone(candidate))
  };
  const firstApi = createApi({ platformStore });
  const accountSet = await request(
    firstApi,
    "POST",
    "/account-sets",
    {
      code: "P6TIP",
      name: "Phase 6 Tool Invoke Persisted",
      companyName: "Phase 6 Tool Invoke Persisted Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-persisted-tool-invoke-account-set"
  );
  const invoked = await request(
    firstApi,
    "POST",
    "/agent-tools/suggest_purchase_order_draft/invoke",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      userInstruction: "Generate persisted tool purchase order draft for 3 units at 12 CNY.",
      evidenceRefs: ["quote:persisted-tool"],
      attachmentIds: [],
      requestedBy: "external-agent",
      dryRun: true
    },
    "phase6-persisted-tool-invoke"
  );
  const restartedApi = createApi({ platformStore });
  const queue = await request(
    restartedApi,
    "GET",
    `/agent/draft-candidates?accountSetId=${encodeURIComponent(accountSet.body.id)}&draftType=purchase_order`
  );
  const runs = await request(
    restartedApi,
    "GET",
    `/ai/llm-draft-runs?accountSetId=${encodeURIComponent(accountSet.body.id)}&draftType=purchase_order`
  );

  assert.equal(invoked.status, 201);
  assert.equal(invoked.body.resultType, "agent_draft_candidate");
  assert.equal(queue.status, 200);
  assert.equal(queue.body.total, 1);
  assert.equal(queue.body.items[0].id, invoked.body.result.id);
  assert.equal(runs.status, 200);
  assert.equal(runs.body.total, 1);
  assert.equal(runs.body.items[0].id, invoked.body.result.llmDraftRun.id);
});

test("Phase 6 Agent tool invocation rejects payloads that violate the registered input schema", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6SCH",
      name: "Phase 6 Tool Schema",
      companyName: "Phase 6 Schema Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-tool-schema-account-set"
  );

  const missingRequired = await request(
    api,
    "POST",
    "/agent-tools/suggest_purchase_order_draft/invoke",
    {
      accountSetId: accountSet.body.id,
      evidenceRefs: ["quote:PO-SCHEMA"],
      dryRun: true
    },
    "phase6-agent-tool-schema-missing"
  );
  const wrongType = await request(
    api,
    "POST",
    "/agent-tools/suggest_purchase_order_draft/invoke",
    {
      accountSetId: accountSet.body.id,
      userInstruction: "Generate a purchase order draft.",
      evidenceRefs: "quote:PO-SCHEMA",
      dryRun: true
    },
    "phase6-agent-tool-schema-type"
  );

  assert.equal(missingRequired.status, 400);
  assert.equal(missingRequired.body.code, "AGENT_TOOL_SCHEMA_INVALID");
  assert.match(missingRequired.body.message, /userInstruction/);
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.code, "AGENT_TOOL_SCHEMA_INVALID");
  assert.match(wrongType.body.message, /evidenceRefs/);
  assert.equal(api.state.agentDraftCandidates.size, 0);
});

test("Phase 6 Agent actions reject tools outside the registry before dry-run", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P6BAD",
      name: "Phase 6 Unknown Agent Tool",
      companyName: "Phase 6 Unknown Tool Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase6-unknown-tool-account-set"
  );

  const response = await request(
    api,
    "POST",
    "/agent-actions",
    {
      accountSetId: accountSet.body.id,
      toolName: "invented_direct_posting_tool",
      dryRun: true,
      evidenceRefs: [],
      payload: { amount: 100 },
      requestedBy: "agent-user"
    },
    "phase6-unknown-agent-tool"
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "AGENT_TOOL_NOT_REGISTERED");
  assert.equal(api.state.agentActions.size, 0);
});

test("AI voucher suggestions accept available attachment ids as evidence", async () => {
  const api = createApi();
  api.state.permissionsByActor.set("ai-user", new Set(["ai.generate_draft", "attachment.upload"]));
  api.state.accountSetAccessByActor.set("ai-user", new Set(["account-set:demo"]));

  const attachment = await api.handle({
    method: "POST",
    path: "/attachments/upload",
    headers: {
      "Idempotency-Key": "ai-attachment-upload",
      "Actor-Id": "ai-user"
    },
    body: {
      accountSetId: "account-set:demo",
      filename: "invoice.txt",
      contentType: "text/plain",
      byteSize: 11,
      contentBase64: Buffer.from("invoice 500").toString("base64"),
      uploadedBy: "ai-user"
    }
  });
  const suggestion = await api.handle({
    method: "POST",
    path: "/ai/voucher-drafts",
    headers: {
      "Idempotency-Key": "ai-draft-with-attachment",
      "Actor-Id": "ai-user"
    },
    body: {
      accountSetId: "account-set:demo",
      dryRun: true,
      content: "Buy office supplies 500 by bank payment",
      evidenceRefs: ["manual-note:1"],
      attachmentIds: [attachment.body.id]
    }
  });

  assert.equal(attachment.status, 201);
  assert.equal(suggestion.status, 201);
  assert.deepEqual(suggestion.body.attachmentIds, [attachment.body.id]);
  assert.deepEqual(suggestion.body.evidenceRefs, ["manual-note:1", attachment.body.id]);
});

test("AI voucher suggestions reject unavailable attachment ids", async () => {
  const api = createApi();
  api.state.permissionsByActor.set("ai-user", new Set(["ai.generate_draft"]));
  api.state.attachments.set("attachment:uploading-ai", {
    id: "attachment:uploading-ai",
    accountSetId: "account-set:demo",
    filename: "invoice.pdf",
    contentType: "application/pdf",
    byteSize: 10,
    storageProvider: "external",
    storageKey: "pending/invoice.pdf",
    status: "uploading",
    uploadedBy: "ai-user",
    uploadedAt: "now"
  });

  const suggestion = await api.handle({
    method: "POST",
    path: "/ai/voucher-drafts",
    headers: {
      "Idempotency-Key": "ai-draft-with-unavailable-attachment",
      "Actor-Id": "ai-user"
    },
    body: {
      accountSetId: "account-set:demo",
      dryRun: true,
      content: "Buy office supplies 500 by bank payment",
      attachmentIds: ["attachment:uploading-ai"]
    }
  });

  assert.equal(suggestion.status, 409);
  assert.equal(suggestion.body.code, "AI_ATTACHMENT_NOT_AVAILABLE");
});

test("AI voucher draft conversion links reviewed attachment evidence to the formal voucher", async () => {
  const api = createApi();
  api.state.permissionsByActor.set(
    "maker",
    new Set(["ai.generate_draft", "attachment.upload", "voucher.create", "voucher.view"])
  );

  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "312",
      name: "AI Attachment Conversion Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "ai-attachment-convert-account-set"
  );
  api.state.accountSetAccessByActor.set("maker", new Set([accountSet.body.id]));
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "ai-attachment-convert-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "ai-attachment-convert-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "ai-attachment-convert-expense");

  const attachment = await api.handle({
    method: "POST",
    path: "/attachments/upload",
    headers: {
      "Idempotency-Key": "ai-attachment-convert-upload",
      "Actor-Id": "maker"
    },
    body: {
      accountSetId: accountSet.body.id,
      filename: "invoice.txt",
      contentType: "text/plain",
      byteSize: 11,
      contentBase64: Buffer.from("invoice 500").toString("base64"),
      uploadedBy: "maker"
    }
  });
  const draft = await api.handle({
    method: "POST",
    path: "/ai/voucher-drafts",
    headers: {
      "Idempotency-Key": "ai-attachment-convert-draft",
      "Actor-Id": "maker"
    },
    body: {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      dryRun: true,
      content: "Buy office supplies 500 by bank payment",
      attachmentIds: [attachment.body.id]
    }
  });
  const converted = await api.handle({
    method: "POST",
    path: `/ai/voucher-drafts/${draft.body.id}/convert-to-voucher`,
    headers: {
      "Idempotency-Key": "ai-attachment-convert-to-voucher",
      "Actor-Id": "maker"
    },
    body: {
      reviewedBy: "maker"
    }
  });
  const linkedAttachments = await api.handle({
    method: "GET",
    path: `/vouchers/${converted.body.id}/attachments`,
    headers: { "Actor-Id": "maker" }
  });

  assert.equal(converted.status, 201);
  assert.equal(converted.body.attachmentCount, 1);
  assert.equal(linkedAttachments.status, 200);
  assert.equal(linkedAttachments.body.length, 1);
  assert.equal(linkedAttachments.body[0].id, attachment.body.id);
  assert.ok(
    api.state.attachmentLinks.find(
      (link) =>
        link.attachmentId === attachment.body.id &&
        link.objectType === "voucher" &&
        link.objectId === converted.body.id
    )
  );
});

test("AI voucher suggestions convert to formal voucher drafts only after human confirmation", async () => {
  const api = createApi();
  api.state.permissionsByActor.set("maker", new Set(["ai.generate_draft", "voucher.create", "voucher.view"]));

  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "012",
      name: "AI Conversion Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "ai-convert-account-set"
  );
  api.state.accountSetAccessByActor.set("maker", new Set([accountSet.body.id]));
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "ai-convert-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "ai-convert-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "ai-convert-expense");

  const suggestion = await api.handle({
    method: "POST",
    path: "/ai/voucher-suggestions",
    headers: {
      "Idempotency-Key": "ai-convert-suggestion",
      "Actor-Id": "maker"
    },
    body: {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      dryRun: true,
      content: "购买办公用品500元，银行付款",
      evidenceRefs: ["attachment:invoice-002"]
    }
  });
  const converted = await api.handle({
    method: "POST",
    path: `/ai/voucher-suggestions/${suggestion.body.id}/convert-to-voucher`,
    headers: {
      "Idempotency-Key": "ai-convert-to-voucher",
      "Actor-Id": "maker"
    },
    body: {
      reviewedBy: "maker"
    }
  });
  const vouchers = await api.handle({
    method: "GET",
    path: "/vouchers",
    headers: { "Actor-Id": "maker" }
  });

  assert.equal(converted.status, 201);
  assert.equal(converted.body.status, "draft");
  assert.equal(converted.body.sourceType, "ai");
  assert.equal(converted.body.aiDraftId, suggestion.body.id);
  assert.equal(converted.body.createdBy, "maker");
  assert.equal(converted.body.lines.length, 2);
  assert.equal(vouchers.body.length, 1);
  assert.equal(api.state.aiVoucherSuggestions.get(suggestion.body.id).convertedVoucherId, converted.body.id);
});

test("plan-compatible AI voucher draft endpoints generate, query, and convert reviewed drafts", async () => {
  const api = createApi();
  api.state.permissionsByActor.set("maker", new Set(["ai.generate_draft", "voucher.create", "voucher.view"]));

  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "212",
      name: "Plan AI Draft Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "plan-ai-account-set"
  );
  api.state.accountSetAccessByActor.set("maker", new Set([accountSet.body.id]));
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "plan-ai-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "plan-ai-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "plan-ai-expense");

  const draft = await api.handle({
    method: "POST",
    path: "/ai/voucher-drafts",
    headers: {
      "Idempotency-Key": "plan-ai-draft",
      "Actor-Id": "maker"
    },
    body: {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      dryRun: true,
      content: "Buy office supplies 500 by bank payment",
      evidenceRefs: ["attachment:invoice-003"]
    }
  });
  const draftDetail = await api.handle({
    method: "GET",
    path: `/ai/voucher-drafts/${draft.body.id}`,
    headers: { "Actor-Id": "maker" }
  });
  const converted = await api.handle({
    method: "POST",
    path: `/ai/voucher-drafts/${draft.body.id}/convert-to-voucher`,
    headers: {
      "Idempotency-Key": "plan-ai-convert",
      "Actor-Id": "maker"
    },
    body: {
      reviewedBy: "maker"
    }
  });

  assert.equal(draft.status, 201);
  assert.equal(draft.body.dryRun, true);
  assert.equal(draftDetail.status, 200);
  assert.deepEqual(draftDetail.body.evidenceRefs, ["attachment:invoice-003"]);
  assert.equal(converted.status, 201);
  assert.equal(converted.body.sourceType, "ai");
  assert.equal(converted.body.aiDraftId, draft.body.id);
});

test("voucher attachments can be uploaded and linked but cannot be deleted after posting", async () => {
  const api = createApi();

  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "013",
      name: "Attachment Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "attachment-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "attachment-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "attachment-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "attachment-expense");
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "attachment-voucher"
  );

  const upload = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      filename: "invoice-013.pdf",
      contentType: "application/pdf",
      byteSize: 2048,
      checksum: "sha256:invoice-013",
      uploadedBy: "zhang-san"
    },
    "attachment-upload"
  );
  const link = await request(
    api,
    "POST",
    "/attachment-links",
    {
      attachmentId: upload.body.id,
      objectType: "voucher",
      objectId: voucher.body.id,
      linkedBy: "zhang-san"
    },
    "attachment-link"
  );
  const beforePosting = await request(api, "GET", `/vouchers/${voucher.body.id}/attachments`, null, null);

  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "attachment-submit");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, "attachment-approve");
  await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "wang-wu" }, "attachment-post");
  const deleteAfterPosting = await request(
    api,
    "DELETE",
    `/attachments/${upload.body.id}`,
    { deletedBy: "zhang-san" },
    "attachment-delete-posted"
  );
  const status = await request(api, "GET", `/attachments/${upload.body.id}/status`, null, null);

  assert.equal(upload.status, 201);
  assert.equal(upload.body.status, "available");
  assert.equal(link.status, 201);
  assert.equal(beforePosting.status, 200);
  assert.equal(beforePosting.body.length, 1);
  assert.equal(beforePosting.body[0].filename, "invoice-013.pdf");
  assert.equal(deleteAfterPosting.status, 409);
  assert.equal(deleteAfterPosting.body.code, "POSTED_VOUCHER_ATTACHMENT_DELETE_BLOCKED");
  assert.equal(status.body.status, "available");
});

test("vouchers with uploading attachments cannot be posted", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "037",
      name: "Uploading Attachment Account Set",
      companyName: "Demo Technology Co., Ltd.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "uploading-attachment-account-set"
  );
  await request(api, "POST", `/account-sets/${accountSet.body.id}/periods/generate`, {}, "uploading-attachment-periods");
  await request(api, "POST", "/accounts", { code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit" }, "uploading-attachment-bank");
  await request(api, "POST", "/accounts", { code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" }, "uploading-attachment-expense");
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-17",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "uploading-attachment-voucher"
  );
  const upload = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      filename: "invoice-uploading.pdf",
      contentType: "application/pdf",
      byteSize: 2048,
      checksum: "sha256:invoice-uploading",
      uploadedBy: "zhang-san"
    },
    "uploading-attachment-upload"
  );
  await request(
    api,
    "POST",
    "/attachment-links",
    {
      attachmentId: upload.body.id,
      objectType: "voucher",
      objectId: voucher.body.id,
      linkedBy: "zhang-san"
    },
    "uploading-attachment-link"
  );
  api.state.attachments.set(upload.body.id, { ...api.state.attachments.get(upload.body.id), status: "uploading" });

  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "zhang-san" }, "uploading-attachment-submit");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "li-si" }, "uploading-attachment-approve");
  const post = await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "wang-wu" }, "uploading-attachment-post");

  assert.equal(post.status, 409);
  assert.equal(post.body.code, "VOUCHER_ATTACHMENT_NOT_AVAILABLE");
  assert.equal(api.state.vouchers.get(voucher.body.id).status, "approved");
});

test("attachment upload persists binary content and rejects byte-size mismatches", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "ais-erp-attachments-"));
  const api = createApi({ attachmentStorageRoot: storageRoot });

  try {
    const content = Buffer.from("invoice attachment bytes", "utf8");
    const upload = await request(
      api,
      "POST",
      "/attachments/upload",
      {
        filename: "invoice-binary.txt",
        contentType: "text/plain",
        byteSize: content.length,
        contentBase64: content.toString("base64"),
        uploadedBy: "zhang-san"
      },
      "attachment-binary-upload"
    );
    const downloaded = await request(api, "GET", `/attachments/${upload.body.id}/content`, null, null);
    const invalidSize = await request(
      api,
      "POST",
      "/attachments/upload",
      {
        filename: "bad-size.txt",
        contentType: "text/plain",
        byteSize: content.length + 1,
        contentBase64: content.toString("base64"),
        uploadedBy: "zhang-san"
      },
      "attachment-binary-size-mismatch"
    );

    assert.equal(upload.status, 201);
    assert.equal(upload.body.storageProvider, "local");
    assert.ok(upload.body.storageKey.startsWith("local/attachments/"));
    assert.equal(upload.body.byteSize, content.length);
    assert.match(upload.body.checksum, /^sha256:/);
    assert.equal(existsSync(join(storageRoot, upload.body.storageKey)), true);
    assert.equal(downloaded.status, 200);
    assert.equal(Buffer.from(downloaded.body.contentBase64, "base64").toString("utf8"), "invoice attachment bytes");
    assert.equal(downloaded.body.filename, "invoice-binary.txt");
    assert.equal(invalidSize.status, 400);
    assert.equal(invalidSize.body.code, "ATTACHMENT_SIZE_MISMATCH");
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("external attachment storage rejects local binary uploads and accepts object metadata", async () => {
  const api = createApi({ attachmentStorageProvider: "external" });
  const content = Buffer.from("external invoice bytes", "utf8");

  const binaryUpload = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      filename: "external-invoice.txt",
      contentType: "text/plain",
      byteSize: content.length,
      contentBase64: content.toString("base64"),
      uploadedBy: "zhang-san"
    },
    "external-storage-binary-upload"
  );
  const missingMetadataUpload = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      filename: "external-invoice.txt",
      contentType: "text/plain",
      byteSize: content.length,
      checksum: "sha256:external-object-checksum",
      uploadedBy: "zhang-san"
    },
    "external-storage-missing-metadata-upload"
  );
  const missingChecksumUpload = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      filename: "external-invoice.txt",
      contentType: "text/plain",
      byteSize: content.length,
      storageProvider: "external",
      storageKey: "invoices/2026/external-no-checksum.txt",
      uploadedBy: "zhang-san"
    },
    "external-storage-missing-checksum-upload"
  );
  const metadataUpload = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      filename: "external-invoice.txt",
      contentType: "text/plain",
      byteSize: content.length,
      checksum: "sha256:external-object-checksum",
      storageProvider: "external",
      storageKey: "invoices/2026/external-invoice.txt",
      uploadedBy: "zhang-san"
    },
    "external-storage-metadata-upload"
  );
  const downloaded = await request(api, "GET", `/attachments/${metadataUpload.body.id}/content`, null, null);

  assert.equal(binaryUpload.status, 409);
  assert.equal(binaryUpload.body.code, "ATTACHMENT_EXTERNAL_STORAGE_REQUIRED");
  assert.equal(missingMetadataUpload.status, 400);
  assert.equal(missingMetadataUpload.body.code, "ATTACHMENT_EXTERNAL_METADATA_REQUIRED");
  assert.equal(missingChecksumUpload.status, 400);
  assert.equal(missingChecksumUpload.body.code, "ATTACHMENT_EXTERNAL_CHECKSUM_REQUIRED");
  assert.equal(metadataUpload.status, 201);
  assert.equal(metadataUpload.body.storageProvider, "external");
  assert.equal(metadataUpload.body.storageKey, "invoices/2026/external-invoice.txt");
  assert.equal(downloaded.status, 404);
  assert.equal(downloaded.body.code, "ATTACHMENT_CONTENT_NOT_FOUND");
});

test("attachment retention policy blocks deletion before retention expiry", async () => {
  const api = createApi({ attachmentRetentionDays: "7" });
  const upload = await request(
    api,
    "POST",
    "/attachments/upload",
    {
      filename: "retained-invoice.txt",
      contentType: "text/plain",
      byteSize: 16,
      checksum: "sha256:retained",
      uploadedBy: "zhang-san"
    },
    "retained-attachment-upload"
  );
  const deleteAttempt = await request(
    api,
    "DELETE",
    `/attachments/${upload.body.id}`,
    {
      deletedBy: "zhang-san"
    },
    "retained-attachment-delete"
  );

  assert.equal(upload.status, 201);
  assert.equal(upload.body.retentionUntil, "now+7d");
  assert.equal(deleteAttempt.status, 409);
  assert.equal(deleteAttempt.body.code, "ATTACHMENT_RETENTION_DELETE_BLOCKED");
  assert.equal(api.state.attachments.get(upload.body.id).status, "available");
});

test("external attachment metadata upload verifies target object storage before accepting metadata", async () => {
  const missingObjectApi = createApi({
    attachmentStorageProvider: "external",
    externalAttachmentStore: {
      async verifyObject() {
        return { exists: false };
      }
    }
  });
  const missingObject = await request(
    missingObjectApi,
    "POST",
    "/attachments/upload",
    {
      filename: "external-missing.txt",
      contentType: "text/plain",
      byteSize: 21,
      checksum: "sha256:external-object",
      storageProvider: "external",
      storageKey: "invoices/2026/external-missing.txt",
      uploadedBy: "zhang-san"
    },
    "external-storage-missing-object"
  );

  const verifiedObjects = [];
  const verifiedObjectApi = createApi({
    attachmentStorageProvider: "external",
    externalAttachmentStore: {
      async verifyObject(object) {
        verifiedObjects.push(object);
        return {
          exists: true,
          byteSize: 21,
          checksum: "sha256:external-object"
        };
      }
    }
  });
  const verifiedObject = await request(
    verifiedObjectApi,
    "POST",
    "/attachments/upload",
    {
      filename: "external-verified.txt",
      contentType: "text/plain",
      byteSize: 21,
      checksum: "sha256:external-object",
      storageProvider: "external",
      storageKey: "invoices/2026/external-verified.txt",
      uploadedBy: "zhang-san"
    },
    "external-storage-verified-object"
  );

  assert.equal(missingObject.status, 409);
  assert.equal(missingObject.body.code, "ATTACHMENT_EXTERNAL_OBJECT_NOT_FOUND");
  assert.equal(verifiedObject.status, 201);
  assert.deepEqual(verifiedObjects, [
    {
      storageKey: "invoices/2026/external-verified.txt",
      byteSize: 21,
      checksum: "sha256:external-object",
      contentType: "text/plain"
    }
  ]);
});

test("Phase 5 report templates persist UFO sheets, cells, and formula dependencies through publish workflow", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5",
      name: "Phase 5 Reports",
      companyName: "Phase 5 Reports Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-report-template-account-set"
  );

  const created = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "BS-001",
      templateName: "Balance Sheet",
      reportType: "statutory",
      createdBy: "system"
    },
    "phase5-report-template-create"
  );
  const version = await request(
    api,
    "POST",
    `/report-templates/${created.body.id}/versions`,
    {
      versionName: "Initial balance sheet",
      effectiveFromPeriod: "2026-06",
      layoutJson: { columnWidths: { A: 140, B: 120 } },
      sheets: [
        {
          sheetCode: "BS",
          sheetName: "Balance Sheet",
          rowCount: 60,
          columnCount: 8,
          cells: [
            {
              cellAddress: "B10",
              label: "Cash",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "BAL(\"1001\", \"2026-06\", \"debit\")",
                astJson: { name: "BAL", args: ["1001", "2026-06", "debit"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "1001", period: "2026-06" }]
              }
            }
          ]
        }
      ],
      createdBy: "system"
    },
    "phase5-report-template-version-create"
  );
  const published = await request(
    api,
    "POST",
    `/report-template-versions/${version.body.id}/publish`,
    { publishedBy: "system" },
    "phase5-report-template-version-publish"
  );
  const immutableEdit = await request(
    api,
    "POST",
    `/report-templates/${created.body.id}/versions`,
    {
      baseVersionId: published.body.id,
      versionName: "Balance sheet revised",
      effectiveFromPeriod: "2026-07",
      layoutJson: { columnWidths: { A: 160, B: 120 } },
      sheets: [
        {
          sheetCode: "BS",
          sheetName: "Balance Sheet",
          cells: [
            {
              cellAddress: "B10",
              label: "Cash revised",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "CLOSING(\"1001\", \"2026-07\")",
                astJson: { name: "CLOSING", args: ["1001", "2026-07"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "1001", period: "2026-07" }]
              }
            }
          ]
        }
      ],
      createdBy: "system"
    },
    "phase5-report-template-version-revise"
  );
  const templates = await request(api, "GET", `/report-templates?accountSetId=${accountSet.body.id}`, null, null);
  const originalVersion = await request(api, "GET", `/report-template-versions/${published.body.id}`, null, null);
  const revisedVersion = await request(api, "GET", `/report-template-versions/${immutableEdit.body.id}`, null, null);

  assert.equal(accountSet.status, 201);
  assert.equal(created.status, 201);
  assert.equal(created.body.templateCode, "BS-001");
  assert.equal(version.status, 201);
  assert.equal(version.body.versionNo, 1);
  assert.equal(version.body.status, "draft");
  assert.equal(version.body.sheets[0].cells[0].formula.formulaText, "BAL(\"1001\", \"2026-06\", \"debit\")");
  assert.deepEqual(version.body.sheets[0].cells[0].formula.dependenciesJson, [
    { sourceType: "account_balance", accountCode: "1001", period: "2026-06" }
  ]);
  assert.equal(published.status, 200);
  assert.equal(published.body.status, "published");
  assert.equal(immutableEdit.status, 201);
  assert.equal(immutableEdit.body.versionNo, 2);
  assert.notEqual(immutableEdit.body.id, published.body.id);
  assert.equal(templates.status, 200);
  assert.equal(templates.body[0].latestVersionNo, 2);
  assert.equal(templates.body[0].publishedVersionId, published.body.id);
  assert.equal(originalVersion.body.sheets[0].cells[0].label, "Cash");
  assert.equal(revisedVersion.body.sheets[0].cells[0].label, "Cash revised");
});

test("Phase 5 statutory report presets create and publish the four required legal statements", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5S",
      name: "Phase 5 Statutory Presets",
      companyName: "Phase 5 Statutory Presets Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-statutory-preset-account-set"
  );
  api.state.balances.push(
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      accountCode: "1001",
      accountName: "Cash",
      openingDebit: 800,
      openingCredit: 0,
      periodDebit: 300,
      periodCredit: 100,
      closingDebit: 1000,
      closingCredit: 0
    },
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      accountCode: "6001",
      accountName: "Main Business Revenue",
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 1200,
      closingDebit: 0,
      closingCredit: 1200
    }
  );

  const presets = await request(
    api,
    "POST",
    "/report-templates/statutory-presets",
    {
      accountSetId: accountSet.body.id,
      effectiveFromPeriod: "2026-06",
      createdBy: "system"
    },
    "phase5-statutory-presets"
  );
  const duplicate = await request(
    api,
    "POST",
    "/report-templates/statutory-presets",
    {
      accountSetId: accountSet.body.id,
      effectiveFromPeriod: "2026-06",
      createdBy: "system"
    },
    "phase5-statutory-presets-duplicate"
  );
  const templates = await request(api, "GET", `/report-templates?accountSetId=${accountSet.body.id}`, null, null);
  assert.equal(presets.status, 201);
  assert.equal(duplicate.status, 200);
  const balanceSheet = presets.body.templates.find((template) => template.templateCode === "STAT-BS");
  const balanceSheetVersion = await request(api, "GET", `/report-template-versions/${balanceSheet.publishedVersionId}`, null, null);
  const run = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: balanceSheet.publishedVersionId,
      fiscalYear: 2026,
      periodNo: 6,
      includeUnposted: false,
      createdBy: "system"
    },
    "phase5-statutory-balance-sheet-run"
  );

  assert.deepEqual(
    presets.body.templates.map((template) => template.templateCode),
    ["STAT-BS", "STAT-IS", "STAT-CF", "STAT-OE"]
  );
  assert.deepEqual(
    presets.body.templates.map((template) => template.templateName),
    ["资产负债表", "利润表", "现金流量表", "所有者权益变动表"]
  );
  assert.ok(presets.body.templates.every((template) => template.reportType === "statutory" && template.status === "active"));
  assert.ok(presets.body.templates.every((template) => template.publishedVersionId));
  assert.ok(presets.body.templates.every((template) => template.created === true));
  assert.ok(duplicate.body.templates.every((template) => template.created === false));
  assert.equal(templates.body.filter((template) => template.templateCode.startsWith("STAT-")).length, 4);
  assert.equal(balanceSheetVersion.body.status, "published");
  assert.deepEqual(
    balanceSheetVersion.body.sheets[0].cells.map((cell) => [cell.cellAddress, cell.label, cell.formula.formulaText]),
    [
      ["B4", "货币资金", "CLOSING(\"1001\", \"2026-06\")"],
      ["B5", "应收账款", "BAL(\"1122\", \"2026-06\", \"debit\")"],
      ["B8", "资产合计", "CLOSING(\"1001\", \"2026-06\")"],
      ["D4", "短期借款", "BAL(\"2001\", \"2026-06\", \"credit\")"],
      ["D8", "负债和所有者权益合计", "BAL(\"3001\", \"2026-06\", \"credit\")"]
    ]
  );
  assert.equal(run.status, 201);
  assert.equal(run.body.cells.find((cell) => cell.cellAddress === "B4").calculatedValue, 1000);
  assert.ok(run.body.traceLinks.some((link) => link.accountCode === "1001"));
});

test("Phase 5 formal statutory runs force unposted isolation while simulations can opt in", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5U",
      name: "Phase 5 Unposted Isolation",
      companyName: "Phase 5 Unposted Isolation Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-unposted-account-set"
  );
  api.state.vouchers.set("voucher:p5u:draft", {
    id: "voucher:p5u:draft",
    accountSetId: accountSet.body.id,
    voucherNo: "DRAFT-202606-001",
    fiscalYear: 2026,
    periodNo: 6,
    voucherDate: "2026-06-12",
    status: "draft",
    createdBy: "maker",
    lines: [{ summary: "Unposted cash", accountCode: "1001", debit: 500, credit: 0 }]
  });

  const statutoryTemplate = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "UNPOSTED-BS",
      templateName: "Unposted Balance Sheet",
      reportType: "statutory",
      createdBy: "system"
    },
    "phase5-unposted-statutory-template"
  );
  const managementTemplate = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "UNPOSTED-MGMT",
      templateName: "Unposted Management Report",
      reportType: "management",
      createdBy: "system"
    },
    "phase5-unposted-management-template"
  );
  const versionBody = {
    sheets: [
      {
        sheetCode: "BS",
        sheetName: "Balance Sheet",
        cells: [
          {
            cellAddress: "B10",
            label: "Cash",
            valueType: "formula",
            displayFormat: "currency",
            isEditable: false,
            formula: {
              formulaText: "CLOSING(\"1001\", \"2026-06\")",
              astJson: { name: "CLOSING", args: ["1001", "2026-06"] },
              dependenciesJson: [{ sourceType: "account_balance", accountCode: "1001", period: "2026-06" }]
            }
          }
        ]
      }
    ],
    createdBy: "system"
  };
  const statutoryVersion = await request(
    api,
    "POST",
    `/report-templates/${statutoryTemplate.body.id}/versions`,
    versionBody,
    "phase5-unposted-statutory-version"
  );
  const managementVersion = await request(
    api,
    "POST",
    `/report-templates/${managementTemplate.body.id}/versions`,
    versionBody,
    "phase5-unposted-management-version"
  );
  await request(api, "POST", `/report-template-versions/${statutoryVersion.body.id}/publish`, { publishedBy: "system" }, "phase5-unposted-statutory-publish");
  await request(api, "POST", `/report-template-versions/${managementVersion.body.id}/publish`, { publishedBy: "system" }, "phase5-unposted-management-publish");

  const formal = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: statutoryVersion.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      includeUnposted: true,
      runMode: "formal",
      createdBy: "system"
    },
    "phase5-unposted-formal-run"
  );
  const simulation = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: managementVersion.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      includeUnposted: true,
      runMode: "simulation",
      createdBy: "system"
    },
    "phase5-unposted-simulation-run"
  );

  assert.equal(formal.status, 201);
  assert.equal(formal.body.includeUnposted, false);
  assert.equal(formal.body.cells[0].calculatedValue, 0);
  assert.equal(simulation.status, 201);
  assert.equal(simulation.body.includeUnposted, true);
  assert.equal(simulation.body.cells[0].calculatedValue, 500);
  assert.equal(simulation.body.traceLinks[0].amount, 500);
});

test("Phase 5 report runs calculate formula snapshots, lock values, and block closed-period recalculation", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5R",
      name: "Phase 5 Runs",
      companyName: "Phase 5 Runs Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-report-run-account-set"
  );
  api.state.periods.set("period:p5r:2026:6", {
    id: "period:p5r:2026:6",
    accountSetId: accountSet.body.id,
    fiscalYear: 2026,
    periodNo: 6,
    status: "open",
    isCurrent: true
  });
  api.state.balances.push({
    id: "balance:p5r:1001",
    accountSetId: accountSet.body.id,
    fiscalYear: 2026,
    periodNo: 6,
    accountCode: "1001",
    accountName: "Cash",
    openingDebit: 1000,
    openingCredit: 0,
    periodDebit: 300,
    periodCredit: 50,
    closingDebit: 1250,
    closingCredit: 0
  });

  const template = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "RUN-BS",
      templateName: "Run Balance Sheet",
      reportType: "statutory",
      createdBy: "system"
    },
    "phase5-report-run-template"
  );
  const version = await request(
    api,
    "POST",
    `/report-templates/${template.body.id}/versions`,
    {
      sheets: [
        {
          sheetCode: "BS",
          sheetName: "Balance Sheet",
          cells: [
            {
              cellAddress: "B10",
              label: "Cash",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "BAL(\"1001\", \"2026-06\", \"debit\")",
                astJson: { name: "BAL", args: ["1001", "2026-06", "debit"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "1001", period: "2026-06" }]
              }
            }
          ]
        }
      ],
      createdBy: "system"
    },
    "phase5-report-run-version"
  );
  await request(
    api,
    "POST",
    `/report-template-versions/${version.body.id}/publish`,
    { publishedBy: "system" },
    "phase5-report-run-publish-version"
  );

  const run = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: version.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      includeUnposted: false,
      runMode: "formal",
      createdBy: "system"
    },
    "phase5-report-run-create"
  );
  const lock = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/lock`,
    { lockedBy: "system" },
    "phase5-report-run-lock"
  );
  api.state.balances[0] = { ...api.state.balances[0], closingDebit: 9999 };
  const lockedDetail = await request(api, "GET", `/report-runs/${run.body.id}`, null, null);
  const lockedRecalculate = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/recalculate`,
    { recalculatedBy: "system" },
    "phase5-report-run-locked-recalculate"
  );
  api.state.reportRuns.set(run.body.id, { ...api.state.reportRuns.get(run.body.id), status: "calculated", lockedAt: null });
  api.state.periods.set("period:p5r:2026:6", { ...api.state.periods.get("period:p5r:2026:6"), status: "closed" });
  const closedRecalculate = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/recalculate`,
    { recalculatedBy: "system" },
    "phase5-report-run-closed-recalculate"
  );

  assert.equal(run.status, 201);
  assert.equal(run.body.status, "calculated");
  assert.equal(run.body.includeUnposted, false);
  assert.equal(run.body.cells[0].calculatedValue, 1250);
  assert.equal(run.body.cells[0].displayFormat, "currency");
  assert.equal(run.body.cells[0].traceId, run.body.traceLinks[0].traceId);
  assert.equal(run.body.traceLinks[0].sourceType, "account_balance");
  assert.equal(run.body.traceLinks[0].accountCode, "1001");
  assert.match(run.body.snapshotHash, /^sha256:/);
  assert.equal(lock.status, 200);
  assert.equal(lock.body.status, "locked");
  assert.equal(lockedDetail.body.renderMode, "snapshot");
  assert.equal(lockedDetail.body.cells[0].calculatedValue, 1250);
  assert.equal(lockedRecalculate.status, 409);
  assert.equal(lockedRecalculate.body.code, "REPORT_RUN_LOCKED");
  assert.equal(closedRecalculate.status, 409);
  assert.equal(closedRecalculate.body.code, "REPORT_PERIOD_CLOSED");
});

test("Phase 5 report formula engine resolves cross-sheet cell references from snapshots", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5X",
      name: "Phase 5 Cross Sheet",
      companyName: "Phase 5 Cross Sheet Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-cross-sheet-account-set"
  );
  api.state.balances.push(
    {
      id: "balance:p5x:1001",
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      accountCode: "1001",
      accountName: "Cash",
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 120,
      closingCredit: 0
    },
    {
      id: "balance:p5x:6001",
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      accountCode: "6001",
      accountName: "Revenue",
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 80,
      closingDebit: 0,
      closingCredit: 80
    }
  );
  const template = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "XREF-UFO",
      templateName: "Cross Sheet UFO",
      reportType: "ufo",
      createdBy: "system"
    },
    "phase5-cross-sheet-template"
  );
  const version = await request(
    api,
    "POST",
    `/report-templates/${template.body.id}/versions`,
    {
      sheets: [
        {
          sheetCode: "BS",
          sheetName: "Balance Sheet",
          cells: [
            {
              cellAddress: "A1",
              label: "Forward reference",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "IS!B4 + 5",
                astJson: { name: "ADD", args: ["IS!B4", "5"] },
                dependenciesJson: [{ sourceType: "report_cell", sheetCode: "IS", cellAddress: "B4" }]
              }
            },
            {
              cellAddress: "B4",
              label: "Cash",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "CLOSING(\"1001\", \"2026-06\")",
                astJson: { name: "CLOSING", args: ["1001", "2026-06"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "1001", period: "2026-06" }]
              }
            }
          ]
        },
        {
          sheetCode: "IS",
          sheetName: "Income Statement",
          cells: [
            {
              cellAddress: "B4",
              label: "Revenue",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "AMT(\"6001\", \"2026-06\")",
                astJson: { name: "AMT", args: ["6001", "2026-06"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "6001", period: "2026-06" }]
              }
            }
          ]
        },
        {
          sheetCode: "MGMT",
          sheetName: "Management",
          cells: [
            {
              cellAddress: "C6",
              label: "Cash plus revenue",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "BS!B4 + IS!B4",
                astJson: { name: "ADD", args: ["BS!B4", "IS!B4"] },
                dependenciesJson: [
                  { sourceType: "report_cell", sheetCode: "BS", cellAddress: "B4" },
                  { sourceType: "report_cell", sheetCode: "IS", cellAddress: "B4" }
                ]
              }
            }
          ]
        }
      ],
      createdBy: "system"
    },
    "phase5-cross-sheet-version"
  );
  await request(api, "POST", `/report-template-versions/${version.body.id}/publish`, { publishedBy: "system" }, "phase5-cross-sheet-publish");
  const run = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: version.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      includeUnposted: false,
      runMode: "management",
      createdBy: "system"
    },
    "phase5-cross-sheet-run"
  );
  const forwardReferenceCell = run.body.cells.find((cell) => cell.sheetCode === "BS" && cell.cellAddress === "A1");
  const cashCell = run.body.cells.find((cell) => cell.sheetCode === "BS" && cell.cellAddress === "B4");
  const revenueCell = run.body.cells.find((cell) => cell.sheetCode === "IS" && cell.cellAddress === "B4");
  const managementCell = run.body.cells.find((cell) => cell.sheetCode === "MGMT" && cell.cellAddress === "C6");

  assert.equal(run.status, 201);
  assert.equal(forwardReferenceCell.calculatedValue, -75);
  assert.equal(cashCell.calculatedValue, 120);
  assert.equal(revenueCell.calculatedValue, -80);
  assert.equal(managementCell.calculatedValue, 40);
  assert.equal(managementCell.formulaText, "BS!B4 + IS!B4");
  assert.equal(run.body.traceLinks.filter((link) => link.traceId === managementCell.traceId).length, 2);
  assert.ok(run.body.traceLinks.some((link) => link.traceId === managementCell.traceId && link.sourceType === "report_cell" && link.sourceCell === "BS!B4"));
  assert.ok(run.body.traceLinks.some((link) => link.traceId === managementCell.traceId && link.sourceType === "report_cell" && link.sourceCell === "IS!B4"));
});

test("Phase 5 report cell drilldown exposes formula, snapshot source links, ledger entries, and vouchers", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5D",
      name: "Phase 5 Drilldown",
      companyName: "Phase 5 Drilldown Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-drilldown-account-set"
  );
  api.state.balances.push({
    id: "balance:p5d:1001",
    accountSetId: accountSet.body.id,
    fiscalYear: 2026,
    periodNo: 6,
    accountCode: "1001",
    accountName: "Cash",
    openingDebit: 100,
    openingCredit: 0,
    periodDebit: 50,
    periodCredit: 30,
    closingDebit: 120,
    closingCredit: 0
  });
  api.state.vouchers.set("voucher:p5d:cash", {
    id: "voucher:p5d:cash",
    accountSetId: accountSet.body.id,
    voucherNo: "记-202606-001",
    voucherDate: "2026-06-18",
    status: "posted",
    createdBy: "system",
    lines: []
  });
  api.state.journalEntries.push({
    id: "journal-entry:p5d:cash",
    accountSetId: accountSet.body.id,
    fiscalYear: 2026,
    periodNo: 6,
    accountCode: "1001",
    accountName: "Cash",
    debit: 50,
    credit: 0,
    voucherId: "voucher:p5d:cash",
    voucherNo: "记-202606-001"
  });
  const template = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "DRILL-BS",
      templateName: "Drilldown Balance Sheet",
      reportType: "statutory",
      createdBy: "system"
    },
    "phase5-drilldown-template"
  );
  const version = await request(
    api,
    "POST",
    `/report-templates/${template.body.id}/versions`,
    {
      sheets: [
        {
          sheetCode: "BS",
          sheetName: "Balance Sheet",
          cells: [
            {
              cellAddress: "B10",
              label: "Cash",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "CLOSING(\"1001\", \"2026-06\")",
                astJson: { name: "CLOSING", args: ["1001", "2026-06"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "1001", period: "2026-06" }]
              }
            }
          ]
        }
      ],
      createdBy: "system"
    },
    "phase5-drilldown-version"
  );
  await request(api, "POST", `/report-template-versions/${version.body.id}/publish`, { publishedBy: "system" }, "phase5-drilldown-publish");
  const run = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: version.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      includeUnposted: false,
      createdBy: "system"
    },
    "phase5-drilldown-run"
  );
  await request(api, "POST", `/report-runs/${run.body.id}/lock`, { lockedBy: "system" }, "phase5-drilldown-lock");
  api.state.balances[0] = { ...api.state.balances[0], closingDebit: 9999 };

  const drilldown = await request(api, "GET", `/report-runs/${run.body.id}/cells/B10/drilldown`, null, null);

  assert.equal(drilldown.status, 200);
  assert.equal(drilldown.body.renderMode, "snapshot");
  assert.equal(drilldown.body.cell.sheetCode, "BS");
  assert.equal(drilldown.body.cell.cellAddress, "B10");
  assert.equal(drilldown.body.cell.formulaText, "CLOSING(\"1001\", \"2026-06\")");
  assert.equal(drilldown.body.cell.calculatedValue, 120);
  assert.equal(drilldown.body.traceLinks[0].accountCode, "1001");
  assert.equal(drilldown.body.traceLinks[0].amount, 120);
  assert.deepEqual(drilldown.body.sourceBalances.map((row) => [row.accountCode, row.snapshotAmount]), [["1001", 120]]);
  assert.deepEqual(drilldown.body.ledgerEntries.map((entry) => [entry.accountCode, entry.debit, entry.voucherId]), [["1001", 50, "voucher:p5d:cash"]]);
  assert.deepEqual(drilldown.body.vouchers.map((voucher) => [voucher.id, voucher.voucherNo, voucher.status]), [["voucher:p5d:cash", "记-202606-001", "posted"]]);
});

test("Phase 5 cash-flow reports block review and lock when cash or bank entries are unassigned", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5CF",
      name: "Phase 5 Cash Flow",
      companyName: "Phase 5 Cash Flow Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-cash-flow-account-set"
  );
  const periods = await request(
    api,
    "POST",
    `/account-sets/${accountSet.body.id}/periods/generate`,
    {},
    "phase5-cash-flow-periods"
  );
  await request(
    api,
    "POST",
    "/accounts",
    { accountSetId: accountSet.body.id, code: "1002", name: "Bank Deposits", accountType: "asset", normalBalance: "debit", isBank: true },
    "phase5-cash-flow-bank"
  );
  await request(
    api,
    "POST",
    "/accounts",
    { accountSetId: accountSet.body.id, code: "6602", name: "Office Expense", accountType: "expense", normalBalance: "debit" },
    "phase5-cash-flow-expense"
  );
  const voucher = await request(
    api,
    "POST",
    "/vouchers",
    {
      accountSetId: accountSet.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-18",
      createdBy: "maker",
      lines: [
        { summary: "Expense paid by bank", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Bank payment without cash-flow item", accountCode: "1002", debit: 0, credit: 500 }
      ]
    },
    "phase5-cash-flow-voucher"
  );
  await request(api, "POST", `/vouchers/${voucher.body.id}/submit`, { submittedBy: "maker" }, "phase5-cash-flow-submit-voucher");
  await request(api, "POST", `/vouchers/${voucher.body.id}/approve`, { approvedBy: "reviewer" }, "phase5-cash-flow-approve-voucher");
  await request(api, "POST", `/vouchers/${voucher.body.id}/post`, { postedBy: "poster" }, "phase5-cash-flow-post-voucher");

  const template = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "CF-01",
      templateName: "Cash Flow Statement",
      reportType: "cash_flow",
      createdBy: "system"
    },
    "phase5-cash-flow-template"
  );
  const version = await request(
    api,
    "POST",
    `/report-templates/${template.body.id}/versions`,
    {
      sheets: [
        {
          sheetCode: "CF",
          sheetName: "Cash Flow",
          cells: [
            {
              cellAddress: "B12",
              label: "Cash movement",
              valueType: "formula",
              formula: {
                formulaText: "AMT(\"1002\", \"2026-01\")",
                astJson: { name: "AMT", args: ["1002", "2026-01"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "1002", period: "2026-01" }]
              }
            }
          ]
        }
      ],
      createdBy: "system"
    },
    "phase5-cash-flow-version"
  );
  await request(
    api,
    "POST",
    `/report-template-versions/${version.body.id}/publish`,
    { publishedBy: "system" },
    "phase5-cash-flow-publish"
  );
  const run = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: version.body.id,
      fiscalYear: 2026,
      periodNo: 1,
      runMode: "formal",
      createdBy: "system"
    },
    "phase5-cash-flow-run"
  );

  const blockedReview = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/submit-review`,
    { submittedBy: "system", reviewComment: "Submit cash-flow report" },
    "phase5-cash-flow-submit-review-blocked"
  );
  const blockedLock = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/lock`,
    { lockedBy: "system" },
    "phase5-cash-flow-lock-blocked"
  );

  const bankEntry = api.state.journalEntries.find((entry) => entry.accountCode === "1002");
  bankEntry.auxiliarySnapshot = { cashFlowItemId: "CF-OPERATING-PAYMENT" };

  const approval = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/submit-review`,
    { submittedBy: "system", reviewComment: "Cash-flow item assigned" },
    "phase5-cash-flow-submit-review"
  );
  const approved = await request(
    api,
    "POST",
    `/report-approvals/${approval.body.id}/approve`,
    { approvedBy: "finance-manager", reviewComment: "Approved and locked" },
    "phase5-cash-flow-approve-report"
  );
  const approvalList = await request(api, "GET", `/report-approvals?accountSetId=${accountSet.body.id}`, null, null);

  assert.equal(periods.status, 201);
  assert.equal(run.status, 201);
  assert.equal(blockedReview.status, 409);
  assert.equal(blockedReview.body.code, "REPORT_CASH_FLOW_UNASSIGNED");
  assert.equal(blockedReview.body.exceptions[0].exceptionCode, "REPORT_CASH_FLOW_UNASSIGNED");
  assert.match(blockedReview.body.exceptions[0].highlight, /未分配异常现金流/);
  assert.equal(blockedLock.status, 409);
  assert.equal(blockedLock.body.code, "REPORT_CASH_FLOW_UNASSIGNED");
  assert.equal(approval.status, 201);
  assert.equal(approval.body.status, "pending");
  assert.equal(approval.body.exceptionCount, 0);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, "approved");
  assert.equal(approved.body.reportRun.status, "locked");
  assert.equal(approvalList.body.length, 1);
});

test("Phase 5 report exports and AI interpretations are tied to snapshot evidence", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5E",
      name: "Phase 5 Exports",
      companyName: "Phase 5 Exports Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-report-export-account-set"
  );
  api.state.periods.set("period:p5e:2026:6", {
    id: "period:p5e:2026:6",
    accountSetId: accountSet.body.id,
    fiscalYear: 2026,
    periodNo: 6,
    status: "open",
    isCurrent: true
  });
  api.state.balances.push({
    accountSetId: accountSet.body.id,
    fiscalYear: 2026,
    periodNo: 6,
    accountCode: "1001",
    accountName: "Cash",
    openingDebit: 100,
    openingCredit: 0,
    periodDebit: 20,
    periodCredit: 0,
    closingDebit: 120,
    closingCredit: 0
  });
  const template = await request(
    api,
    "POST",
    "/report-templates",
    {
      accountSetId: accountSet.body.id,
      templateCode: "EXPORT-BS",
      templateName: "Export Balance Sheet",
      reportType: "statutory",
      createdBy: "system"
    },
    "phase5-export-template"
  );
  const version = await request(
    api,
    "POST",
    `/report-templates/${template.body.id}/versions`,
    {
      sheets: [
        {
          sheetCode: "BS",
          sheetName: "Balance Sheet",
          cells: [
            {
              cellAddress: "B10",
              label: "Cash",
              valueType: "formula",
              displayFormat: "currency",
              isEditable: false,
              formula: {
                formulaText: "CLOSING(\"1001\", \"2026-06\")",
                astJson: { name: "CLOSING", args: ["1001", "2026-06"] },
                dependenciesJson: [{ sourceType: "account_balance", accountCode: "1001", period: "2026-06" }]
              }
            }
          ]
        }
      ],
      createdBy: "system"
    },
    "phase5-export-version"
  );
  await request(
    api,
    "POST",
    `/report-template-versions/${version.body.id}/publish`,
    { publishedBy: "system" },
    "phase5-export-publish"
  );
  const run = await request(
    api,
    "POST",
    "/report-runs",
    {
      accountSetId: accountSet.body.id,
      templateVersionId: version.body.id,
      fiscalYear: 2026,
      periodNo: 6,
      includeUnposted: false,
      createdBy: "system"
    },
    "phase5-export-run"
  );
  api.state.balances[0] = { ...api.state.balances[0], closingDebit: 9999 };
  const exportFile = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/exports`,
    { fileType: "excel", exportedBy: "system" },
    "phase5-export-file"
  );
  const invalidInterpretation = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/interpretations`,
    {
      summary: "Invalid evidence.",
      keyFindings: ["This should not be accepted."],
      warnings: [],
      evidenceRefs: ["report_cell:BS!Z99"],
      interpretedBy: "system"
    },
    "phase5-ai-invalid-interpretation"
  );
  const interpretation = await request(
    api,
    "POST",
    `/report-runs/${run.body.id}/interpretations`,
    {
      summary: "Cash increased.",
      keyFindings: ["Cash closing balance is 120."],
      warnings: [],
      evidenceRefs: ["report_cell:BS!B10"],
      interpretedBy: "system"
    },
    "phase5-ai-interpretation"
  );
  const exportList = await request(api, "GET", `/report-exports?accountSetId=${accountSet.body.id}`, null, null);
  const interpretations = await request(api, "GET", `/ai-report-interpretations?reportRunId=${run.body.id}`, null, null);

  assert.equal(exportFile.status, 201);
  assert.equal(exportFile.body.fileType, "excel");
  assert.equal(exportFile.body.snapshotHash, run.body.snapshotHash);
  assert.match(exportFile.body.downloadUrl, /^local:\/\/report-exports\//);
  assert.match(exportFile.body.sensitiveFieldNotice, /snapshot/);
  assert.match(exportFile.body.contentText, /BS!B10/);
  assert.match(exportFile.body.contentText, /Cash/);
  assert.match(exportFile.body.contentText, /120/);
  assert.doesNotMatch(exportFile.body.contentText, /9999/);
  assert.equal(invalidInterpretation.status, 400);
  assert.match(invalidInterpretation.body.message, /evidenceRefs must point to cells in the report run/);
  assert.equal(interpretation.status, 201);
  assert.deepEqual(interpretation.body.keyFindings, ["Cash closing balance is 120."]);
  assert.deepEqual(interpretation.body.evidenceRefs, ["report_cell:BS!B10"]);
  assert.equal(interpretation.body.reportRunId, run.body.id);
  assert.equal(exportList.body.length, 1);
  assert.equal(interpretations.body.length, 1);
});

test("Phase 5 report lists only expose account-set scoped rows", async () => {
  const api = createApi();
  const actorId = "phase5-report-viewer";
  api.state.permissionsByActor.set(actorId, new Set(["report.view"]));
  api.state.accountSetAccessByActor.set(actorId, new Set(["account-set:visible"]));
  api.state.reportRuns.set("report-run:visible", {
    id: "report-run:visible",
    accountSetId: "account-set:visible",
    templateVersionId: "version:visible",
    fiscalYear: 2026,
    periodNo: 6,
    includeUnposted: false,
    runMode: "formal",
    status: "calculated",
    snapshotHash: "sha256:visible",
    createdBy: "system",
    createdAt: "now",
    recalculatedAt: null,
    lockedBy: null,
    lockedAt: null,
    cells: [],
    traceLinks: []
  });
  api.state.reportRuns.set("report-run:hidden", {
    id: "report-run:hidden",
    accountSetId: "account-set:hidden",
    templateVersionId: "version:hidden",
    fiscalYear: 2026,
    periodNo: 6,
    includeUnposted: false,
    runMode: "formal",
    status: "calculated",
    snapshotHash: "sha256:hidden",
    createdBy: "system",
    createdAt: "now",
    recalculatedAt: null,
    lockedBy: null,
    lockedAt: null,
    cells: [],
    traceLinks: []
  });
  api.state.reportExports.set("report-export:visible", {
    id: "report-export:visible",
    accountSetId: "account-set:visible",
    reportRunId: "report-run:visible",
    fileType: "excel",
    snapshotHash: "sha256:visible",
    downloadUrl: "local://report-exports/report-export:visible.xlsx",
    contentText: "",
    exportedBy: "system",
    createdAt: "now"
  });
  api.state.reportExports.set("report-export:hidden", {
    id: "report-export:hidden",
    accountSetId: "account-set:hidden",
    reportRunId: "report-run:hidden",
    fileType: "excel",
    snapshotHash: "sha256:hidden",
    downloadUrl: "local://report-exports/report-export:hidden.xlsx",
    contentText: "",
    exportedBy: "system",
    createdAt: "now"
  });
  api.state.aiReportInterpretations.set("ai-report-interpretation:visible", {
    id: "ai-report-interpretation:visible",
    accountSetId: "account-set:visible",
    reportRunId: "report-run:visible",
    summary: "Visible summary",
    keyFindings: [],
    warnings: [],
    evidenceRefs: ["report_cell:BS!B10"],
    interpretedBy: "system"
  });
  api.state.aiReportInterpretations.set("ai-report-interpretation:hidden", {
    id: "ai-report-interpretation:hidden",
    accountSetId: "account-set:hidden",
    reportRunId: "report-run:hidden",
    summary: "Hidden summary",
    keyFindings: [],
    warnings: [],
    evidenceRefs: ["report_cell:BS!B10"],
    interpretedBy: "system"
  });

  const runs = await api.handle({ method: "GET", path: "/report-runs", headers: { "Actor-Id": actorId } });
  const exports = await api.handle({ method: "GET", path: "/report-exports", headers: { "Actor-Id": actorId } });
  const interpretations = await api.handle({ method: "GET", path: "/ai-report-interpretations", headers: { "Actor-Id": actorId } });

  assert.deepEqual(runs.body.map((row) => row.id), ["report-run:visible"]);
  assert.deepEqual(exports.body.map((row) => row.id), ["report-export:visible"]);
  assert.deepEqual(interpretations.body.map((row) => row.id), ["ai-report-interpretation:visible"]);
});

test("Phase 5 management analysis aggregates cross-module metrics with drilldowns", async () => {
  const api = createApi();
  const accountSet = await request(
    api,
    "POST",
    "/account-sets",
    {
      code: "P5MA",
      name: "Phase 5 Management Analysis",
      companyName: "Phase 5 Management Analysis Co.",
      baseCurrency: "CNY",
      accountingStandard: "Small Business Accounting Standards",
      startYear: 2026,
      startPeriod: 1
    },
    "phase5-management-analysis-account-set"
  );
  const accountSetId = accountSet.body.id;
  api.state.purchaseOrders.set("purchase-order:p5ma", {
    id: "purchase-order:p5ma",
    accountSetId,
    orderNo: "PO-202606-001",
    orderDate: "2026-06-03",
    totalAmount: 1200,
    status: "approved",
    supplierId: "supplier:p5ma",
    supplierName: "North Supplier",
    lines: []
  });
  api.state.salesInvoices.set("sales-invoice:p5ma", {
    id: "sales-invoice:p5ma",
    accountSetId,
    invoiceNo: "SI-202606-001",
    invoiceDate: "2026-06-10",
    customerId: "customer:p5ma",
    customerName: "Retail Customer",
    totalAmount: 3000,
    receivableAmount: 3000,
    lines: []
  });
  api.state.inventoryMovements.set("inventory-movement:p5ma-cogs", {
    id: "inventory-movement:p5ma-cogs",
    accountSetId,
    documentNo: "INV-COGS-001",
    movementType: "outbound",
    businessType: "sales_delivery",
    fiscalYear: 2026,
    periodNo: 6,
    totalAmount: 700,
    lines: [{ itemCode: "FG-A", itemName: "Finished Goods A", quantity: 10, amount: 700 }]
  });
  api.state.inventoryBalances.set("inventory-balance:p5ma", {
    id: "inventory-balance:p5ma",
    accountSetId,
    itemId: "inventory-item:p5ma",
    itemCode: "FG-A",
    itemName: "Finished Goods A",
    warehouseId: "warehouse:p5ma",
    warehouseCode: "MAIN",
    quantity: 25,
    amount: 2500,
    updatedAt: "2026-02-01"
  });
  api.state.counterpartyLedgerEntries.set("counterparty-ledger:ar:p5ma", {
    id: "counterparty-ledger:ar:p5ma",
    accountSetId,
    direction: "ar",
    partnerId: "customer:p5ma",
    partnerName: "Retail Customer",
    sourceType: "sales_invoice",
    sourceId: "sales-invoice:p5ma",
    sourceNo: "SI-202606-001",
    documentDate: "2026-06-10",
    dueDate: "2026-05-15",
    originalAmount: 3000,
    settledAmount: 2200,
    remainingAmount: 800,
    status: "open"
  });
  api.state.counterpartyLedgerEntries.set("counterparty-ledger:ap:p5ma", {
    id: "counterparty-ledger:ap:p5ma",
    accountSetId,
    direction: "ap",
    partnerId: "supplier:p5ma",
    partnerName: "North Supplier",
    sourceType: "purchase_invoice",
    sourceId: "purchase-invoice:p5ma",
    sourceNo: "PI-202606-001",
    documentDate: "2026-06-08",
    dueDate: "2026-06-30",
    originalAmount: 500,
    settledAmount: 0,
    remainingAmount: 500,
    status: "open"
  });
  api.state.journalEntries.push(
    {
      id: "journal-entry:p5ma-cash-in",
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      accountCode: "1002",
      accountName: "Bank Deposits",
      debit: 1000,
      credit: 0,
      voucherId: "voucher:p5ma-cash-in"
    },
    {
      id: "journal-entry:p5ma-cash-out",
      accountSetId,
      fiscalYear: 2026,
      periodNo: 6,
      accountCode: "1002",
      accountName: "Bank Deposits",
      debit: 0,
      credit: 200,
      voucherId: "voucher:p5ma-cash-out"
    }
  );
  api.state.payrollCostPools.set("payroll-cost-pool:p5ma", {
    id: "payroll-cost-pool:p5ma",
    accountSetId,
    fiscalYear: 2026,
    periodNo: 6,
    departmentId: "D-SALES",
    costType: "direct_labor",
    amount: 900,
    lockedAt: "now"
  });
  api.state.assetDepreciationCostPools.set("asset-depreciation-cost-pool:p5ma", {
    id: "asset-depreciation-cost-pool:p5ma",
    accountSetId,
    fiscalYear: 2026,
    periodNo: 6,
    departmentId: "D-SALES",
    costType: "fixed_asset_depreciation",
    amount: 300,
    lockedAt: "now"
  });

  const analysis = await request(
    api,
    "GET",
    `/management-analysis?accountSetId=${accountSetId}&fiscalYear=2026&periodNo=6&asOfDate=2026-06-30`,
    null,
    null
  );

  assert.equal(analysis.status, 200);
  assert.equal(analysis.body.accountSetId, accountSetId);
  assert.deepEqual(
    analysis.body.metrics.map((metric) => metric.key),
    [
      "purchaseTrend",
      "salesGrossMargin",
      "inventoryTurnover",
      "counterpartyAging",
      "cashFlow",
      "laborCost",
      "depreciationCost",
      "operatingOverview"
    ]
  );
  assert.equal(analysis.body.metrics.find((metric) => metric.key === "purchaseTrend").amount, 1200);
  assert.equal(analysis.body.metrics.find((metric) => metric.key === "salesGrossMargin").amount, 2300);
  assert.equal(analysis.body.metrics.find((metric) => metric.key === "cashFlow").amount, 800);
  assert.equal(analysis.body.metrics.find((metric) => metric.key === "laborCost").amount, 900);
  assert.equal(analysis.body.metrics.find((metric) => metric.key === "depreciationCost").amount, 300);
  assert.ok(analysis.body.metrics.every((metric) => metric.drilldown?.path && metric.drilldown.sourceType));
  assert.ok(analysis.body.warnings.some((warning) => warning.code === "OVERDUE_AR" && warning.evidenceRefs.includes("counterparty-ledger:ar:p5ma")));
  assert.ok(analysis.body.warnings.some((warning) => warning.code === "INVENTORY_STAGNATION" && warning.drilldown.path.includes("/inventory-ledger")));
  assert.ok(analysis.body.drilldowns.salesGrossMargin.rows.some((row) => row.sourceNo === "SI-202606-001"));
  assert.ok(analysis.body.drilldowns.cashFlow.rows.some((row) => row.sourceId === "voucher:p5ma-cash-in"));
});
