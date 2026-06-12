import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type ProductionPlanLine = {
  id: string;
  lineNo: number;
  productItemCode: string;
  productItemName: string;
  plannedQuantity: number;
  plannedStartDate?: string;
  plannedFinishDate?: string;
  status: string;
};

type ProductionPlan = {
  id: string;
  planNo: string;
  fiscalYear: number;
  periodNo: number;
  status: string;
  sourceType: string;
  lines: ProductionPlanLine[];
};

const statusLabel: Record<string, string> = {
  draft: '草稿',
  planned: '已计划',
  released: '已下达',
  closed: '已关闭',
};

export const ProductionPlans: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [rows, setRows] = useState<ProductionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [workOrderDrafts, setWorkOrderDrafts] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const payload = await api.get(`/production-plans?accountSetId=${encodeURIComponent(currentAccountSetId)}`);
      setRows(payload?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    form.setFieldsValue({
      fiscalYear: currentYear,
      periodNo: currentPeriod,
      plannedQuantity: 1,
      plannedStartDate: new Date().toISOString().slice(0, 10),
      plannedFinishDate: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!currentAccountSetId) return;
    const values = await form.validateFields();
    await api.post('/production-plans', {
      accountSetId: currentAccountSetId,
      planNo: values.planNo,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      status: 'draft',
      sourceType: 'manual',
      createdBy: currentUser,
      lines: [
        {
          productItemCode: values.productItemCode,
          productItemName: values.productItemName,
          plannedQuantity: values.plannedQuantity,
          plannedStartDate: values.plannedStartDate,
          plannedFinishDate: values.plannedFinishDate,
        },
      ],
    });
    message.success('生产计划已保存');
    setModalOpen(false);
    await fetchData();
  };

  const generateWorkOrders = async (record: ProductionPlan) => {
    const payload = await api.post(`/production-plans/${encodeURIComponent(record.id)}/generate-work-orders`, {
      dryRun: true,
      requestedBy: currentUser,
    });
    setWorkOrderDrafts(payload?.workOrderDrafts ?? []);
    setDraftOpen(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>主生产计划</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增计划</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        expandable={{
          expandedRowRender: (record) => (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={record.lines}
              columns={[
                { title: '行号', dataIndex: 'lineNo' },
                { title: '产品编码', dataIndex: 'productItemCode' },
                { title: '产品名称', dataIndex: 'productItemName' },
                { title: '计划数量', dataIndex: 'plannedQuantity' },
                { title: '开始日期', dataIndex: 'plannedStartDate' },
                { title: '完成日期', dataIndex: 'plannedFinishDate' },
              ]}
            />
          ),
        }}
        columns={[
          { title: '计划号', dataIndex: 'planNo' },
          { title: '年度', dataIndex: 'fiscalYear' },
          { title: '期间', dataIndex: 'periodNo' },
          { title: '来源', dataIndex: 'sourceType' },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statusLabel[value] ?? value}</Tag> },
          {
            title: '操作',
            render: (_: unknown, record: ProductionPlan) => (
              <Button onClick={() => generateWorkOrders(record)}>生成工单草稿</Button>
            ),
          },
        ]}
      />
      <Modal title="新增主生产计划" open={modalOpen} onOk={save} onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="planNo" label="计划号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="fiscalYear" label="年度" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="productItemCode" label="产品编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="productItemName" label="产品名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="plannedQuantity" label="计划数量" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="plannedStartDate" label="开始日期"><Input /></Form.Item>
          <Form.Item name="plannedFinishDate" label="完成日期"><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title="工单草稿" open={draftOpen} footer={null} onCancel={() => setDraftOpen(false)} width={900}>
        <Table
          rowKey="planLineId"
          size="small"
          pagination={false}
          dataSource={workOrderDrafts}
          columns={[
            { title: '工单号', dataIndex: 'workOrderNo' },
            { title: '产品编码', dataIndex: 'productItemCode' },
            { title: '产品名称', dataIndex: 'productItemName' },
            { title: '计划数量', dataIndex: 'plannedQuantity' },
            { title: '状态', dataIndex: 'status' },
          ]}
        />
      </Modal>
    </div>
  );
};
