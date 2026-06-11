import React, { useCallback, useEffect, useState } from 'react';
import { Button, Descriptions, Form, InputNumber, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type LedgerEntry = {
  id: string;
  assetNo?: string | null;
  fiscalYear: number;
  periodNo: number;
  sourceType: string;
  amount: number;
};
type FixedAssetReconciliationResult = {
  id: string;
  ledgerNetValue: number;
  glNetValue: number;
  differenceAmount: number;
  rows: LedgerEntry[];
};

export const FixedAssetReconciliation: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentYear } = useAppContext();
  const [ledgerRows, setLedgerRows] = useState<LedgerEntry[]>([]);
  const [reconciliation, setReconciliation] = useState<FixedAssetReconciliationResult | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const values = form.getFieldsValue();
    const fiscalYear = values.fiscalYear ?? currentYear;
    const periodNo = values.periodNo ?? currentPeriod;
    const [ledger, result] = await Promise.all([
      api.get(`/fixed-asset-ledger?accountSetId=${currentAccountSetId}&fiscalYear=${fiscalYear}&periodNo=${periodNo}`),
      api.get(`/fixed-asset-reconciliation?accountSetId=${currentAccountSetId}&fiscalYear=${fiscalYear}&periodNo=${periodNo}`),
    ]);
    setLedgerRows(ledger ?? []);
    setReconciliation(result);
  }, [currentAccountSetId, currentPeriod, currentYear, form]);

  useEffect(() => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod });
    void fetchData();
  }, [currentPeriod, currentYear, fetchData, form]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Fixed Asset Reconciliation</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
      </div>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="fiscalYear"><InputNumber placeholder="Year" /></Form.Item>
        <Form.Item name="periodNo"><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
      </Form>
      <Descriptions bordered size="small" style={{ marginBottom: 16 }} column={3}>
        <Descriptions.Item label="ledgerNetValue">{reconciliation?.ledgerNetValue ?? 0}</Descriptions.Item>
        <Descriptions.Item label="glNetValue">{reconciliation?.glNetValue ?? 0}</Descriptions.Item>
        <Descriptions.Item label="differenceAmount">
          <Tag color={(reconciliation?.differenceAmount ?? 0) === 0 ? 'green' : 'red'}>{reconciliation?.differenceAmount ?? 0}</Tag>
        </Descriptions.Item>
      </Descriptions>
      <Table rowKey="id" dataSource={ledgerRows} columns={[
        { title: 'Asset', dataIndex: 'assetNo' },
        { title: 'Source', dataIndex: 'sourceType' },
        { title: 'Year', dataIndex: 'fiscalYear' },
        { title: 'Period', dataIndex: 'periodNo' },
        { title: 'Amount', dataIndex: 'amount' },
      ]} />
    </div>
  );
};
