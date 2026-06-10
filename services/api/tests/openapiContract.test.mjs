import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contract = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8");

function blockAfter(marker) {
  const start = contract.indexOf(marker);
  assert.notEqual(start, -1, `${marker} must exist in the OpenAPI contract.`);
  const nextPath = contract.indexOf("\n  /", start + marker.length);
  return contract.slice(start, nextPath === -1 ? contract.length : nextPath);
}

test("Phase 1 write endpoints require idempotency and risk metadata", () => {
  const writePaths = [
    "/account-sets:",
    "/account-sets/{accountSetId}:",
    "/account-sets/{accountSetId}/enable:",
    "/account-sets/{accountSetId}/disable:",
    "/account-sets/{accountSetId}/periods/generate:",
    "/periods/{periodId}/open:",
    "/periods/{periodId}/close:",
    "/periods/{periodId}/lock:",
    "/periods/{periodId}/set-current:",
    "/account-code-rules:",
    "/roles:",
    "/users:",
    "/account-sets/{accountSetId}/users:",
    "/partners:",
    "/partners/{partnerId}:",
    "/purchase-orders:",
    "/purchase-orders/{purchaseOrderId}/submit:",
    "/purchase-orders/{purchaseOrderId}/approve:",
    "/purchase-orders/{purchaseOrderId}/close:",
    "/purchase-receipts:",
    "/purchase-invoices:",
    "/sales-orders:",
    "/sales-orders/{salesOrderId}/submit:",
    "/sales-orders/{salesOrderId}/approve:",
    "/sales-orders/{salesOrderId}/close:",
    "/sales-deliveries:",
    "/sales-invoices:",
    "/payment-requests:",
    "/payment-requests/{paymentRequestId}/approve:",
    "/supplier-payments:",
    "/counterparty-ledger/{counterpartyLedgerEntryId}/block-payment:",
    "/accounts:",
    "/accounts/{accountId}:",
    "/accounts/import:",
    "/accounts/{accountId}/disable:",
    "/accounts/{accountId}/enable:",
    "/auxiliary-types:",
    "/auxiliary-items:",
    "/accounts/{accountId}/auxiliary-requirements:",
    "/opening-balances:",
    "/vouchers:",
    "/vouchers/{voucherId}:",
    "/vouchers/{voucherId}/submit:",
    "/vouchers/{voucherId}/approve:",
    "/vouchers/{voucherId}/post:",
    "/vouchers/{voucherId}/copy:",
    "/posting/post-voucher/{voucherId}:",
    "/posting/post-batch:",
    "/posting/period-end/transfer-pl:",
    "/attachments/upload:",
    "/attachment-links:",
    "/attachments/{attachmentId}:",
    "/bank/statements:",
    "/bank/reconcile:",
    "/bank/reconcile/auto:",
    "/ledger/bank-statements/import:",
    "/ledger/bank-reconciliations:",
    "/ledger/bank-reconciliations/{reconciliationId}/match:",
    "/close/profit-loss-carry-forward:",
    "/ai/voucher-suggestions:",
    "/ai/voucher-drafts:",
    "/ai/voucher-drafts/{aiSuggestionId}/convert-to-voucher:"
  ];

  for (const path of writePaths) {
    const pathBlock = blockAfter(`  ${path}`);
    assert.match(pathBlock, /Idempotency-Key|IdempotencyKey/, `${path} must require Idempotency-Key.`);
    assert.match(pathBlock, /x-permission:/, `${path} must declare x-permission.`);
    assert.match(pathBlock, /x-risk-level:/, `${path} must declare x-risk-level.`);
    assert.match(pathBlock, /x-agent-allowed:/, `${path} must declare x-agent-allowed.`);
  }
});

