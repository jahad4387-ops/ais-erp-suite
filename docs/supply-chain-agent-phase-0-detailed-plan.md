# Supply Chain Agent Phase 0 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to inspect this baseline before starting Phase 1. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固化当前已经完成的供应链制造 Agent 基线，把后续开发从 Phase 1 重新开始。

**Architecture:** Phase 0 不再新增业务能力，只记录已经落地的导航、页面、API、Agent 工具、审批回放、成本凭证草稿和业财工作台能力。所有后续 Phase 必须先确认这些能力没有回归。

**Tech Stack:** React, Ant Design, React Router, Express API, Prisma, Node test runner, OpenAPI YAML.

---

## 1. 当前基线来源

本阶段来自以下两个计划文档的已完成部分：

- `docs/supply-chain-manufacturing-agent-plan.md`
- `docs/supply-chain-manufacturing-agent-development-plan.md`

当前代码证据显示，原计划中 Phase 1 至 Phase 6 的一部分已经实现。为了避免后续重复开发，已经完成的任务统一归档到本文件。

## 2. 已完成能力清单

### 2.1 双核心导航与路由

**已完成内容：**

- 财务管理中心菜单已经存在。
- 供应链制造中心菜单已经存在。
- 供应链制造中心包含生产工作台、订单管理、APS 管理、采购管理、库存管理、生产管理、产品管理、设备管理、委外管理、追溯规则、线边仓管理、统计报表和 Agent 任务队列。
- 旧路由继续保留，例如 `/purchase-orders`、`/sales-orders`、`/inventory-items`、`/work-orders`、`/material-requisitions`、`/product-receipts`、`/cost-allocations`、`/cost-voucher-drafts`。

**主要文件：**

- `apps/web/src/navigation.tsx`
- `apps/web/src/App.tsx`
- `apps/web/tests/dualCenterNavigation.test.mjs`

**Phase 1 前验证命令：**

```bash
cmd /c node --test apps/web/tests/dualCenterNavigation.test.mjs
```

### 2.2 供应链制造工作台

**已完成内容：**

- 已有 `/supply-chain/dashboard` 页面。
- 已有供应链工作台聚合接口。
- 工作台能展示供应链摘要、异常、待办和 Agent 建议。

**主要文件：**

- `apps/web/src/pages/SupplyChainDashboard.tsx`
- `apps/web/tests/supplyChainDashboardPage.test.mjs`
- `services/api/tests/supplyChainDashboard.test.mjs`
- `services/api/src/api.mjs`
- `services/api/openapi.yaml`

**Phase 1 前验证命令：**

```bash
cmd /c node --test apps/web/tests/supplyChainDashboardPage.test.mjs
cmd /c node --test services/api/tests/supplyChainDashboard.test.mjs
```

### 2.3 Agent Action 基础设施

**已完成内容：**

- Agent Tool Registry 已有供应链工具。
- Agent Action 支持 dry-run、提交、审批、执行、回收和 Replay。
- Agent Action 支持证据快照和回放事件。
- Agent 任务队列复用 `/agent` 页面。

**主要文件：**

- `apps/web/src/pages/AgentCenter.tsx`
- `apps/web/tests/agentCenterAttachmentUpload.test.mjs`
- `services/api/src/api.mjs`
- `services/api/tests/apiServer.test.mjs`
- `services/api/tests/agentSupplyChainTools.test.mjs`
- `packages/database/prisma/schema.prisma`
- `packages/database/src/platformPersistence.mjs`

**已覆盖工具：**

- `analyze_supply_chain_dashboard`
- `detect_material_shortage`
- `generate_purchase_suggestions`
- `generate_production_plan`
- `generate_work_orders_from_plan`
- `generate_material_requisition`
- `generate_product_receipt`
- `generate_sales_delivery`
- `analyze_inventory_availability`
- `detect_inventory_anomalies`
- `generate_stock_count_plan`
- `generate_outsourcing_order`
- `generate_rework_plan`
- `trace_material_batch`
- `calculate_work_order_cost`
- `generate_cost_voucher_draft`
- `generate_line_side_replenishment`
- `run_supply_chain_close_check`

