import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Space, Table, Tag } from 'antd';
import { CheckOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type FixedAsset = { id: string; assetNo: string; name: string };
type AssetCountLine = { id: string; assetNo: string; varianceType: 'inventory_loss' | 'inventory_surplus' | 'matched'; bookValue: number; estimatedValue: number };
type AssetCount = {
  id: string;
  countNo: string;
  dryRun: boolean;
  status: string;
  varianceCount: number;
  voucherDraft: { sourceType: 'phase4_asset_count'; approvalRequired: boolean };
  lines: AssetCountLine[];
};

export const AssetCounts: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [counts, setCounts] = useState<AssetCount[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const [assetRows, countRows] = await Promise.all([
      api.get(`/fixed-assets?accountSetId=${currentAccountSetId}`),
      api.get(`/asset-counts?accountSetId=${currentAccountSetId}`),
    ]);
    setAssets(assetRows ?? []);
    setCounts(countRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod, actualStatus: 'missing', surplusStatus: 'surplus' });
    void fetchData();
  }, [currentPeriod, currentYear, fetchData, form]);

  const buildPayload = async () => {
    const values = await form.validateFields();
    return {
      accountSetId: currentAccountSetId,
      countNo: values.countNo,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      countDate: values.countDate,
      createdBy: currentUser,
      lines: [
        { fixedAssetId: values.fixedAssetId, actualStatus: values.actualStatus, remark: values.remark },
        { assetNo: values.surplusAssetNo, assetName: values.surplusAssetName, actualStatus: 'surplus', estimatedValue: values.estimatedValue, departmentId: values.departmentId },
      ].filter((line) => line.fixedAssetId || line.assetNo),
    };
  };

  const previewCount = async () => {
    const preview = await api.post('/asset-counts/preview', await buildPayload());
    setCounts((rows) => [preview, ...rows]);
  };

  const commitCount = async () => {
    await api.post('/asset-counts', await buildPayload());
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Asset Counts</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Alert style={{ marginBottom: 16 }} type="info" showIcon description="phase4_asset_count / inventory_loss / inventory_surplus" />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="countNo" rules={[{ required: true }]}><Input placeholder="Count no" /></Form.Item>
        <Form.Item name="countDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="Year" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
        <Form.Item name="fixedAssetId">
          <Select style={{ width: 220 }} placeholder="Existing asset" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
        </Form.Item>
        <Form.Item name="actualStatus"><Select style={{ width: 130 }} options={[{ value: 'missing', label: 'Missing' }, { value: 'found', label: 'Found' }]} /></Form.Item>
        <Form.Item name="surplusAssetNo"><Input placeholder="Surplus asset no" /></Form.Item>
        <Form.Item name="surplusAssetName"><Input placeholder="Surplus name" /></Form.Item>
        <Form.Item name="estimatedValue"><InputNumber min={0} placeholder="Estimated value" /></Form.Item>
        <Form.Item name="departmentId"><Input placeholder="Department" /></Form.Item>
        <Space>
          <Button icon={<EyeOutlined />} onClick={previewCount}>Preview</Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={commitCount}>Commit</Button>
        </Space>
      </Form>
      <Table
        rowKey="id"
        dataSource={counts}
        expandable={{
          expandedRowRender: (row) => (
            <Table rowKey="id" pagination={false} dataSource={row.lines} columns={[
              { title: 'Asset', dataIndex: 'assetNo' },
              { title: 'Variance', dataIndex: 'varianceType' },
              { title: 'Book value', dataIndex: 'bookValue' },
              { title: 'Estimated', dataIndex: 'estimatedValue' },
            ]} />
          ),
        }}
        columns={[
          { title: 'Count no', dataIndex: 'countNo' },
          { title: 'Mode', render: (_, row) => row.dryRun ? <Tag>preview</Tag> : <Tag color="blue">committed</Tag> },
          { title: 'Status', dataIndex: 'status' },
          { title: 'Variances', dataIndex: 'varianceCount' },
          { title: 'Voucher', render: (_, row) => <Tag>{row.voucherDraft?.sourceType}</Tag> },
        ]}
      />
    </div>
  );
};
