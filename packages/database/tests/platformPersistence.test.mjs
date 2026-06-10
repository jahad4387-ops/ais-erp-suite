import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlatformPersistence } from "../src/platformPersistence.mjs";

function createFakePrisma() {
  const permissions = new Map([
    ["account.create", { id: "permission:account.create", code: "account.create", description: "account.create" }],
    ["voucher.create", { id: "permission:voucher.create", code: "voucher.create", description: "voucher.create" }],
    ["voucher.view", { id: "permission:voucher.view", code: "voucher.view", description: "voucher.view" }]
  ]);
  const roles = new Map();
  const users = new Map();
  const accountSets = new Map();
  const accountSetUsers = new Map();
  const periods = new Map();
  const chartOfAccounts = new Map();
  const auxiliaryTypes = new Map();
  const auxiliaryItems = new Map();
  const accountAuxiliaryRequirements = new Map();
  const openingBalances = new Map();
  const vouchers = new Map();
  const voucherLines = new Map();
  const voucherStatusLogs = [];
  const postingBatches = new Map();
  const journalEntries = new Map();
  const accountPeriodBalances = new Map();
  const bankStatements = new Map();
  const bankReconciliations = new Map();
  let roleNo = 0;
  let userNo = 0;

  return {
    permission: {
      findMany: async () => [...permissions.values()]
    },
    role: {
      create: async ({ data, include }) => {
        const role = {
          id: `role:${++roleNo}`,
          name: data.name,
          description: data.description ?? null,
          rolePermissions: data.rolePermissions.create.map((item) => ({
            permission: permissions.get(item.permission.connect.code)
          }))
        };
        roles.set(role.id, role);
        return include?.rolePermissions ? role : { id: role.id, name: role.name, description: role.description };
      },
      findMany: async ({ include } = {}) =>
        [...roles.values()].map((role) =>
          include?.rolePermissions ? role : { id: role.id, name: role.name, description: role.description }
        ),
      update: async ({ where, data, include }) => {
        const role = roles.get(where.id);
        const nextRole = {
          ...role,
          name: data.name ?? role.name,
          description: data.description ?? role.description,
          rolePermissions: data.rolePermissions.create.map((item) => ({
            permission: permissions.get(item.permission.connect.code)
          }))
        };
        roles.set(where.id, nextRole);
        return include?.rolePermissions
          ? nextRole
          : { id: nextRole.id, name: nextRole.name, description: nextRole.description };
      }
    },
    user: {
      create: async ({ data, include }) => {
        const role = roles.get(data.userRoles.create.role.connect.id);
        const user = {
          id: `user:${++userNo}`,
          username: data.username,
          passwordHash: data.passwordHash,
          name: data.name,
          status: data.status,
          userRoles: [{ role }]
        };
        users.set(user.username, user);
        return include?.userRoles ? user : { id: user.id, username: user.username, name: user.name, status: user.status };
      },
      findUnique: async ({ where, include }) => {
        const user = where.username
          ? users.get(where.username)
          : [...users.values()].find((item) => item.id === where.id);
        if (!user) return null;
        return include?.userRoles ? user : { id: user.id, username: user.username, name: user.name, status: user.status };
      },
      findMany: async ({ include } = {}) =>
        [...users.values()].map((user) =>
          include?.userRoles ? user : { id: user.id, username: user.username, name: user.name, status: user.status }
        ),
      delete: async ({ where }) => {
        const user = [...users.values()].find((item) => item.id === where.id);
        if (!user) return null;
        users.delete(user.username);
        return user;
      }
    },
    userRole: {
      deleteMany: async ({ where }) => {
        for (const user of users.values()) {
          if (user.id === where.userId) {
            user.userRoles = [];
          }
        }
      }
    },
    accountSet: {
      create: async ({ data }) => {
        const accountSet = {
          id: data.id,
          code: data.code,
          name: data.name,
          companyName: data.companyName,
          baseCurrency: data.baseCurrency,
          accountingStandard: data.accountingStandard,
          startYear: data.startYear,
          startPeriod: data.startPeriod,
          status: data.status,
          createdBy: data.createdBy
        };
        accountSets.set(accountSet.id, accountSet);
        return accountSet;
      },
      findMany: async ({ where } = {}) => {
        const rows = [...accountSets.values()];
        if (!where?.users?.some?.userId) {
          return rows;
        }
        const accessibleIds = [...accountSetUsers.values()]
          .filter((grant) => grant.userId === where.users.some.userId)
          .map((grant) => grant.accountSetId);
        return rows.filter((accountSet) => accessibleIds.includes(accountSet.id));
      },
      findFirst: async ({ where }) =>
        [...accountSets.values()].find(
          (accountSet) => where.OR.some((condition) => accountSet.id === condition.id || accountSet.code === condition.code)
        ) ?? null,
      update: async ({ where, data }) => {
        const accountSet = { ...accountSets.get(where.id), ...data };
        accountSets.set(accountSet.id, accountSet);
        return accountSet;
      }
    },
    accountSetUser: {
      upsert: async ({ where, create }) => {
        const key = `${where.accountSetId_userId.accountSetId}:${where.accountSetId_userId.userId}`;
        const grant = accountSetUsers.get(key) ?? create;
        accountSetUsers.set(key, grant);
        return grant;
      },
      findMany: async ({ where }) =>
        [...accountSetUsers.values()].filter((grant) => grant.accountSetId === where.accountSetId),
      findUnique: async ({ where }) => {
        const key = `${where.accountSetId_userId.accountSetId}:${where.accountSetId_userId.userId}`;
        return accountSetUsers.get(key) ?? null;
      },
      deleteMany: async ({ where }) => {
        for (const [key, grant] of accountSetUsers.entries()) {
          if (grant.userId === where.userId) {
            accountSetUsers.delete(key);
          }
        }
      }
    },
    accountingPeriod: {
      upsert: async ({ where, create, update }) => {
        const key = where.id;
        const period = periods.get(key) ? { ...periods.get(key), ...update } : create;
        periods.set(key, period);
        return period;
      },
      findMany: async ({ where } = {}) => {
        const rows = [...periods.values()];
        return where?.accountSetId ? rows.filter((period) => period.accountSetId === where.accountSetId) : rows;
      },
      findUnique: async ({ where }) => periods.get(where.id) ?? null,
      update: async ({ where, data }) => {
        const period = { ...periods.get(where.id), ...data };
        periods.set(where.id, period);
        return period;
      }
    },
    chartOfAccount: {
      create: async ({ data, include }) => {
        const account = { ...data };
        chartOfAccounts.set(account.id, account);
        if (!include?.auxiliaryRequirements) return account;
        return {
          ...account,
          auxiliaryRequirements: [...accountAuxiliaryRequirements.values()]
            .filter((requirement) => requirement.accountId === account.id)
            .map((requirement) => ({ ...requirement, auxiliaryType: auxiliaryTypes.get(requirement.auxiliaryTypeId) }))
        };
      },
      update: async ({ where, data, include }) => {
        const account = { ...chartOfAccounts.get(where.id), ...data };
        chartOfAccounts.set(account.id, account);
        if (!include?.auxiliaryRequirements) return account;
        return {
          ...account,
          auxiliaryRequirements: [...accountAuxiliaryRequirements.values()]
            .filter((requirement) => requirement.accountId === account.id)
            .map((requirement) => ({ ...requirement, auxiliaryType: auxiliaryTypes.get(requirement.auxiliaryTypeId) }))
        };
      },
      findMany: async ({ where, include } = {}) => {
        const rows = [...chartOfAccounts.values()];
        const filtered = where?.accountSetId ? rows.filter((account) => account.accountSetId === where.accountSetId) : rows;
        if (!include?.auxiliaryRequirements) return filtered;
        return filtered.map((account) => ({
          ...account,
          auxiliaryRequirements: [...accountAuxiliaryRequirements.values()]
            .filter((requirement) => requirement.accountId === account.id)
            .map((requirement) => ({ ...requirement, auxiliaryType: auxiliaryTypes.get(requirement.auxiliaryTypeId) }))
        }));
      }
    },
    auxiliaryType: {
      create: async ({ data }) => {
        const type = { ...data };
        auxiliaryTypes.set(type.id, type);
        return type;
      },
      findMany: async ({ where } = {}) => {
        const rows = [...auxiliaryTypes.values()];
        return where?.accountSetId ? rows.filter((type) => type.accountSetId === where.accountSetId) : rows;
      },
      findUnique: async ({ where }) => auxiliaryTypes.get(where.id) ?? null
    },
    auxiliaryItem: {
      create: async ({ data }) => {
        const type = auxiliaryTypes.get(data.auxiliaryTypeId);
        const item = { ...data, auxiliaryType: type };
        auxiliaryItems.set(item.id, item);
        return item;
      },
      findMany: async ({ where } = {}) => {
        const rows = [...auxiliaryItems.values()];
        return where?.accountSetId ? rows.filter((item) => item.accountSetId === where.accountSetId) : rows;
      }
    },
    accountAuxiliaryRequirement: {
      upsert: async ({ where, create, update, include }) => {
        const key = `${where.accountId_auxiliaryTypeId.accountId}:${where.accountId_auxiliaryTypeId.auxiliaryTypeId}`;
        const requirement = accountAuxiliaryRequirements.get(key)
          ? { ...accountAuxiliaryRequirements.get(key), ...update }
          : create;
        accountAuxiliaryRequirements.set(key, requirement);
        if (!include) return requirement;
        return {
          ...requirement,
          account: chartOfAccounts.get(requirement.accountId),
          auxiliaryType: auxiliaryTypes.get(requirement.auxiliaryTypeId)
        };
      },
      findMany: async ({ where, include }) =>
        [...accountAuxiliaryRequirements.values()]
          .filter((requirement) => requirement.accountId === where.accountId)
          .map((requirement) =>
            include
              ? {
                  ...requirement,
                  account: chartOfAccounts.get(requirement.accountId),
                  auxiliaryType: auxiliaryTypes.get(requirement.auxiliaryTypeId)
                }
              : requirement
          )
    },
    openingBalance: {
      upsert: async ({ where, create, update, include }) => {
        const key = `${where.accountId_fiscalYear_periodNo.accountId}:${where.accountId_fiscalYear_periodNo.fiscalYear}:${where.accountId_fiscalYear_periodNo.periodNo}`;
        const balance = openingBalances.get(key) ? { ...openingBalances.get(key), ...update } : create;
        openingBalances.set(key, balance);
        return include?.account ? { ...balance, account: chartOfAccounts.get(balance.accountId) } : balance;
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...openingBalances.values()];
        if (where?.account?.accountSetId) {
          rows = rows.filter((balance) => chartOfAccounts.get(balance.accountId)?.accountSetId === where.account.accountSetId);
        }
        return include?.account
          ? rows.map((balance) => ({ ...balance, account: chartOfAccounts.get(balance.accountId) }))
          : rows;
      }
    },
    voucher: {
      create: async ({ data, include }) => {
        const voucher = {
          id: data.id,
          accountSetId: data.accountSetId,
          fiscalYear: data.fiscalYear,
          periodNo: data.periodNo,
          periodId: data.periodId ?? null,
          voucherType: data.voucherType,
          voucherNo: data.voucherNo,
          voucherDate: data.voucherDate,
          status: data.status,
          summary: data.summary ?? null,
          attachmentCount: data.attachmentCount ?? 0,
          createdBy: data.createdBy,
          submittedBy: data.submittedBy ?? null,
          approvedBy: data.approvedBy ?? null,
          postedBy: data.postedBy ?? null,
          postedAt: data.postedAt ?? null,
          sourceType: data.sourceType,
          aiDraftId: data.aiDraftId ?? null,
          revision: data.revision ?? 1,
          lines: []
        };
        vouchers.set(voucher.id, voucher);
        for (const lineData of data.lines.create) {
          const line = {
            id: lineData.id,
            voucherId: voucher.id,
            ...lineData,
            account: chartOfAccounts.get(lineData.accountId),
            auxiliaries: (lineData.auxiliaries?.create ?? []).map((link) => ({
              ...link,
              auxiliaryType: auxiliaryTypes.get(link.auxiliaryTypeId),
              auxiliaryItem: auxiliaryItems.get(link.auxiliaryItemId)
            }))
          };
          voucherLines.set(line.id, line);
          voucher.lines.push(line);
        }
        return include?.lines ? voucher : { ...voucher, lines: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...vouchers.values()];
        if (where?.accountSetId) {
          rows = rows.filter((voucher) => voucher.accountSetId === where.accountSetId);
        }
        return include?.lines ? rows : rows.map((voucher) => ({ ...voucher, lines: undefined }));
      },
      findUnique: async ({ where, include }) => {
        const voucher = vouchers.get(where.id);
        if (!voucher) return null;
        return include?.lines ? voucher : { ...voucher, lines: undefined };
      },
      update: async ({ where, data, include }) => {
        const { lines, ...voucherData } = data;
        const voucher = { ...vouchers.get(where.id), ...voucherData };
        if (lines?.create) {
          voucher.lines = [];
          for (const lineData of lines.create) {
            const line = {
              id: lineData.id,
              voucherId: voucher.id,
              ...lineData,
              account: chartOfAccounts.get(lineData.accountId),
              auxiliaries: (lineData.auxiliaries?.create ?? []).map((link) => ({
                ...link,
                auxiliaryType: auxiliaryTypes.get(link.auxiliaryTypeId),
                auxiliaryItem: auxiliaryItems.get(link.auxiliaryItemId)
              }))
            };
            voucherLines.set(line.id, line);
            voucher.lines.push(line);
          }
        }
        vouchers.set(voucher.id, voucher);
        return include?.lines ? voucher : { ...voucher, lines: undefined };
      }
    },
    voucherLine: {
      deleteMany: async ({ where }) => {
        for (const [id, line] of voucherLines.entries()) {
          if (line.voucherId === where.voucherId) {
            voucherLines.delete(id);
          }
        }
        const voucher = vouchers.get(where.voucherId);
        if (voucher) {
          voucher.lines = [];
        }
      }
    },
    voucherStatusLog: {
      create: async ({ data }) => {
        const log = { ...data };
        voucherStatusLogs.push(log);
        return log;
      },
      findMany: async ({ where }) => voucherStatusLogs.filter((log) => log.voucherId === where.voucherId)
    },
    postingBatch: {
      create: async ({ data }) => {
        const batch = { ...data };
        postingBatches.set(batch.id, batch);
        return batch;
      }
    },
    journalEntry: {
      create: async ({ data, include }) => {
        const account = chartOfAccounts.get(data.accountId);
        const entry = { ...data, account };
        journalEntries.set(entry.id, entry);
        return include?.account ? entry : data;
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...journalEntries.values()];
        if (where?.accountSetId) {
          rows = rows.filter((entry) => entry.accountSetId === where.accountSetId);
        }
        return include?.account ? rows : rows.map(({ account, ...entry }) => entry);
      }
    },
    accountPeriodBalance: {
      upsert: async ({ where, create, update, include }) => {
        const key = `${where.accountSetId_fiscalYear_periodNo_accountId.accountSetId}:${where.accountSetId_fiscalYear_periodNo_accountId.fiscalYear}:${where.accountSetId_fiscalYear_periodNo_accountId.periodNo}:${where.accountSetId_fiscalYear_periodNo_accountId.accountId}`;
        const current = accountPeriodBalances.get(key);
        const balance = current
          ? {
              ...current,
              periodDebit: current.periodDebit + (update.periodDebit?.increment ?? 0),
              periodCredit: current.periodCredit + (update.periodCredit?.increment ?? 0),
              cumulativeDebit: current.cumulativeDebit + (update.cumulativeDebit?.increment ?? 0),
              cumulativeCredit: current.cumulativeCredit + (update.cumulativeCredit?.increment ?? 0),
              closingDebit: current.closingDebit + (update.closingDebit?.increment ?? 0),
              closingCredit: current.closingCredit + (update.closingCredit?.increment ?? 0)
            }
          : create;
        accountPeriodBalances.set(key, balance);
        return include?.account ? { ...balance, account: chartOfAccounts.get(balance.accountId) } : balance;
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...accountPeriodBalances.values()];
        if (where?.accountSetId) {
          rows = rows.filter((balance) => balance.accountSetId === where.accountSetId);
        }
        return include?.account
          ? rows.map((balance) => ({ ...balance, account: chartOfAccounts.get(balance.accountId) }))
          : rows;
      }
    },
    bankStatement: {
      create: async ({ data, include }) => {
        const row = { ...data, bankAccount: chartOfAccounts.get(data.bankAccountId) };
        bankStatements.set(row.id, row);
        return include?.bankAccount ? row : { ...row, bankAccount: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...bankStatements.values()];
        if (where?.accountSetId) {
          rows = rows.filter((statement) => statement.accountSetId === where.accountSetId);
        }
        return include?.bankAccount ? rows : rows.map(({ bankAccount, ...statement }) => statement);
      },
      update: async ({ where, data, include }) => {
        const current = bankStatements.get(where.id);
        const row = { ...current, ...data };
        bankStatements.set(row.id, row);
        return include?.bankAccount ? row : { ...row, bankAccount: undefined };
      }
    },
    bankReconciliation: {
      create: async ({ data }) => {
        const reconciliation = { ...data };
        bankReconciliations.set(reconciliation.id, reconciliation);
        return reconciliation;
      },
      update: async ({ where, data }) => {
        const reconciliation = { ...bankReconciliations.get(where.id), ...data };
        bankReconciliations.set(reconciliation.id, reconciliation);
        return reconciliation;
      }
    }
  };
}

