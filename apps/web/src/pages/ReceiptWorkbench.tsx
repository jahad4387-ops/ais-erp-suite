import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, PayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhActor, zhStatus } from '../i18n';

type ReceivableEntry = {
  id: string;
  partnerId: string;
  partnerName?: string;
  sourceNo: string;
  documentDate: string;
  dueDate?: string;
  remainingAmount: number;
};

type PayableEntry = {
  id: string;
  partnerId: string;
  partnerName?: string;
  sourceNo: string;
  remainingAmount: number;
  glAccountCode?: string;
  status: string;
};

type CustomerReceipt = {
  id: string;
  receiptNo: string;
  customerId: string;
  customerName?: string;
  sourceNo?: string;
  receiptDate: string;
  receiptType: 'receipt' | 'prepayment';
  receivedAmount: number;
  status: string;
  receivedBy: string;
  bankAccountCode: string;
};

type ArSettlement = {
  id: string;
  settlementNo: string;
  sourceNo?: string;
  customerName?: string;
  customerReceiptNo?: string;
  nettingSourceNo?: string;
  settlementType: string;
  settlementDate: string;
  settledAmount: number;
  differenceAmount: number;
  differenceReason?: string;
  voucherDraft?: {
    status: string;
    lines: { accountCode: string; debit: number; credit: number }[];
  };
  status: string;
  createdBy: string;
};

type CollectionPlan = {
  id: string;
  customerId: string;
  customerName?: string;
  sourceNo: string;
  plannedReceiptDate: string;
  plannedAmount: number;
  status: string;
};

type CreditExposure = {
  customerId: string;
  customerName: string;
  creditLimit: number;
  occupiedAmount: number;
  availableCredit: number;
  status: string;
};

const money = (value: number) => Number(value ?? 0).toFixed(2);

