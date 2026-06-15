# Supply Chain Agent Phase 6 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成业财一体化闭环，让供应链制造业务事实能够生成、审核、记账、对账和追溯到财务结果。

**Architecture:** 供应链单据仍是业务事实来源，库存台账和成本核算形成金额依据，财务凭证草稿由规则或 Agent 生成，正式记账必须由财务中心审批和记账动作完成。

**Tech Stack:** Express API, Prisma, voucher engine, React finance pages, OpenAPI, Node tests.

---

## 1. 开发范围

- 采购到应付和付款凭证。
- 销售到应收和收入成本凭证。
- 库存调整到存货凭证。
- 生产成本分摊到成本凭证。
- 委外结算到应付和成本凭证。
- 库存台账与总账对账。
- 报表从财务结果反查业务链路。

## 2. 主要文件

- Modify: `services/api/src/api.mjs`
- Modify: `services/api/openapi.yaml`
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/src/platformPersistence.mjs`
- Modify: `apps/web/src/pages/BusinessFinanceWorkbench.tsx`
- Modify: `apps/web/src/pages/CostVoucherDrafts.tsx`
- Modify: `apps/web/src/pages/InventoryReconciliation.tsx`
- Modify: `apps/web/src/pages/Vouchers.tsx`
- Modify: `apps/web/src/pages/VoucherEntry.tsx`
- Modify: `apps/web/src/pages/ReportRuns.tsx`
- Test: `services/api/tests/businessFinanceIntegration.test.mjs`
- Test: `services/api/tests/supplyChainVoucherGeneration.test.mjs`
- Test: `apps/web/tests/businessFinanceWorkbenchPage.test.mjs`
- Test: `apps/web/tests/reportsVoucherDrilldown.test.mjs`

## 3. Task Breakdown

### Task 1: 业务来源链路标准化

- [ ] 增加测试：每个凭证草稿必须包含来源单据类型、来源单据 ID、Agent Action ID 和证据引用。
- [ ] 定义统一 source trace DTO。
- [ ] 在采购、销售、库存、生产、委外成本凭证草稿中复用 DTO。

### Task 2: 采购和应付凭证

- [ ] 增加测试：采购入库和采购发票可生成应付确认建议。
- [ ] 增加测试：付款后可生成付款凭证草稿。
- [ ] 实现采购链路凭证草稿生成规则。
- [ ] 财务工作台展示采购待入账队列。

### Task 3: 销售和应收凭证

- [ ] 增加测试：销售出库和销售发票可生成收入、应收和成本结转草稿。
- [ ] 增加测试：收款后可生成收款凭证草稿。
- [ ] 实现销售链路凭证草稿生成规则。
- [ ] 财务工作台展示销售待入账队列。

### Task 4: 库存和生产成本凭证

- [ ] 增加测试：盘点调整可生成库存调整凭证草稿。
- [ ] 增加测试：工单成本分摊可生成成本凭证草稿。
- [ ] 增加测试：成本凭证可反查工单、领料、完工入库和成本池。
- [ ] 加固 `generate_cost_voucher_draft` 的正式验收。

### Task 5: 对账和结账阻断

- [ ] 增加测试：库存台账与总账差异进入对账异常。
- [ ] 增加测试：存在未处理供应链事项时期间关闭被阻断。
- [ ] 实现结账检查的供应链阻断项。
- [ ] 页面显示阻断来源和处理入口。

### Task 6: 报表和下钻

- [ ] 增加测试：报表单元格可下钻到凭证。
- [ ] 增加测试：凭证可反查业务单据和 Agent Action。
- [ ] 报表运行结果增加业务 trace link。

## 4. 测试命令

```bash
cmd /c node --test services/api/tests/businessFinanceIntegration.test.mjs
cmd /c node --test services/api/tests/supplyChainVoucherGeneration.test.mjs
cmd /c node --test apps/web/tests/businessFinanceWorkbenchPage.test.mjs
cmd /c node --test apps/web/tests/reportsVoucherDrilldown.test.mjs
cmd /c node --test services/api/tests/openapiContract.test.mjs
```

## 5. 验收标准

- 财务凭证可以反查业务单据、Agent Action 和证据。
- 供应链单据可以反查财务凭证、库存台账和成本结果。
- 结账前能发现未处理供应链事项。
- Agent 不能绕过财务审核、记账和期间关闭。

## 6. 建议提交

```bash
git add services/api packages/database apps/web/src/pages services/api/tests apps/web/tests
git commit -m "feat(finance): complete supply chain business finance loop"
```

