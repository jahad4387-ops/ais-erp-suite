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

const methodTypeLabel: Record<string, string> = {
  straight_line: '平均年限法',
  workload: '工作量法',
};

const statusLabel: Record<string, string> = {
  active: '启用',
  inactive: '停用',
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
        <h2 style={{ margin: 0 }}>固定资产基础设置</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </div>
      <Tabs
        items={[
          {
            key: 'methods',
            label: '折旧方法',
            children: (
              <>
                <Form form={methodForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="编码" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="名称" /></Form.Item>
                  <Form.Item name="methodType" rules={[{ required: true }]}>
                    <Select style={{ width: 180 }} options={[
                      { value: 'straight_line', label: '平均年限法' },
                      { value: 'workload', label: '工作量法' },
                    ]} />
                  </Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createMethod}>新增</Button>
                </Form>
                <Table rowKey="id" dataSource={methods} columns={[
                  { title: '编码', dataIndex: 'code' },
                  { title: '名称', dataIndex: 'name' },
                  { title: '类型', render: (_, row) => methodTypeLabel[row.methodType] ?? row.methodType },
                  { title: '状态', render: (_, row) => statusLabel[row.status] ?? row.status },
                ]} />
              </>
            ),
          },
          {
            key: 'categories',
            label: '资产类别',
            children: (
              <>
                <Form form={categoryForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="code" rules={[{ required: true }]}><Input placeholder="编码" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="名称" /></Form.Item>
                  <Form.Item name="depreciationMethodId">
                    <Select style={{ width: 200 }} placeholder="折旧方法" options={methods.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="defaultUsefulLifeMonths"><InputNumber min={1} placeholder="使用月限" /></Form.Item>
                  <Form.Item name="defaultSalvageRate"><InputNumber min={0} max={1} step={0.01} placeholder="残值率" /></Form.Item>
                  <Form.Item name="assetAccountCode"><Input placeholder="资产科目" /></Form.Item>
                  <Form.Item name="accumulatedDepreciationAccountCode"><Input placeholder="累计折旧科目" /></Form.Item>
                  <Form.Item name="depreciationExpenseAccountCode"><Input placeholder="折旧费用科目" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createCategory}>新增</Button>
                </Form>
                <Table rowKey="id" dataSource={categories} columns={[
                  { title: '编码', dataIndex: 'code' },
                  { title: '名称', dataIndex: 'name' },
                  { title: '使用月限', dataIndex: 'defaultUsefulLifeMonths' },
                  { title: '残值率', dataIndex: 'defaultSalvageRate' },
                  { title: '状态', render: (_, row) => statusLabel[row.status] ?? row.status },
                ]} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
