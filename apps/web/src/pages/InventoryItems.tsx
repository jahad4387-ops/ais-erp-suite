import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type InventoryItem = {
  id: string;
  code: string;
  name: string;
  category?: string;
  itemType: string;
  unit: string;
  costMethod: string;
  isBatchManaged: boolean;
  isSerialManaged: boolean;
  isManufactured: boolean;
  isEnabled?: boolean;
};

const costMethodOptions = [
  { value: 'moving_average', label: '移动平均' },
  { value: 'fifo', label: '先进先出' },
  { value: 'specific_identification', label: '个别计价' },
  { value: 'monthly_weighted_average', label: '月末加权平均' },
];

const batchCostMethodGuardrail = 'BATCH_COST_METHOD_CONFLICT';

export const InventoryItems: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!currentAccountSetId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.get(`/inventory-items?accountSetId=${currentAccountSetId}`);
      setItems(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const openCreate = () => {
    form.setFieldsValue({
      itemType: 'raw_material',
      unit: 'pcs',
      costMethod: 'moving_average',
      isBatchManaged: false,
      isSerialManaged: false,
      isManufactured: false,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择账套。');
      return;
    }
    const values = await form.validateFields();
    try {
      await api.post('/inventory-items', {
        ...values,
        accountSetId: currentAccountSetId,
        createdBy: currentUser,
      });
      setModalOpen(false);
      await fetchItems();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleFormValuesChange = (changedValues: Partial<InventoryItem>) => {
    const isBatchManaged = changedValues.isBatchManaged ?? form.getFieldValue('isBatchManaged');
    if (isBatchManaged && form.getFieldValue('costMethod') === 'moving_average') {
      form.setFieldValue('costMethod', 'fifo');
      message.info('启用批次管理后，计价方法已切换为先进先出。');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>存货档案</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchItems}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增
          </Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        data-guardrail={batchCostMethodGuardrail}
        description="批次管理的存货必须使用先进先出或个别计价，避免批次成本与计价方法冲突。"
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={[
          { title: '编码', dataIndex: 'code', width: 140 },
          { title: '名称', dataIndex: 'name' },
          { title: '单位', dataIndex: 'unit', width: 90 },
          { title: '计价方法', dataIndex: 'costMethod', width: 190 },
          { title: '批次', dataIndex: 'isBatchManaged', width: 90, render: (value: boolean) => <Tag color={value ? 'blue' : 'default'}>{value ? '是' : '否'}</Tag> },
          { title: '自制', dataIndex: 'isManufactured', width: 130, render: (value: boolean) => <Tag color={value ? 'purple' : 'default'}>{value ? '是' : '否'}</Tag> },
        ]}
      />
      <Modal title="新增存货档案" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical" onValuesChange={handleFormValuesChange}>
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input />
          </Form.Item>
          <Form.Item name="itemType" label="存货类型">
            <Select
              options={[
                { value: 'raw_material', label: '原材料' },
                { value: 'finished_good', label: '产成品' },
                { value: 'semi_finished', label: '半成品' },
              ]}
            />
          </Form.Item>
          <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="costMethod" label="计价方法" rules={[{ required: true }]}>
            <Select options={costMethodOptions} />
          </Form.Item>
          <Form.Item name="isBatchManaged" valuePropName="checked">
            <Checkbox>启用批次管理</Checkbox>
          </Form.Item>
          <Form.Item name="isSerialManaged" valuePropName="checked">
            <Checkbox>启用序列号管理</Checkbox>
          </Form.Item>
          <Form.Item name="isManufactured" valuePropName="checked">
            <Checkbox>自制件</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
