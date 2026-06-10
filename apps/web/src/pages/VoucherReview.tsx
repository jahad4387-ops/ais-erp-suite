import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Select, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { displayActorName, displayVoucherNo } from '../display';
import { zhActor, zhStatus } from '../i18n';

type VoucherLine = {
  summary?: string;
  accountCode?: string;
  debit?: number;
  credit?: number;
};

type VoucherRecord = {
  id: string;
  voucherNo?: string;
  voucherDate: string;
  fiscalYear: number;
  periodNo: number;
  status: string;
  createdBy?: string;
  lines?: VoucherLine[];
};

type PeriodRecord = {
  accountSetId: string;
  fiscalYear: number;
  periodNo: number;
  status: string;
};

function voucherPeriodKey(voucher: { accountSetId?: string; fiscalYear?: number; periodNo?: number }) {
  return `${voucher.accountSetId ?? ''}:${voucher.fiscalYear ?? ''}:${voucher.periodNo ?? ''}`;
}

export const VoucherReview: React.FC = () => {
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [periods, setPeriods] = useState<PeriodRecord[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('submitted');
  const [periodFilter, setPeriodFilter] = useState<number>();
  const [makerFilter, setMakerFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [rejectReason, setRejectReason] = useState('需要修改');
  const [reviewActionLoading, setReviewActionLoading] = useState(false);
  const reviewActionInFlightRef = useRef(false);
  const fetchSequenceRef = useRef(0);
  const { currentAccountSetId, currentUser, currentUsername, currentUserName } = useAppContext();

  const fetchVouchers = useCallback(async () => {
    const requestId = ++fetchSequenceRef.current;
    setLoading(true);
    try {
      const [data, periodData, userData] = await Promise.all([
        api.get('/vouchers'),
        api.get(currentAccountSetId ? `/account-sets/${currentAccountSetId}/periods` : '/periods'),
        api.get('/users').catch(() => []),
      ]);
      if (requestId !== fetchSequenceRef.current) return;
      setVouchers([...(data || [])]);
      setPeriods([...(periodData || [])]);
      setUsers([...(userData || [])]);
    } catch (error: any) {
      if (requestId !== fetchSequenceRef.current) return;
      message.error(error.message);
    } finally {
      if (requestId === fetchSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const periodsByKey = useMemo(
    () => new Map(periods.map((period) => [`${period.accountSetId}:${period.fiscalYear}:${period.periodNo}`, period])),
    [periods],
  );

  const userNamesById = useMemo(() => {
    const names = new Map<string, string>();
    users.forEach((user) => {
      const name = user.name || user.username;
      names.set(user.id, name);
      names.set(user.username, name);
    });
    if (currentUser) {
      names.set(currentUser, currentUserName);
    }
    if (currentUsername) {
      names.set(currentUsername, currentUserName);
    }
    return names;
  }, [currentUser, currentUsername, currentUserName, users]);

  const displayMaker = useCallback(
    (actorId?: string | null) => displayActorName(actorId, userNamesById, actorId ? zhActor(actorId) : undefined),
    [userNamesById],
  );

  const isVoucherPeriodOpen = useCallback(
    (voucher: { accountSetId?: string; fiscalYear?: number; periodNo?: number }) =>
      periodsByKey.get(voucherPeriodKey(voucher))?.status === 'open',
    [periodsByKey],
  );

  const canReviewVoucher = useCallback(
    (voucher: VoucherRecord) =>
      Boolean(currentUser) &&
      voucher.status === 'submitted' &&
      isVoucherPeriodOpen(voucher) &&
      voucher.createdBy !== currentUser,
    [currentUser, isVoucherPeriodOpen],
  );

  const approveVoucher = async (voucherId: string) => {
    await api.post(`/vouchers/${voucherId}/approve`, { approvedBy: currentUser });
  };

  const rejectVoucher = async (voucherId: string) => {
    await api.post(`/vouchers/${voucherId}/reject`, { rejectedBy: currentUser, reason: rejectReason });
  };

  const handleBatchApprove = async () => {
    if (reviewActionInFlightRef.current) return;
    const submittedIds = selectedVoucherIds.filter((voucherId) =>
      vouchers.some((voucher) => voucher.id === voucherId && canReviewVoucher(voucher))
    );
    if (submittedIds.length === 0) {
      message.error('请先选择已提交且期间开放的凭证');
      return;
    }

    reviewActionInFlightRef.current = true;
    setReviewActionLoading(true);
    try {
      await Promise.all(submittedIds.map((voucherId) => approveVoucher(voucherId)));
      message.success(`已审核 ${submittedIds.length} 张凭证`);
      setSelectedVoucherIds([]);
      await fetchVouchers();
    } catch (error: any) {
      message.error(error.message);
      await fetchVouchers();
    } finally {
      reviewActionInFlightRef.current = false;
      setReviewActionLoading(false);
    }
  };

  const handleBatchReject = async () => {
    if (reviewActionInFlightRef.current) return;
    const submittedIds = selectedVoucherIds.filter((voucherId) =>
      vouchers.some((voucher) => voucher.id === voucherId && canReviewVoucher(voucher))
    );
    if (submittedIds.length === 0) {
      message.error('请先选择已提交且期间开放的凭证');
      return;
    }

    reviewActionInFlightRef.current = true;
    setReviewActionLoading(true);
    try {
      await Promise.all(submittedIds.map((voucherId) => rejectVoucher(voucherId)));
      message.success(`已驳回 ${submittedIds.length} 张凭证`);
      setSelectedVoucherIds([]);
      await fetchVouchers();
    } catch (error: any) {
      message.error(error.message);
      await fetchVouchers();
    } finally {
      reviewActionInFlightRef.current = false;
      setReviewActionLoading(false);
    }
  };

  const filteredVouchers = vouchers.filter((voucher) => {
    const matchesStatus = !statusFilter || voucher.status === statusFilter;
    const matchesPeriod = !periodFilter || voucher.periodNo === periodFilter;
    const makerName = displayMaker(voucher.createdBy);
    const matchesMaker =
      !makerFilter ||
      voucher.createdBy?.toLowerCase().includes(makerFilter.toLowerCase()) ||
      makerName.toLowerCase().includes(makerFilter.toLowerCase());
    const matchesAccount =
      !accountFilter ||
      voucher.lines?.some(
        (line) =>
          String(line.accountCode ?? '').includes(accountFilter) ||
          String(line.summary ?? '').toLowerCase().includes(accountFilter.toLowerCase())
      );

    return matchesStatus && matchesPeriod && matchesMaker && matchesAccount;
  });

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>审核工作台</h2>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchVouchers}>
            刷新
          </Button>
          <Button
            data-testid="voucher-review-batch-approve"
            type="primary"
            icon={<CheckOutlined />}
            loading={reviewActionLoading}
            disabled={selectedVoucherIds.length === 0 || reviewActionLoading}
            onClick={handleBatchApprove}
          >
            批量审核
          </Button>
          <Button
            data-testid="voucher-review-batch-reject"
            danger
            icon={<CloseOutlined />}
            loading={reviewActionLoading}
            disabled={selectedVoucherIds.length === 0 || reviewActionLoading}
            onClick={handleBatchReject}
          >
            批量驳回
          </Button>
        </Space>
      </div>

      <Space wrap>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 150 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'submitted', label: '已提交' },
            { value: 'approved', label: '已审核' },
            { value: 'rejected', label: '已驳回' },
            { value: 'draft', label: '草稿' },
          ]}
        />
        <Select
          allowClear
          placeholder="期间"
          style={{ width: 120 }}
          value={periodFilter}
          onChange={setPeriodFilter}
          options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((value) => ({ value, label: `第 ${value} 期` }))}
        />
        <Input placeholder="制单人" value={makerFilter} onChange={(event) => setMakerFilter(event.target.value)} />
        <Input
          placeholder="科目或摘要"
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
        />
        <Input
          placeholder="驳回原因"
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
        />
      </Space>

      <Table<VoucherRecord>
        dataSource={filteredVouchers}
        rowKey="id"
        loading={loading}
        rowSelection={{
          selectedRowKeys: selectedVoucherIds,
          onChange: (keys) => setSelectedVoucherIds(keys.map(String)),
          getCheckboxProps: (record) => ({
            disabled: !canReviewVoucher(record),
          }),
        }}
        columns={[
          { title: '凭证号', dataIndex: 'voucherNo', render: (_value?: string, record?: VoucherRecord) => displayVoucherNo(record) },
          { title: '日期', dataIndex: 'voucherDate' },
          { title: '年度', dataIndex: 'fiscalYear' },
          { title: '期间', dataIndex: 'periodNo' },
          { title: '制单人', dataIndex: 'createdBy', render: (value?: string) => displayMaker(value) },
          { title: '状态', dataIndex: 'status', render: (status: string) => <Tag>{zhStatus(status)}</Tag> },
          {
            title: '借方',
            key: 'debit',
            render: (_: unknown, record?: VoucherRecord) =>
              record?.lines?.reduce((sum, line) => sum + Number(line.debit ?? 0), 0) ?? 0,
          },
          {
            title: '贷方',
            key: 'credit',
            render: (_: unknown, record?: VoucherRecord) =>
              record?.lines?.reduce((sum, line) => sum + Number(line.credit ?? 0), 0) ?? 0,
          },
        ]}
      />
    </div>
  );
};
