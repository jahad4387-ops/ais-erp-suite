import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { CloudUploadOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type ReportTemplate = {
  id: string;
  accountSetId: string;
  templateCode: string;
  templateName: string;
  reportType: string;
  status: string;
  latestVersionNo: number;
  publishedVersionId?: string | null;
};

type ReportTemplateVersion = {
  id: string;
  versionNo: number;
  status: string;
  sheets: Array<{
    sheetCode: string;
    cells: Array<{
      cellAddress: string;
      formula?: {
        formulaText: string;
        dependenciesJson: Array<Record<string, string>>;
      } | null;
    }>;
  }>;
};

const { Text, Title } = Typography;
const statutoryPresetCodes = ['STAT-BS', 'STAT-IS', 'STAT-CF', 'STAT-OE'];

export const ReportTemplates: React.FC = () => {
  const [templateForm] = Form.useForm();
  const [versionForm] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [latestVersion, setLatestVersion] = useState<ReportTemplateVersion | null>(null);
  const [loading, setLoading] = useState(false);

  const periodKey = `${currentYear}-${String(currentPeriod).padStart(2, '0')}`;

  const fetchTemplates = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const rows = await api.get(`/report-templates?accountSetId=${currentAccountSetId}`);
      setTemplates(rows ?? []);
      if (!selectedTemplateId && rows?.[0]?.id) {
        setSelectedTemplateId(rows[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, selectedTemplateId]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const createTemplate = async () => {
    const values = await templateForm.validateFields();
    const created = await api.post('/report-templates', {
      accountSetId: currentAccountSetId,
      ...values,
      createdBy: currentUser,
    });
    templateForm.resetFields();
    setSelectedTemplateId(created.id);
    await fetchTemplates();
  };

  const createStatutoryPresets = async () => {
    if (!currentAccountSetId) return;
    const result = await api.post('/report-templates/statutory-presets', {
      accountSetId: currentAccountSetId,
      effectiveFromPeriod: periodKey,
      createdBy: currentUser,
    });
    const createdCount = result?.templates?.filter((template: ReportTemplate & { created?: boolean }) => template.created).length ?? 0;
    message.success(createdCount > 0 ? `Created statutory presets: ${statutoryPresetCodes.join(', ')}` : 'Statutory presets already exist');
    await fetchTemplates();
  };

  const createVersion = async () => {
    const values = await versionForm.validateFields();
    const version = await api.post(`/report-templates/${selectedTemplateId}/versions`, {
      versionName: values.versionName,
      effectiveFromPeriod: values.effectiveFromPeriod ?? periodKey,
      layoutJson: { columnWidths: { A: 160, B: 140, C: 140 } },
      sheets: [
        {
          sheetCode: 'BS',
          sheetName: 'Balance Sheet',
          rowCount: 60,
          columnCount: 8,
          cells: [
            {
              cellAddress: values.cellAddress ?? 'B10',
              label: values.cellLabel ?? 'Cash',
              valueType: 'formula',
              displayFormat: 'currency',
              isEditable: false,
              formula: {
                formulaText: values.formulaText ?? 'BAL("1001", "2026-06", "debit")',
                astJson: { name: 'BAL', args: ['1001', periodKey, 'debit'] },
                dependenciesJson: [
                  {
                    sourceType: 'account_balance',
                    accountCode: '1001',
                    period: periodKey,
                  },
                ],
              },
            },
          ],
        },
      ],
      createdBy: currentUser,
    });
    setLatestVersion(version);
    setSelectedVersionId(version.id);
    await fetchTemplates();
  };

  const publishVersion = async () => {
    if (!selectedVersionId) return;
    const published = await api.post(`/report-template-versions/${selectedVersionId}/publish`, {
      publishedBy: currentUser,
    });
    setLatestVersion(published);
    message.success('Report template version published');
    await fetchTemplates();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Report Templates</Title>
          <Text type="secondary">UFO designer foundation: template, version, sheet, cell, formulaText, dependenciesJson.</Text>
        </div>
        <Space>
          <Button icon={<CloudUploadOutlined />} onClick={createStatutoryPresets} disabled={!currentAccountSetId}>
            Statutory Presets
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchTemplates} loading={loading}>Refresh</Button>
        </Space>
      </div>

      <Space align="start" size={16} style={{ width: '100%' }} wrap>
        <div style={{ minWidth: 360, flex: '1 1 420px' }}>
          <Form form={templateForm} layout="inline" style={{ marginBottom: 16 }}>
            <Form.Item name="templateCode" rules={[{ required: true }]}><Input placeholder="Code" /></Form.Item>
            <Form.Item name="templateName" rules={[{ required: true }]}><Input placeholder="Name" /></Form.Item>
            <Form.Item name="reportType" initialValue="statutory">
              <Select style={{ width: 140 }} options={[
                { value: 'statutory', label: 'Statutory' },
                { value: 'management', label: 'Management' },
                { value: 'ufo', label: 'UFO' },
              ]} />
            </Form.Item>
            <Button type="primary" icon={<PlusOutlined />} onClick={createTemplate}>Add</Button>
          </Form>

          <Table
            rowKey="id"
            dataSource={templates}
            loading={loading}
            pagination={false}
            onRow={(record) => ({ onClick: () => setSelectedTemplateId(record.id) })}
            columns={[
              { title: 'Code', dataIndex: 'templateCode' },
              { title: 'Name', dataIndex: 'templateName' },
              { title: 'Type', dataIndex: 'reportType' },
              { title: 'Version', dataIndex: 'latestVersionNo' },
              {
                title: 'Status',
                dataIndex: 'status',
                render: (status: string) => <Tag color={status === 'active' ? 'green' : 'blue'}>{status}</Tag>,
              },
            ]}
          />
        </div>

        <div style={{ minWidth: 360, flex: '1 1 420px' }}>
          <Form form={versionForm} layout="vertical" initialValues={{
            versionName: 'Initial report version',
            effectiveFromPeriod: periodKey,
            cellAddress: 'B10',
            cellLabel: 'Cash',
            formulaText: 'BAL("1001", "2026-06", "debit")',
          }}>
            <Form.Item label="Template">
              <Select
                value={selectedTemplateId || undefined}
                onChange={setSelectedTemplateId}
                options={templates.map((template) => ({ value: template.id, label: `${template.templateCode} ${template.templateName}` }))}
              />
            </Form.Item>
            <Form.Item name="versionName" label="Version name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="effectiveFromPeriod" label="Effective period">
              <Input />
            </Form.Item>
            <Form.Item name="cellAddress" label="Cell address">
              <Input />
            </Form.Item>
            <Form.Item name="cellLabel" label="Cell label">
              <Input />
            </Form.Item>
            <Form.Item name="formulaText" label="Formula">
              <Input />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<SaveOutlined />} onClick={createVersion} disabled={!selectedTemplateId}>
                Save Version
              </Button>
              <Button icon={<CloudUploadOutlined />} onClick={publishVersion} disabled={!selectedVersionId}>
                Publish
              </Button>
            </Space>
          </Form>

          {selectedTemplate && (
            <div style={{ marginTop: 16 }}>
              <Text strong>{selectedTemplate.templateName}</Text>
              <div>Published version: {selectedTemplate.publishedVersionId ?? '-'}</div>
            </div>
          )}
          {latestVersion && (
            <div style={{ marginTop: 16 }}>
              <Text strong>Latest draft</Text>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f8fa', padding: 12, borderRadius: 6 }}>
                {JSON.stringify(latestVersion.sheets?.[0]?.cells?.[0], null, 2)}
              </pre>
            </div>
          )}
        </div>
      </Space>
    </div>
  );
};

export const UfoReportDesigner = ReportTemplates;
