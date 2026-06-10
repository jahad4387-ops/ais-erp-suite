import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type Requisition = { id: string; requisitionNo: string; workOrderNo: string; sourceMovementId: string; totalQuantity: number; totalAmount: number };
type OptionRow = { id: string; code?: string; name?: string; workOrderNo?: string };

export const MaterialRequisitions: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<Requisition[]>([]);
  const [workOrders, setWorkOrders] = useState<OptionRow[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [requisitions, woRows, itemRows, warehouseRows] = await Promise.all([
      api.get(`/material-requisitions?accountSetId=${currentAccountSetId}`),
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
      api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
    ]);
    setRows(requisitions ?? []);
    setWorkOrders(woRows ?? []);
    setItems(itemRows ?? []);
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
    await api.post('/material-requisitions', {
      accountSetId: currentAccountSetId,
      requisitionNo: values.requisitionNo,
      workOrderId: values.workOrderId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
      lines: [{ componentItemId: values.componentItemId, warehouseId: values.warehouseId, batchNo: values.batchNo, quantity: values.quantity }],
    });
    setModalOpen(false);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Material Requisitions</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: 'No.', dataIndex: 'requisitionNo' },
          { title: 'Work order', dataIndex: 'workOrderNo' },
          { title: 'sourceMovementId', dataIndex: 'sourceMovementId' },
          { title: 'Quantity', dataIndex: 'totalQuantity' },
          { title: 'Amount', dataIndex: 'totalAmount' },
        ]}
      />
      <Modal title="New material requisition" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="requisitionNo" label="Requisition no." rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="workOrderId" label="Work order" rules={[{ required: true }]}><Select options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} /></Form.Item>
          <Form.Item name="componentItemId" label="Component" rules={[{ required: true }]}><Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} /></Form.Item>
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
