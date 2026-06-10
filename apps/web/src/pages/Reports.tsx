import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { displayActorName, displayVoucherNo } from '../display';
import { normalBalanceText, zhActor, zhStatus } from '../i18n';

const { Title, Text } = Typography;
const TRIAL_BALANCE_TOLERANCE = 0.000001;

type ReportKey = 'general-ledger' | 'sub-ledger' | 'balances' | 'trial-balance';

type ReportColumn = {
  title: string;
  dataIndex: string;
};

type ReportRow = Record<string, unknown>;

const routeReportKeys: Record<string, ReportKey> = {
  'general-ledger': 'general-ledger',
  'detail-ledger': 'sub-ledger',
  'sub-ledger': 'sub-ledger',
  'account-balances': 'balances',
  balances: 'balances',
  'trial-balance': 'trial-balance',
  'export-center': 'general-ledger',
};

type TrialBalance = {
  totals?: {
    debit?: number;
    credit?: number;
    difference?: number;
  };
  rows?: ReportRow[];
};

type VoucherLine = {
  lineNo: number;
  summary: string;
  accountCode: string;
  debit: number;
  credit: number;
};

type VoucherDetail = {
  id: string;
  voucherNo?: string | null;
  status: string;
  voucherDate: string;
  fiscalYear: number;
  periodNo: number;
  createdBy: string;
  lines: VoucherLine[];
};

