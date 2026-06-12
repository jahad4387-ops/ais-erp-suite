import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Table, Tag } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type FixedAsset = { id: string; assetNo: string; name: string; netValue: number };
type AssetDisposal = {
  id: string;
  assetNo: string;
  disposalDate: string;
  disposalType: string;
  proceedsAmount: number;
  netValueAtDisposal: number;
  gainLossAmount: number;
  voucherDraft: { sourceType: 'phase4_asset_disposal'; approvalRequired: boolean };
  fixedAsset: { depreciationStopPeriod: number };
};

const disposalTypeLabel: Record<string, string> = {
  sale: '出售',
  scrap: '报废',
  inventory_loss: '盘亏',
};

export const AssetDisposals: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [disposals, setDisposals] = useState<AssetDisposal[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const assetRows = await api.get(`/fixed-assets?accountSetId=${currentAccountSetId}`);
    setAssets(assetRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    form.setFieldsValue({ disposalType: 'sale', clearingAccountCode: '1606', gainLossAccountCode: '6711' });
    void fetchData();
  }, [fetchData, form]);

  const createDisposal = async () => {
    const values = await form.validateFields();
    const disposal = await api.post('/asset-disposals', { accountSetId: currentAccountSetId, ...values, createdBy: currentUser });
    setDisposals((rows) => [disposal, ...rows]);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>资产处置</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </div>
      <Alert style={{ marginBottom: 16 }} type="info" showIcon description="资产处置会停止后续折旧，并生成处置凭证草稿。" />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="fixedAssetId" rules={[{ required: true }]}>
          <Select style={{ width: 240 }} placeholder="资产" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
        </Form.Item>
        <Form.Item name="disposalDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
        <Form.Item name="disposalType" rules={[{ required: true }]}>
          <Select style={{ width: 140 }} options={[
            { value: 'sale', label: '出售' },
            { value: 'scrap', label: '报废' },
            { value: 'inventory_loss', label: '盘亏' },
          ]} />
        </Form.Item>
        <Form.Item name="proceedsAmount"><InputNumber min={0} placeholder="处置收入" /></Form.Item>
        <Form.Item name="clearingAccountCode"><Input placeholder="清理科目" /></Form.Item>
        <Form.Item name="gainLossAccountCode"><Input placeholder="损益科目" /></Form.Item>
        <Button type="primary" icon={<DeleteOutlined />} onClick={createDisposal}>生成草稿</Button>
      </Form>
      <Table rowKey="id" dataSource={disposals} columns={[
        { title: '资产', dataIndex: 'assetNo' },
        { title: '日期', dataIndex: 'disposalDate' },
        { title: '类型', render: (_, row) => disposalTypeLabel[row.disposalType] ?? row.disposalType },
        { title: '处置收入', dataIndex: 'proceedsAmount' },
        { title: '处置净值', dataIndex: 'netValueAtDisposal' },
        { title: '处置损益', dataIndex: 'gainLossAmount' },
        { title: '停止期间', render: (_, row) => row.fixedAsset?.depreciationStopPeriod },
        { title: '凭证', render: (_, row) => <Tag>{row.voucherDraft?.approvalRequired ? '待审核' : '草稿'}</Tag> },
      ]} />
    </div>
  );
};
