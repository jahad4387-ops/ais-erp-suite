import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';
import { useAppContext } from '../context/AppContext';

type LineSideWarehouse = {
  id: string;
  code: string;
  name: string;
  productionLineCode: string;
  mainWarehouseCode: string;
  isEnabled: boolean;
};

type LineSideMovement = {
  id: string;
  lineSideWarehouseCode: string;
  movementType: string;
  workOrderId?: string;
  itemCode: string;
  itemName: string;
  quantity: number;
};

export const LineSideWarehouses: React.FC = () => {
  const [warehouseForm] = Form.useForm();
  const [movementForm] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [rows, setRows] = useState<LineSideWarehouse[]>([]);
  const [movements, setMovements] = useState<LineSideMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const [warehousePayload, movementPayload] = await Promise.all([
        api.get(`/line-side-warehouses?accountSetId=${encodeURIComponent(currentAccountSetId)}`),
        api.get(`/line-side-material-movements?accountSetId=${encodeURIComponent(currentAccountSetId)}`),
      ]);
      setRows(warehousePayload?.items ?? []);
      setMovements(movementPayload?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const saveWarehouse = async () => {
    if (!currentAccountSetId) return;
    const values = await warehouseForm.validateFields();
    await api.post('/line-side-warehouses', {
      ...values,
      accountSetId: currentAccountSetId,
      isEnabled: true,
      createdBy: currentUser,
    });
    message.success('线边仓已保存');
    setWarehouseModalOpen(false);
    warehouseForm.resetFields();
    await fetchData();
  };

  const saveMovement = async () => {
    if (!currentAccountSetId) return;
    const values = await movementForm.validateFields();
    await api.post('/line-side-material-movements', {
      ...values,
      accountSetId: currentAccountSetId,
      createdBy: currentUser,
    });
    message.success('线边仓物料记录已保存');
    setMovementModalOpen(false);
    movementForm.resetFields();
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>线边仓管理</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="line_side_replenishment"
            sourceObjectType="line_side_warehouse_page"
            userInstruction="Generate line-side warehouse replenishment or return-material draft from work order and line-side stock context."
          >
            Agent
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button onClick={() => setMovementModalOpen(true)} disabled={!rows.length}>补退料记录</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setWarehouseModalOpen(true)}>新增线边仓</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: '线边仓编码', dataIndex: 'code' },
          { title: '线边仓名称', dataIndex: 'name' },
          { title: '产线', dataIndex: 'productionLineCode' },
          { title: '主仓', dataIndex: 'mainWarehouseCode' },
          { title: '状态', dataIndex: 'isEnabled', render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag> },
        ]}
      />
      <Table
        rowKey="id"
        style={{ marginTop: 16 }}
        size="small"
        loading={loading}
        dataSource={movements}
        columns={[
          { title: '线边仓', dataIndex: 'lineSideWarehouseCode' },
          { title: '类型', dataIndex: 'movementType' },
          { title: '工单ID', dataIndex: 'workOrderId' },
          { title: '物料编码', dataIndex: 'itemCode' },
          { title: '物料名称', dataIndex: 'itemName' },
          { title: '数量', dataIndex: 'quantity' },
        ]}
      />
      <Modal title="新增线边仓" open={warehouseModalOpen} onOk={saveWarehouse} onCancel={() => setWarehouseModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={warehouseForm} layout="vertical">
          <Form.Item name="code" label="线边仓编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="线边仓名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="productionLineCode" label="产线编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="mainWarehouseCode" label="主仓编码" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title="线边仓补退料" open={movementModalOpen} onOk={saveMovement} onCancel={() => setMovementModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={movementForm} layout="vertical" initialValues={{ movementType: 'replenish', quantity: 1 }}>
          <Form.Item name="lineSideWarehouseId" label="线边仓" rules={[{ required: true }]}><Select options={rows.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))} /></Form.Item>
          <Form.Item name="movementType" label="业务类型" rules={[{ required: true }]}><Select options={[{ value: 'replenish', label: '补料' }, { value: 'return', label: '退料' }, { value: 'consume', label: '消耗' }]} /></Form.Item>
          <Form.Item name="workOrderId" label="工单ID"><Input /></Form.Item>
          <Form.Item name="itemCode" label="物料编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="itemName" label="物料名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
