# AIS ERP Suite 双核心与供应链制造 Agent 详细开发计划

> 本计划承接 `docs/supply-chain-manufacturing-agent-plan.md`，把“双核心 ERP + 供应链制造 Agent 自动化”拆成可分期交付、可测试、可审阅、可提交 GitHub 的开发阶段。

## 1. 总体实施原则

### 1.1 产品原则

- 系统按两个业务中心建设：财务管理中心、供应链制造中心。
- 两个中心共享账套、组织、期间、客户供应商、物料、仓库、权限、审批、附件、审计和 Agent 任务。
- 供应链业务必须最终能沉淀为库存台账、成本结果和财务凭证。
- 财务凭证必须能反查业务单据、库存台账、成本计算、Agent Action 和证据。
- Agent 不做无约束自动操作，只能在权限、证据、dry-run、审批和审计规则内执行。

### 1.2 技术原则

- 保留现有 React + Ant Design + React Router 前端架构。
- 保留现有 Express API、Prisma、SQLite/数据库包和 domain tests 结构。
- 优先扩展现有模型、接口、页面和 Agent Center，不重新造一套框架。
- 新功能先以稳定接口和可测试页面落地，再逐步增强自动化。
- 所有写操作遵守幂等键、权限校验、期间校验、业务规则校验。
- 每个 Phase 都应能独立运行测试，并形成可提交的 GitHub commit/PR。

### 1.3 风险控制原则

- 低风险 Agent：查询、分析、生成报告，可自动运行。
- 中风险 Agent：生成草稿、生成建议、提交待办，需要人工确认。
- 高风险 Agent：正式影响库存、成本、财务、付款、关单、结账，必须审批后执行。
- Agent 不能绕过库存不足、期间关闭、权限不足、审批不足、成本未锁定等规则。
- Agent dry-run 与正式执行结果的差异必须记录并可解释。

### 1.4 旧 Phase 6 WIP 保护原则

当前 `docs/phase-6-detailed-plan.md` 对应的是 Agent 工作流与生产化底座，包含 Agent Gateway、Tool Registry、Agent Action 状态机、证据链、OCR/LLM Adapter、备份恢复和审计回放等基础能力。本计划中的供应链制造 Agent 应用层必须建立在该底座之上，不能在未隔离旧 Phase 6 半成品时直接覆盖同一批核心文件。

正式进入供应链制造开发前必须完成以下保护动作：

- 先执行只读盘点，记录 `git status --short`、当前分支、未提交文件清单和高冲突文件。
- 将旧 Phase 6 半成品标记为“冻结基线”，优先通过 WIP commit、独立分支或独立 worktree 保存。
- 如果暂时不提交旧 Phase 6，必须在本轮开发中避开高冲突文件，只允许改计划文档、低耦合页面和新增文件。
- 高冲突文件包括：
  - `services/api/src/api.mjs`
  - `services/api/openapi.yaml`
  - `packages/database/prisma/schema.prisma`
  - `apps/web/src/pages/AgentCenter.tsx`
  - `apps/web/src/App.tsx`
  - Agent、Prisma migration、API contract 相关测试
- 本计划的 Phase 3 及之后涉及 Agent 底座扩展的任务，必须在旧 Phase 6 底座冻结、提交或明确接管后再启动。
- 每个开发阶段开始前都要重新检查工作区，确认没有未识别的用户改动被纳入本阶段提交。

## 2. Phase 总览

