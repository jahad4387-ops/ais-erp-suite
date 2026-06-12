import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Select, Space, Table, Typography } from 'antd';
import { DownloadOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type ReportExport = {
  id: string;
  reportRunId: string;
  fileType: string;
  snapshotHash: string;
  downloadUrl: string;
  sensitiveFieldNotice?: string | null;
  exportedBy: string;
  createdAt: string;
};

type AiReportInterpretation = {
  id: string;
  reportRunId: string;
  summary: string;
  keyFindings: string[];
  warnings: string[];
  evidenceRefs: string[];
  interpretedBy: string;
};

const { Text, Title } = Typography;

export const ReportExportCenter: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [exports, setExports] = useState<ReportExport[]>([]);
  const [interpretations, setInterpretations] = useState<AiReportInterpretation[]>([]);
  const [reportRunId, setReportRunId] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchExports = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const rows = await api.get(`/report-exports?accountSetId=${currentAccountSetId}`);
      setExports(rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchExports();
  }, [fetchExports]);

  const createExport = async () => {
    const values = await form.validateFields(['reportRunId', 'fileType']);
    setReportRunId(values.reportRunId);
    await api.post(`/report-runs/${values.reportRunId}/exports`, {
      fileType: values.fileType,
      exportedBy: currentUser,
    });
    await fetchExports();
  };

  const createInterpretation = async () => {
    const values = await form.validateFields(['reportRunId', 'summary', 'keyFindings', 'warnings', 'evidenceRefs']);
    setReportRunId(values.reportRunId);
    const keyFindings = String(values.keyFindings ?? '').split('\n').filter(Boolean);
    const warnings = String(values.warnings ?? '').split('\n').filter(Boolean);
    const evidenceRefs = String(values.evidenceRefs ?? '').split('\n').filter(Boolean);
    await api.post(`/report-runs/${values.reportRunId}/interpretations`, {
      summary: values.summary,
      keyFindings,
      warnings,
      evidenceRefs,
      interpretedBy: currentUser,
    });
    const rows = await api.get(`/ai-report-interpretations?reportRunId=${values.reportRunId}`);
    setInterpretations(rows ?? []);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>报表导出中心</Title>
          <Text type="secondary">导出经审计的 Excel/PDF 报表，并维护带证据引用的 AI 解读。</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchExports} loading={loading}>刷新</Button>
      </div>

      <Form form={form} layout="vertical" initialValues={{
        fileType: 'excel',
        summary: '经营摘要草稿。',
        keyFindings: '现金期末余额发生变化。',
        warnings: '',
        evidenceRefs: 'report_cell:BS!B12',
      }}>
        <Space align="start" size={16} wrap>
          <Form.Item name="reportRunId" label="报表计算ID" rules={[{ required: true }]}>
            <Input style={{ width: 280 }} onChange={(event) => setReportRunId(event.target.value)} />
          </Form.Item>
          <Form.Item name="fileType" label="文件类型">
            <Select style={{ width: 140 }} options={[{ value: 'excel', label: 'Excel' }, { value: 'pdf', label: 'PDF' }]} />
          </Form.Item>
          <Button type="primary" icon={<DownloadOutlined />} onClick={createExport} style={{ marginTop: 30 }}>导出</Button>
        </Space>

        <Form.Item name="summary" label="AI 摘要">
          <Input />
        </Form.Item>
        <Form.Item name="keyFindings" label="关键发现">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="warnings" label="风险提示">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="evidenceRefs" label="证据引用">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Button icon={<RobotOutlined />} onClick={createInterpretation} disabled={!reportRunId}>生成解读</Button>
      </Form>

      <Table
        rowKey="id"
        dataSource={exports}
        loading={loading}
        style={{ marginTop: 16 }}
        columns={[
          { title: '导出ID', dataIndex: 'id' },
          { title: '计算单', dataIndex: 'reportRunId' },
          { title: '类型', dataIndex: 'fileType' },
          { title: '快照', dataIndex: 'snapshotHash' },
          { title: '下载地址', dataIndex: 'downloadUrl' },
          { title: '提示', dataIndex: 'sensitiveFieldNotice' },
        ]}
      />

      <Table
        rowKey="id"
        dataSource={interpretations}
        pagination={false}
        style={{ marginTop: 16 }}
        columns={[
          { title: '摘要', dataIndex: 'summary' },
          { title: '关键发现', dataIndex: 'keyFindings', render: (rows: string[]) => rows?.join('; ') },
          { title: '风险提示', dataIndex: 'warnings', render: (rows: string[]) => rows?.join('; ') },
          { title: '证据引用', dataIndex: 'evidenceRefs', render: (rows: string[]) => rows?.join('; ') },
        ]}
      />
    </div>
  );
};
