import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type Receipt = { id: string; receiptNo: string; workOrderNo: string; sourceMovementId: string; costStatus: string; totalQuantity: number; totalAmount: number };
type OptionRow = { id: string; code?: string; name?: string; workOrderNo?: string; isManufactured?: boolean };

export const ProductReceipts: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [workOrders, setWorkOrders] = useState<OptionRow[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [receipts, woRows, itemRows, warehouseRows] = await Promise.all([
      api.get(`/product-receipts?accountSetId=${currentAccountSetId}`),
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
      api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
    ]);
    setRows(receipts ?? []);
    setWorkOrders(woRows ?? []);
    setItems((itemRows ?? []).filter((item: OptionRow) => item.isManufactured));
    setWarehouses(warehouseRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({ quantity: 1, fiscalYear: currentYear, periodNo: currentPeriod });
    setModalOpen(true);
  };

  const save = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/product-receipts', {
      accountSetId: currentAccountSetId,
      receiptNo: values.receiptNo,
      workOrderId: values.workOrderId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
      lines: [{ productItemId: values.productItemId, warehouseId: values.warehouseId, batchNo: values.batchNo, quantity: values.quantity }],
    });
    setModalOpen(false);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Product Receipts</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: 'No.', dataIndex: 'receiptNo' },
          { title: 'Work order', dataIndex: 'workOrderNo' },
          { title: 'sourceMovementId', dataIndex: 'sourceMovementId' },
          { title: 'Quantity', dataIndex: 'totalQuantity' },
          { title: 'Amount', dataIndex: 'totalAmount' },
          { title: 'costStatus', dataIndex: 'costStatus', render: (value: string) => <Tag color="blue">{value}</Tag> },
        ]}
      />
      <Modal title="New product receipt" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="receiptNo" label="Receipt no." rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="workOrderId" label="Work order" rules={[{ required: true }]}><Select options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} /></Form.Item>
          <Form.Item name="productItemId" label="Product" rules={[{ required: true }]}><Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} /></Form.Item>
          <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}><Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} /></Form.Item>
          <Form.Item name="batchNo" label="Batch no."><Input /></Form.Item>
          <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fiscalYear" label="Fiscal year" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodNo" label="Period" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
