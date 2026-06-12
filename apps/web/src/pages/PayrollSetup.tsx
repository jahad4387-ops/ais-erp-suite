import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Select, Table, Tabs } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type PayrollCategory = { id: string; code: string; name: string; status: string };
type PayrollItem = { id: string; code: string; name: string; itemType: string; formula?: string | null };
type EmployeePayrollProfile = {
  id: string;
  employeeNo: string;
  employeeName: string;
  departmentName?: string | null;
  baseSalary: number;
  monthlyTaxExemption: number;
};

const itemTypeLabel: Record<string, string> = {
  earning: '应发项',
  deduction: '扣款项',
  tax: '个税',
  company_cost: '公司成本',
};

const statusLabel: Record<string, string> = {
  active: '启用',
  inactive: '停用',
};

export const PayrollSetup: React.FC = () => {
  const [categoryForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [categories, setCategories] = useState<PayrollCategory[]>([]);
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [profiles, setProfiles] = useState<EmployeePayrollProfile[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [categoryRows, itemRows, profileRows] = await Promise.all([
      api.get(`/payroll-categories?accountSetId=${currentAccountSetId}`),
      api.get(`/payroll-items?accountSetId=${currentAccountSetId}`),
      api.get(`/employee-payroll-profiles?accountSetId=${currentAccountSetId}`),
    ]);
    setCategories(categoryRows ?? []);
    setItems(itemRows ?? []);
    setProfiles(profileRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const createCategory = async () => {
    const values = await categoryForm.validateFields();
    await api.post('/payroll-categories', { accountSetId: currentAccountSetId, ...values, createdBy: currentUser });
    categoryForm.resetFields();
    await fetchData();
  };

  const createItem = async () => {
    const values = await itemForm.validateFields();
    await api.post('/payroll-items', { accountSetId: currentAccountSetId, ...values, createdBy: currentUser });
    itemForm.resetFields();
    await fetchData();
  };

  const createProfile = async () => {
    const values = await profileForm.validateFields();
    await api.post('/employee-payroll-profiles', { accountSetId: currentAccountSetId, ...values, createdBy: currentUser });
    profileForm.resetFields();
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>薪资基础设置</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </div>
      <Tabs
        items={[
          {
            key: 'categories',
            label: '薪资类别',
            children: (
              <>
                <Form form={categoryForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="编码" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="名称" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createCategory}>新增</Button>
                </Form>
                <Table rowKey="id" dataSource={categories} columns={[
                  { title: '编码', dataIndex: 'code' },
                  { title: '名称', dataIndex: 'name' },
                  { title: '状态', render: (_, row) => statusLabel[row.status] ?? row.status },
                ]} />
              </>
            ),
          },
          {
            key: 'items',
            label: '薪资项目',
            children: (
              <>
                <Form form={itemForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="编码" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="名称" /></Form.Item>
                  <Form.Item name="itemType" rules={[{ required: true }]}>
                    <Select style={{ width: 160 }} placeholder="类型" options={[
                      { value: 'earning', label: '应发项' },
                      { value: 'deduction', label: '扣款项' },
                      { value: 'tax', label: '个税' },
                      { value: 'company_cost', label: '公司成本' },
                    ]} />
                  </Form.Item>
                  <Form.Item name="formula"><Input style={{ width: 220 }} placeholder="计算公式" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createItem}>新增</Button>
                </Form>
                <Table rowKey="id" dataSource={items} columns={[
                  { title: '编码', dataIndex: 'code' },
                  { title: '名称', dataIndex: 'name' },
                  { title: '类型', render: (_, row) => itemTypeLabel[row.itemType] ?? row.itemType },
                  { title: '公式', dataIndex: 'formula' },
                ]} />
              </>
            ),
          },
          {
            key: 'profiles',
            label: '人员薪资档案',
            children: (
              <>
                <Form form={profileForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="employeeNo" rules={[{ required: true }]}><Input placeholder="员工编号" /></Form.Item>
                  <Form.Item name="employeeName" rules={[{ required: true }]}><Input placeholder="姓名" /></Form.Item>
                  <Form.Item name="departmentId" rules={[{ required: true }]}><Input placeholder="部门编码" /></Form.Item>
                  <Form.Item name="departmentName"><Input placeholder="部门名称" /></Form.Item>
                  <Form.Item name="payrollCategoryId" rules={[{ required: true }]}>
                    <Select style={{ width: 180 }} placeholder="薪资类别" options={categories.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="baseSalary"><InputNumber placeholder="基本工资" /></Form.Item>
                  <Form.Item name="personalSocialSecurity"><InputNumber placeholder="个人社保" /></Form.Item>
                  <Form.Item name="personalHousingFund"><InputNumber placeholder="个人公积金" /></Form.Item>
                  <Form.Item name="companySocialSecurity"><InputNumber placeholder="公司社保" /></Form.Item>
                  <Form.Item name="companyHousingFund"><InputNumber placeholder="公司公积金" /></Form.Item>
                  <Form.Item name="monthlyTaxExemption"><InputNumber placeholder="月免税额" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createProfile}>新增</Button>
                </Form>
                <Table rowKey="id" dataSource={profiles} columns={[
                  { title: '员工编号', dataIndex: 'employeeNo' },
                  { title: '姓名', dataIndex: 'employeeName' },
                  { title: '部门', dataIndex: 'departmentName' },
                  { title: '基本工资', dataIndex: 'baseSalary' },
                  { title: '月免税额', dataIndex: 'monthlyTaxExemption' },
                ]} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
