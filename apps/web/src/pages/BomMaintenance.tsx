import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type InventoryItem = { id: string; code: string; name: string; isManufactured?: boolean };
type Bom = {
  id: string;
  productItemCode?: string;
  productItemName?: string;
  version: string;
  status: string;
  yieldQuantity: number;
  lines: Array<{ componentItemCode?: string; componentItemName?: string; quantity: number; scrapRate: number }>;
};

export const BomMaintenance: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) {
      setItems([]);
      setBoms([]);
      return;
    }
    setLoading(true);
    try {
      const [itemRows, bomRows] = await Promise.all([
        api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
        api.get(`/boms?accountSetId=${currentAccountSetId}`),
      ]);
      setItems(itemRows ?? []);
      setBoms(bomRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    try {
      await api.post('/boms', {
        accountSetId: currentAccountSetId,
        productItemId: values.productItemId,
        version: values.version,
        status: 'active',
        yieldQuantity: values.yieldQuantity,
        createdBy: currentUser,
        lines: [{ componentItemId: values.componentItemId, quantity: values.quantity, scrapRate: values.scrapRate ?? 0, lineNo: 1 }],
      });
      setModalOpen(false);
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>BOM Maintenance</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={boms}
        columns={[
          { title: 'Product', render: (_: unknown, record: Bom) => `${record.productItemCode ?? ''} ${record.productItemName ?? ''}` },
          { title: 'Version', dataIndex: 'version', width: 110 },
          { title: 'Status', dataIndex: 'status', width: 110 },
          { title: 'Yield', dataIndex: 'yieldQuantity', width: 100 },
          { title: 'Lines', width: 120, render: (_: unknown, record: Bom) => record.lines?.length ?? 0 },
        ]}
      />
      <Modal title="New BOM" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical" initialValues={{ version: 'V1', yieldQuantity: 1, quantity: 1, scrapRate: 0 }}>
          <Form.Item name="productItemId" label="Manufactured product" rules={[{ required: true }]}>
            <Select options={items.filter((item) => item.isManufactured).map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="componentItemId" label="Component" rules={[{ required: true }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="version" label="Version" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="yieldQuantity" label="Yield quantity">
            <InputNumber min={0.000001} precision={6} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quantity" label="Component quantity">
            <InputNumber min={0.000001} precision={6} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="scrapRate" label="Scrap rate">
            <InputNumber min={0} max={0.99} step={0.01} precision={4} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
