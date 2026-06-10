import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Table, Tabs, Tag } from 'antd';
import { BankOutlined, CalculatorOutlined, CheckOutlined, ImportOutlined, LockOutlined, PartitionOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

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
      : [{ employeeProfileId: values.adjustmentEmployeeProfileId, field: 'individualIncomeTax', amount: values.taxOverride, reason: values.adjustmentReason ?? 'manual adjustment' }];
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
        <h2 style={{ margin: 0 }}>Payroll Runs</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        description="Monthly tax is calculated cumulatively across payroll runs in the same period; manual adjustments remain visible on run lines."
      />
      <Tabs
        items={[
          {
            key: 'imports',
            label: 'Variable import',
            children: (
              <>
                <Form form={importForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="importType" rules={[{ required: true }]}>
                    <Select style={{ width: 190 }} options={[
                      { value: 'attendance_performance', label: 'Attendance/performance' },
                      { value: 'bonus', label: 'Bonus' },
                      { value: 'allowance_deduction', label: 'Allowance/deduction' },
                    ]} />
                  </Form.Item>
                  <Form.Item name="employeeProfileId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="Employee" options={profiles.map((row) => ({ value: row.id, label: `${row.employeeNo} ${row.employeeName}` }))} />
                  </Form.Item>
                  <Form.Item name="workDays"><InputNumber placeholder="Work days" /></Form.Item>
                  <Form.Item name="performancePay"><InputNumber placeholder="Performance" /></Form.Item>
                  <Form.Item name="piecePay"><InputNumber placeholder="Piece pay" /></Form.Item>
                  <Form.Item name="allowance"><InputNumber placeholder="Allowance" /></Form.Item>
                  <Form.Item name="deduction"><InputNumber placeholder="Deduction" /></Form.Item>
                  <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="Year" /></Form.Item>
                  <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
                  <Button type="primary" icon={<ImportOutlined />} onClick={createImport}>Import</Button>
                </Form>
                <Table rowKey="id" dataSource={imports} columns={[
                  { title: 'Type', dataIndex: 'importType' },
                  { title: 'Year', dataIndex: 'fiscalYear' },
                  { title: 'Period', dataIndex: 'periodNo' },
                ]} />
              </>
            ),
          },
          {
            key: 'runs',
            label: 'Calculation',
            children: (
              <>
                <Form form={runForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="runNo" rules={[{ required: true }]}><Input placeholder="Run no" /></Form.Item>
                  <Form.Item name="payrollCategoryId" rules={[{ required: true }]}>
                    <Select style={{ width: 180 }} placeholder="Category" options={categories.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="variableImportId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="Import" options={imports.map((row) => ({ value: row.id, label: `${row.importType} ${row.fiscalYear}-${row.periodNo}` }))} />
                  </Form.Item>
                  <Form.Item name="adjustmentEmployeeProfileId">
                    <Select style={{ width: 220 }} placeholder="Adjustment employee" options={profiles.map((row) => ({ value: row.id, label: `${row.employeeNo} ${row.employeeName}` }))} />
                  </Form.Item>
                  <Form.Item name="taxOverride"><InputNumber placeholder="Tax override" /></Form.Item>
                  <Form.Item name="adjustmentReason"><Input placeholder="Reason" /></Form.Item>
                  <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="Year" /></Form.Item>
                  <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
                  <Button type="primary" icon={<CalculatorOutlined />} onClick={calculateRun}>Calculate</Button>
                </Form>
                <Form form={runForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="bankAccountCode" rules={[{ required: true }]}><Input placeholder="Bank account" /></Form.Item>
                  <Form.Item name="allocationDepartmentId" rules={[{ required: true }]}><Input placeholder="Allocation department" /></Form.Item>
                  <Form.Item name="targetType" rules={[{ required: true }]}>
                    <Select style={{ width: 150 }} options={[{ value: 'work_order', label: 'Work order' }, { value: 'department', label: 'Department' }, { value: 'cost_center', label: 'Cost center' }]} />
                  </Form.Item>
                  <Form.Item name="allocationWorkOrderId"><Input placeholder="Work order id" /></Form.Item>
                  <Form.Item name="costType" rules={[{ required: true }]}>
                    <Select style={{ width: 150 }} options={[{ value: 'direct_labor', label: 'Direct labor' }, { value: 'payroll_overhead', label: 'Overhead' }]} />
                  </Form.Item>
                  <Form.Item name="allocationRate" rules={[{ required: true }]}><InputNumber min={0} max={1} step={0.01} placeholder="Rate" /></Form.Item>
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
                          { title: 'Employee', dataIndex: 'employeeName' },
                          { title: 'Gross', dataIndex: 'grossAmount' },
                          { title: 'Deduction', dataIndex: 'deductionAmount' },
                          { title: 'Cumulative taxable', dataIndex: 'cumulativeTaxableIncome' },
                          { title: 'Tax', dataIndex: 'individualIncomeTax' },
                          { title: 'Manual adjustment', dataIndex: 'manualAdjustmentAmount' },
                          { title: 'Net pay', dataIndex: 'netPay' },
                        ]}
                      />
                    ),
                  }}
                  columns={[
                    { title: 'Run no', dataIndex: 'runNo' },
                    { title: 'Status', render: (_, row) => <Tag color="blue">{row.status}</Tag> },
                    { title: 'Gross', dataIndex: 'totalGrossAmount' },
                    { title: 'Company cost', dataIndex: 'totalCompanyCost' },
                    { title: 'Net pay', dataIndex: 'totalNetPay' },
                    {
                      title: 'Actions',
                      render: (_, row) => (
                        <>
                          <Button size="small" icon={<CheckOutlined />} onClick={() => approveRun(row)}>Approve</Button>{' '}
                          <Button size="small" icon={<LockOutlined />} onClick={() => lockRun(row)}>Lock</Button>{' '}
                          <Button size="small" icon={<BankOutlined />} onClick={() => createPaymentFile(row)}>Pay file</Button>{' '}
                          <Button size="small" icon={<PartitionOutlined />} onClick={() => createAllocation(row)}>Allocate</Button>
                        </>
                      ),
                    },
                  ]}
                />
                <Table
                  rowKey="id"
                  dataSource={paymentFiles}
                  title={() => 'Payment files'}
                  columns={[
                    { title: 'Run', dataIndex: 'payrollRunId' },
                    { title: 'Bank account', dataIndex: 'bankAccountCode' },
                    { title: 'Lines', dataIndex: 'lineCount' },
                    { title: 'Amount', dataIndex: 'totalAmount' },
                  ]}
                />
                <Table
                  rowKey="id"
                  dataSource={allocations}
                  title={() => 'Allocations and voucherDraft'}
                  columns={[
                    { title: 'Run', dataIndex: 'payrollRunId' },
                    { title: 'Allocated', dataIndex: 'totalAllocatedAmount' },
                    {
                      title: 'Voucher draft',
                      render: (_, row) => row.voucherDraft?.lines?.map((line) => `${line.accountCode} ${line.amount}`).join(' / ') ?? '-',
                    },
                  ]}
                />
                <Table
                  rowKey="id"
                  dataSource={costPools}
                  title={() => 'Locked cost pools'}
                  columns={[
                    { title: 'Source run', dataIndex: 'sourceRunId' },
                    { title: 'Work order', dataIndex: 'workOrderId' },
                    { title: 'Cost type', dataIndex: 'costType' },
                    { title: 'Amount', dataIndex: 'amount' },
                    { title: 'Locked at', dataIndex: 'lockedAt' },
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