test("Prisma platform persistence stores users with password hashes and role permissions", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const role = await store.createRole({
    name: "Voucher Maker",
    description: "Creates vouchers",
    permissionCodes: ["voucher.create", "voucher.view"]
  });
  const user = await store.createUser({
    username: "maker",
    name: "Maker User",
    passwordHash: "sha256:salt:digest",
    roleId: role.id
  });
  const identity = await store.findUserIdentity("maker");

  assert.deepEqual(role.permissionCodes, ["voucher.create", "voucher.view"]);
  assert.equal(user.passwordHash, undefined, "Created user response must not expose passwordHash.");
  assert.equal(identity.user.passwordHash, "sha256:salt:digest");
  assert.equal(identity.user.roleId, role.id);
  assert.deepEqual(identity.permissionCodes, ["voucher.create", "voucher.view"]);
});

test("Prisma platform persistence updates role permission assignments", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const role = await store.createRole({
    name: "Editable Role",
    description: "Before",
    permissionCodes: ["voucher.view"]
  });
  const updated = await store.updateRole(role.id, {
    name: "Editable Role",
    description: "After",
    permissionCodes: ["voucher.view", "account.create"]
  });

  assert.equal(updated.id, role.id);
  assert.equal(updated.description, "After");
  assert.deepEqual(updated.permissionCodes, ["voucher.view", "account.create"]);
});

