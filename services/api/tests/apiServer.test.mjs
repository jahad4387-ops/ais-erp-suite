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
