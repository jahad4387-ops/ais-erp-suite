import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

type WorkOrder = { id: string; workOrderNo: string; productItemCode: string; bomVersion: string; plannedQuantity: number; completedQuantity: number; directMaterialCost: number; status: string };
type OptionRow = { id: string; code?: string; name?: string; productItemCode?: string; version?: string; isManufactured?: boolean };

const statusLabel: Record<string, string> = {
  draft: '草稿',
  released: '已下达',
  closed: '已关闭',
};

export const ProductionWorkOrders: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [boms, setBoms] = useState<OptionRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [workOrders, itemRows, bomRows] = await Promise.all([
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
      api.get(`/boms?accountSetId=${currentAccountSetId}`),
    ]);
    setRows(workOrders ?? []);
    setItems((itemRows ?? []).filter((item: OptionRow) => item.isManufactured));
    setBoms(bomRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({ plannedQuantity: 1, fiscalYear: currentYear, periodNo: currentPeriod });
    setModalOpen(true);
  };

  const save = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/work-orders', { ...values, accountSetId: currentAccountSetId, createdBy: currentUser });
    setModalOpen(false);
    await fetchData();
  };

  const release = async (record: WorkOrder) => {
    await api.post(`/work-orders/${record.id}/release`, { releasedBy: currentUser });
    message.success('已下达');
    await fetchData();
  };

  const close = async (record: WorkOrder) => {
    await api.post(`/work-orders/${record.id}/close`, { closedBy: currentUser });
    message.success('已关闭');
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>生产工单</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: '工单号', dataIndex: 'workOrderNo' },
          { title: '产品', dataIndex: 'productItemCode' },
          { title: 'BOM', dataIndex: 'bomVersion' },
          { title: '计划数量', dataIndex: 'plannedQuantity' },
          { title: '完工数量', dataIndex: 'completedQuantity' },
          { title: '直接材料成本', dataIndex: 'directMaterialCost' },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statusLabel[value] ?? value}</Tag> },
          {
            title: '操作',
            render: (_: unknown, record: WorkOrder) => (
              <Space>
                <AgentDraftEntryButton
                  size="small"
                  draftType="material_requisition"
                  sourceObjectType="work_order"
                  sourceObjectId={record.id}
                  userInstruction={`根据 ${record.workOrderNo} 生成生产领料候选草稿`}
                >
                  领料草稿
                </AgentDraftEntryButton>
                <AgentDraftEntryButton
                  size="small"
                  draftType="product_receipt"
                  sourceObjectType="work_order"
                  sourceObjectId={record.id}
                  userInstruction={`根据 ${record.workOrderNo} 生成完工入库候选草稿`}
                >
                  入库草稿
                </AgentDraftEntryButton>
                <Button onClick={() => release(record)}>下达</Button>
                <Button onClick={() => close(record)}>关闭</Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal title="新增生产工单" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="workOrderNo" label="工单号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="productItemId" label="产品" rules={[{ required: true }]}><Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} /></Form.Item>
          <Form.Item name="bomId" label="BOM" rules={[{ required: true }]}><Select options={boms.map((bom) => ({ value: bom.id, label: `${bom.productItemCode} ${bom.version}` }))} /></Form.Item>
          <Form.Item name="plannedQuantity" label="计划数量" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fiscalYear" label="会计年度" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