| Phase | 名称 | 主要交付 | 建议提交边界 |
| --- | --- | --- | --- |
| Phase 0 | 文档、编码、WIP 保护和基线治理 | 文档稳定、旧 Phase 6 保护、中文乱码盘点、现有测试基线 | `docs:` / `test:` |
| Phase 1 | 双核心导航与共享上下文 | 财务中心、供应链制造中心、旧路由兼容 | `feat(ui): dual centers navigation` |
| Phase 2 | 供应链制造工作台与聚合接口 | 生产工作台、供应链摘要 API、异常摘要 | `feat(supply-chain): dashboard` |
| Phase 3 | Agent 基础设施扩展 | Tool Registry 扩展、任务队列、统一 dry-run | `feat(agent): supply chain tools foundation` |
| Phase 4 | 第一批高价值 Agent | 缺料、采购建议、库存异常、领料、完工成本 Agent | `feat(agent): core supply chain automation` |
| Phase 5 | APS、返工、委外、追溯、线边仓 | 计划、返工、委外、追溯、线边仓闭环 | `feat(supply-chain): advanced manufacturing flows` |
| Phase 6 | 业财一体化闭环 | 业务单据到凭证、成本结转、库存总账对账 | `feat(finance): business finance integration` |
| Phase 7 | 验收、权限、性能和发布准备 | E2E 验收、权限覆盖、操作手册、发布清单 | `chore(release): acceptance hardening` |

## 3. Phase 0：文档、编码、WIP 保护和基线治理

### 3.1 目标

在正式开发前稳定范围、保护旧 Phase 6 半成品、确认当前可运行基线、治理现有中文乱码和文档状态，避免后续开发时把编码问题、旧改动和新功能混在一起。

### 3.2 开发范围

- 保留并审阅：
  - `docs/supply-chain-manufacturing-agent-plan.md`
  - `docs/supply-chain-manufacturing-agent-development-plan.md`
- 保护旧 Phase 6 半成品：
  - 读取并记录 `docs/phase-6-detailed-plan.md` 的当前目标和已落地边界。
  - 执行 `git status --short`，把未提交文件按“旧 Phase 6 底座”“供应链制造计划”“无关用户改动”三类标记。
  - 优先将旧 Phase 6 相关改动保存为 WIP commit，例如 `wip: preserve phase 6 agent foundation`。
  - 如果暂时不能提交，至少建立本轮开发禁碰清单，避免改动 `services/api/src/api.mjs`、`services/api/openapi.yaml`、`packages/database/prisma/schema.prisma`、`apps/web/src/pages/AgentCenter.tsx` 等高冲突文件。
  - 新供应链制造开发开始后，每次提交只包含本阶段文件，不混入旧 Phase 6 WIP。
- 梳理现有未提交改动，明确哪些是用户已有工作，哪些是本轮开发需要触碰。
- 盘点供应链、财务、Agent 相关中文乱码：
  - 菜单标题
  - 页面标题
  - 按钮文案
  - 状态标签
  - 错误提示
  - 测试断言中的中文文案
- 记录现有测试基线：
  - domain tests
  - API tests
  - web static tests
  - build:web

### 3.3 主要文件

- `docs/supply-chain-manufacturing-agent-plan.md`
- `docs/supply-chain-manufacturing-agent-development-plan.md`
- `docs/implementation-roadmap.md`
- `docs/ui-design.md`
- `docs/agent-native-design.md`
- `docs/phase-6-detailed-plan.md`
- `apps/web/src/App.tsx`
- `apps/web/src/i18n.ts`
- `apps/web/src/api.ts`

### 3.4 测试与验收

- `npm test` 能跑通或记录当前失败项。
- `npm run build:web` 能跑通或记录当前失败项。
- 已记录旧 Phase 6 WIP 保护方式：WIP commit、独立分支、独立 worktree，或明确的禁碰清单。
- 已列出本阶段允许修改文件和禁止修改文件。
- 若旧 Phase 6 WIP 尚未提交，Phase 1 只能先做导航和文案的低风险改动，Phase 3 及之后的 Agent 底座扩展暂缓。
- 输出一份编码治理清单，后续 Phase 1 按清单修复。
- 不改业务逻辑，不引入新模型。

### 3.5 GitHub 提交建议

- 提交文档、WIP 保护记录和基线清单即可。
- Commit 示例：`docs: add supply chain agent development plan`
- 若单独保存旧 Phase 6 半成品，Commit 示例：`wip: preserve phase 6 agent foundation`

