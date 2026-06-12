import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type TraceRule = {
  id: string;
  code: string;
  name: string;
  objectType: string;
  direction: string;
  isEnabled: boolean;
};

export const Traceability: React.FC = () => {
  const [ruleForm] = Form.useForm();
  const [queryForm] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [rows, setRows] = useState<TraceRule[]>([]);
  const [queryNodes, setQueryNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [queryModalOpen, setQueryModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const payload = await api.get(`/trace-rules?accountSetId=${encodeURIComponent(currentAccountSetId)}`);
      setRows(payload?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const saveRule = async () => {
    if (!currentAccountSetId) return;
    const values = await ruleForm.validateFields();
    await api.post('/trace-rules', {
      ...values,
      accountSetId: currentAccountSetId,
      isEnabled: true,
      createdBy: currentUser,
    });
    message.success('追溯规则已保存');
    setRuleModalOpen(false);
    ruleForm.resetFields();
    await fetchData();
  };

  const runTraceQuery = async () => {
    if (!currentAccountSetId) return;
    const values = await queryForm.validateFields();
    const payload = await api.post('/traceability/query', {
      ...values,
      accountSetId: currentAccountSetId,
      requestedBy: currentUser,
    });
    setQueryNodes(payload?.nodes ?? []);
    setQueryModalOpen(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>追溯规则</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button icon={<SearchOutlined />} onClick={() => setQueryModalOpen(true)} disabled={!rows.length}>批次追溯</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setRuleModalOpen(true)}>新增规则</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: '规则编码', dataIndex: 'code' },
          { title: '规则名称', dataIndex: 'name' },
          { title: '对象类型', dataIndex: 'objectType' },
          { title: '方向', dataIndex: 'direction' },
          { title: '状态', dataIndex: 'isEnabled', render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag> },
        ]}
      />
      <Table
        rowKey={(record) => `${record.nodeType}:${record.batchNo}`}
        style={{ marginTop: 16 }}
        size="small"
        pagination={false}
        dataSource={queryNodes}
        columns={[
          { title: '节点类型', dataIndex: 'nodeType' },
          { title: '批次号', dataIndex: 'batchNo' },
          { title: '对象类型', dataIndex: 'objectType' },
          { title: '追溯方向', dataIndex: 'direction' },
        ]}
      />
      <Modal title="新增追溯规则" open={ruleModalOpen} onOk={saveRule} onCancel={() => setRuleModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={ruleForm} layout="vertical" initialValues={{ objectType: 'batch', direction: 'both' }}>
          <Form.Item name="code" label="规则编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="objectType" label="对象类型" rules={[{ required: true }]}><Select options={[{ value: 'batch', label: '批次' }, { value: 'finished_good', label: '成品' }, { value: 'material', label: '材料' }]} /></Form.Item>
          <Form.Item name="direction" label="追溯方向" rules={[{ required: true }]}><Select options={[{ value: 'both', label: '正反向' }, { value: 'forward', label: '正向' }, { value: 'backward', label: '反向' }]} /></Form.Item>
        </Form>
      </Modal>
      <Modal title="批次追溯查询" open={queryModalOpen} onOk={runTraceQuery} onCancel={() => setQueryModalOpen(false)} okText="查询" cancelText="取消">
        <Form form={queryForm} layout="vertical" initialValues={{ ruleId: rows[0]?.id, direction: rows[0]?.direction ?? 'both' }}>
          <Form.Item name="ruleId" label="追溯规则" rules={[{ required: true }]}><Select options={rows.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))} /></Form.Item>
          <Form.Item name="batchNo" label="批次号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="direction" label="追溯方向" rules={[{ required: true }]}><Select options={[{ value: 'both', label: '正反向' }, { value: 'forward', label: '正向' }, { value: 'backward', label: '反向' }]} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
