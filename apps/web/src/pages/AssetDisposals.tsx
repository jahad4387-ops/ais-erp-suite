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
        <h2 style={{ margin: 0 }}>Asset Disposals</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Alert style={{ marginBottom: 16 }} type="info" showIcon description="phase4_asset_disposal / depreciationStopPeriod" />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="fixedAssetId" rules={[{ required: true }]}>
          <Select style={{ width: 240 }} placeholder="Asset" options={assets.map((row) => ({ value: row.id, label: `${row.assetNo} ${row.name}` }))} />
        </Form.Item>
        <Form.Item name="disposalDate" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
        <Form.Item name="disposalType" rules={[{ required: true }]}>
          <Select style={{ width: 140 }} options={[
            { value: 'sale', label: 'Sale' },
            { value: 'scrap', label: 'Scrap' },
            { value: 'inventory_loss', label: 'Loss' },
          ]} />
        </Form.Item>
        <Form.Item name="proceedsAmount"><InputNumber min={0} placeholder="Proceeds" /></Form.Item>
        <Form.Item name="clearingAccountCode"><Input placeholder="Clearing account" /></Form.Item>
        <Form.Item name="gainLossAccountCode"><Input placeholder="Gain/loss account" /></Form.Item>
        <Button type="primary" icon={<DeleteOutlined />} onClick={createDisposal}>Create draft</Button>
      </Form>
      <Table rowKey="id" dataSource={disposals} columns={[
        { title: 'Asset', dataIndex: 'assetNo' },
        { title: 'Date', dataIndex: 'disposalDate' },
        { title: 'Type', dataIndex: 'disposalType' },
        { title: 'Proceeds', dataIndex: 'proceedsAmount' },
        { title: 'Net value', dataIndex: 'netValueAtDisposal' },
        { title: 'Gain/loss', dataIndex: 'gainLossAmount' },
        { title: 'Stop period', render: (_, row) => row.fixedAsset?.depreciationStopPeriod },
        { title: 'Voucher', render: (_, row) => <Tag>{row.voucherDraft?.sourceType}</Tag> },
      ]} />
    </div>
  );
};
