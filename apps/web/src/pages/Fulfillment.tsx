import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhActor, zhStatus } from '../i18n';

type FulfillmentType = 'purchase' | 'sales';

type OrderLine = {
  lineNo: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  receivedQuantity?: number;
  shippedQuantity?: number;
};

type Order = {
  id: string;
  orderNo: string;
  status: string;
  supplierName?: string;
  customerName?: string;
  lines: OrderLine[];
};

type FulfillmentDocument = {
  id: string;
  receiptNo?: string;
  deliveryNo?: string;
  purchaseOrderNo?: string;
  salesOrderNo?: string;
  supplierName?: string;
  customerName?: string;
  receiptDate?: string;
  deliveryDate?: string;
  status: string;
  totalQuantity: number;
  createdBy: string;
  evidenceRefs: string[];
};

export const Fulfillment: React.FC<{ fulfillmentType: FulfillmentType }> = ({ fulfillmentType }) => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [documents, setDocuments] = useState<FulfillmentDocument[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const apiBase = fulfillmentType === 'purchase' ? 'purchase-receipts' : 'sales-deliveries';
  const orderApiBase = fulfillmentType === 'purchase' ? 'purchase-orders' : 'sales-orders';
  const orderIdField = fulfillmentType === 'purchase' ? 'purchaseOrderId' : 'salesOrderId';
  const documentNoField = fulfillmentType === 'purchase' ? 'receiptNo' : 'deliveryNo';
  const documentDateField = fulfillmentType === 'purchase' ? 'receiptDate' : 'deliveryDate';
  const orderNoField = fulfillmentType === 'purchase' ? 'purchaseOrderNo' : 'salesOrderNo';
  const partnerNameField = fulfillmentType === 'purchase' ? 'supplierName' : 'customerName';
  const executedQuantityField = fulfillmentType === 'purchase' ? 'receivedQuantity' : 'shippedQuantity';
  const title = fulfillmentType === 'purchase' ? '采购入库' : '销售出库';
  const orderLabel = fulfillmentType === 'purchase' ? '采购订单' : '销售订单';

  const selectedOrderId = Form.useWatch('orderId', form);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);

  const orderOptions = useMemo(
    () =>
      orders
        .filter((order) => ['approved', 'partially_executed'].includes(order.status))
        .map((order) => ({ value: order.id, label: `${order.orderNo} ${order[partnerNameField] ?? ''}` })),
    [orders, partnerNameField]
  );

  const lineOptions = useMemo(
    () =>
      (selectedOrder?.lines ?? []).map((line) => {
        const executed = Number(line[executedQuantityField] ?? 0);
        const remaining = Number(line.quantity ?? 0) - executed;
        return {
          value: line.lineNo,
          label: `${line.lineNo} ${line.itemCode} ${line.itemName} / 剩余 ${remaining}`,
        };
      }),
    [executedQuantityField, selectedOrder]
  );

  const fetchDocuments = useCallback(async () => {
    if (!currentAccountSetId) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.get(`/${apiBase}?accountSetId=${currentAccountSetId}`);
      setDocuments(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, currentAccountSetId]);

  const fetchOrders = useCallback(async () => {
    if (!currentAccountSetId) {
      setOrders([]);
      return;
    }
    try {
      const rows = await api.get(`/${orderApiBase}?accountSetId=${currentAccountSetId}`);
      setOrders(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    }
  }, [currentAccountSetId, orderApiBase]);

  useEffect(() => {
    void fetchDocuments();
    void fetchOrders();
  }, [fetchDocuments, fetchOrders]);

  const openCreate = () => {
    form.setFieldsValue({
      documentDate: new Date().toISOString().slice(0, 10),
      evidenceRefs: '',
      lines: [{ orderLineNo: undefined, quantity: 1 }],
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
        [orderIdField]: values.orderId,
        [documentDateField]: values.documentDate,
        createdBy: currentUser,
        evidenceRefs,
        lines: values.lines,
      });
      message.success(`${title}已创建`);
      setModalOpen(false);
      await fetchDocuments();
      await fetchOrders();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchDocuments}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={documents}
        columns={[
          { title: '单号', dataIndex: documentNoField, width: 150 },
          { title: orderLabel, dataIndex: orderNoField, width: 150 },
          { title: fulfillmentType === 'purchase' ? '供应商' : '客户', dataIndex: partnerNameField },
          { title: '日期', dataIndex: documentDateField, width: 120 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (status: string) => <Tag>{zhStatus(status)}</Tag>,
          },
          { title: '数量', dataIndex: 'totalQuantity', width: 100 },
          { title: '制单人', dataIndex: 'createdBy', width: 120, render: (value: string) => zhActor(value) },
          {
            title: '证据',
            dataIndex: 'evidenceRefs',
            render: (refs: string[]) => (refs?.length ? refs.map((ref) => <Tag key={ref}>{ref}</Tag>) : '-'),
          },
        ]}
      />

      <Modal title={`新增${title}`} open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} width={820}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="orderId" label={orderLabel} rules={[{ required: true, message: `请选择${orderLabel}` }]}>
                <Select showSearch optionFilterProp="label" options={orderOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="documentDate" label="单据日期" rules={[{ required: true, message: '请选择单据日期' }]}>
                <Input type="date" />
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
                    <Col span={17}>
                      <Form.Item
                        {...restField}
                        name={[name, 'orderLineNo']}
                        rules={[{ required: true, message: '请选择来源订单行' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select placeholder="来源订单行" options={lineOptions} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        {...restField}
                        name={[name, 'quantity']}
                        rules={[{ required: true, message: '请输入执行数量' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder="数量" />
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
