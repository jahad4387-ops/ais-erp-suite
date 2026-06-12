import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type CostInput = { id: string; workOrderNo: string; sourceType: string; costType: string; amount: number; lockedAt?: string | null };
type WorkOrder = { id: string; workOrderNo: string };

const sourceTypeLabel: Record<string, string> = {
  manual: '手工',
  mock: '模拟',
};

const costTypeLabel: Record<string, string> = {
  direct_labor: '直接人工',
  depreciation: '折旧',
  manufacturing_overhead: '制造费用',
};

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
        <h2 style={{ margin: 0 }}>模拟成本录入</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: '工单', dataIndex: 'workOrderNo' },
          { title: '来源', render: (_: unknown, record: CostInput) => sourceTypeLabel[record.sourceType] ?? record.sourceType },
          { title: '成本类型', render: (_: unknown, record: CostInput) => costTypeLabel[record.costType] ?? record.costType },
          { title: '金额', dataIndex: 'amount' },
          { title: '锁定状态', dataIndex: 'lockedAt', render: (value: string | null) => <Tag color={value ? 'green' : 'orange'}>{value ? '已锁定' : '未锁定'}</Tag> },
          { title: '操作', render: (_: unknown, record: CostInput) => <Button onClick={() => lock(record)}>锁定</Button> },
        ]}
      />
      <Modal title="新增模拟成本" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="workOrderId" label="工单" rules={[{ required: true }]}><Select options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} /></Form.Item>
          <Form.Item name="sourceType" label="来源类型" rules={[{ required: true }]}><Select options={[{ value: 'manual', label: '手工' }, { value: 'mock', label: '模拟' }]} /></Form.Item>
          <Form.Item name="costType" label="成本类型" rules={[{ required: true }]}><Select options={[{ value: 'direct_labor', label: '直接人工' }, { value: 'depreciation', label: '折旧' }, { value: 'manufacturing_overhead', label: '制造费用' }]} /></Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true }]}><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fiscalYear" label="会计年度" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
