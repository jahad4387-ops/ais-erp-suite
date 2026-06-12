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

const statusLabel: Record<string, string> = {
  draft: '草稿',
  generated: '已生成',
  approved: '已审核',
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
        <h2 style={{ margin: 0 }}>成本凭证草稿</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<FileDoneOutlined />} onClick={createDraft}>生成草稿</Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        description="成本凭证草稿生成后需要人工复核，后续可接入正式过账流程。"
      />
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="costAllocationId" rules={[{ required: true }]}>
          <Input style={{ width: 320 }} placeholder="已提交成本分摊ID" />
        </Form.Item>
        <Form.Item name="fiscalYear" rules={[{ required: true }]}><InputNumber placeholder="年度" /></Form.Item>
        <Form.Item name="periodNo" rules={[{ required: true }]}><InputNumber min={1} max={12} placeholder="期间" /></Form.Item>
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
                { title: '行号', dataIndex: 'lineNo' },
                { title: '摘要', dataIndex: 'summary' },
                { title: '科目', dataIndex: 'accountCode' },
                { title: '借方', dataIndex: 'debit' },
                { title: '贷方', dataIndex: 'credit' },
                { title: '金额', dataIndex: 'amount' },
              ]}
            />
          ),
        }}
        columns={[
          { title: '工单', dataIndex: 'workOrderNo' },
          { title: '分摊单', dataIndex: 'costAllocationId' },
          { title: '期间', render: (_, row) => `${row.fiscalYear}-${String(row.periodNo).padStart(2, '0')}` },
          { title: '合计', dataIndex: 'totalAmount' },
          { title: '状态', render: (_, row) => statusLabel[row.status] ?? row.status },
          {
            title: '审批',
            render: (_, row) => (row.approvalRequired ? <Tag color="orange">需审批</Tag> : <Tag color="green">已通过</Tag>),
          },
          {
            title: '提示',
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