test("Phase 1 contract exposes schemas needed by backend, frontend, and Agent tools", () => {
  const requiredSchemas = [
    "AccountSet:",
    "AuthUser:",
    "Permission:",
    "Role:",
    "AccountSetUserGrant:",
    "Partner:",
    "PurchaseOrder:",
    "SalesOrder:",
    "PurchaseReceipt:",
    "SalesDelivery:",
    "PurchaseInvoice:",
    "SalesInvoice:",
    "CounterpartyLedgerEntry:",
    "PaymentRequest:",
    "SupplierPayment:",
    "AccountingPeriod:",
    "Account:",
    "AccountCodeRule:",
    "AuxiliaryType:",
    "AuxiliaryItem:",
    "AccountAuxiliaryRequirement:",
    "OpeningBalance:",
    "OpeningTrialBalance:",
    "Voucher:",
    "VoucherLine:",
    "VoucherStatusLog:",
    "DeploymentConfig:",
    "Attachment:",
    "AttachmentLink:",
    "JournalEntry:",
    "GeneralLedger:",
    "AccountPeriodBalance:",
    "TrialBalance:",
    "AiVoucherSuggestion:",
    "AgentAction:",
    "AuditLog:",
    "ErrorResponse:"
  ];

  for (const schema of requiredSchemas) {
    assert.match(contract, new RegExp(`^    ${schema}`, "m"), `${schema} schema must exist.`);
  }
});

test("Phase 2 counterparty ledger endpoint is documented for AP and AR auxiliary mappings", () => {
  const block = blockAfter("  /counterparty-ledger:");

  assert.match(block, /x-permission: counterparty_ledger\.view/);
  assert.match(block, /direction/);
  assert.match(block, /CounterpartyLedgerEntry/);
  assert.match(contract, /glAccountCode:/, "Counterparty ledger schema must expose the mapped GL account.");
  assert.match(contract, /auxiliaryPartnerId:/, "Counterparty ledger schema must expose the mapped auxiliary partner.");
});

test("Phase 2 payment workflow endpoints are documented with freeze control", () => {
  const requestsBlock = blockAfter("  /payment-requests:");
  const approveBlock = blockAfter("  /payment-requests/{paymentRequestId}/approve:");
  const paymentsBlock = blockAfter("  /supplier-payments:");
  const blockPaymentBlock = blockAfter("  /counterparty-ledger/{counterpartyLedgerEntryId}/block-payment:");

  assert.match(requestsBlock, /x-permission: payment_request\.manage/);
  assert.match(requestsBlock, /PaymentRequest/);
  assert.match(approveBlock, /x-permission: payment_request\.manage/);
  assert.match(paymentsBlock, /x-permission: supplier_payment\.manage/);
  assert.match(paymentsBlock, /SupplierPayment/);
  assert.match(blockPaymentBlock, /x-permission: payment_block\.manage/);
  assert.match(blockPaymentBlock, /paymentBlockReason/);
});

test("deployment configuration check endpoint is documented", () => {
  const block = blockAfter("  /deployment/config:");

  assert.match(block, /summary: Inspect deployment configuration/);
  assert.match(block, /x-permission: account_set.view/);
  assert.match(block, /DeploymentConfig/);
});

test("account-set user grants are documented for scoped authorization", () => {
  const accountSetBlock = blockAfter("  /account-sets/{accountSetId}:");
  const grantBlock = blockAfter("  /account-sets/{accountSetId}/users:");

  assert.match(accountSetBlock, /get:/);
  assert.match(accountSetBlock, /patch:/);
  assert.match(accountSetBlock, /UpdateAccountSetRequest/);
  assert.match(accountSetBlock, /AccountSet/);
  assert.match(accountSetBlock, /x-permission: account_set.manage/);
  assert.match(grantBlock, /GrantAccountSetUserRequest/);
  assert.match(grantBlock, /AccountSetUserGrant/);
  assert.match(grantBlock, /x-permission: account_set_user.manage/);
});

test("auxiliary and opening balance endpoints document initialization contracts", () => {
  const accountSetPeriodsBlock = blockAfter("  /account-sets/{accountSetId}/periods:");
  const auxiliaryTypesBlock = blockAfter("  /auxiliary-types:");
  const auxiliaryItemsBlock = blockAfter("  /auxiliary-items:");
  const auxiliaryItemBlock = blockAfter("  /auxiliary-items/{auxiliaryItemId}:");
  const requirementsBlock = blockAfter("  /accounts/{accountId}/auxiliary-requirements:");
  const openingBalancesBlock = blockAfter("  /opening-balances:");
  const openingTrialBlock = blockAfter("  /opening-balances/trial-balance:");

  assert.match(accountSetPeriodsBlock, /AccountingPeriod/);
  assert.match(accountSetPeriodsBlock, /x-permission: period.view/);
  assert.match(auxiliaryTypesBlock, /CreateAuxiliaryTypeRequest/);
  assert.match(auxiliaryTypesBlock, /AuxiliaryType/);
  assert.match(auxiliaryItemsBlock, /CreateAuxiliaryItemRequest/);
  assert.match(auxiliaryItemsBlock, /AuxiliaryItem/);
  assert.match(auxiliaryItemBlock, /patch:/);
  assert.match(auxiliaryItemBlock, /delete:/);
  assert.match(auxiliaryItemBlock, /AuxiliaryItem/);
  assert.match(requirementsBlock, /SaveAccountAuxiliaryRequirementRequest/);
  assert.match(requirementsBlock, /AccountAuxiliaryRequirement/);
  assert.match(openingBalancesBlock, /SaveOpeningBalanceRequest/);
  assert.match(openingBalancesBlock, /OpeningBalance/);
  assert.match(openingTrialBlock, /OpeningTrialBalance/);
});

