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
          <Title level={3} style={{ margin: 0 }}>Management Analysis</Title>
          <Text type="secondary">Purchase, sales gross margin, inventory, aging, cash-flow, labor, depreciation, and operating drilldowns.</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchAnalysis} loading={loading}>Refresh</Button>
      </div>

      {analysis?.warnings?.length ? (
        <Alert
          type="warning"
          showIcon
          title="Warnings"
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
            title: 'Metric',
            dataIndex: 'label',
            render: (label: string, record) => (
              <Space>
                <Text strong={record.key === selectedMetricKey}>{label}</Text>
                <Tag>{record.key}</Tag>
              </Space>
            ),
          },
          { title: 'Amount', dataIndex: 'amount', align: 'right', render: (value: number) => formatAmount(value) },
          { title: 'Count', dataIndex: 'count', align: 'right' },
          { title: 'Ratio', dataIndex: 'ratio', align: 'right', render: (value?: number) => (value == null ? '-' : formatAmount(value)) },
          { title: 'Drilldown', dataIndex: ['drilldown', 'path'] },
        ]}
      />

      <Table
        rowKey={(record) => `${record.sourceType}:${record.sourceId ?? record.sourceNo}`}
        dataSource={drilldownRows}
        pagination={false}
        size="small"
        style={{ marginTop: 16 }}
        title={() => `Drilldowns - ${selectedMetricKey}`}
        columns={[
          { title: 'Source', dataIndex: 'sourceType' },
          { title: 'No', dataIndex: 'sourceNo' },
          { title: 'Partner / Item', render: (_, record) => record.partnerName ?? record.itemName ?? '-' },
          { title: 'Amount', dataIndex: 'amount', align: 'right', render: (value?: number) => (value == null ? '-' : formatAmount(value)) },
          { title: 'Remaining', dataIndex: 'remainingAmount', align: 'right', render: (value?: number) => (value == null ? '-' : formatAmount(value)) },
          { title: 'Quantity', dataIndex: 'quantity', align: 'right' },
          { title: 'Date', render: (_, record) => record.documentDate ?? record.dueDate ?? '-' },
          { title: 'Days past due', dataIndex: 'daysPastDue', align: 'right' },
        ]}
      />
    </div>
  );
};
