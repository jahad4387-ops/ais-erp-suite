# Supply Chain Agent Phase 1 Detailed Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保护当前供应链 Agent 基线，完成全量验证、修复回归并建立后续开发的干净起点。

**Architecture:** 本阶段只做基线保护和验收加固，不新增业务功能。所有已完成但未提交的供应链 Agent 改动必须通过测试、构建和 WIP commit 固化。

**Tech Stack:** Node test runner, Prisma validate, Vite build, Git.

---

## 1. 开发边界

Phase 1 是后续开发前的保护阶段。它接管 Phase 0 中已经完成但尚未完全保护的工作，尤其是成本凭证 Agent 相关未提交改动。

## 2. 主要任务

### Task 1: 工作区分类

**Files:**

- Inspect: `git status --short`
- Inspect: `git diff --stat`

- [ ] 运行工作区状态检查。

```bash
git status --short --branch
git diff --stat
```

- [ ] 将改动分成三类。

```text
1. 供应链 Agent 成本凭证执行闭环
2. 供应链 phase 计划文档
3. 用户或其它线程未确认改动
```

- [ ] 若存在第三类改动，暂停并确认归属。

### Task 2: 成本凭证 Agent 局部验证

**Files:**

- Test: `services/api/tests/agentSupplyChainTools.test.mjs`
- Test: `packages/database/tests/platformPersistence.test.mjs`
- Test: `packages/database/tests/migration.test.mjs`
- Test: `services/api/tests/openapiContract.test.mjs`
- Test: `apps/web/tests/agentCenterAttachmentUpload.test.mjs`

- [ ] 运行供应链 Agent 测试。

```bash
cmd /c node --test services/api/tests/agentSupplyChainTools.test.mjs
```

Expected:

```text
pass 20
fail 0
```

- [ ] 运行数据库迁移和持久化测试。

```bash
cmd /c node --test packages/database/tests/migration.test.mjs
cmd /c node --test packages/database/tests/platformPersistence.test.mjs
```

- [ ] 运行 OpenAPI 和 Agent Center 静态测试。

```bash
cmd /c node --test services/api/tests/openapiContract.test.mjs
cmd /c node --test apps/web/tests/agentCenterAttachmentUpload.test.mjs
```

### Task 3: Prisma 和全量验证

**Files:**

- Verify: `packages/database/prisma/schema.prisma`
- Verify: `package.json`

- [ ] 运行 Prisma 校验。

```bash
cmd /c npx prisma validate --schema packages/database/prisma/schema.prisma
```

- [ ] 运行全量测试。

```bash
cmd /c npm test
```

- [ ] 运行前端构建。

```bash
cmd /c npm run build:web
```

- [ ] 检查空白错误。

```bash
git diff --check
```

### Task 4: 修复验证失败

**Files:**

- Modify only files indicated by failing tests.

- [ ] 如果测试失败，先记录失败命令和失败断言。
- [ ] 只修复导致失败的最小代码。
- [ ] 重新运行失败命令。
- [ ] 不扩大到新功能。

### Task 5: WIP 保护提交

**Files:**

- Stage only supply-chain Agent cost voucher and plan docs.

- [ ] 暂存确认过的文件。

```bash
git add services/api/src/api.mjs services/api/openapi.yaml services/api/tests/openapiContract.test.mjs services/api/tests/agentSupplyChainTools.test.mjs
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260613150000_supply_chain_cost_voucher_agent/migration.sql packages/database/src/platformPersistence.mjs packages/database/tests/migration.test.mjs packages/database/tests/platformPersistence.test.mjs
git add apps/web/src/pages/AgentCenter.tsx apps/web/tests/agentCenterAttachmentUpload.test.mjs
git add docs/supply-chain-agent-phase-0-detailed-plan.md docs/supply-chain-agent-phase-1-detailed-plan.md docs/supply-chain-agent-phase-2-detailed-plan.md docs/supply-chain-agent-phase-3-detailed-plan.md docs/supply-chain-agent-phase-4-detailed-plan.md docs/supply-chain-agent-phase-5-detailed-plan.md docs/supply-chain-agent-phase-6-detailed-plan.md docs/supply-chain-agent-phase-7-detailed-plan.md
```

- [ ] 提交保护点。

```bash
git commit -m "wip: protect supply chain agent phase plans and cost voucher execution"
```

## 3. 验收标准

- 当前工作区没有未分类改动。
- 成本凭证 Agent 相关测试通过。
- 全量测试通过或失败项有明确记录和修复计划。
- 前端构建通过。
- WIP 保护提交完成。

## 4. 后续入口

Phase 1 完成后，从 `docs/supply-chain-agent-phase-2-detailed-plan.md` 开始做供应链页面上下文 Agent 入口增强。

