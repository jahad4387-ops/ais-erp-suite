# Supply Chain Agent Phase 3 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固库存、采购和销售相关 Agent 自动化，让缺料、采购建议、可用量检查、发货建议和库存异常形成可审核闭环。

**Architecture:** 继续复用 Agent Action 和 dry-run 体系。低风险分析工具只返回分析结果，中风险工具只生成草稿建议，高风险库存正式出入库仍由人工审批和业务 API 执行。

**Tech Stack:** Express API, OpenAPI, React pages, Node tests.

---

## 1. 开发范围

本阶段聚焦采购、销售和库存，不处理生产执行、APS、委外和财务凭证。

## 2. 目标能力

- 缺料分析能综合销售订单、生产计划、工单、BOM、库存和在途采购。
- 采购建议能生成建议行、推荐供应商和交期风险。
- 可用量检查能输出可发货数量、锁定数量和阻断原因。
- 发货建议只生成草稿，不直接扣库存。
- 库存异常能识别负库存、批次过期、呆滞库存和成本异常。
- 盘点计划能从异常结果生成盘点任务建议。

## 3. 主要文件

- Modify: `services/api/src/api.mjs`
- Modify: `services/api/openapi.yaml`
- Modify: `apps/web/src/pages/SupplyChainDashboard.tsx`
- Modify: `apps/web/src/pages/InventoryItems.tsx`
- Modify: `apps/web/src/pages/InventoryLedger.tsx`
- Modify: `apps/web/src/pages/StockCounts.tsx`
- Test: `services/api/tests/agentSupplyChainInventoryProcurement.test.mjs`
- Test: `apps/web/tests/supplyChainInventoryAgentPages.test.mjs`

## 4. Task Breakdown

### Task 1: 缺料分析增强

- [ ] 增加测试：销售订单和工单同时消耗同一物料时，缺料数量按净需求汇总。
- [ ] 增加测试：已有库存和在途采购能抵减需求。
- [ ] 实现 `detect_material_shortage` 的净需求计算。
- [ ] 返回 `affectedOrders`、`affectedWorkOrders`、`availableQuantity`、`onOrderQuantity`、`shortageQuantity`。

### Task 2: 采购建议增强

- [ ] 增加测试：缺料结果可转换为采购建议。
- [ ] 增加测试：供应商缺失时进入 `unmatchedItems`。
- [ ] 实现推荐供应商、建议采购数量、交期风险和价格异常提示。
- [ ] 保证 `generate_purchase_suggestions` 不直接创建采购订单。

### Task 3: 库存可用量和发货建议

- [ ] 增加测试：销售订单可用量不足时返回 blockingErrors。
- [ ] 增加测试：可用量充足时返回发货草稿建议。
- [ ] 实现 `analyze_inventory_availability`。
- [ ] 实现 `generate_sales_delivery` 的 draftPayload。

### Task 4: 库存异常和盘点建议

- [ ] 增加测试：负库存、过期批次、零数量有金额、呆滞库存分别分类。
- [ ] 实现 `detect_inventory_anomalies` 详细返回结构。
- [ ] 实现 `generate_stock_count_plan` 从异常列表生成盘点建议。

### Task 5: 页面展示

- [ ] 工作台展示缺料、采购建议和库存异常摘要。
- [ ] 库存页面展示 Agent 异常分类。
- [ ] 盘点页面展示 Agent 盘点建议入口。

## 5. 测试命令

```bash
cmd /c node --test services/api/tests/agentSupplyChainInventoryProcurement.test.mjs
cmd /c node --test services/api/tests/agentSupplyChainTools.test.mjs
cmd /c node --test apps/web/tests/supplyChainInventoryAgentPages.test.mjs
cmd /c node --test services/api/tests/openapiContract.test.mjs
```

## 6. 验收标准

- Agent 不直接创建正式采购、发货和库存调整。
- 所有库存风险都有可解释原因和来源对象。
- 库存不足时不能生成正式出库结果。
- 页面能从异常跳转到物料、订单或 Agent Action。

## 7. 建议提交

```bash
git add services/api/src/api.mjs services/api/openapi.yaml services/api/tests/agentSupplyChainInventoryProcurement.test.mjs apps/web/src/pages apps/web/tests/supplyChainInventoryAgentPages.test.mjs
git commit -m "feat(agent): harden inventory and procurement automation"
```

