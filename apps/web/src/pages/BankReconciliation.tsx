import React, { useEffect, useMemo, useState } from 'react';
import { Button, Col, Row, Table, Tag, Tooltip, Typography, message } from 'antd';
import { ApiOutlined, CheckCircleOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { zhStatus } from '../i18n';

const { Title, Text } = Typography;

type BankStatement = {
  id: string;
  accountSetId: string;
  bankAccountCode: string;
  transactionDate: string;
  description: string;
  amount: number;
  balance?: number | null;
  status: 'unreconciled' | 'reconciled';
};

type JournalEntry = {
  id: string;
  accountSetId: string;
  fiscalYear: number;
  periodNo: number;
  entryDate: string;
  accountCode: string;
  summary: string;
  debit: number;
  credit: number;
};

type ReconciliationRun = {
  id: string;
  accountSetId: string;
  fiscalYear: number;
  periodNo: number;
  status: string;
  matchedCount?: number;
};

export const BankReconciliation: React.FC = () => {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [accountSets, setAccountSets] = useState<any[]>([]);
  const [run, setRun] = useState<ReconciliationRun | null>(null);
  const [loading, setLoading] = useState(false);

  const bankEntries = useMemo(
    () => journalEntries.filter((entry) => entry.accountCode === '1002'),
    [journalEntries],
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statementRows, detailRows, accountSetRows] = await Promise.all([
        api.get('/ledger/bank-statements'),
        api.get('/ledger/detail-ledger'),
        api.get('/account-sets'),
      ]);
      setStatements(statementRows);
      setJournalEntries(detailRows);
      setAccountSets(accountSetRows);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const sampleContext = () => {
    const accountSetId = accountSets[0]?.id ?? journalEntries[0]?.accountSetId;
    const entry = journalEntries.find((item) => item.accountCode === '1002') ?? journalEntries[0];
    if (!accountSetId || !entry) {
      throw new Error('请先创建并记账一张银行凭证，再进行银行对账。');
    }
    return {
      accountSetId,
      fiscalYear: entry.fiscalYear,
      periodNo: entry.periodNo,
      transactionDate: entry.entryDate,
      amount: entry.debit - entry.credit,
    };
  };

  const importSampleStatement = async () => {
    try {
      const context = sampleContext();
      await api.post('/ledger/bank-statements/import', {
        accountSetId: context.accountSetId,
        bankAccountCode: '1002',
        importedBy: 'web-user',
        rows: [
          {
            transactionDate: context.transactionDate,
            description: '已记账凭证对应的银行付款',
            amount: context.amount,
            balance: 9500,
          },
        ],
      });
      message.success('银行流水已导入');
      fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const createRun = async () => {
    try {
      const context = sampleContext();
      const created = await api.post('/ledger/bank-reconciliations', {
        accountSetId: context.accountSetId,
        fiscalYear: context.fiscalYear,
        periodNo: context.periodNo,
        createdBy: 'web-user',
      });
      setRun(created);
      message.success('银行对账任务已创建');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const matchRun = async () => {
    if (!run) {
      message.warning('请先创建银行对账任务');
      return;
    }
    try {
      const matched = await api.post(`/ledger/bank-reconciliations/${run.id}/match`, { matchedBy: 'web-user' });
      setRun(matched);
      message.success(`已匹配 ${matched.matchedCount ?? 0} 行`);
      fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[12, 12]}>
        <Col>
          <Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
            银行对账
          </Title>
          <Text type="secondary">
            当前任务：{run ? `${zhStatus(run.status)} / 已匹配 ${run.matchedCount ?? 0} 行` : '暂无'}
          </Text>
        </Col>
        <Col>
          <Tooltip title="刷新">
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} />
          </Tooltip>
          <Button icon={<UploadOutlined />} onClick={importSampleStatement} style={{ marginLeft: 8 }}>
            导入流水
          </Button>
          <Button icon={<ApiOutlined />} onClick={createRun} style={{ marginLeft: 8 }}>
            创建任务
          </Button>
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={matchRun} style={{ marginLeft: 8 }}>
            自动匹配
          </Button>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Table
            title={() => '银行流水'}
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={statements}
            columns={[
              { title: '日期', dataIndex: 'transactionDate' },
              { title: '摘要', dataIndex: 'description' },
              { title: '金额', dataIndex: 'amount' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (value) => <Tag color={value === 'reconciled' ? 'green' : 'orange'}>{zhStatus(value)}</Tag>,
              },
            ]}
          />
        </Col>
        <Col xs={24} lg={12}>
          <Table
            title={() => '银行科目分录'}
            rowKey="id"
            loading={loading}
            pagination={false}
            dataSource={bankEntries}
            columns={[
              { title: '日期', dataIndex: 'entryDate' },
              { title: '摘要', dataIndex: 'summary' },
              { title: '科目', dataIndex: 'accountCode' },
              { title: '借方', dataIndex: 'debit' },
              { title: '贷方', dataIndex: 'credit' },
            ]}
          />
        </Col>
      </Row>
    </div>
  );
};