test("RBAC endpoints document permission, role, and user management contracts", () => {
  const permissionsBlock = blockAfter("  /permissions:");
  const rolesBlock = blockAfter("  /roles:");
  const roleBlock = blockAfter("  /roles/{roleId}:");
  const usersBlock = blockAfter("  /users:");
  const userBlock = blockAfter("  /users/{userId}:");

  assert.match(permissionsBlock, /Permission/, "Permissions endpoint must return permission codes.");
  assert.match(rolesBlock, /CreateRoleRequest/, "Roles endpoint must accept role creation.");
  assert.match(rolesBlock, /Role/, "Roles endpoint must return roles.");
  assert.match(roleBlock, /UpdateRoleRequest/, "Role detail endpoint must accept role updates.");
  assert.match(roleBlock, /Role/, "Role detail endpoint must return the updated role.");
  assert.match(usersBlock, /CreateUserRequest/, "Users endpoint must accept user creation.");
  assert.match(usersBlock, /AuthUser/, "Users endpoint must return sanitized users.");
  assert.match(userBlock, /delete:/, "User detail endpoint must support deletion.");
  assert.match(userBlock, /AuthUser/, "User detail endpoint must return deleted user metadata.");
});

test("attachment endpoints document upload, linking, status, and posted-voucher delete protection", () => {
  const uploadBlock = blockAfter("  /attachments/upload:");
  const linkBlock = blockAfter("  /attachment-links:");
  const voucherAttachmentsBlock = blockAfter("  /vouchers/{voucherId}/attachments:");
  const statusBlock = blockAfter("  /attachments/{attachmentId}/status:");
  const contentBlock = blockAfter("  /attachments/{attachmentId}/content:");
  const deleteBlock = blockAfter("  /attachments/{attachmentId}:");

  assert.match(uploadBlock, /UploadAttachmentRequest/, "Upload endpoint must reference its request schema.");
  assert.match(uploadBlock, /Attachment/, "Upload endpoint must return an Attachment.");
  assert.match(contract, /contentBase64/, "Upload schema must document binary content transport.");
  assert.match(contract, /storageProvider/, "Upload response must expose the storage provider.");
  assert.match(linkBlock, /CreateAttachmentLinkRequest/, "Link endpoint must reference its request schema.");
  assert.match(voucherAttachmentsBlock, /Attachment/, "Voucher attachment list must return attachments.");
  assert.match(statusBlock, /AttachmentStatus/, "Status endpoint must return attachment status.");
  assert.match(contentBlock, /AttachmentContent/, "Content endpoint must return stored attachment content.");
  assert.match(deleteBlock, /POSTED_VOUCHER_ATTACHMENT_DELETE_BLOCKED|Posted voucher attachments cannot be deleted/);
});