test("Prisma platform persistence deletes users and related grants", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const role = await store.createRole({
    name: "Temporary User Role",
    description: "",
    permissionCodes: ["voucher.view"]
  });
  const user = await store.createUser({
    username: "temporary-user",
    name: "Temporary User",
    passwordHash: "sha256:salt:digest",
    roleId: role.id
  });
  await store.deleteUser(user.id);

  const identity = await store.findUserIdentity("temporary-user");
  assert.equal(identity, null);
});

test("Prisma platform persistence stores account sets and scoped user grants", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const role = await store.createRole({
    name: "Scoped Viewer",
    description: "Can view account sets",
    permissionCodes: ["voucher.view"]
  });
  const user = await store.createUser({
    username: "scoped-viewer",
    name: "Scoped Viewer",
    passwordHash: "sha256:salt:digest",
    roleId: role.id
  });
  const accountSet = await store.createAccountSet({
    id: "account-set:1",
    code: "S001",
    name: "Scoped Account Set",
    companyName: "Scoped Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    status: "enabled",
    createdBy: "system"
  });
  const beforeGrant = await store.listAccessibleAccountSets(user.id);
  const grant = await store.grantAccountSetUser({
    accountSetId: accountSet.id,
    actorId: user.id
  });
  const afterGrant = await store.listAccessibleAccountSets(user.id);
  const users = await store.listAccountSetUsers(accountSet.id);
  const canAccess = await store.canAccessAccountSet(user.id, accountSet.id);
  const found = await store.findAccountSet(accountSet.code);
  const updated = await store.updateAccountSet({
    ...accountSet,
    name: "Scoped Account Set Updated",
    companyName: "Scoped Updated Co.",
    baseCurrency: "USD",
    accountingStandard: "Enterprise Accounting Standards",
    startYear: 2027,
    startPeriod: 2
  });

  assert.deepEqual(beforeGrant, []);
  assert.equal(grant.accountSetId, accountSet.id);
  assert.equal(grant.actorId, user.id);
  assert.deepEqual(afterGrant.map((item) => item.id), [accountSet.id]);
  assert.deepEqual(users.map((item) => item.actorId), [user.id]);
  assert.equal(canAccess, true);
  assert.equal(found.id, accountSet.id);
  assert.equal(updated.name, "Scoped Account Set Updated");
  assert.equal(updated.companyName, "Scoped Updated Co.");
  assert.equal(updated.baseCurrency, "USD");
  assert.equal(updated.startYear, 2027);
  assert.equal(updated.startPeriod, 2);
});

