import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type OutsourcingOrder = {
  id: string;
  outsourcingNo: string;
  supplierName?: string;
  sourceWorkOrderId?: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  processName?: string;
  issuedQuantity: number;
  receivedQuantity: number;
  settledAmount: number;
  status: string;
};

export const OutsourcingOrders: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [rows, setRows] = useState<OutsourcingOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const payload = await api.get(`/outsourcing-orders?accountSetId=${encodeURIComponent(currentAccountSetId)}`);
      setRows(payload?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const save = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/outsourcing-orders', {
      ...values,
      accountSetId: currentAccountSetId,
      status: 'draft',
      createdBy: currentUser,
    });
    message.success('委外单已保存');
    setModalOpen(false);
    form.resetFields();
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>委外管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增委外</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: '委外单号', dataIndex: 'outsourcingNo' },
          { title: '供应商', dataIndex: 'supplierName' },
          { title: '来源工单', dataIndex: 'sourceWorkOrderId' },
          { title: '物料编码', dataIndex: 'itemCode' },
          { title: '物料名称', dataIndex: 'itemName' },
          { title: '工序', dataIndex: 'processName' },
          { title: '数量', dataIndex: 'quantity' },
          { title: '已发料', dataIndex: 'issuedQuantity' },
          { title: '已收货', dataIndex: 'receivedQuantity' },
          { title: '结算金额', dataIndex: 'settledAmount' },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
        ]}
      />
      <Modal title="新增委外单" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ quantity: 1 }}>
          <Form.Item name="outsourcingNo" label="委外单号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="supplierId" label="供应商ID"><Input /></Form.Item>
          <Form.Item name="supplierName" label="供应商名称"><Input /></Form.Item>
          <Form.Item name="sourceWorkOrderId" label="来源工单ID"><Input /></Form.Item>
          <Form.Item name="itemCode" label="物料编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="itemName" label="物料名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="processName" label="工序名称"><Input /></Form.Item>
          <Form.Item name="quantity" label="委外数量" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
