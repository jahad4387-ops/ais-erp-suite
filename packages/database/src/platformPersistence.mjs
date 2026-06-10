function roleToDto(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? null,
    permissionCodes: (role.rolePermissions ?? []).map((item) => item.permission.code)
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    status: user.status,
    roleId: user.userRoles?.[0]?.role?.id ?? null,
    role: user.userRoles?.[0]?.role?.name ?? null
  };
}

function userIdentity(user) {
  const role = user.userRoles?.[0]?.role ?? null;
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      status: user.status,
      roleId: role?.id ?? null,
      role: role?.name ?? null,
      passwordHash: user.passwordHash
    },
    permissionCodes: role?.rolePermissions?.map((item) => item.permission.code) ?? []
  };
}

function accountSetToDto(accountSet) {
  return {
    id: accountSet.id,
    code: accountSet.code,
    name: accountSet.name,
    companyName: accountSet.companyName,
    baseCurrency: accountSet.baseCurrency,
    accountingStandard: accountSet.accountingStandard,
    startYear: accountSet.startYear,
    startPeriod: accountSet.startPeriod,
    status: accountSet.status,
    createdBy: accountSet.createdBy
  };
}

function accountSetUserToDto(grant) {
  return {
    id: `account-set-user:${grant.accountSetId}:${grant.userId}`,
    accountSetId: grant.accountSetId,
    actorId: grant.userId,
    grantedBy: grant.grantedBy ?? null,
    grantedAt: grant.grantedAt ?? null
  };
}

