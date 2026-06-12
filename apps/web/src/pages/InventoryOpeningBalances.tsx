import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Statistic, Table, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type InventoryItem = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string; locations: Array<{ id: string; code: string; name: string }> };
type OpeningBalance = {
  id: string;
  itemCode?: string;
  itemName?: string;
  warehouseCode?: string;
  locationCode?: string;
  batchNo?: string;
  quantity: number;
  amount: number;
  unitCost: number;
};

export const InventoryOpeningBalances: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser, currentYear, currentPeriod } = useAppContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balances, setBalances] = useState<OpeningBalance[]>([]);
  const [trial, setTrial] = useState<{ totalQuantity: number; totalAmount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) {
      setItems([]);
      setWarehouses([]);
      setBalances([]);
      setTrial(null);
      return;
    }
    setLoading(true);
    try {
      const [itemRows, warehouseRows, balanceRows, trialResult] = await Promise.all([
        api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
        api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
        api.get(`/inventory-opening-balances?accountSetId=${currentAccountSetId}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`),
        api.get(`/inventory-opening-balances/trial-balance?accountSetId=${currentAccountSetId}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`),
      ]);
      setItems(itemRows ?? []);
      setWarehouses(warehouseRows ?? []);
      setBalances(balanceRows ?? []);
      setTrial(trialResult ?? null);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, currentPeriod, currentYear]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const selectedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);

  const handleSave = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    try {
      await api.post('/inventory-opening-balances', {
        ...values,
        accountSetId: currentAccountSetId,
        fiscalYear: currentYear,
        periodNo: currentPeriod,
        createdBy: currentUser,
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
        <h2 style={{ margin: 0 }}>存货期初余额</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增
          </Button>
        </Space>
      </div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, padding: '12px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
        <Statistic title="期初数量" value={trial?.totalQuantity ?? 0} precision={2} />
        <Statistic title="期初金额" value={trial?.totalAmount ?? 0} precision={2} />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={balances}
        columns={[
          { title: '存货', render: (_: unknown, record: OpeningBalance) => `${record.itemCode ?? ''} ${record.itemName ?? ''}` },
          { title: '仓库', dataIndex: 'warehouseCode', width: 130 },
          { title: '货位', dataIndex: 'locationCode', width: 130 },
          { title: '批次', dataIndex: 'batchNo', width: 150 },
          { title: '数量', dataIndex: 'quantity', width: 120, align: 'right' },
          { title: '金额', dataIndex: 'amount', width: 120, align: 'right' },
          { title: '单位成本', dataIndex: 'unitCost', width: 120, align: 'right' },
        ]}
      />
      <Modal title="新增期初余额" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="itemId" label="存货" rules={[{ required: true }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="warehouseId" label="仓库" rules={[{ required: true }]}>
            <Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
          </Form.Item>
          <Form.Item name="locationId" label="货位">
            <Select allowClear options={(selectedWarehouse?.locations ?? []).map((location) => ({ value: location.id, label: `${location.code} ${location.name}` }))} />
          </Form.Item>
          <Form.Item name="batchNo" label="批次号">
            <Input />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0} precision={6} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
