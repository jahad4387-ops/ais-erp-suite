import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Select, Space, Statistic, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { auxiliaryCategoryText, zhActor, zhStatus } from '../i18n';

type Direction = 'ap' | 'ar';

type CounterpartyLedgerEntry = {
  id: string;
  partnerId: string;
  partnerName?: string;
  direction: Direction;
  sourceType: 'purchase_invoice' | 'sales_invoice';
  sourceId: string;
  sourceNo: string;
  documentDate: string;
  dueDate?: string;
  originalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  status: string;
  glAccountCode: string;
  auxiliaryType: 'supplier' | 'customer';
  auxiliaryPartnerId: string;
  createdBy: string;
};

const directionText: Record<Direction, string> = {
  ap: '应付',
  ar: '应收',
};

const sourceTypeText: Record<string, string> = {
  purchase_invoice: '采购发票',
  sales_invoice: '销售发票',
};

const amount = (value: number) => Number(value ?? 0).toFixed(2);

export const CounterpartyLedger: React.FC = () => {
  const { currentAccountSetId } = useAppContext();
  const [rows, setRows] = useState<CounterpartyLedgerEntry[]>([]);
  const [direction, setDirection] = useState<Direction | undefined>();
  const [partnerId, setPartnerId] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>('open');
  const [loading, setLoading] = useState(false);

  const partnerOptions = useMemo(
    () =>
      Array.from(
        new Map(
          rows.map((row) => [
            row.partnerId,
            {
              value: row.partnerId,
              label: row.partnerName ? `${row.partnerName} (${row.partnerId})` : row.partnerId,
            },
          ])
        ).values()
      ),
    [rows]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          originalAmount: sum.originalAmount + Number(row.originalAmount ?? 0),
          remainingAmount: sum.remainingAmount + Number(row.remainingAmount ?? 0),
        }),
        { originalAmount: 0, remainingAmount: 0 }
      ),
    [rows]
  );

  const fetchRows = useCallback(async () => {
    if (!currentAccountSetId) {
      setRows([]);
      return;
    }
    const query = new URLSearchParams({ accountSetId: currentAccountSetId });
    if (direction) query.set('direction', direction);
    if (partnerId) query.set('partnerId', partnerId);
    if (status) query.set('status', status);
    setLoading(true);
    try {
      const result = await api.get(`/counterparty-ledger?${query.toString()}`);
      setRows(result ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, direction, partnerId, status]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>往来明细</h2>
        <Space wrap>
          <Select
            allowClear
            placeholder="方向"
            value={direction}
            onChange={setDirection}
            style={{ width: 120 }}
            options={[
              { value: 'ap', label: '应付' },
              { value: 'ar', label: '应收' },
            ]}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="往来单位"
            value={partnerId}
            onChange={setPartnerId}
            style={{ width: 220 }}
            options={partnerOptions}
          />
          <Select
            allowClear
            placeholder="状态"
            value={status}
            onChange={setStatus}
            style={{ width: 140 }}
            options={[
              { value: 'open', label: '未结清' },
              { value: 'partially_settled', label: '部分核销' },
              { value: 'settled', label: '已结清' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchRows}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
        <Statistic title="单据金额" value={totals.originalAmount} precision={2} />
        <Statistic title="未结金额" value={totals.remainingAmount} precision={2} />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: '方向', dataIndex: 'direction', width: 90, render: (value: Direction) => <Tag color={value === 'ap' ? 'volcano' : 'blue'}>{directionText[value]}</Tag> },
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '来源类型', dataIndex: 'sourceType', width: 120, render: (value: string) => sourceTypeText[value] ?? value },
          { title: '往来单位', dataIndex: 'partnerName', render: (value: string, record) => value ?? record.partnerId },
          { title: '业务日期', dataIndex: 'documentDate', width: 120 },
          { title: '到期日', dataIndex: 'dueDate', width: 120, render: (value: string) => value ?? '-' },
          { title: '单据金额', dataIndex: 'originalAmount', width: 120, align: 'right', render: amount },
          { title: '已核销', dataIndex: 'settledAmount', width: 110, align: 'right', render: amount },
          { title: '未结金额', dataIndex: 'remainingAmount', width: 120, align: 'right', render: amount },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          { title: '总账科目', dataIndex: 'glAccountCode', width: 110 },
          {
            title: '辅助核算',
            dataIndex: 'auxiliaryPartnerId',
            width: 210,
            render: (value: string, record) => `${auxiliaryCategoryText[record.auxiliaryType] ?? record.auxiliaryType}: ${value}`,
          },
          { title: '确认人', dataIndex: 'createdBy', width: 120, render: (value: string) => zhActor(value) },
        ]}
      />
    </div>
  );
};
