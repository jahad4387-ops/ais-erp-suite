export const statusText: Record<string, string> = {
  draft: '草稿',
  submitted: '已提交',
  approved: '已审核',
  posted: '已记账',
  partially_executed: '部分执行',
  executed: '已执行',
  rejected: '已驳回',
  voided: '已作废',
  unopened: '未打开',
  open: '开放',
  closed: '已关闭',
  locked: '已锁定',
  enabled: '已启用',
  disabled: '已停用',
  active: '启用',
  available: '可用',
  uploading: '上传中',
  failed: '失败',
  success: '成功',
  partial_failed: '部分失败',
  reconciled: '已对账',
  unreconciled: '未对账',
  matched: '已匹配',
  local: '本地',
  memory: '内存',
  prisma: '数据库',
  external: '外部存储',
  unconfigured: '未配置',
  manual: '手工',
  ai: '智能草稿',
  period_close: '期末结转',
};

export const accountTypeText: Record<string, string> = {
  asset: '资产',
  liability: '负债',
  equity: '权益',
  cost: '成本',
  expense: '费用',
  revenue: '收入',
};

export const normalBalanceText: Record<string, string> = {
  debit: '借方',
  credit: '贷方',
};

export const auxiliaryCategoryText: Record<string, string> = {
  department: '部门',
  employee: '员工',
  customer: '客户',
  supplier: '供应商',
  project: '项目',
  custom: '自定义',
};

export const roleText: Record<string, string> = {
  'System Admin': '系统管理员',
  'Account Set Manager': '账套管理员',
  'Voucher Maker': '制单员',
  'Voucher Approver': '审核员',
  Bookkeeper: '记账员',
  'Query User': '查询用户',
  Auditor: '审计员',
};

export const permissionText: Record<string, string> = {
  'account_set.create': '创建账套',
  'account_set.manage': '管理账套',
  'account_set_user.manage': '账套授权',
  'account_set.view': '查看账套',
  'period.view': '查看期间',
  'period.open': '打开/关闭期间',
  'period.close': '关闭期间',
  'account.create': '创建科目',
  'account.update': '维护科目',
  'account.delete': '删除科目',
  'account.view': '查看科目',
  'voucher.create': '创建凭证',
  'voucher.update_own': '修改本人凭证',
  'voucher.submit': '提交凭证',
  'voucher.approve': '审核凭证',
  'voucher.reject': '驳回凭证',
  'voucher.void': '作废凭证',
  'voucher.post': '凭证记账',
  'voucher.view': '查看凭证',
  'ledger.view': '查看账簿',
  'report.view': '查看报表',
  'attachment.upload': '上传附件',
  'attachment.delete': '删除附件',
  'bank_reconciliation.create': '创建银行对账',
  'bank_reconciliation.match': '银行对账匹配',
  'ai.generate_draft': '生成智能草稿',
  'audit_log.view': '查看操作日志',
  'partner.manage': '管理往来单位',
  'purchase_order.manage': '管理采购订单',
  'sales_order.manage': '管理销售订单',
  'purchase_receipt.manage': '管理采购入库',
  'sales_delivery.manage': '管理销售出库',
  'auxiliary.manage': '管理辅助核算',
  'opening_balance.manage': '管理期初余额',
  'opening_balance.view': '查看期初余额',
  'user.manage': '管理用户',
  'role.manage': '管理角色',
};

export const actionText: Record<string, string> = {
  create: '创建',
  submit: '提交',
  approve: '审核',
  reject: '驳回',
  post: '记账',
  void: '作废',
  reverse: '红字冲销',
  copy: '复制',
  delete: '删除',
  'account_set.create': '创建账套',
  'account_set.update': '更新账套',
  'account_set.enable': '启用账套',
  'account_set.disable': '停用账套',
  'account_set.access_denied': '账套越权访问',
  'attachment.link': '绑定附件',
  'ai.convert_to_voucher': '智能草稿转正式草稿',
  'bank_statement.import': '导入银行流水',
  'posting_batch.post': '批量记账',
  'partner.create': '创建往来单位',
  'partner.update': '更新往来单位',
  'purchase_order.create': '创建采购订单',
  'purchase_order.submit': '提交采购订单',
  'purchase_order.approve': '审核采购订单',
  'purchase_receipt.create': '创建采购入库',
  'sales_order.create': '创建销售订单',
  'sales_order.submit': '提交销售订单',
  'sales_order.approve': '审核销售订单',
  'sales_delivery.create': '创建销售出库',
};

export const objectTypeText: Record<string, string> = {
  account_set: '账套',
  account: '会计科目',
  period: '会计期间',
  voucher: '凭证',
  attachment: '附件',
  role: '角色',
  user: '用户',
  bank_statement: '银行流水',
  bank_reconciliation: '银行对账',
  posting_batch: '记账批次',
  opening_balance: '期初余额',
  auxiliary_type: '辅助类型',
  auxiliary_item: '辅助项目',
  partner: '往来单位',
  purchase_order: '采购订单',
  sales_order: '销售订单',
  purchase_receipt: '采购入库',
  sales_delivery: '销售出库',
};

export const actorText: Record<string, string> = {
  system: '系统',
  System: '系统',
  'web-user': '网页用户',
  auditor: '审核员',
  accountant: '记账员',
  'demo-user': '演示用户',
  'Query User': '查询用户',
};

export function zhStatus(value?: string | null) {
  return value ? statusText[value] ?? value : '-';
}

export function zhRole(value?: string | null) {
  return value ? roleText[value] ?? value : '-';
}

export function zhPermission(value?: string | null) {
  return value ? permissionText[value] ?? value : '-';
}

export function zhAction(value?: string | null) {
  return value ? actionText[value] ?? value : '-';
}

export function zhObjectType(value?: string | null) {
  return value ? objectTypeText[value] ?? value : '-';
}

export function zhActor(value?: string | null) {
  return value ? actorText[value] ?? value : '-';
}

export function zhBool(value?: boolean | null) {
  return value ? '是' : '否';
}
