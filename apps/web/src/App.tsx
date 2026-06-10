import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, ConfigProvider, Layout, Menu, Space, Tag, Typography, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  DesktopOutlined,
  PieChartOutlined,
  FileOutlined,
  TeamOutlined,
  UserOutlined,
  AuditOutlined,
  BookOutlined,
  RobotOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import { AccountSets } from './pages/AccountSets';
import { Vouchers } from './pages/Vouchers';
import { VoucherEntry } from './pages/VoucherEntry';
import { Dashboard } from './pages/Dashboard';
import { Reports } from './pages/Reports';
import { BankReconciliation } from './pages/BankReconciliation';
import { AgentCenter } from './pages/AgentCenter';
import { Login } from './pages/Login';
import { Accounts } from './pages/Accounts';
import { Periods } from './pages/Periods';
import { UserAccess } from './pages/UserAccess';
import { Auxiliaries } from './pages/Auxiliaries';
import { OpeningBalances } from './pages/OpeningBalances';
import { AuditLogs } from './pages/AuditLogs';
import { AccountCodeRules } from './pages/AccountCodeRules';
import { PostingBatches } from './pages/PostingBatches';
import { VoucherReview } from './pages/VoucherReview';
import { DeploymentConfig } from './pages/DeploymentConfig';
import { Partners } from './pages/Partners';
import { Orders } from './pages/Orders';
import { Fulfillment } from './pages/Fulfillment';
import { Invoices } from './pages/Invoices';
import { CounterpartyLedger } from './pages/CounterpartyLedger';
import { api } from './api';
import { AppProvider, useAppContext } from './context/AppContext';
import { zhActor, zhRole } from './i18n';

const { Header, Content, Footer, Sider } = Layout;
const { Text, Title } = Typography;

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated } = useAppContext();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

const AppShell: React.FC = () => {
  return (
    <BrowserRouter>
      <AppFrame />
    </BrowserRouter>
  );
};

