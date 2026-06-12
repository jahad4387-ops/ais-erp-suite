import type { ReactNode } from 'react';
import type { MenuProps } from 'antd';
import {
  AuditOutlined,
  BookOutlined,
  DesktopOutlined,
  FileOutlined,
  PieChartOutlined,
  RobotOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

type MenuItem = NonNullable<MenuProps['items']>[number];

export type AppNavigationItem = {
  key: string;
  label: string;
  to?: string;
  icon?: ReactNode;
  disabled?: boolean;
  children?: AppNavigationItem[];
};

export const APP_NAVIGATION: AppNavigationItem[] = [
  {
    key: 'finance-management-center',
    label: '财务管理中心',
    icon: <BookOutlined />,
    children: [
      { key: 'finance-workbench', label: '财务工作台', to: '/' },
      {
        key: 'finance-basic-settings',
        label: '基础设置',
        icon: <UserOutlined />,
        children: [
          { key: 'finance-account-sets', label: '账套管理', to: '/account-sets' },
          { key: 'finance-accounts', label: '会计科目', to: '/accounts' },
          { key: 'finance-account-code-rules', label: '科目编码规则', to: '/account-code-rules' },
          { key: 'finance-auxiliaries', label: '辅助核算', to: '/auxiliaries' },
          { key: 'finance-opening-balances', label: '期初余额', to: '/opening-balances' },
          { key: 'finance-periods', label: '会计期间', to: '/periods' },
          { key: 'finance-suppliers', label: '供应商档案', to: '/suppliers' },
          { key: 'finance-customers', label: '客户档案', to: '/customers' },
        ],
      },
      {
        key: 'finance-voucher-management',
        label: '凭证管理',
        children: [
          { key: 'finance-vouchers', label: '凭证列表', to: '/vouchers' },
          { key: 'finance-voucher-entry', label: '录入凭证', to: '/vouchers/new' },
          { key: 'finance-voucher-review', label: '审核工作台', to: '/vouchers/review' },
        ],
      },
      {
        key: 'finance-general-ledger',
        label: '总账管理',
        children: [
          { key: 'finance-posting-batches', label: '记账批次', to: '/posting/batches' },
          { key: 'finance-trial-balance', label: '试算平衡表', to: '/reports/trial-balance' },
          { key: 'finance-account-balances', label: '科目余额表', to: '/reports/account-balances' },
          { key: 'finance-detail-ledger', label: '明细账', to: '/reports/detail-ledger' },
        ],
      },
      {
        key: 'finance-ar',
        label: '应收管理',
        children: [
          { key: 'finance-sales-invoices', label: '销售发票', to: '/sales-invoices' },
          { key: 'finance-customer-receipts', label: '收款单', to: '/customer-receipts' },
          { key: 'finance-counterparty-ledger-ar', label: '往来明细', to: '/counterparty-ledger' },
        ],
      },
      {
        key: 'finance-ap',
        label: '应付管理',
        children: [
          { key: 'finance-purchase-invoices', label: '采购发票', to: '/purchase-invoices' },
          { key: 'finance-payment-requests', label: '付款申请', to: '/payment-requests' },
          { key: 'finance-ap-settlements', label: '应付核销', to: '/ap-settlements' },
        ],
      },
      {
        key: 'finance-cash-bank',
        label: '出纳与银行',
        children: [
          { key: 'finance-bank-reconciliation', label: '银行对账', to: '/bank-reconciliation' },
          { key: 'finance-counterparty-analytics', label: '往来分析', to: '/counterparty-analytics' },
        ],
      },
      {
        key: 'finance-cost-inventory',
        label: '成本与存货核算',
        children: [
          { key: 'finance-business-finance-workbench', label: '业财工作台', to: '/business-finance/workbench' },
          { key: 'finance-cost-inputs', label: '成本输入', to: '/mock-cost-inputs' },
          { key: 'finance-cost-allocations', label: '成本分摊', to: '/cost-allocations' },
          { key: 'finance-cost-voucher-drafts', label: '成本凭证', to: '/cost-voucher-drafts' },
          { key: 'finance-inventory-reconciliation', label: '库存对账', to: '/inventory-reconciliation' },
        ],
      },
      {
        key: 'finance-fixed-assets',
        label: '固定资产',
        children: [
          { key: 'finance-fixed-asset-setup', label: '固资基础', to: '/fixed-asset-setup' },
          { key: 'finance-fixed-assets-cards', label: '资产卡片', to: '/fixed-assets' },
          { key: 'finance-depreciation-runs', label: '折旧计提', to: '/depreciation-runs' },
          { key: 'finance-asset-disposals', label: '资产处置', to: '/asset-disposals' },
          { key: 'finance-asset-counts', label: '资产盘点', to: '/asset-counts' },
          { key: 'finance-fixed-asset-reconciliation', label: '固资对账', to: '/fixed-asset-reconciliation' },
        ],
      },
      {
        key: 'finance-payroll',
        label: '薪资核算',
        children: [
          { key: 'finance-payroll-setup', label: '薪资基础', to: '/payroll-setup' },
          { key: 'finance-payroll-runs', label: '工资批次', to: '/payroll-runs' },
        ],
      },
      {
        key: 'finance-reports',
        label: '财务报表',
        icon: <AuditOutlined />,
        children: [
          { key: 'finance-report-templates', label: '报表模板', to: '/report-templates' },
          { key: 'finance-ufo-report-designer', label: 'UFO 报表设计', to: '/ufo-report-designer' },
          { key: 'finance-report-runs', label: '报表计算', to: '/report-runs' },
          { key: 'finance-report-approvals', label: '报表审批', to: '/report-approvals' },
          { key: 'finance-report-export-center', label: '导出中心', to: '/report-export-center' },
          { key: 'finance-management-analysis', label: '经营分析', to: '/management-analysis' },
        ],
      },
      { key: 'finance-period-close', label: '期末处理', disabled: true },
      { key: 'finance-audit', label: '财务审计', to: '/audit-logs' },
    ],
  },
  {
    key: 'supply-chain-manufacturing-center',
    label: '供应链制造中心',
    icon: <FileOutlined />,
    children: [
      { key: 'supply-chain-workbench', label: '生产工作台', to: '/supply-chain/dashboard' },
      {
        key: 'supply-chain-order-management',
        label: '订单管理',
        children: [
          { key: 'supply-chain-sales-orders', label: '销售订单', to: '/sales-orders' },
          { key: 'supply-chain-purchase-orders', label: '采购订单', to: '/purchase-orders' },
          { key: 'supply-chain-sales-deliveries', label: '销售出库', to: '/sales-deliveries' },
        ],
      },
      { key: 'supply-chain-aps-management', label: 'APS管理', to: '/production-plans' },
      {
        key: 'supply-chain-procurement',
        label: '采购管理',
        children: [
          { key: 'supply-chain-procurement-orders', label: '采购订单', to: '/purchase-orders' },
          { key: 'supply-chain-purchase-receipts', label: '采购入库', to: '/purchase-receipts' },
          { key: 'supply-chain-purchase-invoices', label: '采购发票', to: '/purchase-invoices' },
        ],
      },
      {
        key: 'supply-chain-inventory',
        label: '库存管理',
        children: [
          { key: 'supply-chain-inventory-items', label: '物料库存', to: '/inventory-items' },
          { key: 'supply-chain-warehouses', label: '仓库库位', to: '/warehouses' },
          { key: 'supply-chain-inventory-opening-balances', label: '存货期初', to: '/inventory-opening-balances' },
          { key: 'supply-chain-inventory-movements', label: '出入库单', to: '/inventory-movements' },
          { key: 'supply-chain-inventory-transfers', label: '调拨单', to: '/inventory-transfers' },
          { key: 'supply-chain-stock-counts', label: '盘点工作台', to: '/stock-counts' },
          { key: 'supply-chain-inventory-ledger', label: '收发存查询', to: '/inventory-ledger' },
        ],
      },
      {
        key: 'supply-chain-production',
        label: '生产管理',
        children: [
          { key: 'supply-chain-work-orders', label: '工单管理', to: '/work-orders' },
          { key: 'supply-chain-material-requisitions', label: '领料申请', to: '/material-requisitions' },
          { key: 'supply-chain-product-receipts', label: '完工入库', to: '/product-receipts' },
          { key: 'supply-chain-rework-orders', label: '返工计划', to: '/rework-orders' },
        ],
      },
      {
        key: 'supply-chain-product-management',
        label: '产品管理',
        children: [
          { key: 'supply-chain-boms', label: 'BOM维护', to: '/boms' },
          { key: 'supply-chain-product-items', label: '产品与物料', to: '/inventory-items' },
        ],
      },
      { key: 'supply-chain-device-management', label: '设备管理', disabled: true },
      { key: 'supply-chain-outsourcing', label: '委外管理', to: '/outsourcing-orders' },
      { key: 'supply-chain-traceability-rules', label: '追溯规则', to: '/traceability' },
      { key: 'supply-chain-line-side-warehouse', label: '线边仓管理', to: '/line-side-warehouses' },
      {
        key: 'supply-chain-statistical-reports',
        label: '统计报表',
        children: [
          { key: 'supply-chain-inventory-reconciliation', label: '库存对账', to: '/inventory-reconciliation' },
          { key: 'supply-chain-cost-allocations', label: '成本分摊', to: '/cost-allocations' },
          { key: 'supply-chain-cost-voucher-drafts', label: '成本凭证', to: '/cost-voucher-drafts' },
        ],
      },
      { key: 'supply-chain-agent-queue', label: 'Agent任务队列', icon: <RobotOutlined />, to: '/agent' },
    ],
  },
  {
    key: 'system-management',
    label: '系统管理',
    icon: <TeamOutlined />,
    children: [
      { key: 'system-platform-workbench', label: '平台工作台', icon: <PieChartOutlined />, to: '/' },
      { key: 'system-users', label: '用户与角色权限', to: '/roles' },
      { key: 'system-deployment-config', label: '部署配置', to: '/deployment-config' },
      { key: 'system-backup-restore', label: '备份恢复', to: '/backup-restore' },
      { key: 'system-audit-logs', label: '操作日志', to: '/audit-logs' },
      { key: 'system-account-sets', label: '账套管理', icon: <DesktopOutlined />, to: '/account-sets' },
    ],
  },
];

const toMenuItem = (item: AppNavigationItem): MenuItem => ({
  key: item.key,
  icon: item.icon,
  label: item.to && !item.disabled ? <Link to={item.to}>{item.label}</Link> : item.label,
  disabled: item.disabled,
  children: item.children?.map(toMenuItem),
});

export const buildMainMenuItems = (): MenuProps['items'] => APP_NAVIGATION.map(toMenuItem);
