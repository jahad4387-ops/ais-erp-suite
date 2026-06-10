import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Table, Tabs, Tag } from 'antd';
import { SwapOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type AssetCategory = { id: string; code: string; name: string; depreciationMethodId?: string | null; defaultUsefulLifeMonths: number; defaultSalvageRate: number };
type DepreciationMethod = { id: string; code: string; name: string };
type FixedAsset = {
  id: string;
  assetNo: string;
  name: string;
  originalValue: number;
  accumulatedDepreciation: number;
  netValue: number;
  salvageValue: number;
  serviceStartYear: number;
  serviceStartPeriod: number;
  currentDepartmentId: string;
  currentDepartmentName?: string | null;
  responsiblePerson?: string | null;
  depreciationTimelineRule: 'new_asset_next_month';
  depreciationDepartmentRule: 'month_end_department';
  lastTransferAt?: string | null;
};

export const FixedAssets: React.FC = () => {
  const [assetForm] = Form.useForm();
  const [transferForm] = Form.useForm();
  const [changeForm] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [methods, setMethods] = useState<DepreciationMethod[]>([]);
  const [assets, setAssets] = useState<FixedAsset[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [categoryRows, methodRows, assetRows] = await Promise.all([
      api.get(`/asset-categories?accountSetId=${currentAccountSetId}`),
      api.get(`/depreciation-methods?accountSetId=${currentAccountSetId}`),
      api.get(`/fixed-assets?accountSetId=${currentAccountSetId}`),
    ]);
    setCategories(categoryRows ?? []);
    setMethods(methodRows ?? []);
    setAssets(assetRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    assetForm.setFieldsValue({ acquisitionType: 'purchase', accumulatedDepreciation: 0 });
    changeForm.setFieldsValue({ changeType: 'improvement' });
    void fetchData();
  }, [assetForm, changeForm, fetchData]);

  const createAsset = async () => {
    const values = await assetForm.validateFields();
    const category = categories.find((row) => row.id === values.categoryId);
    await api.post('/fixed-assets', {
      accountSetId: currentAccountSetId,
      ...values,
      depreciationMethodId: values.depreciationMethodId ?? category?.depreciationMethodId,
      createdBy: currentUser,
    });
    assetForm.resetFields();
    assetForm.setFieldsValue({ acquisitionType: 'purchase', accumulatedDepreciation: 0 });
    await fetchData();
  };

  const transferAsset = async () => {
    const values = await transferForm.validateFields();
    const asset = assets.find((row) => row.id === values.fixedAssetId);
    await api.post('/asset-transfers', {
      accountSetId: currentAccountSetId,
      fixedAssetId: values.fixedAssetId,
      transferDate: values.transferDate,
      fromDepartmentId: values.fromDepartmentId ?? asset?.currentDepartmentId,
      fromDepartmentName: values.fromDepartmentName ?? asset?.currentDepartmentName,
      toDepartmentId: values.toDepartmentId,
      toDepartmentName: values.toDepartmentName,
      responsiblePerson: values.responsiblePerson,
      createdBy: currentUser,
    });
    transferForm.resetFields();
    await fetchData();
  };

  const changeAssetValue = async () => {
    const values = await changeForm.validateFields();
    await api.post('/asset-value-changes', { accountSetId: currentAccountSetId, ...values, createdBy: currentUser });
    changeForm.resetFields();
    changeForm.setFieldsValue({ changeType: 'improvement' });
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Fixed Assets</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        description="new_asset_next_month / month_end_department"
      />
      <Tabs
        items={[
          {
            key: 'cards',
            label: 'Cards',
            children: (
              <>
                <Form form={assetForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="assetNo" rules={[{ required: true }]}><Input placeholder="Asset no" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Name" /></Form.Item>
                  <Form.Item name="categoryId" rules={[{ required: true }]}>
                    <Select style={{ width: 200 }} placeholder="Category" options={categories.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))} />
                  </Form.Item>
                  <Form.Item name="depreciationMethodId">
                    <Select style={{ width: 180 }} placeholder="Method" options={methods.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="acquisitionType"><Select style={{ width: 160 }} options={[
                    { value: 'purchase', label: 'Purchase' },
                    { value: 'construction_transfer', label: 'Construction' },
                    { value: 'inventory_surplus', label: 'Surplus' },
                    { value: 'other', label: 'Other' },
                  ]} /></Form.Item>
                  <Form.Item name="acquisitionDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
                  <Form.Item name="originalValue" rules={[{ required: true }]}><InputNumber min={0} placeholder="Original value" /></Form.Item>
                  <Form.Item name="accumulatedDepreciation"><InputNumber min={0} placeholder="Accum depreciation" /></Form.Item>
                  <Form.Item name="salvageValue"><InputNumber min={0} placeholder="Salvage value" /></Form.Item>
                  <Form.Item name="usefulLifeMonths" rules={[{ required: true }]}><InputNumber min={1} placeholder="Life months" /></Form.Item>
                  <Form.Item name="departmentId" rules={[{ required: true }]}><Input placeholder="Department id" /></Form.Item>
                  <Form.Item name="departmentName"><Input placeholder="Department" /></Form.Item>
                  <Form.Item name="responsiblePerson"><Input placeholder="Owner" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createAsset}>Add</Button>
                </Form>
                <Table rowKey="id" dataSource={assets} columns={[
                  { title: 'Asset no', dataIndex: 'assetNo' },
                  { title: 'Name', dataIndex: 'name' },
                  { title: 'Original', dataIndex: 'originalValue' },
                  { title: 'Accum dep', dataIndex: 'accumulatedDepreciation' },
                  { title: 'Net', dataIndex: 'netValue' },
                  { title: 'Salvage', dataIndex: 'salvageValue' },
                  { title: 'Start period', render: (_, row) => `${row.serviceStartYear}-${String(row.serviceStartPeriod).padStart(2, '0')}` },
                  { title: 'Department', dataIndex: 'currentDepartmentId' },
                  { title: 'Rules', render: (_, row) => <><Tag>{row.depreciationTimelineRule}</Tag><Tag>{row.depreciationDepartmentRule}</Tag></> },
                ]} />
              </>
            ),
          },
          {
            key: 'changes',
            label: 'Transfers and value changes',
            children: (
              <>
                <Form form={transferForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="fixedAssetId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="Asset" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
                  </Form.Item>
                  <Form.Item name="transferDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
                  <Form.Item name="fromDepartmentId"><Input placeholder="From dept" /></Form.Item>
                  <Form.Item name="toDepartmentId" rules={[{ required: true }]}><Input placeholder="To dept" /></Form.Item>
                  <Form.Item name="toDepartmentName"><Input placeholder="To dept name" /></Form.Item>
                  <Form.Item name="responsiblePerson"><Input placeholder="Owner" /></Form.Item>
                  <Button type="primary" icon={<SwapOutlined />} onClick={transferAsset}>Transfer</Button>
                </Form>
                <Form form={changeForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="fixedAssetId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="Asset" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
                  </Form.Item>
                  <Form.Item name="changeDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
                  <Form.Item name="changeType" rules={[{ required: true }]}><Input placeholder="Change type" /></Form.Item>
                  <Form.Item name="amount" rules={[{ required: true }]}><InputNumber placeholder="Amount" /></Form.Item>
                  <Form.Item name="reason"><Input placeholder="Reason" /></Form.Item>
                  <Button icon={<PlusOutlined />} onClick={changeAssetValue}>Change value</Button>
                </Form>
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
