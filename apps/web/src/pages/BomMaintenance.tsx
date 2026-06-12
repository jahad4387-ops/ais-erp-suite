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

const statusLabel: Record<string, string> = {
  active: '启用',
  inactive: '停用',
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
        <h2 style={{ margin: 0 }}>BOM 维护</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
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
        dataSource={boms}
        columns={[
          { title: '产品', render: (_: unknown, record: Bom) => `${record.productItemCode ?? ''} ${record.productItemName ?? ''}` },
          { title: '版本', dataIndex: 'version', width: 110 },
          { title: '状态', render: (_: unknown, record: Bom) => statusLabel[record.status] ?? record.status, width: 110 },
          { title: '产出数量', dataIndex: 'yieldQuantity', width: 100 },
          { title: '明细行', width: 120, render: (_: unknown, record: Bom) => record.lines?.length ?? 0 },
        ]}
      />
      <Modal title="新增 BOM" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ version: 'V1', yieldQuantity: 1, quantity: 1, scrapRate: 0 }}>
          <Form.Item name="productItemId" label="产成品" rules={[{ required: true }]}>
            <Select options={items.filter((item) => item.isManufactured).map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="componentItemId" label="组件物料" rules={[{ required: true }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="version" label="版本" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="yieldQuantity" label="产出数量">
            <InputNumber min={0.000001} precision={6} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quantity" label="组件用量">
            <InputNumber min={0.000001} precision={6} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="scrapRate" label="损耗率">
            <InputNumber min={0} max={0.99} step={0.01} precision={4} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