test("Prisma platform persistence stores accounting periods and lifecycle status", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  await store.createAccountSet({
    id: "account-set:periods",
    code: "P001",
    name: "Period Account Set",
    companyName: "Period Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 2,
    status: "draft",
    createdBy: "system"
  });

  await store.saveAccountingPeriods([
    {
      id: "period:2026:1",
      accountSetId: "account-set:periods",
      fiscalYear: 2026,
      periodNo: 1,
      status: "unopened",
      isCurrent: false
    },
    {
      id: "period:2026:2",
      accountSetId: "account-set:periods",
      fiscalYear: 2026,
      periodNo: 2,
      status: "open",
      isCurrent: true
    }
  ]);
  const before = await store.listAccountingPeriods("account-set:periods");
  const updated = await store.updateAccountingPeriod({
    ...before[0],
    status: "open",
    isCurrent: false
  });
  const found = await store.findAccountingPeriod(updated.id);

  assert.deepEqual(before.map((period) => period.periodNo), [1, 2]);
  assert.equal(before[0].startDate, "2026-01-01");
  assert.equal(before[0].endDate, "2026-01-31");
  assert.equal(updated.status, "open");
  assert.equal(found.status, "open");
});

test("Prisma platform persistence stores chart of account rows by account set", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const created = await store.createAccount({
    id: "account:1002",
    accountSetId: "account-set:accounts",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit",
    isLeaf: true,
    isEnabled: true,
    allowManualEntry: true,
    requiredAuxiliaries: []
  });
  await store.createAccount({
    id: "account:6602",
    accountSetId: "account-set:other",
    code: "6602",
    name: "Office Expense",
    accountType: "expense",
    normalBalance: "debit",
    isLeaf: true,
    isEnabled: true,
    allowManualEntry: true,
    requiredAuxiliaries: []
  });
  const accounts = await store.listAccounts("account-set:accounts");

  assert.equal(created.accountSetId, "account-set:accounts");
  assert.equal(created.level, 1);
  assert.deepEqual(accounts.map((account) => account.code), ["1002"]);
  assert.equal(accounts[0].normalBalance, "debit");
});

