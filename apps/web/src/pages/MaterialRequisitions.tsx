import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

type Requisition = { id: string; requisitionNo: string; workOrderNo: string; sourceMovementId: string; totalQuantity: number; totalAmount: number };
type OptionRow = { id: string; code?: string; name?: string; workOrderNo?: string };

export const MaterialRequisitions: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<Requisition[]>([]);
  const [workOrders, setWorkOrders] = useState<OptionRow[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [requisitions, woRows, itemRows, warehouseRows] = await Promise.all([
      api.get(`/material-requisitions?accountSetId=${currentAccountSetId}`),
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
      api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
    ]);
    setRows(requisitions ?? []);
    setWorkOrders(woRows ?? []);
    setItems(itemRows ?? []);
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
    await api.post('/material-requisitions', {
      accountSetId: currentAccountSetId,
      requisitionNo: values.requisitionNo,
      workOrderId: values.workOrderId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
      lines: [{ componentItemId: values.componentItemId, warehouseId: values.warehouseId, batchNo: values.batchNo, quantity: values.quantity }],
    });
    setModalOpen(false);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>生产领料</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="material_requisition"
            sourceObjectType="material_requisition_page"
            userInstruction="根据工单、BOM、领料单或上传附件生成生产领料候选草稿"
          >
            Agent 生成领料草稿
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: '领料单号', dataIndex: 'requisitionNo' },
          { title: '工单', dataIndex: 'workOrderNo' },
          { title: '来源出库单', dataIndex: 'sourceMovementId' },
          { title: '数量', dataIndex: 'totalQuantity' },
          { title: '金额', dataIndex: 'totalAmount' },
        ]}
      />
      <Modal title="新增生产领料" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="requisitionNo" label="领料单号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="workOrderId" label="工单" rules={[{ required: true }]}><Select options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} /></Form.Item>
          <Form.Item name="componentItemId" label="组件物料" rules={[{ required: true }]}><Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} /></Form.Item>
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
