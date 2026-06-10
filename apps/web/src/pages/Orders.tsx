import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhActor, zhStatus } from '../i18n';

type OrderType = 'purchase' | 'sales';
type OrderStatus = 'draft' | 'submitted' | 'approved' | 'closed';

type Partner = {
  id: string;
  code: string;
  name: string;
  taxRate: number;
};

type OrderLine = {
  lineNo: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
};

type Order = {
  id: string;
  accountSetId: string;
  supplierId?: string;
  supplierName?: string;
  customerId?: string;
  customerName?: string;
  orderNo: string;
  orderDate: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  createdBy: string;
  submittedBy?: string;
  approvedBy?: string;
  lines: OrderLine[];
};

const statusColor: Record<string, string> = {
  draft: 'default',
  submitted: 'blue',
  approved: 'cyan',
  closed: 'green',
};

export const Orders: React.FC<{ orderType: OrderType }> = ({ orderType }) => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [orders, setOrders] = useState<Order[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const apiBase = orderType === 'purchase' ? 'purchase-orders' : 'sales-orders';
  const partnerType = orderType === 'purchase' ? 'supplier' : 'customer';
  const partnerIdField = orderType === 'purchase' ? 'supplierId' : 'customerId';
  const partnerNameField = orderType === 'purchase' ? 'supplierName' : 'customerName';
  const title = orderType === 'purchase' ? '采购订单' : '销售订单';
  const partnerLabel = orderType === 'purchase' ? '供应商' : '客户';

  const partnerOptions = useMemo(
    () => partners.map((partner) => ({ value: partner.id, label: `${partner.code} ${partner.name}` })),
    [partners]
  );

  const fetchOrders = useCallback(async () => {
    if (!currentAccountSetId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({ accountSetId: currentAccountSetId });
      if (statusFilter) {
        query.set('status', statusFilter);
      }
      const rows = await api.get(`/${apiBase}?${query.toString()}`);
      setOrders(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, currentAccountSetId, statusFilter]);

  const fetchPartners = useCallback(async () => {
    if (!currentAccountSetId) {
      setPartners([]);
      return;
    }
    try {
      const rows = await api.get(`/partners?accountSetId=${currentAccountSetId}&partnerType=${partnerType}`);
      setPartners(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    }
  }, [currentAccountSetId, partnerType]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    void fetchPartners();
  }, [fetchPartners]);

  const openCreate = () => {
    form.setFieldsValue({
      orderDate: new Date().toISOString().slice(0, 10),
      lines: [{ itemCode: '', itemName: '', quantity: 1, unitPrice: 0, taxRate: 0.13 }],
    });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    const values = await form.validateFields();
    try {
      await api.post(`/${apiBase}`, {
        accountSetId: currentAccountSetId,
        [partnerIdField]: values.partnerId,
        orderDate: values.orderDate,
        createdBy: currentUser,
        lines: values.lines,
      });
      message.success(`${title}已创建`);
      setModalOpen(false);
      await fetchOrders();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const runWorkflowAction = async (order: Order, action: 'submit' | 'approve') => {
    const actorField = action === 'submit' ? 'submittedBy' : 'approvedBy';
    try {
      await api.post(`/${apiBase}/${order.id}/${action}`, { [actorField]: currentUser });
      message.success(`${order.orderNo} ${action === 'submit' ? '已提交' : '已审核'}`);
      await fetchOrders();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <Space wrap>
          <Select
            allowClear
            placeholder="状态"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: 'draft', label: '草稿' },
              { value: 'submitted', label: '已提交' },
              { value: 'approved', label: '已审核' },
              { value: 'closed', label: '已关闭' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchOrders}>
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
        dataSource={orders}
        expandable={{
          expandedRowRender: (record) => (
            <Table
              size="small"
              rowKey="lineNo"
              pagination={false}
              dataSource={record.lines ?? []}
              columns={[
                { title: '行号', dataIndex: 'lineNo', width: 80 },
                { title: '物料编码', dataIndex: 'itemCode' },
                { title: '物料名称', dataIndex: 'itemName' },
                { title: '数量', dataIndex: 'quantity', width: 100 },
                { title: '单价', dataIndex: 'unitPrice', width: 120 },
                {
                  title: '税率',
                  dataIndex: 'taxRate',
                  width: 100,
                  render: (value: number) => `${(Number(value) * 100).toFixed(1)}%`,
                },
                { title: '税额', dataIndex: 'taxAmount', width: 120 },
                { title: '价税合计', dataIndex: 'totalAmount', width: 120 },
              ]}
            />
          ),
        }}
        columns={[
          { title: '单号', dataIndex: 'orderNo', width: 150 },
          { title: partnerLabel, dataIndex: partnerNameField, render: (value: string) => value ?? '-' },
          { title: '日期', dataIndex: 'orderDate', width: 120 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (status: OrderStatus) => <Tag color={statusColor[status]}>{zhStatus(status)}</Tag>,
          },
          {
            title: '金额',
            dataIndex: 'totalAmount',
            width: 130,
            align: 'right',
            render: (value: number) => Number(value ?? 0).toFixed(2),
          },
          { title: '币种', dataIndex: 'currency', width: 90 },
          { title: '制单人', dataIndex: 'createdBy', width: 120, render: (value: string) => zhActor(value) },
          {
            title: '操作',
            width: 170,
            render: (_: unknown, record: Order) => (
              <Space>
                <Button size="small" disabled={record.status !== 'draft'} onClick={() => runWorkflowAction(record, 'submit')}>
                  提交
                </Button>
                <Button size="small" disabled={record.status !== 'submitted'} onClick={() => runWorkflowAction(record, 'approve')}>
                  审核
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal title={`新增${title}`} open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} width={900}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="partnerId" label={partnerLabel} rules={[{ required: true, message: `请选择${partnerLabel}` }]}>
                <Select showSearch optionFilterProp="label" options={partnerOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="orderDate" label="单据日期" rules={[{ required: true, message: '请选择单据日期' }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <div style={{ display: 'grid', gap: 8 }}>
                {fields.map(({ key, name, ...restField }) => (
                  <Row gutter={8} key={key} align="middle">
                    <Col span={5}>
                      <Form.Item
                        {...restField}
                        name={[name, 'itemCode']}
                        rules={[{ required: true, message: '请输入物料编码' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="物料编码" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        {...restField}
                        name={[name, 'itemName']}
                        rules={[{ required: true, message: '请输入物料名称' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="物料名称" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'quantity']}
                        rules={[{ required: true, message: '请输入数量' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder="数量" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'unitPrice']}
                        rules={[{ required: true, message: '请输入单价' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="单价" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
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
