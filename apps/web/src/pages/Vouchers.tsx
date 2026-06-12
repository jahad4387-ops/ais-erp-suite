import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Descriptions, Dropdown, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import type { MenuProps } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { displayActorName, displayVoucherNo } from '../display';
import { zhAction, zhActor, zhStatus } from '../i18n';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';

const VoucherAttachments: React.FC<{ voucherId: string; voucherStatus: string; currentUser: string }> = ({
  voucherId,
  voucherStatus,
  currentUser,
}) => {
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/vouchers/${voucherId}/attachments`);
      setAttachments(data || []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [voucherId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleDelete = async (attachmentId: string) => {
    try {
      await api.delete(`/attachments/${attachmentId}`, { deletedBy: currentUser });
      message.success('附件已删除');
      fetchAttachments();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <Table
      data-testid="voucher-attachments"
      dataSource={attachments}
      rowKey="id"
      pagination={false}
      loading={loading}
      size="small"
      columns={[
        { title: '文件名', dataIndex: 'filename' },
        { title: '类型', dataIndex: 'contentType' },
        { title: '大小', dataIndex: 'byteSize' },
        { title: '状态', dataIndex: 'status', render: (status: string) => <Tag>{zhStatus(status)}</Tag> },
        {
          title: '操作',
          key: 'actions',
          render: (_: any, record: any) =>
            voucherStatus === 'posted' ? (
              <Button size="small" disabled icon={<DeleteOutlined />}>
                删除
              </Button>
            ) : (
              <Popconfirm title="删除附件" description="确认删除该附件？" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            ),
        },
      ]}
    />
  );
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

function voucherActionAllowed(status: string, action: string) {
  if (action === 'copy') return true;
  if (action === 'submit' || action === 'void') return status === 'draft' || status === 'rejected';
  if (action === 'delete') return status === 'draft' || status === 'rejected' || status === 'submitted';
  if (action === 'post') return status === 'approved';
  if (action === 'reverse') return status === 'posted';
  return false;
}

function voucherFromActionResult(result: any) {
  return result?.voucher ?? (result?.id ? result : null);
}

const VoucherStatusLogs: React.FC<{ voucherId: string }> = ({ voucherId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStatusLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/vouchers/${voucherId}/status-logs`);
      setLogs(data || []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [voucherId]);

  useEffect(() => {
    fetchStatusLogs();
  }, [fetchStatusLogs]);

  return (
    <Table
      data-testid="voucher-status-logs"
      dataSource={logs}
      rowKey="id"
      pagination={false}
      loading={loading}
      size="small"
      columns={[
        { title: '动作', dataIndex: 'action', render: (value: string) => zhAction(value) },
        { title: '原状态', dataIndex: 'fromStatus', render: (value: string | null) => zhStatus(value) },
        { title: '新状态', dataIndex: 'toStatus', render: (value: string | null) => zhStatus(value) },
        { title: '操作人', dataIndex: 'actorId', render: (value: string) => zhActor(value) },
        { title: '原因', dataIndex: 'reason', render: (value: string | null) => value ?? '-' },
      ]}
    />
  );
};

