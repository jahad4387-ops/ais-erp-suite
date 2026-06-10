import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type WorkOrder = { id: string; workOrderNo: string; productItemCode: string; bomVersion: string; plannedQuantity: number; completedQuantity: number; directMaterialCost: number; status: string };
type OptionRow = { id: string; code?: string; name?: string; productItemCode?: string; version?: string; isManufactured?: boolean };

export const ProductionWorkOrders: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [boms, setBoms] = useState<OptionRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [workOrders, itemRows, bomRows] = await Promise.all([
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
      api.get(`/boms?accountSetId=${currentAccountSetId}`),
    ]);
    setRows(workOrders ?? []);
    setItems((itemRows ?? []).filter((item: OptionRow) => item.isManufactured));
    setBoms(bomRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({ plannedQuantity: 1, fiscalYear: currentYear, periodNo: currentPeriod });
    setModalOpen(true);
  };

  const save = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/work-orders', { ...values, accountSetId: currentAccountSetId, createdBy: currentUser });
    setModalOpen(false);
    await fetchData();
  };

  const release = async (record: WorkOrder) => {
    await api.post(`/work-orders/${record.id}/release`, { releasedBy: currentUser });
    message.success('Released');
    await fetchData();
  };

  const close = async (record: WorkOrder) => {
    await api.post(`/work-orders/${record.id}/close`, { closedBy: currentUser });
    message.success('Closed');
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Production Work Orders</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: 'No.', dataIndex: 'workOrderNo' },
          { title: 'Product', dataIndex: 'productItemCode' },
          { title: 'BOM', dataIndex: 'bomVersion' },
          { title: 'Planned', dataIndex: 'plannedQuantity' },
          { title: 'Completed', dataIndex: 'completedQuantity' },
          { title: 'Material cost', dataIndex: 'directMaterialCost' },
          { title: 'Status', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
          { title: 'Actions', render: (_: unknown, record: WorkOrder) => <Space><Button onClick={() => release(record)}>Release</Button><Button onClick={() => close(record)}>Close</Button></Space> },
        ]}
      />
      <Modal title="New work order" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="workOrderNo" label="Work order no." rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="productItemId" label="Product" rules={[{ required: true }]}><Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} /></Form.Item>
          <Form.Item name="bomId" label="BOM" rules={[{ required: true }]}><Select options={boms.map((bom) => ({ value: bom.id, label: `${bom.productItemCode} ${bom.version}` }))} /></Form.Item>
          <Form.Item name="plannedQuantity" label="Planned quantity" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fiscalYear" label="Fiscal year" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodNo" label="Period" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
