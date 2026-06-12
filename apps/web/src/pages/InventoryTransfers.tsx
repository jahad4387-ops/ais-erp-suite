import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type Transfer = {
  id: string;
  transferNo: string;
  itemCode: string;
  fromWarehouseCode: string;
  toWarehouseCode: string;
  batchNo?: string | null;
  quantity: number;
  totalAmount: number;
};

type OptionRow = { id: string; code: string; name: string };

export const InventoryTransfers: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const [transferRows, itemRows, warehouseRows] = await Promise.all([
        api.get(`/inventory-transfers?accountSetId=${currentAccountSetId}`),
        api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
        api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
      ]);
      setTransfers(transferRows ?? []);
      setItems(itemRows ?? []);
      setWarehouses(warehouseRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod, quantity: 1 });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/inventory-transfers', {
      ...values,
      accountSetId: currentAccountSetId,
      createdBy: currentUser,
    });
    setModalOpen(false);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>库存调拨</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={transfers}
        columns={[
          { title: '调拨单号', dataIndex: 'transferNo' },
          { title: '存货', dataIndex: 'itemCode' },
          { title: '调出仓库', dataIndex: 'fromWarehouseCode' },
          { title: '调入仓库', dataIndex: 'toWarehouseCode' },
          { title: '批次', dataIndex: 'batchNo' },
          { title: '数量', dataIndex: 'quantity' },
          { title: '金额', dataIndex: 'totalAmount' },
        ]}
      />
      <Modal title="新增库存调拨" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="transferNo" label="调拨单号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="itemId" label="存货" rules={[{ required: true }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="fromWarehouseId" label="调出仓库" rules={[{ required: true }]}>
            <Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
          </Form.Item>
          <Form.Item name="toWarehouseId" label="调入仓库" rules={[{ required: true }]}>
            <Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
          </Form.Item>
          <Form.Item name="batchNo" label="批次号">
            <Input />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0.000001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fiscalYear" label="会计年度" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}>
            <InputNumber min={1} max={12} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
