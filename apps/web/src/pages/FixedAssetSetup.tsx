import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Select, Table, Tabs } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type DepreciationMethod = { id: string; code: string; name: string; methodType: string; status: string };
type AssetCategory = {
  id: string;
  code: string;
  name: string;
  depreciationMethodId?: string | null;
  defaultUsefulLifeMonths: number;
  defaultSalvageRate: number;
  status: string;
};

export const FixedAssetSetup: React.FC = () => {
  const [methodForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [methods, setMethods] = useState<DepreciationMethod[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [methodRows, categoryRows] = await Promise.all([
      api.get(`/depreciation-methods?accountSetId=${currentAccountSetId}`),
      api.get(`/asset-categories?accountSetId=${currentAccountSetId}`),
    ]);
    setMethods(methodRows ?? []);
    setCategories(categoryRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    methodForm.setFieldsValue({ methodType: 'straight_line' });
    categoryForm.setFieldsValue({ defaultUsefulLifeMonths: 60, defaultSalvageRate: 0.05 });
    void fetchData();
  }, [categoryForm, fetchData, methodForm]);

  const createMethod = async () => {
    const values = await methodForm.validateFields();
    await api.post('/depreciation-methods', { accountSetId: currentAccountSetId, ...values, createdBy: currentUser });
    methodForm.resetFields();
    methodForm.setFieldsValue({ methodType: 'straight_line' });
    await fetchData();
  };

  const createCategory = async () => {
    const values = await categoryForm.validateFields();
    await api.post('/asset-categories', { accountSetId: currentAccountSetId, ...values, createdBy: currentUser });
    categoryForm.resetFields();
    categoryForm.setFieldsValue({ defaultUsefulLifeMonths: 60, defaultSalvageRate: 0.05 });
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Fixed Asset Setup</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Tabs
        items={[
          {
            key: 'methods',
            label: 'Depreciation methods',
            children: (
              <>
                <Form form={methodForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="Code" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Name" /></Form.Item>
                  <Form.Item name="methodType" rules={[{ required: true }]}>
                    <Select style={{ width: 180 }} options={[
                      { value: 'straight_line', label: 'Straight line' },
                      { value: 'workload', label: 'Workload' },
                    ]} />
                  </Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createMethod}>Add</Button>
                </Form>
                <Table rowKey="id" dataSource={methods} columns={[
                  { title: 'Code', dataIndex: 'code' },
                  { title: 'Name', dataIndex: 'name' },
                  { title: 'Type', dataIndex: 'methodType' },
                  { title: 'Status', dataIndex: 'status' },
                ]} />
              </>
            ),
          },
          {
            key: 'categories',
            label: 'Asset categories',
            children: (
              <>
                <Form form={categoryForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="Code" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Name" /></Form.Item>
                  <Form.Item name="depreciationMethodId">
                    <Select style={{ width: 200 }} placeholder="Method" options={methods.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="defaultUsefulLifeMonths"><InputNumber min={1} placeholder="Life months" /></Form.Item>
                  <Form.Item name="defaultSalvageRate"><InputNumber min={0} max={1} step={0.01} placeholder="Salvage rate" /></Form.Item>
                  <Form.Item name="assetAccountCode"><Input placeholder="Asset account" /></Form.Item>
                  <Form.Item name="accumulatedDepreciationAccountCode"><Input placeholder="Accum dep account" /></Form.Item>
                  <Form.Item name="depreciationExpenseAccountCode"><Input placeholder="Expense account" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createCategory}>Add</Button>
                </Form>
                <Table rowKey="id" dataSource={categories} columns={[
                  { title: 'Code', dataIndex: 'code' },
                  { title: 'Name', dataIndex: 'name' },
                  { title: 'Useful life', dataIndex: 'defaultUsefulLifeMonths' },
                  { title: 'Salvage rate', dataIndex: 'defaultSalvageRate' },
                  { title: 'Status', dataIndex: 'status' },
                ]} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