test("Agent-facing endpoints expose dry-run and evidence fields", () => {
  const aiBlock = blockAfter("  /ai/voucher-suggestions:");
  const planAiBlock = blockAfter("  /ai/voucher-drafts:");
  const planAiDetailBlock = blockAfter("  /ai/voucher-drafts/{aiSuggestionId}:");
  const planAiConvertBlock = blockAfter("  /ai/voucher-drafts/{aiSuggestionId}/convert-to-voucher:");
  const agentBlock = blockAfter("  /agent-actions:");

  assert.match(aiBlock, /CreateAiVoucherSuggestionRequest/, "AI endpoint must reference its request schema.");
  assert.match(aiBlock, /AiVoucherSuggestion/, "AI endpoint must reference its response schema.");
  assert.match(planAiBlock, /CreateAiVoucherSuggestionRequest/, "Plan AI draft endpoint must accept the AI suggestion request.");
  assert.match(planAiBlock, /AiVoucherSuggestion/, "Plan AI draft endpoint must return an AI draft suggestion.");
  assert.match(planAiDetailBlock, /AiVoucherSuggestion/, "Plan AI draft detail endpoint must return an AI draft suggestion.");
  assert.match(planAiConvertBlock, /ConvertAiVoucherSuggestionRequest/, "Plan AI draft conversion endpoint must document human review.");
  assert.match(planAiConvertBlock, /Voucher/, "Plan AI draft conversion endpoint must return the formal voucher draft.");
  assert.match(agentBlock, /CreateAgentActionRequest/, "Agent endpoint must reference its request schema.");
  assert.match(agentBlock, /AgentAction/, "Agent endpoint must reference its response schema.");
  assert.match(contract, /name: Idempotency-Key/, "Idempotency-Key header must be defined.");
  assert.match(contract, /dryRun/, "Agent-facing schemas must expose dryRun.");
  assert.match(contract, /evidenceRefs/, "Agent-facing schemas must expose evidenceRefs.");
  assert.match(contract, /approvalRequired/, "AI suggestions must expose approvalRequired.");
});

test("audit log endpoint is documented with permission metadata", () => {
  const auditBlock = blockAfter("  /audit-logs:");

  assert.match(auditBlock, /x-permission: audit_log.view/, "Audit log endpoint must require audit_log.view.");
  assert.match(auditBlock, /x-risk-level: low/, "Audit log endpoint must be query-only low risk.");
  assert.match(auditBlock, /AuditLog/, "Audit log endpoint must return AuditLog records.");
});

test("auxiliary accounting fields are documented", () => {
  assert.match(contract, /requiredAuxiliaries/, "Account schemas must expose requiredAuxiliaries.");
  assert.match(contract, /auxiliaries/, "Voucher line schema must expose auxiliaries.");
  assert.match(contract, /auxiliarySnapshot/, "Journal entries must preserve auxiliary snapshots.");
});

test("Phase 1 ledger and voucher trace endpoints are documented", () => {
  const generalLedgerBlock = blockAfter("  /ledger/general-ledger:");
  const accountBalancesBlock = blockAfter("  /ledger/account-balances:");
  const subLedgerBlock = blockAfter("  /ledger/sub-ledger:");
  const reportBalancesBlock = blockAfter("  /reports/account-balances:");
  const reportTrialBalanceBlock = blockAfter("  /reports/trial-balance:");
  const voucherBlock = blockAfter("  /vouchers/{voucherId}:");
  const voucherCopyBlock = blockAfter("  /vouchers/{voucherId}/copy:");
  const voucherLogsBlock = blockAfter("  /vouchers/{voucherId}/status-logs:");
  const postingVoucherBlock = blockAfter("  /posting/post-voucher/{voucherId}:");
  const postingBatchBlock = blockAfter("  /posting/post-batch:");
  const postingBatchesBlock = blockAfter("  /posting/batches:");
  const postingBatchDetailBlock = blockAfter("  /posting/batches/{postingBatchId}:");

  assert.match(generalLedgerBlock, /GeneralLedger/, "General ledger endpoint must return the general ledger schema.");
  assert.match(accountBalancesBlock, /AccountPeriodBalance/, "Account balances endpoint must return balance rows.");
  assert.match(subLedgerBlock, /JournalEntry/, "Plan sub-ledger endpoint must return journal entries.");
  assert.match(reportBalancesBlock, /AccountPeriodBalance/, "Plan account balances report must return balance rows.");
  assert.match(reportTrialBalanceBlock, /TrialBalance/, "Plan trial balance report must return trial balance.");
  assert.match(voucherBlock, /get:/, "Voucher detail endpoint must be documented.");
  assert.match(voucherBlock, /patch:/, "Voucher update endpoint must be documented.");
  assert.match(voucherBlock, /delete:/, "Voucher delete endpoint must be documented.");
  assert.match(voucherBlock, /UpdateVoucherRequest/, "Voucher update endpoint must document the request schema.");
  assert.match(voucherBlock, /x-permission: voucher.update_own/, "Voucher update/delete must require update permission.");
  assert.match(voucherCopyBlock, /CopyVoucherRequest/, "Voucher copy endpoint must document the request schema.");
  assert.match(voucherCopyBlock, /Voucher/, "Voucher copy endpoint must return a voucher.");
  assert.match(voucherLogsBlock, /VoucherStatusLog/, "Voucher status log endpoint must return state transition logs.");
  assert.match(postingVoucherBlock, /PostVoucherResponse/, "Plan single-voucher posting endpoint must return a posting result.");
  assert.match(postingBatchBlock, /CreatePostingBatchRequest/, "Batch posting endpoint must document the request schema.");
  assert.match(postingBatchBlock, /PostingBatch/, "Batch posting endpoint must return the batch schema.");
  assert.match(postingBatchesBlock, /PostingBatch/, "Posting batch list endpoint must return batch rows.");
  assert.match(postingBatchDetailBlock, /PostingBatch/, "Posting batch detail endpoint must return one batch row.");
});