test("Prisma platform persistence can disable chart of account rows", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  const account = await store.createAccount({
    id: "account:6602",
    accountSetId: "account-set:accounts",
    code: "6602",
    name: "Office Expense",
    accountType: "expense",
    normalBalance: "debit",
    isLeaf: true,
    isEnabled: true,
    allowManualEntry: true
  });
  const disabled = await store.updateAccount({ ...account, isEnabled: false });
  const found = await store.findAccount("6602");

  assert.equal(disabled.isEnabled, false);
  assert.equal(found.isEnabled, false);
});

test("Prisma platform persistence stores auxiliary accounting master data and account requirements", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const account = await store.createAccount({
    id: "account:6602",
    accountSetId: "account-set:aux",
    code: "6602",
    name: "Office Expense",
    accountType: "expense",
    normalBalance: "debit"
  });
  const type = await store.createAuxiliaryType({
    id: "auxiliary-type:department",
    accountSetId: "account-set:aux",
    code: "department",
    name: "Department",
    category: "department",
    isEnabled: true
  });
  const item = await store.createAuxiliaryItem({
    id: "auxiliary-item:finance",
    accountSetId: "account-set:aux",
    auxiliaryTypeId: type.id,
    code: "D001",
    name: "Finance Department",
    isEnabled: true
  });
  await store.saveAccountAuxiliaryRequirement({
    accountId: account.id,
    auxiliaryTypeId: type.id,
    required: true
  });

  const types = await store.listAuxiliaryTypes("account-set:aux");
  const items = await store.listAuxiliaryItems("account-set:aux");
  const requirements = await store.listAccountAuxiliaryRequirements(account.id);

  assert.deepEqual(types.map((candidate) => candidate.code), ["department"]);
  assert.equal(item.auxiliaryTypeCode, "department");
  assert.deepEqual(items.map((candidate) => candidate.code), ["D001"]);
  assert.equal(requirements[0].accountCode, "6602");
  assert.equal(requirements[0].auxiliaryTypeCode, "department");
  assert.equal(requirements[0].required, true);
});

