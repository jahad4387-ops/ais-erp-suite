import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';
import { useAppContext } from '../context/AppContext';

type ReworkOrder = {
  id: string;
  reworkNo: string;
  sourceOrderNo?: string;
  originalBatchNo?: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  reasonCode: string;
  status: string;
};

const statusColor: Record<string, string> = {
  draft: 'default',
  submitted: 'blue',
  approved: 'green',
  closed: 'purple',
};

export const ReworkOrders: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [rows, setRows] = useState<ReworkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const payload = await api.get(`/rework-orders?accountSetId=${encodeURIComponent(currentAccountSetId)}`);
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
    await api.post('/rework-orders', {
      ...values,
      accountSetId: currentAccountSetId,
      status: 'draft',
      createdBy: currentUser,
    });
    message.success('返工单已保存');
    setModalOpen(false);
    form.resetFields();
    await fetchData();
  };

  const approve = async (record: ReworkOrder) => {
    await api.post(`/rework-orders/${encodeURIComponent(record.id)}/approve`, { approvedBy: currentUser });
    message.success('返工单已审批');
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>返工计划</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="rework_order"
            sourceObjectType="rework_order_page"
            userInstruction="Generate rework order draft from quality exception, return, or production abnormality context."
          >
            Agent
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增返工</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: '返工单号', dataIndex: 'reworkNo' },
          { title: '来源单号', dataIndex: 'sourceOrderNo' },
          { title: '原批次', dataIndex: 'originalBatchNo' },
          { title: '物料编码', dataIndex: 'itemCode' },
          { title: '物料名称', dataIndex: 'itemName' },
          { title: '数量', dataIndex: 'quantity' },
          { title: '原因', dataIndex: 'reasonCode' },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={statusColor[value] ?? 'default'}>{value}</Tag> },
          {
            title: '操作',
            render: (_: unknown, record: ReworkOrder) => (
              <Button disabled={record.status === 'approved'} onClick={() => approve(record)}>审批</Button>
            ),
          },
        ]}
      />
      <Modal title="新增返工计划" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ quantity: 1, reasonCode: 'quality_exception' }}>
          <Form.Item name="reworkNo" label="返工单号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sourceWorkOrderId" label="来源工单ID"><Input /></Form.Item>
          <Form.Item name="sourceOrderNo" label="来源单号"><Input /></Form.Item>
          <Form.Item name="originalBatchNo" label="原批次"><Input /></Form.Item>
          <Form.Item name="itemCode" label="物料编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="itemName" label="物料名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="quantity" label="返工数量" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="reasonCode" label="返工原因" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
