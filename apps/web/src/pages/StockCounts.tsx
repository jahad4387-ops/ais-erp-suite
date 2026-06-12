import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Select, Space, Table, message } from 'antd';
import { CalculatorOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

type OptionRow = { id: string; code: string; name: string };
type StockCountLine = {
  id: string;
  itemCode: string;
  warehouseCode: string;
  batchNo?: string | null;
  bookQuantity: number;
  actualQuantity: number;
  differenceQuantity: number;
  adjustmentAmount: number;
};

export const StockCounts: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [lines, setLines] = useState<StockCountLine[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMasters = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const [itemRows, warehouseRows] = await Promise.all([
        api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
        api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
      ]);
      setItems(itemRows ?? []);
      setWarehouses(warehouseRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod, actualQuantity: 0 });
    void fetchMasters();
  }, [currentPeriod, currentYear, fetchMasters, form]);

  const preview = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    const result = await api.post('/stock-counts/preview', {
      accountSetId: currentAccountSetId,
      countNo: values.countNo,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
      lines: [{
        itemId: values.itemId,
        warehouseId: values.warehouseId,
        batchNo: values.batchNo,
        actualQuantity: values.actualQuantity,
        reason: values.reason,
      }],
    });
    setLines(result.lines ?? []);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>存货盘点</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="stock_count"
            sourceObjectType="stock_count_page"
            userInstruction="根据盘点表、仓库库位和上传附件生成盘点候选草稿"
          >
            Agent 生成盘点草稿
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchMasters}>刷新</Button>
          <Button type="primary" icon={<CalculatorOutlined />} onClick={preview}>预览</Button>
        </Space>
      </div>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="countNo" rules={[{ required: true }]}>
          <Input placeholder="盘点单号" />
        </Form.Item>
        <Form.Item name="itemId" rules={[{ required: true }]}>
          <Select style={{ width: 220 }} placeholder="存货" options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
        </Form.Item>
        <Form.Item name="warehouseId" rules={[{ required: true }]}>
          <Select style={{ width: 220 }} placeholder="仓库" options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
        </Form.Item>
        <Form.Item name="batchNo">
          <Input placeholder="批次" />
        </Form.Item>
        <Form.Item name="actualQuantity" rules={[{ required: true }]}>
          <InputNumber min={0} placeholder="实盘数量" />
        </Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}>
          <InputNumber placeholder="年度" />
        </Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}>
          <InputNumber min={1} max={12} placeholder="期间" />
        </Form.Item>
      </Form>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={lines}
        columns={[
          { title: '存货', dataIndex: 'itemCode' },
          { title: '仓库', dataIndex: 'warehouseCode' },
          { title: '批次', dataIndex: 'batchNo' },
          { title: '账面数量', dataIndex: 'bookQuantity' },
          { title: '实盘数量', dataIndex: 'actualQuantity' },
          { title: '差异数量', dataIndex: 'differenceQuantity' },
          { title: '调整金额', dataIndex: 'adjustmentAmount' },
        ]}
      />
    </div>
  );
};