test("Prisma platform persistence stores opening balances and computes opening trial balance", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const asset = await store.createAccount({
    id: "account:1002",
    accountSetId: "account-set:opening",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit"
  });
  const equity = await store.createAccount({
    id: "account:3001",
    accountSetId: "account-set:opening",
    code: "3001",
    name: "Owner Equity",
    accountType: "equity",
    normalBalance: "credit"
  });
  await store.saveOpeningBalance({
    accountId: asset.id,
    fiscalYear: 2026,
    periodNo: 1,
    openingDebit: 1000,
    openingCredit: 0
  });
  await store.saveOpeningBalance({
    accountId: equity.id,
    fiscalYear: 2026,
    periodNo: 1,
    openingDebit: 0,
    openingCredit: 900
  });
  await store.saveOpeningBalance({
    accountId: equity.id,
    fiscalYear: 2026,
    periodNo: 1,
    openingDebit: 0,
    openingCredit: 1000
  });

  const rows = await store.listOpeningBalances("account-set:opening");
  const trialBalance = await store.getOpeningTrialBalance("account-set:opening");

  assert.deepEqual(rows.map((row) => row.accountCode), ["1002", "3001"]);
  assert.equal(rows.find((row) => row.accountCode === "3001").openingCredit, 1000);
  assert.deepEqual(trialBalance.totals, { openingDebit: 1000, openingCredit: 1000, difference: 0, isBalanced: true });
});

