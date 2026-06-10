import React, { useCallback, useEffect, useState } from 'react';
import { Button, InputNumber, Modal, Table, Tag, message } from 'antd';
import { PayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
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
  const [receipts, setReceipts] = useState<CustomerReceipt[]>([]);
  const [plans, setPlans] = useState<CollectionPlan[]>([]);
  const [creditExposures, setCreditExposures] = useState<CreditExposure[]>([]);
  const [selectedReceivable, setSelectedReceivable] = useState<ReceivableEntry | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [receiptType, setReceiptType] = useState<'receipt' | 'prepayment'>('receipt');
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) {
      setReceivables([]);
      setReceipts([]);
      setPlans([]);
      setCreditExposures([]);
      return;
    }
    setLoading(true);
    try {
      const [ledgerRows, receiptRows, planRows, exposureRows] = await Promise.all([
        api.get(`/counterparty-ledger?accountSetId=${currentAccountSetId}&direction=ar&status=open`),
        api.get(`/customer-receipts?accountSetId=${currentAccountSetId}`),
        api.get(`/collection-plans?accountSetId=${currentAccountSetId}`),
        api.get(`/credit-exposures?accountSetId=${currentAccountSetId}`),
      ]);
      setReceivables(ledgerRows ?? []);
      setReceipts(receiptRows ?? []);
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
            width: 110,
            render: (_, record) => (
              <Button size="small" icon={<PayCircleOutlined />} onClick={() => openReceipt(record)}>
                收款
              </Button>
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

      <Modal title={receiptType === 'receipt' ? '生成收款单' : '登记预收款'} open={Boolean(selectedCustomerId)} onOk={createReceipt} onCancel={() => setSelectedCustomerId(null)}>
        <div style={{ display: 'grid', gap: 12, width: '100%' }}>
          <span>{receiptType === 'receipt' ? selectedReceivable?.sourceNo : selectedCustomerId}</span>
          <InputNumber min={0.01} precision={2} value={amount} onChange={(value) => setAmount(Number(value ?? 0))} style={{ width: '100%' }} />
        </div>
      </Modal>
    </div>
  );
};
