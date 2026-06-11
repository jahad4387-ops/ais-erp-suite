import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Table, Tag, Typography } from 'antd';
import { CheckOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type ReportApprovalException = {
  id?: string;
  exceptionCode: string;
  severity: string;
  highlight: string;
  message: string;
  accountCode?: string | null;
  voucherId?: string | null;
  amount?: number;
};

type ReportApproval = {
  id: string;
  reportRunId: string;
  status: string;
  submittedBy: string;
  submittedAt: string;
  approvedBy?: string | null;
  reviewComment?: string | null;
  exceptionCount: number;
  exceptions: ReportApprovalException[];
  reportRun?: { id: string; status: string; snapshotHash: string };
};

const { Text, Title } = Typography;

export const ReportApprovals: React.FC = () => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [rows, setRows] = useState<ReportApproval[]>([]);
  const [selected, setSelected] = useState<ReportApproval | null>(null);
  const [blockingExceptions, setBlockingExceptions] = useState<ReportApprovalException[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const approvals = await api.get(`/report-approvals?accountSetId=${currentAccountSetId}`);
      setRows(approvals ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const submitReview = async () => {
    const values = await form.validateFields(['reportRunId', 'reviewComment']);
    setBlockingExceptions([]);
    try {
      const approval = await api.post(`/report-runs/${values.reportRunId}/submit-review`, {
        submittedBy: currentUser,
        reviewComment: values.reviewComment,
      });
      setSelected(approval);
      await fetchRows();
    } catch (error: any) {
      const exceptions = error?.data?.exceptions ?? [];
      setBlockingExceptions(exceptions);
      throw error;
    }
  };

  const approve = async (record: ReportApproval) => {
    const approval = await api.post(`/report-approvals/${record.id}/approve`, {
      approvedBy: currentUser,
      reviewComment: form.getFieldValue('approvalComment') ?? 'Approved and locked',
    });
    setSelected(approval);
    await fetchRows();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Report Approvals</Title>
          <Text type="secondary">Review queue, cash-flow assignment exceptions, approval opinions, and locked report snapshots.</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchRows} loading={loading}>Refresh</Button>
      </div>

      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="reportRunId" rules={[{ required: true }]}>
          <Input style={{ width: 300 }} placeholder="Report run id" />
        </Form.Item>
        <Form.Item name="reviewComment">
          <Input style={{ width: 300 }} placeholder="Submit comment" />
        </Form.Item>
        <Button type="primary" icon={<SendOutlined />} onClick={submitReview}>Submit Review</Button>
      </Form>

      {blockingExceptions.length > 0 && (
        <Alert
          type="error"
          showIcon
          title="未分配异常现金流"
          style={{ marginBottom: 16 }}
          description={blockingExceptions.map((item) => `${item.accountCode ?? '-'} ${item.voucherId ?? '-'} ${item.amount ?? 0}`).join(' / ')}
        />
      )}

      <Table
        rowKey="id"
        dataSource={rows}
        loading={loading}
        pagination={false}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
        columns={[
          { title: 'Approval id', dataIndex: 'id' },
          { title: 'Run', dataIndex: 'reportRunId' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: string) => <Tag color={status === 'approved' ? 'green' : 'blue'}>{status}</Tag>,
          },
          { title: 'Exceptions', dataIndex: 'exceptionCount' },
          { title: 'Submitted by', dataIndex: 'submittedBy' },
          {
            title: 'Action',
            render: (_, record) => (
              <Button size="small" icon={<CheckOutlined />} disabled={record.status !== 'pending'} onClick={() => approve(record)}>
                Approve + Lock
              </Button>
            ),
          },
        ]}
      />

      <Form form={form} layout="inline" style={{ marginTop: 16 }}>
        <Form.Item name="approvalComment">
          <Input style={{ width: 360 }} placeholder="Approval opinion" />
        </Form.Item>
      </Form>

      {selected && (
        <div style={{ marginTop: 16 }}>
          <Text strong>{selected.reportRun?.snapshotHash ?? selected.reportRunId}</Text>
          <Table
            rowKey={(record) => record.id ?? `${record.exceptionCode}:${record.voucherId}`}
            dataSource={selected.exceptions ?? []}
            pagination={false}
            size="small"
            columns={[
              { title: 'Highlight', dataIndex: 'highlight' },
              { title: 'Code', dataIndex: 'exceptionCode' },
              { title: 'Account', dataIndex: 'accountCode' },
              { title: 'Voucher', dataIndex: 'voucherId' },
              { title: 'Amount', dataIndex: 'amount' },
              { title: 'Message', dataIndex: 'message' },
            ]}
          />
        </div>
      )}
    </div>
  );
};
