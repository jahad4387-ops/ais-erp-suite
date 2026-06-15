# Supply Chain Agent Phase 5 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 APS、返工、委外、追溯和线边仓从页面入口升级为可保存、可审批、可追溯的业务闭环。

**Architecture:** 本阶段新增或补强制造扩展实体。Agent 先生成 dry-run 和草稿，人工确认后进入业务表。库存、成本和财务影响仍在后续 Phase 6 统一处理。

**Tech Stack:** Prisma migrations, Express API, React pages, OpenAPI, Node tests.

---

## 1. 开发范围

- APS 计划排程。
- 返工单。
- 委外单。
- 追溯规则和追溯运行。
- 线边仓配置和补料。

## 2. 数据模型建议

| 模型 | 用途 |
| --- | --- |
| `ReworkOrder` | 返工计划、审批和执行 |
| `ReworkOrderLine` | 返工物料和处理结果 |
| `OutsourcingOrder` | 委外发料、收货和结算 |
| `OutsourcingOrderLine` | 委外物料明细 |
| `TraceRule` | 批次、序列号、工单、订单追溯规则 |
| `TraceQueryRun` | 追溯查询结果快照 |
| `LineSideWarehouseConfig` | 线边仓和产线配置 |
| `LineSideMaterialMovement` | 线边补料、退料和消耗 |

## 3. 主要文件

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260614100000_advanced_manufacturing_flows/migration.sql`
- Modify: `packages/database/src/platformPersistence.mjs`
- Modify: `services/api/src/api.mjs`
- Modify: `services/api/openapi.yaml`
- Modify: `apps/web/src/pages/ReworkOrders.tsx`
- Modify: `apps/web/src/pages/OutsourcingOrders.tsx`
- Modify: `apps/web/src/pages/Traceability.tsx`
- Modify: `apps/web/src/pages/LineSideWarehouses.tsx`
- Test: `packages/database/tests/migration.test.mjs`
- Test: `packages/database/tests/platformPersistence.test.mjs`
- Test: `services/api/tests/advancedManufacturingFlows.test.mjs`
- Test: `apps/web/tests/advancedManufacturingPages.test.mjs`

## 4. Task Breakdown

### Task 1: 返工闭环

- [ ] 增加迁移测试：返工单和返工行表存在。
- [ ] 增加 API 测试：返工单可创建、提交、审批、关闭。
- [ ] 实现 `generate_rework_plan` 草稿保存。
- [ ] 页面展示原工单、原销售订单、原批次、返工原因和物料需求。

### Task 2: 委外闭环

- [ ] 增加迁移测试：委外单和委外行表存在。
- [ ] 增加 API 测试：委外建议可保存为委外单草稿。
- [ ] 实现委外发料、收货和结算状态机。
- [ ] 页面展示委外在途数量和供应商。

### Task 3: 追溯闭环

- [ ] 增加迁移测试：追溯规则和追溯运行表存在。
- [ ] 增加 API 测试：按批次能追溯采购、库存、工单、完工、销售链路。
- [ ] 实现 `trace_material_batch` 结果快照。
- [ ] 页面展示正向追溯、反向追溯和影响范围。

### Task 4: 线边仓闭环

- [ ] 增加迁移测试：线边仓配置和线边移动表存在。
- [ ] 增加 API 测试：线边补料建议可生成草稿。
- [ ] 实现 `generate_line_side_replenishment` 草稿保存。
- [ ] 页面展示产线、工单、班组、物料、线边库存和补料建议。

### Task 5: Agent Action 接入

- [ ] 所有新增草稿支持 `sourceType=agent` 和 `agentActionId`。
- [ ] 所有 Agent 创建的草稿支持回收，已执行或已影响库存的草稿阻断回收。
- [ ] OpenAPI 文档补齐 createdObjects 类型。

## 5. 测试命令

```bash
cmd /c node --test packages/database/tests/migration.test.mjs
cmd /c node --test packages/database/tests/platformPersistence.test.mjs
cmd /c node --test services/api/tests/advancedManufacturingFlows.test.mjs
cmd /c node --test apps/web/tests/advancedManufacturingPages.test.mjs
cmd /c node --test services/api/tests/openapiContract.test.mjs
```

## 6. 验收标准

- 返工、委外、追溯、线边仓均不再只是页面占位。
- 每个模块都有 API、页面、测试和 OpenAPI 契约。
- Agent 草稿可审核、可执行、可回收、可追溯。
- 不绕过库存、期间、成本和审批规则。

## 7. 建议提交

```bash
git add packages/database services/api apps/web/src/pages apps/web/tests services/api/tests
git commit -m "feat(supply-chain): complete advanced manufacturing flows"
```
