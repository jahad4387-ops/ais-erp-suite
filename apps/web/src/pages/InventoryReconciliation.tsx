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
        <h2 style={{ margin: 0 }}>Inventory Reconciliation</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type={differenceAmount === 0 ? 'success' : 'warning'}
        showIcon
        description="Phase 3 reconciliation compares inventory balance totals with self-test costing outputs before Phase 4 formal sources arrive."
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="Year" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
      </Form>
      <Descriptions bordered size="small" column={4} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Inventory total">{run?.inventoryBalanceTotal ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Cost adjustments">{run?.costAdjustmentTotal ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Difference">{differenceAmount}</Descriptions.Item>
        <Descriptions.Item label="Status">
          {differenceAmount === 0 ? <Tag color="green">Balanced</Tag> : <Tag color="orange">Review</Tag>}
        </Descriptions.Item>
      </Descriptions>
      <Table
        rowKey={(row) => `${row.itemId}:${row.warehouseCode}:${row.batchNo ?? ''}`}
        loading={loading}
        dataSource={run?.rows ?? []}
        columns={[
          { title: 'Item', dataIndex: 'itemCode' },
          { title: 'Warehouse', dataIndex: 'warehouseCode' },
          { title: 'Batch', dataIndex: 'batchNo' },
          { title: 'Quantity', dataIndex: 'quantity' },
          { title: 'Amount', dataIndex: 'amount' },
        ]}
      />
    </div>
  );
};