**Phase 1 前验证命令：**

```bash
cmd /c node --test services/api/tests/agentSupplyChainTools.test.mjs
cmd /c node --test apps/web/tests/agentCenterAttachmentUpload.test.mjs
```

### 2.4 生产计划、工单、领料、完工入库

**已完成内容：**

- 已有 `ProductionPlan` 和计划明细能力。
- 已有生产计划页面 `/production-plans`。
- 已有从生产计划生成工单的 API。
- Agent 可生成生产计划草稿。
- Agent 可从计划生成工单草稿。
- Agent 可生成工单领料草稿。
- Agent 可生成完工入库草稿。
- 上述 Agent 创建的业务草稿支持审批后执行和回收。

**主要文件：**

- `apps/web/src/pages/ProductionPlans.tsx`
- `apps/web/src/pages/ProductionWorkOrders.tsx`
- `apps/web/src/pages/MaterialRequisitions.tsx`
- `apps/web/src/pages/ProductReceipts.tsx`
- `services/api/tests/advancedManufacturingApi.test.mjs`
- `apps/web/tests/advancedManufacturingPages.test.mjs`
- `services/api/tests/agentSupplyChainTools.test.mjs`

### 2.5 APS、返工、委外、追溯、线边仓页面入口

**已完成内容：**

- APS 管理入口指向 `/production-plans`。
- 返工计划页面入口存在。
- 委外管理页面入口存在。
- 追溯页面入口存在。
- 线边仓页面入口存在。
- 对应 Agent dry-run payload 已有初版。

**主要文件：**

- `apps/web/src/pages/ReworkOrders.tsx`
- `apps/web/src/pages/OutsourcingOrders.tsx`
- `apps/web/src/pages/Traceability.tsx`
- `apps/web/src/pages/LineSideWarehouses.tsx`
- `apps/web/tests/advancedManufacturingPages.test.mjs`
- `services/api/tests/advancedManufacturingApi.test.mjs`

### 2.6 业财工作台和成本凭证草稿

**已完成内容：**

- 已有 `/business-finance/workbench` 页面。
- 已有 `/cost-voucher-drafts` 页面和 API。
- 成本凭证草稿可以展示工作单、成本分摊、金额和来源链路。
- Agent `generate_cost_voucher_draft` 已在当前工作区实现审批后创建草稿、draft 状态回收、posted 状态阻断回收。

**注意：**

当前成本凭证 Agent 的最后一段代码仍处在未提交工作区中。Phase 1 的第一件事必须是跑全量验证并做 WIP 保护提交。

**主要文件：**

- `apps/web/src/pages/BusinessFinanceWorkbench.tsx`
- `apps/web/src/pages/CostVoucherDrafts.tsx`
- `services/api/tests/businessFinanceIntegration.test.mjs`
- `apps/web/tests/businessFinanceWorkbenchPage.test.mjs`
- `apps/web/tests/costVoucherReconciliationPages.test.mjs`

## 3. 当前未完成但不应重复开发的事项

这些事项已经有雏形，后续 Phase 应继续加固，而不是重写：

- Agent Action 状态机。
- Agent Evidence Snapshot。
- Agent Replay。
- Agent Center 页面。
- 供应链工具 registry。
- 成本凭证草稿页面和 API。
- 生产计划、工单、领料、完工入库基础模型。
- 返工、委外、追溯、线边仓页面入口。

## 4. Phase 0 验收标准

- 已明确当前基线能力。
- 已明确哪些内容后续不能重复开发。
- 已明确当前未提交代码需要保护。
- 后续从 Phase 1 开发时，第一步先运行全量验证并提交保护点。

## 5. Phase 0 建议提交

当前文件只是基线归档。如果单独提交文档，建议：

```bash
git add docs/supply-chain-agent-phase-0-detailed-plan.md
git commit -m "docs: document supply chain agent phase 0 baseline"
```

