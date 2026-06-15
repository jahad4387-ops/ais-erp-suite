# Supply Chain Agent Phase 4 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固生产执行自动化，让工单从计划、领料、完工到成本试算形成稳定闭环。

**Architecture:** 生产执行仍以业务草稿为边界。Agent 可以生成计划、工单、领料、完工和成本试算草稿，但正式库存和成本影响必须走审批和业务规则。

**Tech Stack:** Express API, Prisma persistence, React pages, OpenAPI, Node tests.

---

## 1. 开发范围

- 生产计划到工单。
- 工单到领料。
- 工单到完工入库。
- 完工后成本试算。
- 工单关单建议。

不包含委外、返工、追溯和正式财务凭证。

## 2. 主要文件

- Modify: `services/api/src/api.mjs`
- Modify: `services/api/openapi.yaml`
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/src/platformPersistence.mjs`
- Modify: `apps/web/src/pages/ProductionPlans.tsx`
- Modify: `apps/web/src/pages/ProductionWorkOrders.tsx`
- Modify: `apps/web/src/pages/MaterialRequisitions.tsx`
- Modify: `apps/web/src/pages/ProductReceipts.tsx`
- Modify: `apps/web/src/pages/CostAllocations.tsx`
- Test: `services/api/tests/productionExecutionAgent.test.mjs`
- Test: `apps/web/tests/productionExecutionAgentPages.test.mjs`

## 3. Task Breakdown

### Task 1: 生产计划到工单加固

- [ ] 增加测试：计划行可生成多个工单草稿。
- [ ] 增加测试：已生成工单的计划行不会重复生成。
- [ ] 实现重复生成保护。
- [ ] 页面展示计划行和已生成工单关系。

### Task 2: 领料草稿加固

- [ ] 增加测试：根据 BOM 和已领数量计算剩余应领。
- [ ] 增加测试：超 BOM 领料返回 blockingErrors。
- [ ] 增加测试：库存不足时不能生成可执行领料草稿。
- [ ] 实现 `generate_material_requisition` 的剩余需求计算。

### Task 3: 完工入库草稿加固

- [ ] 增加测试：完工数量不能超过计划数量。
- [ ] 增加测试：未领料工单只能生成警告或阻断。
- [ ] 增加测试：完工入库草稿必须包含仓库、库位、批次和成本状态。
- [ ] 实现 `generate_product_receipt` 的业务规则。

### Task 4: 成本试算增强

- [ ] 增加测试：领料成本、人工、折旧和制造费用能汇总为工单成本。
- [ ] 增加测试：缺少成本池时返回 warning。
- [ ] 实现 `calculate_work_order_cost` 的明细结构。
- [ ] 页面显示工单成本来源。

### Task 5: 关单建议

- [ ] 增加测试：已完工且成本已确认的工单可建议关单。
- [ ] 增加测试：存在未处理领料或成本异常时阻断关单。
- [ ] 在工单页面展示 Agent 关单建议。

## 4. 测试命令

```bash
cmd /c node --test services/api/tests/productionExecutionAgent.test.mjs
cmd /c node --test services/api/tests/agentSupplyChainTools.test.mjs
cmd /c node --test apps/web/tests/productionExecutionAgentPages.test.mjs
cmd /c node --test packages/database/tests/platformPersistence.test.mjs
```

## 5. 验收标准

- 计划、工单、领料、完工、成本之间能互相追溯。
- Agent 创建的草稿可以审批后执行和回收。
- 库存不足、超 BOM、期间关闭时被阻断。
- 工单成本试算能解释材料、人工、折旧和制造费用来源。

## 6. 建议提交

```bash
git add services/api/src/api.mjs services/api/openapi.yaml packages/database apps/web/src/pages services/api/tests/productionExecutionAgent.test.mjs apps/web/tests/productionExecutionAgentPages.test.mjs
git commit -m "feat(agent): harden production execution automation"
```

