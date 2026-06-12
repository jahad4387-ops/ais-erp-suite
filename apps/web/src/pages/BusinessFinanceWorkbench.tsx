import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Table, Tag, Typography, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type SourceTrace = {
  sourceType: string;
  sourceDocumentId?: string;
  sourceDocumentNo?: string;
  links: Array<{
    sourceType: string;
    sourceDocumentId: string;
    sourceDocumentNo?: string;
    sourceMovementId?: string;
    amount?: number;
    status?: string;
  }>;
};

type VoucherDraftRow = {
  id: string;
  workOrderNo: string;
  costAllocationId: string;
  status: string;
  totalAmount: number;
  approvalRequired: boolean;
  sourceTrace: SourceTrace;
};

type ReconciliationException = {
  id: string;
  fiscalYear: number;
  periodNo: number;
  inventoryBalanceTotal: number;
  costAdjustmentTotal: number;
  differenceAmount: number;
};

type CloseBlock = {
  code: string;
  severity: string;
  sourceType: string;
  sourceDocumentId: string;
  sourceDocumentNo: string;
  message: string;
  evidenceRefs: string[];
};

type BusinessFinanceWorkbenchPayload = {
  summary: {
    pendingVoucherDrafts: number;
    voucherDraftsRequiringApproval: number;
    inventoryReconciliationExceptions: number;
    supplyChainCloseBlocks: number;
  };
  queues: {
    voucherDrafts: VoucherDraftRow[];
    inventoryReconciliationExceptions: ReconciliationException[];
    closeBlocks: CloseBlock[];
  };
};

const { Text } = Typography;

const severityColor: Record<string, string> = {
  low: 'blue',
  medium: 'orange',
  high: 'red',
};

export const BusinessFinanceWorkbench: React.FC = () => {
  const { currentAccountSetId, currentAccountSetName, currentPeriod, currentYear } = useAppContext();
  const [payload, setPayload] = useState<BusinessFinanceWorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const result = await api.get(`/business-finance/workbench?accountSetId=${encodeURIComponent(currentAccountSetId)}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`);
      setPayload(result);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, currentPeriod, currentYear]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = payload?.summary;
  const voucherDrafts = payload?.queues.voucherDrafts ?? [];
  const inventoryReconciliationExceptions = payload?.queues.inventoryReconciliationExceptions ?? [];
  const closeBlocks = payload?.queues.closeBlocks ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>业财工作台</h2>
          <Text type="secondary">
            {currentAccountSetName} / {currentYear}-{String(currentPeriod).padStart(2, '0')}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
      </div>

      <Alert
        style={{ marginBottom: 16 }}
        type={closeBlocks.length > 0 ? 'warning' : 'success'}
        showIcon
        description="供应链制造中心推送的成本凭证草稿、库存对账差异和结账阻断会集中进入这里，财务复核后再进入正式凭证与期间关闭。"
      />

      <Descriptions bordered size="small" column={4} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="待生成/待处理凭证">{summary?.pendingVoucherDrafts ?? 0}</Descriptions.Item>
        <Descriptions.Item label="待审核凭证">{summary?.voucherDraftsRequiringApproval ?? 0}</Descriptions.Item>
        <Descriptions.Item label="对账异常">{summary?.inventoryReconciliationExceptions ?? 0}</Descriptions.Item>
        <Descriptions.Item label="结账阻断">{summary?.supplyChainCloseBlocks ?? 0}</Descriptions.Item>
      </Descriptions>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={voucherDrafts}
        expandable={{
          expandedRowRender: (record) => (
            <Table
              rowKey={(row) => `${row.sourceType}:${row.sourceDocumentId}`}
              size="small"
              pagination={false}
              dataSource={record.sourceTrace?.links ?? []}
              columns={[
                { title: '来源类型', dataIndex: 'sourceType' },
                { title: '来源单号', dataIndex: 'sourceDocumentNo' },
                { title: '来源ID', dataIndex: 'sourceDocumentId' },
                { title: '库存移动', dataIndex: 'sourceMovementId' },
                { title: '金额', dataIndex: 'amount' },
              ]}
            />
          ),
        }}
        columns={[
          { title: '工单', dataIndex: 'workOrderNo' },
          { title: '成本分摊单', dataIndex: 'costAllocationId' },
          { title: '金额', dataIndex: 'totalAmount' },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
          {
            title: '审核',
            dataIndex: 'approvalRequired',
            render: (value: boolean) => (value ? <Tag color="orange">待审核</Tag> : <Tag color="green">已通过</Tag>),
          },
          { title: '来源链路', render: (_: unknown, record: VoucherDraftRow) => record.sourceTrace?.sourceDocumentNo ?? '-' },
        ]}
      />

      <Table
        rowKey="id"
        style={{ marginTop: 16 }}
        size="small"
        loading={loading}
        dataSource={inventoryReconciliationExceptions}
        columns={[
          { title: '期间', render: (_: unknown, row: ReconciliationException) => `${row.fiscalYear}-${String(row.periodNo).padStart(2, '0')}` },
          { title: '库存余额', dataIndex: 'inventoryBalanceTotal' },
          { title: '成本调整', dataIndex: 'costAdjustmentTotal' },
          { title: '差异', dataIndex: 'differenceAmount', render: (value: number) => <Tag color={value === 0 ? 'green' : 'orange'}>{value}</Tag> },
        ]}
      />

      <Table
        rowKey={(record) => `${record.code}:${record.sourceDocumentId}`}
        style={{ marginTop: 16 }}
        size="small"
        loading={loading}
        dataSource={closeBlocks}
        columns={[
          { title: '阻断类型', dataIndex: 'code' },
          { title: '来源', dataIndex: 'sourceType' },
          { title: '来源单号', dataIndex: 'sourceDocumentNo' },
          { title: '说明', dataIndex: 'message' },
          { title: '风险', dataIndex: 'severity', render: (value: string) => <Tag color={severityColor[value] ?? 'default'}>{value}</Tag> },
        ]}
      />
    </div>
  );
};