function partnerToDto(partner) {
  return {
    id: partner.id,
    accountSetId: partner.accountSetId,
    partnerType: partner.partnerType,
    code: partner.code,
    name: partner.name,
    taxRate: partner.taxRate,
    creditLimit: partner.creditLimit,
    paymentTerms: partner.paymentTerms ?? "",
    settlementMethod: partner.settlementMethod ?? "",
    isEnabled: partner.isEnabled
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function monthEndDate(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function periodDateRange(period) {
  return {
    startDate: new Date(`${period.fiscalYear}-${pad2(period.periodNo)}-01T00:00:00.000Z`),
    endDate: new Date(`${monthEndDate(period.fiscalYear, period.periodNo)}T00:00:00.000Z`)
  };
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dateTime(value, fallback = new Date()) {
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(`${dateOnly(value)}T00:00:00.000Z`);
  }
  return fallback;
}

function periodToDto(period) {
  return {
    id: period.id,
    accountSetId: period.accountSetId,
    fiscalYear: period.fiscalYear,
    periodNo: period.periodNo,
    status: period.status,
    isCurrent: period.isCurrent,
    startDate: dateOnly(period.startDate),
    endDate: dateOnly(period.endDate)
  };
}

function deriveAccountLevel(account) {
  if (Number.isInteger(account.level) && account.level > 0) {
    return account.level;
  }
  return Math.max(1, Math.ceil(String(account.code ?? "").length / 4));
}

function accountToDto(account) {
  return {
    id: account.id,
    accountSetId: account.accountSetId,
    code: account.code,
    name: account.name,
    parentId: account.parentId ?? null,
    level: account.level,
    accountType: account.accountType,
    normalBalance: account.normalBalance,
    isLeaf: account.isLeaf,
    isCash: account.isCash,
    isBank: account.isBank,
    isEnabled: account.isEnabled,
    allowManualEntry: account.allowManualEntry,
    requiredAuxiliaries: (account.auxiliaryRequirements ?? [])
      .filter((requirement) => requirement.required !== false)
      .map((requirement) => requirement.auxiliaryType?.code)
      .filter(Boolean)
  };
}

function auxiliaryTypeToDto(type) {
  return {
    id: type.id,
    accountSetId: type.accountSetId,
    code: type.code,
    name: type.name,
    category: type.category,
    isEnabled: type.isEnabled
  };
}

function auxiliaryItemToDto(item) {
  return {
    id: item.id,
    accountSetId: item.accountSetId,
    auxiliaryTypeId: item.auxiliaryTypeId,
    auxiliaryTypeCode: item.auxiliaryType?.code ?? item.auxiliaryTypeCode ?? null,
    code: item.code,
    name: item.name,
    isEnabled: item.isEnabled
  };
}

function accountAuxiliaryRequirementToDto(requirement) {
  return {
    id: `account-auxiliary-requirement:${requirement.accountId}:${requirement.auxiliaryTypeId}`,
    accountCode: requirement.account?.code ?? null,
    accountId: requirement.accountId,
    auxiliaryTypeId: requirement.auxiliaryTypeId,
    auxiliaryTypeCode: requirement.auxiliaryType?.code ?? null,
    auxiliaryTypeName: requirement.auxiliaryType?.name ?? null,
    required: requirement.required
  };
}

function openingBalanceToDto(balance) {
  return {
    id: balance.id,
    accountCode: balance.account?.code ?? null,
    accountName: balance.account?.name ?? null,
    accountId: balance.accountId,
    normalBalance: balance.account?.normalBalance ?? null,
    fiscalYear: balance.fiscalYear,
    periodNo: balance.periodNo,
    openingDebit: balance.openingDebit,
    openingCredit: balance.openingCredit
  };
}

function openingTrialBalance(rows) {
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

function voucherToDto(voucher) {
  return {
    id: voucher.id,
    accountSetId: voucher.accountSetId,
    fiscalYear: voucher.fiscalYear,
    periodNo: voucher.periodNo,
    voucherNo: voucher.voucherNo,
    voucherDate: dateOnly(voucher.voucherDate),
    status: voucher.status,
    sourceType: voucher.sourceType,
    aiDraftId: voucher.aiDraftId ?? null,
    revision: voucher.revision ?? 1,
    attachmentCount: voucher.attachmentCount ?? 0,
    createdBy: voucher.createdBy,
    submittedBy: voucher.submittedBy ?? null,
    approvedBy: voucher.approvedBy ?? null,
    postedBy: voucher.postedBy ?? null,
    postedAt: voucher.postedAt ?? null,
    lines: (voucher.lines ?? [])
      .map((line) => ({
        lineNo: line.lineNo,
        summary: line.summary,
        accountCode: line.account?.code ?? null,
        debit: line.debitAmount,
        credit: line.creditAmount,
        auxiliaries: Object.fromEntries(
          (line.auxiliaries ?? [])
            .map((link) => [link.auxiliaryType?.code, link.auxiliaryItem?.code])
            .filter(([typeCode, itemCode]) => typeCode && itemCode)
        )
      }))
      .sort((left, right) => left.lineNo - right.lineNo)
  };
}

function buildVoucherLineAuxiliaryCreates(line, auxiliaryTypesByCode, auxiliaryItemsByTypeAndCode) {
  return Object.entries(line.auxiliaries ?? {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([typeCode, value]) => {
      const auxiliaryType = auxiliaryTypesByCode.get(typeCode);
      if (!auxiliaryType) {
        throw new Error(`Auxiliary type ${typeCode} does not exist.`);
      }
      const itemKey = `${auxiliaryType.id}:${value}`;
      const auxiliaryItem = auxiliaryItemsByTypeAndCode.get(itemKey);
      if (!auxiliaryItem) {
        throw new Error(`Auxiliary item ${value} does not exist for ${typeCode}.`);
      }
      return {
        auxiliaryTypeId: auxiliaryType.id,
        auxiliaryItemId: auxiliaryItem.id
      };
    });
}

function journalEntryToDto(entry) {
  return {
    id: entry.id,
    accountSetId: entry.accountSetId,
    voucherId: entry.voucherId,
    voucherLineNo: entry.voucherLine?.lineNo ?? null,
    fiscalYear: entry.fiscalYear,
    periodNo: entry.periodNo,
    entryDate: dateOnly(entry.entryDate),
    accountCode: entry.account?.code ?? null,
    summary: entry.summary,
    debit: entry.debitAmount,
    credit: entry.creditAmount,
    auxiliarySnapshot: entry.auxiliarySnapshotJson ? JSON.parse(entry.auxiliarySnapshotJson) : {}
  };
}

function accountPeriodBalanceToDto(balance) {
  return {
    accountCode: balance.account?.code ?? null,
    accountName: balance.account?.name ?? null,
    normalBalance: balance.account?.normalBalance ?? null,
    periodDebit: balance.periodDebit,
    periodCredit: balance.periodCredit
  };
}

function postingBatchToDto(batch) {
  const entriesByVoucher = new Map();
  for (const entry of batch.journalEntries ?? []) {
    const current = entriesByVoucher.get(entry.voucherId) ?? {
      voucherId: entry.voucherId,
      status: "success",
      journalEntryCount: 0
    };
    current.journalEntryCount += 1;
    entriesByVoucher.set(entry.voucherId, current);
  }
  const voucherIds = [...entriesByVoucher.keys()];
  const successCount = batch.voucherCount ?? voucherIds.length;
  return {
    id: batch.id,
    accountSetId: batch.accountSetId,
    fiscalYear: batch.fiscalYear,
    periodNo: batch.periodNo,
    voucherIds,
    successCount,
    failedCount: 0,
    status: batch.status === "posted" ? "success" : batch.status,
    postedBy: batch.postedBy,
    createdAt: batch.postedAt?.toISOString?.() ?? batch.postedAt ?? null,
    results: [...entriesByVoucher.values()]
  };
}

function bankStatementToDto(statement) {
  return {
    id: statement.id,
    accountSetId: statement.accountSetId,
    bankAccountId: statement.bankAccountId,
    bankAccountCode: statement.bankAccount?.code ?? statement.bankAccountCode ?? null,
    transactionDate: dateOnly(statement.transactionDate),
    description: statement.description,
    amount: statement.amount,
    balance: statement.balance ?? null,
    status: statement.status
  };
}

function bankReconciliationToDto(reconciliation, extras = {}) {
  return {
    id: reconciliation.id,
    accountSetId: reconciliation.accountSetId,
    fiscalYear: reconciliation.fiscalYear,
    periodNo: reconciliation.periodNo,
    status: reconciliation.status,
    createdBy: reconciliation.createdBy,
    createdAt: dateOnly(reconciliation.createdAt),
    matchedCount: extras.matchedCount ?? 0,
    matches: extras.matches ?? []
  };
}

export function createPlatformPersistence(prisma) {
  return {
    async listPermissions() {
      return prisma.permission.findMany();
    },

    async listRoles() {
      const roles = await prisma.role.findMany({
        include: { rolePermissions: { include: { permission: true } } }
      });
      return roles.map(roleToDto);
    },

    async createRole({ name, description, permissionCodes }) {
      const role = await prisma.role.create({
        data: {
          name,
          description: description ?? null,
          rolePermissions: {
            create: permissionCodes.map((code) => ({
              permission: { connect: { code } }
            }))
          }
        },
        include: { rolePermissions: { include: { permission: true } } }
      });
      return roleToDto(role);
    },

    async updateRole(roleId, { name, description, permissionCodes }) {
      const role = await prisma.role.update({
        where: { id: roleId },
        data: {
          name,
          description: description ?? null,
          rolePermissions: {
            deleteMany: {},
            create: permissionCodes.map((code) => ({
              permission: { connect: { code } }
            }))
          }
        },
        include: { rolePermissions: { include: { permission: true } } }
      });
      return roleToDto(role);
    },

    async createUser({ username, name, passwordHash, roleId }) {
      const user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          name: name ?? username,
          status: "active",
          userRoles: {
            create: {
              role: { connect: { id: roleId } }
            }
          }
        },
        include: { userRoles: { include: { role: true } } }
      });
      return publicUser(user);
    },

    async listUsers() {
      const users = await prisma.user.findMany({
        include: { userRoles: { include: { role: true } } }
      });
      return users.map(publicUser);
    },

    async deleteUser(userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } }
      });
      if (!user) {
        return null;
      }
      await prisma.accountSetUser.deleteMany({ where: { userId } });
      await prisma.userRole.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
      return publicUser(user);
    },

    async findUserIdentity(username) {
      const user = await prisma.user.findUnique({
        where: { username },
        include: {
          userRoles: {
            include: {
              role: {
                include: { rolePermissions: { include: { permission: true } } }
              }
            }
          }
        }
      });
      return user ? userIdentity(user) : null;
    },

    async createAccountSet(accountSet) {
      const created = await prisma.accountSet.create({
        data: {
          id: accountSet.id,
          code: accountSet.code,
          name: accountSet.name,
          companyName: accountSet.companyName,
          baseCurrency: accountSet.baseCurrency,
          accountingStandard: accountSet.accountingStandard,
          startYear: accountSet.startYear,
          startPeriod: accountSet.startPeriod,
          status: accountSet.status,
          createdBy: accountSet.createdBy
        }
      });
      return accountSetToDto(created);
    },

    async listAccountSets() {
      const accountSets = await prisma.accountSet.findMany();
      return accountSets.map(accountSetToDto);
    },

    async findAccountSet(identifier) {
      const accountSet = await prisma.accountSet.findFirst({
        where: {
          OR: [{ id: identifier }, { code: identifier }]
        }
      });
      return accountSet ? accountSetToDto(accountSet) : null;
    },

    async updateAccountSet(accountSet) {
      const saved = await prisma.accountSet.update({
        where: { id: accountSet.id },
        data: {
          name: accountSet.name,
          companyName: accountSet.companyName,
          baseCurrency: accountSet.baseCurrency,
          accountingStandard: accountSet.accountingStandard,
          startYear: accountSet.startYear,
          startPeriod: accountSet.startPeriod,
          status: accountSet.status
        }
      });
      return accountSetToDto(saved);
    },

    async listAccessibleAccountSets(actorId) {
      const accountSets = await prisma.accountSet.findMany({
        where: {
          users: {
            some: { userId: actorId }
          }
        }
      });
      return accountSets.map(accountSetToDto);
    },

    async grantAccountSetUser({ accountSetId, actorId, grantedBy }) {
      const grant = await prisma.accountSetUser.upsert({
        where: {
          accountSetId_userId: {
            accountSetId,
            userId: actorId
          }
        },
        update: {},
        create: {
          accountSetId,
          userId: actorId,
          grantedBy: grantedBy ?? null
        }
      });
      return accountSetUserToDto(grant);
    },

    async listAccountSetUsers(accountSetId) {
      const grants = await prisma.accountSetUser.findMany({
        where: { accountSetId }
      });
      return grants.map(accountSetUserToDto);
    },

    async canAccessAccountSet(actorId, accountSetId) {
      const grant = await prisma.accountSetUser.findUnique({
        where: {
          accountSetId_userId: {
            accountSetId,
            userId: actorId
          }
        }
      });
      return Boolean(grant);
    },

    async createPartner(partner) {
      const created = await prisma.partner.create({
        data: {
          id: partner.id,
          accountSetId: partner.accountSetId,
          partnerType: partner.partnerType,
          code: partner.code,
          name: partner.name,
          taxRate: partner.taxRate ?? 0,
          creditLimit: partner.creditLimit ?? 0,
          paymentTerms: partner.paymentTerms ?? null,
          settlementMethod: partner.settlementMethod ?? null,
          isEnabled: partner.isEnabled ?? true
        }
      });
      return partnerToDto(created);
    },

    async listPartners(accountSetId, partnerType = null) {
      const partners = await prisma.partner.findMany({
        where: accountSetId ? { accountSetId } : undefined
      });
      return partners
        .map(partnerToDto)
        .filter((partner) => !partnerType || partner.partnerType === partnerType || partner.partnerType === "both")
        .sort((left, right) => left.code.localeCompare(right.code));
    },

    async findPartner(identifier) {
      const partner = await prisma.partner.findFirst({
        where: {
          OR: [{ id: identifier }, { code: identifier }]
        }
      });
      return partner ? partnerToDto(partner) : null;
    },

    async updatePartner(partner) {
      const saved = await prisma.partner.update({
        where: { id: partner.id },
        data: {
          partnerType: partner.partnerType,
          name: partner.name,
          taxRate: partner.taxRate ?? 0,
          creditLimit: partner.creditLimit ?? 0,
          paymentTerms: partner.paymentTerms ?? null,
          settlementMethod: partner.settlementMethod ?? null,
          isEnabled: partner.isEnabled ?? true
        }
      });
      return partnerToDto(saved);
    },

    async createAccount(account) {
      if (typeof account.accountSetId !== "string" || account.accountSetId.trim() === "") {
        throw new Error("accountSetId is required.");
      }
      const created = await prisma.chartOfAccount.create({
        data: {
          id: account.id,
          accountSetId: account.accountSetId,
          code: account.code,
          name: account.name,
          parentId: account.parentId ?? null,
          level: deriveAccountLevel(account),
          accountType: account.accountType,
          normalBalance: account.normalBalance,
          isLeaf: account.isLeaf ?? true,
          isCash: account.isCash ?? false,
          isBank: account.isBank ?? false,
          isEnabled: account.isEnabled ?? true,
          allowManualEntry: account.allowManualEntry ?? true
        },
        include: { auxiliaryRequirements: { include: { auxiliaryType: true } } }
      });
      return accountToDto(created);
    },

    async listAccounts(accountSetId) {
      const accounts = await prisma.chartOfAccount.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { auxiliaryRequirements: { include: { auxiliaryType: true } } }
      });
      return accounts.map(accountToDto).sort((left, right) => left.code.localeCompare(right.code));
    },

    async findAccount(identifier) {
      const accounts = await prisma.chartOfAccount.findMany({
        include: { auxiliaryRequirements: { include: { auxiliaryType: true } } }
      });
      const account = accounts.find((item) => item.id === identifier || item.code === identifier);
      return account ? accountToDto(account) : null;
    },

    async updateAccount(account) {
      const saved = await prisma.chartOfAccount.update({
        where: { id: account.id },
        data: {
          name: account.name,
          parentId: account.parentId ?? null,
          level: deriveAccountLevel(account),
          accountType: account.accountType,
          normalBalance: account.normalBalance,
          isLeaf: account.isLeaf ?? true,
          isCash: account.isCash ?? false,
          isBank: account.isBank ?? false,
          isEnabled: account.isEnabled ?? true,
          allowManualEntry: account.allowManualEntry ?? true
        },
        include: { auxiliaryRequirements: { include: { auxiliaryType: true } } }
      });
      return accountToDto(saved);
    },

    async createAuxiliaryType(type) {
      const created = await prisma.auxiliaryType.create({
        data: {
          id: type.id,
          accountSetId: type.accountSetId,
          code: type.code,
          name: type.name,
          category: type.category,
          isEnabled: type.isEnabled ?? true
        }
      });
      return auxiliaryTypeToDto(created);
    },

    async listAuxiliaryTypes(accountSetId) {
      const types = await prisma.auxiliaryType.findMany({
        where: accountSetId ? { accountSetId } : undefined
      });
      return types.map(auxiliaryTypeToDto).sort((left, right) => left.code.localeCompare(right.code));
    },

    async createAuxiliaryItem(item) {
      const created = await prisma.auxiliaryItem.create({
        data: {
          id: item.id,
          accountSetId: item.accountSetId,
          auxiliaryTypeId: item.auxiliaryTypeId,
          code: item.code,
          name: item.name,
          isEnabled: item.isEnabled ?? true
        },
        include: { auxiliaryType: true }
      });
      return auxiliaryItemToDto(created);
    },

    async listAuxiliaryItems(accountSetId) {
      const items = await prisma.auxiliaryItem.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { auxiliaryType: true }
      });
      return items.map(auxiliaryItemToDto).sort((left, right) => left.code.localeCompare(right.code));
    },

    async saveAccountAuxiliaryRequirement(requirement) {
      const saved = await prisma.accountAuxiliaryRequirement.upsert({
        where: {
          accountId_auxiliaryTypeId: {
            accountId: requirement.accountId,
            auxiliaryTypeId: requirement.auxiliaryTypeId
          }
        },
        update: {
          required: requirement.required ?? true
        },
        create: {
          accountId: requirement.accountId,
          auxiliaryTypeId: requirement.auxiliaryTypeId,
          required: requirement.required ?? true
        },
        include: { account: true, auxiliaryType: true }
      });
      return accountAuxiliaryRequirementToDto(saved);
    },

    async listAccountAuxiliaryRequirements(accountId) {
      const requirements = await prisma.accountAuxiliaryRequirement.findMany({
        where: { accountId },
        include: { account: true, auxiliaryType: true }
      });
      return requirements.map(accountAuxiliaryRequirementToDto);
    },

    async saveOpeningBalance(balance) {
      const saved = await prisma.openingBalance.upsert({
        where: {
          accountId_fiscalYear_periodNo: {
            accountId: balance.accountId,
            fiscalYear: balance.fiscalYear,
            periodNo: balance.periodNo
          }
        },
        update: {
          openingDebit: balance.openingDebit,
          openingCredit: balance.openingCredit
        },
        create: {
          id: balance.id,
          accountId: balance.accountId,
          fiscalYear: balance.fiscalYear,
          periodNo: balance.periodNo,
          openingDebit: balance.openingDebit,
          openingCredit: balance.openingCredit
        },
        include: { account: true }
      });
      return openingBalanceToDto(saved);
    },

    async listOpeningBalances(accountSetId) {
      const balances = await prisma.openingBalance.findMany({
        where: accountSetId ? { account: { accountSetId } } : undefined,
        include: { account: true }
      });
      return balances
        .map(openingBalanceToDto)
        .sort((left, right) => left.accountCode.localeCompare(right.accountCode));
    },

    async getOpeningTrialBalance(accountSetId) {
      return openingTrialBalance(await this.listOpeningBalances(accountSetId));
    },

    async createVoucher(voucher) {
      const accounts = await prisma.chartOfAccount.findMany({
        where: { accountSetId: voucher.accountSetId }
      });
      const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
      const auxiliaryTypes = await prisma.auxiliaryType.findMany({
        where: { accountSetId: voucher.accountSetId }
      });
      const auxiliaryItems = await prisma.auxiliaryItem.findMany({
        where: { accountSetId: voucher.accountSetId }
      });
      const auxiliaryTypesByCode = new Map(auxiliaryTypes.map((type) => [type.code, type]));
      const auxiliaryItemsByTypeAndCode = new Map(
        auxiliaryItems.flatMap((item) => [
          [`${item.auxiliaryTypeId}:${item.code}`, item],
          [`${item.auxiliaryTypeId}:${item.id}`, item]
        ])
      );
      const created = await prisma.voucher.create({
        data: {
          id: voucher.id,
          accountSetId: voucher.accountSetId,
          fiscalYear: voucher.fiscalYear,
          periodNo: voucher.periodNo,
          periodId: voucher.periodId ?? null,
          voucherType: voucher.voucherType ?? "J",
          voucherNo: voucher.voucherNo ?? voucher.id,
          voucherDate: new Date(`${dateOnly(voucher.voucherDate)}T00:00:00.000Z`),
          status: voucher.status,
          summary: voucher.summary ?? voucher.lines?.[0]?.summary ?? null,
          attachmentCount: voucher.attachmentCount ?? 0,
          createdBy: voucher.createdBy,
          submittedBy: voucher.submittedBy ?? null,
          approvedBy: voucher.approvedBy ?? null,
          postedBy: voucher.postedBy ?? null,
          postedAt: voucher.postedAt ? new Date(voucher.postedAt) : null,
          sourceType: voucher.sourceType ?? "manual",
          aiDraftId: voucher.aiDraftId ?? null,
          revision: voucher.revision ?? 1,
          lines: {
            create: voucher.lines.map((line) => {
              const account = accountsByCode.get(line.accountCode);
              if (!account) {
                throw new Error(`Account ${line.accountCode} does not exist.`);
              }
              return {
                id: `voucher-line:${voucher.id}:${line.lineNo}`,
                lineNo: line.lineNo,
                summary: line.summary,
                accountId: account.id,
                debitAmount: line.debit,
                creditAmount: line.credit,
                currency: line.currency ?? "CNY",
                exchangeRate: line.exchangeRate ?? 1,
                auxiliaries: {
                  create: buildVoucherLineAuxiliaryCreates(line, auxiliaryTypesByCode, auxiliaryItemsByTypeAndCode)
                }
              };
            })
          }
        },
        include: { lines: { include: { account: true, auxiliaries: { include: { auxiliaryType: true, auxiliaryItem: true } } } } }
      });
      return voucherToDto(created);
    },

    async listVouchers(accountSetId) {
      const vouchers = await prisma.voucher.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { lines: { include: { account: true, auxiliaries: { include: { auxiliaryType: true, auxiliaryItem: true } } } } }
      });
      return vouchers.map(voucherToDto).sort((left, right) => left.id.localeCompare(right.id));
    },

    async updateVoucherDraft(voucher) {
      const accounts = await prisma.chartOfAccount.findMany({
        where: { accountSetId: voucher.accountSetId }
      });
      const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
      const auxiliaryTypes = await prisma.auxiliaryType.findMany({
        where: { accountSetId: voucher.accountSetId }
      });
      const auxiliaryItems = await prisma.auxiliaryItem.findMany({
        where: { accountSetId: voucher.accountSetId }
      });
      const auxiliaryTypesByCode = new Map(auxiliaryTypes.map((type) => [type.code, type]));
      const auxiliaryItemsByTypeAndCode = new Map(
        auxiliaryItems.flatMap((item) => [
          [`${item.auxiliaryTypeId}:${item.code}`, item],
          [`${item.auxiliaryTypeId}:${item.id}`, item]
        ])
      );
      await prisma.voucherLine.deleteMany({
        where: { voucherId: voucher.id }
      });
      const updated = await prisma.voucher.update({
        where: { id: voucher.id },
        data: {
          fiscalYear: voucher.fiscalYear,
          periodNo: voucher.periodNo,
          voucherDate: dateTime(voucher.voucherDate),
          status: voucher.status,
          summary: voucher.summary ?? voucher.lines?.[0]?.summary ?? null,
          attachmentCount: voucher.attachmentCount ?? 0,
          sourceType: voucher.sourceType ?? "manual",
          aiDraftId: voucher.aiDraftId ?? null,
          revision: voucher.revision ?? 1,
          lines: {
            create: voucher.lines.map((line) => {
              const account = accountsByCode.get(line.accountCode);
              if (!account) {
                throw new Error(`Account ${line.accountCode} does not exist.`);
              }
              return {
                id: `voucher-line:${voucher.id}:${line.lineNo}`,
                lineNo: line.lineNo,
                summary: line.summary,
                accountId: account.id,
                debitAmount: line.debit,
                creditAmount: line.credit,
                currency: line.currency ?? "CNY",
                exchangeRate: line.exchangeRate ?? 1,
                auxiliaries: {
                  create: buildVoucherLineAuxiliaryCreates(line, auxiliaryTypesByCode, auxiliaryItemsByTypeAndCode)
                }
              };
            })
          }
        },
        include: { lines: { include: { account: true, auxiliaries: { include: { auxiliaryType: true, auxiliaryItem: true } } } } }
      });
      return voucherToDto(updated);
    },

    async updateVoucherStatus(voucher) {
      const updated = await prisma.voucher.update({
        where: { id: voucher.id },
        data: {
          status: voucher.status,
          submittedBy: voucher.submittedBy ?? null,
          approvedBy: voucher.approvedBy ?? null,
          postedBy: voucher.postedBy ?? null,
          postedAt: voucher.postedAt ? dateTime(voucher.postedAt) : null
        },
        include: { lines: { include: { account: true, auxiliaries: { include: { auxiliaryType: true, auxiliaryItem: true } } } } }
      });
      return voucherToDto(updated);
    },

    async createVoucherStatusLog(log) {
      return prisma.voucherStatusLog.create({
        data: {
          id: log.id,
          voucherId: log.voucherId,
          action: log.action,
          fromStatus: log.fromStatus ?? null,
          toStatus: log.toStatus,
          actorId: log.actorId,
          reason: log.reason ?? null
        }
      });
    },

    async savePostingResult({ voucher, journalEntries, balances, postedBy }) {
      const persistedVoucher = await prisma.voucher.findUnique({
        where: { id: voucher.id },
        include: { lines: { include: { account: true, auxiliaries: { include: { auxiliaryType: true, auxiliaryItem: true } } } } }
      });
      const linesByNo = new Map((persistedVoucher?.lines ?? []).map((line) => [line.lineNo, line]));
      const accounts = await prisma.chartOfAccount.findMany({
        where: { accountSetId: voucher.accountSetId }
      });
      const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
      const batch = await prisma.postingBatch.create({
        data: {
          id: `posting-batch:${voucher.id}`,
          accountSetId: voucher.accountSetId,
          fiscalYear: voucher.fiscalYear,
          periodNo: voucher.periodNo,
          status: "posted",
          voucherCount: 1,
          postedBy: postedBy ?? voucher.postedBy ?? "system"
        }
      });
      const savedEntries = [];
      for (const entry of journalEntries) {
        const voucherLine = linesByNo.get(entry.voucherLineNo);
        const account = accountsByCode.get(entry.accountCode);
        if (!voucherLine || !account) {
          throw new Error(`Cannot persist journal entry ${entry.id}: voucher line or account was not found.`);
        }
        const savedEntry = await prisma.journalEntry.create({
          data: {
            id: entry.id,
            accountSetId: entry.accountSetId,
            voucherId: entry.voucherId,
            voucherLineId: voucherLine.id,
            fiscalYear: entry.fiscalYear,
            periodNo: entry.periodNo,
            entryDate: dateTime(entry.entryDate),
            accountId: account.id,
            summary: entry.summary,
            debitAmount: entry.debit,
            creditAmount: entry.credit,
            auxiliarySnapshotJson: JSON.stringify(entry.auxiliarySnapshot ?? {}),
            postedBatchId: batch.id
          },
          include: { account: true, voucherLine: true }
        });
        savedEntries.push(journalEntryToDto(savedEntry));
      }
      const savedBalances = [];
      for (const balance of balances) {
        const account = accountsByCode.get(balance.accountCode);
        if (!account) {
          throw new Error(`Cannot persist balance for account ${balance.accountCode}: account was not found.`);
        }
        const savedBalance = await prisma.accountPeriodBalance.upsert({
          where: {
            accountSetId_fiscalYear_periodNo_accountId: {
              accountSetId: voucher.accountSetId,
              fiscalYear: voucher.fiscalYear,
              periodNo: voucher.periodNo,
              accountId: account.id
            }
          },
          update: {
            periodDebit: { increment: balance.periodDebit },
            periodCredit: { increment: balance.periodCredit },
            cumulativeDebit: { increment: balance.periodDebit },
            cumulativeCredit: { increment: balance.periodCredit },
            closingDebit: { increment: balance.periodDebit },
            closingCredit: { increment: balance.periodCredit }
          },
          create: {
            id: `account-period-balance:${voucher.accountSetId}:${voucher.fiscalYear}:${voucher.periodNo}:${account.id}`,
            accountSetId: voucher.accountSetId,
            fiscalYear: voucher.fiscalYear,
            periodNo: voucher.periodNo,
            accountId: account.id,
            openingDebit: 0,
            openingCredit: 0,
            periodDebit: balance.periodDebit,
            periodCredit: balance.periodCredit,
            cumulativeDebit: balance.periodDebit,
            cumulativeCredit: balance.periodCredit,
            closingDebit: balance.periodDebit,
            closingCredit: balance.periodCredit
          },
          include: { account: true }
        });
        savedBalances.push(accountPeriodBalanceToDto(savedBalance));
      }
      return { journalEntries: savedEntries, balances: savedBalances };
    },

    async listPostingBatches(accountSetId) {
      const batches = await prisma.postingBatch.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { journalEntries: true },
        orderBy: { postedAt: "desc" }
      });
      return batches.map(postingBatchToDto);
    },

    async listJournalEntries(accountSetId) {
      const entries = await prisma.journalEntry.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { account: true, voucherLine: true }
      });
      return entries.map(journalEntryToDto).sort((left, right) => left.id.localeCompare(right.id));
    },

    async listAccountPeriodBalances(accountSetId) {
      const balances = await prisma.accountPeriodBalance.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { account: true }
      });
      return balances.map(accountPeriodBalanceToDto).sort((left, right) => left.accountCode.localeCompare(right.accountCode));
    },

    async saveBankStatements(statements) {
      const saved = [];
      for (const statement of statements) {
        const accounts = await prisma.chartOfAccount.findMany({
          where: { accountSetId: statement.accountSetId }
        });
        const bankAccount = accounts.find(
          (account) => account.code === statement.bankAccountCode || account.id === statement.bankAccountId
        );
        if (!bankAccount) {
          throw new Error(`Cannot persist bank statement ${statement.id}: bank account was not found.`);
        }
        const savedStatement = await prisma.bankStatement.create({
          data: {
            id: statement.id,
            accountSetId: statement.accountSetId,
            bankAccountId: bankAccount.id,
            transactionDate: dateTime(statement.transactionDate),
            description: statement.description,
            amount: statement.amount,
            balance: statement.balance ?? null,
            status: statement.status ?? "unreconciled"
          },
          include: { bankAccount: true }
        });
        saved.push(bankStatementToDto(savedStatement));
      }
      return saved;
    },

    async listBankStatements(accountSetId) {
      const statements = await prisma.bankStatement.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { bankAccount: true }
      });
      return statements.map(bankStatementToDto).sort((left, right) => left.id.localeCompare(right.id));
    },

    async createBankReconciliation(reconciliation) {
      const saved = await prisma.bankReconciliation.create({
        data: {
          id: reconciliation.id,
          accountSetId: reconciliation.accountSetId,
          fiscalYear: reconciliation.fiscalYear,
          periodNo: reconciliation.periodNo,
          status: reconciliation.status,
          createdBy: reconciliation.createdBy
        }
      });
      return bankReconciliationToDto(saved);
    },

    async saveBankReconciliationMatch(reconciliation) {
      for (const match of reconciliation.matches ?? []) {
        await prisma.bankStatement.update({
          where: { id: match.bankStatementId },
          data: { status: "reconciled" },
          include: { bankAccount: true }
        });
      }
      const saved = await prisma.bankReconciliation.update({
        where: { id: reconciliation.id },
        data: { status: reconciliation.status }
      });
      return bankReconciliationToDto(saved, {
        matchedCount: reconciliation.matchedCount,
        matches: reconciliation.matches
      });
    },

    async saveAccountingPeriods(periods) {
      const saved = [];
      for (const period of periods) {
        const { startDate, endDate } = periodDateRange(period);
        const savedPeriod = await prisma.accountingPeriod.upsert({
          where: { id: period.id },
          update: {
            status: period.status,
            isCurrent: period.isCurrent
          },
          create: {
            id: period.id,
            accountSetId: period.accountSetId,
            fiscalYear: period.fiscalYear,
            periodNo: period.periodNo,
            startDate,
            endDate,
            status: period.status,
            isCurrent: period.isCurrent
          }
        });
        saved.push(periodToDto(savedPeriod));
      }
      return saved;
    },

    async listAccountingPeriods(accountSetId) {
      const periods = await prisma.accountingPeriod.findMany({
        where: accountSetId ? { accountSetId } : undefined
      });
      return periods
        .map(periodToDto)
        .sort((left, right) => left.fiscalYear - right.fiscalYear || left.periodNo - right.periodNo);
    },

    async findAccountingPeriod(id) {
      const period = await prisma.accountingPeriod.findUnique({ where: { id } });
      return period ? periodToDto(period) : null;
    },

    async updateAccountingPeriod(period) {
      const updated = await prisma.accountingPeriod.update({
        where: { id: period.id },
        data: {
          status: period.status,
          isCurrent: period.isCurrent
        }
      });
      return periodToDto(updated);
    }
  };
}
