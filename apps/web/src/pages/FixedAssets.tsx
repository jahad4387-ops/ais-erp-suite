import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Table, Tabs, Tag } from 'antd';
import { SwapOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

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

const timelineRuleLabel: Record<string, string> = {
  new_asset_next_month: '新增次月计提',
};

const departmentRuleLabel: Record<string, string> = {
  month_end_department: '按月末使用部门',
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
        <h2 style={{ margin: 0 }}>固定资产卡片</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        description="固定资产默认按新增次月开始计提折旧，并按月末使用部门归集折旧费用。"
      />
      <Tabs
        items={[
          {
            key: 'cards',
            label: '资产卡片',
            children: (
              <>
                <Form form={assetForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="assetNo" rules={[{ required: true }]}><Input placeholder="资产编号" /></Form.Item>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="资产名称" /></Form.Item>
                  <Form.Item name="categoryId" rules={[{ required: true }]}>
                    <Select style={{ width: 200 }} placeholder="资产类别" options={categories.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))} />
                  </Form.Item>
                  <Form.Item name="depreciationMethodId">
                    <Select style={{ width: 180 }} placeholder="折旧方法" options={methods.map((row) => ({ value: row.id, label: row.name }))} />
                  </Form.Item>
                  <Form.Item name="acquisitionType"><Select style={{ width: 160 }} options={[
                    { value: 'purchase', label: '购入' },
                    { value: 'construction_transfer', label: '在建转入' },
                    { value: 'inventory_surplus', label: '盘盈' },
                    { value: 'other', label: '其他' },
                  ]} /></Form.Item>
                  <Form.Item name="acquisitionDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
                  <Form.Item name="originalValue" rules={[{ required: true }]}><InputNumber min={0} placeholder="原值" /></Form.Item>
                  <Form.Item name="accumulatedDepreciation"><InputNumber min={0} placeholder="累计折旧" /></Form.Item>
                  <Form.Item name="salvageValue"><InputNumber min={0} placeholder="残值" /></Form.Item>
                  <Form.Item name="usefulLifeMonths" rules={[{ required: true }]}><InputNumber min={1} placeholder="使用月限" /></Form.Item>
                  <Form.Item name="departmentId" rules={[{ required: true }]}><Input placeholder="部门编码" /></Form.Item>
                  <Form.Item name="departmentName"><Input placeholder="部门名称" /></Form.Item>
                  <Form.Item name="responsiblePerson"><Input placeholder="责任人" /></Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={createAsset}>新增</Button>
                </Form>
                <Table rowKey="id" dataSource={assets} columns={[
                  { title: '资产编号', dataIndex: 'assetNo' },
                  { title: '资产名称', dataIndex: 'name' },
                  { title: '原值', dataIndex: 'originalValue' },
                  { title: '累计折旧', dataIndex: 'accumulatedDepreciation' },
                  { title: '净值', dataIndex: 'netValue' },
                  { title: '残值', dataIndex: 'salvageValue' },
                  { title: '开始期间', render: (_, row) => `${row.serviceStartYear}-${String(row.serviceStartPeriod).padStart(2, '0')}` },
                  { title: '使用部门', dataIndex: 'currentDepartmentId' },
                  {
                    title: '折旧规则',
                    render: (_, row) => (
                      <>
                        <Tag>{timelineRuleLabel[row.depreciationTimelineRule] ?? row.depreciationTimelineRule}</Tag>
                        <Tag>{departmentRuleLabel[row.depreciationDepartmentRule] ?? row.depreciationDepartmentRule}</Tag>
                      </>
                    ),
                  },
                  {
                    title: 'Agent',
                    render: (_, row) => (
                      <AgentDraftEntryButton
                        size="small"
                        draftType="asset_change"
                        sourceObjectType="fixed_asset"
                        sourceObjectId={row.id}
                        userInstruction={`Generate asset change draft from ${row.assetNo}.`}
                      >
                        Agent
                      </AgentDraftEntryButton>
                    ),
                  },
                ]} />
              </>
            ),
          },
          {
            key: 'changes',
            label: '转移与原值变动',
            children: (
              <>
                <Form form={transferForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="fixedAssetId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="资产" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
                  </Form.Item>
                  <Form.Item name="transferDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
                  <Form.Item name="fromDepartmentId"><Input placeholder="转出部门" /></Form.Item>
                  <Form.Item name="toDepartmentId" rules={[{ required: true }]}><Input placeholder="转入部门" /></Form.Item>
                  <Form.Item name="toDepartmentName"><Input placeholder="转入部门名称" /></Form.Item>
                  <Form.Item name="responsiblePerson"><Input placeholder="责任人" /></Form.Item>
                  <Button type="primary" icon={<SwapOutlined />} onClick={transferAsset}>转移</Button>
                </Form>
                <Form form={changeForm} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item name="fixedAssetId" rules={[{ required: true }]}>
                    <Select style={{ width: 220 }} placeholder="资产" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
                  </Form.Item>
                  <Form.Item name="changeDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
                  <Form.Item name="changeType" rules={[{ required: true }]}><Input placeholder="变动类型" /></Form.Item>
                  <Form.Item name="amount" rules={[{ required: true }]}><InputNumber placeholder="金额" /></Form.Item>
                  <Form.Item name="reason"><Input placeholder="原因" /></Form.Item>
                  <Button icon={<PlusOutlined />} onClick={changeAssetValue}>登记变动</Button>
                </Form>
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
