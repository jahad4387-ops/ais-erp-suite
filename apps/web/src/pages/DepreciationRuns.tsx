import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Space, Table, Tag } from 'antd';
import { CalculatorOutlined, CheckOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type DepreciationRunLine = {
  id: string;
  assetNo: string;
  assetName: string;
  departmentId: string;
  depreciationAmount: number;
  netValueAfter: number;
  brakeApplied: boolean;
  skippedReason?: 'NEW_ASSET_NOT_STARTED' | 'FULLY_DEPRECIATED' | 'DEPRECIATION_STOPPED' | null;
  depreciationDepartmentRule: 'month_end_department';
};
type DepreciationRun = {
  id: string;
  runNo: string;
  fiscalYear: number;
  periodNo: number;
  dryRun: boolean;
  status: string;
  totalDepreciationAmount: number;
  warningCodes?: string[];
  lines: DepreciationRunLine[];
};
type DepreciationCostPool = {
  id: string;
  sourceRunId: string;
  assetNo: string;
  departmentId: string;
  costType: string;
  amount: number;
  lockedAt: string;
};

export const DepreciationRuns: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [costPools, setCostPools] = useState<DepreciationCostPool[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [runRows, poolRows] = await Promise.all([
      api.get(`/depreciation-runs?accountSetId=${currentAccountSetId}`),
      api.get(`/asset-depreciation-cost-pools?accountSetId=${currentAccountSetId}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`),
    ]);
    setRuns(runRows ?? []);
    setCostPools(poolRows ?? []);
  }, [currentAccountSetId, currentPeriod, currentYear]);

  useEffect(() => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod });
    void fetchData();
  }, [currentPeriod, currentYear, fetchData, form]);

  const createDryRun = async () => {
    const values = await form.validateFields();
    await api.post('/depreciation-runs/dry-run', {
      accountSetId: currentAccountSetId,
      ...values,
      createdBy: currentUser,
    });
    await fetchData();
  };

  const createFormalRun = async () => {
    const values = await form.validateFields();
    await api.post('/depreciation-runs', {
      accountSetId: currentAccountSetId,
      ...values,
      createdBy: currentUser,
    });
    await fetchData();
  };

  const approveRun = async (run: DepreciationRun) => {
    await api.post(`/depreciation-runs/${run.id}/approve`, { approvedBy: currentUser });
    await fetchData();
  };

  const lockRun = async (run: DepreciationRun) => {
    await api.post(`/depreciation-runs/${run.id}/lock`, { lockedBy: currentUser });
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Depreciation Runs</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        description="NEW_ASSET_NOT_STARTED / brakeApplied / month_end_department"
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="runNo" rules={[{ required: true }]}><Input placeholder="Run no" /></Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="Year" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
        <Space>
          <Button icon={<CalculatorOutlined />} onClick={createDryRun}>Dry-run</Button>
          <Button type="primary" icon={<CalculatorOutlined />} onClick={createFormalRun}>Create run</Button>
        </Space>
      </Form>
      <Table
        rowKey="id"
        dataSource={runs}
        expandable={{
          expandedRowRender: (run) => (
            <Table
              rowKey="id"
              pagination={false}
              dataSource={run.lines}
              columns={[
                { title: 'Asset', dataIndex: 'assetNo' },
                { title: 'Department', dataIndex: 'departmentId' },
                { title: 'Amount', dataIndex: 'depreciationAmount' },
                { title: 'Net after', dataIndex: 'netValueAfter' },
                { title: 'Brake', render: (_, line) => line.brakeApplied ? <Tag color="red">brakeApplied</Tag> : <Tag>normal</Tag> },
                { title: 'Skip', dataIndex: 'skippedReason' },
                { title: 'Rule', dataIndex: 'depreciationDepartmentRule' },
              ]}
            />
          ),
        }}
        columns={[
          { title: 'Run no', dataIndex: 'runNo' },
          { title: 'Period', render: (_, row) => `${row.fiscalYear}-${String(row.periodNo).padStart(2, '0')}` },
          { title: 'Mode', render: (_, row) => row.dryRun ? <Tag>dry-run</Tag> : <Tag color="blue">formal</Tag> },
          { title: 'Status', dataIndex: 'status' },
          { title: 'Total', dataIndex: 'totalDepreciationAmount' },
          { title: 'Warnings', render: (_, row) => (row.warningCodes ?? []).map((code) => <Tag key={code}>{code}</Tag>) },
          {
            title: 'Actions',
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<CheckOutlined />} disabled={row.dryRun || row.status !== 'calculated'} onClick={() => approveRun(row)}>Approve</Button>
                <Button size="small" icon={<LockOutlined />} disabled={row.dryRun || row.status !== 'approved'} onClick={() => lockRun(row)}>Lock</Button>
              </Space>
            ),
          },
        ]}
      />
      <Table
        style={{ marginTop: 16 }}
        rowKey="id"
        dataSource={costPools}
        columns={[
          { title: 'Run', dataIndex: 'sourceRunId' },
          { title: 'Asset', dataIndex: 'assetNo' },
          { title: 'Department', dataIndex: 'departmentId' },
          { title: 'Cost type', dataIndex: 'costType' },
          { title: 'Amount', dataIndex: 'amount' },
          { title: 'Locked at', dataIndex: 'lockedAt' },
        ]}
      />
    </div>
  );
};
