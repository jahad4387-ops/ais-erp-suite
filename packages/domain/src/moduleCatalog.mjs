export const REQUIRED_MODULES = [
  {
    id: "platform",
    name: "平台与系统管理",
    textbookRefs: ["第1章", "第2章", "第9章"],
    responsibilities: ["账套", "组织", "期间", "权限", "审批", "审计", "实施验收"]
  },
  {
    id: "general-ledger",
    name: "账务处理与总账",
    textbookRefs: ["第3章"],
    responsibilities: ["科目", "期初", "凭证", "出纳", "账簿", "期末", "辅助核算"]
  },
  {
    id: "procure-to-pay",
    name: "采购与付款",
    textbookRefs: ["第4章"],
    responsibilities: ["供应商", "采购订单", "入库", "采购发票", "应付", "付款", "核销"]
  },
  {
    id: "order-to-cash",
    name: "销售与收款",
    textbookRefs: ["第5章"],
    responsibilities: ["客户", "销售订单", "发货", "销售发票", "应收", "收款", "核销"]
  },
  {
    id: "inventory-costing",
    name: "存货核算与管理",
    textbookRefs: ["第6章"],
    responsibilities: ["存货", "仓库", "出入库", "盘点", "成本", "收发存", "库龄"]
  },
  {
    id: "payroll",
    name: "薪资核算与管理",
    textbookRefs: ["第7章 7.1"],
    responsibilities: ["员工", "工资项目", "工资计算", "工资发放", "工资分摊凭证"]
  },
  {
    id: "fixed-assets",
    name: "固定资产核算与管理",
    textbookRefs: ["第7章 7.2"],
    responsibilities: ["资产卡片", "折旧", "转移", "处置", "盘点", "折旧凭证"]
  },
  {
    id: "reporting",
    name: "会计报表编制",
    textbookRefs: ["第8章"],
    responsibilities: ["报表模板", "公式", "编制", "审核", "导出", "管理分析"]
  },
  {
    id: "ai-agent",
    name: "AI 与 Agent 协作",
    textbookRefs: ["第1章 1.7", "扩展需求"],
    responsibilities: ["OCR", "AI记账草稿", "风险检查", "Agent dry-run", "审批", "审计"]
  }
];

export function listRequiredModules() {
  return REQUIRED_MODULES.map((module) => ({ ...module }));
}

export function findModuleById(id) {
  return REQUIRED_MODULES.find((module) => module.id === id) ?? null;
}
