import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type CostInput = { id: string; workOrderNo: string; sourceType: string; costType: string; amount: number; lockedAt?: string | null };
type WorkOrder = { id: string; workOrderNo: string };

export const MockCostInputs: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<CostInput[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [inputs, orders] = await Promise.all([
      api.get(`/mock-cost-inputs?accountSetId=${currentAccountSetId}`),
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
    ]);
    setRows(inputs ?? []);
    setWorkOrders(orders ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({ sourceType: 'manual', costType: 'direct_labor', amount: 0, fiscalYear: currentYear, periodNo: currentPeriod });
    setModalOpen(true);
  };

  const save = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/mock-cost-inputs', { ...values, accountSetId: currentAccountSetId, createdBy: currentUser });
    setModalOpen(false);
    await fetchData();
  };

  const lock = async (record: CostInput) => {
    await api.post(`/mock-cost-inputs/${record.id}/lock`, { lockedBy: currentUser });
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Mock Cost Inputs</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: 'Work order', dataIndex: 'workOrderNo' },
          { title: 'Source', dataIndex: 'sourceType' },
          { title: 'Cost type', dataIndex: 'costType' },
          { title: 'Amount', dataIndex: 'amount' },
          { title: 'Locked', dataIndex: 'lockedAt', render: (value: string | null) => <Tag color={value ? 'green' : 'orange'}>{value ? 'locked' : 'open'}</Tag> },
          { title: 'Action', render: (_: unknown, record: CostInput) => <Button onClick={() => lock(record)}>Lock</Button> },
        ]}
      />
      <Modal title="New mock cost input" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="workOrderId" label="Work order" rules={[{ required: true }]}><Select options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} /></Form.Item>
          <Form.Item name="sourceType" label="Source type" rules={[{ required: true }]}><Select options={[{ value: 'manual', label: 'Manual' }, { value: 'mock', label: 'Mock' }]} /></Form.Item>
          <Form.Item name="costType" label="Cost type" rules={[{ required: true }]}><Select options={[{ value: 'direct_labor', label: 'Direct labor' }, { value: 'depreciation', label: 'Depreciation' }, { value: 'manufacturing_overhead', label: 'Overhead' }]} /></Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fiscalYear" label="Fiscal year" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodNo" label="Period" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
