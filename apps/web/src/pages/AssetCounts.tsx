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

const varianceTypeLabel: Record<string, string> = {
  inventory_loss: '盘亏',
  inventory_surplus: '盘盈',
  matched: '账实相符',
};

const statusLabel: Record<string, string> = {
  draft: '草稿',
  preview: '预览',
  committed: '已提交',
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
        <h2 style={{ margin: 0 }}>资产盘点</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </div>
      <Alert style={{ marginBottom: 16 }} type="info" showIcon description="资产盘点支持盘亏、盘盈预览，正式提交后生成盘点凭证草稿。" />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="countNo" rules={[{ required: true }]}><Input placeholder="盘点单号" /></Form.Item>
        <Form.Item name="countDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="年度" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="期间" /></Form.Item>
        <Form.Item name="fixedAssetId">
          <Select style={{ width: 220 }} placeholder="已有资产" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
        </Form.Item>
        <Form.Item name="actualStatus"><Select style={{ width: 130 }} options={[{ value: 'missing', label: '盘亏' }, { value: 'found', label: '已盘到' }]} /></Form.Item>
        <Form.Item name="surplusAssetNo"><Input placeholder="盘盈资产编号" /></Form.Item>
        <Form.Item name="surplusAssetName"><Input placeholder="盘盈资产名称" /></Form.Item>
        <Form.Item name="estimatedValue"><InputNumber min={0} placeholder="估计价值" /></Form.Item>
        <Form.Item name="departmentId"><Input placeholder="部门" /></Form.Item>
        <Space>
          <Button icon={<EyeOutlined />} onClick={previewCount}>预览</Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={commitCount}>提交</Button>
        </Space>
      </Form>
      <Table
        rowKey="id"
        dataSource={counts}
        expandable={{
          expandedRowRender: (row) => (
            <Table rowKey="id" pagination={false} dataSource={row.lines} columns={[
              { title: '资产', dataIndex: 'assetNo' },
              { title: '差异', render: (_, line) => varianceTypeLabel[line.varianceType] ?? line.varianceType },
              { title: '账面价值', dataIndex: 'bookValue' },
              { title: '估计价值', dataIndex: 'estimatedValue' },
            ]} />
          ),
        }}
        columns={[
          { title: '盘点单号', dataIndex: 'countNo' },
          { title: '模式', render: (_, row) => row.dryRun ? <Tag>预览</Tag> : <Tag color="blue">正式</Tag> },
          { title: '状态', render: (_, row) => statusLabel[row.status] ?? row.status },
          { title: '差异数', dataIndex: 'varianceCount' },
          { title: '凭证', render: (_, row) => <Tag>{row.voucherDraft?.approvalRequired ? '待审核' : '草稿'}</Tag> },
        ]}
      />
    </div>
  );
};
