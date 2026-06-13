import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Statistic, Table, Tag, Upload, message } from 'antd';
import { CheckOutlined, CloseCircleOutlined, PaperClipOutlined, RobotOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

const { TextArea } = Input;

const draftTypeOptions = [
  { value: 'purchase_order', label: '采购订单草稿' },
  { value: 'sales_order', label: '销售订单草稿' },
  { value: 'inventory_movement', label: '仓库出入库草稿' },
  { value: 'material_requisition', label: '生产领料草稿' },
  { value: 'product_receipt', label: '完工入库草稿' },
  { value: 'stock_count', label: '盘点草稿' },
  { value: 'voucher', label: '记账凭证草稿' },
  { value: 'payroll_allocation', label: '工资分摊草稿' },
  { value: 'depreciation_run', label: '折旧测算草稿' },
  { value: 'asset_change', label: '资产变动草稿' },
  { value: 'master_data', label: '基础档案草稿' },
  { value: 'report_interpretation', label: '报表解读草稿' },
];

const agentEvidenceReplayEvents = ['evidence_verified', 'evidence_verification_failed'];
const agentDraftFailureCodes = ['LLM_DRAFT_SCHEMA_INVALID', 'BUSINESS_RULE_FAILED'];

type PendingAttachment = {
  filename: string;
  contentType: string;
  byteSize: number;
  contentBase64: string;
};

type AgentTool = {
  name: string;
  title: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  actionKind: string;
  draftType?: string | null;
  agentTokenAllowed: boolean;
  approvalPolicy: {
    approvalRequired: boolean;
    requiresHumanConfirmation: boolean;
    minApprovals: number;
    executeRequiresUserToken: boolean;
  };
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('文件读取失败')));
    reader.readAsDataURL(file);
  });
}

