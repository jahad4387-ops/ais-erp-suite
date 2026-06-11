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