test("account import and disable endpoints document master-data controls", () => {
  const treeBlock = blockAfter("  /accounts/tree:");
  const updateBlock = blockAfter("  /accounts/{accountId}:");
  const importBlock = blockAfter("  /accounts/import:");
  const disableBlock = blockAfter("  /accounts/{accountId}/disable:");
  const enableBlock = blockAfter("  /accounts/{accountId}/enable:");

  assert.match(treeBlock, /AccountTreeNode/);
  assert.match(updateBlock, /get:/);
  assert.match(updateBlock, /UpdateAccountRequest/);
  assert.match(updateBlock, /Account/);
  assert.match(updateBlock, /delete:/);
  assert.match(updateBlock, /x-permission: account.delete/);
  assert.match(importBlock, /ImportAccountsRequest/);
  assert.match(importBlock, /Account/);
  assert.match(disableBlock, /Account/);
  assert.match(disableBlock, /x-permission: account.update/);
  assert.match(enableBlock, /Account/);
  assert.match(enableBlock, /x-permission: account.update/);
});

test("bank reconciliation endpoints document statement import and matching contracts", () => {
  const importBlock = blockAfter("  /ledger/bank-statements/import:");
  const statementsBlock = blockAfter("  /ledger/bank-statements:");
  const planStatementsBlock = blockAfter("  /bank/statements:");
  const planReconcileBlock = blockAfter("  /bank/reconcile:");
  const planAutoReconcileBlock = blockAfter("  /bank/reconcile/auto:");
  const reconciliationBlock = blockAfter("  /ledger/bank-reconciliations:");
  const matchBlock = blockAfter("  /ledger/bank-reconciliations/{reconciliationId}/match:");

  assert.match(contract, /isBank/, "Account schemas must expose bank account markers.");
  assert.match(importBlock, /ImportBankStatementsRequest/);
  assert.match(importBlock, /BankStatement/);
  assert.match(statementsBlock, /BankStatement/);
  assert.match(planStatementsBlock, /ImportBankStatementsRequest/);
  assert.match(planStatementsBlock, /BankStatement/);
  assert.match(planReconcileBlock, /CreateBankReconciliationRequest/);
  assert.match(planReconcileBlock, /BankReconciliation/);
  assert.match(planAutoReconcileBlock, /CreateBankReconciliationRequest/);
  assert.match(planAutoReconcileBlock, /BankReconciliationMatchResult/);
  assert.match(reconciliationBlock, /CreateBankReconciliationRequest/);
  assert.match(reconciliationBlock, /BankReconciliation/);
  assert.match(matchBlock, /BankReconciliationMatchResult/);
});

test("period close endpoints document profit and loss carry-forward contracts", () => {
  const carryForwardBlock = blockAfter("  /close/profit-loss-carry-forward:");
  const planCarryForwardBlock = blockAfter("  /posting/period-end/transfer-pl:");

  assert.match(carryForwardBlock, /CreateProfitLossCarryForwardRequest/);
  assert.match(carryForwardBlock, /Voucher/);
  assert.match(planCarryForwardBlock, /CreateProfitLossCarryForwardRequest/);
  assert.match(planCarryForwardBlock, /Voucher/);
  assert.match(contract, /period_close/, "Voucher source types must include period_close.");
});
