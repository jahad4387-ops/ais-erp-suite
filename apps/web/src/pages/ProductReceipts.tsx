import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

type Receipt = { id: string; receiptNo: string; workOrderNo: string; sourceMovementId: string; costStatus: string; totalQuantity: number; totalAmount: number };
type OptionRow = { id: string; code?: string; name?: string; workOrderNo?: string; isManufactured?: boolean };

const costStatusLabel: Record<string, string> = {
  calculated: '已计算',
  pending: '待计算',
  adjusted: '已调整',
};

export const ProductReceipts: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [workOrders, setWorkOrders] = useState<OptionRow[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [receipts, woRows, itemRows, warehouseRows] = await Promise.all([
      api.get(`/product-receipts?accountSetId=${currentAccountSetId}`),
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
      api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
    ]);
    setRows(receipts ?? []);
    setWorkOrders(woRows ?? []);
    setItems((itemRows ?? []).filter((item: OptionRow) => item.isManufactured));
    setWarehouses(warehouseRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({ quantity: 1, fiscalYear: currentYear, periodNo: currentPeriod });
    setModalOpen(true);
  };

  const save = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/product-receipts', {
      accountSetId: currentAccountSetId,
      receiptNo: values.receiptNo,
      workOrderId: values.workOrderId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
      lines: [{ productItemId: values.productItemId, warehouseId: values.warehouseId, batchNo: values.batchNo, quantity: values.quantity }],
    });
    setModalOpen(false);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>完工入库</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="product_receipt"
            sourceObjectType="product_receipt_page"
            userInstruction="根据工单、完工报告、检验单或上传附件生成完工入库候选草稿"
          >
            Agent 生成入库草稿
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: '入库单号', dataIndex: 'receiptNo' },
          { title: '工单', dataIndex: 'workOrderNo' },
          { title: '来源入库单', dataIndex: 'sourceMovementId' },
          { title: '数量', dataIndex: 'totalQuantity' },
          { title: '金额', dataIndex: 'totalAmount' },
          { title: '成本状态', dataIndex: 'costStatus', render: (value: string) => <Tag color="blue">{costStatusLabel[value] ?? value}</Tag> },
        ]}
      />
      <Modal title="新增完工入库" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="receiptNo" label="入库单号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="workOrderId" label="工单" rules={[{ required: true }]}><Select options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} /></Form.Item>
          <Form.Item name="productItemId" label="产品" rules={[{ required: true }]}><Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} /></Form.Item>
          <Form.Item name="warehouseId" label="仓库" rules={[{ required: true }]}><Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} /></Form.Item>
          <Form.Item name="batchNo" label="批次号"><Input /></Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fiscalYear" label="会计年度" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
