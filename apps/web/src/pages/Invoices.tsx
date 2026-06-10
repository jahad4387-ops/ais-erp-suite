import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhActor, zhStatus } from '../i18n';

type InvoiceType = 'purchase' | 'sales';

type SourceLine = {
  lineNo: number;
  itemCode: string;
  itemName: string;
  quantity: number;
};

type SourceDocument = {
  id: string;
  receiptNo?: string;
  deliveryNo?: string;
  supplierName?: string;
  customerName?: string;
  lines: SourceLine[];
};

type Invoice = {
  id: string;
  invoiceNo: string;
  externalInvoiceNo?: string;
  purchaseReceiptNo?: string;
  salesDeliveryNo?: string;
  supplierName?: string;
  customerName?: string;
  invoiceDate: string;
  dueDate?: string;
  invoiceSource: string;
  status: string;
  totalAmount: number;
  taxAmount: number;
  payableAmount?: number;
  receivableAmount?: number;
  estimatedDifference?: number;
  createdBy: string;
  evidenceRefs: string[];
};

export const Invoices: React.FC<{ invoiceType: InvoiceType }> = ({ invoiceType }) => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sourceDocuments, setSourceDocuments] = useState<SourceDocument[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const apiBase = invoiceType === 'purchase' ? 'purchase-invoices' : 'sales-invoices';
  const sourceApiBase = invoiceType === 'purchase' ? 'purchase-receipts' : 'sales-deliveries';
  const sourceIdField = invoiceType === 'purchase' ? 'purchaseReceiptId' : 'salesDeliveryId';
  const sourceLineNoField = invoiceType === 'purchase' ? 'receiptLineNo' : 'deliveryLineNo';
  const sourceNoField = invoiceType === 'purchase' ? 'purchaseReceiptNo' : 'salesDeliveryNo';
  const sourceDocumentNoField = invoiceType === 'purchase' ? 'receiptNo' : 'deliveryNo';
  const partnerNameField = invoiceType === 'purchase' ? 'supplierName' : 'customerName';
  const amountField = invoiceType === 'purchase' ? 'payableAmount' : 'receivableAmount';
  const title = invoiceType === 'purchase' ? '采购发票' : '销售发票';
  const sourceLabel = invoiceType === 'purchase' ? '采购入库' : '销售出库';

  const selectedSourceId = Form.useWatch('sourceDocumentId', form);
  const selectedSource = sourceDocuments.find((document) => document.id === selectedSourceId);

  const sourceOptions = useMemo(
    () =>
      sourceDocuments.map((document) => ({
        value: document.id,
        label: `${document[sourceDocumentNoField] ?? document.id} ${document[partnerNameField] ?? ''}`,
      })),
    [partnerNameField, sourceDocumentNoField, sourceDocuments]
  );

  const lineOptions = useMemo(
    () =>
      (selectedSource?.lines ?? []).map((line) => ({
        value: line.lineNo,
        label: `${line.lineNo} ${line.itemCode} ${line.itemName} / 数量 ${line.quantity}`,
      })),
    [selectedSource]
  );

  const fetchInvoices = useCallback(async () => {
    if (!currentAccountSetId) {
      setInvoices([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.get(`/${apiBase}?accountSetId=${currentAccountSetId}`);
      setInvoices(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, currentAccountSetId]);

  const fetchSourceDocuments = useCallback(async () => {
    if (!currentAccountSetId) {
      setSourceDocuments([]);
      return;
    }
    try {
      const rows = await api.get(`/${sourceApiBase}?accountSetId=${currentAccountSetId}`);
      setSourceDocuments(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    }
  }, [currentAccountSetId, sourceApiBase]);

  useEffect(() => {
    void fetchInvoices();
    void fetchSourceDocuments();
  }, [fetchInvoices, fetchSourceDocuments]);

  const openCreate = () => {
    form.setFieldsValue({
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceSource: invoiceType === 'purchase' ? 'ocr' : 'import',
      evidenceRefs: '',
      lines: [{ sourceLineNo: undefined, quantity: 1, unitPrice: 0, taxRate: invoiceType === 'purchase' ? 0.13 : 0.06 }],
    });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    const values = await form.validateFields();
    const evidenceRefs = String(values.evidenceRefs ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      await api.post(`/${apiBase}`, {
        accountSetId: currentAccountSetId,
        [sourceIdField]: values.sourceDocumentId,
        invoiceDate: values.invoiceDate,
        dueDate: values.dueDate || undefined,
        invoiceSource: values.invoiceSource,
        externalInvoiceNo: values.externalInvoiceNo || undefined,
        createdBy: currentUser,
        evidenceRefs,
        lines: values.lines.map((line: { sourceLineNo: number; quantity: number; unitPrice: number; taxRate: number }) => ({
          [sourceLineNoField]: line.sourceLineNo,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
        })),
      });
      message.success(`${title}已确认`);
      setModalOpen(false);
      await fetchInvoices();
      await fetchSourceDocuments();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchInvoices}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            确认发票
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={invoices}
        columns={[
          { title: '发票单号', dataIndex: 'invoiceNo', width: 150 },
          { title: '外部票号', dataIndex: 'externalInvoiceNo', width: 150, render: (value: string) => value ?? '-' },
          { title: sourceLabel, dataIndex: sourceNoField, width: 150 },
          { title: invoiceType === 'purchase' ? '供应商' : '客户', dataIndex: partnerNameField },
          { title: '日期', dataIndex: 'invoiceDate', width: 120 },
          { title: '来源', dataIndex: 'invoiceSource', width: 100 },
          { title: '状态', dataIndex: 'status', width: 100, render: (status: string) => <Tag>{zhStatus(status)}</Tag> },
          { title: '税额', dataIndex: 'taxAmount', width: 110, align: 'right', render: (value: number) => Number(value ?? 0).toFixed(2) },
          { title: '金额', dataIndex: amountField, width: 120, align: 'right', render: (value: number) => Number(value ?? 0).toFixed(2) },
          ...(invoiceType === 'purchase'
            ? [
                {
                  title: '暂估差异',
                  dataIndex: 'estimatedDifference',
                  width: 120,
                  align: 'right' as const,
                  render: (value: number) => Number(value ?? 0).toFixed(2),
                },
              ]
            : []),
          { title: '确认人', dataIndex: 'createdBy', width: 120, render: (value: string) => zhActor(value) },
          {
            title: '证据',
            dataIndex: 'evidenceRefs',
            render: (refs: string[]) => (refs?.length ? refs.map((ref) => <Tag key={ref}>{ref}</Tag>) : '-'),
          },
        ]}
      />

      <Modal title={`确认${title}`} open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} width={900}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="sourceDocumentId" label={sourceLabel} rules={[{ required: true, message: `请选择${sourceLabel}` }]}>
                <Select showSearch optionFilterProp="label" options={sourceOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="externalInvoiceNo" label="外部票号">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="invoiceDate" label="发票日期" rules={[{ required: true, message: '请选择发票日期' }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="dueDate" label="到期日">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="invoiceSource" label="来源">
                <Select
                  options={[
                    { value: 'manual', label: '手工' },
                    { value: 'ocr', label: 'OCR' },
                    { value: 'import', label: '导入' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="evidenceRefs" label="附件证据">
            <Input placeholder="多个附件 ID 用逗号分隔" />
          </Form.Item>

          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <div style={{ display: 'grid', gap: 8 }}>
                {fields.map(({ key, name, ...restField }) => (
                  <Row gutter={8} key={key} align="middle">
                    <Col span={9}>
                      <Form.Item
                        {...restField}
                        name={[name, 'sourceLineNo']}
                        rules={[{ required: true, message: '请选择来源明细' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select placeholder="来源明细" options={lineOptions} />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder="数量" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item {...restField} name={[name, 'unitPrice']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="单价" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item {...restField} name={[name, 'taxRate']} style={{ marginBottom: 0 }}>
                        <InputNumber min={0} max={1} step={0.01} precision={4} style={{ width: '100%' }} placeholder="税率" />
                      </Form.Item>
                    </Col>
                    <Col span={1}>
                      <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#cf1322', fontSize: 16 }} />
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                  增加明细
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};