## 4. Phase 1：双核心导航与共享上下文

### 4.1 目标

把系统用户入口重构为“财务管理中心 + 供应链制造中心”，并保留现有页面和旧路由兼容，使产品结构先清楚起来。

### 4.2 开发范围

#### 前端导航

- 新增双核心一级导航：
  - 财务管理中心
  - 供应链制造中心
- 财务管理中心菜单：
  - 财务工作台
  - 基础设置
  - 凭证管理
  - 总账管理
  - 应收管理
  - 应付管理
  - 出纳与银行
  - 成本与存货核算
  - 固定资产
  - 薪资核算
  - 财务报表
  - 期末处理
  - 财务审计
- 供应链制造中心菜单：
  - 生产工作台
  - 订单管理
  - APS 管理
  - 采购管理
  - 库存管理
  - 生产管理
  - 产品管理
  - 设备管理
  - 委外管理
  - 追溯规则
  - 线边仓管理
  - 统计报表
  - Agent 任务队列

#### 路由兼容

- 保留现有路由：
  - `/purchase-orders`
  - `/sales-orders`
  - `/purchase-receipts`
  - `/sales-deliveries`
  - `/inventory-items`
  - `/boms`
  - `/warehouses`
  - `/inventory-movements`
  - `/work-orders`
  - `/material-requisitions`
  - `/product-receipts`
  - `/cost-allocations`
  - `/cost-voucher-drafts`
  - `/inventory-reconciliation`
- 新增供应链中心路由前缀时，旧路由继续可访问或跳转到新路由。

#### 共享上下文

- 顶部保持当前账套、组织、期间、用户、角色显示。
- 切换中心不改变账套和期间。
- 供应链页面和财务页面共用同一套 accountSetId、currentYear、currentPeriod、currentUser。

#### 中文文案治理

- 修复导航、页面标题、状态标签和常用错误提示乱码。
- 建议将高频状态文案集中到 `i18n.ts` 或专门的 display helper。

### 4.3 主要文件

- `apps/web/src/App.tsx`
- `apps/web/src/i18n.ts`
- `apps/web/src/display.ts`
- `apps/web/src/App.css`
- `apps/web/tests/moduleChineseLocalization.test.mjs`
- `apps/web/tests/orderWorkflowPages.test.mjs`
- `apps/web/tests/inventoryFoundationPages.test.mjs`
- `apps/web/tests/productionWorkflowPages.test.mjs`

### 4.4 测试与验收

- 财务管理中心和供应链制造中心均可访问。
- 旧路由可访问或正确跳转。
- 菜单中文显示正常。
- 当前账套、期间、用户在两个中心中保持一致。
- 现有订单、库存、生产、财务页面测试不回归。

### 4.5 建议提交

- Commit：`feat(ui): add dual-center navigation`
- 不在本 Phase 新增复杂业务模型。

## 5. Phase 2：供应链制造工作台与聚合接口

### 5.1 目标

新增供应链制造中心的主入口“生产工作台”，让用户一进来就能看到订单、采购、库存、工单、成本、审批和异常。

### 5.2 开发范围

#### 后端聚合接口

新增供应链工作台摘要接口，建议：

- `GET /supply-chain/dashboard?accountSetId=&fiscalYear=&periodNo=`

返回内容：

- 今日待处理订单数量。
- 待采购缺料数量。
- 采购逾期数量。
- 可发货订单数量。
- 库存异常数量。
- 负库存数量。
- 即将过期批次数量。
- 待领料工单数量。
- 待完工工单数量。
- 成本待处理数量。
- 待审批 Agent Action 数量。

#### 前端页面

新增或重构：

- `SupplyChainDashboard`

页面结构：

- 顶部指标条。
- 待办队列。
- 缺料预警表。
- 库存异常表。
- 工单进度表。
- Agent 建议区。

#### Agent 摘要占位