test("Prisma platform persistence stores voucher drafts with revision and voucher lines", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  await store.createAccount({
    id: "account:1002",
    accountSetId: "account-set:voucher",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit"
  });
  await store.createAccount({
    id: "account:6602",
    accountSetId: "account-set:voucher",
    code: "6602",
    name: "Office Expense",
    accountType: "expense",
    normalBalance: "debit"
  });
  const created = await store.createVoucher({
    id: "voucher:1",
    accountSetId: "account-set:voucher",
    fiscalYear: 2026,
    periodNo: 1,
    voucherDate: "2026-01-15",
    status: "draft",
    revision: 1,
    sourceType: "manual",
    attachmentCount: 0,
    createdBy: "maker",
    lines: [
      { lineNo: 1, summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0, auxiliaries: {} },
      { lineNo: 2, summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500, auxiliaries: {} }
    ]
  });
  const vouchers = await store.listVouchers("account-set:voucher");

  assert.equal(created.voucherNo, "voucher:1");
  assert.equal(created.revision, 1);
  assert.equal(created.lines[0].accountCode, "6602");
  assert.equal(created.lines[1].credit, 500);
  assert.deepEqual(vouchers.map((voucher) => voucher.id), ["voucher:1"]);
  assert.equal(vouchers[0].revision, 1);
  assert.equal(vouchers[0].lines.length, 2);

  const updated = await store.updateVoucherDraft({
    ...created,
    revision: 2,
    lines: [
      { lineNo: 1, summary: "Buy office supplies", accountCode: "6602", debit: 600, credit: 0, auxiliaries: {} },
      { lineNo: 2, summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 600, auxiliaries: {} }
    ]
  });
  const afterUpdate = await store.listVouchers("account-set:voucher");

  assert.equal(updated.revision, 2);
  assert.equal(afterUpdate[0].revision, 2);
  assert.equal(afterUpdate[0].lines[0].debit, 600);
});

test("Prisma platform persistence stores voucher line auxiliary values", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  await store.createAccount({
    id: "account:1002",
    accountSetId: "account-set:voucher-aux",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit"
  });
  await store.createAccount({
    id: "account:5602",
    accountSetId: "account-set:voucher-aux",
    code: "5602",
    name: "Management Expense",
    accountType: "expense",
    normalBalance: "debit"
  });
  const type = await store.createAuxiliaryType({
    id: "auxiliary-type:voucher-department",
    accountSetId: "account-set:voucher-aux",
    code: "department",
    name: "Department",
    category: "department",
    isEnabled: true
  });
  await store.createAuxiliaryItem({
    id: "auxiliary-item:voucher-finance",
    accountSetId: "account-set:voucher-aux",
    auxiliaryTypeId: type.id,
    code: "FIN",
    name: "Finance Department",
    isEnabled: true
  });

  const created = await store.createVoucher({
    id: "voucher:aux-line",
    accountSetId: "account-set:voucher-aux",
    fiscalYear: 2026,
    periodNo: 6,
    voucherDate: "2026-06-08",
    status: "draft",
    revision: 1,
    sourceType: "manual",
    attachmentCount: 0,
    createdBy: "maker",
    lines: [
      { lineNo: 1, summary: "Department expense", accountCode: "5602", debit: 120, credit: 0, auxiliaries: { department: "FIN" } },
      { lineNo: 2, summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 120, auxiliaries: {} }
    ]
  });
  const [listed] = await store.listVouchers("account-set:voucher-aux");

  assert.deepEqual(created.lines[0].auxiliaries, { department: "FIN" });
  assert.deepEqual(listed.lines[0].auxiliaries, { department: "FIN" });
});

test("Prisma platform persistence updates voucher status and stores workflow logs", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  await store.createAccount({
    id: "account:1002",
    accountSetId: "account-set:voucher-status",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit"
  });
  await store.createAccount({
    id: "account:6602",
    accountSetId: "account-set:voucher-status",
    code: "6602",
    name: "Office Expense",
    accountType: "expense",
    normalBalance: "debit"
  });
  const draft = await store.createVoucher({
    id: "voucher:status:1",
    accountSetId: "account-set:voucher-status",
    fiscalYear: 2026,
    periodNo: 1,
    voucherDate: "2026-01-15",
    status: "draft",
    sourceType: "manual",
    attachmentCount: 0,
    createdBy: "maker",
    lines: [
      { lineNo: 1, summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0, auxiliaries: {} },
      { lineNo: 2, summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500, auxiliaries: {} }
    ]
  });
  const submitted = await store.updateVoucherStatus({
    ...draft,
    status: "submitted",
    submittedBy: "maker"
  });
  const log = await store.createVoucherStatusLog({
    id: "voucher-status-log:1",
    voucherId: draft.id,
    action: "submit",
    fromStatus: "draft",
    toStatus: "submitted",
    actorId: "maker",
    reason: null
  });

  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.submittedBy, "maker");
  assert.equal(log.action, "submit");
  assert.equal(log.toStatus, "submitted");
});

