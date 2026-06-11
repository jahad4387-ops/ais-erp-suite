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
    await api.post(`/report-runs/${reportRunId}/exports`, {
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
    await api.post(`/report-runs/${reportRunId}/interpretations`, {
      summary: values.summary,
      keyFindings,
      warnings,
      evidenceRefs,
      interpretedBy: currentUser,
    });
    const rows = await api.get(`/ai-report-interpretations?reportRunId=${reportRunId}`);
    setInterpretations(rows ?? []);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Report Export Center</Title>
          <Text type="secondary">Audited Excel/PDF exports and evidence-backed AI report interpretations.</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchExports} loading={loading}>Refresh</Button>
      </div>

      <Form form={form} layout="vertical" initialValues={{
        fileType: 'excel',
        summary: 'Operating summary draft.',
        keyFindings: 'Cash closing balance changed.',
        warnings: '',
        evidenceRefs: 'report_cell:BS!B12',
      }}>
        <Space align="start" size={16} wrap>
          <Form.Item name="reportRunId" label="Report run id" rules={[{ required: true }]}>
            <Input style={{ width: 280 }} onChange={(event) => setReportRunId(event.target.value)} />
          </Form.Item>
          <Form.Item name="fileType" label="File type">
            <Select style={{ width: 140 }} options={[{ value: 'excel', label: 'Excel' }, { value: 'pdf', label: 'PDF' }]} />
          </Form.Item>
          <Button type="primary" icon={<DownloadOutlined />} onClick={createExport} style={{ marginTop: 30 }}>Export</Button>
        </Space>

        <Form.Item name="summary" label="AI summary">
          <Input />
        </Form.Item>
        <Form.Item name="keyFindings" label="keyFindings">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="warnings" label="warnings">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="evidenceRefs" label="evidenceRefs">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Button icon={<RobotOutlined />} onClick={createInterpretation} disabled={!reportRunId}>Create Interpretation</Button>
      </Form>

      <Table
        rowKey="id"
        dataSource={exports}
        loading={loading}
        style={{ marginTop: 16 }}
        columns={[
          { title: 'Export id', dataIndex: 'id' },
          { title: 'Run', dataIndex: 'reportRunId' },
          { title: 'Type', dataIndex: 'fileType' },
          { title: 'Snapshot', dataIndex: 'snapshotHash' },
          { title: 'Download', dataIndex: 'downloadUrl' },
          { title: 'Notice', dataIndex: 'sensitiveFieldNotice' },
        ]}
      />

      <Table
        rowKey="id"
        dataSource={interpretations}
        pagination={false}
        style={{ marginTop: 16 }}
        columns={[
          { title: 'Summary', dataIndex: 'summary' },
          { title: 'keyFindings', dataIndex: 'keyFindings', render: (rows: string[]) => rows?.join('; ') },
          { title: 'warnings', dataIndex: 'warnings', render: (rows: string[]) => rows?.join('; ') },
          { title: 'evidenceRefs', dataIndex: 'evidenceRefs', render: (rows: string[]) => rows?.join('; ') },
        ]}
      />
    </div>
  );
};
