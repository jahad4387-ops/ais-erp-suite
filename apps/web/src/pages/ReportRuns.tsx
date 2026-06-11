import React, { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Form, Input, InputNumber, Select, Space, Table, Tag, Typography } from 'antd';
import { LockOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type ReportRunCell = {
  id: string;
  sheetCode: string;
  cellAddress: string;
  label?: string | null;
  formulaText?: string | null;
  calculatedValue: number;
  displayFormat?: string | null;
  traceId: string;
};

type ReportRun = {
  id: string;
  templateVersionId: string;
  fiscalYear: number;
  periodNo: number;
  includeUnposted: boolean;
  runMode: string;
  status: string;
  snapshotHash: string;
  renderMode: string;
  cells: ReportRunCell[];
  traceLinks: Array<{
    id: string;
    traceId: string;
    sourceType: string;
    accountCode?: string | null;
    amount: number;
  }>;
};

type ReportRunCellDrilldown = {
  reportRunId: string;
  renderMode: string;
  snapshotHash: string;
  cell: ReportRunCell;
  traceLinks: ReportRun['traceLinks'];
  sourceBalances: Array<{
    sourceType: string;
    sourceDocumentId?: string | null;
    accountCode?: string | null;
    fiscalYear: number;
    periodNo: number;
    snapshotAmount: number;
  }>;
  ledgerEntries: Array<{
    id: string;
    accountCode?: string | null;
    accountName?: string | null;
    debit?: number;
    credit?: number;
    voucherId?: string | null;
    voucherNo?: string | null;
  }>;
  vouchers: Array<{
    id: string;
    voucherNo?: string | null;
    voucherDate?: string | null;
    status?: string | null;
  }>;
};

const { Text, Title } = Typography;

export const ReportRuns: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedRun, setSelectedRun] = useState<ReportRun | null>(null);
  const [cellDrilldown, setCellDrilldown] = useState<ReportRunCellDrilldown | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRuns = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const rows = await api.get(`/report-runs?accountSetId=${currentAccountSetId}`);
      setRuns(rows ?? []);
      if (!selectedRunId && rows?.[0]?.id) {
        setSelectedRunId(rows[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, selectedRunId]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  const createRun = async () => {
    const values = await form.validateFields();
    const run = await api.post('/report-runs', {
      accountSetId: currentAccountSetId,
      templateVersionId: values.templateVersionId,
      fiscalYear: values.fiscalYear ?? currentYear,
      periodNo: values.periodNo ?? currentPeriod,
      includeUnposted: values.includeUnposted ?? false,
      runMode: values.runMode ?? 'formal',
      createdBy: currentUser,
    });
    setSelectedRunId(run.id);
    setSelectedRun(run);
    setCellDrilldown(null);
    await fetchRuns();
  };

  const loadRunDetail = async (runId = selectedRunId) => {
    if (!runId) return;
    const detail = await api.get(`/report-runs/${selectedRunId}`);
    setSelectedRun(detail);
    setCellDrilldown(null);
  };

  const recalculateRun = async () => {
    if (!selectedRunId) return;
    const detail = await api.post(`/report-runs/${selectedRunId}/recalculate`, { recalculatedBy: currentUser });
    setSelectedRun(detail);
    setCellDrilldown(null);
    await fetchRuns();
  };

  const lockRun = async () => {
    if (!selectedRunId) return;
    const detail = await api.post(`/report-runs/${selectedRunId}/lock`, { lockedBy: currentUser });
    setSelectedRun(detail);
    setCellDrilldown(null);
    await fetchRuns();
  };

  const loadCellDrilldown = async (record: ReportRunCell) => {
    if (!selectedRunId) return;
    const detail = await api.get(`/report-runs/${selectedRunId}/cells/${record.cellAddress}/drilldown`);
    setCellDrilldown(detail);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Report Runs</Title>
          <Text type="secondary">Formula snapshots, calculatedValue, traceLinks, and locked snapshot renderMode.</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>Refresh</Button>
      </div>

      <Form form={form} layout="inline" initialValues={{ fiscalYear: currentYear, periodNo: currentPeriod, runMode: 'formal', includeUnposted: false }} style={{ marginBottom: 16 }}>
        <Form.Item name="templateVersionId" rules={[{ required: true }]}>
          <Input style={{ width: 260 }} placeholder="Published template version id" />
        </Form.Item>
        <Form.Item name="fiscalYear"><InputNumber style={{ width: 120 }} placeholder="Year" /></Form.Item>
        <Form.Item name="periodNo"><InputNumber style={{ width: 120 }} placeholder="Period" /></Form.Item>
        <Form.Item name="runMode">
          <Select style={{ width: 140 }} options={[{ value: 'formal', label: 'Formal' }, { value: 'simulation', label: 'Simulation' }]} />
        </Form.Item>
        <Form.Item name="includeUnposted" valuePropName="checked">
          <Checkbox>includeUnposted</Checkbox>
        </Form.Item>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={createRun}>Run</Button>
      </Form>

      <Table
        rowKey="id"
        dataSource={runs}
        loading={loading}
        pagination={false}
        onRow={(record) => ({ onClick: () => { setSelectedRunId(record.id); setSelectedRun(record); setCellDrilldown(null); } })}
        columns={[
          { title: 'Run id', dataIndex: 'id' },
          { title: 'Template version', dataIndex: 'templateVersionId' },
          { title: 'Year', dataIndex: 'fiscalYear' },
          { title: 'Period', dataIndex: 'periodNo' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: string) => <Tag color={status === 'locked' ? 'green' : 'blue'}>{status}</Tag>,
          },
          { title: 'Render', dataIndex: 'renderMode' },
        ]}
      />

      <Space style={{ marginTop: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={() => loadRunDetail()} disabled={!selectedRunId}>Detail</Button>
        <Button icon={<SyncOutlined />} onClick={recalculateRun} disabled={!selectedRunId}>Recalculate</Button>
        <Button icon={<LockOutlined />} onClick={lockRun} disabled={!selectedRunId}>Lock</Button>
      </Space>

      {selectedRun && (
        <div style={{ marginTop: 16 }}>
          <Text strong>{selectedRun.snapshotHash}</Text>
          <Table
            rowKey="id"
            dataSource={selectedRun.cells}
            pagination={false}
            size="small"
            columns={[
              { title: 'Sheet', dataIndex: 'sheetCode' },
              { title: 'Cell', dataIndex: 'cellAddress' },
              { title: 'Label', dataIndex: 'label' },
              { title: 'Formula', dataIndex: 'formulaText' },
              { title: 'Value', dataIndex: 'calculatedValue' },
              { title: 'Format', dataIndex: 'displayFormat' },
              { title: 'Trace', dataIndex: 'traceId' },
              {
                title: 'Drilldown',
                render: (_, record: ReportRunCell) => (
                  <Button size="small" icon={<SearchOutlined />} onClick={() => loadCellDrilldown(record)}>
                    Open
                  </Button>
                ),
              },
            ]}
          />
          {cellDrilldown && (
            <div style={{ width: '100%', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Text strong>
                {cellDrilldown.cell.sheetCode}!{cellDrilldown.cell.cellAddress} {cellDrilldown.renderMode}
              </Text>
              <Table
                rowKey={(record) => `${record.accountCode}-${record.fiscalYear}-${record.periodNo}`}
                dataSource={cellDrilldown.sourceBalances}
                pagination={false}
                size="small"
                columns={[
                  { title: 'Account', dataIndex: 'accountCode' },
                  { title: 'Year', dataIndex: 'fiscalYear' },
                  { title: 'Period', dataIndex: 'periodNo' },
                  { title: 'Snapshot amount', dataIndex: 'snapshotAmount' },
                  { title: 'Source', dataIndex: 'sourceType' },
                ]}
              />
              <Table
                rowKey="id"
                dataSource={cellDrilldown.ledgerEntries}
                pagination={false}
                size="small"
                columns={[
                  { title: 'Account', dataIndex: 'accountCode' },
                  { title: 'Name', dataIndex: 'accountName' },
                  { title: 'Debit', dataIndex: 'debit' },
                  { title: 'Credit', dataIndex: 'credit' },
                  { title: 'Voucher', dataIndex: 'voucherNo' },
                ]}
              />
              <Table
                rowKey="id"
                dataSource={cellDrilldown.vouchers}
                pagination={false}
                size="small"
                columns={[
                  { title: 'Voucher no', dataIndex: 'voucherNo' },
                  { title: 'Date', dataIndex: 'voucherDate' },
                  { title: 'Status', dataIndex: 'status' },
                ]}
              />
            </div>
          )}
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f8fa', padding: 12, borderRadius: 6 }}>
            {JSON.stringify({ renderMode: selectedRun.renderMode, traceLinks: selectedRun.traceLinks }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
