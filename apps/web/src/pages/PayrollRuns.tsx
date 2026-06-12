import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Table, Tabs, Tag } from 'antd';
import { BankOutlined, CalculatorOutlined, CheckOutlined, ImportOutlined, LockOutlined, PartitionOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

type PayrollCategory = { id: string; name: string };
type EmployeePayrollProfile = { id: string; employeeNo: string; employeeName: string };
type PayrollVariableImport = { id: string; importType: string; fiscalYear: number; periodNo: number };
type PayrollRunLine = {
  id: string;
  employeeName: string;
  grossAmount: number;
  deductionAmount: number;
  cumulativeTaxableIncome: number;
  individualIncomeTax: number;
  manualAdjustmentAmount: number;
  netPay: number;
};
type PayrollRun = {
  id: string;
  runNo: string;
  status: string;
  fiscalYear: number;
  periodNo: number;
  totalGrossAmount: number;
  totalCompanyCost: number;
  totalNetPay: number;
  lines: PayrollRunLine[];
};
type PayrollPaymentFile = { id: string; payrollRunId: string; bankAccountCode: string; totalAmount: number; lineCount: number };
type PayrollAllocation = { id: string; payrollRunId: string; totalAllocatedAmount: number; voucherDraft: { lines: Array<{ lineNo: number; accountCode: string; amount: number }> } };
type PayrollCostPool = { id: string; sourceRunId: string; workOrderId?: string | null; costType: string; amount: number; lockedAt: string };

const importTypeLabel: Record<string, string> = {
  attendance_performance: '考勤绩效',
  bonus: '奖金',
  allowance_deduction: '津贴扣款',
};

const costTypeLabel: Record<string, string> = {
  direct_labor: '直接人工',
  payroll_overhead: '薪资制造费用',
};

const statusLabel: Record<string, string> = {
  draft: '草稿',
  calculated: '已计算',
  approved: '已审核',
  locked: '已锁定',
};

export const PayrollRuns: React.FC = () => {
  const [importForm] = Form.useForm();
  const [runForm] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [categories, setCategories] = useState<PayrollCategory[]>([]);
  const [profiles, setProfiles] = useState<EmployeePayrollProfile[]>([]);
  const [imports, setImports] = useState<PayrollVariableImport[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [paymentFiles, setPaymentFiles] = useState<PayrollPaymentFile[]>([]);
  const [allocations, setAllocations] = useState<PayrollAllocation[]>([]);
  const [costPools, setCostPools] = useState<PayrollCostPool[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [categoryRows, profileRows, importRows, runRows, paymentRows, allocationRows, costPoolRows] = await Promise.all([
      api.get(`/payroll-categories?accountSetId=${currentAccountSetId}`),
      api.get(`/employee-payroll-profiles?accountSetId=${currentAccountSetId}`),
      api.get(`/payroll-variable-imports?accountSetId=${currentAccountSetId}`),
      api.get(`/payroll-runs?accountSetId=${currentAccountSetId}`),
      api.get(`/payroll-payment-files?accountSetId=${currentAccountSetId}`),
      api.get(`/payroll-allocations?accountSetId=${currentAccountSetId}`),
      api.get(`/payroll-cost-pools?accountSetId=${currentAccountSetId}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`),
    ]);
    setCategories(categoryRows ?? []);
    setProfiles(profileRows ?? []);
    setImports(importRows ?? []);
    setRuns(runRows ?? []);
    setPaymentFiles(paymentRows ?? []);
    setAllocations(allocationRows ?? []);
    setCostPools(costPoolRows ?? []);
  }, [currentAccountSetId, currentPeriod, currentYear]);

  useEffect(() => {
    importForm.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod, importType: 'attendance_performance' });
    runForm.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod, bankAccountCode: '1002', allocationRate: 1, costType: 'direct_labor', targetType: 'work_order' });
    void fetchData();
  }, [currentPeriod, currentYear, fetchData, importForm, runForm]);

  const createImport = async () => {
    const values = await importForm.validateFields();
    await api.post('/payroll-variable-imports', {
      accountSetId: currentAccountSetId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      importType: values.importType,
      createdBy: currentUser,
      lines: [{
        employeeProfileId: values.employeeProfileId,
        workDays: values.workDays ?? 0,
        performancePay: values.performancePay ?? 0,
        piecePay: values.piecePay ?? 0,
        allowance: values.allowance ?? 0,
        deduction: values.deduction ?? 0,
      }],
    });
    await fetchData();
  };

  const approveRun = async (run: PayrollRun) => {
    await api.post(`/payroll-runs/${run.id}/approve`, { approvedBy: currentUser });
    await fetchData();
  };

  const lockRun = async (run: PayrollRun) => {
    await api.post(`/payroll-runs/${run.id}/lock`, { lockedBy: currentUser });
    await fetchData();
  };

  const createPaymentFile = async (run: PayrollRun) => {
    const values = await runForm.validateFields(['bankAccountCode']);
    await api.post('/payroll-payment-files', {
      accountSetId: currentAccountSetId,
      payrollRunId: run.id,
      bankAccountCode: values.bankAccountCode,
      createdBy: currentUser,
    });
    await fetchData();
  };

  const createAllocation = async (run: PayrollRun) => {
    const values = await runForm.validateFields(['allocationDepartmentId', 'allocationWorkOrderId', 'allocationRate', 'targetType', 'costType']);
    await api.post('/payroll-allocations', {
      accountSetId: currentAccountSetId,
      payrollRunId: run.id,
      fiscalYear: run.fiscalYear,
      periodNo: run.periodNo,
      createdBy: currentUser,
      rules: [{
        departmentId: values.allocationDepartmentId,
        targetType: values.targetType,
        workOrderId: values.allocationWorkOrderId,
        costType: values.costType,
        allocationRate: values.allocationRate,
      }],
    });
    await fetchData();
  };

  const calculateRun = async () => {
    const values = await runForm.validateFields([
      'runNo',
      'payrollCategoryId',
      'variableImportId',
      'adjustmentEmployeeProfileId',
      'taxOverride',
      'adjustmentReason',
      'fiscalYear',
      'periodNo',
    ]);
    const manualAdjustments = values.taxOverride === undefined || values.taxOverride === null
      ? []
      : [{ employeeProfileId: values.adjustmentEmployeeProfileId, field: 'individualIncomeTax', amount: values.taxOverride, reason: values.adjustmentReason ?? '手工调整' }];
    await api.post('/payroll-runs/calculate', {
      accountSetId: currentAccountSetId,
      runNo: values.runNo,
      payrollCategoryId: values.payrollCategoryId,
      variableImportId: values.variableImportId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      manualAdjustments,
      createdBy: currentUser,
    });
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>薪资计算</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        description="个税按同期间薪资计算单累计计算，手工调整会保留在计算明细中。"
      />
      <Tabs
        items={[
          {
            key: 'imports',
            label: '变量导入',
            children: (
              <>
                <Form form={importForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="importType" rules={[{ required: true }]}>
                    <Select style={{ width: 190 }} options={[
                      { value: 'attendance_performance', label: '考勤绩效' },
                      { value: 'bonus', label: '奖金' },
                      { value: 'allowance_deduction', label: '津贴扣款' },
                    ]} />
                  </Form.Item>
                  <Form.Item name="employeeProfileId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="员工" options={profiles.map((row) => ({ value: row.id, label: `${row.employeeNo} ${row.employeeName}` }))} />
                  </Form.Item>
                  <Form.Item name="workDays"><InputNumber placeholder="出勤天数" /></Form.Item>
                  <Form.Item name="performancePay"><InputNumber placeholder="绩效工资" /></Form.Item>
                  <Form.Item name="piecePay"><InputNumber placeholder="计件工资" /></Form.Item>
                  <Form.Item name="allowance"><InputNumber placeholder="津贴" /></Form.Item>
                  <Form.Item name="deduction"><InputNumber placeholder="扣款" /></Form.Item>
                  <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="年度" /></Form.Item>
                  <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="期间" /></Form.Item>
                  <Button type="primary" icon={<ImportOutlined />} onClick={createImport}>导入</Button>
                </Form>
                <Table rowKey="id" dataSource={imports} columns={[
                  { title: '类型', render: (_, row) => importTypeLabel[row.importType] ?? row.importType },
                  { title: '年度', dataIndex: 'fiscalYear' },
                  { title: '期间', dataIndex: 'periodNo' },
                ]} />
              </>
            ),
          },
          {
            key: 'runs',
            label: '薪资计算',
            children: (
              <>
                <Form form={runForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="runNo" rules={[{ required: true }]}><Input placeholder="计算单号" /></Form.Item>
                  <Form.Item name="payrollCategoryId" rules={[{ required: true }]}>
                    <Select style={{ width: 180 }} placeholder="薪资类别" options={categories.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="variableImportId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="变量导入" options={imports.map((row) => ({ value: row.id, label: `${importTypeLabel[row.importType] ?? row.importType} ${row.fiscalYear}-${row.periodNo}` }))} />
                  </Form.Item>
                  <Form.Item name="adjustmentEmployeeProfileId">
                    <Select style={{ width: 220 }} placeholder="调整员工" options={profiles.map((row) => ({ value: row.id, label: `${row.employeeNo} ${row.employeeName}` }))} />
                  </Form.Item>
                  <Form.Item name="taxOverride"><InputNumber placeholder="个税调整" /></Form.Item>
                  <Form.Item name="adjustmentReason"><Input placeholder="调整原因" /></Form.Item>
                  <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="年度" /></Form.Item>
                  <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="期间" /></Form.Item>
                  <Button type="primary" icon={<CalculatorOutlined />} onClick={calculateRun}>计算</Button>
                </Form>
                <Form form={runForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="bankAccountCode" rules={[{ required: true }]}><Input placeholder="银行科目" /></Form.Item>
                  <Form.Item name="allocationDepartmentId" rules={[{ required: true }]}><Input placeholder="分摊部门" /></Form.Item>
                  <Form.Item name="targetType" rules={[{ required: true }]}>
                    <Select style={{ width: 150 }} options={[{ value: 'work_order', label: '工单' }, { value: 'department', label: '部门' }, { value: 'cost_center', label: '成本中心' }]} />
                  </Form.Item>
                  <Form.Item name="allocationWorkOrderId"><Input placeholder="工单编号" /></Form.Item>
                  <Form.Item name="costType" rules={[{ required: true }]}>
                    <Select style={{ width: 150 }} options={[{ value: 'direct_labor', label: '直接人工' }, { value: 'payroll_overhead', label: '制造费用' }]} />
                  </Form.Item>
                  <Form.Item name="allocationRate" rules={[{ required: true }]}><InputNumber min={0} max={1} step={0.01} placeholder="比例" /></Form.Item>
                </Form>
                <Table
                  rowKey="id"
                  dataSource={runs}
                  expandable={{
                    expandedRowRender: (run) => (
                      <Table
                        rowKey="id"
                        pagination={false}
                        dataSource={run.lines ?? []}
                        columns={[
                          { title: '员工', dataIndex: 'employeeName' },
                          { title: '应发合计', dataIndex: 'grossAmount' },
                          { title: '扣款合计', dataIndex: 'deductionAmount' },
                          { title: '累计应税收入', dataIndex: 'cumulativeTaxableIncome' },
                          { title: '个税', dataIndex: 'individualIncomeTax' },
                          { title: '手工调整', dataIndex: 'manualAdjustmentAmount' },
                          { title: '实发工资', dataIndex: 'netPay' },
                        ]}
                      />
                    ),
                  }}
                  columns={[
                    { title: '计算单号', dataIndex: 'runNo' },
                    { title: '状态', render: (_, row) => <Tag color="blue">{statusLabel[row.status] ?? row.status}</Tag> },
                    { title: '应发合计', dataIndex: 'totalGrossAmount' },
                    { title: '公司成本', dataIndex: 'totalCompanyCost' },
                    { title: '实发工资', dataIndex: 'totalNetPay' },
                    {
                      title: '操作',
                      render: (_, row) => (
                        <>
                          <AgentDraftEntryButton
                            size="small"
                            draftType="payroll_allocation"
                            sourceObjectType="payroll_run"
                            sourceObjectId={row.id}
                            userInstruction={`Generate payroll allocation draft from ${row.runNo}.`}
                          >
                            Agent
                          </AgentDraftEntryButton>{' '}
                          <Button size="small" icon={<CheckOutlined />} onClick={() => approveRun(row)}>审核</Button>{' '}
                          <Button size="small" icon={<LockOutlined />} onClick={() => lockRun(row)}>锁定</Button>{' '}
                          <Button size="small" icon={<BankOutlined />} onClick={() => createPaymentFile(row)}>付款文件</Button>{' '}
                          <Button size="small" icon={<PartitionOutlined />} onClick={() => createAllocation(row)}>分摊</Button>
                        </>
                      ),
                    },
                  ]}
                />
                <Table
                  rowKey="id"
                  dataSource={paymentFiles}
                  title={() => '付款文件'}
                  columns={[
                    { title: '计算单', dataIndex: 'payrollRunId' },
                    { title: '银行科目', dataIndex: 'bankAccountCode' },
                    { title: '行数', dataIndex: 'lineCount' },
                    { title: '金额', dataIndex: 'totalAmount' },
                  ]}
                />
                <Table
                  rowKey="id"
                  dataSource={allocations}
                  title={() => '分摊与凭证草稿'}
                  columns={[
                    { title: '计算单', dataIndex: 'payrollRunId' },
                    { title: '已分摊金额', dataIndex: 'totalAllocatedAmount' },
                    {
                      title: '凭证草稿',
                      render: (_, row) => row.voucherDraft?.lines?.map((line) => `${line.accountCode} ${line.amount}`).join(' / ') ?? '-',
                    },
                  ]}
                />
                <Table
                  rowKey="id"
                  dataSource={costPools}
                  title={() => '已锁定成本池'}
                  columns={[
                    { title: '来源计算单', dataIndex: 'sourceRunId' },
                    { title: '工单', dataIndex: 'workOrderId' },
                    { title: '成本类型', render: (_, row) => costTypeLabel[row.costType] ?? row.costType },
                    { title: '金额', dataIndex: 'amount' },
                    { title: '锁定时间', dataIndex: 'lockedAt' },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