- 先接入规则型摘要，不调用真实大模型。
- 输出“今日供应链建议”：
  - 哪些订单缺料。
  - 哪些采购逾期。
  - 哪些工单可领料。
  - 哪些库存异常需要处理。

### 5.3 主要文件

- `services/api/src/api.mjs`
- `services/api/openapi.yaml`
- `services/api/tests/apiServer.test.mjs`
- `services/api/tests/openapiContract.test.mjs`
- `apps/web/src/pages/SupplyChainDashboard.tsx`
- `apps/web/src/App.tsx`
- `apps/web/tests/supplyChainDashboardPage.test.mjs`

### 5.4 测试与验收

- 无数据时显示清晰空状态。
- 有订单、库存、工单时能返回摘要。
- 页面可从供应链制造中心进入。
- dashboard API 字段稳定。
- 旧 Dashboard 和财务工作台不受影响。

### 5.5 建议提交

- Commit：`feat(supply-chain): add manufacturing dashboard`

## 6. Phase 3：Agent 基础设施扩展

### 6.1 目标

在现有 Agent Center、Agent Action、draft-candidate 基础上扩展供应链制造工具体系，形成统一 Tool Registry、Agent 任务队列和 dry-run 返回结构。

### 6.2 开发范围

#### Tool Registry

新增供应链制造工具定义：

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
- `run_supply_chain_close_check`

#### 通用工具返回结构

所有供应链 Agent 工具返回：

- toolName
- riskLevel
- status
- summary
- draftPayload
- warnings
- blockingErrors
- matchedMasterData
- unmatchedItems
- evidenceRefs
- nextActions

#### Agent 任务队列

新增供应链视角的 Agent 任务队列页面，复用现有 AgentAction 数据：

- 按风险等级筛选。
- 按状态筛选。
- 按工具筛选。
- 支持查看 dry-run。
- 支持查看证据。
- 支持提交、审批、执行、回放。

#### 页面上下文入口

在供应链页面补齐 Agent 入口：

- 订单页：可交付性检查、发货建议。
- 库存页：库存异常分析。
- 工单页：领料建议、完工建议。
- 盘点页：盘点计划和调整建议。
- 成本页：成本试算和凭证草稿。

### 6.3 主要文件

- `services/api/src/api.mjs`
- `services/api/openapi.yaml`
- `packages/database/prisma/schema.prisma`
- `apps/web/src/pages/AgentCenter.tsx`
- `apps/web/src/components/AgentDraftEntryButton.tsx`
- `apps/web/src/pages/AgentTaskQueue.tsx`
- `apps/web/tests/agentSupplyChainTools.test.mjs`
- `services/api/tests/apiServer.test.mjs`

### 6.4 测试与验收

- `GET /agent-tools` 返回供应链工具。
- Agent 工具均支持 dryRun。
- 高风险工具不能直接执行。
- Agent 任务队列可展示供应链工具生成的任务。
- 从业务页面进入 Agent 时能带上 draftType、sourceObjectType、sourceObjectId。

### 6.5 建议提交

- Commit：`feat(agent): add supply chain tool foundation`

## 7. Phase 4：第一批高价值 Agent

### 7.1 目标

优先实现最能减少人工重复工作的 5 个 Agent，让用户能立刻感受到智能化和自动化。

### 7.2 Agent 1：缺料分析 Agent

#### 能力

- 读取销售订单、生产计划、工单、BOM、库存余额、锁定量、在途采购。
- 展开 BOM。
- 计算净需求。
- 输出缺料清单。
- 标记缺料来源和影响订单。

#### 接口

- `POST /agent/tools/detect_material_shortage/invoke`

#### 验收

- 能识别当前库存不足的物料。
- 能输出影响销售订单或工单。
- 不生成采购单，只生成低风险分析结果。

### 7.3 Agent 2：采购建议 Agent

#### 能力

- 消费缺料清单。
- 推荐供应商。
- 生成采购申请或采购订单草稿。
- 检查价格异常和交期风险。

