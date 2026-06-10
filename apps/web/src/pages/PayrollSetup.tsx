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
        <h2 style={{ margin: 0 }}>Payroll Setup</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Tabs
        items={[
          {
            key: 'categories',
            label: 'Categories',
            children: (
              <>
                <Form form={categoryForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="Code" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Name" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createCategory}>Add</Button>
                </Form>
                <Table rowKey="id" dataSource={categories} columns={[{ title: 'Code', dataIndex: 'code' }, { title: 'Name', dataIndex: 'name' }, { title: 'Status', dataIndex: 'status' }]} />
              </>
            ),
          },
          {
            key: 'items',
            label: 'Items',
            children: (
              <>
                <Form form={itemForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="Code" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Name" /></Form.Item>
                  <Form.Item name="itemType" rules={[{ required: true }]}>
                    <Select style={{ width: 160 }} placeholder="Type" options={[
                      { value: 'earning', label: 'Earning' },
                      { value: 'deduction', label: 'Deduction' },
                      { value: 'tax', label: 'Tax' },
                      { value: 'company_cost', label: 'Company cost' },
                    ]} />
                  </Form.Item>
                  <Form.Item name="formula"><Input style={{ width: 220 }} placeholder="Formula" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createItem}>Add</Button>
                </Form>
                <Table rowKey="id" dataSource={items} columns={[
                  { title: 'Code', dataIndex: 'code' },
                  { title: 'Name', dataIndex: 'name' },
                  { title: 'Type', dataIndex: 'itemType' },
                  { title: 'Formula', dataIndex: 'formula' },
                ]} />
              </>
            ),
          },
          {
            key: 'profiles',
            label: 'Profiles',
            children: (
              <>
                <Form form={profileForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="employeeNo" rules={[{ required: true }]}><Input placeholder="Employee no" /></Form.Item>
                  <Form.Item name="employeeName" rules={[{ required: true }]}><Input placeholder="Name" /></Form.Item>
                  <Form.Item name="departmentId" rules={[{ required: true }]}><Input placeholder="Department id" /></Form.Item>
                  <Form.Item name="departmentName"><Input placeholder="Department" /></Form.Item>
                  <Form.Item name="payrollCategoryId" rules={[{ required: true }]}>
                    <Select style={{ width: 180 }} placeholder="Category" options={categories.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="baseSalary"><InputNumber placeholder="Base salary" /></Form.Item>
                  <Form.Item name="personalSocialSecurity"><InputNumber placeholder="Personal SS" /></Form.Item>
                  <Form.Item name="personalHousingFund"><InputNumber placeholder="Personal fund" /></Form.Item>
                  <Form.Item name="companySocialSecurity"><InputNumber placeholder="Company SS" /></Form.Item>
                  <Form.Item name="companyHousingFund"><InputNumber placeholder="Company fund" /></Form.Item>
                  <Form.Item name="monthlyTaxExemption"><InputNumber placeholder="Tax exemption" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createProfile}>Add</Button>
                </Form>
                <Table rowKey="id" dataSource={profiles} columns={[
                  { title: 'Employee no', dataIndex: 'employeeNo' },
                  { title: 'Name', dataIndex: 'employeeName' },
                  { title: 'Department', dataIndex: 'departmentName' },
                  { title: 'Base salary', dataIndex: 'baseSalary' },
                  { title: 'Tax exemption', dataIndex: 'monthlyTaxExemption' },
                ]} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
