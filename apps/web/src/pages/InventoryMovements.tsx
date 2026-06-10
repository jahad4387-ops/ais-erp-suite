import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type Movement = {
  id: string;
  documentNo: string;
  movementType: string;
  businessType: string;
  totalQuantity: number;
  totalAmount: number;
  costStatus: string;
  lines?: Array<{ itemCode?: string; quantity: number; amount: number; costBreakdown?: unknown[] }>;
};

type OptionRow = { id: string; code: string; name: string };

export const InventoryMovements: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const [movementRows, itemRows, warehouseRows] = await Promise.all([
        api.get(`/inventory-movements?accountSetId=${currentAccountSetId}`),
        api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
        api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
      ]);
      setMovements(movementRows ?? []);
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
    form.setFieldsValue({
      movementType: 'inbound',
      businessType: 'other_inbound',
      fiscalYear: currentYear,
      periodNo: currentPeriod,
      quantity: 1,
      unitCost: 0,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/inventory-movements', {
      accountSetId: currentAccountSetId,
      documentNo: values.documentNo,
      movementType: values.movementType,
      businessType: values.businessType,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
      lines: [{
        itemId: values.itemId,
        warehouseId: values.warehouseId,
        batchNo: values.batchNo,
        quantity: values.quantity,
        unitCost: values.unitCost,
      }],
    });
    setModalOpen(false);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Inventory Movements</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={movements}
        expandable={{
          expandedRowRender: (record) => (
            <Table
              rowKey={(line) => `${record.id}-${line.itemCode}-${line.quantity}`}
              pagination={false}
              dataSource={record.lines ?? []}
              columns={[
                { title: 'Item', dataIndex: 'itemCode' },
                { title: 'Quantity', dataIndex: 'quantity' },
                { title: 'Amount', dataIndex: 'amount' },
                { title: 'costBreakdown', dataIndex: 'costBreakdown', render: (value: unknown[]) => value?.length ?? 0 },
              ]}
            />
          ),
        }}
        columns={[
          { title: 'Document', dataIndex: 'documentNo' },
          { title: 'Type', dataIndex: 'movementType' },
          { title: 'Business', dataIndex: 'businessType' },
          { title: 'Quantity', dataIndex: 'totalQuantity' },
          { title: 'Amount', dataIndex: 'totalAmount' },
          { title: 'Cost', dataIndex: 'costStatus', render: (value: string) => <Tag color="green">{value}</Tag> },
        ]}
      />
      <Modal title="New inventory movement" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="documentNo" label="Document no." rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="movementType" label="Movement type" rules={[{ required: true }]}>
            <Select options={[{ value: 'inbound', label: 'Inbound' }, { value: 'outbound', label: 'Outbound' }]} />
          </Form.Item>
          <Form.Item name="businessType" label="Business type" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="itemId" label="Item" rules={[{ required: true }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
            <Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
          </Form.Item>
          <Form.Item name="batchNo" label="Batch no.">
            <Input />
          </Form.Item>
          <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
            <InputNumber min={0.000001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unitCost" label="Unit cost">
            <InputNumber min={0} style={{ width: '100%' }} />
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
