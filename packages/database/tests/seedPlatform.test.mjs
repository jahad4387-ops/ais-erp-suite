import { test } from "node:test";
import assert from "node:assert/strict";

const { default: seedModule } = await import("../scripts/seed-platform.js");
const { default: passwordHashModule } = await import("../scripts/password-hash.js");
const { permissions, roleTemplates, seedPhase1Platform } = seedModule;
const { createPasswordHash, verifyPasswordHash } = passwordHashModule;

function createFakePrisma() {
  const state = {
    permissions: new Map(),
    roles: new Map(),
    rolePermissions: new Map(),
    users: new Map(),
    userRoles: new Map()
  };

  let nextId = 1;
  const makeId = (prefix) => `${prefix}-${nextId++}`;

  return {
    state,
    permission: {
      async upsert({ where, update, create }) {
        const existing = state.permissions.get(where.code);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const record = { id: makeId("permission"), ...create };
        state.permissions.set(where.code, record);
        return record;
      }
    },
    role: {
      async upsert({ where, update, create }) {
        const existing = state.roles.get(where.name);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const record = { id: makeId("role"), ...create };
        state.roles.set(where.name, record);
        return record;
      }
    },
    rolePermission: {
      async upsert({ where, create }) {
        const key = `${where.roleId_permissionId.roleId}:${where.roleId_permissionId.permissionId}`;
        const existing = state.rolePermissions.get(key);
        if (existing) {
          return existing;
        }
        const record = { ...create };
        state.rolePermissions.set(key, record);
        return record;
      }
    },
    user: {
      async upsert({ where, update, create }) {
        const existing = state.users.get(where.username);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const record = { id: makeId("user"), ...create };
        state.users.set(where.username, record);
        return record;
      }
    },
    userRole: {
      async upsert({ where, create }) {
        const key = `${where.userId_roleId.userId}:${where.userId_roleId.roleId}`;
        const existing = state.userRoles.get(key);
        if (existing) {
          return existing;
        }
        const record = { ...create };
        state.userRoles.set(key, record);
        return record;
      }
    }
  };
}

test("Phase 1 platform seed is idempotent and creates an initial administrator from password hash", async () => {
  const prisma = createFakePrisma();
  const admin = {
    username: "admin",
    name: "系统管理员",
    passwordHash: "sha256:test-salt:test-digest"
  };

  await seedPhase1Platform(prisma, { admin });
  await seedPhase1Platform(prisma, { admin });

  assert.equal(prisma.state.permissions.size, permissions.length);
  assert.equal(prisma.state.roles.size, Object.keys(roleTemplates).length);
  assert.equal(prisma.state.users.size, 1);
  for (const code of ["partner.manage", "inventory_item.manage", "cost_allocation.manage", "payroll_setup.manage", "fixed_asset_setup.manage"]) {
    assert.ok(permissions.includes(code), `seed permissions should include ${code}`);
    assert.ok(prisma.state.permissions.has(code), `seed should persist ${code}`);
  }

  const systemAdmin = prisma.state.roles.get("系统管理员");
  assert.ok(systemAdmin, "系统管理员角色必须被稳定写入，不能出现乱码。");
  assert.deepEqual(roleTemplates["系统管理员"], permissions);

  const adminUser = prisma.state.users.get("admin");
  assert.equal(adminUser.passwordHash, admin.passwordHash);
  assert.ok(!("password" in adminUser), "种子用户不能包含明文密码。");

  const adminRoleKey = `${adminUser.id}:${systemAdmin.id}`;
  assert.ok(prisma.state.userRoles.has(adminRoleKey), "初始管理员必须获得系统管理员角色。");
});

test("Phase 1 platform seed rejects an admin username without a password hash", async () => {
  const prisma = createFakePrisma();

  await assert.rejects(
    () =>
      seedPhase1Platform(prisma, {
        admin: { username: "admin", name: "系统管理员" }
      }),
    /passwordHash/
  );
});

test("administrator password hash utility generates and verifies seed-compatible hashes", () => {
  const passwordHash = createPasswordHash("rotate-admin-password", { salt: "phase-1-salt" });

  assert.match(passwordHash, /^sha256:phase-1-salt:/);
  assert.equal(verifyPasswordHash("rotate-admin-password", passwordHash), true);
  assert.equal(verifyPasswordHash("wrong-password", passwordHash), false);
});
