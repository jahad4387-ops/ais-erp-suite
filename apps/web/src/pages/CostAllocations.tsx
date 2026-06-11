import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, InputNumber, Select, Space, Table, Tag } from 'antd';
import { CalculatorOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type WorkOrder = { id: string; workOrderNo: string };
type CostInput = { id: string; workOrderNo: string; costType: string; amount: number; lockedAt?: string | null };
type Phase4CostPool = { id: string; sourceRunId: string; workOrderId?: string | null; costType: string; amount: number; lockedAt?: string | null };
type Phase4CostPoolOption = Phase4CostPool & { sourceType: 'phase4_payroll_cost_pool' | 'phase4_depreciation_cost_pool' };
type AllocationLine = { id: string; sourceType: string; costType: string; allocatedAmount: number };
type Allocation = { id: string; dryRun: boolean; totalAllocatedAmount: number; warningCodes: string[]; lines: AllocationLine[] };

export const CostAllocations: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [inputs, setInputs] = useState<CostInput[]>([]);
  const [phase4CostPools, setPhase4CostPools] = useState<Phase4CostPoolOption[]>([]);
  const [allocation, setAllocation] = useState<Allocation | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [orders, costInputs, payrollPools, depreciationPools] = await Promise.all([
      api.get(`/work-orders?accountSetId=${currentAccountSetId}`),
      api.get(`/mock-cost-inputs?accountSetId=${currentAccountSetId}`),
      api.get(`/payroll-cost-pools?accountSetId=${currentAccountSetId}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`),
      api.get(`/asset-depreciation-cost-pools?accountSetId=${currentAccountSetId}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`),
    ]);
    setWorkOrders(orders ?? []);
    setInputs(costInputs ?? []);
    setPhase4CostPools([
      ...(payrollPools ?? []).map((pool: Phase4CostPool) => ({ ...pool, sourceType: 'phase4_payroll_cost_pool' as const })),
      ...(depreciationPools ?? []).map((pool: Phase4CostPool) => ({ ...pool, sourceType: 'phase4_depreciation_cost_pool' as const })),
    ]);
  }, [currentAccountSetId, currentPeriod, currentYear]);

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
      phase4CostPoolIds: values.phase4CostPoolIds,
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
        type="info"
        showIcon
        description="Formal Phase 4 payroll and fixed asset depreciation cost pools can now be selected for month-end production costing."
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="workOrderId" rules={[{ required: true }]}>
          <Select style={{ width: 220 }} placeholder="Work order" options={workOrders.map((row) => ({ value: row.id, label: row.workOrderNo }))} />
        </Form.Item>
        <Form.Item name="costInputIds">
          <Select
            mode="multiple"
            style={{ width: 320 }}
            placeholder="Phase 3 self-test inputs"
            options={inputs.map((input) => ({ value: input.id, label: `${input.workOrderNo} ${input.costType} ${input.amount}` }))}
          />
        </Form.Item>
        <Form.Item name="phase4CostPoolIds">
          <Select
            mode="multiple"
            style={{ width: 420 }}
            placeholder="Phase 4 cost pools"
            options={phase4CostPools.map((pool) => ({
              value: pool.id,
              label: `${pool.sourceType} ${pool.costType} ${pool.amount}`,
            }))}
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
          { title: 'Source', dataIndex: 'sourceType', render: (sourceType) => <Tag>{sourceType}</Tag> },
          { title: 'Cost type', dataIndex: 'costType' },
          { title: 'Allocated', dataIndex: 'allocatedAmount' },
        ]}
      />
    </div>
  );
};
