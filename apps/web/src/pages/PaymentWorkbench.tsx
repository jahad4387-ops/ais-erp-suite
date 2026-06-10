import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, InputNumber, Modal, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, LockOutlined, PayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhActor, zhStatus } from '../i18n';

type PayableEntry = {
  id: string;
  partnerId: string;
  partnerName?: string;
  sourceNo: string;
  documentDate: string;
  dueDate?: string;
  remainingAmount: number;
  isPaymentBlocked?: boolean;
  paymentBlockReason?: string;
};

type PaymentRequest = {
  id: string;
  requestNo: string;
  supplierId: string;
  supplierName?: string;
  sourceNo?: string;
  requestDate: string;
  plannedPaymentDate?: string;
  requestedAmount: number;
  status: string;
  requestedBy: string;
  approvedBy?: string;
  paymentMethod?: string;
  bankAccountCode: string;
};

type SupplierPayment = {
  id: string;
  paymentNo: string;
  paymentRequestNo?: string;
  supplierName?: string;
  sourceNo?: string;
  paymentDate: string;
  paidAmount: number;
  status: string;
  paidBy: string;
  bankAccountCode: string;
};

const money = (value: number) => Number(value ?? 0).toFixed(2);

export const PaymentWorkbench: React.FC = () => {
  const { currentAccountSetId, currentUser } = useAppContext();
  const [payables, setPayables] = useState<PayableEntry[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [selectedPayable, setSelectedPayable] = useState<PayableEntry | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [requestAmount, setRequestAmount] = useState<number>(0);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [blockReason, setBlockReason] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) {
      setPayables([]);
      setPaymentRequests([]);
      setSupplierPayments([]);
      return;
    }
    setLoading(true);
    try {
      const [ledgerRows, requestRows, paymentRows] = await Promise.all([
        api.get(`/counterparty-ledger?accountSetId=${currentAccountSetId}&direction=ap&status=open`),
        api.get(`/payment-requests?accountSetId=${currentAccountSetId}`),
        api.get(`/supplier-payments?accountSetId=${currentAccountSetId}`),
      ]);
      setPayables(ledgerRows ?? []);
      setPaymentRequests(requestRows ?? []);
      setSupplierPayments(paymentRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openRequestModal = (payable: PayableEntry) => {
    setSelectedPayable(payable);
    setRequestAmount(Number(payable.remainingAmount ?? 0));
  };

  const createPaymentRequest = async () => {
    if (!currentAccountSetId || !selectedPayable) return;
    try {
      await api.post('/payment-requests', {
        accountSetId: currentAccountSetId,
        counterpartyLedgerEntryId: selectedPayable.id,
        requestDate: new Date().toISOString().slice(0, 10),
        requestedAmount: requestAmount,
        requestedBy: currentUser,
        paymentMethod: 'bank_transfer',
        bankAccountCode: '1002',
      });
      message.success('付款申请已提交');
      setSelectedPayable(null);
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const approvePaymentRequest = async (request: PaymentRequest) => {
    try {
      await api.post(`/payment-requests/${request.id}/approve`, {
        approvedBy: currentUser,
        approvalComment: '同意付款',
      });
      message.success('付款申请已审批');
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const openPaymentModal = (request: PaymentRequest) => {
    setSelectedRequest(request);
    setPaymentAmount(Number(request.requestedAmount ?? 0));
  };

  const createSupplierPayment = async () => {
    if (!currentAccountSetId || !selectedRequest) return;
    try {
      await api.post('/supplier-payments', {
        accountSetId: currentAccountSetId,
        paymentRequestId: selectedRequest.id,
        paymentDate: new Date().toISOString().slice(0, 10),
        paidAmount: paymentAmount,
        paidBy: currentUser,
        bankAccountCode: selectedRequest.bankAccountCode,
      });
      message.success('付款单已生成');
      setSelectedRequest(null);
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const blockPayment = async (payable: PayableEntry) => {
    try {
      await api.post(`/counterparty-ledger/${payable.id}/block-payment`, {
        blockedBy: currentUser,
        paymentBlockReason: blockReason || '付款资料待复核',
      });
      message.success('已冻结付款');
      setBlockReason('');
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>付款申请工作台</h2>
        <Space wrap>
          <Input
            placeholder="冻结原因"
            value={blockReason}
            onChange={(event) => setBlockReason(event.target.value)}
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        title={() => '待付款队列'}
        loading={loading}
        dataSource={payables}
        columns={[
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '供应商', dataIndex: 'partnerName', render: (value: string, record) => value ?? record.partnerId },
          { title: '业务日期', dataIndex: 'documentDate', width: 120 },
          { title: '到期日', dataIndex: 'dueDate', width: 120, render: (value: string) => value ?? '-' },
          { title: '未付金额', dataIndex: 'remainingAmount', width: 120, align: 'right', render: money },
          {
            title: '冻结',
            dataIndex: 'isPaymentBlocked',
            width: 170,
            render: (isPaymentBlocked: boolean, record) =>
              isPaymentBlocked ? <Tag color="red">{record.paymentBlockReason ?? '已冻结'}</Tag> : <Tag color="green">可付款</Tag>,
          },
          {
            title: '操作',
            width: 210,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<PayCircleOutlined />} disabled={record.isPaymentBlocked} onClick={() => openRequestModal(record)}>
                  申请
                </Button>
                <Button size="small" icon={<LockOutlined />} onClick={() => blockPayment(record)}>
                  冻结
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '付款申请'}
        loading={loading}
        dataSource={paymentRequests}
        columns={[
          { title: '申请单号', dataIndex: 'requestNo', width: 170 },
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '供应商', dataIndex: 'supplierName', render: (value: string, record) => value ?? record.supplierId },
          { title: '申请日期', dataIndex: 'requestDate', width: 120 },
          { title: '申请金额', dataIndex: 'requestedAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          { title: '申请人', dataIndex: 'requestedBy', width: 120, render: (value: string) => zhActor(value) },
          {
            title: '操作',
            width: 220,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<CheckOutlined />} disabled={record.status !== 'pending_approval'} onClick={() => approvePaymentRequest(record)}>
                  审批
                </Button>
                <Button size="small" icon={<PayCircleOutlined />} disabled={record.status !== 'approved'} onClick={() => openPaymentModal(record)}>
                  付款
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Table
        rowKey="id"
        title={() => '付款单'}
        loading={loading}
        dataSource={supplierPayments}
        columns={[
          { title: '付款单号', dataIndex: 'paymentNo', width: 160 },
          { title: '申请单号', dataIndex: 'paymentRequestNo', width: 170 },
          { title: '来源单据', dataIndex: 'sourceNo', width: 150 },
          { title: '供应商', dataIndex: 'supplierName' },
          { title: '付款日期', dataIndex: 'paymentDate', width: 120 },
          { title: '付款金额', dataIndex: 'paidAmount', width: 120, align: 'right', render: money },
          { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{zhStatus(value)}</Tag> },
          { title: '付款人', dataIndex: 'paidBy', width: 120, render: (value: string) => zhActor(value) },
          { title: '银行科目', dataIndex: 'bankAccountCode', width: 110 },
        ]}
      />

      <Modal title="提交付款申请" open={Boolean(selectedPayable)} onOk={createPaymentRequest} onCancel={() => setSelectedPayable(null)}>
        <div style={{ display: 'grid', gap: 12, width: '100%' }}>
          <span>{selectedPayable?.sourceNo}</span>
          <InputNumber min={0.01} precision={2} value={requestAmount} onChange={(value) => setRequestAmount(Number(value ?? 0))} style={{ width: '100%' }} />
        </div>
      </Modal>

      <Modal title="生成付款单" open={Boolean(selectedRequest)} onOk={createSupplierPayment} onCancel={() => setSelectedRequest(null)}>
        <div style={{ display: 'grid', gap: 12, width: '100%' }}>
          <span>{selectedRequest?.requestNo}</span>
          <InputNumber min={0.01} precision={2} value={paymentAmount} onChange={(value) => setPaymentAmount(Number(value ?? 0))} style={{ width: '100%' }} />
        </div>
      </Modal>
    </div>
  );
};