#### 接口

- `POST /agent/tools/generate_purchase_suggestions/invoke`

#### 验收

- 只能生成草稿。
- 草稿保存前必须人工确认。
- 缺少供应商或物料匹配时进入 unmatchedItems。

### 7.4 Agent 3：库存异常 Agent

#### 能力

- 检查负库存。
- 检查批次过期。
- 检查呆滞库存。
- 检查成本层异常。
- 检查数量为 0 金额不为 0。

#### 接口

- `POST /agent/tools/detect_inventory_anomalies/invoke`

#### 验收

- 输出异常分类、风险等级、建议动作。
- 不直接调整库存。
- 可从库存页面和生产工作台触发。

### 7.5 Agent 4：工单领料 Agent

#### 能力

- 根据工单和 BOM 生成领料单草稿。
- 检查已领数量。
- 检查超 BOM 领料。
- 检查仓库可用量。

#### 接口

- `POST /agent/tools/generate_material_requisition/invoke`

#### 验收

- 库存不足时生成 blockingErrors。
- 可生成 material_requisition draft。
- 人工确认后才能保存正式草稿。

### 7.6 Agent 5：完工入库与成本 Agent

#### 能力

- 根据工单完工数量生成完工入库草稿。
- 检查工单是否已领料。
- 触发成本试算。
- 生成成本凭证草稿建议。

#### 接口

- `POST /agent/tools/generate_product_receipt/invoke`
- `POST /agent/tools/calculate_work_order_cost/invoke`
- `POST /agent/tools/generate_cost_voucher_draft/invoke`

#### 验收

- 未领料或成本未锁定时不得生成正式成本凭证。
- 完工入库先生成草稿。
- 成本结果能反查工单、领料、完工入库和成本池。

### 7.7 主要文件

- `services/api/src/api.mjs`
- `services/api/openapi.yaml`
- `apps/web/src/pages/SupplyChainDashboard.tsx`
- `apps/web/src/pages/InventoryLedger.tsx`
- `apps/web/src/pages/ProductionWorkOrders.tsx`
- `apps/web/src/pages/MaterialRequisitions.tsx`
- `apps/web/src/pages/ProductReceipts.tsx`
- `apps/web/src/pages/CostAllocations.tsx`
- `apps/web/tests/agentCoreSupplyChainAutomation.test.mjs`
- `services/api/tests/agentSupplyChainTools.test.mjs`

### 7.8 建议提交

- Commit：`feat(agent): add core supply chain automation`

## 8. Phase 5：APS、返工、委外、追溯、线边仓

### 8.1 目标

补齐供应链制造中心中截图和业务期望里更制造化的模块：APS、返工、委外、追溯、线边仓。

### 8.2 APS 管理

#### 数据模型

- ProductionPlan
- ProductionPlanLine

#### 页面

- 主生产计划
- 计划详情
- 人工排程
- 计划状态跟踪

#### Agent

- APS 排产 Agent 生成规则型排产草稿。
- 计划可转工单草稿。

#### 验收

- 销售订单可生成计划草稿。
- 计划可生成工单草稿。
- 缺料计划能标记风险。

### 8.3 返工管理

#### 数据模型

- ReworkOrder
- ReworkOrderLine

#### 页面

- 返工计划
- 新增返工
- 返工审批
- 返工领料
- 返工完工

#### Agent

- 返工 Agent 根据质检异常或退货生成返工计划草稿。

#### 验收

- 返工单能关联原工单、原销售订单、原批次。
- 返工领料不能绕过库存校验。
- 返工完成后能进入库存和成本链路。

### 8.4 委外管理

#### 数据模型

- OutsourcingOrder
- OutsourcingOrderLine

#### 页面

- 委外发料
- 委外收货
- 委外结算
- 委外在途

#### Agent

- 委外 Agent 根据产能不足或工序外协规则生成委外建议。

#### 验收

- 委外发料减少库存。
- 委外收货增加库存。
- 委外结算进入应付和成本。

