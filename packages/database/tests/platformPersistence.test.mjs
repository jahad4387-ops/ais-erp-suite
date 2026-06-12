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
  const partners = new Map();
  const inventoryItems = new Map();
  const purchaseOrders = new Map();
  const salesOrders = new Map();
  const purchaseReceipts = new Map();
  const salesDeliveries = new Map();
  const purchaseInvoices = new Map();
  const salesInvoices = new Map();
  const counterpartyLedgerEntries = new Map();
  const paymentRequests = new Map();
  const supplierPayments = new Map();
  const customerReceipts = new Map();
  const collectionPlans = new Map();
  const apSettlements = new Map();
  const arSettlements = new Map();
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
  const migrationJobs = new Map();
  const backupJobs = new Map();
  const restoreJobs = new Map();
  const llmDraftRuns = new Map();
  const agentDraftCandidates = new Map();
  const agentActions = new Map();
  const agentApprovals = new Map();
  const agentReplayEvents = new Map();
  const securityEvents = new Map();
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
    partner: {
      create: async ({ data }) => {
        const partner = { ...data };
        partners.set(partner.id, partner);
        return partner;
      },
      findMany: async ({ where } = {}) => {
        const rows = [...partners.values()];
        return where?.accountSetId ? rows.filter((partner) => partner.accountSetId === where.accountSetId) : rows;
      },
      findFirst: async ({ where }) =>
        [...partners.values()].find(
          (partner) => where.OR.some((condition) => partner.id === condition.id || partner.code === condition.code)
        ) ?? null,
      update: async ({ where, data }) => {
        const partner = { ...partners.get(where.id), ...data };
        partners.set(where.id, partner);
        return partner;
      }
    },
    inventoryItem: {
      create: async ({ data }) => {
        const item = { ...data };
        inventoryItems.set(item.id, item);
        return item;
      },
      findMany: async ({ where } = {}) => {
        const rows = [...inventoryItems.values()];
        return where?.accountSetId ? rows.filter((item) => item.accountSetId === where.accountSetId) : rows;
      },
      findFirst: async ({ where }) =>
        [...inventoryItems.values()].find(
          (item) => where.OR.some((condition) => item.id === condition.id || item.code === condition.code)
        ) ?? null
    },
    purchaseOrder: {
      create: async ({ data, include }) => {
        const order = {
          ...data,
          supplier: partners.get(data.supplierId),
          lines: data.lines.create.map((line) => ({ ...line }))
        };
        purchaseOrders.set(order.id, order);
        return include?.lines ? order : { ...order, lines: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        const rows = [...purchaseOrders.values()].filter((order) => !where?.accountSetId || order.accountSetId === where.accountSetId);
        return rows.map((order) => (include?.lines ? order : { ...order, lines: undefined }));
      },
      findFirst: async ({ where, include }) => {
        const order = [...purchaseOrders.values()].find((item) =>
          where.OR.some((condition) => item.id === condition.id || item.orderNo === condition.orderNo)
        );
        if (!order) return null;
        return include?.lines ? order : { ...order, lines: undefined };
      },
      update: async ({ where, data, include }) => {
        const order = { ...purchaseOrders.get(where.id), ...data };
        purchaseOrders.set(where.id, order);
        return include?.lines ? order : { ...order, lines: undefined };
      }
    },
    purchaseOrderLine: {
      updateMany: async ({ where, data }) => {
        const order = purchaseOrders.get(where.purchaseOrderId);
        if (!order) return { count: 0 };
        let count = 0;
        order.lines = order.lines.map((line) => {
          if (line.lineNo !== where.lineNo) return line;
          count += 1;
          return { ...line, ...data };
        });
        purchaseOrders.set(order.id, order);
        return { count };
      }
    },
    salesOrder: {
      create: async ({ data, include }) => {
        const order = {
          ...data,
          customer: partners.get(data.customerId),
          lines: data.lines.create.map((line) => ({ ...line }))
        };
        salesOrders.set(order.id, order);
        return include?.lines ? order : { ...order, lines: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        const rows = [...salesOrders.values()].filter((order) => !where?.accountSetId || order.accountSetId === where.accountSetId);
        return rows.map((order) => (include?.lines ? order : { ...order, lines: undefined }));
      },
      findFirst: async ({ where, include }) => {
        const order = [...salesOrders.values()].find((item) =>
          where.OR.some((condition) => item.id === condition.id || item.orderNo === condition.orderNo)
        );
        if (!order) return null;
        return include?.lines ? order : { ...order, lines: undefined };
      },
      update: async ({ where, data, include }) => {
        const order = { ...salesOrders.get(where.id), ...data };
        salesOrders.set(where.id, order);
        return include?.lines ? order : { ...order, lines: undefined };
      }
    },
    salesOrderLine: {
      updateMany: async ({ where, data }) => {
        const order = salesOrders.get(where.salesOrderId);
        if (!order) return { count: 0 };
        let count = 0;
        order.lines = order.lines.map((line) => {
          if (line.lineNo !== where.lineNo) return line;
          count += 1;
          return { ...line, ...data };
        });
        salesOrders.set(order.id, order);
        return { count };
      }
    },
    purchaseReceipt: {
      create: async ({ data, include }) => {
        const receipt = {
          ...data,
          purchaseOrder: purchaseOrders.get(data.purchaseOrderId),
          lines: data.lines.create.map((line) => ({ ...line }))
        };
        purchaseReceipts.set(receipt.id, receipt);
        return include?.lines ? receipt : { ...receipt, lines: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        const rows = [...purchaseReceipts.values()].filter((receipt) => !where?.accountSetId || receipt.accountSetId === where.accountSetId);
        return rows.map((receipt) => (include?.lines ? receipt : { ...receipt, lines: undefined }));
      }
    },
    salesDelivery: {
      create: async ({ data, include }) => {
        const delivery = {
          ...data,
          salesOrder: salesOrders.get(data.salesOrderId),
          lines: data.lines.create.map((line) => ({ ...line }))
        };
        salesDeliveries.set(delivery.id, delivery);
        return include?.lines ? delivery : { ...delivery, lines: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        const rows = [...salesDeliveries.values()].filter((delivery) => !where?.accountSetId || delivery.accountSetId === where.accountSetId);
        return rows.map((delivery) => (include?.lines ? delivery : { ...delivery, lines: undefined }));
      }
    },
    purchaseInvoice: {
      create: async ({ data, include }) => {
        const invoice = {
          ...data,
          supplier: partners.get(data.supplierId),
          purchaseReceipt: purchaseReceipts.get(data.purchaseReceiptId),
          lines: data.lines.create.map((line) => ({ ...line }))
        };
        purchaseInvoices.set(invoice.id, invoice);
        return include?.lines ? invoice : { ...invoice, lines: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        const rows = [...purchaseInvoices.values()].filter((invoice) => !where?.accountSetId || invoice.accountSetId === where.accountSetId);
        return rows.map((invoice) => (include?.lines ? invoice : { ...invoice, lines: undefined }));
      }
    },
    salesInvoice: {
      create: async ({ data, include }) => {
        const invoice = {
          ...data,
          customer: partners.get(data.customerId),
          salesDelivery: salesDeliveries.get(data.salesDeliveryId),
          lines: data.lines.create.map((line) => ({ ...line }))
        };
        salesInvoices.set(invoice.id, invoice);
        return include?.lines ? invoice : { ...invoice, lines: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        const rows = [...salesInvoices.values()].filter((invoice) => !where?.accountSetId || invoice.accountSetId === where.accountSetId);
        return rows.map((invoice) => (include?.lines ? invoice : { ...invoice, lines: undefined }));
      }
    },
    counterpartyLedgerEntry: {
      create: async ({ data, include }) => {
        const entry = {
          ...data,
          partner: partners.get(data.partnerId)
        };
        counterpartyLedgerEntries.set(entry.id, entry);
        return include?.partner ? entry : { ...entry, partner: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...counterpartyLedgerEntries.values()];
        if (where?.accountSetId) rows = rows.filter((entry) => entry.accountSetId === where.accountSetId);
        if (where?.direction) rows = rows.filter((entry) => entry.direction === where.direction);
        if (where?.partnerId) rows = rows.filter((entry) => entry.partnerId === where.partnerId);
        if (where?.status) rows = rows.filter((entry) => entry.status === where.status);
        return rows.map((entry) => (include?.partner ? entry : { ...entry, partner: undefined }));
      },
      update: async ({ where, data, include }) => {
        const entry = { ...counterpartyLedgerEntries.get(where.id), ...data };
        counterpartyLedgerEntries.set(where.id, entry);
        return include?.partner ? { ...entry, partner: partners.get(entry.partnerId) } : entry;
      }
    },
    paymentRequest: {
      create: async ({ data, include }) => {
        const request = {
          ...data,
          supplier: partners.get(data.supplierId),
          counterpartyLedgerEntry: counterpartyLedgerEntries.get(data.counterpartyLedgerEntryId)
        };
        paymentRequests.set(request.id, request);
        return include?.supplier ? request : { ...request, supplier: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...paymentRequests.values()];
        if (where?.accountSetId) rows = rows.filter((request) => request.accountSetId === where.accountSetId);
        if (where?.status) rows = rows.filter((request) => request.status === where.status);
        if (where?.supplierId) rows = rows.filter((request) => request.supplierId === where.supplierId);
        return rows.map((request) => (include?.supplier ? request : { ...request, supplier: undefined }));
      },
      update: async ({ where, data, include }) => {
        const request = { ...paymentRequests.get(where.id), ...data };
        paymentRequests.set(where.id, request);
        return include?.supplier ? { ...request, supplier: partners.get(request.supplierId) } : request;
      }
    },
    supplierPayment: {
      create: async ({ data, include }) => {
        const payment = {
          ...data,
          supplier: partners.get(data.supplierId),
          paymentRequest: paymentRequests.get(data.paymentRequestId)
        };
        supplierPayments.set(payment.id, payment);
        return include?.supplier ? payment : { ...payment, supplier: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...supplierPayments.values()];
        if (where?.accountSetId) rows = rows.filter((payment) => payment.accountSetId === where.accountSetId);
        if (where?.status) rows = rows.filter((payment) => payment.status === where.status);
        if (where?.supplierId) rows = rows.filter((payment) => payment.supplierId === where.supplierId);
        return rows.map((payment) => (include?.supplier ? payment : { ...payment, supplier: undefined }));
      }
    },
    apSettlement: {
      create: async ({ data, include }) => {
        const settlement = {
          ...data,
          supplier: partners.get(data.supplierId),
          counterpartyLedgerEntry: counterpartyLedgerEntries.get(data.counterpartyLedgerEntryId),
          supplierPayment: data.supplierPaymentId ? supplierPayments.get(data.supplierPaymentId) : null
        };
        apSettlements.set(settlement.id, settlement);
        return include?.supplier ? settlement : { ...settlement, supplier: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...apSettlements.values()];
        if (where?.accountSetId) rows = rows.filter((settlement) => settlement.accountSetId === where.accountSetId);
        if (where?.status) rows = rows.filter((settlement) => settlement.status === where.status);
        if (where?.supplierId) rows = rows.filter((settlement) => settlement.supplierId === where.supplierId);
        return rows.map((settlement) => (include?.supplier ? settlement : { ...settlement, supplier: undefined }));
      }
    },
    arSettlement: {
      create: async ({ data, include }) => {
        const settlement = {
          ...data,
          customer: partners.get(data.customerId),
          counterpartyLedgerEntry: counterpartyLedgerEntries.get(data.counterpartyLedgerEntryId),
          customerReceipt: data.customerReceiptId ? customerReceipts.get(data.customerReceiptId) : null,
          nettingCounterpartyLedgerEntry: data.nettingCounterpartyLedgerEntryId
            ? counterpartyLedgerEntries.get(data.nettingCounterpartyLedgerEntryId)
            : null
        };
        arSettlements.set(settlement.id, settlement);
        return include?.customer ? settlement : { ...settlement, customer: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...arSettlements.values()];
        if (where?.accountSetId) rows = rows.filter((settlement) => settlement.accountSetId === where.accountSetId);
        if (where?.status) rows = rows.filter((settlement) => settlement.status === where.status);
        if (where?.customerId) rows = rows.filter((settlement) => settlement.customerId === where.customerId);
        return rows.map((settlement) => (include?.customer ? settlement : { ...settlement, customer: undefined }));
      }
    },
    customerReceipt: {
      create: async ({ data, include }) => {
        const receipt = {
          ...data,
          customer: partners.get(data.customerId),
          counterpartyLedgerEntry: data.counterpartyLedgerEntryId
            ? counterpartyLedgerEntries.get(data.counterpartyLedgerEntryId)
            : null
        };
        customerReceipts.set(receipt.id, receipt);
        return include?.customer ? receipt : { ...receipt, customer: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...customerReceipts.values()];
        if (where?.accountSetId) rows = rows.filter((receipt) => receipt.accountSetId === where.accountSetId);
        if (where?.status) rows = rows.filter((receipt) => receipt.status === where.status);
        if (where?.customerId) rows = rows.filter((receipt) => receipt.customerId === where.customerId);
        return rows.map((receipt) => (include?.customer ? receipt : { ...receipt, customer: undefined }));
      }
    },
    collectionPlan: {
      create: async ({ data, include }) => {
        const plan = {
          ...data,
          customer: partners.get(data.customerId),
          counterpartyLedgerEntry: data.counterpartyLedgerEntryId
            ? counterpartyLedgerEntries.get(data.counterpartyLedgerEntryId)
            : null
        };
        collectionPlans.set(plan.id, plan);
        return include?.customer ? plan : { ...plan, customer: undefined };
      },
      findMany: async ({ where, include } = {}) => {
        let rows = [...collectionPlans.values()];
        if (where?.accountSetId) rows = rows.filter((plan) => plan.accountSetId === where.accountSetId);
        if (where?.status) rows = rows.filter((plan) => plan.status === where.status);
        if (where?.customerId) rows = rows.filter((plan) => plan.customerId === where.customerId);
        return rows.map((plan) => (include?.customer ? plan : { ...plan, customer: undefined }));
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
    },
    migrationJob: {
      create: async ({ data }) => {
        const job = { ...data };
        migrationJobs.set(job.id, job);
        return job;
      },
      update: async ({ where, data }) => {
        const job = { ...migrationJobs.get(where.id), ...data };
        migrationJobs.set(job.id, job);
        return job;
      },
      findUnique: async ({ where }) => migrationJobs.get(where.id) ?? null,
      findMany: async ({ where, orderBy } = {}) => {
        let rows = [...migrationJobs.values()];
        if (where?.accountSetId) {
          rows = rows.filter((job) => job.accountSetId === where.accountSetId);
        }
        if (where?.status) {
          rows = rows.filter((job) => job.status === where.status);
        }
        if (where?.jobType) {
          rows = rows.filter((job) => job.jobType === where.jobType);
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        return rows;
      }
    },
    backupJob: {
      create: async ({ data }) => {
        const job = { ...data };
        backupJobs.set(job.id, job);
        return job;
      },
      findMany: async ({ where, orderBy } = {}) => {
        let rows = [...backupJobs.values()];
        if (where?.accountSetId) {
          rows = rows.filter((job) => job.accountSetId === where.accountSetId);
        }
        if (where?.status) {
          rows = rows.filter((job) => job.status === where.status);
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        return rows;
      },
      findFirst: async ({ where }) =>
        [...backupJobs.values()].find((job) =>
          where.OR.some((condition) => job.id === condition.id || job.snapshotRef === condition.snapshotRef)
        ) ?? null
    },
    restoreJob: {
      create: async ({ data }) => {
        const job = { ...data };
        restoreJobs.set(job.id, job);
        return job;
      },
      findMany: async ({ where, orderBy } = {}) => {
        let rows = [...restoreJobs.values()];
        if (where?.accountSetId) {
          rows = rows.filter((job) => job.accountSetId === where.accountSetId);
        }
        if (where?.status) {
          rows = rows.filter((job) => job.status === where.status);
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        return rows;
      }
    },
    llmDraftRun: {
      create: async ({ data }) => {
        const run = { ...data };
        llmDraftRuns.set(run.id, run);
        return run;
      },
      findMany: async ({ where, orderBy } = {}) => {
        let rows = [...llmDraftRuns.values()];
        if (where?.accountSetId) {
          rows = rows.filter((run) => run.accountSetId === where.accountSetId);
        }
        if (where?.status) {
          rows = rows.filter((run) => run.status === where.status);
        }
        if (where?.draftType) {
          rows = rows.filter((run) => run.draftType === where.draftType);
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        return rows;
      }
    },
    agentDraftCandidate: {
      create: async ({ data, include }) => {
        const candidate = { ...data };
        agentDraftCandidates.set(candidate.id, candidate);
        return include?.llmDraftRun ? { ...candidate, llmDraftRun: llmDraftRuns.get(candidate.llmDraftRunId) ?? null } : candidate;
      },
      update: async ({ where, data, include }) => {
        const current = agentDraftCandidates.get(where.id);
        const candidate = { ...current, ...data };
        agentDraftCandidates.set(candidate.id, candidate);
        return include?.llmDraftRun ? { ...candidate, llmDraftRun: llmDraftRuns.get(candidate.llmDraftRunId) ?? null } : candidate;
      },
      findUnique: async ({ where, include }) => {
        const candidate = agentDraftCandidates.get(where.id);
        if (!candidate) return null;
        return include?.llmDraftRun ? { ...candidate, llmDraftRun: llmDraftRuns.get(candidate.llmDraftRunId) ?? null } : candidate;
      },
      findMany: async ({ where, include, orderBy } = {}) => {
        let rows = [...agentDraftCandidates.values()];
        if (where?.accountSetId) {
          rows = rows.filter((candidate) => candidate.accountSetId === where.accountSetId);
        }
        if (where?.status) {
          rows = rows.filter((candidate) => candidate.status === where.status);
        }
        if (where?.draftType) {
          rows = rows.filter((candidate) => candidate.draftType === where.draftType);
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        return include?.llmDraftRun
          ? rows.map((candidate) => ({ ...candidate, llmDraftRun: llmDraftRuns.get(candidate.llmDraftRunId) ?? null }))
          : rows;
      }
    },
    agentAction: {
      create: async ({ data }) => {
        const action = { ...data };
        agentActions.set(action.id, action);
        return action;
      },
      update: async ({ where, data }) => {
        const action = { ...agentActions.get(where.id), ...data };
        agentActions.set(action.id, action);
        return action;
      },
      findUnique: async ({ where, include }) => {
        const action = agentActions.get(where.id);
        if (!action) return null;
        const approvals = [...agentApprovals.values()].filter((approval) => approval.agentActionId === action.id);
        return include?.approvals ? { ...action, approvals } : action;
      },
      findMany: async ({ where, include, orderBy } = {}) => {
        let rows = [...agentActions.values()];
        if (where?.accountSetId) {
          rows = rows.filter((action) => action.accountSetId === where.accountSetId);
        }
        if (where?.status) {
          rows = rows.filter((action) => action.status === where.status);
        }
        if (where?.riskLevel) {
          rows = rows.filter((action) => action.riskLevel === where.riskLevel);
        }
        if (where?.toolName) {
          rows = rows.filter((action) => action.toolName === where.toolName);
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        if (!include?.approvals) return rows;
        return rows.map((action) => ({
          ...action,
          approvals: [...agentApprovals.values()].filter((approval) => approval.agentActionId === action.id)
        }));
      }
    },
    agentApproval: {
      create: async ({ data }) => {
        const approval = { ...data };
        agentApprovals.set(approval.id, approval);
        return approval;
      },
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const [id, approval] of agentApprovals.entries()) {
          if (approval.agentActionId === where.agentActionId) {
            agentApprovals.delete(id);
            count += 1;
          }
        }
        return { count };
      }
    },
    agentReplayEvent: {
      create: async ({ data }) => {
        const event = { ...data };
        agentReplayEvents.set(event.id, event);
        return event;
      },
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const [id, event] of agentReplayEvents.entries()) {
          if (event.agentActionId === where.agentActionId) {
            agentReplayEvents.delete(id);
            count += 1;
          }
        }
        return { count };
      },
      findMany: async ({ where, orderBy } = {}) => {
        let rows = [...agentReplayEvents.values()];
        if (where?.agentActionId) {
          rows = rows.filter((event) => event.agentActionId === where.agentActionId);
        }
        if (orderBy?.createdAt === "asc") {
          rows = rows.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
        }
        return rows;
      }
    },
    securityEvent: {
      create: async ({ data }) => {
        const event = { ...data };
        securityEvents.set(event.id, event);
        return event;
      },
      findMany: async ({ where, orderBy } = {}) => {
        let rows = [...securityEvents.values()];
        if (where?.accountSetId) {
          rows = rows.filter((event) => event.accountSetId === where.accountSetId);
        }
        if (where?.eventType) {
          rows = rows.filter((event) => event.eventType === where.eventType);
        }
        if (where?.severity) {
          rows = rows.filter((event) => event.severity === where.severity);
        }
        if (where?.actorId) {
          rows = rows.filter((event) => event.actorId === where.actorId);
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        return rows;
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

test("Prisma platform persistence can load user identity by user id for persisted tokens", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const role = await store.createRole({
    name: "Persisted Admin",
    description: "Reloads token permissions",
    permissionCodes: ["voucher.view", "account.create"]
  });
  const user = await store.createUser({
    username: "persisted-admin",
    name: "Persisted Admin",
    passwordHash: "sha256:salt:digest",
    roleId: role.id
  });
  const identity = await store.findUserIdentityById(user.id);

  assert.equal(identity.user.id, user.id);
  assert.equal(identity.user.username, "persisted-admin");
  assert.deepEqual(identity.permissionCodes, ["voucher.view", "account.create"]);
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

test("Prisma platform persistence stores Phase 2 partners by account set", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  const accountSet = await store.createAccountSet({
    id: "account-set:phase2-partners",
    code: "P2P",
    name: "Phase 2 Partners",
    companyName: "Phase 2 Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    status: "draft",
    createdBy: "system"
  });

  const supplier = await store.createPartner({
    id: "partner:supplier-1",
    accountSetId: accountSet.id,
    partnerType: "supplier",
    code: "S001",
    name: "North Supplier",
    taxRate: 0.13,
    creditLimit: 50000,
    paymentTerms: "NET30",
    settlementMethod: "bank_transfer",
    isEnabled: true
  });
  await store.createPartner({
    id: "partner:customer-1",
    accountSetId: accountSet.id,
    partnerType: "customer",
    code: "C001",
    name: "East Customer",
    taxRate: 0.06,
    creditLimit: 100000,
    paymentTerms: "NET15",
    settlementMethod: "bank_acceptance",
    isEnabled: true
  });
  const updated = await store.updatePartner({
    ...supplier,
    creditLimit: 65000,
    paymentTerms: "NET45",
    isEnabled: false
  });
  const suppliers = await store.listPartners(accountSet.id, "supplier");

  assert.equal(updated.creditLimit, 65000);
  assert.equal(updated.paymentTerms, "NET45");
  assert.equal(updated.isEnabled, false);
  assert.deepEqual(suppliers.map((partner) => partner.code), ["S001"]);
});

test("Prisma platform persistence stores Phase 3 inventory item master data", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  const accountSet = await store.createAccountSet({
    id: "account-set:phase3-inventory-items",
    code: "P3I",
    name: "Phase 3 Inventory Items",
    companyName: "Phase 3 Inventory Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    status: "draft",
    createdBy: "system"
  });

  const rawMaterial = await store.createInventoryItem({
    id: "inventory-item:rm-1",
    accountSetId: accountSet.id,
    code: "RM001",
    name: "Raw Material",
    category: "raw",
    itemType: "raw_material",
    unit: "kg",
    costMethod: "fifo",
    isBatchManaged: true,
    isSerialManaged: false,
    isManufactured: false,
    shelfLifeDays: 180,
    isEnabled: true,
    createdBy: "migration-user",
    createdAt: "now",
    updatedAt: "now"
  });
  await store.createInventoryItem({
    id: "inventory-item:fg-1",
    accountSetId: accountSet.id,
    code: "FG001",
    name: "Finished Good",
    category: "finished",
    itemType: "finished_good",
    unit: "pcs",
    costMethod: "moving_average",
    isBatchManaged: false,
    isSerialManaged: false,
    isManufactured: true,
    shelfLifeDays: null,
    isEnabled: true,
    createdBy: "migration-user",
    createdAt: "now",
    updatedAt: "now"
  });

  const listed = await store.listInventoryItems(accountSet.id);
  const found = await store.findInventoryItem(rawMaterial.id);

  assert.deepEqual(
    listed.map((item) => [item.code, item.name, item.unit, item.costMethod, item.isBatchManaged, item.isManufactured]),
    [
      ["FG001", "Finished Good", "pcs", "moving_average", false, true],
      ["RM001", "Raw Material", "kg", "fifo", true, false]
    ]
  );
  assert.equal(found.code, "RM001");
  assert.equal(found.shelfLifeDays, 180);
});

test("Prisma platform persistence stores Phase 2 purchase and sales orders", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  const accountSet = await store.createAccountSet({
    id: "account-set:phase2-orders",
    code: "P2O",
    name: "Phase 2 Orders",
    companyName: "Phase 2 Order Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    status: "draft",
    createdBy: "system"
  });
  const supplier = await store.createPartner({
    id: "partner:supplier-order",
    accountSetId: accountSet.id,
    partnerType: "supplier",
    code: "SUP-ORD",
    name: "Order Supplier",
    isEnabled: true
  });
  const customer = await store.createPartner({
    id: "partner:customer-order",
    accountSetId: accountSet.id,
    partnerType: "customer",
    code: "CUS-ORD",
    name: "Order Customer",
    isEnabled: true
  });

  const purchaseOrder = await store.createPurchaseOrder({
    id: "purchase-order:1",
    accountSetId: accountSet.id,
    supplierId: supplier.id,
    orderNo: "PO-202601-001",
    orderDate: "2026-01-12",
    totalAmount: 1130,
    status: "draft",
    currency: "CNY",
    exchangeRate: 1,
    createdBy: "system",
    lines: [{ lineNo: 1, itemCode: "MAT-001", itemName: "Material", quantity: 10, unitPrice: 100, taxRate: 0.13, taxAmount: 130, totalAmount: 1130 }]
  });
  const salesOrder = await store.createSalesOrder({
    id: "sales-order:1",
    accountSetId: accountSet.id,
    customerId: customer.id,
    orderNo: "SO-202601-001",
    orderDate: "2026-01-13",
    totalAmount: 6360,
    status: "draft",
    currency: "CNY",
    exchangeRate: 1,
    createdBy: "system",
    lines: [{ lineNo: 1, itemCode: "SKU-001", itemName: "Service", quantity: 2, unitPrice: 3000, taxRate: 0.06, taxAmount: 360, totalAmount: 6360 }]
  });
  const approvedPurchase = await store.updatePurchaseOrderStatus({ ...purchaseOrder, status: "approved", approvedBy: "manager" });
  const submittedSales = await store.updateSalesOrderStatus({ ...salesOrder, status: "submitted", submittedBy: "seller" });
  const purchaseOrders = await store.listPurchaseOrders(accountSet.id, "approved");
  const salesOrders = await store.listSalesOrders(accountSet.id, "submitted");

  assert.equal(approvedPurchase.status, "approved");
  assert.equal(submittedSales.status, "submitted");
  assert.deepEqual(purchaseOrders.map((order) => order.orderNo), ["PO-202601-001"]);
  assert.deepEqual(salesOrders.map((order) => order.orderNo), ["SO-202601-001"]);
});

test("Prisma platform persistence stores Phase 2 fulfillment source documents", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  const accountSet = await store.createAccountSet({
    id: "account-set:phase2-fulfillment",
    code: "P2F",
    name: "Phase 2 Fulfillment",
    companyName: "Phase 2 Fulfillment Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    status: "draft",
    createdBy: "system"
  });
  const supplier = await store.createPartner({
    id: "partner:fulfillment-supplier",
    accountSetId: accountSet.id,
    partnerType: "supplier",
    code: "SUP-FUL",
    name: "Fulfillment Supplier",
    isEnabled: true
  });
  const customer = await store.createPartner({
    id: "partner:fulfillment-customer",
    accountSetId: accountSet.id,
    partnerType: "customer",
    code: "CUS-FUL",
    name: "Fulfillment Customer",
    isEnabled: true
  });
  const purchaseOrder = await store.createPurchaseOrder({
    id: "purchase-order:fulfillment",
    accountSetId: accountSet.id,
    supplierId: supplier.id,
    orderNo: "PO-202602-001",
    orderDate: "2026-02-01",
    totalAmount: 1130,
    status: "approved",
    currency: "CNY",
    exchangeRate: 1,
    createdBy: "buyer",
    lines: [{ lineNo: 1, itemCode: "MAT-FUL", itemName: "Fulfillment Material", quantity: 10, unitPrice: 100, taxRate: 0.13, taxAmount: 130, totalAmount: 1130 }]
  });
  const salesOrder = await store.createSalesOrder({
    id: "sales-order:fulfillment",
    accountSetId: accountSet.id,
    customerId: customer.id,
    orderNo: "SO-202602-001",
    orderDate: "2026-02-02",
    totalAmount: 2120,
    status: "approved",
    currency: "CNY",
    exchangeRate: 1,
    createdBy: "seller",
    lines: [{ lineNo: 1, itemCode: "SKU-FUL", itemName: "Fulfillment SKU", quantity: 4, unitPrice: 500, taxRate: 0.06, taxAmount: 120, totalAmount: 2120 }]
  });

  const receipt = await store.createPurchaseReceipt({
    id: "purchase-receipt:1",
    accountSetId: accountSet.id,
    purchaseOrderId: purchaseOrder.id,
    supplierId: supplier.id,
    receiptNo: "PR-202602-001",
    receiptDate: "2026-02-03",
    status: "approved",
    totalQuantity: 6,
    createdBy: "warehouse",
    evidenceRefs: ["attachment:receipt-photo"],
    lines: [{ lineNo: 1, purchaseOrderLineId: "purchase-order-line:purchase-order:fulfillment:1", itemCode: "MAT-FUL", itemName: "Fulfillment Material", quantity: 6 }]
  });
  const delivery = await store.createSalesDelivery({
    id: "sales-delivery:1",
    accountSetId: accountSet.id,
    salesOrderId: salesOrder.id,
    customerId: customer.id,
    deliveryNo: "SD-202602-001",
    deliveryDate: "2026-02-04",
    status: "approved",
    totalQuantity: 3,
    createdBy: "warehouse",
    evidenceRefs: ["attachment:delivery-slip"],
    lines: [{ lineNo: 1, salesOrderLineId: "sales-order-line:sales-order:fulfillment:1", itemCode: "SKU-FUL", itemName: "Fulfillment SKU", quantity: 3 }]
  });
  const receipts = await store.listPurchaseReceipts(accountSet.id);
  const deliveries = await store.listSalesDeliveries(accountSet.id);

  assert.equal(receipt.purchaseOrderNo, "PO-202602-001");
  assert.deepEqual(receipt.evidenceRefs, ["attachment:receipt-photo"]);
  assert.equal(delivery.salesOrderNo, "SO-202602-001");
  assert.deepEqual(delivery.evidenceRefs, ["attachment:delivery-slip"]);
  assert.deepEqual(receipts.map((row) => row.receiptNo), ["PR-202602-001"]);
  assert.deepEqual(deliveries.map((row) => row.deliveryNo), ["SD-202602-001"]);
});

test("Prisma platform persistence stores Phase 2 AP and AR invoice confirmations", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  const accountSet = await store.createAccountSet({
    id: "account-set:phase2-invoices",
    code: "P2I",
    name: "Phase 2 Invoices",
    companyName: "Phase 2 Invoice Co.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    status: "draft",
    createdBy: "system"
  });
  const supplier = await store.createPartner({
    id: "partner:invoice-supplier",
    accountSetId: accountSet.id,
    partnerType: "supplier",
    code: "SUP-INV",
    name: "Invoice Supplier",
    isEnabled: true
  });
  const customer = await store.createPartner({
    id: "partner:invoice-customer",
    accountSetId: accountSet.id,
    partnerType: "customer",
    code: "CUS-INV",
    name: "Invoice Customer",
    isEnabled: true
  });
  const purchaseOrder = await store.createPurchaseOrder({
    id: "purchase-order:invoice",
    accountSetId: accountSet.id,
    supplierId: supplier.id,
    orderNo: "PO-202603-001",
    orderDate: "2026-03-01",
    totalAmount: 1130,
    status: "approved",
    currency: "CNY",
    exchangeRate: 1,
    createdBy: "buyer",
    lines: [{ lineNo: 1, itemCode: "MAT-INV", itemName: "Invoice Material", quantity: 10, unitPrice: 100, taxRate: 0.13, taxAmount: 130, totalAmount: 1130 }]
  });
  const salesOrder = await store.createSalesOrder({
    id: "sales-order:invoice",
    accountSetId: accountSet.id,
    customerId: customer.id,
    orderNo: "SO-202603-001",
    orderDate: "2026-03-02",
    totalAmount: 2120,
    status: "approved",
    currency: "CNY",
    exchangeRate: 1,
    createdBy: "seller",
    lines: [{ lineNo: 1, itemCode: "SKU-INV", itemName: "Invoice SKU", quantity: 4, unitPrice: 500, taxRate: 0.06, taxAmount: 120, totalAmount: 2120 }]
  });
  const receipt = await store.createPurchaseReceipt({
    id: "purchase-receipt:invoice",
    accountSetId: accountSet.id,
    purchaseOrderId: purchaseOrder.id,
    supplierId: supplier.id,
    receiptNo: "PR-202603-001",
    receiptDate: "2026-03-03",
    status: "approved",
    totalQuantity: 10,
    createdBy: "warehouse",
    evidenceRefs: [],
    lines: [{ lineNo: 1, purchaseOrderLineId: "purchase-order-line:purchase-order:invoice:1", itemCode: "MAT-INV", itemName: "Invoice Material", quantity: 10 }]
  });
  const delivery = await store.createSalesDelivery({
    id: "sales-delivery:invoice",
    accountSetId: accountSet.id,
    salesOrderId: salesOrder.id,
    customerId: customer.id,
    deliveryNo: "SD-202603-001",
    deliveryDate: "2026-03-04",
    status: "approved",
    totalQuantity: 4,
    createdBy: "warehouse",
    evidenceRefs: [],
    lines: [{ lineNo: 1, salesOrderLineId: "sales-order-line:sales-order:invoice:1", itemCode: "SKU-INV", itemName: "Invoice SKU", quantity: 4 }]
  });

  const purchaseInvoice = await store.createPurchaseInvoice({
    id: "purchase-invoice:1",
    accountSetId: accountSet.id,
    purchaseReceiptId: receipt.id,
    supplierId: supplier.id,
    invoiceNo: "PI-202603-001",
    externalInvoiceNo: "VAT-001",
    invoiceDate: "2026-03-05",
    dueDate: "2026-04-04",
    invoiceSource: "ocr",
    status: "confirmed",
    totalAmount: 1160,
    taxAmount: 130,
    payableAmount: 1160,
    estimatedDifference: 30,
    createdBy: "ap",
    evidenceRefs: ["attachment:vat-001"],
    lines: [{ lineNo: 1, purchaseOrderLineId: "purchase-order-line:purchase-order:invoice:1", itemCode: "MAT-INV", itemName: "Invoice Material", quantity: 10, unitPrice: 103, taxRate: 0.1262, taxAmount: 130, totalAmount: 1160 }]
  });
  const salesInvoice = await store.createSalesInvoice({
    id: "sales-invoice:1",
    accountSetId: accountSet.id,
    salesDeliveryId: delivery.id,
    customerId: customer.id,
    invoiceNo: "SI-202603-001",
    externalInvoiceNo: "OUT-001",
    invoiceDate: "2026-03-06",
    dueDate: "2026-03-21",
    invoiceSource: "import",
    status: "confirmed",
    totalAmount: 2120,
    taxAmount: 120,
    receivableAmount: 2120,
    createdBy: "ar",
    evidenceRefs: ["attachment:out-001"],
    lines: [{ lineNo: 1, salesOrderLineId: "sales-order-line:sales-order:invoice:1", itemCode: "SKU-INV", itemName: "Invoice SKU", quantity: 4, unitPrice: 500, taxRate: 0.06, taxAmount: 120, totalAmount: 2120 }]
  });
  await store.createCounterpartyLedgerEntry({
    id: "counterparty-ledger:ap:1",
    accountSetId: accountSet.id,
    partnerId: supplier.id,
    direction: "ap",
    sourceType: "purchase_invoice",
    sourceId: purchaseInvoice.id,
    sourceNo: purchaseInvoice.invoiceNo,
    documentDate: purchaseInvoice.invoiceDate,
    dueDate: purchaseInvoice.dueDate,
    originalAmount: purchaseInvoice.payableAmount,
    settledAmount: 0,
    remainingAmount: purchaseInvoice.payableAmount,
    status: "open",
    glAccountCode: "2202",
    auxiliaryType: "supplier",
    auxiliaryPartnerId: supplier.id,
    createdBy: "ap"
  });
  await store.createCounterpartyLedgerEntry({
    id: "counterparty-ledger:ar:1",
    accountSetId: accountSet.id,
    partnerId: customer.id,
    direction: "ar",
    sourceType: "sales_invoice",
    sourceId: salesInvoice.id,
    sourceNo: salesInvoice.invoiceNo,
    documentDate: salesInvoice.invoiceDate,
    dueDate: salesInvoice.dueDate,
    originalAmount: salesInvoice.receivableAmount,
    settledAmount: 0,
    remainingAmount: salesInvoice.receivableAmount,
    status: "open",
    glAccountCode: "1122",
    auxiliaryType: "customer",
    auxiliaryPartnerId: customer.id,
    createdBy: "ar"
  });
  const purchaseInvoices = await store.listPurchaseInvoices(accountSet.id);
  const salesInvoices = await store.listSalesInvoices(accountSet.id);
  const payableLedger = await store.listCounterpartyLedgerEntries(accountSet.id, { direction: "ap" });
  const receivableLedger = await store.listCounterpartyLedgerEntries(accountSet.id, { direction: "ar" });
  const blockedLedger = await store.updateCounterpartyLedgerPaymentBlock(payableLedger[0].id, {
    isPaymentBlocked: true,
    paymentBlockReason: "Invoice under review"
  });
  const paymentRequest = await store.createPaymentRequest({
    id: "payment-request:1",
    accountSetId: accountSet.id,
    counterpartyLedgerEntryId: payableLedger[0].id,
    supplierId: supplier.id,
    requestNo: "PAY-REQ-202603-001",
    requestDate: "2026-03-10",
    plannedPaymentDate: "2026-03-20",
    requestedAmount: 600,
    status: "pending_approval",
    requestedBy: "ap",
    paymentMethod: "bank_transfer",
    bankAccountCode: "1002",
    approvalComment: null,
    evidenceRefs: ["attachment:payment-request"]
  });
  const approvedRequest = await store.updatePaymentRequestStatus(paymentRequest.id, {
    status: "approved",
    approvedBy: "controller",
    approvalComment: "Approved"
  });
  const supplierPayment = await store.createSupplierPayment({
    id: "supplier-payment:1",
    accountSetId: accountSet.id,
    paymentRequestId: approvedRequest.id,
    counterpartyLedgerEntryId: payableLedger[0].id,
    supplierId: supplier.id,
    paymentNo: "PAY-202603-001",
    paymentDate: "2026-03-21",
    paidAmount: 600,
    status: "paid",
    paidBy: "cashier",
    paymentMethod: "bank_transfer",
    bankAccountCode: "1002",
    glVoucherId: null,
    evidenceRefs: ["attachment:bank-slip"]
  });
  const apSettlement = await store.createApSettlement({
    id: "ap-settlement:1",
    accountSetId: accountSet.id,
    supplierId: supplier.id,
    counterpartyLedgerEntryId: payableLedger[0].id,
    supplierPaymentId: supplierPayment.id,
    settlementNo: "AP-SET-202603-001",
    settlementDate: "2026-03-24",
    settlementType: "payment_to_bill",
    settledAmount: 600,
    differenceAmount: 10,
    differenceReason: "Bank fee difference",
    status: "settled",
    createdBy: "ap",
    evidenceRefs: ["attachment:settlement"]
  });
  const settledPayable = await store.updateCounterpartyLedgerSettlement(payableLedger[0].id, {
    settledAmount: 600,
    remainingAmount: 560,
    status: "partially_settled"
  });
  const collectionPlan = await store.createCollectionPlan({
    id: "collection-plan:1",
    accountSetId: accountSet.id,
    counterpartyLedgerEntryId: receivableLedger[0].id,
    customerId: customer.id,
    sourceNo: receivableLedger[0].sourceNo,
    plannedReceiptDate: "2026-03-21",
    plannedAmount: 2120,
    status: "planned",
    createdBy: "ar"
  });
  const customerReceipt = await store.createCustomerReceipt({
    id: "customer-receipt:1",
    accountSetId: accountSet.id,
    counterpartyLedgerEntryId: receivableLedger[0].id,
    customerId: customer.id,
    receiptNo: "REC-202603-001",
    receiptDate: "2026-03-22",
    receiptType: "receipt",
    receivedAmount: 1200,
    status: "received",
    receivedBy: "cashier",
    receiptMethod: "bank_transfer",
    bankAccountCode: "1002",
    glVoucherId: null,
    evidenceRefs: ["attachment:receipt-slip"]
  });
  const prepaymentReceipt = await store.createCustomerReceipt({
    id: "customer-receipt:prepayment",
    accountSetId: accountSet.id,
    counterpartyLedgerEntryId: null,
    customerId: customer.id,
    receiptNo: "REC-202603-002",
    receiptDate: "2026-03-23",
    receiptType: "prepayment",
    receivedAmount: 300,
    status: "received",
    receivedBy: "cashier",
    receiptMethod: "bank_transfer",
    bankAccountCode: "1002",
    glVoucherId: null,
    evidenceRefs: []
  });
  const arSettlement = await store.createArSettlement({
    id: "ar-settlement:1",
    accountSetId: accountSet.id,
    customerId: customer.id,
    counterpartyLedgerEntryId: receivableLedger[0].id,
    customerReceiptId: customerReceipt.id,
    nettingCounterpartyLedgerEntryId: null,
    settlementNo: "AR-SET-202603-001",
    settlementDate: "2026-03-24",
    settlementType: "receipt_to_bill",
    settledAmount: 1200,
    differenceAmount: 5,
    differenceReason: "Collection fee difference",
    status: "settled",
    createdBy: "ar",
    voucherDraft: {
      status: "draft",
      sourceModule: "order-to-cash",
      lines: [
        { accountCode: "1002", debit: 1200, credit: 0 },
        { accountCode: "1122", debit: 0, credit: 1200 }
      ]
    },
    evidenceRefs: ["attachment:ar-settlement"]
  });
  const settledReceivable = await store.updateCounterpartyLedgerSettlement(receivableLedger[0].id, {
    settledAmount: 1200,
    remainingAmount: 920,
    status: "partially_settled"
  });
  const paymentRequests = await store.listPaymentRequests(accountSet.id, { status: "approved" });
  const supplierPayments = await store.listSupplierPayments(accountSet.id, { supplierId: supplier.id });
  const apSettlements = await store.listApSettlements(accountSet.id, { supplierId: supplier.id });
  const collectionPlans = await store.listCollectionPlans(accountSet.id, { customerId: customer.id });
  const customerReceipts = await store.listCustomerReceipts(accountSet.id, { customerId: customer.id });
  const arSettlements = await store.listArSettlements(accountSet.id, { customerId: customer.id });

  assert.equal(purchaseInvoice.purchaseReceiptNo, "PR-202603-001");
  assert.equal(purchaseInvoice.payableAmount, 1160);
  assert.equal(purchaseInvoice.estimatedDifference, 30);
  assert.deepEqual(purchaseInvoice.evidenceRefs, ["attachment:vat-001"]);
  assert.equal(salesInvoice.salesDeliveryNo, "SD-202603-001");
  assert.equal(salesInvoice.receivableAmount, 2120);
  assert.deepEqual(salesInvoice.evidenceRefs, ["attachment:out-001"]);
  assert.deepEqual(purchaseInvoices.map((row) => row.invoiceNo), ["PI-202603-001"]);
  assert.deepEqual(salesInvoices.map((row) => row.invoiceNo), ["SI-202603-001"]);
  assert.deepEqual(payableLedger.map((row) => row.sourceNo), ["PI-202603-001"]);
  assert.equal(payableLedger[0].remainingAmount, 1160);
  assert.equal(payableLedger[0].glAccountCode, "2202");
  assert.equal(payableLedger[0].auxiliaryType, "supplier");
  assert.equal(payableLedger[0].auxiliaryPartnerId, supplier.id);
  assert.deepEqual(receivableLedger.map((row) => row.sourceNo), ["SI-202603-001"]);
  assert.equal(receivableLedger[0].remainingAmount, 2120);
  assert.equal(receivableLedger[0].glAccountCode, "1122");
  assert.equal(receivableLedger[0].auxiliaryType, "customer");
  assert.equal(receivableLedger[0].auxiliaryPartnerId, customer.id);
  assert.equal(blockedLedger.isPaymentBlocked, true);
  assert.equal(blockedLedger.paymentBlockReason, "Invoice under review");
  assert.equal(paymentRequest.requestNo, "PAY-REQ-202603-001");
  assert.equal(paymentRequest.requestedAmount, 600);
  assert.equal(approvedRequest.status, "approved");
  assert.equal(approvedRequest.approvedBy, "controller");
  assert.deepEqual(paymentRequests.map((row) => row.requestNo), ["PAY-REQ-202603-001"]);
  assert.equal(supplierPayment.paymentNo, "PAY-202603-001");
  assert.equal(supplierPayment.paidAmount, 600);
  assert.deepEqual(supplierPayments.map((row) => row.paymentNo), ["PAY-202603-001"]);
  assert.equal(apSettlement.settlementNo, "AP-SET-202603-001");
  assert.equal(apSettlement.sourceNo, "PI-202603-001");
  assert.equal(apSettlement.supplierPaymentNo, "PAY-202603-001");
  assert.equal(apSettlement.settledAmount, 600);
  assert.equal(apSettlement.differenceAmount, 10);
  assert.equal(settledPayable.remainingAmount, 560);
  assert.equal(settledPayable.status, "partially_settled");
  assert.deepEqual(apSettlements.map((row) => row.settlementNo), ["AP-SET-202603-001"]);
  assert.equal(collectionPlan.sourceNo, "SI-202603-001");
  assert.equal(collectionPlan.plannedAmount, 2120);
  assert.equal(collectionPlan.plannedReceiptDate, "2026-03-21");
  assert.equal(customerReceipt.sourceNo, "SI-202603-001");
  assert.equal(customerReceipt.receiptType, "receipt");
  assert.equal(customerReceipt.receivedAmount, 1200);
  assert.equal(prepaymentReceipt.counterpartyLedgerEntryId, null);
  assert.equal(prepaymentReceipt.receiptType, "prepayment");
  assert.deepEqual(collectionPlans.map((row) => row.sourceNo), ["SI-202603-001"]);
  assert.deepEqual(customerReceipts.map((row) => row.receiptNo), ["REC-202603-001", "REC-202603-002"]);
  assert.equal(arSettlement.settlementNo, "AR-SET-202603-001");
  assert.equal(arSettlement.sourceNo, "SI-202603-001");
  assert.equal(arSettlement.customerReceiptNo, "REC-202603-001");
  assert.equal(arSettlement.settledAmount, 1200);
  assert.equal(arSettlement.differenceAmount, 5);
  assert.equal(arSettlement.voucherDraft.status, "draft");
  assert.equal(arSettlement.voucherDraft.lines[1].accountCode, "1122");
  assert.equal(settledReceivable.remainingAmount, 920);
  assert.equal(settledReceivable.status, "partially_settled");
  assert.deepEqual(arSettlements.map((row) => row.settlementNo), ["AR-SET-202603-001"]);
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

test("Prisma platform persistence stores Phase 6 Ops backup and restore jobs", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const backup = await store.createBackupJob({
    id: "backup-job:ops:1",
    accountSetId: "account-set:ops",
    backupType: "full",
    status: "completed",
    dryRun: false,
    businessMutation: false,
    includeAttachments: true,
    retentionDays: 30,
    requestedBy: "ops-user",
    createdAt: "2026-06-12T01:00:00.000Z",
    completedAt: "2026-06-12T01:00:01.000Z",
    snapshotRef: "backup-snapshot:account-set:ops:1",
    checksum: "sha256:backup",
    manifest: {
      accountSetId: "account-set:ops",
      accountSetCode: "OPS",
      tableCounts: { vouchers: 2 }
    },
    attachmentHashVerification: {
      status: "completed",
      attachmentCount: 1,
      verifiedCount: 1,
      failedCount: 0
    }
  });
  const foundBackup = await store.findBackupJob("backup-snapshot:account-set:ops:1");
  const backups = await store.listBackupJobs("account-set:ops", { status: "completed" });
  const restore = await store.createRestoreJob({
    id: "restore-job:ops:1",
    accountSetId: "account-set:ops",
    sourceBackupJobId: backup.id,
    status: "dry_run_completed",
    dryRun: true,
    restoreMode: "silent_sandbox",
    targetEnvironment: "restore_drill",
    restorePointLabel: "phase6-drill",
    requestedBy: "ops-user",
    createdAt: "2026-06-12T01:05:00.000Z",
    completedAt: "2026-06-12T01:05:01.000Z",
    businessMutation: false,
    outboundBlocked: true,
    blockedChannels: ["webhook", "email", "bank_api"],
    impactScope: {
      accountSetId: "account-set:ops",
      sourceBackupJobId: backup.id,
      tableCounts: { vouchers: 2 }
    },
    validation: {
      status: "passed",
      backupChecksum: "sha256:backup"
    }
  });
  const restores = await store.listRestoreJobs("account-set:ops", { status: "dry_run_completed" });

  assert.equal(backup.checksum, "sha256:backup");
  assert.equal(foundBackup.id, backup.id);
  assert.equal(backups.length, 1);
  assert.equal(backups[0].manifest.tableCounts.vouchers, 2);
  assert.equal(restore.outboundBlocked, true);
  assert.deepEqual(restores[0].blockedChannels, ["webhook", "email", "bank_api"]);
  assert.equal(restores[0].impactScope.sourceBackupJobId, backup.id);
  assert.equal(restores[0].validation.status, "passed");
});

test("Prisma platform persistence stores Phase 6 migration jobs", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const job = await store.createMigrationJob({
    id: "migration-job:ops:1",
    accountSetId: "account-set:migration",
    jobType: "opening_balance",
    sourceType: "excel",
    targetObjectType: "opening_balance",
    status: "draft",
    dryRun: true,
    businessMutation: false,
    requestedBy: "migration-user",
    createdAt: "2026-06-12T00:30:00.000Z",
    completedAt: null,
    sourceSummary: { rowCount: 2, fieldCount: 3 },
    fieldMapping: { accountCode: "accountCode", debit: "debit", credit: "credit" },
    sourceRows: [
      { accountCode: "1002", debit: 500, credit: 0 },
      { accountCode: "3001", debit: 0, credit: 500 }
    ],
    validation: { status: "pending" },
    errorReport: { errors: [], warnings: [] },
    importSummary: null
  });
  const dryRun = await store.updateMigrationJob({
    ...job,
    status: "dry_run_completed",
    completedAt: "2026-06-12T00:31:00.000Z",
    validation: {
      status: "passed",
      trialBalance: { debit: 500, credit: 500, difference: 0 }
    },
    errorReport: { errors: [], warnings: [] }
  });
  const loaded = await store.findMigrationJob(job.id);
  const listed = await store.listMigrationJobs("account-set:migration", {
    status: "dry_run_completed",
    jobType: "opening_balance"
  });

  assert.equal(job.status, "draft");
  assert.equal(dryRun.validation.trialBalance.difference, 0);
  assert.equal(loaded.sourceRows.length, 2);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].fieldMapping.accountCode, "accountCode");
});

test("Prisma platform persistence stores Phase 6 Agent draft candidates and LLM runs", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const run = await store.createLlmDraftRun({
    id: "llm-draft-run:ops:1",
    accountSetId: "account-set:agent-draft",
    provider: "local-rule-based",
    model: "local-draft-rules-v1",
    status: "completed",
    inputSummary: {
      draftType: "voucher",
      sourceObjectType: "attachment",
      sourceObjectId: "attachment:1",
      ocrText: "office expense 880",
      evidenceRefs: ["attachment:1"]
    },
    outputSchema: "voucher",
    createdAt: "2026-06-12T02:00:00.000Z"
  });
  const candidate = await store.createAgentDraftCandidate({
    id: "agent-draft-candidate:ops:1",
    accountSetId: "account-set:agent-draft",
    fiscalPeriodId: "period:2026:6",
    draftType: "voucher",
    sourceObjectType: "attachment",
    sourceObjectId: "attachment:1",
    userInstruction: "Generate voucher from OCR evidence.",
    status: "candidate",
    dryRun: true,
    riskLevel: "medium",
    requiresHumanConfirmation: true,
    sourceContext: { sourceObjectType: "attachment" },
    matchedMasterData: [{ type: "account", code: "6602" }],
    unmatchedItems: [{ field: "counterparty", reason: "missing" }],
    draftPayload: { documentType: "voucher", lines: [] },
    ocrResults: [{ attachmentId: "attachment:1", extractedText: "office expense 880" }],
    dryRunResult: { status: "review_required", warnings: ["missing counterparty"] },
    warnings: ["needs review"],
    confidence: 0.68,
    evidenceRefs: ["attachment:1"],
    llmDraftRun: run,
    createdBy: "agent-user",
    createdAt: "2026-06-12T02:00:01.000Z"
  });
  const loaded = await store.findAgentDraftCandidate(candidate.id);
  const listedCandidates = await store.listAgentDraftCandidates("account-set:agent-draft", { status: "candidate" });
  const listedRuns = await store.listLlmDraftRuns("account-set:agent-draft", { draftType: "voucher", status: "completed" });
  const rejected = await store.updateAgentDraftCandidate({
    ...candidate,
    status: "rejected",
    rejectedBy: "reviewer",
    rejectedAt: "2026-06-12T02:05:00.000Z",
    rejectionReason: "Need clearer evidence."
  });

  assert.equal(run.inputSummary.ocrText, "office expense 880");
  assert.equal(candidate.llmDraftRun.id, run.id);
  assert.equal(loaded.draftPayload.documentType, "voucher");
  assert.equal(listedCandidates.length, 1);
  assert.equal(listedCandidates[0].ocrResults[0].attachmentId, "attachment:1");
  assert.equal(listedRuns.length, 1);
  assert.equal(listedRuns[0].inputSummary.draftType, "voucher");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectedBy, "reviewer");
});

test("Prisma platform persistence stores Phase 6 Agent action approvals and replay events", async () => {
  const store = createPlatformPersistence(createFakePrisma());
  const action = await store.createAgentAction({
    id: "agent-action:ops:1",
    accountSetId: "account-set:agent-action",
    toolName: "run_close_checklist",
    dryRun: true,
    riskLevel: "high",
    actionKind: "dry_run",
    status: "dry_run_completed",
    approvalRequired: true,
    approvalPolicy: {
      approvalRequired: true,
      requiresHumanConfirmation: true,
      minApprovals: 2,
      executeRequiresUserToken: true
    },
    evidenceRefs: ["period:2026-06"],
    evidenceSnapshots: [],
    payload: { fiscalYear: 2026, periodNo: 6 },
    requestedBy: "agent-user",
    createdAt: "2026-06-12T03:00:00.000Z",
    dryRunResult: { status: "ready_for_approval", businessMutation: false },
    approvalRequest: null,
    approvalHistory: [],
    approvalProgress: { approvedCount: 0, requiredCount: 2, remainingCount: 2 },
    executionResult: null,
    reversalResult: null
  });
  await store.replaceAgentReplayEvents(action.id, [
    {
      id: "agent-replay-event:1",
      agentActionId: action.id,
      eventType: "input_received",
      actorId: "agent-user",
      payload: { toolName: "run_close_checklist" },
      createdAt: "2026-06-12T03:00:00.000Z"
    },
    {
      id: "agent-replay-event:2",
      agentActionId: action.id,
      eventType: "dry_run_completed",
      actorId: "system",
      payload: { status: "ready_for_approval" },
      createdAt: "2026-06-12T03:00:01.000Z"
    }
  ]);
  const approvedAction = await store.updateAgentAction({
    ...action,
    status: "approved",
    approvalRequest: { submittedBy: "agent-user", submittedAt: "2026-06-12T03:01:00.000Z" },
    approvalHistory: [
      {
        id: "agent-approval:1",
        agentActionId: action.id,
        approvedBy: "controller",
        approvedAt: "2026-06-12T03:02:00.000Z",
        approvalComment: "first"
      },
      {
        id: "agent-approval:2",
        agentActionId: action.id,
        approvedBy: "cfo",
        approvedAt: "2026-06-12T03:03:00.000Z",
        approvalComment: "second"
      }
    ],
    approvalProgress: { approvedCount: 2, requiredCount: 2, remainingCount: 0 }
  });
  await store.replaceAgentReplayEvents(action.id, [
    ...(await store.listAgentReplayEvents(action.id)),
    {
      id: "agent-replay-event:3",
      agentActionId: action.id,
      eventType: "approved",
      actorId: "controller",
      payload: { approvedBy: "controller" },
      createdAt: "2026-06-12T03:02:00.000Z"
    }
  ]);
  const loaded = await store.findAgentAction(action.id);
  const listed = await store.listAgentActions("account-set:agent-action", { status: "approved" });
  const replay = await store.listAgentReplayEvents(action.id);

  assert.equal(action.status, "dry_run_completed");
  assert.equal(approvedAction.status, "approved");
  assert.equal(loaded.approvalHistory.length, 2);
  assert.deepEqual(loaded.approvalHistory.map((approval) => approval.approvedBy), ["controller", "cfo"]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].approvalProgress.remainingCount, 0);
  assert.deepEqual(replay.map((event) => event.eventType), ["input_received", "dry_run_completed", "approved"]);
  assert.equal(replay[0].payload.toolName, "run_close_checklist");
});

test("Prisma platform persistence stores Phase 6 security events", async () => {
  const store = createPlatformPersistence(createFakePrisma());

  const event = await store.createSecurityEvent({
    id: "security-event:phase6:1",
    accountSetId: "account-set:security",
    eventType: "permission_denied",
    severity: "high",
    actorId: "viewer",
    source: "api",
    objectType: "permission",
    objectId: "agent_action.create",
    message: "Actor viewer lacks agent_action.create.",
    payload: {
      method: "POST",
      path: "/agent-actions",
      permission: "agent_action.create"
    },
    createdAt: "2026-06-12T04:00:00.000Z"
  });
  await store.createSecurityEvent({
    id: "security-event:phase6:2",
    accountSetId: "account-set:other-security",
    eventType: "idempotency_scope_mismatch",
    severity: "medium",
    actorId: "system",
    source: "api",
    objectType: "idempotency_key",
    objectId: "shared-key",
    message: "Idempotency-Key reused across account sets.",
    payload: {
      cachedScope: "account-set:a",
      requestedScope: "account-set:b"
    },
    createdAt: "2026-06-12T04:05:00.000Z"
  });
  const listed = await store.listSecurityEvents("account-set:security", {
    eventType: "permission_denied",
    severity: "high",
    actorId: "viewer"
  });

  assert.equal(event.objectId, "agent_action.create");
  assert.equal(event.payload.permission, "agent_action.create");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, event.id);
  assert.equal(listed[0].payload.path, "/agent-actions");
});
