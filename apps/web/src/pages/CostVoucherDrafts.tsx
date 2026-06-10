import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Space, Table, Tag, message } from 'antd';
import { FileDoneOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type CostVoucherDraftLine = {
  lineNo: number;
  summary: string;
  amount: number;
  debit: number;
  credit: number;
  direction: string;
  accountCode: string;
};

type CostVoucherDraft = {
  id: string;
  costAllocationId: string;
  workOrderNo: string;
  fiscalYear: number;
  periodNo: number;
  status: string;
  totalAmount: number;
  warningCodes: string[];
  approvalRequired: boolean;
  voucherDraft: { lines: CostVoucherDraftLine[] };
};

export const CostVoucherDrafts: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();
  const [drafts, setDrafts] = useState<CostVoucherDraft[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      setDrafts((await api.get(`/cost-voucher-drafts?accountSetId=${currentAccountSetId}`)) ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    form.setFieldsValue({ fiscalYear: currentYear, periodNo: currentPeriod });
    void fetchData();
  }, [currentPeriod, currentYear, fetchData, form]);

  const createDraft = async () => {
    const values = await form.validateFields();
    await api.post('/cost-voucher-drafts', {
      accountSetId: currentAccountSetId,
      costAllocationId: values.costAllocationId,
      fiscalYear: values.fiscalYear,
      periodNo: values.periodNo,
      createdBy: currentUser,
    });
    form.resetFields(['costAllocationId']);
    await fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Cost Voucher Drafts</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          <Button type="primary" icon={<FileDoneOutlined />} onClick={createDraft}>Create draft</Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        description="Drafts are generated for human review; approvalRequired remains true until Phase 4 posting workflow is connected."
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="costAllocationId" rules={[{ required: true }]}>
          <Input style={{ width: 320 }} placeholder="Committed cost allocation id" />
        </Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="Year" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="Period" /></Form.Item>
      </Form>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={drafts}
        expandable={{
          expandedRowRender: (draft) => (
            <Table
              rowKey="lineNo"
              pagination={false}
              dataSource={draft.voucherDraft?.lines ?? []}
              columns={[
                { title: 'Line', dataIndex: 'lineNo' },
                { title: 'Summary', dataIndex: 'summary' },
                { title: 'Account', dataIndex: 'accountCode' },
                { title: 'Debit', dataIndex: 'debit' },
                { title: 'Credit', dataIndex: 'credit' },
                { title: 'Amount', dataIndex: 'amount' },
              ]}
            />
          ),
        }}
        columns={[
          { title: 'Work order', dataIndex: 'workOrderNo' },
          { title: 'Allocation', dataIndex: 'costAllocationId' },
          { title: 'Period', render: (_, row) => `${row.fiscalYear}-${String(row.periodNo).padStart(2, '0')}` },
          { title: 'Total', dataIndex: 'totalAmount' },
          { title: 'Status', dataIndex: 'status' },
          {
            title: 'Approval',
            render: (_, row) => (row.approvalRequired ? <Tag color="orange">Required</Tag> : <Tag color="green">Cleared</Tag>),
          },
          {
            title: 'Warnings',
            render: (_, row) => (
              <Space wrap>
                {(row.warningCodes ?? []).map((code) => <Tag key={code} color="gold">{code}</Tag>)}
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
};