### 8.5 追溯规则

#### 数据模型

- TraceRule
- TraceQueryRun

#### 页面

- 追溯规则维护
- 批次追溯查询
- 影响范围分析

#### Agent

- 追溯 Agent 生成正向/反向追溯报告。

#### 验收

- 可从批次追溯到采购、库存、工单、成品、销售。
- 可从销售订单反查原材料批次。

### 8.6 线边仓管理

#### 数据模型

- LineSideWarehouseConfig
- LineSideMaterialMovement

#### 页面

- 线边库存
- 补料申请
- 退料
- 消耗记录

#### Agent

- 线边仓补料 Agent 根据工单和线边库存生成补料建议。

#### 验收

- 线边仓与主仓库存分开展示。
- 补料和退料能形成库存移动记录。
- 消耗记录可关联工单。

### 8.7 主要文件

- `packages/database/prisma/schema.prisma`
- `services/api/src/api.mjs`
- `services/api/openapi.yaml`
- `apps/web/src/pages/ProductionPlans.tsx`
- `apps/web/src/pages/ReworkOrders.tsx`
- `apps/web/src/pages/OutsourcingOrders.tsx`
- `apps/web/src/pages/Traceability.tsx`
- `apps/web/src/pages/LineSideWarehouses.tsx`
- `apps/web/tests/advancedManufacturingPages.test.mjs`
- `services/api/tests/advancedManufacturingApi.test.mjs`

### 8.8 建议提交

- Commit：`feat(supply-chain): add advanced manufacturing flows`

## 9. Phase 6：业财一体化闭环

### 9.1 目标

把供应链制造中心产生的业务事实转成财务中心可审核、可记账、可对账、可出报表的数据闭环。

### 9.2 业务到财务链路

#### 采购链路

- 采购订单 -> 采购入库 -> 采购发票 -> 应付确认 -> 付款 -> 凭证。

#### 销售链路

- 销售订单 -> 发货出库 -> 销售发票 -> 应收确认 -> 收款 -> 收入和成本凭证。

#### 库存链路

- 其他入库、其他出库、调拨、盘点、报废、退货 -> 库存台账 -> 存货核算 -> 凭证草稿。

#### 生产链路

- 生产计划 -> 工单 -> 领料 -> 完工入库 -> 成本分摊 -> 成本凭证。

#### 委外链路

- 委外发料 -> 委外收货 -> 委外结算 -> 成本和应付凭证。

### 9.3 财务中心增强

- 财务工作台展示供应链推送的待生成凭证、待审核凭证、对账异常。
- 凭证详情展示来源业务链路。
- 总账和库存台账支持联查。
- 成本与存货核算页面显示业务来源、成本计算和凭证影响。

### 9.4 Agent 增强

- 成本核算 Agent 生成成本凭证草稿。
- 应收应付 Agent 生成核销建议。
- 结账检查 Agent 检查供应链未完成事项。
- 报表解读 Agent 生成管理分析草稿。

### 9.5 测试与验收

- 采购到付款闭环通过。
- 销售到收款闭环通过。
- 生产到成本闭环通过。
- 库存台账与总账对账通过。
- 成本凭证可反查工单、领料、完工入库、成本池。
- 结账前能阻断未完成供应链事项。

### 9.6 主要文件

- `services/api/src/api.mjs`
- `packages/database/prisma/schema.prisma`
- `apps/web/src/pages/Vouchers.tsx`
- `apps/web/src/pages/VoucherEntry.tsx`
- `apps/web/src/pages/CostVoucherDrafts.tsx`
- `apps/web/src/pages/InventoryReconciliation.tsx`
- `apps/web/src/pages/Reports.tsx`
- `apps/web/tests/businessFinanceIntegration.test.mjs`
- `services/api/tests/businessFinanceIntegration.test.mjs`

### 9.7 建议提交

- Commit：`feat(finance): integrate supply chain accounting`

