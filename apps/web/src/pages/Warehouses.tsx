import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type Warehouse = {
  id: string;
  code: string;
  name: string;
  manager?: string;
  isEnabled?: boolean;
  locations: Array<{ id: string; code: string; name: string; capacity?: number }>;
};

export const Warehouses: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchWarehouses = useCallback(async () => {
    if (!currentAccountSetId) {
      setWarehouses([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.get(`/warehouses?accountSetId=${currentAccountSetId}`);
      setWarehouses(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchWarehouses();
  }, [fetchWarehouses]);

  const handleSave = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    try {
      await api.post('/warehouses', {
        accountSetId: currentAccountSetId,
        code: values.code,
        name: values.name,
        manager: values.manager,
        createdBy: currentUser,
        locations: [{ code: values.locationCode, name: values.locationName, capacity: values.capacity }],
      });
      setModalOpen(false);
      await fetchWarehouses();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>仓库档案</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchWarehouses}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={warehouses}
        columns={[
          { title: '编码', dataIndex: 'code', width: 140 },
          { title: '名称', dataIndex: 'name' },
          { title: '负责人', dataIndex: 'manager', width: 160 },
          { title: '货位数', width: 120, render: (_: unknown, record: Warehouse) => record.locations?.length ?? 0 },
          { title: '状态', dataIndex: 'isEnabled', width: 100, render: (value: boolean) => <Tag color={value === false ? 'default' : 'green'}>{value === false ? '停用' : '启用'}</Tag> },
        ]}
        expandable={{
          expandedRowRender: (record) => (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={record.locations}
              columns={[
                { title: '货位编码', dataIndex: 'code' },
                { title: '货位名称', dataIndex: 'name' },
                { title: '容量', dataIndex: 'capacity' },
              ]}
            />
          ),
        }}
      />
      <Modal title="新增仓库" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ locationCode: 'A-01', locationName: 'A区01货位' }}>
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="manager" label="负责人">
            <Input />
          </Form.Item>
          <Form.Item name="locationCode" label="首个货位编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="locationName" label="首个货位名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="capacity" label="容量">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
