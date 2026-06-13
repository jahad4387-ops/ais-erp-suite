import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const agentCenterPath = fileURLToPath(new URL("../src/pages/AgentCenter.tsx", import.meta.url));

test("agent center uploads attachment evidence before AI voucher draft generation", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /Upload/, "Agent center should expose an attachment picker for AI evidence.");
  assert.match(source, /data-testid="agent-ai-attachment-upload"/);
  assert.match(source, /contentBase64/);
  assert.match(source, /api\.post\('\/attachments\/upload'/);
  assert.match(source, /attachmentIds/);
  assert.match(source, /uploadedAttachmentIds/);
  assert.match(source, /api\.post\('\/ai\/voucher-drafts'/);
  assert.match(source, /api\.post\('\/ai\/reconciliation-suggestions'/);
  assert.match(source, /api\.post\('\/ai\/collection-drafts'/);
  assert.match(source, /api\.post\('\/ai\/exception-checks'/);
  assert.match(source, /dryRun: true/);
});

test("agent center exposes Phase 6 draft candidate generation with OCR review", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /data-testid="agent-draft-candidate-form"/);
  assert.match(source, /data-testid="agent-draft-type-select"/);
  assert.match(source, /api\.post\('\/ai\/ocr-preview'/);
  assert.match(source, /previewAgentOcr/);
  assert.match(source, /api\.post\('\/agent\/draft-candidates'/);
  assert.match(source, /draftType/);
  assert.match(source, /sourceObjectType/);
  assert.match(source, /attachmentIds/);
  assert.match(source, /reviewedOcrResults/);
  assert.match(source, /reviewedOcrTexts/);
  assert.match(source, /ocrResults/);
  assert.match(source, /originalExtractedText/);
  assert.match(source, /unmatchedItems/);
  assert.match(source, /dryRunResult/);
  assert.match(source, /LLM 草稿运行/);
  assert.match(source, /本地 OCR/);
  assert.match(source, /reviewedDraftPayload/);
  assert.match(source, /resolvedUnmatchedItemsText/);
  assert.match(source, /data-testid="agent-draft-resolved-unmatched-items"/);
  assert.match(source, /resolvedUnmatchedItems: JSON\.parse\(resolvedUnmatchedItemsText\)/);
  assert.match(source, /encodeURIComponent\(draftCandidate\.id\)/);
  assert.match(source, /\/convert`/);
  assert.match(source, /handleRejectDraftCandidate/);
  assert.match(source, /\/reject`/);
  assert.match(source, /data-testid="agent-draft-rejection-reason"/);
  assert.match(source, /rejectionReason: draftRejectionReason/);
  assert.match(source, /确认转系统草稿/);
  assert.match(source, /生产领料草稿/);
  assert.match(source, /完工入库草稿/);
});

test("agent center exposes failed LLM draft run details and retry action", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /lastDraftGenerationError/);
  assert.match(source, /setLastDraftGenerationError/);
  assert.match(source, /LLM_DRAFT_SCHEMA_INVALID/);
  assert.match(source, /errorMessage/);
  assert.match(source, /failed LLM run/);
  assert.match(source, /data-testid="agent-draft-retry-button"/);
  assert.match(source, /draftCandidateForm\.submit\(\)/);
});

test("agent center lists recent LLM draft runs for observability", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /llmDraftRuns/);
  assert.match(source, /llmDraftMetrics/);
  assert.match(source, /loadLlmDraftRuns/);
  assert.match(source, /api\.get\(`\/ai\/llm-draft-runs\?accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}`\)/);
  assert.match(source, /api\.get\(`\/ai\/llm-draft-runs\/metrics\?accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}`\)/);
  assert.match(source, /data-testid="agent-llm-draft-run-table"/);
  assert.match(source, /data-testid="agent-llm-draft-metrics"/);
  assert.match(source, /LLM 草稿运行历史/);
  assert.match(source, /schemaSuccessRate/);
  assert.match(source, /adoptionRate/);
  assert.match(source, /humanCorrectionRate/);
  assert.match(source, /errorMessage/);
  assert.match(source, /evidenceCount/);
});