const reportColumns: Record<ReportKey, ReportColumn[]> = {
  'general-ledger': [
    { title: '科目编码', dataIndex: 'accountCode' },
    { title: '科目名称', dataIndex: 'accountName' },
    { title: '本期借方', dataIndex: 'periodDebit' },
    { title: '本期贷方', dataIndex: 'periodCredit' },
  ],
  'sub-ledger': [
    { title: '日期', dataIndex: 'entryDate' },
    { title: '凭证', dataIndex: 'voucherId' },
    { title: '科目编码', dataIndex: 'accountCode' },
    { title: '摘要', dataIndex: 'summary' },
    { title: '借方', dataIndex: 'debit' },
    { title: '贷方', dataIndex: 'credit' },
  ],
  balances: [
    { title: '科目编码', dataIndex: 'accountCode' },
    { title: '科目名称', dataIndex: 'accountName' },
    { title: '余额方向', dataIndex: 'normalBalance' },
    { title: '本期借方', dataIndex: 'periodDebit' },
    { title: '本期贷方', dataIndex: 'periodCredit' },
  ],
  'trial-balance': [
    { title: '科目编码', dataIndex: 'accountCode' },
    { title: '科目名称', dataIndex: 'accountName' },
    { title: '本期借方', dataIndex: 'periodDebit' },
    { title: '本期贷方', dataIndex: 'periodCredit' },
  ],
};

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, columns: ReportColumn[], rows: ReportRow[]) {
  const csv = [
    columns.map((column) => csvCell(column.title)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.dataIndex])).join(',')),
  ].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function htmlCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function downloadExcel(filename: string, columns: ReportColumn[], rows: ReportRow[]) {
  const table = [
    '<table>',
    `<thead><tr>${columns.map((column) => `<th>${htmlCell(column.title)}</th>`).join('')}</tr></thead>`,
    `<tbody>${rows
      .map((row) => `<tr>${columns.map((column) => `<td>${htmlCell(row[column.dataIndex])}</td>`).join('')}</tr>`)
      .join('')}</tbody>`,
    '</table>',
  ].join('');
  const blob = new Blob([`\uFEFF${table}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatTrialBalanceDifference(value: number) {
  return (Math.abs(value) <= TRIAL_BALANCE_TOLERANCE ? 0 : value).toFixed(2);
}

export const Reports: React.FC = () => {
  const { reportName } = useParams();
  const { currentUser, currentUsername, currentUserName } = useAppContext();
  const routedReport = routeReportKeys[reportName ?? 'general-ledger'] ?? 'general-ledger';
  const [activeReport, setActiveReport] = useState<ReportKey>(routedReport);
  const [trialBalance, setTrialBalance] = useState<TrialBalance>({});
  const [generalLedger, setGeneralLedger] = useState<{ rows?: ReportRow[] }>({ rows: [] });
  const [subLedger, setSubLedger] = useState<ReportRow[]>([]);
  const [balances, setBalances] = useState<ReportRow[]>([]);
  const [vouchers, setVouchers] = useState<VoucherDetail[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherDetail | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [trial, general, subLedgerRows, accountBalances] = await Promise.all([
        api.get('/reports/trial-balance'),
        api.get('/ledger/general-ledger'),
        api.get('/ledger/sub-ledger'),
        api.get('/reports/account-balances'),
      ]);
      const [voucherRows, userRows] = await Promise.all([api.get('/vouchers').catch(() => []), api.get('/users').catch(() => [])]);
      setTrialBalance(trial);
      setGeneralLedger(general);
      setSubLedger(subLedgerRows);
      setBalances(accountBalances);
      setVouchers(voucherRows || []);
      setUsers(userRows || []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    setActiveReport(routedReport);
  }, [routedReport]);

  const openVoucherDetail = async (voucherId: string) => {
    setVoucherLoading(true);
    try {
      const voucher = await api.get(`/vouchers/${voucherId}`);
      setSelectedVoucher(voucher);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setVoucherLoading(false);
    }
  };

  const reportRows = useMemo<Record<ReportKey, ReportRow[]>>(
    () => ({
      'general-ledger': generalLedger.rows ?? [],
      'sub-ledger': subLedger,
      balances,
      'trial-balance': trialBalance.rows ?? [],
    }),
    [balances, generalLedger.rows, subLedger, trialBalance.rows],
  );

  const vouchersById = useMemo(() => new Map(vouchers.map((voucher) => [voucher.id, voucher])), [vouchers]);

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

  const displayMaker = (actorId?: string | null) =>
    displayActorName(actorId, userNamesById, actorId ? zhActor(actorId) : undefined);

  const subLedgerColumns = useMemo(
    () => [
      { title: '日期', dataIndex: 'entryDate' },
      {
        title: '凭证',
        dataIndex: 'voucherId',
        render: (voucherId: string) => (
          <Button data-testid="report-voucher-open" type="link" onClick={() => openVoucherDetail(voucherId)}>
            {displayVoucherNo(vouchersById.get(voucherId) ?? { id: voucherId })}
          </Button>
        ),
      },
      { title: '科目编码', dataIndex: 'accountCode' },
      { title: '摘要', dataIndex: 'summary' },
      { title: '借方', dataIndex: 'debit' },
      { title: '贷方', dataIndex: 'credit' },
    ],
    [vouchersById],
  );

  const handleExportCsv = () => {
    const columns = reportColumns[activeReport];
    const rows = reportRows[activeReport];
    downloadCsv(`${activeReport}.csv`, columns, rows);
    message.success('CSV 已导出');
  };

  const handleExportExcel = () => {
    const columns = reportColumns[activeReport];
    const rows = reportRows[activeReport];
    downloadExcel(`${activeReport}.xls`, columns, rows);
    message.success('Excel 已导出');
  };

  const balanceDifference = trialBalance.totals?.difference ?? 0;
  const isTrialBalanceBalanced = Math.abs(balanceDifference) <= TRIAL_BALANCE_TOLERANCE;
  const displayBalanceDifference = formatTrialBalanceDifference(balanceDifference);
  const pageTitle = reportName === 'export-center' ? '导出中心' : '账簿与报表';

  return (
    <div>
      <Space align="start" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ marginTop: 0 }}>
            {pageTitle}
          </Title>
          <Text type="secondary">基于已记账分录查看总账、明细账、科目余额表和试算平衡表。</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchReports} loading={loading} />
          <Button
            data-testid="report-export-csv"
            icon={<DownloadOutlined />}
            onClick={handleExportCsv}
            disabled={loading || reportRows[activeReport].length === 0}
          >
            导出 CSV
          </Button>
          <Button
            data-testid="report-export-excel"
            icon={<DownloadOutlined />}
            onClick={handleExportExcel}
            disabled={loading || reportRows[activeReport].length === 0}
          >
            导出 Excel
          </Button>
        </Space>
      </Space>

      <Tabs
        style={{ marginTop: 16 }}
        activeKey={activeReport}
        onChange={(key) => setActiveReport(key as ReportKey)}
        items={[
          {
            key: 'general-ledger',
            label: '总账',
            children: (
              <Table
                loading={loading}
                rowKey="accountCode"
                dataSource={generalLedger.rows ?? []}
                columns={reportColumns['general-ledger']}
              />
            ),
          },
          {
            key: 'sub-ledger',
            label: '明细账',
            children: <Table loading={loading} rowKey="id" dataSource={subLedger} columns={subLedgerColumns} />,
          },
          {
            key: 'balances',
            label: '科目余额表',
            children: (
              <Table
                loading={loading}
                rowKey="accountCode"
                dataSource={balances}
                columns={reportColumns.balances.map((column) =>
                  column.dataIndex === 'normalBalance'
                    ? { ...column, render: (value: string) => normalBalanceText[value] ?? value }
                    : column
                )}
              />
            ),
          },
          {
            key: 'trial-balance',
            label: '试算平衡表',
            children: (
              <>
                <Alert
                  type={isTrialBalanceBalanced ? 'success' : 'error'}
                  showIcon
                  title={`借方 ${trialBalance.totals?.debit ?? 0} / 贷方 ${trialBalance.totals?.credit ?? 0} / 差额 ${displayBalanceDifference}`}
                />
                <Table
                  style={{ marginTop: 16 }}
                  loading={loading}
                  rowKey="accountCode"
                  dataSource={trialBalance.rows ?? []}
                  columns={reportColumns['trial-balance']}
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title={`凭证详情 · ${displayVoucherNo(selectedVoucher)}`}
        open={Boolean(selectedVoucher) || voucherLoading}
        onCancel={() => setSelectedVoucher(null)}
        footer={null}
        width={840}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Text strong>{displayVoucherNo(selectedVoucher)}</Text>
            {selectedVoucher ? <Tag>{zhStatus(selectedVoucher.status)}</Tag> : null}
            <Text>{selectedVoucher?.voucherDate}</Text>
            <Text>
              {selectedVoucher?.fiscalYear}-{String(selectedVoucher?.periodNo ?? '').padStart(2, '0')}
            </Text>
            <Text>制单人：{displayMaker(selectedVoucher?.createdBy)}</Text>
          </Space>
          <Table
            loading={voucherLoading}
            rowKey="lineNo"
            dataSource={selectedVoucher?.lines ?? []}
            pagination={false}
            columns={[
              { title: '行号', dataIndex: 'lineNo' },
              { title: '摘要', dataIndex: 'summary' },
              { title: '科目', dataIndex: 'accountCode' },
              { title: '借方', dataIndex: 'debit' },
              { title: '贷方', dataIndex: 'credit' },
            ]}
          />
        </Space>
      </Modal>
    </div>
  );
};
