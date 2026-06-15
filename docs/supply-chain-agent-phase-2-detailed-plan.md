# Supply Chain Agent Phase 2 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐供应链制造页面的上下文 Agent 入口，让用户能从具体业务对象发起智能分析、草稿生成和任务流转。

**Architecture:** 复用现有 `AgentCenter`、Agent Tool Registry 和业务页面。新增轻量入口组件，统一传递 `toolName`、`sourceObjectType`、`sourceObjectId`、账套、期间和证据引用。

**Tech Stack:** React, Ant Design, React Router, Express API.

---

## 1. 开发范围

本阶段不新增底层 Agent 状态机，只补齐业务页面入口和上下文传递。

## 2. 页面入口矩阵

| 页面 | 路由 | Agent 动作 |
| --- | --- | --- |
| 生产工作台 | `/supply-chain/dashboard` | 生成今日待办、缺料巡检、库存异常巡检 |
| 销售订单 | `/sales-orders` | 可交付性检查、发货建议 |
| 采购订单 | `/purchase-orders` | 到货风险检查、催货清单 |
| 物料库存 | `/inventory-items` | 库存异常分析、可用量查询 |
| 出入库单 | `/inventory-movements` | 仓库草稿生成 |
| 盘点工作台 | `/stock-counts` | 盘点计划和调整建议 |
| 主生产计划 | `/production-plans` | 排产草稿、生成工单 |
| 工单管理 | `/work-orders` | 领料建议、完工建议、关单建议 |
| 委外管理 | `/outsourcing-orders` | 委外发料、收货、结算建议 |
| 返工计划 | `/rework-orders` | 返工计划和审批材料 |
| 追溯规则 | `/traceability` | 批次追溯报告 |
| 成本核算 | `/cost-allocations` | 成本试算、成本凭证草稿 |

## 3. 主要文件

- Create: `apps/web/src/components/AgentContextActions.tsx`
- Modify: `apps/web/src/pages/SupplyChainDashboard.tsx`
- Modify: `apps/web/src/pages/Orders.tsx`
- Modify: `apps/web/src/pages/InventoryItems.tsx`
- Modify: `apps/web/src/pages/InventoryMovements.tsx`
- Modify: `apps/web/src/pages/StockCounts.tsx`
- Modify: `apps/web/src/pages/ProductionPlans.tsx`
- Modify: `apps/web/src/pages/ProductionWorkOrders.tsx`
- Modify: `apps/web/src/pages/OutsourcingOrders.tsx`
- Modify: `apps/web/src/pages/ReworkOrders.tsx`
- Modify: `apps/web/src/pages/Traceability.tsx`
- Modify: `apps/web/src/pages/CostAllocations.tsx`
- Test: `apps/web/tests/supplyChainAgentEntryPoints.test.mjs`

## 4. Task Breakdown

### Task 1: 新增统一入口组件

- [ ] 编写静态测试，断言 `AgentContextActions` 支持 `toolName`、`sourceObjectType`、`sourceObjectId`、`buttonLabel`。
- [ ] 新增组件，使用 Ant Design `Button` 和 `Space`。
- [ ] 点击入口时跳转 `/agent`，通过 query string 或 location state 携带上下文。
- [ ] 在 `AgentCenter` 中读取上下文并预填工具、来源对象和账套期间。

### Task 2: 工作台入口

- [ ] 在生产工作台顶部添加 Agent 快捷操作。
- [ ] 入口包含 `analyze_supply_chain_dashboard`、`detect_material_shortage`、`detect_inventory_anomalies`。
- [ ] 测试断言页面源代码包含三个工具名。

### Task 3: 订单和采购入口

- [ ] 销售订单行或详情操作中增加可交付性检查。
- [ ] 采购订单行或详情操作中增加到货风险检查。
- [ ] 入口传递订单 ID 和订单类型。

### Task 4: 库存和盘点入口

- [ ] 物料库存页增加库存异常分析入口。
- [ ] 出入库单页增加仓库草稿入口。
- [ ] 盘点工作台增加盘点计划入口。
- [ ] 入口必须传递物料、仓库或盘点单上下文。

### Task 5: 生产、委外、返工、追溯入口

- [ ] 生产计划页增加排产草稿和生成工单入口。
- [ ] 工单页增加领料、完工、成本试算入口。
- [ ] 委外页增加委外发料和收货建议入口。
- [ ] 返工页增加返工计划入口。
- [ ] 追溯页增加批次追溯入口。

## 5. 测试命令

```bash
cmd /c node --test apps/web/tests/supplyChainAgentEntryPoints.test.mjs
cmd /c node --test apps/web/tests/agentCenterAttachmentUpload.test.mjs
cmd /c npm run build:web
```

## 6. 验收标准

- 每个关键供应链页面都有上下文 Agent 入口。
- 从业务页面进入 Agent 后能自动带入工具和来源对象。
- 不新增重复的 Agent 状态机。
- 不破坏现有 Agent Center。

## 7. 建议提交

```bash
git add apps/web/src/components/AgentContextActions.tsx apps/web/src/pages apps/web/tests/supplyChainAgentEntryPoints.test.mjs apps/web/tests/agentCenterAttachmentUpload.test.mjs
git commit -m "feat(agent): add supply chain context entry points"
```

