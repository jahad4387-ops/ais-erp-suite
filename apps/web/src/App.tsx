import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, ConfigProvider, Layout, Menu, Space, Tag, Typography, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { LoginOutlined } from '@ant-design/icons';
import { AccountSets } from './pages/AccountSets';
import { Vouchers } from './pages/Vouchers';
import { VoucherEntry } from './pages/VoucherEntry';
import { Dashboard } from './pages/Dashboard';
import { Reports } from './pages/Reports';
import { ReportTemplates, UfoReportDesigner } from './pages/ReportTemplates';
import { ReportRuns } from './pages/ReportRuns';
import { ReportApprovals } from './pages/ReportApprovals';
import { ReportExportCenter } from './pages/ReportExportCenter';
import { ManagementAnalysis } from './pages/ManagementAnalysis';
import { SupplyChainDashboard } from './pages/SupplyChainDashboard';
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
import { BackupRestoreWorkbench } from './pages/BackupRestoreWorkbench';
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
import { buildMainMenuItems } from './navigation';

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
            items={buildMainMenuItems()}
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
                <Route path="/report-templates" element={<RequireAuth><ReportTemplates /></RequireAuth>} />
                <Route path="/ufo-report-designer" element={<RequireAuth><UfoReportDesigner /></RequireAuth>} />
                <Route path="/report-runs" element={<RequireAuth><ReportRuns /></RequireAuth>} />
                <Route path="/report-approvals" element={<RequireAuth><ReportApprovals /></RequireAuth>} />
                <Route path="/report-export-center" element={<RequireAuth><ReportExportCenter /></RequireAuth>} />
                <Route path="/management-analysis" element={<RequireAuth><ManagementAnalysis /></RequireAuth>} />
                <Route path="/supply-chain/dashboard" element={<RequireAuth><SupplyChainDashboard /></RequireAuth>} />
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
                <Route path="/backup-restore" element={<RequireAuth><BackupRestoreWorkbench /></RequireAuth>} />
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
