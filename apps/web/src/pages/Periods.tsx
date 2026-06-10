import React, { useCallback, useEffect, useState } from 'react';
import { Button, Space, Table, Tag, message } from 'antd';
import { CalculatorOutlined, CheckCircleOutlined, LockOutlined, ReloadOutlined, UnlockOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhStatus } from '../i18n';

type PeriodRecord = {
  id: string;
  accountSetId: string;
  fiscalYear: number;
  periodNo: number;
  status: 'unopened' | 'open' | 'closed' | 'locked';
  isCurrent?: boolean;
};

const statusColor: Record<string, string> = {
  unopened: 'default',
  open: 'green',
  closed: 'blue',
  locked: 'red',
};

export const Periods: React.FC = () => {
  const [periods, setPeriods] = useState<PeriodRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentAccountSetId, currentUser, setCurrentPeriod } = useAppContext();

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const data = currentAccountSetId ? await api.get(`/account-sets/${currentAccountSetId}/periods`) : await api.get('/periods');
      setPeriods(data || []);
      const currentPeriodRecord = data?.find((period: PeriodRecord) => period.isCurrent);
      if (currentPeriodRecord) {
        setCurrentPeriod(currentPeriodRecord.fiscalYear, currentPeriodRecord.periodNo);
      }
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, setCurrentPeriod]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const handleAction = async (periodId: string, action: 'open' | 'close' | 'lock' | 'set-current') => {
    const actorField: Record<typeof action, string> = {
      open: 'openedBy',
      close: 'closedBy',
      lock: 'lockedBy',
      'set-current': 'setBy',
    };
    try {
      const updatedPeriod = await api.post(`/periods/${periodId}/${action}`, {
        [actorField[action]]: currentUser,
      });
      if (action === 'set-current') {
        setCurrentPeriod(updatedPeriod.fiscalYear, updatedPeriod.periodNo);
      }
      message.success('期间状态已更新');
      fetchPeriods();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleCarryForward = async (record: PeriodRecord) => {
    try {
      await api.post('/close/profit-loss-carry-forward', {
        accountSetId: record.accountSetId,
        fiscalYear: record.fiscalYear,
        periodNo: record.periodNo,
        voucherDate: `${record.fiscalYear}-${String(record.periodNo).padStart(2, '0')}-28`,
        profitLossAccountCode: '3103',
        createdBy: currentUser,
      });
      message.success('损益结转凭证草稿已生成');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>会计期间</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchPeriods}>
          刷新
        </Button>
      </div>

      <Table
        data-testid="periods-table"
        dataSource={periods}
        rowKey="id"
        loading={loading}
        columns={[
          { title: '会计年度', dataIndex: 'fiscalYear' },
          { title: '期间', dataIndex: 'periodNo' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: PeriodRecord['status']) => <Tag color={statusColor[status]}>{zhStatus(status)}</Tag>,
          },
          {
            title: '当前期间',
            dataIndex: 'isCurrent',
            render: (value: boolean) => (value ? <Tag color="purple">当前</Tag> : '-'),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, record: PeriodRecord) => (
              <Space wrap>
                {record.status !== 'open' && record.status !== 'locked' ? (
                  <Button size="small" icon={<UnlockOutlined />} onClick={() => handleAction(record.id, 'open')}>
                    打开
                  </Button>
                ) : null}
                {record.status === 'open' ? (
                  <Button size="small" icon={<CalculatorOutlined />} onClick={() => handleCarryForward(record)}>
                    生成损益结转
                  </Button>
                ) : null}
                {record.status === 'open' ? (
                  <Button size="small" onClick={() => handleAction(record.id, 'close')}>
                    关闭
                  </Button>
                ) : null}
                {record.status !== 'locked' ? (
                  <Button size="small" danger icon={<LockOutlined />} onClick={() => handleAction(record.id, 'lock')}>
                    锁定
                  </Button>
                ) : null}
                {record.status === 'open' && !record.isCurrent ? (
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleAction(record.id, 'set-current')}>
                    设为当前
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
};
