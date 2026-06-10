const permissions = [
  "account_set.create",
  "account_set.manage",
  "account_set_user.manage",
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
  "partner.manage",
  "purchase_order.manage",
  "sales_order.manage",
  "purchase_receipt.manage",
  "sales_delivery.manage",
  "purchase_invoice.manage",
  "sales_invoice.manage",
  "counterparty_ledger.view",
  "auxiliary.manage",
  "opening_balance.manage",
  "opening_balance.view",
  "user.manage",
  "role.manage"
];

const roleTemplates = {
  "系统管理员": [...permissions],
  "账套管理员": [
    "account_set.manage",
    "period.view",
    "period.open",
    "period.close",
    "account.create",
    "account.update",
    "account.view",
    "auxiliary.manage",
    "opening_balance.manage",
    "opening_balance.view",
    "partner.manage",
    "purchase_order.manage",
    "sales_order.manage",
    "purchase_receipt.manage",
    "sales_delivery.manage",
    "purchase_invoice.manage",
    "sales_invoice.manage",
    "counterparty_ledger.view",
    "bank_reconciliation.create",
    "bank_reconciliation.match",
    "ledger.view",
    "report.view"
  ],
  制单员: ["voucher.create", "voucher.update_own", "voucher.submit", "voucher.view", "attachment.upload"],
  审核员: ["voucher.approve", "voucher.reject", "voucher.view"],
  记账员: ["voucher.post", "voucher.view", "bank_reconciliation.create", "bank_reconciliation.match", "ledger.view", "report.view"],
  查询用户: ["voucher.view", "ledger.view", "counterparty_ledger.view", "report.view"],
  审计员: ["voucher.view", "ledger.view", "audit_log.view"]
};

function adminFromEnv(env) {
  if (!env.AIS_ADMIN_USERNAME) {
    return null;
  }
  return {
    username: env.AIS_ADMIN_USERNAME,
    name: env.AIS_ADMIN_NAME || env.AIS_ADMIN_USERNAME,
    passwordHash: env.AIS_ADMIN_PASSWORD_HASH,
    roleName: env.AIS_ADMIN_ROLE_NAME || "系统管理员"
  };
}

function assertAdminSeed(admin) {
  if (!admin) {
    return;
  }
  if (!admin.username) {
    throw new Error("admin.username is required.");
  }
  if (!admin.passwordHash) {
    throw new Error("admin.passwordHash is required for the initial administrator seed.");
  }
  if (!admin.passwordHash.startsWith("sha256:")) {
    throw new Error("admin.passwordHash must be a sha256 password hash, not a plaintext password.");
  }
  if (admin.roleName && !roleTemplates[admin.roleName]) {
    throw new Error(`admin.roleName "${admin.roleName}" is not a Phase 1 role template.`);
  }
}

async function seedPhase1Platform(prisma, options = {}) {
  const admin = options.admin || null;
  assertAdminSeed(admin);

  const permissionRecords = new Map();
  for (const code of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { description: code },
      create: { code, description: code }
    });
    permissionRecords.set(code, permission);
  }

  const roleRecords = new Map();
  for (const [name, codes] of Object.entries(roleTemplates)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: `一期平台角色：${name}` },
      create: { name, description: `一期平台角色：${name}` }
    });
    roleRecords.set(name, role);

    for (const code of codes) {
      const permission = permissionRecords.get(code);
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      });
    }
  }

  if (admin) {
    const user = await prisma.user.upsert({
      where: { username: admin.username },
      update: {
        name: admin.name,
        passwordHash: admin.passwordHash,
        status: "active"
      },
      create: {
        username: admin.username,
        name: admin.name,
        passwordHash: admin.passwordHash,
        status: "active"
      }
    });
    const role = roleRecords.get(admin.roleName || "系统管理员");
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id
      }
    });
  }
}

async function main() {
  const { prisma } = require("../src/index.js");
  const admin = adminFromEnv(process.env);

  try {
    if (process.env.DATABASE_URL?.startsWith("file:") && typeof prisma.$queryRawUnsafe === "function") {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
    }
    await seedPhase1Platform(prisma, { admin });
    await prisma.$disconnect();
    console.log(admin ? "一期平台种子已完成，并创建初始管理员。" : "一期平台模板已写入。");
  } catch (error) {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  adminFromEnv,
  main,
  permissions,
  roleTemplates,
  seedPhase1Platform
};
