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
        <h2 style={{ margin: 0 }}>Inventory Transfers</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={transfers}
        columns={[
          { title: 'Transfer no.', dataIndex: 'transferNo' },
          { title: 'Item', dataIndex: 'itemCode' },
          { title: 'From', dataIndex: 'fromWarehouseCode' },
          { title: 'To', dataIndex: 'toWarehouseCode' },
          { title: 'Batch', dataIndex: 'batchNo' },
          { title: 'Quantity', dataIndex: 'quantity' },
          { title: 'Amount', dataIndex: 'totalAmount' },
        ]}
      />
      <Modal title="New transfer" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="transferNo" label="Transfer no." rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="itemId" label="Item" rules={[{ required: true }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="fromWarehouseId" label="From warehouse" rules={[{ required: true }]}>
            <Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
          </Form.Item>
          <Form.Item name="toWarehouseId" label="To warehouse" rules={[{ required: true }]}>
            <Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
          </Form.Item>
          <Form.Item name="batchNo" label="Batch no.">
            <Input />
          </Form.Item>
          <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
            <InputNumber min={0.000001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fiscalYear" label="Fiscal year" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="periodNo" label="Period" rules={[{ required: true }]}>
            <InputNumber min={1} max={12} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