## 10. Phase 7：验收、权限、性能和发布准备

### 10.1 目标

在功能闭环后做系统级验收，确保权限、安全、审计、性能、文档和 GitHub 交付都足够稳定。

### 10.2 验收场景

必须跑通：

- 销售订单 -> 缺料分析 -> 采购建议 -> 采购入库 -> 应付建议。
- 销售订单 -> 可用量检查 -> 发货单草稿 -> 出库 -> 收入和成本凭证。
- 主生产计划 -> 工单 -> 领料 -> 完工入库 -> 成本试算 -> 成本凭证。
- 盘点差异 -> 调整建议 -> 审批 -> 库存调整 -> 财务凭证草稿。
- 批次异常 -> 追溯报告 -> 影响范围清单。
- 期间关闭 -> Agent 和人工均不能生成正式影响财务的数据。

### 10.3 权限验收

- 财务人员不能越权执行供应链高风险动作。
- 仓库人员不能越权记账。
- Agent 不能使用用户没有的权限。
- 高风险 Agent Action 未审批不能执行。
- 审批和执行必须留痕。

### 10.4 性能验收

- 工作台摘要接口在普通数据量下快速返回。
- 库存查询支持分页和筛选。
- Agent 任务队列支持分页和筛选。
- 报表和追溯查询对大数据量有明确加载状态。

### 10.5 文档交付

- 更新用户操作手册。
- 更新 Agent 操作规范。
- 更新 API 文档。
- 更新测试验收报告。
- 更新 GitHub PR 描述模板或提交说明。

### 10.6 发布准备

- 跑完整测试。
- 跑 web build。
- 检查数据库迁移。
- 检查 `.env.example` 是否包含新增配置。
- 检查 README 或部署手册是否需要补充。

### 10.7 建议提交

- Commit：`chore(release): harden supply chain agent rollout`

## 11. 推荐执行顺序

推荐严格按以下顺序推进：

1. 先保护旧 Phase 6 WIP：记录状态、确认归属、做 WIP commit / 独立分支 / 独立 worktree，或建立禁碰清单。
2. 再提交供应链制造计划、编码治理和测试基线。
3. 再做双核心导航。
4. 再做供应链制造工作台。
5. 再扩 Agent 基础设施。
6. 先做五个高价值 Agent。
7. 再补 APS、返工、委外、追溯、线边仓。
8. 最后做业财一体化闭环和发布验收。

这个顺序的好处是：

- 每一步都有可见成果。
- 旧 Phase 6 半成品不会被供应链制造开发覆盖。
- 不会一次性推翻现有系统。
- Agent 自动化先从低风险和中风险草稿开始。
- 财务闭环放在业务数据稳定之后做，减少返工。

## 12. GitHub PR 拆分建议

建议至少拆成以下 PR：

1. `docs: add supply chain manufacturing agent plans`
2. `feat(ui): add dual-center navigation`
3. `feat(supply-chain): add manufacturing dashboard`
4. `feat(agent): add supply chain tool foundation`
5. `feat(agent): add core supply chain automation`
6. `feat(supply-chain): add advanced manufacturing flows`
7. `feat(finance): integrate supply chain accounting`
8. `chore(release): harden supply chain agent rollout`

每个 PR 必须包含：

- 变更说明。
- 影响范围。
- 测试命令和结果。
- 数据迁移说明。
- 权限和风险说明。
- 截图或页面入口说明。

## 13. 最小可交付版本建议

如果希望尽快看到效果，最小可交付版本可以只包含：

- Phase 1 双核心导航。
- Phase 2 供应链制造工作台。
- Phase 3 Agent 工具基础设施。
- Phase 4 前三个 Agent：
  - 缺料分析 Agent。
  - 采购建议 Agent。
  - 库存异常 Agent。

这版可以先实现“系统会主动发现问题、生成建议、生成草稿”，等业务人员确认规则稳定后，再开放领料、完工、成本、委外、返工和凭证闭环。
