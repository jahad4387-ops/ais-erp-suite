import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhActor, zhStatus } from '../i18n';

type PayableEntry = {
  id: string;
  partnerId: string;
  partnerName?: string;
  sourceNo: string;
  remainingAmount: number;
  settledAmount: number;
  status: string;
};

type SupplierPayment = {
  id: string;
  paymentNo: string;
  supplierId: string;
  supplierName?: string;
  paidAmount: number;
  status: string;
};

type ApSettlement = {
  id: string;
  settlementNo: string;
  sourceNo?: string;
  supplierName?: string;
  supplierPaymentNo?: string;
  settlementType: string;
  settlementDate: string;
  settledAmount: number;
  differenceAmount: number;
  differenceReason?: string;
  status: string;
  createdBy: string;
};

const money = (value: number) => Number(value ?? 0).toFixed(2);

const settlementTypeOptions = [
  { value: 'payment_to_bill', label: '付款核销应付' },
  { value: 'prepayment_to_bill', label: '预付核销应付' },
  { value: 'credit_note_to_bill', label: '红字核销' },
  { value: 'refund', label: '退款' },
  { value: 'ar_ap_netting', label: '应收冲应付' },
];

export const ApSettlementWorkbench: React.FC = () => {
  const { currentAccountSetId, currentUser } = useAppContext();
  const [payables, setPayables] = useState<PayableEntry[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [settlements, setSettlements] = useState<ApSettlement[]>([]);
  const [selectedPayable, setSelectedPayable] = useState<PayableEntry | null>(null);
  const [supplierPaymentId, setSupplierPaymentId] = useState<string | undefined>();
  const [settlementType, setSettlementType] = useState('payment_to_bill');
  const [settledAmount, setSettledAmount] = useState<number>(0);
  const [differenceAmount, setDifferenceAmount] = useState<number>(0);
  const [differenceReason, setDifferenceReason] = useState('');
  const [loading, setLoading] = useState(false);

  const paymentOptions = useMemo(
    () =>
      payments.map((payment) => ({
        value: payment.id,
        label: `${payment.paymentNo} ${payment.supplierName ?? payment.supplierId} / ${money(payment.paidAmount)}`,
      })),
    [payments]
  );

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) {
      setPayables([]);
      setPayments([]);
      setSettlements([]);
      return;
    }
    setLoading(true);
    try {
      const [ledgerRows, paymentRows, settlementRows] = await Promise.all([
        api.get(`/counterparty-ledger?accountSetId=${currentAccountSetId}&direction=ap`),
        api.get(`/supplier-payments?accountSetId=${currentAccountSetId}`),
        api.get(`/ap-settlements?accountSetId=${currentAccountSetId}`),
      ]);
      setPayables((ledgerRows ?? []).filter((row: PayableEntry) => row.status !== 'settled'));
      setPayments(paymentRows ?? []);
      setSettlements(settlementRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openSettlement = (payable: PayableEntry) => {
    setSelectedPayable(payable);
    setSettledAmount(Number(payable.remainingAmount ?? 0));
    setDifferenceAmount(0);
    setDifferenceReason('');
    setSettlementType('payment_to_bill');
    setSupplierPaymentId(undefined);
  };

  const createSettlement = async () => {
    if (!currentAccountSetId || !selectedPayable) return;
    try {
      await api.post('/ap-settlements', {
        accountSetId: currentAccountSetId,
        counterpartyLedgerEntryId: selectedPayable.id,
        supplierPaymentId,
        settlementDate: new Date().toISOString().slice(0, 10),
        settlementType,
        settledAmount,
        differenceAmount,
        differenceReason: differenceReason || undefined,
        createdBy: currentUser,
      });
      message.success('应付核销已完成');
      setSelectedPayable(null);
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>应付核销工作台</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          刷新
        </Button>
      </div>

      <Table
        rowKey="id"
        title={() => '待核销应付'}
        loading={loading}
        dataSource={payables}
        columns={[
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '供应商', dataIndex: 'partnerName', render: (value: string, record) => value ?? record.partnerId },
          { title: '已核销', dataIndex: 'settledAmount', width: 120, align: 'right', render: money },
          { title: '未核销', dataIndex: 'remainingAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          {
            title: '操作',
            width: 120,
            render: (_, record) => (
              <Button size="small" icon={<CheckOutlined />} onClick={() => openSettlement(record)}>
                核销
              </Button>
            ),
          },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '付款单'}
        loading={loading}
        dataSource={payments}
        columns={[
          { title: '付款单号', dataIndex: 'paymentNo', width: 160 },
          { title: '供应商', dataIndex: 'supplierName', render: (value: string, record) => value ?? record.supplierId },
          { title: '付款金额', dataIndex: 'paidAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '核销记录'}
        loading={loading}
        dataSource={settlements}
        columns={[
          { title: '核销单号', dataIndex: 'settlementNo', width: 170 },
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '付款单', dataIndex: 'supplierPaymentNo', width: 160, render: (value: string) => value ?? '-' },
          { title: '类型', dataIndex: 'settlementType', width: 140 },
          { title: '核销日期', dataIndex: 'settlementDate', width: 120 },
          { title: '核销金额', dataIndex: 'settledAmount', width: 120, align: 'right', render: money },
          { title: '差额', dataIndex: 'differenceAmount', width: 110, align: 'right', render: money },
          { title: '差额原因', dataIndex: 'differenceReason', render: (value: string) => value ?? '-' },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          { title: '经办人', dataIndex: 'createdBy', width: 120, render: (value: string) => zhActor(value) },
        ]}
      />

      <Modal title="创建应付核销" open={Boolean(selectedPayable)} onOk={createSettlement} onCancel={() => setSelectedPayable(null)} width={640}>
        <div style={{ display: 'grid', gap: 12, width: '100%' }}>
          <span>{selectedPayable?.sourceNo}</span>
          <Select value={settlementType} onChange={setSettlementType} options={settlementTypeOptions} />
          <Select allowClear placeholder="选择付款单" value={supplierPaymentId} onChange={setSupplierPaymentId} options={paymentOptions} />
          <Space wrap>
            <InputNumber min={0.01} precision={2} value={settledAmount} onChange={(value) => setSettledAmount(Number(value ?? 0))} addonBefore="核销金额" />
            <InputNumber min={0} precision={2} value={differenceAmount} onChange={(value) => setDifferenceAmount(Number(value ?? 0))} addonBefore="差额" />
          </Space>
          <Input placeholder="差额原因" value={differenceReason} onChange={(event) => setDifferenceReason(event.target.value)} />
        </div>
      </Modal>
    </div>
  );
};
