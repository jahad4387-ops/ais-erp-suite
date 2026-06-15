# Supply Chain Agent Phase 7 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成供应链制造 Agent 的系统级验收、权限、安全、性能、文档和 GitHub 发布准备。

**Architecture:** 本阶段不新增核心业务功能，只做横向加固。所有验收必须覆盖财务管理中心和供应链制造中心的数据互通。

**Tech Stack:** Node tests, Vite build, Prisma validate, manual acceptance docs, GitHub PR checklist.

---

## 1. 开发范围

- 验收矩阵。
- 权限矩阵。
- 风险控制测试。
- 性能和分页检查。
- 操作手册。
- 部署和发布说明。
- GitHub PR 拆分和提交清单。

## 2. 主要文件

- Create: `docs/supply-chain-agent-acceptance-matrix.md`
- Create: `docs/supply-chain-agent-operation-manual.md`
- Create: `docs/supply-chain-agent-test-steps-zh.md`
- Create: `docs/supply-chain-agent-deployment-notes.md`
- Modify: `README.md`
- Modify: `.env.example`
- Test: `services/api/tests/supplyChainEndToEndAcceptance.test.mjs`
- Test: `apps/web/tests/supplyChainReleaseReadiness.test.mjs`

## 3. 验收场景

### Scenario 1: 销售订单到采购建议

- [ ] 创建销售订单。
- [ ] 运行缺料分析 Agent。
- [ ] 生成采购建议。
- [ ] 人工确认采购草稿。
- [ ] 验证所有步骤有 Agent Action 和证据链。

### Scenario 2: 销售订单到发货和收款

- [ ] 创建销售订单。
- [ ] 运行可用量检查。
- [ ] 生成发货建议。
- [ ] 人工执行出库。
- [ ] 生成收入和成本凭证草稿。
- [ ] 验证凭证能反查销售订单和出库单。

### Scenario 3: 主生产计划到成本凭证

- [ ] 创建生产计划。
- [ ] Agent 生成工单。
- [ ] Agent 生成领料草稿。
- [ ] Agent 生成完工入库草稿。
- [ ] Agent 生成成本试算。
- [ ] Agent 生成成本凭证草稿。
- [ ] 验证成本凭证能反查工单、领料、完工、成本池和 Agent Action。

### Scenario 4: 盘点差异到库存调整

- [ ] 创建盘点任务。
- [ ] 录入盘点差异。
- [ ] Agent 生成调整建议。
- [ ] 人工审批库存调整。
- [ ] 生成财务凭证草稿。

### Scenario 5: 批次异常到追溯报告

- [ ] 创建含批次的采购入库、生产领料、完工入库和销售发货。
- [ ] 运行追溯 Agent。
- [ ] 生成正向和反向追溯报告。
- [ ] 验证影响范围包含订单、库存、工单、客户和批次。

## 4. 权限和安全验收

- [ ] 仓库人员不能记账。
- [ ] 财务人员不能绕过库存审批。
- [ ] Agent 不能使用发起人没有的权限。
- [ ] 高风险 Agent Action 未审批不能执行。
- [ ] 证据 Hash 改变时审批和执行被阻断。
- [ ] 期间关闭后供应链和 Agent 均不能生成正式财务影响。

## 5. 性能和可用性验收

- [ ] Agent 任务队列支持分页。
- [ ] 库存查询支持筛选和分页。
- [ ] 工作台摘要在普通数据量下快速返回。
- [ ] 追溯查询有加载状态和空状态。
- [ ] 所有新增页面中文文案正常显示。

## 6. 文档交付

- [ ] 编写验收矩阵。
- [ ] 编写操作手册。
- [ ] 编写测试步骤。
- [ ] 编写部署说明。
- [ ] 更新 README。
- [ ] 更新 `.env.example` 中 Agent、OCR、LLM、备份恢复相关配置。

## 7. 测试命令

```bash
cmd /c npx prisma validate --schema packages/database/prisma/schema.prisma
cmd /c npm test
cmd /c npm run build:web
git diff --check
```

## 8. 验收标准

- 端到端验收场景全部通过。
- 权限、安全和期间关闭规则全部通过。
- 文档足够支持业务用户试用。
- GitHub PR 可以按 Phase 拆分提交。

## 9. 建议提交

```bash
git add docs README.md .env.example services/api/tests/supplyChainEndToEndAcceptance.test.mjs apps/web/tests/supplyChainReleaseReadiness.test.mjs
git commit -m "chore(release): prepare supply chain agent acceptance"
```

