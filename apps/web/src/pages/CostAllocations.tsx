import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, InputNumber, Select, Space, Table } from 'antd';
import { CalculatorOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type WorkOrder = { id: string; workOrderNo: string };
type CostInput = { id: string; workOrderNo: string; costType: string; amount: number; lockedAt?: string | null };
type AllocationLine = { id: string; costType: string; allocatedAmount: number };
type Allocation = { id: string; dryRun: boolean; totalAllocatedAmount: number; warningCodes: string[]; lines: AllocationLine[] };

export const CostAllocations: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [inputs, setInputs] = useState<CostInput[]>([]);
  const [allocation, setAllocation] = useState<Allocation | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [orders, costInputs] = await Promise.all([
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/mock-cost-inputs?accountSetId=${currentAccountSetId}`),
    ]);
    setWorkOrders(orders ?? []);
    setInputs(costInputs ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod });
    void fetchData();
  }, [currentPeriod, currentYear, fetchData, form]);

  const requestPayload = async () => {
    const values = await form.validateFields();
    return {
      accountSetId: currentAccountSetId,
      workOrderId: values.workOrderId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      costInputIds: values.costInputIds,
      createdBy: currentUser,
    };
  };

  const dryRun = async () => {
    setAllocation(await api.post('/cost-allocations/dry-run', await requestPayload()));
  };

  const commit = async () => {
    setAllocation(await api.post('/cost-allocations', await requestPayload()));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Cost Allocations</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button icon={<CalculatorOutlined />} onClick={dryRun}>Dry run</Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={commit}>Commit</Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        description="PHASE4_SOURCE_MISSING: external payroll and depreciation sources are not formally connected yet."
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="workOrderId" rules={[{ required: true }]}>
          <Select style={{ width: 220 }} placeholder="Work order" options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} />
        </Form.Item>
        <Form.Item name="costInputIds" rules={[{ required: true }]}>
          <Select
            mode="multiple"
            style={{ width: 320 }}
            placeholder="Cost inputs"
            options={inputs.map((input) => ({ value: input.id, label: `${input.workOrderNo} ${input.costType} ${input.amount}` }))}
          />
        </Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="Year" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
      </Form>
      <Table
        rowKey="id"
        dataSource={allocation?.lines ?? []}
        title={() => `Allocated amount: ${allocation?.totalAllocatedAmount ?? 0}`}
        columns={[
          { title: 'Cost type', dataIndex: 'costType' },
          { title: 'Allocated', dataIndex: 'allocatedAmount' },
        ]}
      />
    </div>
  );
};