export const Vouchers: React.FC = () => {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [periods, setPeriods] = useState<PeriodRecord[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>();
  const [periodFilter, setPeriodFilter] = useState<number>();
  const [makerFilter, setMakerFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const actionInFlightRef = useRef<string | null>(null);
  const fetchSequenceRef = useRef(0);
  const { currentAccountSetId, currentPeriod, currentUser, currentUsername, currentUserName, currentYear, setCurrentAccountSet } = useAppContext();

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
    } catch (e: any) {
      if (requestId !== fetchSequenceRef.current) return;
      message.error(e.message);
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

  const currentAccountSetVouchers = useMemo(
    () => vouchers.filter((voucher) => !currentAccountSetId || voucher.accountSetId === currentAccountSetId),
    [currentAccountSetId, vouchers],
  );

  const handleAction = async (id: string, action: string) => {
    try {
      const payload: any = {};
      // Simple actor mapping for demo MVP
      if (action === 'submit') payload.submittedBy = 'system';
      if (action === 'post') payload.postedBy = 'accountant';
      if (action === 'void') payload.voidedBy = 'system';
      if (action === 'reverse') {
        payload.reversedBy = 'system';
        payload.voucherDate = new Date().toISOString().split('T')[0];
        payload.fiscalYear = new Date().getFullYear();
        payload.periodNo = 1; // MVP hardcoded
      }
      if (action === 'copy') {
        payload.copiedBy = currentUser;
        payload.voucherDate = new Date().toISOString().split('T')[0];
      }

      if (action === 'delete') {
        await api.delete(`/vouchers/${id}`, { deletedBy: currentUser });
      } else {
        await api.post(`/vouchers/${id}/${action}`, payload);
      }
      message.success(`凭证操作成功！`);
      await fetchVouchers();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  void handleAction;

  const handleVoucherAction = async (id: string, action: string) => {
    const loadingKey = `${id}:${action}`;
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = loadingKey;
    setActionLoadingKey(loadingKey);

    try {
      const voucher = vouchers.find((item) => item.id === id);
      if (voucher && !isVoucherPeriodOpen(voucher)) {
        message.error('期间未开放，不能执行该操作');
        await fetchVouchers();
        return;
      }
      if (voucher && !voucherActionAllowed(voucher.status, action)) {
        message.error('凭证状态已变化，请刷新后重试');
        await fetchVouchers();
        return;
      }

      const payload: any = {};
      if (action === 'submit') payload.submittedBy = currentUser;
      if (action === 'post') payload.postedBy = currentUser;
      if (action === 'void') payload.voidedBy = currentUser;
      if (action === 'reverse') {
        payload.reversedBy = currentUser;
        payload.voucherDate = new Date().toISOString().split('T')[0];
        payload.fiscalYear = currentYear;
        payload.periodNo = currentPeriod;
      }
      if (action === 'copy') {
        payload.copiedBy = currentUser;
        payload.voucherDate = new Date().toISOString().split('T')[0];
      }

      const result =
        action === 'delete'
          ? await api.delete(`/vouchers/${id}`, { deletedBy: currentUser })
          : await api.post(`/vouchers/${id}/${action}`, payload);
      const updatedVoucher = voucherFromActionResult(result);
      if (updatedVoucher?.id) {
        setVouchers((current) =>
          current.some((item) => item.id === updatedVoucher.id)
            ? current.map((item) => (item.id === updatedVoucher.id ? updatedVoucher : item))
            : [updatedVoucher, ...current],
        );
      }
      message.success('凭证操作成功');
      await fetchVouchers();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      actionInFlightRef.current = null;
      setActionLoadingKey(null);
    }
  };

  const handleBatchPost = async () => {
    const selectedApprovedVouchers = currentAccountSetVouchers.filter(
      (voucher) => selectedVoucherIds.includes(voucher.id) && voucher.status === 'approved' && isVoucherPeriodOpen(voucher)
    );
    if (selectedApprovedVouchers.length === 0) {
      message.error('请选择已审核凭证进行批量记账');
      return;
    }
    const firstVoucher = selectedApprovedVouchers[0];

    try {
      await api.post('/posting/post-batch', {
        accountSetId: firstVoucher.accountSetId || currentAccountSetId,
        fiscalYear: firstVoucher.fiscalYear || currentYear,
        periodNo: firstVoucher.periodNo || currentPeriod,
        voucherIds: selectedApprovedVouchers.map((voucher) => voucher.id),
        postedBy: currentUser,
      });
      message.success(`批量记账完成：${selectedApprovedVouchers.length} 张凭证`);
      setSelectedVoucherIds([]);
      await fetchVouchers();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleSeedData = async () => {
    setLoading(true);
    try {
      // 1. Create Account Set
      const accountSet = await api.post('/account-sets', {
        code: `DEMO-${Date.now()}`,
        name: '演示账套',
        companyName: '演示科技有限公司',
        baseCurrency: 'CNY',
        accountingStandard: '小企业会计准则',
        startYear: new Date().getFullYear(),
        startPeriod: 1,
      });

      // 2. Generate Periods
      await api.post(`/account-sets/${accountSet.id}/periods/generate`);
      setCurrentAccountSet(accountSet.id, accountSet.name, accountSet.companyName);

      // 3. Create Accounts
      await api.post('/accounts', {
        code: '1002', name: '银行存款', accountType: 'asset', normalBalance: 'debit', isLeaf: true, isBank: true
      });
      await api.post('/accounts', {
        code: '6602', name: '管理费用-办公费', accountType: 'expense', normalBalance: 'debit', isLeaf: true
      });

      // 4. Create Voucher
      await api.post('/vouchers', {
        accountSetId: accountSet.id,
        fiscalYear: new Date().getFullYear(),
        periodNo: 1,
        voucherDate: new Date().toISOString().split('T')[0],
        createdBy: 'demo-user',
        lines: [
          { summary: '购买办公用品', accountCode: '6602', debit: 500, credit: 0 },
          { summary: '银行付款', accountCode: '1002', debit: 0, credit: 500 }
        ]
      });

      message.success('测试数据生成成功！');
      fetchVouchers();
    } catch (e: any) {
      message.error(`生成数据失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '凭证号',
      dataIndex: 'voucherNo',
      key: 'voucherNo',
      render: (_value: string | null, record: any) =>
        record.status === 'draft' || record.status === 'rejected' ? (
          <Link to={`/vouchers/${record.id}/edit`}>{displayVoucherNo(record)}</Link>
        ) : (
          displayVoucherNo(record)
        ),
    },
    { title: '日期', dataIndex: 'voucherDate', key: 'voucherDate' },
    { title: '年度', dataIndex: 'fiscalYear', key: 'fiscalYear' },
    { title: '期间', dataIndex: 'periodNo', key: 'periodNo' },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        let text = status;
        if (status === 'posted') { color = 'green'; text = '已记账'; }
        if (status === 'approved') { color = 'cyan'; text = '已审核'; }
        if (status === 'rejected') { color = 'red'; text = '已驳回'; }
        if (status === 'voided') { color = 'red'; text = '已作废'; }
        if (status === 'submitted') { color = 'blue'; text = '已提交'; }
        if (status === 'draft') { text = '草稿'; }
        return <Tag color={color}>{text}</Tag>;
      }
    },
    { title: '制单人', dataIndex: 'createdBy', key: 'createdBy', render: (value: string) => displayMaker(value) },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => {
        const items: MenuProps['items'] = [];
        if (!isVoucherPeriodOpen(record)) {
          return <span>期间未开放</span>;
        }
        items.push({ key: 'copy', label: '复制' });
        
        if (record.status === 'draft' || record.status === 'rejected') {
          items.push({ key: 'submit', label: '提交' });
          items.push({ key: 'void', label: '作废', danger: true });
        }
        if (record.status === 'draft' || record.status === 'rejected' || record.status === 'submitted') {
          items.push({ key: 'delete', label: '删除', danger: true });
        }
        if (record.status === 'approved') {
          items.push({ key: 'post', label: '记账' });
        }
        if (record.status === 'posted') {
          items.push({ key: 'reverse', label: '红字冲销', danger: true });
        }

        return (
          <Space size="middle">
            <AgentDraftEntryButton
              size="small"
              draftType="voucher"
              sourceObjectType="voucher"
              sourceObjectId={record.id}
              userInstruction={`Generate voucher draft from ${record.voucherNo ?? record.id}.`}
            >
              Agent
            </AgentDraftEntryButton>
            {items.length > 0 ? (
              <Dropdown
                menu={{ items, onClick: (e) => handleVoucherAction(record.id, e.key) }}
                disabled={actionLoadingKey?.startsWith(`${record.id}:`) ?? false}
              >
                <Button type="link">操作</Button>
              </Dropdown>
            ) : (
              <span>无可用操作</span>
            )}
          </Space>
        );
      },
    },
  ];

  const filteredVouchers = currentAccountSetVouchers.filter((voucher) => {
    const matchesStatus = !statusFilter || voucher.status === statusFilter;
    const matchesPeriod = !periodFilter || voucher.periodNo === periodFilter;
    const makerName = displayMaker(voucher.createdBy);
    const matchesMaker =
      !makerFilter ||
      voucher.createdBy?.toLowerCase().includes(makerFilter.toLowerCase()) ||
      makerName.toLowerCase().includes(makerFilter.toLowerCase());
    const matchesAccount =
      !accountFilter ||
      voucher.lines?.some((line: any) => String(line.accountCode).includes(accountFilter) || line.summary?.includes(accountFilter));

    return matchesStatus && matchesPeriod && matchesMaker && matchesAccount;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>凭证管理</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="voucher"
            sourceObjectType="voucher_page"
            userInstruction="根据发票、流水、合同或上传附件生成记账凭证候选草稿"
          >
            Agent 凭证草稿
          </AgentDraftEntryButton>
          <Button>
            <Link to="/vouchers/new">录入凭证</Link>
          </Button>
          <Button
            data-testid="voucher-batch-post"
            onClick={handleBatchPost}
            disabled={selectedVoucherIds.length === 0}
          >
            批量记账
          </Button>
          <Button onClick={handleSeedData} type="primary">生成测试数据</Button>
        </Space>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 140 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'draft', label: '草稿' },
            { value: 'submitted', label: '已提交' },
            { value: 'approved', label: '已审核' },
            { value: 'posted', label: '已记账' },
            { value: 'rejected', label: '已驳回' },
            { value: 'voided', label: '已作废' },
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
        <Input placeholder="科目/摘要" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} />
      </Space>

      <Table 
        dataSource={filteredVouchers} 
        columns={columns} 
        rowKey="id" 
        loading={loading}
        rowSelection={{
          selectedRowKeys: selectedVoucherIds,
          onChange: (keys) => setSelectedVoucherIds(keys.map(String)),
          getCheckboxProps: (record: any) => ({
            disabled: record.status !== 'approved' || !isVoucherPeriodOpen(record),
          }),
        }}
        expandable={{
          expandedRowRender: record => (
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Table
                dataSource={record.lines}
                rowKey="lineNo"
                pagination={false}
                size="small"
                columns={[
                  { title: '行号', dataIndex: 'lineNo' },
                  { title: '摘要', dataIndex: 'summary' },
                  { title: '科目编码', dataIndex: 'accountCode' },
                  { title: '借方金额', dataIndex: 'debit', render: val => val > 0 ? val : '' },
                  { title: '贷方金额', dataIndex: 'credit', render: val => val > 0 ? val : '' },
                ]}
              />
              <Descriptions size="small" bordered column={2}>
                <Descriptions.Item label="附件">{record.attachmentCount ?? 0} 个附件</Descriptions.Item>
                <Descriptions.Item label="审批记录">
                  {record.submittedBy ? `提交：${displayMaker(record.submittedBy)}` : '尚未提交'}
                  {record.approvedBy ? ` / 审核：${displayMaker(record.approvedBy)}` : ''}
                </Descriptions.Item>
                <Descriptions.Item label="来源链路">
                  {zhStatus(record.sourceType ?? 'manual')} / {record.aiDraftId ?? record.id}
                </Descriptions.Item>
              </Descriptions>
              <VoucherStatusLogs voucherId={record.id} />
              <VoucherAttachments voucherId={record.id} voucherStatus={record.status} currentUser={currentUser} />
            </Space>
          )
        }}
      />
    </div>
  );
};
