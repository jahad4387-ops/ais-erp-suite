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
import { CounterpartyAnalytics } from './pages/CounterpartyAnalytics';
import { PaymentWorkbench } from './pages/PaymentWorkbench';
import { ReceiptWorkbench } from './pages/ReceiptWorkbench';
import { ApSettlementWorkbench } from './pages/ApSettlementWorkbench';
import { InventoryItems } from './pages/InventoryItems';
import { BomMaintenance } from './pages/BomMaintenance';
import { Warehouses } from './pages/Warehouses';
import { InventoryOpeningBalances } from './pages/InventoryOpeningBalances';
import { InventoryMovements } from './pages/InventoryMovements';
import { InventoryTransfers } from './pages/InventoryTransfers';
import { StockCounts } from './pages/StockCounts';
import { InventoryLedger } from './pages/InventoryLedger';
import { ProductionWorkOrders } from './pages/ProductionWorkOrders';
import { MaterialRequisitions } from './pages/MaterialRequisitions';
import { ProductReceipts } from './pages/ProductReceipts';
import { MockCostInputs } from './pages/MockCostInputs';
import { CostAllocations } from './pages/CostAllocations';
import { CostVoucherDrafts } from './pages/CostVoucherDrafts';
import { InventoryReconciliation } from './pages/InventoryReconciliation';
import { PayrollSetup } from './pages/PayrollSetup';
import { PayrollRuns } from './pages/PayrollRuns';
import { FixedAssetSetup } from './pages/FixedAssetSetup';
import { FixedAssets } from './pages/FixedAssets';
import { DepreciationRuns } from './pages/DepreciationRuns';
import { AssetDisposals } from './pages/AssetDisposals';
import { AssetCounts } from './pages/AssetCounts';
import { FixedAssetReconciliation } from './pages/FixedAssetReconciliation';
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
                key: 'inventory-production',
                icon: <FileOutlined />,
                label: '存货生产',
                children: [
                  { key: 'inventory-items', label: <Link to="/inventory-items">存货档案</Link> },
                  { key: 'boms', label: <Link to="/boms">BOM 维护</Link> },
                  { key: 'warehouses', label: <Link to="/warehouses">仓库库位</Link> },
                  {
                    key: 'inventory-opening-balances',
                    label: <Link to="/inventory-opening-balances">存货期初</Link>,
                  },
                  { key: 'inventory-movements', label: <Link to="/inventory-movements">出入库单</Link> },
                  { key: 'inventory-transfers', label: <Link to="/inventory-transfers">调拨单</Link> },
                  { key: 'stock-counts', label: <Link to="/stock-counts">盘点工作台</Link> },
                  { key: 'work-orders', label: <Link to="/work-orders">生产工单</Link> },
                  { key: 'material-requisitions', label: <Link to="/material-requisitions">生产领料</Link> },
                  { key: 'product-receipts', label: <Link to="/product-receipts">完工入库</Link> },
                  { key: 'mock-cost-inputs', label: <Link to="/mock-cost-inputs">成本输入</Link> },
                  { key: 'cost-allocations', label: <Link to="/cost-allocations">成本分摊</Link> },
                  { key: 'cost-voucher-drafts', label: <Link to="/cost-voucher-drafts">成本凭证</Link> },
                  { key: 'inventory-reconciliation', label: <Link to="/inventory-reconciliation">库存对账</Link> },
                  { key: 'inventory-ledger', label: <Link to="/inventory-ledger">收发存查询</Link> },
                ],
              },
              {
                key: 'payroll-assets',
                icon: <FileOutlined />,
                label: '薪资固资',
                children: [
                  { key: 'payroll-setup', label: <Link to="/payroll-setup">薪资基础</Link> },
                  { key: 'payroll-runs', label: <Link to="/payroll-runs">工资批次</Link> },
                  { key: 'fixed-asset-setup', label: <Link to="/fixed-asset-setup">固资基础</Link> },
                  { key: 'fixed-assets', label: <Link to="/fixed-assets">资产卡片</Link> },
                  { key: 'depreciation-runs', label: <Link to="/depreciation-runs">折旧计提</Link> },
                  { key: 'asset-disposals', label: <Link to="/asset-disposals">资产处置</Link> },
                  { key: 'asset-counts', label: <Link to="/asset-counts">资产盘点</Link> },
                  { key: 'fixed-asset-reconciliation', label: <Link to="/fixed-asset-reconciliation">固资对账</Link> },
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
                  { key: 'counterparty-analytics', label: <Link to="/counterparty-analytics">往来分析</Link> },
                  { key: 'payment-requests', label: <Link to="/payment-requests">付款申请</Link> },
                  { key: 'customer-receipts', label: <Link to="/customer-receipts">收款单</Link> },
                  { key: 'ap-settlements', label: <Link to="/ap-settlements">应付核销</Link> },
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
                <Route path="/counterparty-analytics" element={<RequireAuth><CounterpartyAnalytics /></RequireAuth>} />
                <Route path="/payment-requests" element={<RequireAuth><PaymentWorkbench /></RequireAuth>} />
                <Route path="/customer-receipts" element={<RequireAuth><ReceiptWorkbench /></RequireAuth>} />
                <Route path="/ap-settlements" element={<RequireAuth><ApSettlementWorkbench /></RequireAuth>} />
                <Route path="/inventory-items" element={<RequireAuth><InventoryItems /></RequireAuth>} />
                <Route path="/boms" element={<RequireAuth><BomMaintenance /></RequireAuth>} />
                <Route path="/warehouses" element={<RequireAuth><Warehouses /></RequireAuth>} />
                <Route path="/inventory-opening-balances" element={<RequireAuth><InventoryOpeningBalances /></RequireAuth>} />
                <Route path="/inventory-movements" element={<RequireAuth><InventoryMovements /></RequireAuth>} />
                <Route path="/inventory-transfers" element={<RequireAuth><InventoryTransfers /></RequireAuth>} />
                <Route path="/stock-counts" element={<RequireAuth><StockCounts /></RequireAuth>} />
                <Route path="/work-orders" element={<RequireAuth><ProductionWorkOrders /></RequireAuth>} />
                <Route path="/material-requisitions" element={<RequireAuth><MaterialRequisitions /></RequireAuth>} />
                <Route path="/product-receipts" element={<RequireAuth><ProductReceipts /></RequireAuth>} />
                <Route path="/mock-cost-inputs" element={<RequireAuth><MockCostInputs /></RequireAuth>} />
                <Route path="/cost-allocations" element={<RequireAuth><CostAllocations /></RequireAuth>} />
                <Route path="/cost-voucher-drafts" element={<RequireAuth><CostVoucherDrafts /></RequireAuth>} />
                <Route path="/inventory-reconciliation" element={<RequireAuth><InventoryReconciliation /></RequireAuth>} />
                <Route path="/inventory-ledger" element={<RequireAuth><InventoryLedger /></RequireAuth>} />
                <Route path="/payroll-setup" element={<RequireAuth><PayrollSetup /></RequireAuth>} />
                <Route path="/payroll-runs" element={<RequireAuth><PayrollRuns /></RequireAuth>} />
                <Route path="/fixed-asset-setup" element={<RequireAuth><FixedAssetSetup /></RequireAuth>} />
                <Route path="/fixed-assets" element={<RequireAuth><FixedAssets /></RequireAuth>} />
                <Route path="/depreciation-runs" element={<RequireAuth><DepreciationRuns /></RequireAuth>} />
                <Route path="/asset-disposals" element={<RequireAuth><AssetDisposals /></RequireAuth>} />
                <Route path="/asset-counts" element={<RequireAuth><AssetCounts /></RequireAuth>} />
                <Route path="/fixed-asset-reconciliation" element={<RequireAuth><FixedAssetReconciliation /></RequireAuth>} />
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
