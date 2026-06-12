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

function inventoryItemToDto(item) {
  return {
    id: item.id,
    accountSetId: item.accountSetId,
    code: item.code,
    name: item.name,
    category: item.category ?? null,
    itemType: item.itemType,
    unit: item.unit,
    costMethod: item.costMethod,
    isBatchManaged: item.isBatchManaged,
    isSerialManaged: item.isSerialManaged,
    isManufactured: item.isManufactured,
    shelfLifeDays: item.shelfLifeDays ?? null,
    isEnabled: item.isEnabled,
    createdBy: item.createdBy
  };
}

function orderLineToDto(line) {
  return {
    id: line.id,
    lineNo: line.lineNo,
    itemCode: line.itemCode,
    itemName: line.itemName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmount,
    receivedQuantity: line.receivedQuantity ?? undefined,
    shippedQuantity: line.shippedQuantity ?? undefined,
    invoicedQuantity: line.invoicedQuantity
  };
}

function purchaseOrderToDto(order) {
  return {
    id: order.id,
    accountSetId: order.accountSetId,
    supplierId: order.supplierId,
    supplierName: order.supplier?.name ?? null,
    orderNo: order.orderNo,
    orderDate: dateOnly(order.orderDate),
    totalAmount: order.totalAmount,
    status: order.status,
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    createdBy: order.createdBy,
    submittedBy: order.submittedBy ?? null,
    approvedBy: order.approvedBy ?? null,
    closedBy: order.closedBy ?? null,
    lines: (order.lines ?? []).map(orderLineToDto).sort((left, right) => left.lineNo - right.lineNo)
  };
}

function salesOrderToDto(order) {
  return {
    id: order.id,
    accountSetId: order.accountSetId,
    customerId: order.customerId,
    customerName: order.customer?.name ?? null,
    orderNo: order.orderNo,
    orderDate: dateOnly(order.orderDate),
    totalAmount: order.totalAmount,
    status: order.status,
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    createdBy: order.createdBy,
    submittedBy: order.submittedBy ?? null,
    approvedBy: order.approvedBy ?? null,
    closedBy: order.closedBy ?? null,
    lines: (order.lines ?? []).map(orderLineToDto).sort((left, right) => left.lineNo - right.lineNo)
  };
}

function evidenceRefsFromJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function jsonFromString(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function backupJobToDto(job) {
  return {
    id: job.id,
    accountSetId: job.accountSetId,
    backupType: job.backupType,
    status: job.status,
    dryRun: job.dryRun,
    businessMutation: job.businessMutation,
    includeAttachments: job.includeAttachments,
    retentionDays: job.retentionDays ?? null,
    requestedBy: job.requestedBy,
    createdAt: dateOnly(job.createdAt),
    completedAt: dateOnly(job.completedAt),
    snapshotRef: job.snapshotRef,
    checksum: job.checksum,
    manifest: jsonFromString(job.manifestJson, {}),
    attachmentHashVerification: jsonFromString(job.attachmentHashVerificationJson, {})
  };
}

function restoreJobToDto(job) {
  return {
    id: job.id,
    accountSetId: job.accountSetId,
    sourceBackupJobId: job.sourceBackupJobId,
    status: job.status,
    dryRun: job.dryRun,
    restoreMode: job.restoreMode,
    targetEnvironment: job.targetEnvironment,
    restorePointLabel: job.restorePointLabel ?? null,
    requestedBy: job.requestedBy,
    createdAt: dateOnly(job.createdAt),
    completedAt: dateOnly(job.completedAt),
    businessMutation: job.businessMutation,
    outboundBlocked: job.outboundBlocked,
    blockedChannels: jsonFromString(job.blockedChannelsJson, []),
    impactScope: jsonFromString(job.impactScopeJson, {}),
    validation: jsonFromString(job.validationJson, {})
  };
}

function migrationJobToDto(job) {
  return {
    id: job.id,
    accountSetId: job.accountSetId,
    jobType: job.jobType,
    sourceType: job.sourceType,
    targetObjectType: job.targetObjectType,
    status: job.status,
    dryRun: job.dryRun,
    businessMutation: job.businessMutation,
    requestedBy: job.requestedBy,
    createdAt: dateOnly(job.createdAt),
    completedAt: dateOnly(job.completedAt),
    sourceSummary: jsonFromString(job.sourceSummaryJson, {}),
    fieldMapping: jsonFromString(job.fieldMappingJson, {}),
    sourceRows: jsonFromString(job.sourceRowsJson, []),
    validation: jsonFromString(job.validationJson, {}),
    errorReport: jsonFromString(job.errorReportJson, {}),
    importSummary: jsonFromString(job.importSummaryJson, null)
  };
}

function llmDraftRunToDto(run) {
  const inputSummary = jsonFromString(run.inputSummaryJson, run.inputSummary ?? {});
  return {
    id: run.id,
    accountSetId: run.accountSetId,
    provider: run.provider,
    model: run.model,
    status: run.status,
    inputSummary,
    outputSchema: run.outputSchema,
    errorMessage: run.errorMessage ?? null,
    createdAt: dateOnly(run.createdAt)
  };
}

function agentDraftCandidateToDto(candidate) {
  return {
    id: candidate.id,
    accountSetId: candidate.accountSetId,
    fiscalPeriodId: candidate.fiscalPeriodId ?? null,
    draftType: candidate.draftType,
    sourceObjectType: candidate.sourceObjectType ?? null,
    sourceObjectId: candidate.sourceObjectId ?? null,
    userInstruction: candidate.userInstruction,
    status: candidate.status,
    dryRun: candidate.dryRun,
    riskLevel: candidate.riskLevel,
    requiresHumanConfirmation: candidate.requiresHumanConfirmation,
    sourceContext: jsonFromString(candidate.sourceContextJson, {}),
    matchedMasterData: jsonFromString(candidate.matchedMasterDataJson, []),
    unmatchedItems: jsonFromString(candidate.unmatchedItemsJson, []),
    draftPayload: jsonFromString(candidate.draftPayloadJson, {}),
    ocrResults: jsonFromString(candidate.ocrResultsJson, []),
    dryRunResult: jsonFromString(candidate.dryRunResultJson, {}),
    warnings: jsonFromString(candidate.warningsJson, []),
    confidence: candidate.confidence,
    evidenceRefs: jsonFromString(candidate.evidenceRefsJson, []),
    llmDraftRun: candidate.llmDraftRun ? llmDraftRunToDto(candidate.llmDraftRun) : null,
    createdBy: candidate.createdBy,
    createdAt: dateOnly(candidate.createdAt),
    reviewedBy: candidate.reviewedBy ?? null,
    reviewedAt: dateOnly(candidate.reviewedAt),
    rejectedBy: candidate.rejectedBy ?? null,
    rejectedAt: dateOnly(candidate.rejectedAt),
    rejectionReason: candidate.rejectionReason ?? null,
    convertedObjectType: candidate.convertedObjectType ?? null,
    convertedObjectId: candidate.convertedObjectId ?? null,
    resolvedUnmatchedItems: jsonFromString(candidate.resolvedUnmatchedItemsJson, [])
  };
}

function agentApprovalToDto(approval) {
  return {
    id: approval.id,
    agentActionId: approval.agentActionId,
    approvedBy: approval.approvedBy,
    approvedAt: dateOnly(approval.approvedAt),
    approvalComment: approval.approvalComment ?? null
  };
}

function agentActionToDto(action) {
  const approvalHistory = (action.approvals ?? []).map(agentApprovalToDto).sort((left, right) => left.approvedAt.localeCompare(right.approvedAt) || left.id.localeCompare(right.id));
  return {
    id: action.id,
    accountSetId: action.accountSetId,
    toolName: action.toolName,
    dryRun: action.dryRun,
    riskLevel: action.riskLevel,
    actionKind: action.actionKind,
    status: action.status,
    approvalRequired: action.approvalRequired,
    approvalPolicy: jsonFromString(action.approvalPolicyJson, {}),
    evidenceRefs: jsonFromString(action.evidenceRefsJson, []),
    evidenceSnapshots: jsonFromString(action.evidenceSnapshotsJson, []),
    payload: jsonFromString(action.payloadJson, {}),
    requestedBy: action.requestedBy,
    createdAt: dateOnly(action.createdAt),
    dryRunResult: jsonFromString(action.dryRunResultJson, {}),
    approvalRequest: jsonFromString(action.approvalRequestJson, null),
    approvalHistory,
    approvalProgress: jsonFromString(action.approvalProgressJson, {}),
    executionResult: jsonFromString(action.executionResultJson, null),
    reversalResult: jsonFromString(action.reversalResultJson, null)
  };
}

function agentReplayEventToDto(event) {
  return {
    id: event.id,
    agentActionId: event.agentActionId,
    eventType: event.eventType,
    actorId: event.actorId,
    payload: jsonFromString(event.payloadJson, {}),
    createdAt: dateOnly(event.createdAt)
  };
}

function securityEventToDto(event) {
  return {
    id: event.id,
    accountSetId: event.accountSetId ?? null,
    eventType: event.eventType,
    severity: event.severity,
    actorId: event.actorId ?? null,
    source: event.source,
    objectType: event.objectType ?? null,
    objectId: event.objectId ?? null,
    message: event.message,
    payload: jsonFromString(event.payloadJson, {}),
    createdAt: dateOnly(event.createdAt)
  };
}

function fulfillmentLineToDto(line, sourceLineKey) {
  return {
    id: line.id,
    lineNo: line.lineNo,
    [sourceLineKey]: line[sourceLineKey],
    itemCode: line.itemCode,
    itemName: line.itemName,
    quantity: line.quantity
  };
}

function purchaseReceiptToDto(receipt) {
  return {
    id: receipt.id,
    accountSetId: receipt.accountSetId,
    purchaseOrderId: receipt.purchaseOrderId,
    purchaseOrderNo: receipt.purchaseOrder?.orderNo ?? null,
    supplierId: receipt.supplierId,
    supplierName: receipt.supplier?.name ?? null,
    receiptNo: receipt.receiptNo,
    receiptDate: dateOnly(receipt.receiptDate),
    status: receipt.status,
    totalQuantity: receipt.totalQuantity,
    createdBy: receipt.createdBy,
    evidenceRefs: evidenceRefsFromJson(receipt.evidenceRefsJson),
    lines: (receipt.lines ?? [])
      .map((line) => fulfillmentLineToDto(line, "purchaseOrderLineId"))
      .sort((left, right) => left.lineNo - right.lineNo)
  };
}

function salesDeliveryToDto(delivery) {
  return {
    id: delivery.id,
    accountSetId: delivery.accountSetId,
    salesOrderId: delivery.salesOrderId,
    salesOrderNo: delivery.salesOrder?.orderNo ?? null,
    customerId: delivery.customerId,
    customerName: delivery.customer?.name ?? null,
    deliveryNo: delivery.deliveryNo,
    deliveryDate: dateOnly(delivery.deliveryDate),
    status: delivery.status,
    totalQuantity: delivery.totalQuantity,
    createdBy: delivery.createdBy,
    evidenceRefs: evidenceRefsFromJson(delivery.evidenceRefsJson),
    lines: (delivery.lines ?? [])
      .map((line) => fulfillmentLineToDto(line, "salesOrderLineId"))
      .sort((left, right) => left.lineNo - right.lineNo)
  };
}

function invoiceLineToDto(line, sourceLineKey) {
  return {
    id: line.id,
    lineNo: line.lineNo,
    [sourceLineKey]: line[sourceLineKey],
    itemCode: line.itemCode,
    itemName: line.itemName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmount
  };
}

function purchaseInvoiceToDto(invoice) {
  return {
    id: invoice.id,
    accountSetId: invoice.accountSetId,
    purchaseReceiptId: invoice.purchaseReceiptId,
    purchaseReceiptNo: invoice.purchaseReceipt?.receiptNo ?? null,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplier?.name ?? null,
    invoiceNo: invoice.invoiceNo,
    externalInvoiceNo: invoice.externalInvoiceNo ?? null,
    invoiceDate: dateOnly(invoice.invoiceDate),
    dueDate: dateOnly(invoice.dueDate),
    invoiceSource: invoice.invoiceSource,
    status: invoice.status,
    totalAmount: invoice.totalAmount,
    taxAmount: invoice.taxAmount,
    payableAmount: invoice.payableAmount,
    paidAmount: invoice.paidAmount,
    settledAmount: invoice.settledAmount,
    estimatedDifference: invoice.estimatedDifference,
    glVoucherId: invoice.glVoucherId ?? null,
    createdBy: invoice.createdBy,
    evidenceRefs: evidenceRefsFromJson(invoice.evidenceRefsJson),
    lines: (invoice.lines ?? [])
      .map((line) => invoiceLineToDto(line, "purchaseOrderLineId"))
      .sort((left, right) => left.lineNo - right.lineNo)
  };
}

function salesInvoiceToDto(invoice) {
  return {
    id: invoice.id,
    accountSetId: invoice.accountSetId,
    salesDeliveryId: invoice.salesDeliveryId,
    salesDeliveryNo: invoice.salesDelivery?.deliveryNo ?? null,
    customerId: invoice.customerId,
    customerName: invoice.customer?.name ?? null,
    invoiceNo: invoice.invoiceNo,
    externalInvoiceNo: invoice.externalInvoiceNo ?? null,
    invoiceDate: dateOnly(invoice.invoiceDate),
    dueDate: dateOnly(invoice.dueDate),
    invoiceSource: invoice.invoiceSource,
    status: invoice.status,
    totalAmount: invoice.totalAmount,
    taxAmount: invoice.taxAmount,
    receivableAmount: invoice.receivableAmount,
    receivedAmount: invoice.receivedAmount,
    settledAmount: invoice.settledAmount,
    glVoucherId: invoice.glVoucherId ?? null,
    createdBy: invoice.createdBy,
    evidenceRefs: evidenceRefsFromJson(invoice.evidenceRefsJson),
    lines: (invoice.lines ?? [])
      .map((line) => invoiceLineToDto(line, "salesOrderLineId"))
      .sort((left, right) => left.lineNo - right.lineNo)
  };
}

function counterpartyLedgerEntryToDto(entry) {
  return {
    id: entry.id,
    accountSetId: entry.accountSetId,
    partnerId: entry.partnerId,
    partnerName: entry.partner?.name ?? null,
    direction: entry.direction,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    sourceNo: entry.sourceNo,
    documentDate: dateOnly(entry.documentDate),
    dueDate: dateOnly(entry.dueDate),
    originalAmount: entry.originalAmount,
    settledAmount: entry.settledAmount,
    remainingAmount: entry.remainingAmount,
    status: entry.status,
    glAccountCode: entry.glAccountCode,
    auxiliaryType: entry.auxiliaryType,
    auxiliaryPartnerId: entry.auxiliaryPartnerId,
    isPaymentBlocked: entry.isPaymentBlocked ?? false,
    paymentBlockReason: entry.paymentBlockReason ?? null,
    createdBy: entry.createdBy
  };
}

function paymentRequestToDto(request) {
  return {
    id: request.id,
    accountSetId: request.accountSetId,
    counterpartyLedgerEntryId: request.counterpartyLedgerEntryId,
    supplierId: request.supplierId,
    supplierName: request.supplier?.name ?? null,
    sourceNo: request.counterpartyLedgerEntry?.sourceNo ?? null,
    requestNo: request.requestNo,
    requestDate: dateOnly(request.requestDate),
    plannedPaymentDate: dateOnly(request.plannedPaymentDate),
    requestedAmount: request.requestedAmount,
    status: request.status,
    requestedBy: request.requestedBy,
    approvedBy: request.approvedBy ?? null,
    approvedAt: request.approvedAt?.toISOString?.() ?? request.approvedAt ?? null,
    approvalComment: request.approvalComment ?? null,
    paymentMethod: request.paymentMethod ?? null,
    bankAccountCode: request.bankAccountCode,
    evidenceRefs: evidenceRefsFromJson(request.evidenceRefsJson)
  };
}

function supplierPaymentToDto(payment) {
  return {
    id: payment.id,
    accountSetId: payment.accountSetId,
    paymentRequestId: payment.paymentRequestId,
    paymentRequestNo: payment.paymentRequest?.requestNo ?? null,
    counterpartyLedgerEntryId: payment.counterpartyLedgerEntryId,
    supplierId: payment.supplierId,
    supplierName: payment.supplier?.name ?? null,
    sourceNo: payment.counterpartyLedgerEntry?.sourceNo ?? null,
    paymentNo: payment.paymentNo,
    paymentDate: dateOnly(payment.paymentDate),
    paidAmount: payment.paidAmount,
    status: payment.status,
    paidBy: payment.paidBy,
    paymentMethod: payment.paymentMethod ?? null,
    bankAccountCode: payment.bankAccountCode,
    glVoucherId: payment.glVoucherId ?? null,
    evidenceRefs: evidenceRefsFromJson(payment.evidenceRefsJson)
  };
}

function apSettlementToDto(settlement) {
  return {
    id: settlement.id,
    accountSetId: settlement.accountSetId,
    supplierId: settlement.supplierId,
    supplierName: settlement.supplier?.name ?? null,
    counterpartyLedgerEntryId: settlement.counterpartyLedgerEntryId,
    sourceNo: settlement.counterpartyLedgerEntry?.sourceNo ?? null,
    supplierPaymentId: settlement.supplierPaymentId ?? null,
    supplierPaymentNo: settlement.supplierPayment?.paymentNo ?? null,
    settlementNo: settlement.settlementNo,
    settlementDate: dateOnly(settlement.settlementDate),
    settlementType: settlement.settlementType,
    settledAmount: settlement.settledAmount,
    differenceAmount: settlement.differenceAmount,
    differenceReason: settlement.differenceReason ?? null,
    status: settlement.status,
    createdBy: settlement.createdBy,
    evidenceRefs: evidenceRefsFromJson(settlement.evidenceRefsJson)
  };
}

function voucherDraftFromJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function arSettlementToDto(settlement) {
  return {
    id: settlement.id,
    accountSetId: settlement.accountSetId,
    customerId: settlement.customerId,
    customerName: settlement.customer?.name ?? null,
    counterpartyLedgerEntryId: settlement.counterpartyLedgerEntryId,
    sourceNo: settlement.counterpartyLedgerEntry?.sourceNo ?? null,
    customerReceiptId: settlement.customerReceiptId ?? null,
    customerReceiptNo: settlement.customerReceipt?.receiptNo ?? null,
    nettingCounterpartyLedgerEntryId: settlement.nettingCounterpartyLedgerEntryId ?? null,
    nettingSourceNo: settlement.nettingCounterpartyLedgerEntry?.sourceNo ?? null,
    settlementNo: settlement.settlementNo,
    settlementDate: dateOnly(settlement.settlementDate),
    settlementType: settlement.settlementType,
    settledAmount: settlement.settledAmount,
    differenceAmount: settlement.differenceAmount,
    differenceReason: settlement.differenceReason ?? null,
    voucherDraft: voucherDraftFromJson(settlement.voucherDraftJson),
    status: settlement.status,
    createdBy: settlement.createdBy,
    evidenceRefs: evidenceRefsFromJson(settlement.evidenceRefsJson)
  };
}

function customerReceiptToDto(receipt) {
  return {
    id: receipt.id,
    accountSetId: receipt.accountSetId,
    counterpartyLedgerEntryId: receipt.counterpartyLedgerEntryId ?? null,
    customerId: receipt.customerId,
    customerName: receipt.customer?.name ?? null,
    sourceNo: receipt.counterpartyLedgerEntry?.sourceNo ?? null,
    receiptNo: receipt.receiptNo,
    receiptDate: dateOnly(receipt.receiptDate),
    receiptType: receipt.receiptType,
    receivedAmount: receipt.receivedAmount,
    status: receipt.status,
    receivedBy: receipt.receivedBy,
    receiptMethod: receipt.receiptMethod ?? null,
    bankAccountCode: receipt.bankAccountCode,
    glVoucherId: receipt.glVoucherId ?? null,
    evidenceRefs: evidenceRefsFromJson(receipt.evidenceRefsJson)
  };
}

function collectionPlanToDto(plan) {
  return {
    id: plan.id,
    accountSetId: plan.accountSetId,
    counterpartyLedgerEntryId: plan.counterpartyLedgerEntryId ?? null,
    customerId: plan.customerId,
    customerName: plan.customer?.name ?? null,
    sourceNo: plan.sourceNo,
    plannedReceiptDate: dateOnly(plan.plannedReceiptDate),
    plannedAmount: plan.plannedAmount,
    status: plan.status,
    createdBy: plan.createdBy
  };
}

function counterpartyLedgerWhere(accountSetId, filters = {}) {
  return {
    ...(accountSetId ? { accountSetId } : {}),
    ...(filters.direction ? { direction: filters.direction } : {}),
    ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
    ...(filters.status ? { status: filters.status } : {})
  };
}

function paymentWorkflowWhere(accountSetId, filters = {}) {
  return {
    ...(accountSetId ? { accountSetId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {})
  };
}

function receiptWorkflowWhere(accountSetId, filters = {}) {
  return {
    ...(accountSetId ? { accountSetId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {})
  };
}

function settlementWorkflowWhere(accountSetId, filters = {}) {
  return {
    ...(accountSetId ? { accountSetId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {})
  };
}

function arSettlementWorkflowWhere(accountSetId, filters = {}) {
  return {
    ...(accountSetId ? { accountSetId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {})
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
    async ensureSystemAdministratorPermissions(permissionCodes, roleName = "系统管理员") {
      const permissionRecords = [];
      for (const code of permissionCodes) {
        const permission = await prisma.permission.upsert({
          where: { code },
          update: { description: code },
          create: { code, description: code }
        });
        permissionRecords.push(permission);
      }

      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { description: "Full system administrator role" },
        create: { name: roleName, description: "Full system administrator role" }
      });

      for (const permission of permissionRecords) {
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

      const updatedRole = await prisma.role.findUnique({
        where: { id: role.id },
        include: { rolePermissions: { include: { permission: true } } }
      });
      return roleToDto(updatedRole);
    },

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

    async findUserIdentityById(userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
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

    async createMigrationJob(job) {
      const created = await prisma.migrationJob.create({
        data: {
          id: job.id,
          accountSetId: job.accountSetId,
          jobType: job.jobType,
          sourceType: job.sourceType,
          targetObjectType: job.targetObjectType,
          status: job.status,
          dryRun: job.dryRun !== false,
          businessMutation: job.businessMutation === true,
          requestedBy: job.requestedBy,
          createdAt: dateTime(job.createdAt),
          completedAt: job.completedAt ? dateTime(job.completedAt) : null,
          sourceSummaryJson: JSON.stringify(job.sourceSummary ?? {}),
          fieldMappingJson: JSON.stringify(job.fieldMapping ?? {}),
          sourceRowsJson: JSON.stringify(job.sourceRows ?? []),
          validationJson: JSON.stringify(job.validation ?? {}),
          errorReportJson: JSON.stringify(job.errorReport ?? {}),
          importSummaryJson: job.importSummary ? JSON.stringify(job.importSummary) : null
        }
      });
      return migrationJobToDto(created);
    },

    async updateMigrationJob(job) {
      const updated = await prisma.migrationJob.update({
        where: { id: job.id },
        data: {
          jobType: job.jobType,
          sourceType: job.sourceType,
          targetObjectType: job.targetObjectType,
          status: job.status,
          dryRun: job.dryRun !== false,
          businessMutation: job.businessMutation === true,
          requestedBy: job.requestedBy,
          completedAt: job.completedAt ? dateTime(job.completedAt) : null,
          sourceSummaryJson: JSON.stringify(job.sourceSummary ?? {}),
          fieldMappingJson: JSON.stringify(job.fieldMapping ?? {}),
          sourceRowsJson: JSON.stringify(job.sourceRows ?? []),
          validationJson: JSON.stringify(job.validation ?? {}),
          errorReportJson: JSON.stringify(job.errorReport ?? {}),
          importSummaryJson: job.importSummary ? JSON.stringify(job.importSummary) : null
        }
      });
      return migrationJobToDto(updated);
    },

    async findMigrationJob(id) {
      const job = await prisma.migrationJob.findUnique({
        where: { id }
      });
      return job ? migrationJobToDto(job) : null;
    },

    async listMigrationJobs(accountSetId, filters = {}) {
      const jobs = await prisma.migrationJob.findMany({
        where: {
          ...(accountSetId ? { accountSetId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.jobType ? { jobType: filters.jobType } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return jobs.map(migrationJobToDto);
    },

    async createBackupJob(job) {
      const created = await prisma.backupJob.create({
        data: {
          id: job.id,
          accountSetId: job.accountSetId,
          backupType: job.backupType,
          status: job.status,
          dryRun: job.dryRun === true,
          businessMutation: job.businessMutation === true,
          includeAttachments: job.includeAttachments !== false,
          retentionDays: job.retentionDays ?? null,
          requestedBy: job.requestedBy,
          createdAt: dateTime(job.createdAt),
          completedAt: job.completedAt ? dateTime(job.completedAt) : null,
          snapshotRef: job.snapshotRef,
          checksum: job.checksum,
          manifestJson: JSON.stringify(job.manifest ?? {}),
          attachmentHashVerificationJson: JSON.stringify(job.attachmentHashVerification ?? {})
        }
      });
      return backupJobToDto(created);
    },

    async listBackupJobs(accountSetId, filters = {}) {
      const jobs = await prisma.backupJob.findMany({
        where: {
          ...(accountSetId ? { accountSetId } : {}),
          ...(filters.status ? { status: filters.status } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return jobs.map(backupJobToDto);
    },

    async findBackupJob(identifier) {
      const job = await prisma.backupJob.findFirst({
        where: {
          OR: [{ id: identifier }, { snapshotRef: identifier }]
        }
      });
      return job ? backupJobToDto(job) : null;
    },

    async createRestoreJob(job) {
      const created = await prisma.restoreJob.create({
        data: {
          id: job.id,
          accountSetId: job.accountSetId,
          sourceBackupJobId: job.sourceBackupJobId,
          status: job.status,
          dryRun: job.dryRun !== false,
          restoreMode: job.restoreMode,
          targetEnvironment: job.targetEnvironment,
          restorePointLabel: job.restorePointLabel ?? null,
          requestedBy: job.requestedBy,
          createdAt: dateTime(job.createdAt),
          completedAt: job.completedAt ? dateTime(job.completedAt) : null,
          businessMutation: job.businessMutation === true,
          outboundBlocked: job.outboundBlocked === true,
          blockedChannelsJson: JSON.stringify(job.blockedChannels ?? []),
          impactScopeJson: JSON.stringify(job.impactScope ?? {}),
          validationJson: JSON.stringify(job.validation ?? {})
        }
      });
      return restoreJobToDto(created);
    },

    async listRestoreJobs(accountSetId, filters = {}) {
      const jobs = await prisma.restoreJob.findMany({
        where: {
          ...(accountSetId ? { accountSetId } : {}),
          ...(filters.status ? { status: filters.status } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return jobs.map(restoreJobToDto);
    },

    async createLlmDraftRun(run) {
      const inputSummary = run.inputSummary ?? {};
      const created = await prisma.llmDraftRun.create({
        data: {
          id: run.id,
          accountSetId: run.accountSetId,
          provider: run.provider,
          model: run.model,
          status: run.status,
          draftType: inputSummary.draftType ?? run.draftType ?? run.outputSchema,
          sourceObjectType: inputSummary.sourceObjectType ?? run.sourceObjectType ?? null,
          sourceObjectId: inputSummary.sourceObjectId ?? run.sourceObjectId ?? null,
          inputSummaryJson: JSON.stringify(inputSummary),
          outputSchema: run.outputSchema,
          errorMessage: run.errorMessage ?? null,
          createdAt: dateTime(run.createdAt)
        }
      });
      return llmDraftRunToDto(created);
    },

    async listLlmDraftRuns(accountSetId, filters = {}) {
      const runs = await prisma.llmDraftRun.findMany({
        where: {
          ...(accountSetId ? { accountSetId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.draftType ? { draftType: filters.draftType } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return runs.map(llmDraftRunToDto);
    },

    async createAgentDraftCandidate(candidate) {
      const created = await prisma.agentDraftCandidate.create({
        data: {
          id: candidate.id,
          accountSetId: candidate.accountSetId,
          fiscalPeriodId: candidate.fiscalPeriodId ?? null,
          draftType: candidate.draftType,
          sourceObjectType: candidate.sourceObjectType ?? null,
          sourceObjectId: candidate.sourceObjectId ?? null,
          userInstruction: candidate.userInstruction,
          status: candidate.status,
          dryRun: candidate.dryRun !== false,
          riskLevel: candidate.riskLevel,
          requiresHumanConfirmation: candidate.requiresHumanConfirmation !== false,
          confidence: candidate.confidence ?? 0,
          sourceContextJson: JSON.stringify(candidate.sourceContext ?? {}),
          matchedMasterDataJson: JSON.stringify(candidate.matchedMasterData ?? []),
          unmatchedItemsJson: JSON.stringify(candidate.unmatchedItems ?? []),
          draftPayloadJson: JSON.stringify(candidate.draftPayload ?? {}),
          ocrResultsJson: JSON.stringify(candidate.ocrResults ?? []),
          dryRunResultJson: JSON.stringify(candidate.dryRunResult ?? {}),
          warningsJson: JSON.stringify(candidate.warnings ?? []),
          evidenceRefsJson: JSON.stringify(candidate.evidenceRefs ?? []),
          llmDraftRunId: candidate.llmDraftRun?.id ?? candidate.llmDraftRunId ?? null,
          createdBy: candidate.createdBy,
          createdAt: dateTime(candidate.createdAt),
          reviewedBy: candidate.reviewedBy ?? null,
          reviewedAt: candidate.reviewedAt ? dateTime(candidate.reviewedAt) : null,
          rejectedBy: candidate.rejectedBy ?? null,
          rejectedAt: candidate.rejectedAt ? dateTime(candidate.rejectedAt) : null,
          rejectionReason: candidate.rejectionReason ?? null,
          convertedObjectType: candidate.convertedObjectType ?? null,
          convertedObjectId: candidate.convertedObjectId ?? null,
          resolvedUnmatchedItemsJson: JSON.stringify(candidate.resolvedUnmatchedItems ?? [])
        },
        include: { llmDraftRun: true }
      });
      return agentDraftCandidateToDto(created);
    },

    async updateAgentDraftCandidate(candidate) {
      const updated = await prisma.agentDraftCandidate.update({
        where: { id: candidate.id },
        data: {
          status: candidate.status,
          confidence: candidate.confidence ?? 0,
          sourceContextJson: JSON.stringify(candidate.sourceContext ?? {}),
          matchedMasterDataJson: JSON.stringify(candidate.matchedMasterData ?? []),
          unmatchedItemsJson: JSON.stringify(candidate.unmatchedItems ?? []),
          draftPayloadJson: JSON.stringify(candidate.draftPayload ?? {}),
          ocrResultsJson: JSON.stringify(candidate.ocrResults ?? []),
          dryRunResultJson: JSON.stringify(candidate.dryRunResult ?? {}),
          warningsJson: JSON.stringify(candidate.warnings ?? []),
          evidenceRefsJson: JSON.stringify(candidate.evidenceRefs ?? []),
          reviewedBy: candidate.reviewedBy ?? null,
          reviewedAt: candidate.reviewedAt ? dateTime(candidate.reviewedAt) : null,
          rejectedBy: candidate.rejectedBy ?? null,
          rejectedAt: candidate.rejectedAt ? dateTime(candidate.rejectedAt) : null,
          rejectionReason: candidate.rejectionReason ?? null,
          convertedObjectType: candidate.convertedObjectType ?? null,
          convertedObjectId: candidate.convertedObjectId ?? null,
          resolvedUnmatchedItemsJson: JSON.stringify(candidate.resolvedUnmatchedItems ?? [])
        },
        include: { llmDraftRun: true }
      });
      return agentDraftCandidateToDto(updated);
    },

    async findAgentDraftCandidate(id) {
      const candidate = await prisma.agentDraftCandidate.findUnique({
        where: { id },
        include: { llmDraftRun: true }
      });
      return candidate ? agentDraftCandidateToDto(candidate) : null;
    },

    async listAgentDraftCandidates(accountSetId, filters = {}) {
      const candidates = await prisma.agentDraftCandidate.findMany({
        where: {
          ...(accountSetId ? { accountSetId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.draftType ? { draftType: filters.draftType } : {})
        },
        include: { llmDraftRun: true },
        orderBy: { createdAt: "desc" }
      });
      return candidates.map(agentDraftCandidateToDto);
    },

    async createAgentAction(action) {
      await prisma.agentAction.create({
        data: {
          id: action.id,
          accountSetId: action.accountSetId,
          toolName: action.toolName,
          dryRun: action.dryRun !== false,
          riskLevel: action.riskLevel,
          actionKind: action.actionKind,
          status: action.status,
          approvalRequired: action.approvalRequired === true,
          approvalPolicyJson: JSON.stringify(action.approvalPolicy ?? {}),
          evidenceRefsJson: JSON.stringify(action.evidenceRefs ?? []),
          evidenceSnapshotsJson: JSON.stringify(action.evidenceSnapshots ?? []),
          payloadJson: JSON.stringify(action.payload ?? {}),
          requestedBy: action.requestedBy,
          createdAt: dateTime(action.createdAt),
          dryRunResultJson: JSON.stringify(action.dryRunResult ?? {}),
          approvalRequestJson: action.approvalRequest ? JSON.stringify(action.approvalRequest) : null,
          approvalProgressJson: JSON.stringify(action.approvalProgress ?? {}),
          executionResultJson: action.executionResult ? JSON.stringify(action.executionResult) : null,
          reversalResultJson: action.reversalResult ? JSON.stringify(action.reversalResult) : null
        }
      });
      for (const approval of action.approvalHistory ?? []) {
        await prisma.agentApproval.create({
          data: {
            id: approval.id,
            agentActionId: action.id,
            approvedBy: approval.approvedBy,
            approvedAt: dateTime(approval.approvedAt),
            approvalComment: approval.approvalComment ?? null
          }
        });
      }
      return this.findAgentAction(action.id);
    },

    async updateAgentAction(action) {
      await prisma.agentAction.update({
        where: { id: action.id },
        data: {
          toolName: action.toolName,
          dryRun: action.dryRun !== false,
          riskLevel: action.riskLevel,
          actionKind: action.actionKind,
          status: action.status,
          approvalRequired: action.approvalRequired === true,
          approvalPolicyJson: JSON.stringify(action.approvalPolicy ?? {}),
          evidenceRefsJson: JSON.stringify(action.evidenceRefs ?? []),
          evidenceSnapshotsJson: JSON.stringify(action.evidenceSnapshots ?? []),
          payloadJson: JSON.stringify(action.payload ?? {}),
          dryRunResultJson: JSON.stringify(action.dryRunResult ?? {}),
          approvalRequestJson: action.approvalRequest ? JSON.stringify(action.approvalRequest) : null,
          approvalProgressJson: JSON.stringify(action.approvalProgress ?? {}),
          executionResultJson: action.executionResult ? JSON.stringify(action.executionResult) : null,
          reversalResultJson: action.reversalResult ? JSON.stringify(action.reversalResult) : null
        }
      });
      await prisma.agentApproval.deleteMany({ where: { agentActionId: action.id } });
      for (const approval of action.approvalHistory ?? []) {
        await prisma.agentApproval.create({
          data: {
            id: approval.id,
            agentActionId: action.id,
            approvedBy: approval.approvedBy,
            approvedAt: dateTime(approval.approvedAt),
            approvalComment: approval.approvalComment ?? null
          }
        });
      }
      return this.findAgentAction(action.id);
    },

    async findAgentAction(id) {
      const action = await prisma.agentAction.findUnique({
        where: { id },
        include: { approvals: true }
      });
      return action ? agentActionToDto(action) : null;
    },

    async listAgentActions(accountSetId, filters = {}) {
      const actions = await prisma.agentAction.findMany({
        where: {
          ...(accountSetId ? { accountSetId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.riskLevel ? { riskLevel: filters.riskLevel } : {}),
          ...(filters.toolName ? { toolName: filters.toolName } : {})
        },
        include: { approvals: true },
        orderBy: { createdAt: "desc" }
      });
      return actions.map(agentActionToDto);
    },

    async replaceAgentReplayEvents(agentActionId, events) {
      await prisma.agentReplayEvent.deleteMany({ where: { agentActionId } });
      for (const event of events) {
        await prisma.agentReplayEvent.create({
          data: {
            id: event.id,
            agentActionId,
            eventType: event.eventType,
            actorId: event.actorId,
            payloadJson: JSON.stringify(event.payload ?? {}),
            createdAt: dateTime(event.createdAt)
          }
        });
      }
      return this.listAgentReplayEvents(agentActionId);
    },

    async listAgentReplayEvents(agentActionId) {
      const events = await prisma.agentReplayEvent.findMany({
        where: { agentActionId },
        orderBy: { createdAt: "asc" }
      });
      return events.map(agentReplayEventToDto);
    },

    async createSecurityEvent(event) {
      const created = await prisma.securityEvent.create({
        data: {
          id: event.id,
          accountSetId: event.accountSetId ?? null,
          eventType: event.eventType,
          severity: event.severity,
          actorId: event.actorId ?? null,
          source: event.source,
          objectType: event.objectType ?? null,
          objectId: event.objectId ?? null,
          message: event.message,
          payloadJson: JSON.stringify(event.payload ?? {}),
          createdAt: dateTime(event.createdAt)
        }
      });
      return securityEventToDto(created);
    },

    async listSecurityEvents(accountSetId, filters = {}) {
      const events = await prisma.securityEvent.findMany({
        where: {
          ...(accountSetId ? { accountSetId } : {}),
          ...(filters.eventType ? { eventType: filters.eventType } : {}),
          ...(filters.severity ? { severity: filters.severity } : {}),
          ...(filters.actorId ? { actorId: filters.actorId } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return events.map(securityEventToDto);
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

    async createInventoryItem(item) {
      const created = await prisma.inventoryItem.create({
        data: {
          id: item.id,
          accountSetId: item.accountSetId,
          code: item.code,
          name: item.name,
          category: item.category ?? null,
          itemType: item.itemType ?? "raw_material",
          unit: item.unit,
          costMethod: item.costMethod,
          isBatchManaged: item.isBatchManaged ?? false,
          isSerialManaged: item.isSerialManaged ?? false,
          isManufactured: item.isManufactured ?? false,
          shelfLifeDays: item.shelfLifeDays ?? null,
          isEnabled: item.isEnabled ?? true,
          createdBy: item.createdBy ?? "system"
        }
      });
      return inventoryItemToDto(created);
    },

    async listInventoryItems(accountSetId) {
      const items = await prisma.inventoryItem.findMany({
        where: accountSetId ? { accountSetId } : undefined
      });
      return items.map(inventoryItemToDto).sort((left, right) => left.code.localeCompare(right.code));
    },

    async findInventoryItem(identifier) {
      const item = await prisma.inventoryItem.findFirst({
        where: {
          OR: [{ id: identifier }, { code: identifier }]
        }
      });
      return item ? inventoryItemToDto(item) : null;
    },

    async createPurchaseOrder(order) {
      const saved = await prisma.purchaseOrder.create({
        data: {
          id: order.id,
          accountSetId: order.accountSetId,
          supplierId: order.supplierId,
          orderNo: order.orderNo,
          orderDate: dateTime(order.orderDate),
          totalAmount: order.totalAmount,
          status: order.status,
          currency: order.currency ?? "CNY",
          exchangeRate: order.exchangeRate ?? 1,
          createdBy: order.createdBy,
          lines: {
            create: order.lines.map((line) => ({
              id: `purchase-order-line:${order.id}:${line.lineNo}`,
              lineNo: line.lineNo,
              itemCode: line.itemCode,
              itemName: line.itemName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              totalAmount: line.totalAmount,
              receivedQuantity: line.receivedQuantity ?? 0,
              invoicedQuantity: line.invoicedQuantity ?? 0
            }))
          }
        },
        include: { supplier: true, lines: true }
      });
      return purchaseOrderToDto(saved);
    },

    async listPurchaseOrders(accountSetId, status = null) {
      const orders = await prisma.purchaseOrder.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { supplier: true, lines: true }
      });
      return orders
        .map(purchaseOrderToDto)
        .filter((order) => !status || order.status === status)
        .sort((left, right) => left.orderNo.localeCompare(right.orderNo));
    },

    async findPurchaseOrder(identifier) {
      const order = await prisma.purchaseOrder.findFirst({
        where: { OR: [{ id: identifier }, { orderNo: identifier }] },
        include: { supplier: true, lines: true }
      });
      return order ? purchaseOrderToDto(order) : null;
    },

    async updatePurchaseOrderStatus(order) {
      for (const line of order.lines ?? []) {
        await prisma.purchaseOrderLine.updateMany({
          where: { purchaseOrderId: order.id, lineNo: line.lineNo },
          data: {
            receivedQuantity: line.receivedQuantity ?? 0,
            invoicedQuantity: line.invoicedQuantity ?? 0
          }
        });
      }
      const saved = await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: order.status,
          submittedBy: order.submittedBy ?? null,
          approvedBy: order.approvedBy ?? null,
          closedBy: order.closedBy ?? null
        },
        include: { supplier: true, lines: true }
      });
      return purchaseOrderToDto(saved);
    },

    async createSalesOrder(order) {
      const saved = await prisma.salesOrder.create({
        data: {
          id: order.id,
          accountSetId: order.accountSetId,
          customerId: order.customerId,
          orderNo: order.orderNo,
          orderDate: dateTime(order.orderDate),
          totalAmount: order.totalAmount,
          status: order.status,
          currency: order.currency ?? "CNY",
          exchangeRate: order.exchangeRate ?? 1,
          createdBy: order.createdBy,
          lines: {
            create: order.lines.map((line) => ({
              id: `sales-order-line:${order.id}:${line.lineNo}`,
              lineNo: line.lineNo,
              itemCode: line.itemCode,
              itemName: line.itemName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              totalAmount: line.totalAmount,
              shippedQuantity: line.shippedQuantity ?? 0,
              invoicedQuantity: line.invoicedQuantity ?? 0
            }))
          }
        },
        include: { customer: true, lines: true }
      });
      return salesOrderToDto(saved);
    },

    async listSalesOrders(accountSetId, status = null) {
      const orders = await prisma.salesOrder.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { customer: true, lines: true }
      });
      return orders
        .map(salesOrderToDto)
        .filter((order) => !status || order.status === status)
        .sort((left, right) => left.orderNo.localeCompare(right.orderNo));
    },

    async findSalesOrder(identifier) {
      const order = await prisma.salesOrder.findFirst({
        where: { OR: [{ id: identifier }, { orderNo: identifier }] },
        include: { customer: true, lines: true }
      });
      return order ? salesOrderToDto(order) : null;
    },

    async updateSalesOrderStatus(order) {
      for (const line of order.lines ?? []) {
        await prisma.salesOrderLine.updateMany({
          where: { salesOrderId: order.id, lineNo: line.lineNo },
          data: {
            shippedQuantity: line.shippedQuantity ?? 0,
            invoicedQuantity: line.invoicedQuantity ?? 0
          }
        });
      }
      const saved = await prisma.salesOrder.update({
        where: { id: order.id },
        data: {
          status: order.status,
          submittedBy: order.submittedBy ?? null,
          approvedBy: order.approvedBy ?? null,
          closedBy: order.closedBy ?? null
        },
        include: { customer: true, lines: true }
      });
      return salesOrderToDto(saved);
    },

    async createPurchaseReceipt(receipt) {
      const saved = await prisma.purchaseReceipt.create({
        data: {
          id: receipt.id,
          accountSetId: receipt.accountSetId,
          purchaseOrderId: receipt.purchaseOrderId,
          supplierId: receipt.supplierId,
          receiptNo: receipt.receiptNo,
          receiptDate: dateTime(receipt.receiptDate),
          status: receipt.status ?? "approved",
          totalQuantity: receipt.totalQuantity,
          createdBy: receipt.createdBy,
          evidenceRefsJson: JSON.stringify(receipt.evidenceRefs ?? []),
          lines: {
            create: receipt.lines.map((line) => ({
              id: `purchase-receipt-line:${receipt.id}:${line.lineNo}`,
              purchaseOrderLineId: line.purchaseOrderLineId,
              lineNo: line.lineNo,
              itemCode: line.itemCode,
              itemName: line.itemName,
              quantity: line.quantity
            }))
          }
        },
        include: { supplier: true, purchaseOrder: true, lines: true }
      });
      return purchaseReceiptToDto(saved);
    },

    async listPurchaseReceipts(accountSetId) {
      const receipts = await prisma.purchaseReceipt.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { supplier: true, purchaseOrder: true, lines: true }
      });
      return receipts.map(purchaseReceiptToDto).sort((left, right) => left.receiptNo.localeCompare(right.receiptNo));
    },

    async createSalesDelivery(delivery) {
      const saved = await prisma.salesDelivery.create({
        data: {
          id: delivery.id,
          accountSetId: delivery.accountSetId,
          salesOrderId: delivery.salesOrderId,
          customerId: delivery.customerId,
          deliveryNo: delivery.deliveryNo,
          deliveryDate: dateTime(delivery.deliveryDate),
          status: delivery.status ?? "approved",
          totalQuantity: delivery.totalQuantity,
          createdBy: delivery.createdBy,
          evidenceRefsJson: JSON.stringify(delivery.evidenceRefs ?? []),
          lines: {
            create: delivery.lines.map((line) => ({
              id: `sales-delivery-line:${delivery.id}:${line.lineNo}`,
              salesOrderLineId: line.salesOrderLineId,
              lineNo: line.lineNo,
              itemCode: line.itemCode,
              itemName: line.itemName,
              quantity: line.quantity
            }))
          }
        },
        include: { customer: true, salesOrder: true, lines: true }
      });
      return salesDeliveryToDto(saved);
    },

    async listSalesDeliveries(accountSetId) {
      const deliveries = await prisma.salesDelivery.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { customer: true, salesOrder: true, lines: true }
      });
      return deliveries.map(salesDeliveryToDto).sort((left, right) => left.deliveryNo.localeCompare(right.deliveryNo));
    },

    async createPurchaseInvoice(invoice) {
      const saved = await prisma.purchaseInvoice.create({
        data: {
          id: invoice.id,
          accountSetId: invoice.accountSetId,
          purchaseReceiptId: invoice.purchaseReceiptId,
          supplierId: invoice.supplierId,
          invoiceNo: invoice.invoiceNo,
          externalInvoiceNo: invoice.externalInvoiceNo ?? null,
          invoiceDate: dateTime(invoice.invoiceDate),
          dueDate: invoice.dueDate ? dateTime(invoice.dueDate) : null,
          invoiceSource: invoice.invoiceSource ?? "manual",
          status: invoice.status ?? "confirmed",
          totalAmount: invoice.totalAmount,
          taxAmount: invoice.taxAmount,
          payableAmount: invoice.payableAmount,
          paidAmount: invoice.paidAmount ?? 0,
          settledAmount: invoice.settledAmount ?? 0,
          estimatedDifference: invoice.estimatedDifference ?? 0,
          glVoucherId: invoice.glVoucherId ?? null,
          createdBy: invoice.createdBy,
          evidenceRefsJson: JSON.stringify(invoice.evidenceRefs ?? []),
          lines: {
            create: invoice.lines.map((line) => ({
              id: `purchase-invoice-line:${invoice.id}:${line.lineNo}`,
              purchaseOrderLineId: line.purchaseOrderLineId,
              lineNo: line.lineNo,
              itemCode: line.itemCode,
              itemName: line.itemName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              totalAmount: line.totalAmount
            }))
          }
        },
        include: { supplier: true, purchaseReceipt: true, lines: true }
      });
      return purchaseInvoiceToDto(saved);
    },

    async listPurchaseInvoices(accountSetId) {
      const invoices = await prisma.purchaseInvoice.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { supplier: true, purchaseReceipt: true, lines: true }
      });
      return invoices.map(purchaseInvoiceToDto).sort((left, right) => left.invoiceNo.localeCompare(right.invoiceNo));
    },

    async createSalesInvoice(invoice) {
      const saved = await prisma.salesInvoice.create({
        data: {
          id: invoice.id,
          accountSetId: invoice.accountSetId,
          salesDeliveryId: invoice.salesDeliveryId,
          customerId: invoice.customerId,
          invoiceNo: invoice.invoiceNo,
          externalInvoiceNo: invoice.externalInvoiceNo ?? null,
          invoiceDate: dateTime(invoice.invoiceDate),
          dueDate: invoice.dueDate ? dateTime(invoice.dueDate) : null,
          invoiceSource: invoice.invoiceSource ?? "manual",
          status: invoice.status ?? "confirmed",
          totalAmount: invoice.totalAmount,
          taxAmount: invoice.taxAmount,
          receivableAmount: invoice.receivableAmount,
          receivedAmount: invoice.receivedAmount ?? 0,
          settledAmount: invoice.settledAmount ?? 0,
          glVoucherId: invoice.glVoucherId ?? null,
          createdBy: invoice.createdBy,
          evidenceRefsJson: JSON.stringify(invoice.evidenceRefs ?? []),
          lines: {
            create: invoice.lines.map((line) => ({
              id: `sales-invoice-line:${invoice.id}:${line.lineNo}`,
              salesOrderLineId: line.salesOrderLineId,
              lineNo: line.lineNo,
              itemCode: line.itemCode,
              itemName: line.itemName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              totalAmount: line.totalAmount
            }))
          }
        },
        include: { customer: true, salesDelivery: true, lines: true }
      });
      return salesInvoiceToDto(saved);
    },

    async listSalesInvoices(accountSetId) {
      const invoices = await prisma.salesInvoice.findMany({
        where: accountSetId ? { accountSetId } : undefined,
        include: { customer: true, salesDelivery: true, lines: true }
      });
      return invoices.map(salesInvoiceToDto).sort((left, right) => left.invoiceNo.localeCompare(right.invoiceNo));
    },

    async createCounterpartyLedgerEntry(entry) {
      const saved = await prisma.counterpartyLedgerEntry.create({
        data: {
          id: entry.id,
          accountSetId: entry.accountSetId,
          partnerId: entry.partnerId,
          direction: entry.direction,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          sourceNo: entry.sourceNo,
          documentDate: dateTime(entry.documentDate),
          dueDate: entry.dueDate ? dateTime(entry.dueDate) : null,
          originalAmount: entry.originalAmount,
          settledAmount: entry.settledAmount ?? 0,
          remainingAmount: entry.remainingAmount,
          status: entry.status ?? "open",
          glAccountCode: entry.glAccountCode,
          auxiliaryType: entry.auxiliaryType,
          auxiliaryPartnerId: entry.auxiliaryPartnerId,
          isPaymentBlocked: entry.isPaymentBlocked ?? false,
          paymentBlockReason: entry.paymentBlockReason ?? null,
          createdBy: entry.createdBy
        },
        include: { partner: true }
      });
      return counterpartyLedgerEntryToDto(saved);
    },

    async listCounterpartyLedgerEntries(accountSetId, filters = {}) {
      const entries = await prisma.counterpartyLedgerEntry.findMany({
        where: counterpartyLedgerWhere(accountSetId, filters),
        include: { partner: true }
      });
      return entries
        .map(counterpartyLedgerEntryToDto)
        .sort((left, right) => left.documentDate.localeCompare(right.documentDate) || left.sourceNo.localeCompare(right.sourceNo));
    },

    async updateCounterpartyLedgerPaymentBlock(entryId, { isPaymentBlocked, paymentBlockReason }) {
      const saved = await prisma.counterpartyLedgerEntry.update({
        where: { id: entryId },
        data: {
          isPaymentBlocked: Boolean(isPaymentBlocked),
          paymentBlockReason: isPaymentBlocked ? paymentBlockReason ?? null : null
        },
        include: { partner: true }
      });
      return counterpartyLedgerEntryToDto(saved);
    },

    async createPaymentRequest(request) {
      const saved = await prisma.paymentRequest.create({
        data: {
          id: request.id,
          accountSetId: request.accountSetId,
          counterpartyLedgerEntryId: request.counterpartyLedgerEntryId,
          supplierId: request.supplierId,
          requestNo: request.requestNo,
          requestDate: dateTime(request.requestDate),
          plannedPaymentDate: request.plannedPaymentDate ? dateTime(request.plannedPaymentDate) : null,
          requestedAmount: request.requestedAmount,
          status: request.status ?? "pending_approval",
          requestedBy: request.requestedBy,
          approvedBy: request.approvedBy ?? null,
          approvedAt: request.approvedAt ? dateTime(request.approvedAt) : null,
          approvalComment: request.approvalComment ?? null,
          paymentMethod: request.paymentMethod ?? null,
          bankAccountCode: request.bankAccountCode,
          evidenceRefsJson: JSON.stringify(request.evidenceRefs ?? [])
        },
        include: { supplier: true, counterpartyLedgerEntry: true }
      });
      return paymentRequestToDto(saved);
    },

    async listPaymentRequests(accountSetId, filters = {}) {
      const requests = await prisma.paymentRequest.findMany({
        where: paymentWorkflowWhere(accountSetId, filters),
        include: { supplier: true, counterpartyLedgerEntry: true }
      });
      return requests.map(paymentRequestToDto).sort((left, right) => left.requestNo.localeCompare(right.requestNo));
    },

    async updatePaymentRequestStatus(requestId, updates) {
      const saved = await prisma.paymentRequest.update({
        where: { id: requestId },
        data: {
          status: updates.status,
          approvedBy: updates.approvedBy ?? null,
          approvedAt: updates.approvedAt ? dateTime(updates.approvedAt) : new Date(),
          approvalComment: updates.approvalComment ?? null
        },
        include: { supplier: true, counterpartyLedgerEntry: true }
      });
      return paymentRequestToDto(saved);
    },

    async createSupplierPayment(payment) {
      const saved = await prisma.supplierPayment.create({
        data: {
          id: payment.id,
          accountSetId: payment.accountSetId,
          paymentRequestId: payment.paymentRequestId,
          counterpartyLedgerEntryId: payment.counterpartyLedgerEntryId,
          supplierId: payment.supplierId,
          paymentNo: payment.paymentNo,
          paymentDate: dateTime(payment.paymentDate),
          paidAmount: payment.paidAmount,
          status: payment.status ?? "paid",
          paidBy: payment.paidBy,
          paymentMethod: payment.paymentMethod ?? null,
          bankAccountCode: payment.bankAccountCode,
          glVoucherId: payment.glVoucherId ?? null,
          evidenceRefsJson: JSON.stringify(payment.evidenceRefs ?? [])
        },
        include: { supplier: true, paymentRequest: true, counterpartyLedgerEntry: true }
      });
      return supplierPaymentToDto(saved);
    },

    async listSupplierPayments(accountSetId, filters = {}) {
      const payments = await prisma.supplierPayment.findMany({
        where: paymentWorkflowWhere(accountSetId, filters),
        include: { supplier: true, paymentRequest: true, counterpartyLedgerEntry: true }
      });
      return payments.map(supplierPaymentToDto).sort((left, right) => left.paymentNo.localeCompare(right.paymentNo));
    },

    async createApSettlement(settlement) {
      const saved = await prisma.apSettlement.create({
        data: {
          id: settlement.id,
          accountSetId: settlement.accountSetId,
          supplierId: settlement.supplierId,
          counterpartyLedgerEntryId: settlement.counterpartyLedgerEntryId,
          supplierPaymentId: settlement.supplierPaymentId ?? null,
          settlementNo: settlement.settlementNo,
          settlementDate: dateTime(settlement.settlementDate),
          settlementType: settlement.settlementType,
          settledAmount: settlement.settledAmount,
          differenceAmount: settlement.differenceAmount ?? 0,
          differenceReason: settlement.differenceReason ?? null,
          status: settlement.status ?? "settled",
          createdBy: settlement.createdBy,
          evidenceRefsJson: JSON.stringify(settlement.evidenceRefs ?? [])
        },
        include: { supplier: true, supplierPayment: true, counterpartyLedgerEntry: true }
      });
      return apSettlementToDto(saved);
    },

    async listApSettlements(accountSetId, filters = {}) {
      const settlements = await prisma.apSettlement.findMany({
        where: settlementWorkflowWhere(accountSetId, filters),
        include: { supplier: true, supplierPayment: true, counterpartyLedgerEntry: true }
      });
      return settlements.map(apSettlementToDto).sort((left, right) => left.settlementNo.localeCompare(right.settlementNo));
    },

    async createArSettlement(settlement) {
      const saved = await prisma.arSettlement.create({
        data: {
          id: settlement.id,
          accountSetId: settlement.accountSetId,
          customerId: settlement.customerId,
          counterpartyLedgerEntryId: settlement.counterpartyLedgerEntryId,
          customerReceiptId: settlement.customerReceiptId ?? null,
          nettingCounterpartyLedgerEntryId: settlement.nettingCounterpartyLedgerEntryId ?? null,
          settlementNo: settlement.settlementNo,
          settlementDate: dateTime(settlement.settlementDate),
          settlementType: settlement.settlementType,
          settledAmount: settlement.settledAmount,
          differenceAmount: settlement.differenceAmount ?? 0,
          differenceReason: settlement.differenceReason ?? null,
          voucherDraftJson: settlement.voucherDraft ? JSON.stringify(settlement.voucherDraft) : null,
          status: settlement.status ?? "settled",
          createdBy: settlement.createdBy,
          evidenceRefsJson: JSON.stringify(settlement.evidenceRefs ?? [])
        },
        include: {
          customer: true,
          customerReceipt: true,
          counterpartyLedgerEntry: true,
          nettingCounterpartyLedgerEntry: true
        }
      });
      return arSettlementToDto(saved);
    },

    async listArSettlements(accountSetId, filters = {}) {
      const settlements = await prisma.arSettlement.findMany({
        where: arSettlementWorkflowWhere(accountSetId, filters),
        include: {
          customer: true,
          customerReceipt: true,
          counterpartyLedgerEntry: true,
          nettingCounterpartyLedgerEntry: true
        }
      });
      return settlements.map(arSettlementToDto).sort((left, right) => left.settlementNo.localeCompare(right.settlementNo));
    },

    async updateCounterpartyLedgerSettlement(entryId, updates) {
      const saved = await prisma.counterpartyLedgerEntry.update({
        where: { id: entryId },
        data: {
          settledAmount: updates.settledAmount,
          remainingAmount: updates.remainingAmount,
          status: updates.status
        },
        include: { partner: true }
      });
      return counterpartyLedgerEntryToDto(saved);
    },

    async createCustomerReceipt(receipt) {
      const saved = await prisma.customerReceipt.create({
        data: {
          id: receipt.id,
          accountSetId: receipt.accountSetId,
          counterpartyLedgerEntryId: receipt.counterpartyLedgerEntryId ?? null,
          customerId: receipt.customerId,
          receiptNo: receipt.receiptNo,
          receiptDate: dateTime(receipt.receiptDate),
          receiptType: receipt.receiptType ?? "receipt",
          receivedAmount: receipt.receivedAmount,
          status: receipt.status ?? "received",
          receivedBy: receipt.receivedBy,
          receiptMethod: receipt.receiptMethod ?? null,
          bankAccountCode: receipt.bankAccountCode,
          glVoucherId: receipt.glVoucherId ?? null,
          evidenceRefsJson: JSON.stringify(receipt.evidenceRefs ?? [])
        },
        include: { customer: true, counterpartyLedgerEntry: true }
      });
      return customerReceiptToDto(saved);
    },

    async listCustomerReceipts(accountSetId, filters = {}) {
      const receipts = await prisma.customerReceipt.findMany({
        where: receiptWorkflowWhere(accountSetId, filters),
        include: { customer: true, counterpartyLedgerEntry: true }
      });
      return receipts.map(customerReceiptToDto).sort((left, right) => left.receiptNo.localeCompare(right.receiptNo));
    },

    async createCollectionPlan(plan) {
      const saved = await prisma.collectionPlan.create({
        data: {
          id: plan.id,
          accountSetId: plan.accountSetId,
          counterpartyLedgerEntryId: plan.counterpartyLedgerEntryId ?? null,
          customerId: plan.customerId,
          sourceNo: plan.sourceNo,
          plannedReceiptDate: dateTime(plan.plannedReceiptDate),
          plannedAmount: plan.plannedAmount,
          status: plan.status ?? "planned",
          createdBy: plan.createdBy
        },
        include: { customer: true, counterpartyLedgerEntry: true }
      });
      return collectionPlanToDto(saved);
    },

    async listCollectionPlans(accountSetId, filters = {}) {
      const plans = await prisma.collectionPlan.findMany({
        where: receiptWorkflowWhere(accountSetId, filters),
        include: { customer: true, counterpartyLedgerEntry: true }
      });
      return plans
        .map(collectionPlanToDto)
        .sort((left, right) => left.plannedReceiptDate.localeCompare(right.plannedReceiptDate) || left.sourceNo.localeCompare(right.sourceNo));
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
