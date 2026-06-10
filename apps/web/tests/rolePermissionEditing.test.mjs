import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const userAccessPath = fileURLToPath(new URL("../src/pages/UserAccess.tsx", import.meta.url));

test("role permission page supports editing existing role permissions", () => {
  const source = readFileSync(userAccessPath, "utf8");

  assert.match(source, /data-testid="role-edit"/);
  assert.match(source, /handleEditRole/);
  assert.match(source, /editingRole/);
  assert.match(source, /api\.patch\(`\/roles\/\$\{editingRole\.id\}`/);
  assert.match(source, /角色已更新/);
  assert.match(source, /编辑角色/);
  assert.match(source, /openRoleCreate/);
});

test("user management page supports deleting users", () => {
  const source = readFileSync(userAccessPath, "utf8");

  assert.match(source, /data-testid="user-delete"/);
  assert.match(source, /handleDeleteUser/);
  assert.match(source, /api\.delete\(`\/users\/\$\{record\.id\}`/);
  assert.match(source, /用户已删除/);
  assert.match(source, /Popconfirm/);
  assert.match(source, /record\.id === 'system' \|\| record\.id === currentUser/);
});
