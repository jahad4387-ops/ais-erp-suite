import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import {
  BgColorsOutlined,
  BorderOutlined,
  CloudUploadOutlined,
  FontSizeOutlined,
  FunctionOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  TableOutlined,
} from '@ant-design/icons';
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
const designerSheets = [
  { sheetCode: 'BS', sheetName: 'Balance Sheet' },
  { sheetCode: 'IS', sheetName: 'Income Statement' },
  { sheetCode: 'CF', sheetName: 'Cash Flow' },
];
const designerColumns = ['A', 'B', 'C', 'D'];
const designerRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function defaultDependencies(periodKey: string) {
  return JSON.stringify(
    [
      {
        sourceType: 'account_balance',
        accountCode: '1001',
        period: periodKey,
      },
    ],
    null,
    2,
  );
}

function parseDependenciesJson(text: string) {
  const parsed = JSON.parse(text || '[]');
  if (!Array.isArray(parsed)) {
    throw new Error('dependenciesJson must be an array.');
  }
  return parsed;
}

export const ReportTemplates: React.FC = () => {
  const [templateForm] = Form.useForm();
  const [versionForm] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [latestVersion, setLatestVersion] = useState<ReportTemplateVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSheetCode, setActiveSheetCode] = useState('BS');
  const [selectedCell, setSelectedCell] = useState('B10');

  const periodKey = `${currentYear}-${String(currentPeriod).padStart(2, '0')}`;
  const formulaText = Form.useWatch('formulaText', versionForm) ?? 'BAL("1001", "2026-06", "debit")';
  const displayFormat = Form.useWatch('displayFormat', versionForm) ?? 'currency';
  const dependenciesJsonText = Form.useWatch('dependenciesJson', versionForm) ?? defaultDependencies(periodKey);
  const activeSheet = designerSheets.find((sheet) => sheet.sheetCode === activeSheetCode) ?? designerSheets[0];
  const parsedDependencies = useMemo(() => {
    try {
      return { value: parseDependenciesJson(dependenciesJsonText), error: '' };
    } catch (error) {
      return { value: [], error: error instanceof Error ? error.message : 'Invalid dependenciesJson.' };
    }
  }, [dependenciesJsonText]);

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
    let dependenciesJson: Array<Record<string, string>>;
    try {
      dependenciesJson = parseDependenciesJson(values.dependenciesJson ?? defaultDependencies(periodKey));
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Invalid dependenciesJson.');
      return;
    }
    const version = await api.post(`/report-templates/${selectedTemplateId}/versions`, {
      versionName: values.versionName,
      effectiveFromPeriod: values.effectiveFromPeriod ?? periodKey,
      layoutJson: {
        columnWidths: { A: 160, B: 140, C: 140, D: 140 },
        selectedCell: values.cellAddress ?? selectedCell,
        styles: {
          [values.cellAddress ?? selectedCell]: {
            displayFormat: values.displayFormat ?? 'currency',
            border: 'thin',
            fontWeight: 'normal',
            backgroundColor: '#f8fafc',
          },
        },
      },
      sheets: [
        {
          sheetCode: values.sheetCode ?? activeSheet.sheetCode,
          sheetName: values.sheetName ?? activeSheet.sheetName,
          rowCount: Number(values.rowCount ?? 60),
          columnCount: Number(values.columnCount ?? 8),
          cells: [
            {
              cellAddress: values.cellAddress ?? selectedCell,
              label: values.cellLabel ?? 'Cash',
              valueType: 'formula',
              displayFormat: values.displayFormat ?? 'currency',
              isEditable: Boolean(values.isEditable),
              formula: {
                formulaText: values.formulaText ?? 'BAL("1001", "2026-06", "debit")',
                astJson: { name: 'BAL', args: ['1001', periodKey, 'debit'] },
                dependenciesJson,
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

  const selectDesignerCell = (cellAddress: string) => {
    setSelectedCell(cellAddress);
    versionForm.setFieldsValue({ cellAddress });
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

        <div style={{ minWidth: 520, flex: '2 1 620px' }}>
          <Form form={versionForm} layout="vertical" initialValues={{
            versionName: 'Initial report version',
            effectiveFromPeriod: periodKey,
            sheetCode: 'BS',
            sheetName: 'Balance Sheet',
            rowCount: 60,
            columnCount: 8,
            cellAddress: 'B10',
            cellLabel: 'Cash',
            displayFormat: 'currency',
            isEditable: false,
            formulaText: 'BAL("1001", "2026-06", "debit")',
            dependenciesJson: defaultDependencies(periodKey),
          }}>
            <Form.Item label="Template">
              <Select
                value={selectedTemplateId || undefined}
                onChange={setSelectedTemplateId}
                options={templates.map((template) => ({ value: template.id, label: `${template.templateCode} ${template.templateName}` }))}
              />
            </Form.Item>

            <div data-testid="ufo-sheet-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {designerSheets.map((sheet) => (
                <Button
                  key={sheet.sheetCode}
                  type={sheet.sheetCode === activeSheetCode ? 'primary' : 'default'}
                  icon={<TableOutlined />}
                  onClick={() => {
                    setActiveSheetCode(sheet.sheetCode);
                    versionForm.setFieldsValue({ sheetCode: sheet.sheetCode, sheetName: sheet.sheetName });
                  }}
                >
                  {sheet.sheetCode}
                </Button>
              ))}
            </div>

            <div data-testid="ufo-format-toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Button icon={<BorderOutlined />} title="Border">Border</Button>
              <Button icon={<FontSizeOutlined />} title="Font">Font</Button>
              <Button icon={<BgColorsOutlined />} title="Fill">Fill</Button>
              <Button icon={<FunctionOutlined />} title="Formula">Formula</Button>
              <Form.Item name="displayFormat" noStyle>
                <Select
                  style={{ width: 150 }}
                  options={[
                    { value: 'currency', label: 'Currency' },
                    { value: 'number', label: 'Number' },
                    { value: 'percent', label: 'Percent' },
                    { value: 'text', label: 'Text' },
                  ]}
                />
              </Form.Item>
            </div>

            <div data-testid="ufo-formula-bar" style={{ display: 'grid', gridTemplateColumns: '110px minmax(220px, 1fr)', gap: 8, marginBottom: 12 }}>
              <Form.Item name="cellAddress" style={{ marginBottom: 0 }}>
                <Input aria-label="Cell address" />
              </Form.Item>
              <Form.Item name="formulaText" style={{ marginBottom: 0 }}>
                <Input aria-label="Formula" prefix={<FunctionOutlined />} />
              </Form.Item>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) 260px', gap: 16, alignItems: 'start' }}>
              <div
                data-testid="ufo-grid"
                style={{
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  overflow: 'auto',
                  maxWidth: '100%',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `44px repeat(${designerColumns.length}, minmax(96px, 1fr))`,
                    minWidth: 440,
                  }}
                >
                  <div style={{ height: 32, background: '#f8fafc', borderRight: '1px solid #d9d9d9', borderBottom: '1px solid #d9d9d9' }} />
                  {designerColumns.map((column) => (
                    <div
                      key={column}
                      style={{
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f8fafc',
                        borderRight: '1px solid #d9d9d9',
                        borderBottom: '1px solid #d9d9d9',
                        fontWeight: 600,
                      }}
                    >
                      {column}
                    </div>
                  ))}
                  {designerRows.map((row) => (
                    <React.Fragment key={row}>
                      <div
                        style={{
                          minHeight: 38,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f8fafc',
                          borderRight: '1px solid #d9d9d9',
                          borderBottom: '1px solid #d9d9d9',
                          fontWeight: 600,
                        }}
                      >
                        {row}
                      </div>
                      {designerColumns.map((column) => {
                        const cellAddress = `${column}${row}`;
                        const isSelected = selectedCell === cellAddress;
                        const isFormulaCell = cellAddress === (versionForm.getFieldValue('cellAddress') ?? selectedCell);
                        return (
                          <button
                            key={cellAddress}
                            type="button"
                            onClick={() => selectDesignerCell(cellAddress)}
                            style={{
                              minHeight: 38,
                              border: 0,
                              borderRight: '1px solid #d9d9d9',
                              borderBottom: '1px solid #d9d9d9',
                              background: isSelected ? '#e6f4ff' : isFormulaCell ? '#f6ffed' : '#fff',
                              color: '#1f2937',
                              textAlign: 'left',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              outline: isSelected ? '2px solid #1677ff' : 'none',
                              outlineOffset: -2,
                            }}
                          >
                            {isFormulaCell ? formulaText : ''}
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div data-testid="ufo-cell-properties" style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: 12 }}>
                  <Text strong>Cell Properties</Text>
                  <Form.Item name="sheetCode" label="sheetCode">
                    <Input />
                  </Form.Item>
                  <Form.Item name="sheetName" label="sheetName">
                    <Input />
                  </Form.Item>
                  <Form.Item name="rowCount" label="rowCount">
                    <Input type="number" />
                  </Form.Item>
                  <Form.Item name="columnCount" label="columnCount">
                    <Input type="number" />
                  </Form.Item>
                  <Form.Item name="cellLabel" label="Cell label">
                    <Input />
                  </Form.Item>
                  <Form.Item name="isEditable" valuePropName="checked">
                    <Checkbox>Editable</Checkbox>
                  </Form.Item>
                </div>

                <div data-testid="ufo-validation-panel" style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: 12 }}>
                  <Text strong>Validation</Text>
                  <div style={{ marginTop: 8 }}>
                    <Tag color={parsedDependencies.error ? 'red' : 'green'}>
                      {parsedDependencies.error ? 'Invalid dependenciesJson' : 'Formula ready'}
                    </Tag>
                    <Tag color="blue">{displayFormat}</Tag>
                  </div>
                  {parsedDependencies.error && <div style={{ marginTop: 8, color: '#cf1322' }}>{parsedDependencies.error}</div>}
                  <Form.Item name="dependenciesJson" label="dependenciesJson" style={{ marginTop: 12, marginBottom: 0 }}>
                    <Input.TextArea rows={7} />
                  </Form.Item>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginTop: 16 }}>
              <Form.Item name="versionName" label="Version name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="effectiveFromPeriod" label="Effective period">
                <Input />
              </Form.Item>
            </div>

            <Space wrap>
              <Button type="primary" icon={<SaveOutlined />} onClick={createVersion} disabled={!selectedTemplateId || Boolean(parsedDependencies.error)}>
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