export const AgentCenter: React.FC = () => {
  const [form] = Form.useForm();
  const [draftCandidateForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [suggestion, setSuggestion] = useState<any | null>(null);
  const [draftCandidate, setDraftCandidate] = useState<any | null>(null);
  const [lastDraftGenerationError, setLastDraftGenerationError] = useState<any | null>(null);
  const [agentDraftQueue, setAgentDraftQueue] = useState<any | null>(null);
  const [llmDraftRuns, setLlmDraftRuns] = useState<any | null>(null);
  const [llmDraftMetrics, setLlmDraftMetrics] = useState<any | null>(null);
  const [ocrPreview, setOcrPreview] = useState<any | null>(null);
  const [reviewedOcrTexts, setReviewedOcrTexts] = useState<Record<string, string>>({});
  const [reviewedDraftPayloadText, setReviewedDraftPayloadText] = useState('');
  const [resolvedUnmatchedItemsText, setResolvedUnmatchedItemsText] = useState('[]');
  const [draftRejectionReason, setDraftRejectionReason] = useState('模型匹配结果不可信，人工拒绝。');
  const [agentAction, setAgentAction] = useState<any | null>(null);
  const [agentActionReplay, setAgentActionReplay] = useState<any | null>(null);
  const [agentActionQueue, setAgentActionQueue] = useState<any | null>(null);
  const [agentActionFilters, setAgentActionFilters] = useState({ status: '', riskLevel: '', toolName: '' });
  const [agentReverseReason, setAgentReverseReason] = useState('manual reverse after execution review');
  const [agentTools, setAgentTools] = useState<AgentTool[]>([]);
  const [selectedAgentTool, setSelectedAgentTool] = useState<AgentTool | null>(null);
  const [phase2AgentResult, setPhase2AgentResult] = useState<any | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploadedAttachmentIds, setUploadedAttachmentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftQueueLoading, setDraftQueueLoading] = useState(false);
  const [llmDraftRunsLoading, setLlmDraftRunsLoading] = useState(false);
  const [ocrPreviewLoading, setOcrPreviewLoading] = useState(false);
  const [draftConverting, setDraftConverting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionQueueLoading, setActionQueueLoading] = useState(false);
  const [phase2Loading, setPhase2Loading] = useState(false);
  const [converting, setConverting] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();

  const loadAgentDraftQueue = async () => {
    if (!currentAccountSetId) return;

    setDraftQueueLoading(true);
    try {
      const result = await api.get(`/agent/draft-candidates?accountSetId=${encodeURIComponent(currentAccountSetId)}`);
      setAgentDraftQueue(result);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setDraftQueueLoading(false);
    }
  };

  const loadLlmDraftRuns = async () => {
    if (!currentAccountSetId) return;

    setLlmDraftRunsLoading(true);
    try {
      const result = await api.get(`/ai/llm-draft-runs?accountSetId=${encodeURIComponent(currentAccountSetId)}`);
      const metrics = await api.get(`/ai/llm-draft-runs/metrics?accountSetId=${encodeURIComponent(currentAccountSetId)}`);
      setLlmDraftRuns(result);
      setLlmDraftMetrics(metrics);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLlmDraftRunsLoading(false);
    }
  };

  const loadAgentActionQueue = async () => {
    if (!currentAccountSetId) return;

    setActionQueueLoading(true);
    try {
      const query = [
        `accountSetId=${encodeURIComponent(currentAccountSetId)}`,
        'page=1',
        'pageSize=50',
        agentActionFilters.status ? `status=${encodeURIComponent(agentActionFilters.status)}` : null,
        agentActionFilters.riskLevel ? `riskLevel=${encodeURIComponent(agentActionFilters.riskLevel)}` : null,
        agentActionFilters.toolName ? `toolName=${encodeURIComponent(agentActionFilters.toolName)}` : null,
      ]
        .filter(Boolean)
        .join('&');
      const result = await api.get(`/agent-actions?${query}`);
      setAgentActionQueue(result);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setActionQueueLoading(false);
    }
  };

  const loadAgentActionDetail = async (actionId: string) => {
    setActionLoading(true);
    try {
      const result = await api.get(`/agent-actions/${encodeURIComponent(actionId)}`);
      setAgentAction(result);
      setAgentActionReplay(null);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    loadAgentDraftQueue();
    loadLlmDraftRuns();
  }, [currentAccountSetId]);

  useEffect(() => {
    const values: Record<string, string> = {};
    const draftType = searchParams.get('draftType');
    const sourceObjectType = searchParams.get('sourceObjectType');
    const sourceObjectId = searchParams.get('sourceObjectId');
    const userInstruction = searchParams.get('userInstruction');
    if (draftType) values.draftType = draftType;
    if (sourceObjectType) values.sourceObjectType = sourceObjectType;
    if (sourceObjectId) values.sourceObjectId = sourceObjectId;
    if (userInstruction) values.userInstruction = userInstruction;
    if (Object.keys(values).length > 0) {
      draftCandidateForm.setFieldsValue(values);
    }
  }, [draftCandidateForm, searchParams]);

  useEffect(() => {
    loadAgentActionQueue();
  }, [currentAccountSetId, agentActionFilters.status, agentActionFilters.riskLevel, agentActionFilters.toolName]);

  useEffect(() => {
    const loadAgentTools = async () => {
      try {
        const result = await api.get('/agent-tools');
        const tools: AgentTool[] = result.tools ?? [];
        setAgentTools(tools);
        const defaultTool = tools.find((tool) => tool.name === 'run_close_checklist') ?? tools[0] ?? null;
        setSelectedAgentTool(defaultTool);
        if (defaultTool) {
          actionForm.setFieldsValue({ toolName: defaultTool.name });
        }
      } catch (error: any) {
        message.error(error.message);
      }
    };

    loadAgentTools();
  }, [actionForm]);

  const uploadPendingAttachment = async () => {
    let attachmentIds = uploadedAttachmentIds;
    if (pendingAttachment) {
      const attachment = await api.post('/attachments/upload', {
        accountSetId: currentAccountSetId,
        filename: pendingAttachment.filename,
        contentType: pendingAttachment.contentType,
        byteSize: pendingAttachment.byteSize,
        contentBase64: pendingAttachment.contentBase64,
        uploadedBy: currentUser,
      });
      attachmentIds = [...uploadedAttachmentIds, attachment.id];
      setUploadedAttachmentIds(attachmentIds);
      setPendingAttachment(null);
    }
    return attachmentIds;
  };

  const evidenceRefsFromText = (value?: string) =>
    value
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const reviewedOcrResults = () =>
    (ocrPreview?.results ?? []).map((result: any) => ({
      attachmentId: result.attachmentId,
      extractedText: reviewedOcrTexts[result.attachmentId] ?? result.extractedText ?? '',
      reviewedBy: currentUser,
    }));

  const defaultResolvedUnmatchedItemsText = (candidate: any) =>
    JSON.stringify(
      (candidate?.unmatchedItems ?? []).map((item: any) => ({
        field: item.field,
        resolution: 'selected_by_reviewer',
        resolvedValue: null,
      })),
      null,
      2,
    );

  const isLlmDraftFailure = (error: any) =>
    agentDraftFailureCodes.includes(error?.data?.code) &&
    /LLM draft|draftPayload|provider|schema/i.test(error?.data?.message ?? error?.message ?? '');

  const previewAgentOcr = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }

    setOcrPreviewLoading(true);
    try {
      const attachmentIds = await uploadPendingAttachment();
      if (attachmentIds.length === 0) {
        message.error('请先上传附件');
        return;
      }
      const result = await api.post('/ai/ocr-preview', {
        accountSetId: currentAccountSetId,
        attachmentIds,
        requestedBy: currentUser,
        dryRun: true,
      });
      setOcrPreview(result);
      setReviewedOcrTexts(
        Object.fromEntries((result.results ?? []).map((item: any) => [item.attachmentId, item.extractedText ?? ''])),
      );
      message.success('本地 OCR 预览已生成');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setOcrPreviewLoading(false);
    }
  };

  const handleGenerate = async (values: { content: string; evidenceRefs?: string }) => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }

    setLoading(true);
    try {
      const attachmentIds = await uploadPendingAttachment();

      const result = await api.post('/ai/voucher-drafts', {
        accountSetId: currentAccountSetId,
        fiscalYear: currentYear,
        periodNo: currentPeriod,
        voucherDate: new Date().toISOString().slice(0, 10),
        content: values.content,
        evidenceRefs: evidenceRefsFromText(values.evidenceRefs),
        attachmentIds,
        requestedBy: currentUser,
        dryRun: true,
      });
      setSuggestion(result);
      message.success('已生成草稿建议');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDraftCandidate = async (values: {
    draftType: string;
    userInstruction: string;
    sourceObjectType?: string;
    sourceObjectId?: string;
    evidenceRefs?: string;
  }) => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }

    setDraftLoading(true);
    try {
      const attachmentIds = await uploadPendingAttachment();
      const result = await api.post('/agent/draft-candidates', {
        accountSetId: currentAccountSetId,
        fiscalYear: currentYear,
        periodNo: currentPeriod,
        draftType: values.draftType,
        sourceObjectType: values.sourceObjectType || 'agent-center',
        sourceObjectId: values.sourceObjectId || undefined,
        userInstruction: values.userInstruction,
        evidenceRefs: evidenceRefsFromText(values.evidenceRefs),
        attachmentIds,
        reviewedOcrResults: reviewedOcrResults(),
        requestedBy: currentUser,
        dryRun: true,
      });
      setDraftCandidate(result);
      setLastDraftGenerationError(null);
      setResolvedUnmatchedItemsText(defaultResolvedUnmatchedItemsText(result));
      setDraftRejectionReason('模型匹配结果不可信，人工拒绝。');
      if (result.draftType === 'voucher') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'voucher',
              accountSetId: currentAccountSetId,
              fiscalYear: currentYear,
              periodNo: currentPeriod,
              voucherDate: new Date().toISOString().slice(0, 10),
              lines: result.draftPayload?.lines ?? [],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'purchase_order') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'purchase_order',
              supplierId: '',
              orderDate: new Date().toISOString().slice(0, 10),
              currency: 'CNY',
              exchangeRate: 1,
              lines: result.draftPayload?.lines ?? [],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'sales_order') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'sales_order',
              customerId: '',
              orderDate: new Date().toISOString().slice(0, 10),
              currency: 'CNY',
              exchangeRate: 1,
              lines: result.draftPayload?.lines ?? [],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'inventory_movement') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'inventory_movement',
              movementType: 'inbound',
              businessType: 'other_inbound',
              fiscalYear: currentYear,
              periodNo: currentPeriod,
              lines: result.draftPayload?.lines ?? [],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'material_requisition') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'material_requisition',
              requisitionNo: '',
              workOrderId: result.draftPayload?.workOrderId ?? result.sourceObjectId ?? '',
              fiscalYear: currentYear,
              periodNo: currentPeriod,
              lines: result.draftPayload?.lines ?? [
                { componentItemId: '', warehouseId: '', locationId: '', batchNo: '', quantity: 0 },
              ],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'product_receipt') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'product_receipt',
              receiptNo: '',
              workOrderId: result.draftPayload?.workOrderId ?? result.sourceObjectId ?? '',
              fiscalYear: currentYear,
              periodNo: currentPeriod,
              lines: result.draftPayload?.lines ?? [
                { productItemId: '', warehouseId: '', locationId: '', batchNo: '', quantity: 0 },
              ],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'stock_count') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'stock_count',
              countNo: '',
              fiscalYear: currentYear,
              periodNo: currentPeriod,
              lines: [{ itemId: '', warehouseId: '', locationId: '', actualQuantity: 0, reason: '' }],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'master_data') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'master_data',
              masterDataType: 'supplier',
              code: '',
              name: '',
              fields: {},
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'payroll_allocation') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'payroll_allocation',
              payrollRunId: '',
              fiscalYear: currentYear,
              periodNo: currentPeriod,
              rules: [
                {
                  departmentId: '',
                  targetType: 'department',
                  workOrderId: '',
                  costType: 'direct_labor',
                  allocationRate: 1,
                  amount: 0,
                },
              ],
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'depreciation_run') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'depreciation_run',
              runNo: result.draftPayload?.runNo ?? `AGENT-DEP-${currentYear}${String(currentPeriod).padStart(2, '0')}`,
              fiscalYear: result.draftPayload?.fiscalYear ?? currentYear,
              periodNo: result.draftPayload?.periodNo ?? currentPeriod,
              dryRun: true,
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'asset_change') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'asset_change',
              changeKind: 'transfer',
              fixedAssetId: '',
              assetNo: '',
              changeDate: new Date().toISOString().slice(0, 10),
              toDepartmentId: '',
              toDepartmentName: '',
              amount: 0,
              reason: '',
            },
            null,
            2,
          ),
        );
      } else if (result.draftType === 'report_interpretation') {
        setReviewedDraftPayloadText(
          JSON.stringify(
            {
              documentType: 'report_interpretation',
              reportRunId: result.sourceObjectId ?? '',
              summary: '',
              keyFindings: [],
              warnings: [],
              evidenceRefs: ['report_cell:BS!B10'],
            },
            null,
            2,
          ),
        );
      } else {
        setReviewedDraftPayloadText('');
      }
      await loadAgentDraftQueue();
      await loadLlmDraftRuns();
      message.success('已生成 Agent 候选草稿');
    } catch (error: any) {
      setDraftCandidate(null);
      setResolvedUnmatchedItemsText('[]');
      setLastDraftGenerationError({
        message: error.message,
        code: error.data?.code,
        errorMessage: error.data?.message,
        traceId: error.data?.traceId,
        status: isLlmDraftFailure(error) ? 'failed LLM run' : 'request failed',
      });
      await loadLlmDraftRuns();
      message.error(error.message);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleAttachmentSelect = async (file: File) => {
    try {
      const contentBase64 = await readFileAsBase64(file);
      setPendingAttachment({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        byteSize: file.size,
        contentBase64,
      });
      message.success('附件已读取，将作为智能凭证证据上传');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleConvert = async () => {
    if (!suggestion) return;

    setConverting(true);
    try {
      await api.post(`/ai/voucher-suggestions/${suggestion.id}/convert-to-voucher`, {
        reviewedBy: currentUser,
      });
      message.success('已转为正式凭证草稿');
      navigate('/vouchers');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setConverting(false);
    }
  };

  const handleConvertDraftCandidate = async () => {
    if (!draftCandidate) return;
    if (
      ![
        'voucher',
        'purchase_order',
        'sales_order',
        'inventory_movement',
        'material_requisition',
        'product_receipt',
        'stock_count',
        'master_data',
        'payroll_allocation',
        'depreciation_run',
        'asset_change',
        'report_interpretation',
      ].includes(draftCandidate.draftType)
    ) {
      message.error('当前只支持将凭证、采购订单、销售订单、仓库或盘点候选草稿转为系统草稿');
      return;
    }

    setDraftConverting(true);
    try {
      const reviewedDraftPayload = JSON.parse(reviewedDraftPayloadText);
      await api.post(`/agent/draft-candidates/${encodeURIComponent(draftCandidate.id)}/convert`, {
        reviewedBy: currentUser,
        resolvedUnmatchedItems: JSON.parse(resolvedUnmatchedItemsText),
        reviewedDraftPayload,
      });
      await loadAgentDraftQueue();
      message.success('已确认并转为系统草稿');
      if (draftCandidate.draftType === 'purchase_order') {
        navigate('/purchase-orders');
      } else if (draftCandidate.draftType === 'sales_order') {
        navigate('/sales-orders');
      } else if (draftCandidate.draftType === 'inventory_movement') {
        navigate('/inventory-movements');
      } else if (draftCandidate.draftType === 'material_requisition') {
        navigate('/material-requisitions');
      } else if (draftCandidate.draftType === 'product_receipt') {
        navigate('/product-receipts');
      } else if (draftCandidate.draftType === 'stock_count') {
        navigate('/stock-counts');
      } else if (draftCandidate.draftType === 'master_data') {
        navigate('/suppliers');
      } else if (draftCandidate.draftType === 'payroll_allocation') {
        navigate('/payroll-runs');
      } else if (draftCandidate.draftType === 'depreciation_run') {
        navigate('/depreciation-runs');
      } else if (draftCandidate.draftType === 'asset_change') {
        navigate('/fixed-assets');
      } else if (draftCandidate.draftType === 'report_interpretation') {
        navigate('/report-runs');
      } else {
        navigate('/vouchers');
      }
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setDraftConverting(false);
    }
  };

  const handleRejectDraftCandidate = async () => {
    if (!draftCandidate) return;

    setDraftConverting(true);
    try {
      const rejectedCandidate = await api.post(`/agent/draft-candidates/${encodeURIComponent(draftCandidate.id)}/reject`, {
        rejectedBy: currentUser,
        rejectionReason: draftRejectionReason,
      });
      setDraftCandidate(rejectedCandidate);
      await loadAgentDraftQueue();
      message.success('已拒绝候选草稿');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setDraftConverting(false);
    }
  };

  const handleCreateAgentAction = async (values: { toolName: string; evidenceRefs?: string; payload?: string }) => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }

    setActionLoading(true);
    try {
      const result = await api.post('/agent-actions', {
        accountSetId: currentAccountSetId,
        toolName: values.toolName,
        dryRun: true,
        evidenceRefs: evidenceRefsFromText(values.evidenceRefs),
        payload: values.payload ? JSON.parse(values.payload) : {},
        requestedBy: currentUser,
      });
      setAgentAction(result);
      setAgentActionReplay(null);
      await loadAgentActionQueue();
      message.success('Agent Action dry-run 已完成');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvokeSelectedAgentTool = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }
    if (!selectedAgentTool) {
      message.error('请选择 Agent 工具');
      return;
    }

    setActionLoading(true);
    try {
      const values = actionForm.getFieldsValue();
      const payload = values.payload ? JSON.parse(values.payload) : {};
      const result = await api.post(`/agent-tools/${encodeURIComponent(selectedAgentTool.name)}/invoke`, {
        ...payload,
        accountSetId: currentAccountSetId,
        fiscalYear: currentYear,
        periodNo: currentPeriod,
        dryRun: true,
        evidenceRefs: evidenceRefsFromText(values.evidenceRefs),
        requestedBy: currentUser,
        payload,
      });
      if (result.resultType === 'agent_draft_candidate') {
        setDraftCandidate(result.result);
        setReviewedDraftPayloadText(JSON.stringify(result.result?.draftPayload ?? {}, null, 2));
        setResolvedUnmatchedItemsText(defaultResolvedUnmatchedItemsText(result.result));
        await loadAgentDraftQueue();
        await loadLlmDraftRuns();
      } else if (result.resultType === 'agent_action') {
        setAgentAction(result.result);
        setAgentActionReplay(null);
        await loadAgentActionQueue();
      }
      message.success('Agent 工具 dry-run 已完成');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const updateAgentAction = async (step: 'submit' | 'approve' | 'execute' | 'reverse') => {
    if (!agentAction) return;

    setActionLoading(true);
    try {
      const result = await api.post(`/agent-actions/${encodeURIComponent(agentAction.id)}/${step}`, {
        submittedBy: currentUser,
        approvedBy: currentUser,
        executedBy: currentUser,
        reversedBy: currentUser,
        approvalComment: step === 'submit' ? 'submitted_for_approval' : 'approved',
        userTokenConfirmed: step === 'execute' && agentAction.approvalPolicy?.executeRequiresUserToken === true,
        reversalReason: step === 'reverse' ? agentReverseReason.trim() || 'manual reverse after execution review' : undefined,
      });
      setAgentAction(result);
      await loadAgentActionQueue();
      message.success('Agent Action 状态已更新');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const loadAgentActionReplay = async () => {
    if (!agentAction) return;

    setActionLoading(true);
    try {
      const result = await api.get(`/agent-actions/${encodeURIComponent(agentAction.id)}/replay`);
      setAgentActionReplay(result);
      message.success('已加载 Replay 回放');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const runPhase2Agent = async (kind: 'reconciliation' | 'collection' | 'exception') => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }
    setPhase2Loading(true);
    try {
      const payload = {
        accountSetId: currentAccountSetId,
        dryRun: true,
        asOfDate: new Date().toISOString().slice(0, 10),
        requestedBy: currentUser,
      };
      const result =
        kind === 'reconciliation'
          ? await api.post('/ai/reconciliation-suggestions', payload)
          : kind === 'collection'
            ? await api.post('/ai/collection-drafts', payload)
            : await api.post('/ai/exception-checks', payload);
      setPhase2AgentResult({ kind, ...result });
      message.success('已生成 dry-run 结果');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setPhase2Loading(false);
    }
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <h2 style={{ marginBottom: 0 }}>智能助手中心</h2>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="智能凭证建议">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleGenerate}
              initialValues={{
                content: '购买办公用品 500 元，通过银行付款',
              }}
            >
              <Form.Item name="content" label="原始业务内容" rules={[{ required: true, message: '请输入业务内容' }]}>
                <TextArea rows={5} />
              </Form.Item>
              <Form.Item name="evidenceRefs" label="附件或证据编号">
                <Input placeholder="发票-001,银行回单-001" />
              </Form.Item>
              <Upload
                data-testid="agent-ai-attachment-upload"
                beforeUpload={(file) => {
                  handleAttachmentSelect(file);
                  return false;
                }}
                maxCount={1}
              >
                <Button block icon={<PaperClipOutlined />}>
                  上传附件证据
                </Button>
              </Upload>
              {pendingAttachment ? (
                <Tag style={{ marginTop: 8 }} color="blue">
                  {pendingAttachment.filename} / {pendingAttachment.byteSize} 字节
                </Tag>
              ) : null}
              <Button block type="primary" icon={<RobotOutlined />} htmlType="submit" loading={loading}>
                生成建议
              </Button>
            </Form>
          </Card>
          <Card title="Phase 6 草稿生成工作台" style={{ marginTop: 16 }}>
            <Form
              form={draftCandidateForm}
              data-testid="agent-draft-candidate-form"
              layout="vertical"
              onFinish={handleGenerateDraftCandidate}
              initialValues={{
                draftType: 'purchase_order',
                userInstruction: '根据报价单生成 300 件 A 材料采购订单草稿，单价 9 元',
                sourceObjectType: 'manual_instruction',
              }}
            >
              <Form.Item name="draftType" label="目标草稿类型" rules={[{ required: true, message: '请选择草稿类型' }]}>
                <Select data-testid="agent-draft-type-select" options={draftTypeOptions} />
              </Form.Item>
              <Form.Item name="userInstruction" label="用户指令" rules={[{ required: true, message: '请输入生成要求' }]}>
                <TextArea rows={4} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="sourceObjectType" label="来源对象类型">
                    <Input placeholder="purchase_request" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="sourceObjectId" label="来源对象编号">
                    <Input placeholder="可选" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="evidenceRefs" label="证据引用">
                <Input placeholder="合同-001,报价单-001" />
              </Form.Item>
              <Upload
                data-testid="agent-draft-attachment-upload"
                beforeUpload={(file) => {
                  handleAttachmentSelect(file);
                  return false;
                }}
                maxCount={1}
              >
                <Button block icon={<PaperClipOutlined />}>
                  上传附件供本地 OCR 解析
                </Button>
              </Upload>
              {uploadedAttachmentIds.length > 0 ? (
                <Tag style={{ marginTop: 8 }} color="green">
                  已上传证据 {uploadedAttachmentIds.length} 个
                </Tag>
              ) : null}
              <Button block loading={ocrPreviewLoading} onClick={previewAgentOcr} style={{ marginTop: 8 }}>
                先运行本地 OCR
              </Button>
              {ocrPreview ? (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="attachmentId"
                  dataSource={ocrPreview.results ?? []}
                  style={{ marginTop: 8 }}
                  columns={[
                    { title: '附件', dataIndex: 'attachmentId' },
                    { title: 'OCR 状态', dataIndex: 'status' },
                    { title: '原始文本', dataIndex: 'originalExtractedText', render: (_: string, record: any) => record.originalExtractedText ?? record.extractedText },
                    {
                      title: '人工修正文本',
                      dataIndex: 'extractedText',
                      render: (_: string, record: any) => (
                        <TextArea
                          rows={3}
                          value={reviewedOcrTexts[record.attachmentId] ?? record.extractedText}
                          onChange={(event) =>
                            setReviewedOcrTexts((current) => ({
                              ...current,
                              [record.attachmentId]: event.target.value,
                            }))
                          }
                        />
                      ),
                    },
                  ]}
                />
              ) : null}
              <Button
                block
                type="primary"
                icon={<RobotOutlined />}
                htmlType="submit"
                loading={draftLoading}
                style={{ marginTop: 8 }}
              >
                生成候选草稿
              </Button>
            </Form>
          </Card>
          <Card
            title="Agent 草稿审核队列"
            style={{ marginTop: 16 }}
            extra={
              <Button size="small" loading={draftQueueLoading} onClick={loadAgentDraftQueue}>
                刷新
              </Button>
            }
          >
            <Table
              size="small"
              rowKey="id"
              loading={draftQueueLoading}
              pagination={false}
              dataSource={agentDraftQueue?.items ?? []}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'draftType',
                  render: (value: string) => <Tag color="blue">{value}</Tag>,
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value: string) => (
                    <Tag color={value === 'converted' ? 'green' : value === 'rejected' ? 'red' : 'orange'}>{value}</Tag>
                  ),
                },
                {
                  title: '未匹配',
                  dataIndex: 'unmatchedCount',
                },
                {
                  title: '证据',
                  dataIndex: 'evidenceCount',
                },
                {
                  title: '转换对象',
                  dataIndex: 'convertedObjectType',
                  render: (value: string | null, record: any) => (value ? `${value}:${record.convertedObjectId}` : '-'),
                },
                {
                  title: '拒绝原因',
                  dataIndex: 'rejectionReason',
                  render: (value: string | null) => value || '-',
                },
              ]}
            />
          </Card>
          <Card
            title="LLM 草稿运行历史"
            style={{ marginTop: 16 }}
            extra={
              <Button size="small" loading={llmDraftRunsLoading} onClick={loadLlmDraftRuns}>
                刷新
              </Button>
            }
          >
            <Row data-testid="agent-llm-draft-metrics" gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Statistic
                  title="Schema 成功率"
                  value={(llmDraftMetrics?.schemaSuccessRate ?? 0) * 100}
                  precision={0}
                  suffix="%"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="草稿采纳率"
                  value={(llmDraftMetrics?.adoptionRate ?? 0) * 100}
                  precision={0}
                  suffix="%"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="人工修正率"
                  value={(llmDraftMetrics?.humanCorrectionRate ?? 0) * 100}
                  precision={0}
                  suffix="%"
                />
              </Col>
            </Row>
            <Table
              data-testid="agent-llm-draft-run-table"
              size="small"
              rowKey="id"
              loading={llmDraftRunsLoading}
              pagination={false}
              dataSource={llmDraftRuns?.items ?? []}
              columns={[
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value: string) => <Tag color={value === 'failed' ? 'red' : 'green'}>{value}</Tag>,
                },
                {
                  title: '草稿类型',
                  dataIndex: 'draftType',
                },
                {
                  title: '模型',
                  render: (_: unknown, row: any) => `${row.provider}/${row.model}`,
                },
                {
                  title: '证据',
                  dataIndex: 'evidenceCount',
                },
                {
                  title: 'Schema',
                  dataIndex: 'outputSchema',
                },
                {
                  title: '错误',
                  dataIndex: 'errorMessage',
                  render: (value: string | null) => value ?? '-',
                },
              ]}
            />
          </Card>
          <Card title="Phase 2 Agent dry-run" style={{ marginTop: 16 }}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Button block loading={phase2Loading} onClick={() => runPhase2Agent('reconciliation')}>
                生成核销建议
              </Button>
              <Button block loading={phase2Loading} onClick={() => runPhase2Agent('collection')}>
                生成催收草稿
              </Button>
              <Button block loading={phase2Loading} onClick={() => runPhase2Agent('exception')}>
                运行异常检查
              </Button>
            </Space>
          </Card>
          <Card title="Agent Action 状态机" style={{ marginTop: 16 }}>
            <Form
              form={actionForm}
              data-testid="agent-action-form"
              layout="vertical"
              onFinish={handleCreateAgentAction}
              initialValues={{
                toolName: 'run_close_checklist',
                evidenceRefs: 'period:2026-01',
                payload: JSON.stringify({ fiscalYear: currentYear, periodNo: currentPeriod }, null, 2),
              }}
            >
              <Form.Item name="toolName" label="工具" rules={[{ required: true, message: '请选择工具' }]}>
                <Select
                  data-testid="agent-tool-select"
                  options={agentTools.map((tool) => ({
                    value: tool.name,
                    label: `${tool.title} / ${tool.name}`,
                  }))}
                  onChange={(value) => setSelectedAgentTool(agentTools.find((tool) => tool.name === value) ?? null)}
                />
              </Form.Item>
              {selectedAgentTool ? (
                <Alert
                  type={selectedAgentTool.riskLevel === 'high' ? 'warning' : 'info'}
                  showIcon
                  title="Tool Registry"
                  description={
                    <Space wrap>
                      <Tag color={selectedAgentTool.riskLevel === 'high' ? 'red' : selectedAgentTool.riskLevel === 'medium' ? 'orange' : 'green'}>
                        {selectedAgentTool.riskLevel}
                      </Tag>
                      <Tag>{selectedAgentTool.actionKind}</Tag>
                      <Tag>{`minApprovals: ${selectedAgentTool.approvalPolicy.minApprovals}`}</Tag>
                      <Tag>{`agentTokenAllowed: ${selectedAgentTool.agentTokenAllowed ? 'true' : 'false'}`}</Tag>
                    </Space>
                  }
                  style={{ marginBottom: 16 }}
                />
              ) : null}
              <Form.Item name="evidenceRefs" label="证据引用">
                <Input />
              </Form.Item>
              <Form.Item name="payload" label="参数 JSON">
                <TextArea rows={4} />
              </Form.Item>
              <Button block type="primary" icon={<RobotOutlined />} htmlType="submit" loading={actionLoading}>
                创建 dry-run
              </Button>
              <Button block loading={actionLoading} onClick={handleInvokeSelectedAgentTool}>
                Invoke 注册工具
              </Button>
            </Form>
          </Card>
          <Card
            title="Agent Action 审批队列"
            style={{ marginTop: 16 }}
            extra={
              <Button size="small" loading={actionQueueLoading} onClick={loadAgentActionQueue}>
                刷新
              </Button>
            }
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Select
                data-testid="agent-action-status-filter"
                allowClear
                placeholder="状态"
                style={{ minWidth: 180 }}
                value={agentActionFilters.status || undefined}
                onChange={(status) => setAgentActionFilters((filters) => ({ ...filters, status: status ?? '' }))}
                options={[
                  { value: 'dry_run_completed', label: 'dry_run_completed' },
                  { value: 'submitted_for_approval', label: 'submitted_for_approval' },
                  { value: 'approved', label: 'approved' },
                  { value: 'executed', label: 'executed' },
                  { value: 'reversed', label: 'reversed' },
                ]}
              />
              <Select
                data-testid="agent-action-risk-filter"
                allowClear
                placeholder="风险"
                style={{ minWidth: 120 }}
                value={agentActionFilters.riskLevel || undefined}
                onChange={(riskLevel) => setAgentActionFilters((filters) => ({ ...filters, riskLevel: riskLevel ?? '' }))}
                options={[
                  { value: 'low', label: 'low' },
                  { value: 'medium', label: 'medium' },
                  { value: 'high', label: 'high' },
                ]}
              />
              <Select
                data-testid="agent-action-tool-filter"
                allowClear
                showSearch
                placeholder="工具"
                style={{ minWidth: 220 }}
                value={agentActionFilters.toolName || undefined}
                onChange={(toolName) => setAgentActionFilters((filters) => ({ ...filters, toolName: toolName ?? '' }))}
                options={agentTools.map((tool) => ({ value: tool.name, label: tool.title || tool.name }))}
              />
            </Space>
            <Table
              data-testid="agent-action-queue-table"
              size="small"
              rowKey="id"
              loading={actionQueueLoading}
              pagination={false}
              dataSource={agentActionQueue?.items ?? []}
              columns={[
                {
                  title: '工具',
                  dataIndex: 'toolName',
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value: string) => <Tag color={value === 'executed' ? 'green' : value === 'submitted_for_approval' ? 'orange' : 'blue'}>{value}</Tag>,
                },
                {
                  title: '风险',
                  dataIndex: 'riskLevel',
                  render: (value: string) => <Tag color={value === 'high' ? 'red' : value === 'medium' ? 'orange' : 'green'}>{value}</Tag>,
                },
                {
                  title: '审批',
                  dataIndex: 'approvalProgress',
                  render: (value: any) => `${value?.approvedCount ?? 0}/${value?.requiredCount ?? 0}`,
                },
                {
                  title: '证据',
                  dataIndex: 'evidenceCount',
                },
                {
                  title: '操作',
                  render: (_: unknown, row: any) => (
                    <Button size="small" onClick={() => loadAgentActionDetail(row.id)}>
                      查看
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          {suggestion ? (
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="置信度" value={suggestion.confidence * 100} precision={0} suffix="%" />
                </Col>
                <Col span={8}>
                  <Statistic title="风险等级" value={suggestion.riskLevel} />
                </Col>
                <Col span={8}>
                  <Statistic title="人工确认" value={suggestion.approvalRequired ? '必需' : '无需'} />
                </Col>
              </Row>
              <Alert
                type="warning"
                showIcon
                title="审核提示"
                description={
                  <Space wrap>
                    {suggestion.warnings?.map((warning: string) => (
                      <Tag color="orange" key={warning}>
                        {warning}
                      </Tag>
                    ))}
                  </Space>
                }
              />
              <Table
                size="small"
                pagination={false}
                rowKey="lineNo"
                dataSource={suggestion.draft.lines}
                columns={[
                  { title: '行号', dataIndex: 'lineNo' },
                  { title: '摘要', dataIndex: 'summary' },
                  { title: '科目', dataIndex: 'accountCode' },
                  { title: '借方', dataIndex: 'debit', render: (value: number) => (value > 0 ? value : '') },
                  { title: '贷方', dataIndex: 'credit', render: (value: number) => (value > 0 ? value : '') },
                ]}
              />
              <Button type="primary" icon={<CheckOutlined />} loading={converting} onClick={handleConvert}>
                确认转凭证
              </Button>
            </Space>
          ) : (
            <Alert type="info" showIcon title="暂无建议" />
          )}
          {phase2AgentResult ? (
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              title="Phase 2 dry-run 结果"
              description={
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {JSON.stringify(phase2AgentResult.suggestions ?? phase2AgentResult.drafts ?? phase2AgentResult.findings ?? [], null, 2)}
                </pre>
              }
            />
          ) : null}
          {lastDraftGenerationError ? (
            <Alert
              style={{ marginTop: 16 }}
              type="error"
              showIcon
              title="failed LLM run"
              description={
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <div>{lastDraftGenerationError.message}</div>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify(
                      {
                        status: lastDraftGenerationError.status,
                        code: lastDraftGenerationError.code,
                        errorMessage: lastDraftGenerationError.errorMessage,
                        traceId: lastDraftGenerationError.traceId,
                      },
                      null,
                      2,
                    )}
                  </pre>
                  <Button
                    data-testid="agent-draft-retry-button"
                    icon={<RobotOutlined />}
                    loading={draftLoading}
                    onClick={() => draftCandidateForm.submit()}
                  >
                    閲嶈瘯鐢熸垚
                  </Button>
                </Space>
              }
            />
          ) : null}
          {draftCandidate ? (
            <Space orientation="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="候选草稿" value={draftCandidate.draftType} />
                </Col>
                <Col span={8}>
                  <Statistic title="状态" value={draftCandidate.status} />
                </Col>
                <Col span={8}>
                  <Statistic title="置信度" value={(draftCandidate.confidence ?? 0) * 100} precision={0} suffix="%" />
                </Col>
              </Row>
              <Alert
                type="info"
                showIcon
                title="LLM 草稿运行"
                description={`模型 ${draftCandidate.llmDraftRun?.model ?? '-'} / Provider ${
                  draftCandidate.llmDraftRun?.provider ?? '-'
                }，当前结果仍为 dry-run 候选草稿，保存前需要人工确认。`}
              />
              <Alert
                type="warning"
                showIcon
                title="未匹配项与 dry-run"
                description={
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify(
                      {
                        unmatchedItems: draftCandidate.unmatchedItems,
                        dryRunResult: draftCandidate.dryRunResult,
                        warnings: draftCandidate.warnings,
                      },
                      null,
                      2,
                    )}
                  </pre>
                }
              />
              <Card size="small" title="系统匹配主数据" data-testid="agent-draft-matched-master-data">
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(record: any) => `${record.field}:${record.objectId}`}
                  dataSource={draftCandidate.matchedMasterData ?? []}
                  columns={[
                    { title: '字段', dataIndex: 'field' },
                    { title: '对象', dataIndex: 'objectType' },
                    { title: '编码', dataIndex: 'code', render: (value: string | null) => value ?? '-' },
                    { title: '名称', dataIndex: 'name', render: (value: string | null) => value ?? '-' },
                    { title: '置信度', dataIndex: 'confidence', render: (value: number) => `${Math.round((value ?? 0) * 100)}%` },
                  ]}
                />
              </Card>
              <Card size="small" title="LLM 输入摘要" data-testid="agent-draft-llm-input-summary">
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {JSON.stringify(draftCandidate.llmDraftRun?.inputSummary ?? {}, null, 2)}
                </pre>
              </Card>
              <Table
                size="small"
                pagination={false}
                rowKey="attachmentId"
                dataSource={draftCandidate.ocrResults ?? []}
                columns={[
                  { title: '附件', dataIndex: 'attachmentId' },
                  { title: '本地 OCR', dataIndex: 'status' },
                  { title: '置信度', dataIndex: 'confidence', render: (value: number) => `${Math.round(value * 100)}%` },
                  { title: '原始文本', dataIndex: 'originalExtractedText', render: (value: string | null) => value ?? '-' },
                  { title: '抽取文本', dataIndex: 'extractedText' },
                  { title: '修正人', dataIndex: 'reviewedBy', render: (value: string | null) => value ?? '-' },
                  { title: '修正时间', dataIndex: 'reviewedAt', render: (value: string | null) => value ?? '-' },
                ]}
              />
              <Alert
                type="success"
                showIcon
                title="候选草稿 Payload"
                description={
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify(draftCandidate.draftPayload, null, 2)}
                  </pre>
                }
              />
              {[
                'voucher',
                'purchase_order',
                'sales_order',
                'inventory_movement',
                'material_requisition',
                'product_receipt',
                'stock_count',
                'master_data',
                'payroll_allocation',
                'depreciation_run',
                'asset_change',
                'report_interpretation',
              ].includes(draftCandidate.draftType) ? (
                <Card size="small" title="人工确认后的系统草稿">
                  <Space orientation="vertical" style={{ width: '100%' }}>
                    <TextArea
                      data-testid="agent-draft-resolved-unmatched-items"
                      rows={4}
                      value={resolvedUnmatchedItemsText}
                      onChange={(event) => setResolvedUnmatchedItemsText(event.target.value)}
                    />
                    <TextArea
                      rows={8}
                      value={reviewedDraftPayloadText}
                      onChange={(event) => setReviewedDraftPayloadText(event.target.value)}
                    />
                    <TextArea
                      data-testid="agent-draft-rejection-reason"
                      rows={2}
                      value={draftRejectionReason}
                      onChange={(event) => setDraftRejectionReason(event.target.value)}
                    />
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={draftConverting}
                      disabled={draftCandidate.status !== 'candidate'}
                      onClick={handleConvertDraftCandidate}
                    >
                      确认转系统草稿
                    </Button>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      loading={draftConverting}
                      disabled={draftCandidate.status !== 'candidate' || draftRejectionReason.trim() === ''}
                      onClick={handleRejectDraftCandidate}
                    >
                      拒绝候选草稿
                    </Button>
                  </Space>
                </Card>
              ) : null}
            </Space>
          ) : null}
          {agentAction ? (
            <Space orientation="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="Agent Action" value={agentAction.toolName} />
                </Col>
                <Col span={6}>
                  <Statistic title="状态" value={agentAction.status} />
                </Col>
                <Col span={6}>
                  <Statistic title="风险" value={agentAction.riskLevel} />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Approval Progress"
                    value={`${agentAction.approvalProgress?.approvedCount ?? 0}/${agentAction.approvalProgress?.requiredCount ?? 0}`}
                    suffix={`remaining ${agentAction.approvalProgress?.remainingCount ?? 0}`}
                  />
                </Col>
              </Row>
              {agentAction.auditSummary ? (
                <Card title="Agent Action 审计摘要" size="small">
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic
                        title="审批"
                        value={`${agentAction.auditSummary?.approvals?.approvedCount ?? 0}/${agentAction.auditSummary?.approvals?.requiredCount ?? 0}`}
                        suffix={`remaining ${agentAction.auditSummary?.approvals?.remainingCount ?? 0}`}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="证据校验"
                        value={agentAction.auditSummary?.evidence?.verificationStatus ?? 'pending'}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="Replay 事件"
                        value={agentAction.auditSummary?.replay?.eventCount ?? 0}
                        suffix={agentAction.auditSummary?.replay?.lastEventType ?? ''}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Mutation" value={agentAction.auditSummary?.mutationState ?? 'dry_run_only'} />
                    </Col>
                  </Row>
                  <Space wrap style={{ marginTop: 12 }}>
                    <Tag>{`dryRunStatus: ${agentAction.auditSummary?.dryRunStatus ?? '-'}`}</Tag>
                    <Tag>{`executionStatus: ${agentAction.auditSummary?.executionStatus ?? '-'}`}</Tag>
                    <Tag>{`verificationStatus: ${agentAction.auditSummary?.evidence?.verificationStatus ?? 'pending'}`}</Tag>
                    <Tag>{`mutationState: ${agentAction.auditSummary?.mutationState ?? 'dry_run_only'}`}</Tag>
                    {(agentAction.auditSummary?.nextActions ?? []).map((action: string) => (
                      <Tag color="blue" key={action}>{`nextActions: ${action}`}</Tag>
                    ))}
                  </Space>
                  <Table
                    style={{ marginTop: 12 }}
                    size="small"
                    pagination={false}
                    rowKey="eventType"
                    dataSource={(agentAction.auditSummary?.replay?.eventTypes ?? []).map((eventType: string, index: number) => ({
                      index: index + 1,
                      eventType,
                    }))}
                    columns={[
                      { title: '序号', dataIndex: 'index' },
                      { title: 'eventTypes', dataIndex: 'eventType' },
                    ]}
                  />
                </Card>
              ) : null}
              <Alert
                type="info"
                showIcon
                title="Agent Action dry-run"
                description={
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                    {JSON.stringify(agentAction.dryRunResult, null, 2)}
                  </pre>
                }
              />
              {agentAction.reversalResult ? (
                <Alert
                  type="warning"
                  showIcon
                  title="Agent Action reverse"
                  description={
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                      {JSON.stringify(agentAction.reversalResult, null, 2)}
                    </pre>
                  }
                />
              ) : null}
              <Card title="Agent 证据 Hash 快照" size="small">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="attachmentId"
                  dataSource={agentAction.evidenceSnapshots ?? []}
                  columns={[
                    { title: '附件', dataIndex: 'attachmentId' },
                    { title: 'SHA-256', dataIndex: 'checksum' },
                    { title: '大小', dataIndex: 'byteSize' },
                    { title: '存储', dataIndex: 'storageProvider' },
                    { title: '捕获时间', dataIndex: 'capturedAt' },
                  ]}
                />
              </Card>
              <Space wrap>
                <Button disabled={agentAction.status !== 'dry_run_completed'} loading={actionLoading} onClick={() => updateAgentAction('submit')}>
                  提交审批
                </Button>
                <Button disabled={agentAction.status !== 'submitted_for_approval'} loading={actionLoading} onClick={() => updateAgentAction('approve')}>
                  审批
                </Button>
                <Button disabled={agentAction.status !== 'approved'} loading={actionLoading} onClick={() => updateAgentAction('execute')}>
                  执行
                </Button>
                <Button disabled={agentAction.status !== 'executed'} loading={actionLoading} onClick={() => updateAgentAction('reverse')}>
                  Reverse
                </Button>
                <Button loading={actionLoading} onClick={loadAgentActionReplay}>
                  Replay 回放
                </Button>
              </Space>
              <TextArea
                data-testid="agent-action-reverse-reason"
                rows={2}
                disabled={agentAction.status !== 'executed'}
                value={agentReverseReason}
                onChange={(event) => setAgentReverseReason(event.target.value)}
                placeholder="填写反向处理原因"
              />
              {agentActionReplay ? (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={agentActionReplay.events ?? []}
                  rowClassName={(record: any) =>
                    agentEvidenceReplayEvents.includes(record.eventType) ? 'agent-evidence-replay-event' : ''
                  }
                  columns={[
                    { title: '事件', dataIndex: 'eventType' },
                    { title: '操作人', dataIndex: 'actorId' },
                    { title: '时间', dataIndex: 'createdAt' },
                    {
                      title: '载荷',
                      dataIndex: 'payload',
                      render: (_: unknown, record: any) => (
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(record.payload ?? {}, null, 2)}</pre>
                      ),
                    },
                  ]}
                />
              ) : null}
            </Space>
          ) : null}
        </Col>
      </Row>
    </Space>
  );
};
