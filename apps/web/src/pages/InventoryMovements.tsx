import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

type Movement = {
  id: string;
  documentNo: string;
  movementType: string;
  businessType: string;
  totalQuantity: number;
  totalAmount: number;
  costStatus: string;
  lines?: Array<{ itemCode?: string; quantity: number; amount: number; costBreakdown?: unknown[] }>;
};

type OptionRow = { id: string; code: string; name: string };

const movementTypeLabel: Record<string, string> = {
  inbound: '入库',
  outbound: '出库',
};

const businessTypeLabel: Record<string, string> = {
  other_inbound: '其他入库',
  other_outbound: '其他出库',
  purchase_inbound: '采购入库',
  sales_outbound: '销售出库',
};

const costStatusLabel: Record<string, string> = {
  calculated: '已计算',
  pending: '待计算',
  adjusted: '已调整',
};

export const InventoryMovements: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [items, setItems] = useState<OptionRow[]>([]);
  const [warehouses, setWarehouses] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const [movementRows, itemRows, warehouseRows] = await Promise.all([
        api.get(`/inventory-movements?accountSetId=${currentAccountSetId}`),
        api.get(`/inventory-items?accountSetId=${currentAccountSetId}`),
        api.get(`/warehouses?accountSetId=${currentAccountSetId}`),
      ]);
      setMovements(movementRows ?? []);
      setItems(itemRows ?? []);
      setWarehouses(warehouseRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({
      movementType: 'inbound',
      businessType: 'other_inbound',
      fiscalYear: currentYear,
      periodNo: currentPeriod,
      quantity: 1,
      unitCost: 0,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/inventory-movements', {
      accountSetId: currentAccountSetId,
      documentNo: values.documentNo,
      movementType: values.movementType,
      businessType: values.businessType,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
      lines: [{
        itemId: values.itemId,
        warehouseId: values.warehouseId,
        batchNo: values.batchNo,
        quantity: values.quantity,
        unitCost: values.unitCost,
      }],
    });
    setModalOpen(false);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>库存出入库</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="inventory_movement"
            sourceObjectType="inventory_movement_page"
            userInstruction="根据仓库指令、扫码记录或上传附件生成库存出入库候选草稿"
          >
            Agent 生成仓库草稿
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={movements}
        expandable={{
          expandedRowRender: (record) => (
            <Table
              rowKey={(line) => `${record.id}-${line.itemCode}-${line.quantity}`}
              pagination={false}
              dataSource={record.lines ?? []}
              columns={[
                { title: '存货', dataIndex: 'itemCode' },
                { title: '数量', dataIndex: 'quantity' },
                { title: '金额', dataIndex: 'amount' },
                { title: '成本明细', dataIndex: 'costBreakdown', render: (value: unknown[]) => value?.length ?? 0 },
              ]}
            />
          ),
        }}
        columns={[
          { title: '单据号', dataIndex: 'documentNo' },
          { title: '类型', render: (_: unknown, record: Movement) => movementTypeLabel[record.movementType] ?? record.movementType },
          { title: '业务类型', render: (_: unknown, record: Movement) => businessTypeLabel[record.businessType] ?? record.businessType },
          { title: '数量', dataIndex: 'totalQuantity' },
          { title: '金额', dataIndex: 'totalAmount' },
          { title: '成本状态', dataIndex: 'costStatus', render: (value: string) => <Tag color="green">{costStatusLabel[value] ?? value}</Tag> },
          {
            title: 'Agent',
            render: (_: unknown, record: Movement) => (
              <AgentDraftEntryButton
                draftType="inventory_movement"
                sourceObjectType="inventory_movement"
                sourceObjectId={record.id}
                userInstruction={`Generate an inventory movement draft from ${record.documentNo}.`}
                size="small"
              >
                Agent
              </AgentDraftEntryButton>
            ),
          },
        ]}
      />
      <Modal title="新增库存出入库" open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="documentNo" label="单据号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="movementType" label="出入库类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'inbound', label: '入库' }, { value: 'outbound', label: '出库' }]} />
          </Form.Item>
          <Form.Item name="businessType" label="业务类型" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="itemId" label="存货" rules={[{ required: true }]}>
            <Select options={items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
          </Form.Item>
          <Form.Item name="warehouseId" label="仓库" rules={[{ required: true }]}>
            <Select options={warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} ${warehouse.name}` }))} />
          </Form.Item>
          <Form.Item name="batchNo" label="批次号">
            <Input />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0.000001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unitCost" label="单位成本">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fiscalYear" label="会计年度" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}>
            <InputNumber min={1} max={12} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