test("Prisma platform persistence stores posting journal entries and account period balances", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  await store.createAccount({
    id: "account:1002",
    accountSetId: "account-set:posting",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit"
  });
  await store.createAccount({
    id: "account:6602",
    accountSetId: "account-set:posting",
    code: "6602",
    name: "Office Expense",
    accountType: "expense",
    normalBalance: "debit"
  });
  const voucher = await store.createVoucher({
    id: "voucher:posting:1",
    accountSetId: "account-set:posting",
    fiscalYear: 2026,
    periodNo: 1,
    voucherDate: "2026-01-15",
    status: "approved",
    sourceType: "manual",
    attachmentCount: 0,
    createdBy: "maker",
    lines: [
      { lineNo: 1, summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0, auxiliaries: {} },
      { lineNo: 2, summary: "Pay by bank", accountCode: "1002", debit: 0, credit: 500, auxiliaries: {} }
    ]
  });
  await store.savePostingResult({
    voucher: { ...voucher, status: "posted", postedBy: "poster", postedAt: "posted" },
    journalEntries: [
      {
        id: "journal:voucher:posting:1:1",
        accountSetId: "account-set:posting",
        voucherId: voucher.id,
        voucherLineNo: 1,
        fiscalYear: 2026,
        periodNo: 1,
        entryDate: "2026-01-15",
        accountCode: "6602",
        summary: "Buy office supplies",
        debit: 500,
        credit: 0,
        auxiliarySnapshot: {}
      },
      {
        id: "journal:voucher:posting:1:2",
        accountSetId: "account-set:posting",
        voucherId: voucher.id,
        voucherLineNo: 2,
        fiscalYear: 2026,
        periodNo: 1,
        entryDate: "2026-01-15",
        accountCode: "1002",
        summary: "Pay by bank",
        debit: 0,
        credit: 500,
        auxiliarySnapshot: {}
      }
    ],
    balances: [
      { accountCode: "6602", accountName: "Office Expense", normalBalance: "debit", periodDebit: 500, periodCredit: 0 },
      { accountCode: "1002", accountName: "Bank Deposits", normalBalance: "debit", periodDebit: 0, periodCredit: 500 }
    ],
    postedBy: "poster"
  });

  const entries = await store.listJournalEntries("account-set:posting");
  const balances = await store.listAccountPeriodBalances("account-set:posting");

  assert.deepEqual(entries.map((entry) => entry.accountCode), ["6602", "1002"]);
  assert.equal(entries.find((entry) => entry.accountCode === "6602").debit, 500);
  assert.deepEqual(balances.map((balance) => balance.accountCode), ["1002", "6602"]);
  assert.equal(balances.find((balance) => balance.accountCode === "1002").periodCredit, 500);
});

test("Prisma platform persistence stores bank statements and reconciliation status", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  await store.createAccount({
    id: "account:1002",
    accountSetId: "account-set:bank-rec",
    code: "1002",
    name: "Bank Deposits",
    accountType: "asset",
    normalBalance: "debit",
    isLeaf: true,
    isBank: true,
    isCash: false,
    isEnabled: true,
    allowManualEntry: true
  });

  const statements = await store.saveBankStatements([
    {
      id: "bank-statement:1",
      accountSetId: "account-set:bank-rec",
      bankAccountCode: "1002",
      transactionDate: "2026-01-15",
      description: "Bank payment",
      amount: -500,
      balance: 9500,
      status: "unreconciled"
    }
  ]);
  const reconciliation = await store.createBankReconciliation({
    id: "bank-reconciliation:1",
    accountSetId: "account-set:bank-rec",
    fiscalYear: 2026,
    periodNo: 1,
    status: "created",
    createdBy: "poster"
  });
  const matched = await store.saveBankReconciliationMatch({
    ...reconciliation,
    status: "matched",
    matchedCount: 1,
    matches: [{ bankStatementId: statements[0].id, journalEntryId: "journal:1", amount: -500, matchedBy: "poster" }]
  });
  const listed = await store.listBankStatements("account-set:bank-rec");

  assert.equal(statements[0].bankAccountCode, "1002");
  assert.equal(matched.status, "matched");
  assert.equal(matched.matchedCount, 1);
  assert.equal(listed[0].status, "reconciled");
});
