import React, { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Form, Input, InputNumber, Select, Space, Table, Tag, Typography } from 'antd';
import { LockOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { api } from '../api';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';
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

const statusLabel: Record<string, string> = {
  calculated: '已计算',
  locked: '已锁定',
  draft: '草稿',
};

const runModeLabel: Record<string, string> = {
  formal: '正式',
  simulation: '模拟',
};

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
          <Title level={3} style={{ margin: 0 }}>报表计算</Title>
          <Text type="secondary">执行报表取数、保存快照、查看追溯链并锁定正式报表。</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>刷新</Button>
      </div>

      <Form form={form} layout="inline" initialValues={{ fiscalYear: currentYear, periodNo: currentPeriod, runMode: 'formal', includeUnposted: false }} style={{ marginBottom: 16 }}>
        <Form.Item name="templateVersionId" rules={[{ required: true }]}>
          <Input style={{ width: 260 }} placeholder="已发布模板版本ID" />
        </Form.Item>
        <Form.Item name="fiscalYear"><InputNumber style={{ width: 120 }} placeholder="年度" /></Form.Item>
        <Form.Item name="periodNo"><InputNumber style={{ width: 120 }} placeholder="期间" /></Form.Item>
        <Form.Item name="runMode">
          <Select style={{ width: 140 }} options={[{ value: 'formal', label: '正式' }, { value: 'simulation', label: '模拟' }]} />
        </Form.Item>
        <Form.Item name="includeUnposted" valuePropName="checked">
          <Checkbox>包含未记账凭证</Checkbox>
        </Form.Item>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={createRun}>计算</Button>
      </Form>

      <Table
        rowKey="id"
        dataSource={runs}
        loading={loading}
        pagination={false}
        onRow={(record) => ({ onClick: () => { setSelectedRunId(record.id); setSelectedRun(record); setCellDrilldown(null); } })}
        columns={[
          { title: '计算ID', dataIndex: 'id' },
          { title: '模板版本', dataIndex: 'templateVersionId' },
          { title: '年度', dataIndex: 'fiscalYear' },
          { title: '期间', dataIndex: 'periodNo' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: string) => <Tag color={status === 'locked' ? 'green' : 'blue'}>{statusLabel[status] ?? status}</Tag>,
          },
          { title: '模式', render: (_, record) => runModeLabel[record.runMode] ?? record.renderMode },
          {
            title: 'Agent',
            render: (_, record) => (
              <AgentDraftEntryButton
                size="small"
                draftType="report_interpretation"
                sourceObjectType="report_run"
                sourceObjectId={record.id}
                userInstruction={`Generate report interpretation draft from ${record.snapshotHash}.`}
              >
                Agent
              </AgentDraftEntryButton>
            ),
          },
        ]}
      />

      <Space style={{ marginTop: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={() => loadRunDetail()} disabled={!selectedRunId}>详情</Button>
        <Button icon={<SyncOutlined />} onClick={recalculateRun} disabled={!selectedRunId}>重新计算</Button>
        <Button icon={<LockOutlined />} onClick={lockRun} disabled={!selectedRunId}>锁定</Button>
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
              { title: '页签', dataIndex: 'sheetCode' },
              { title: '单元格', dataIndex: 'cellAddress' },
              { title: '标签', dataIndex: 'label' },
              { title: '公式', dataIndex: 'formulaText' },
              { title: '数值', dataIndex: 'calculatedValue' },
              { title: '格式', dataIndex: 'displayFormat' },
              { title: '追溯ID', dataIndex: 'traceId' },
              {
                title: '穿透',
                render: (_, record: ReportRunCell) => (
                  <Button size="small" icon={<SearchOutlined />} onClick={() => loadCellDrilldown(record)}>
                    打开
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
                  { title: '科目', dataIndex: 'accountCode' },
                  { title: '年度', dataIndex: 'fiscalYear' },
                  { title: '期间', dataIndex: 'periodNo' },
                  { title: '快照金额', dataIndex: 'snapshotAmount' },
                  { title: '来源', dataIndex: 'sourceType' },
                ]}
              />
              <Table
                rowKey="id"
                dataSource={cellDrilldown.ledgerEntries}
                pagination={false}
                size="small"
                columns={[
                  { title: '科目', dataIndex: 'accountCode' },
                  { title: '名称', dataIndex: 'accountName' },
                  { title: '借方', dataIndex: 'debit' },
                  { title: '贷方', dataIndex: 'credit' },
                  { title: '凭证', dataIndex: 'voucherNo' },
                ]}
              />
              <Table
                rowKey="id"
                dataSource={cellDrilldown.vouchers}
                pagination={false}
                size="small"
                columns={[
                  { title: '凭证号', dataIndex: 'voucherNo' },
                  { title: '日期', dataIndex: 'voucherDate' },
                  { title: '状态', dataIndex: 'status' },
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
