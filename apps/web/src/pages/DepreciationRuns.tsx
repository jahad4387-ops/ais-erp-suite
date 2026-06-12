import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Space, Table, Tag } from 'antd';
import { CalculatorOutlined, CheckOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';
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

const statusLabel: Record<string, string> = {
  calculated: '已计算',
  approved: '已审核',
  locked: '已锁定',
};

const skipReasonLabel: Record<string, string> = {
  NEW_ASSET_NOT_STARTED: '新增资产未开始计提',
  FULLY_DEPRECIATED: '已提足折旧',
  DEPRECIATION_STOPPED: '已停止折旧',
};

const costTypeLabel: Record<string, string> = {
  depreciation: '折旧',
  manufacturing_overhead: '制造费用',
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
        <h2 style={{ margin: 0 }}>折旧计提</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="depreciation_run"
            sourceObjectType="depreciation_run_page"
            userInstruction={`Generate depreciation dry-run candidate for ${currentYear}-${String(currentPeriod).padStart(2, '0')}.`}
          >
            Agent
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        description="折旧试算不会写入正式成本池；正式计提审核并锁定后才生成折旧成本。"
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="runNo" rules={[{ required: true }]}><Input placeholder="计提单号" /></Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="年度" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="期间" /></Form.Item>
        <Space>
          <Button icon={<CalculatorOutlined />} onClick={createDryRun}>试算</Button>
          <Button type="primary" icon={<CalculatorOutlined />} onClick={createFormalRun}>正式计提</Button>
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
                { title: '资产', dataIndex: 'assetNo' },
                { title: '部门', dataIndex: 'departmentId' },
                { title: '折旧额', dataIndex: 'depreciationAmount' },
                { title: '折后净值', dataIndex: 'netValueAfter' },
                { title: '刹车规则', render: (_, line) => line.brakeApplied ? <Tag color="red">已触发</Tag> : <Tag>正常</Tag> },
                { title: '跳过原因', render: (_, line) => line.skippedReason ? (skipReasonLabel[line.skippedReason] ?? line.skippedReason) : '-' },
                { title: '部门规则', render: () => '按月末使用部门' },
              ]}
            />
          ),
        }}
        columns={[
          { title: '计提单号', dataIndex: 'runNo' },
          { title: '期间', render: (_, row) => `${row.fiscalYear}-${String(row.periodNo).padStart(2, '0')}` },
          { title: '模式', render: (_, row) => row.dryRun ? <Tag>试算</Tag> : <Tag color="blue">正式</Tag> },
          { title: '状态', render: (_, row) => statusLabel[row.status] ?? row.status },
          { title: '折旧合计', dataIndex: 'totalDepreciationAmount' },
          { title: '提示', render: (_, row) => (row.warningCodes ?? []).map((code) => <Tag key={code}>{skipReasonLabel[code] ?? code}</Tag>) },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<CheckOutlined />} disabled={row.dryRun || row.status !== 'calculated'} onClick={() => approveRun(row)}>审核</Button>
                <Button size="small" icon={<LockOutlined />} disabled={row.dryRun || row.status !== 'approved'} onClick={() => lockRun(row)}>锁定</Button>
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
          { title: '计提单', dataIndex: 'sourceRunId' },
          { title: '资产', dataIndex: 'assetNo' },
          { title: '部门', dataIndex: 'departmentId' },
          { title: '成本类型', render: (_, row) => costTypeLabel[row.costType] ?? row.costType },
          { title: '金额', dataIndex: 'amount' },
          { title: '锁定时间', dataIndex: 'lockedAt' },
        ]}
      />
    </div>
  );
};