export const ReceiptWorkbench: React.FC = () => {
  const { currentAccountSetId, currentUser } = useAppContext();
  const [receivables, setReceivables] = useState<ReceivableEntry[]>([]);
  const [payables, setPayables] = useState<PayableEntry[]>([]);
  const [receipts, setReceipts] = useState<CustomerReceipt[]>([]);
  const [settlements, setSettlements] = useState<ArSettlement[]>([]);
  const [plans, setPlans] = useState<CollectionPlan[]>([]);
  const [creditExposures, setCreditExposures] = useState<CreditExposure[]>([]);
  const [selectedReceivable, setSelectedReceivable] = useState<ReceivableEntry | null>(null);
  const [selectedSettlementReceivable, setSelectedSettlementReceivable] = useState<ReceivableEntry | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [receiptType, setReceiptType] = useState<'receipt' | 'prepayment'>('receipt');
  const [settlementType, setSettlementType] = useState('receipt_to_bill');
  const [customerReceiptId, setCustomerReceiptId] = useState<string | undefined>();
  const [nettingCounterpartyLedgerEntryId, setNettingCounterpartyLedgerEntryId] = useState<string | undefined>();
  const [amount, setAmount] = useState<number>(0);
  const [settlementAmount, setSettlementAmount] = useState<number>(0);
  const [differenceAmount, setDifferenceAmount] = useState<number>(0);
  const [differenceReason, setDifferenceReason] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) {
      setReceivables([]);
      setPayables([]);
      setReceipts([]);
      setSettlements([]);
      setPlans([]);
      setCreditExposures([]);
      return;
    }
    setLoading(true);
    try {
      const [ledgerRows, payableRows, receiptRows, settlementRows, planRows, exposureRows] = await Promise.all([
        api.get(`/counterparty-ledger?accountSetId=${currentAccountSetId}&direction=ar&status=open`),
        api.get(`/counterparty-ledger?accountSetId=${currentAccountSetId}&direction=ap`),
        api.get(`/customer-receipts?accountSetId=${currentAccountSetId}`),
        api.get(`/ar-settlements?accountSetId=${currentAccountSetId}`),
        api.get(`/collection-plans?accountSetId=${currentAccountSetId}`),
        api.get(`/credit-exposures?accountSetId=${currentAccountSetId}`),
      ]);
      setReceivables(ledgerRows ?? []);
      setPayables((payableRows ?? []).filter((row: PayableEntry) => row.status !== 'settled'));
      setReceipts(receiptRows ?? []);
      setSettlements(settlementRows ?? []);
      setPlans(planRows ?? []);
      setCreditExposures(exposureRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openReceipt = (entry: ReceivableEntry) => {
    setReceiptType('receipt');
    setSelectedReceivable(entry);
    setSelectedCustomerId(entry.partnerId);
    setAmount(Number(entry.remainingAmount ?? 0));
  };

  const openPrepayment = (customerId: string) => {
    setReceiptType('prepayment');
    setSelectedReceivable(null);
    setSelectedCustomerId(customerId);
    setAmount(0);
  };

  const receiptOptions = receipts.map((receipt) => ({
    value: receipt.id,
    label: `${receipt.receiptNo} / ${receipt.customerName ?? receipt.customerId} / ${money(receipt.receivedAmount)}`,
  }));

  const payableOptions = payables.map((payable) => ({
    value: payable.id,
    label: `${payable.sourceNo} / ${payable.partnerName ?? payable.partnerId} / ${money(payable.remainingAmount)}`,
  }));

  const openSettlement = (entry: ReceivableEntry) => {
    setSelectedSettlementReceivable(entry);
    setSettlementType('receipt_to_bill');
    setCustomerReceiptId(undefined);
    setNettingCounterpartyLedgerEntryId(undefined);
    setSettlementAmount(Number(entry.remainingAmount ?? 0));
    setDifferenceAmount(0);
    setDifferenceReason('');
  };

  const createReceipt = async () => {
    if (!currentAccountSetId || !selectedCustomerId) return;
    try {
      await api.post('/customer-receipts', {
        accountSetId: currentAccountSetId,
        counterpartyLedgerEntryId: receiptType === 'receipt' ? selectedReceivable?.id : undefined,
        customerId: selectedCustomerId,
        receiptDate: new Date().toISOString().slice(0, 10),
        receiptType,
        receivedAmount: amount,
        receivedBy: currentUser,
        receiptMethod: 'bank_transfer',
        bankAccountCode: '1002',
      });
      message.success(receiptType === 'receipt' ? '收款单已生成' : '预收款已登记');
      setSelectedReceivable(null);
      setSelectedCustomerId(null);
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const createSettlement = async () => {
    if (!currentAccountSetId || !selectedSettlementReceivable) return;
    try {
      await api.post('/ar-settlements', {
        accountSetId: currentAccountSetId,
        counterpartyLedgerEntryId: selectedSettlementReceivable.id,
        customerReceiptId,
        nettingCounterpartyLedgerEntryId,
        settlementDate: new Date().toISOString().slice(0, 10),
        settlementType,
        settledAmount: settlementAmount,
        differenceAmount,
        differenceReason: differenceReason || undefined,
        createdBy: currentUser,
      });
      message.success('应收核销已完成');
      setSelectedSettlementReceivable(null);
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>收款核销工作台</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          刷新
        </Button>
      </div>

      <Table
        rowKey="customerId"
        title={() => '信用额度占用'}
        loading={loading}
        dataSource={creditExposures}
        columns={[
          { title: '客户', dataIndex: 'customerName' },
          { title: '信用额度', dataIndex: 'creditLimit', width: 120, align: 'right', render: money },
          { title: '占用金额', dataIndex: 'occupiedAmount', width: 120, align: 'right', render: money },
          { title: '可用额度', dataIndex: 'availableCredit', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag color={value === 'over_limit' ? 'red' : 'green'}>{zhStatus(value)}</Tag> },
          {
            title: '操作',
            width: 120,
            render: (_, record) => (
              <Button size="small" icon={<PayCircleOutlined />} onClick={() => openPrepayment(record.customerId)}>
                预收
              </Button>
            ),
          },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '待收款应收'}
        loading={loading}
        dataSource={receivables}
        columns={[
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '客户', dataIndex: 'partnerName', render: (value: string, record) => value ?? record.partnerId },
          { title: '业务日期', dataIndex: 'documentDate', width: 120 },
          { title: '到期日', dataIndex: 'dueDate', width: 120, render: (value: string) => value ?? '-' },
          { title: '未收金额', dataIndex: 'remainingAmount', width: 120, align: 'right', render: money },
          {
            title: '操作',
            width: 180,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<PayCircleOutlined />} onClick={() => openReceipt(record)}>
                  收款
                </Button>
                <Button size="small" icon={<CheckOutlined />} onClick={() => openSettlement(record)}>
                  核销
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '回款计划'}
        loading={loading}
        dataSource={plans}
        columns={[
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '客户', dataIndex: 'customerName' },
          { title: '计划回款日', dataIndex: 'plannedReceiptDate', width: 130 },
          { title: '计划金额', dataIndex: 'plannedAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '收款单 / 预收款'}
        loading={loading}
        dataSource={receipts}
        columns={[
          { title: '收款单号', dataIndex: 'receiptNo', width: 160 },
          { title: '来源单据', dataIndex: 'sourceNo', width: 150, render: (value: string) => value ?? '-' },
          { title: '客户', dataIndex: 'customerName' },
          { title: '类型', dataIndex: 'receiptType', width: 110, render: (value: string) => <Tag color={value === 'prepayment' ? 'purple' : 'blue'}>{value === 'prepayment' ? '预收款' : '收款单'}</Tag> },
          { title: '收款日期', dataIndex: 'receiptDate', width: 120 },
          { title: '收款金额', dataIndex: 'receivedAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          { title: '收款人', dataIndex: 'receivedBy', width: 120, render: (value: string) => zhActor(value) },
          { title: '银行科目', dataIndex: 'bankAccountCode', width: 110 },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '应收核销记录'}
        loading={loading}
        dataSource={settlements}
        columns={[
          { title: '核销单号', dataIndex: 'settlementNo', width: 170 },
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '收款单', dataIndex: 'customerReceiptNo', width: 160, render: (value: string) => value ?? '-' },
          { title: '冲抵应付', dataIndex: 'nettingSourceNo', width: 150, render: (value: string) => value ?? '-' },
          { title: '类型', dataIndex: 'settlementType', width: 140 },
          { title: '核销金额', dataIndex: 'settledAmount', width: 120, align: 'right', render: money },
          { title: '差额', dataIndex: 'differenceAmount', width: 110, align: 'right', render: money },
          {
            title: '凭证草稿',
            dataIndex: 'voucherDraft',
            render: (voucherDraft: ArSettlement['voucherDraft']) =>
              voucherDraft?.lines?.map((line) => `${line.accountCode} 借${money(line.debit)} 贷${money(line.credit)}`).join(' / ') ?? '-',
          },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          { title: '经办人', dataIndex: 'createdBy', width: 120, render: (value: string) => zhActor(value) },
        ]}
      />

      <Modal title={receiptType === 'receipt' ? '生成收款单' : '登记预收款'} open={Boolean(selectedCustomerId)} onOk={createReceipt} onCancel={() => setSelectedCustomerId(null)}>
        <div style={{ display: 'grid', gap: 12, width: '100%' }}>
          <span>{receiptType === 'receipt' ? selectedReceivable?.sourceNo : selectedCustomerId}</span>
          <InputNumber min={0.01} precision={2} value={amount} onChange={(value) => setAmount(Number(value ?? 0))} style={{ width: '100%' }} />
        </div>
      </Modal>

      <Modal title="创建应收核销" open={Boolean(selectedSettlementReceivable)} onOk={createSettlement} onCancel={() => setSelectedSettlementReceivable(null)} width={680}>
        <div style={{ display: 'grid', gap: 12, width: '100%' }}>
          <span>{selectedSettlementReceivable?.sourceNo}</span>
          <Select
            value={settlementType}
            onChange={setSettlementType}
            options={[
              { value: 'receipt_to_bill', label: '收款核销应收' },
              { value: 'prepayment_to_bill', label: '预收核销应收' },
              { value: 'credit_note_to_bill', label: '红字核销' },
              { value: 'refund', label: '退款' },
              { value: 'ar_ap_netting', label: 'AR/AP Netting' },
            ]}
          />
          <Select allowClear placeholder="选择收款单或预收款" value={customerReceiptId} onChange={setCustomerReceiptId} options={receiptOptions} />
          <Select allowClear placeholder="选择应付冲抵单据" value={nettingCounterpartyLedgerEntryId} onChange={setNettingCounterpartyLedgerEntryId} options={payableOptions} />
          <Space wrap>
            <InputNumber min={0.01} precision={2} value={settlementAmount} onChange={(value) => setSettlementAmount(Number(value ?? 0))} addonBefore="核销金额" />
            <InputNumber min={0} precision={2} value={differenceAmount} onChange={(value) => setDifferenceAmount(Number(value ?? 0))} addonBefore="差额" />
          </Space>
          <Input placeholder="差额原因" value={differenceReason} onChange={(event) => setDifferenceReason(event.target.value)} />
        </div>
      </Modal>
    </div>
  );
};
