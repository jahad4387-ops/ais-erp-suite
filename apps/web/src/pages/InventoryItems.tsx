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
  { value: 'moving_average', label: 'Moving average' },
  { value: 'fifo', label: 'FIFO' },
  { value: 'specific_identification', label: 'Specific identification' },
  { value: 'monthly_weighted_average', label: 'Monthly weighted average' },
];

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
      message.error('Please select an account set first.');
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Inventory Items</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchItems}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New
          </Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        description="BATCH_COST_METHOD_CONFLICT: batch-managed items must use FIFO or specific identification."
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={[
          { title: 'Code', dataIndex: 'code', width: 140 },
          { title: 'Name', dataIndex: 'name' },
          { title: 'Unit', dataIndex: 'unit', width: 90 },
          { title: 'Cost method', dataIndex: 'costMethod', width: 190 },
          { title: 'Batch', dataIndex: 'isBatchManaged', width: 90, render: (value: boolean) => <Tag color={value ? 'blue' : 'default'}>{value ? 'Yes' : 'No'}</Tag> },
          { title: 'Manufactured', dataIndex: 'isManufactured', width: 130, render: (value: boolean) => <Tag color={value ? 'purple' : 'default'}>{value ? 'Yes' : 'No'}</Tag> },
        ]}
      />
      <Modal title="New inventory item" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Input />
          </Form.Item>
          <Form.Item name="itemType" label="Item type">
            <Select
              options={[
                { value: 'raw_material', label: 'Raw material' },
                { value: 'finished_good', label: 'Finished good' },
                { value: 'semi_finished', label: 'Semi-finished' },
              ]}
            />
          </Form.Item>
          <Form.Item name="unit" label="Unit" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="costMethod" label="Cost method" rules={[{ required: true }]}>
            <Select options={costMethodOptions} />
          </Form.Item>
          <Form.Item name="isBatchManaged" valuePropName="checked">
            <Checkbox>Batch managed</Checkbox>
          </Form.Item>
          <Form.Item name="isSerialManaged" valuePropName="checked">
            <Checkbox>Serial managed</Checkbox>
          </Form.Item>
          <Form.Item name="isManufactured" valuePropName="checked">
            <Checkbox>Manufactured item</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
