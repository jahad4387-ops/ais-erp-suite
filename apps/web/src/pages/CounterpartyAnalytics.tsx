import React, { useCallback, useEffect, useState } from 'react';
import { Button, DatePicker, Space, Statistic, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhActor, zhStatus } from '../i18n';

type Direction = 'ap' | 'ar';

type CounterpartySummary = {
  partnerId: string;
  partnerName?: string;
  direction: Direction;
  originalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  overdueAmount: number;
  openItemCount: number;
  status: string;
};

type AgingBucket = {
  partnerId: string;
  partnerName?: string;
  direction: Direction;
  bucketCurrent: number;
  bucket1To30: number;
  bucket31To60: number;
  bucket61To90: number;
  bucketOver90: number;
  totalRemaining: number;
};

type PaymentPlan = {
  id: string;
  requestNo: string;
  supplierName?: string;
  sourceNo?: string;
  plannedPaymentDate?: string;
  requestedAmount: number;
  status: string;
  requestedBy: string;
};

type CollectionPlan = {
  id: string;
  customerName?: string;
  sourceNo: string;
  plannedReceiptDate: string;
  plannedAmount: number;
  status: string;
};

const money = (value: number) => Number(value ?? 0).toFixed(2);

const directionText: Record<Direction, string> = {
  ap: '应付',
  ar: '应收',
};

export const CounterpartyAnalytics: React.FC = () => {
  const { currentAccountSetId } = useAppContext();
  const [asOfDate, setAsOfDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [summaries, setSummaries] = useState<CounterpartySummary[]>([]);
  const [agingRows, setAgingRows] = useState<AgingBucket[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [collectionPlans, setCollectionPlans] = useState<CollectionPlan[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) {
      setSummaries([]);
      setAgingRows([]);
      setPaymentPlans([]);
      setCollectionPlans([]);
      return;
    }
    setLoading(true);
    try {
      const [summaryRows, arAgingRows, apAgingRows, paymentRows, collectionRows] = await Promise.all([
        api.get(`/counterparty-ledger-summary?accountSetId=${currentAccountSetId}&asOfDate=${asOfDate}`),
        api.get(`/counterparty-aging?accountSetId=${currentAccountSetId}&direction=ar&asOfDate=${asOfDate}`),
        api.get(`/counterparty-aging?accountSetId=${currentAccountSetId}&direction=ap&asOfDate=${asOfDate}`),
        api.get(`/payment-requests?accountSetId=${currentAccountSetId}`),
        api.get(`/collection-plans?accountSetId=${currentAccountSetId}`),
      ]);
      setSummaries(summaryRows ?? []);
      setAgingRows([...(arAgingRows ?? []), ...(apAgingRows ?? [])]);
      setPaymentPlans(paymentRows ?? []);
      setCollectionPlans(collectionRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [asOfDate, currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totals = summaries.reduce(
    (sum, row) => ({
      remainingAmount: sum.remainingAmount + Number(row.remainingAmount ?? 0),
      overdueAmount: sum.overdueAmount + Number(row.overdueAmount ?? 0),
    }),
    { remainingAmount: 0, overdueAmount: 0 }
  );

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>往来分析</h2>
        <Space wrap>
          <DatePicker value={dayjs(asOfDate)} onChange={(value) => setAsOfDate(value?.format('YYYY-MM-DD') ?? dayjs().format('YYYY-MM-DD'))} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
        <Statistic title="未结余额" value={totals.remainingAmount} precision={2} />
        <Statistic title="逾期余额" value={totals.overdueAmount} precision={2} />
      </div>

      <Table
        rowKey={(record) => `${record.direction}:${record.partnerId}`}
        title={() => '供应商 / 客户往来账'}
        loading={loading}
        dataSource={summaries}
        columns={[
          { title: '方向', dataIndex: 'direction', width: 90, render: (value: Direction) => <Tag color={value === 'ap' ? 'volcano' : 'blue'}>{directionText[value]}</Tag> },
          { title: '往来单位', dataIndex: 'partnerName', render: (value: string, record) => value ?? record.partnerId },
          { title: '单据金额', dataIndex: 'originalAmount', width: 120, align: 'right', render: money },
          { title: '已核销', dataIndex: 'settledAmount', width: 120, align: 'right', render: money },
          { title: '未结余额', dataIndex: 'remainingAmount', width: 120, align: 'right', render: money },
          { title: '逾期余额', dataIndex: 'overdueAmount', width: 120, align: 'right', render: money },
          { title: '未结笔数', dataIndex: 'openItemCount', width: 100, align: 'right' },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag color={value === 'overdue' ? 'red' : 'green'}>{value === 'overdue' ? '逾期' : '正常'}</Tag> },
        ]}
      />

      <Table
        rowKey={(record) => `${record.direction}:${record.partnerId}`}
        title={() => '应收 / 应付账龄'}
        loading={loading}
        dataSource={agingRows}
        columns={[
          { title: '方向', dataIndex: 'direction', width: 90, render: (value: Direction) => <Tag color={value === 'ap' ? 'volcano' : 'blue'}>{directionText[value]}</Tag> },
          { title: '往来单位', dataIndex: 'partnerName', render: (value: string, record) => value ?? record.partnerId },
          { title: '未到期', dataIndex: 'bucketCurrent', width: 110, align: 'right', render: money },
          { title: '1-30天', dataIndex: 'bucket1To30', width: 110, align: 'right', render: money },
          { title: '31-60天', dataIndex: 'bucket31To60', width: 110, align: 'right', render: money },
          { title: '61-90天', dataIndex: 'bucket61To90', width: 110, align: 'right', render: money },
          { title: '90天以上', dataIndex: 'bucketOver90', width: 120, align: 'right', render: money },
          { title: '合计', dataIndex: 'totalRemaining', width: 120, align: 'right', render: money },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '付款计划'}
        loading={loading}
        dataSource={paymentPlans}
        columns={[
          { title: '申请单号', dataIndex: 'requestNo', width: 170 },
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '供应商', dataIndex: 'supplierName' },
          { title: '计划付款日', dataIndex: 'plannedPaymentDate', width: 130, render: (value: string) => value ?? '-' },
          { title: '金额', dataIndex: 'requestedAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          { title: '申请人', dataIndex: 'requestedBy', width: 120, render: (value: string) => zhActor(value) },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '回款计划'}
        loading={loading}
        dataSource={collectionPlans}
        columns={[
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '客户', dataIndex: 'customerName' },
          { title: '计划回款日', dataIndex: 'plannedReceiptDate', width: 130 },
          { title: '金额', dataIndex: 'plannedAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
        ]}
      />
    </div>
  );
};
