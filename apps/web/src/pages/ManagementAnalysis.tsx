import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type ManagementMetricKey =
  | 'purchaseTrend'
  | 'salesGrossMargin'
  | 'inventoryTurnover'
  | 'counterpartyAging'
  | 'cashFlow'
  | 'laborCost'
  | 'depreciationCost'
  | 'operatingOverview';

type ManagementMetric = {
  key: ManagementMetricKey;
  label: string;
  amount: number;
  count: number;
  denominatorAmount?: number;
  ratio?: number;
  overdueAmount?: number;
  drilldown: { sourceType: string; path: string };
};

type ManagementWarning = {
  code: string;
  severity: string;
  message: string;
  evidenceRefs: string[];
  drilldown: { sourceType: string; path: string };
};

type DrilldownRow = {
  sourceType?: string;
  sourceId?: string;
  sourceNo?: string;
  partnerName?: string;
  itemName?: string;
  amount?: number;
  remainingAmount?: number;
  quantity?: number;
  documentDate?: string;
  dueDate?: string;
  daysPastDue?: number;
};

type ManagementAnalysisPayload = {
  metrics: ManagementMetric[];
  warnings: ManagementWarning[];
  drilldowns: Record<string, { rows: DrilldownRow[] }>;
};

const { Text, Title } = Typography;

const expectedMetricKeys: ManagementMetricKey[] = [
  'purchaseTrend',
  'salesGrossMargin',
  'inventoryTurnover',
  'counterpartyAging',
  'cashFlow',
  'laborCost',
  'depreciationCost',
  'operatingOverview',
];

const formatAmount = (value?: number) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const metricLabel: Record<ManagementMetricKey, string> = {
  purchaseTrend: '采购趋势',
  salesGrossMargin: '销售毛利',
  inventoryTurnover: '存货周转',
  counterpartyAging: '往来账龄',
  cashFlow: '现金流',
  laborCost: '人工成本',
  depreciationCost: '折旧成本',
  operatingOverview: '经营概览',
};

export const ManagementAnalysis: React.FC = () => {
  const { currentAccountSetId, currentPeriod, currentYear } = useAppContext();
  const [analysis, setAnalysis] = useState<ManagementAnalysisPayload | null>(null);
  const [selectedMetricKey, setSelectedMetricKey] = useState<ManagementMetricKey>('purchaseTrend');
  const [loading, setLoading] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const payload = await api.get(`/management-analysis?accountSetId=${currentAccountSetId}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`);
      setAnalysis(payload);
      const firstKey = payload?.metrics?.[0]?.key;
      if (firstKey) {
        setSelectedMetricKey(firstKey);
      }
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, currentPeriod, currentYear]);

  useEffect(() => {
    void fetchAnalysis();
  }, [fetchAnalysis]);

  const metrics = useMemo(() => {
    const byKey = new Map((analysis?.metrics ?? []).map((metric) => [metric.key, metric]));
    return expectedMetricKeys.map((key) => byKey.get(key)).filter(Boolean) as ManagementMetric[];
  }, [analysis]);
  const drilldownRows = analysis?.drilldowns?.[selectedMetricKey]?.rows ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>经营分析</Title>
          <Text type="secondary">汇总采购、销售毛利、存货、账龄、现金流、人工、折旧与经营指标，并支持穿透查看来源。</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchAnalysis} loading={loading}>刷新</Button>
      </div>

      {analysis?.warnings?.length ? (
        <Alert
          type="warning"
          showIcon
          title="风险提示"
          style={{ marginBottom: 16 }}
          description={analysis.warnings.map((warning) => `${warning.code}: ${warning.message}`).join(' / ')}
        />
      ) : null}

      <Table
        rowKey="key"
        dataSource={metrics}
        loading={loading}
        pagination={false}
        onRow={(record) => ({ onClick: () => setSelectedMetricKey(record.key) })}
        columns={[
          {
            title: '指标',
            dataIndex: 'label',
            render: (_label: string, record) => (
              <Space>
                <Text strong={record.key === selectedMetricKey}>{metricLabel[record.key] ?? record.key}</Text>
                <Tag>{record.key}</Tag>
              </Space>
            ),
          },
          { title: '金额', dataIndex: 'amount', align: 'right', render: (value: number) => formatAmount(value) },
          { title: '数量', dataIndex: 'count', align: 'right' },
          { title: '比率', dataIndex: 'ratio', align: 'right', render: (value?: number) => (value == null ? '-' : formatAmount(value)) },
          { title: '穿透路径', dataIndex: ['drilldown', 'path'] },
        ]}
      />

      <Table
        rowKey={(record) => `${record.sourceType}:${record.sourceId ?? record.sourceNo}`}
        dataSource={drilldownRows}
        pagination={false}
        size="small"
        style={{ marginTop: 16 }}
        title={() => `穿透明细 - ${metricLabel[selectedMetricKey] ?? selectedMetricKey}`}
        columns={[
          { title: '来源', dataIndex: 'sourceType' },
          { title: '单号', dataIndex: 'sourceNo' },
          { title: '往来单位/存货', render: (_, record) => record.partnerName ?? record.itemName ?? '-' },
          { title: '金额', dataIndex: 'amount', align: 'right', render: (value?: number) => (value == null ? '-' : formatAmount(value)) },
          { title: '剩余金额', dataIndex: 'remainingAmount', align: 'right', render: (value?: number) => (value == null ? '-' : formatAmount(value)) },
          { title: '数量', dataIndex: 'quantity', align: 'right' },
          { title: '日期', render: (_, record) => record.documentDate ?? record.dueDate ?? '-' },
          { title: '逾期天数', dataIndex: 'daysPastDue', align: 'right' },
        ]}
      />
    </div>
  );
};