test("agent center supports reviewed purchase order draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'purchase_order'/);
  assert.match(source, /supplierId/);
  assert.match(source, /draftCandidate\.draftType === 'purchase_order'/);
  assert.match(source, /navigate\('\/purchase-orders'\)/);
  assert.match(source, /reviewedDraftPayload/);
  assert.match(source, /encodeURIComponent\(draftCandidate\.id\)/);
});

test("agent center supports reviewed sales order draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'sales_order'/);
  assert.match(source, /customerId/);
  assert.match(source, /draftCandidate\.draftType === 'sales_order'/);
  assert.match(source, /navigate\('\/sales-orders'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed inventory movement draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'inventory_movement'/);
  assert.match(source, /movementType: 'inbound'/);
  assert.match(source, /businessType: 'other_inbound'/);
  assert.match(source, /draftCandidate\.draftType === 'inventory_movement'/);
  assert.match(source, /navigate\('\/inventory-movements'\)/);
});

test("agent center supports reviewed material requisition draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'material_requisition'/);
  assert.match(source, /requisitionNo/);
  assert.match(source, /componentItemId/);
  assert.match(source, /draftCandidate\.draftType === 'material_requisition'/);
  assert.match(source, /navigate\('\/material-requisitions'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed product receipt draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'product_receipt'/);
  assert.match(source, /receiptNo/);
  assert.match(source, /productItemId/);
  assert.match(source, /draftCandidate\.draftType === 'product_receipt'/);
  assert.match(source, /navigate\('\/product-receipts'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed stock count preview conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'stock_count'/);
  assert.match(source, /actualQuantity/);
  assert.match(source, /draftCandidate\.draftType === 'stock_count'/);
  assert.match(source, /navigate\('\/stock-counts'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed master data draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'master_data'/);
  assert.match(source, /masterDataType/);
  assert.match(source, /draftCandidate\.draftType === 'master_data'/);
  assert.match(source, /navigate\('\/suppliers'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed payroll allocation draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'payroll_allocation'/);
  assert.match(source, /payrollRunId/);
  assert.match(source, /allocationRate/);
  assert.match(source, /draftCandidate\.draftType === 'payroll_allocation'/);
  assert.match(source, /navigate\('\/payroll-runs'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed depreciation dry-run draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'depreciation_run'/);
  assert.match(source, /runNo/);
  assert.match(source, /dryRun: true/);
  assert.match(source, /draftCandidate\.draftType === 'depreciation_run'/);
  assert.match(source, /navigate\('\/depreciation-runs'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed asset change draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'asset_change'/);
  assert.match(source, /changeKind: 'transfer'/);
  assert.match(source, /fixedAssetId/);
  assert.match(source, /draftCandidate\.draftType === 'asset_change'/);
  assert.match(source, /navigate\('\/fixed-assets'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center supports reviewed report interpretation draft conversion", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /documentType: 'report_interpretation'/);
  assert.match(source, /reportRunId/);
  assert.match(source, /evidenceRefs: \['report_cell:BS!B10'\]/);
  assert.match(source, /draftCandidate\.draftType === 'report_interpretation'/);
  assert.match(source, /navigate\('\/report-runs'\)/);
  assert.match(source, /reviewedDraftPayload/);
});

test("agent center lists the Agent draft review queue", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /agentDraftQueue/);
  assert.match(source, /loadAgentDraftQueue/);
  assert.match(source, /api\.get\(`\/agent\/draft-candidates\?accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}`\)/);
  assert.match(source, /convertedObjectType/);
  assert.match(source, /rejectionReason/);
  assert.match(source, /value === 'rejected'/);
  assert.match(source, /unmatchedCount/);
  assert.match(source, /evidenceCount/);
});

test("agent center exposes matched master data and draft generation provenance", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /data-testid="agent-draft-matched-master-data"/);
  assert.match(source, /matchedMasterData/);
  assert.match(source, /data-testid="agent-draft-llm-input-summary"/);
  assert.match(source, /llmDraftRun\?\.inputSummary/);
  assert.match(source, /originalExtractedText/);
  assert.match(source, /reviewedBy/);
  assert.match(source, /reviewedAt/);
});

test("agent center exposes Phase 6 Agent Action approval and replay workflow", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /data-testid="agent-action-form"/);
  assert.match(source, /agentActionQueue/);
  assert.match(source, /agentActionFilters/);
  assert.match(source, /loadAgentActionQueue/);
  assert.match(source, /loadAgentActionDetail/);
  assert.match(source, /accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}/);
  assert.match(source, /'page=1'/);
  assert.match(source, /'pageSize=50'/);
  assert.match(source, /status=\$\{encodeURIComponent\(agentActionFilters\.status\)\}/);
  assert.match(source, /riskLevel=\$\{encodeURIComponent\(agentActionFilters\.riskLevel\)\}/);
  assert.match(source, /toolName=\$\{encodeURIComponent\(agentActionFilters\.toolName\)\}/);
  assert.match(source, /api\.get\(`\/agent-actions\/\$\{encodeURIComponent\(actionId\)\}`\)/);
  assert.match(source, /data-testid="agent-action-status-filter"/);
  assert.match(source, /data-testid="agent-action-risk-filter"/);
  assert.match(source, /data-testid="agent-action-tool-filter"/);
  assert.match(source, /data-testid="agent-action-queue-table"/);
  assert.match(source, /api\.post\('\/agent-actions'/);
  assert.match(source, /\/agent-actions\/\$\{encodeURIComponent\(agentAction\.id\)\}\/\$\{step\}/);
  assert.match(source, /updateAgentAction\('submit'\)/);
  assert.match(source, /updateAgentAction\('approve'\)/);
  assert.match(source, /updateAgentAction\('execute'\)/);
  assert.match(source, /updateAgentAction\('reverse'\)/);
  assert.match(source, /\/agent-actions\/\$\{encodeURIComponent\(agentAction\.id\)\}\/replay/);
  assert.match(source, /Replay 回放/);
  assert.match(source, /title: '载荷'/);
  assert.match(source, /JSON\.stringify\(record\.payload/);
  assert.match(source, /submitted_for_approval/);
  assert.match(source, /approvalProgress/);
  assert.match(source, /remainingCount/);
  assert.match(source, /auditSummary/);
  assert.match(source, /agentAction\.auditSummary\?\.approvals/);
  assert.match(source, /agentAction\.auditSummary\?\.evidence/);
  assert.match(source, /agentAction\.auditSummary\?\.replay/);
  assert.match(source, /agentAction\.auditSummary\?\.nextActions/);
  assert.match(source, /mutationState/);
  assert.match(source, /verificationStatus/);
  assert.match(source, /eventTypes/);
  assert.match(source, /userTokenConfirmed/);
  assert.match(source, /executeRequiresUserToken/);
  assert.match(source, /agentReverseReason/);
  assert.match(source, /data-testid="agent-action-reverse-reason"/);
  assert.match(source, /reversalReason/);
  assert.match(source, /reversalResult/);
});

test("agent center discovers Agent tools from the Tool Registry", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /api\.get\('\/agent-tools'\)/);
  assert.match(source, /agentTools/);
  assert.match(source, /selectedAgentTool/);
  assert.match(source, /data-testid="agent-tool-select"/);
  assert.match(source, /approvalPolicy/);
  assert.match(source, /minApprovals/);
  assert.match(source, /agentTokenAllowed/);
});

test("agent center displays Agent evidence hash verification state", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /evidenceSnapshots/);
  assert.match(source, /checksum/);
  assert.match(source, /evidence_verified/);
  assert.match(source, /evidence_verification_failed/);
});

test("agent center can invoke registered Agent tools in dry-run mode", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /handleInvokeSelectedAgentTool/);
  assert.match(source, /\/agent-tools\/\$\{encodeURIComponent\(selectedAgentTool\.name\)\}\/invoke/);
  assert.match(source, /resultType === 'agent_draft_candidate'/);
  assert.match(source, /setDraftCandidate\(result\.result\)/);
  assert.match(source, /resultType === 'agent_action'/);
  assert.match(source, /setAgentAction\(result\.result\)/);
});
