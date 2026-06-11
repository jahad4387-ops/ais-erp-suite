import React, { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Form, Input, InputNumber, Select, Space, Table, Tag, Typography } from 'antd';
import { LockOutlined, PlayCircleOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

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
  cells: Array<{
    id: string;
    sheetCode: string;
    cellAddress: string;
    label?: string | null;
    formulaText?: string | null;
    calculatedValue: number;
    displayFormat?: string | null;
    traceId: string;
  }>;
  traceLinks: Array<{
    id: string;
    traceId: string;
    sourceType: string;
    accountCode?: string | null;
    amount: number;
  }>;
};

const { Text, Title } = Typography;

export const ReportRuns: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedRun, setSelectedRun] = useState<ReportRun | null>(null);
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
    await fetchRuns();
  };

  const loadRunDetail = async (runId = selectedRunId) => {
    if (!runId) return;
    const detail = await api.get(`/report-runs/${selectedRunId}`);
    setSelectedRun(detail);
  };

  const recalculateRun = async () => {
    if (!selectedRunId) return;
    const detail = await api.post(`/report-runs/${selectedRunId}/recalculate`, { recalculatedBy: currentUser });
    setSelectedRun(detail);
    await fetchRuns();
  };

  const lockRun = async () => {
    if (!selectedRunId) return;
    const detail = await api.post(`/report-runs/${selectedRunId}/lock`, { lockedBy: currentUser });
    setSelectedRun(detail);
    await fetchRuns();
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
        onRow={(record) => ({ onClick: () => { setSelectedRunId(record.id); setSelectedRun(record); } })}
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
            ]}
          />
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f8fa', padding: 12, borderRadius: 6 }}>
            {JSON.stringify({ renderMode: selectedRun.renderMode, traceLinks: selectedRun.traceLinks }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