const AppFrame: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const {
    clearCurrentAccountSet,
    clearCurrentUser,
    currentAccountSetId,
    currentAccountSetName,
    currentOrganization,
    currentPeriod,
    currentRole,
    currentUserName,
    currentYear,
    isAuthenticated,
    setCurrentAccountSet,
    setCurrentPeriod,
  } =
    useAppContext();
  const {
    token: { colorBgContainer },
  } = theme.useToken();
  const displayUserName = zhActor(currentUserName);
  const handleLogout = () => {
    clearCurrentUser();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    api
      .get('/account-sets')
      .then((accountSets) => {
        if (cancelled) {
          return;
        }
        const selected = accountSets?.find((accountSet: { id?: string }) => accountSet.id === currentAccountSetId);
        const preferred =
          selected ??
          accountSets?.find((accountSet: { status?: string }) => accountSet.status === 'enabled') ??
          accountSets?.[0];
        if (preferred) {
          if (
            preferred.id !== currentAccountSetId ||
            preferred.name !== currentAccountSetName ||
            preferred.companyName !== currentOrganization
          ) {
            setCurrentAccountSet(preferred.id, preferred.name, preferred.companyName);
          }
          return;
        }
        if (currentAccountSetId || currentAccountSetName !== '未选择账套' || currentOrganization) {
          clearCurrentAccountSet();
        }
      })
      .catch(() => {
        if (!cancelled && (!currentAccountSetId || !currentOrganization)) {
          // Keep the header in the explicit "unselected" state if account sets cannot be loaded yet.
          clearCurrentAccountSet();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    clearCurrentAccountSet,
    currentAccountSetId,
    currentAccountSetName,
    currentOrganization,
    isAuthenticated,
    setCurrentAccountSet,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    if (!currentAccountSetId) {
      return;
    }

    let cancelled = false;
    api
      .get(`/account-sets/${currentAccountSetId}/periods`)
      .then((periods) => {
        const currentPeriodRecord = periods?.find((period: { isCurrent?: boolean }) => period.isCurrent);
        if (
          !cancelled &&
          currentPeriodRecord &&
          (currentPeriodRecord.fiscalYear !== currentYear || currentPeriodRecord.periodNo !== currentPeriod)
        ) {
          setCurrentPeriod(currentPeriodRecord.fiscalYear, currentPeriodRecord.periodNo);
        }
      })
      .catch(() => {
        // Keep the persisted header period if period metadata cannot be loaded yet.
      });

    return () => {
      cancelled = true;
    };
  }, [currentAccountSetId, currentPeriod, currentYear, isAuthenticated, setCurrentPeriod]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
        <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
          <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 6 }} />
          <Menu
            theme="dark"
            defaultSelectedKeys={['1']}
            mode="inline"
            items={[
              { key: '1', icon: <PieChartOutlined />, label: <Link to="/">工作台</Link> },
              {
                key: 'platform',
                icon: <TeamOutlined />,
                label: '平台管理',
                children: [
                  { key: '2', icon: <DesktopOutlined />, label: <Link to="/account-sets">账套管理</Link> },
                  { key: '8', label: <Link to="/roles">用户与角色权限</Link> },
                  { key: 'deployment-config', label: <Link to="/deployment-config">部署配置</Link> },
                  { key: 'audit-logs', label: <Link to="/audit-logs">操作日志</Link> },
                ],
              },
              {
                key: 'master-data',
                icon: <UserOutlined />,
                label: '基础档案',
                children: [
                  { key: 'suppliers', label: <Link to="/suppliers">供应商档案</Link> },
                  { key: 'customers', label: <Link to="/customers">客户档案</Link> },
                  { key: 'accounts', label: <Link to="/accounts">会计科目</Link> },
                  { key: 'account-code-rules', label: <Link to="/account-code-rules">科目编码规则</Link> },
                  { key: 'auxiliaries', label: <Link to="/auxiliaries">辅助核算</Link> },
                  { key: 'opening-balances', label: <Link to="/opening-balances">期初余额</Link> },
                  { key: 'periods', label: <Link to="/periods">会计期间</Link> },
                ],
              },
              {
                key: 'general-ledger',
                icon: <BookOutlined />,
                label: '总账',
                children: [
                  { key: 'purchase-orders', label: <Link to="/purchase-orders">采购订单</Link> },
                  { key: 'purchase-receipts', label: <Link to="/purchase-receipts">采购入库</Link> },
                  { key: 'purchase-invoices', label: <Link to="/purchase-invoices">采购发票</Link> },
                  { key: 'sales-orders', label: <Link to="/sales-orders">销售订单</Link> },
                  { key: 'sales-deliveries', label: <Link to="/sales-deliveries">销售出库</Link> },
                  { key: 'sales-invoices', label: <Link to="/sales-invoices">销售发票</Link> },
                  { key: 'counterparty-ledger', label: <Link to="/counterparty-ledger">往来明细</Link> },
                  { key: '3', label: <Link to="/vouchers">凭证管理</Link> },
                  { key: '4', label: <Link to="/vouchers/new">录入凭证</Link> },
                  { key: 'voucher-review', label: <Link to="/vouchers/review">审核工作台</Link> },
                  { key: 'posting-batches', label: <Link to="/posting/batches">记账批次</Link> },
                  { key: '5', label: <Link to="/bank-reconciliation">银行对账</Link> },
                ],
              },
              {
                key: 'reports',
                icon: <AuditOutlined />,
                label: '报表',
                children: [
                  { key: 'trial', label: <Link to="/reports/trial-balance">试算平衡表</Link> },
                  { key: 'balances', label: <Link to="/reports/account-balances">科目余额表</Link> },
                  { key: 'detail', label: <Link to="/reports/detail-ledger">明细账</Link> },
                ],
              },
              { key: 'agent', icon: <RobotOutlined />, label: <Link to="/agent">智能助手</Link> },
              { key: '9', icon: <FileOutlined />, label: '系统设置' },
            ]}
          />
        </Sider>
        <Layout>
          <Header style={{ padding: 0, background: colorBgContainer }}>
            <div
              style={{
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: '100%',
                gap: 16,
              }}
            >
              <Title level={4} style={{ margin: 0 }}>AIS ERP 财务套件</Title>
              <Space size={[8, 8]} wrap>
                <Tag color="blue">账套：{currentAccountSetName}</Tag>
                <Tag color="geekblue">组织：{currentOrganization || '未选择组织'}</Tag>
                <Tag color="purple">
                  期间：{currentYear}-{String(currentPeriod).padStart(2, '0')}
                </Tag>
                {isAuthenticated && (
                  <Text>
                    {displayUserName} · {zhRole(currentRole)}
                  </Text>
                )}
                {!isAuthenticated && (
                  <Button size="small" icon={<LoginOutlined />}>
                    <Link to="/login">登录</Link>
                  </Button>
                )}
                {isAuthenticated && (
                  <Button size="small" onClick={handleLogout}>
                    退出
                  </Button>
                )}
              </Space>
            </div>
          </Header>
          <Content style={{ margin: '0 16px' }}>
            <div
              style={{
                padding: 24,
                minHeight: 360,
                background: colorBgContainer,
                marginTop: 16,
              }}
            >
              <Routes>
                <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/account-sets" element={<RequireAuth><AccountSets /></RequireAuth>} />
                <Route path="/vouchers" element={<RequireAuth><Vouchers /></RequireAuth>} />
                <Route path="/vouchers/new" element={<RequireAuth><VoucherEntry /></RequireAuth>} />
                <Route path="/vouchers/:voucherId/edit" element={<RequireAuth><VoucherEntry /></RequireAuth>} />
                <Route path="/vouchers/review" element={<RequireAuth><VoucherReview /></RequireAuth>} />
                <Route path="/posting/batches" element={<RequireAuth><PostingBatches /></RequireAuth>} />
                <Route path="/reports/:reportName" element={<RequireAuth><Reports /></RequireAuth>} />
                <Route path="/bank-reconciliation" element={<RequireAuth><BankReconciliation /></RequireAuth>} />
                <Route path="/agent" element={<RequireAuth><AgentCenter /></RequireAuth>} />
                <Route path="/login" element={<Login />} />
                <Route path="/accounts" element={<RequireAuth><Accounts /></RequireAuth>} />
                <Route path="/suppliers" element={<RequireAuth><Partners partnerType="supplier" /></RequireAuth>} />
                <Route path="/customers" element={<RequireAuth><Partners partnerType="customer" /></RequireAuth>} />
                <Route path="/purchase-orders" element={<RequireAuth><Orders orderType="purchase" /></RequireAuth>} />
                <Route path="/sales-orders" element={<RequireAuth><Orders orderType="sales" /></RequireAuth>} />
                <Route path="/purchase-receipts" element={<RequireAuth><Fulfillment fulfillmentType="purchase" /></RequireAuth>} />
                <Route path="/sales-deliveries" element={<RequireAuth><Fulfillment fulfillmentType="sales" /></RequireAuth>} />
                <Route path="/purchase-invoices" element={<RequireAuth><Invoices invoiceType="purchase" /></RequireAuth>} />
                <Route path="/sales-invoices" element={<RequireAuth><Invoices invoiceType="sales" /></RequireAuth>} />
                <Route path="/counterparty-ledger" element={<RequireAuth><CounterpartyLedger /></RequireAuth>} />
                <Route path="/account-code-rules" element={<RequireAuth><AccountCodeRules /></RequireAuth>} />
                <Route path="/periods" element={<RequireAuth><Periods /></RequireAuth>} />
                <Route path="/auxiliaries" element={<RequireAuth><Auxiliaries /></RequireAuth>} />
                <Route path="/opening-balances" element={<RequireAuth><OpeningBalances /></RequireAuth>} />
                <Route path="/users" element={<Navigate to="/roles" replace />} />
                <Route path="/roles" element={<RequireAuth><UserAccess /></RequireAuth>} />
                <Route path="/deployment-config" element={<RequireAuth><DeploymentConfig /></RequireAuth>} />
                <Route path="/audit-logs" element={<RequireAuth><AuditLogs /></RequireAuth>} />
              </Routes>
            </div>
          </Content>
          <Footer style={{ textAlign: 'center' }}>
            AIS ERP 财务套件 ©{new Date().getFullYear()}
          </Footer>
        </Layout>
    </Layout>
  );
};

const App: React.FC = () => (
  <ConfigProvider locale={zhCN}>
    <AppProvider>
      <AppShell />
    </AppProvider>
  </ConfigProvider>
);

export default App;
