import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Form, InputNumber, Space, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type ReconciliationRow = {
  itemId: string;
  itemCode: string;
  warehouseCode: string;
  batchNo?: string | null;
  quantity: number;
  amount: number;
};

type InventoryReconciliationRun = {
  id: string;
  fiscalYear: number;
  periodNo: number;
  inventoryBalanceTotal: number;
  costAdjustmentTotal: number;
  differenceAmount: number;
  rows: ReconciliationRow[];
};

export const InventoryReconciliation: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentYear } = useAppContext();
  const [run, setRun] = useState<InventoryReconciliationRun | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    setLoading(true);
    try {
      setRun(await api.get(`/inventory-reconciliation?accountSetId=${currentAccountSetId}&fiscalYear=${values.fiscalYear}&periodNo=${values.periodNo}`));
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, form]);

  useEffect(() => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod });
    void fetchData();
  }, [currentPeriod, currentYear, fetchData, form]);

  const differenceAmount = run?.differenceAmount ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>存货对账</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type={differenceAmount === 0 ? 'success' : 'warning'}
        showIcon
        description="存货对账用于核对库存余额与成本调整结果，差异为 0 时表示账实一致。"
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="年度" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="期间" /></Form.Item>
      </Form>
      <Descriptions bordered size="small" column={4} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="库存余额">{run?.inventoryBalanceTotal ?? 0}</Descriptions.Item>
        <Descriptions.Item label="成本调整">{run?.costAdjustmentTotal ?? 0}</Descriptions.Item>
        <Descriptions.Item label="差异">{differenceAmount}</Descriptions.Item>
        <Descriptions.Item label="状态">
          {differenceAmount === 0 ? <Tag color="green">平衡</Tag> : <Tag color="orange">需复核</Tag>}
        </Descriptions.Item>
      </Descriptions>
      <Table
        rowKey={(row) => `${row.itemId}:${row.warehouseCode}:${row.batchNo ?? ''}`}
        loading={loading}
        dataSource={run?.rows ?? []}
        columns={[
          { title: '存货', dataIndex: 'itemCode' },
          { title: '仓库', dataIndex: 'warehouseCode' },
          { title: '批次', dataIndex: 'batchNo' },
          { title: '数量', dataIndex: 'quantity' },
          { title: '金额', dataIndex: 'amount' },
        ]}
      />
    </div>
  );
};
