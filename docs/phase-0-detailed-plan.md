# Phase 0 详细开发计划：需求冻结与验证资产

## 1. Phase 0 目标

Phase 0 的目标不是开发完整业务功能，而是把后续开发的地基打牢。完成后，项目应该具备清晰的产品边界、教材功能追踪、架构方向、部署策略、Agent 策略、协作方式、API 草案、本地预览入口和最小可运行测试。

一句话：

```text
先把“要做什么、怎么做、怎么验收、怎么让 Agent 接手”说清楚，再进入 Phase 1 写核心业务代码。
```

## 2. Phase 0 完成标准

Phase 0 完成时必须满足：

- PRD 覆盖总账、采购、销售、存货、薪资、固定资产、报表、AI/Agent。
- 功能追踪矩阵覆盖教材第 1 章到第 9 章。
- 架构文档明确模块化单体、AI Worker、Agent API、PostgreSQL、附件存储。
- 部署文档明确同一套系统支持内网、私有云/VPN、公网 SaaS。
- Agent 文档明确 dry-run、审批、证据、审计、回放。
- 多人协作文档明确当前个人开发、未来预留多人/多 Agent 并行。
- 本地预览页可以打开所有核心文档。
- 领域层最小测试通过。
- GitHub 仓库有首次提交和 Phase 0 文档提交。

验证命令：

```powershell
C:\Users\jin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/run-domain-tests.mjs
```

预期结果：

```text
tests 5
pass 5
fail 0
```

## 3. Phase 0 任务列表

### Task 0.1 建立仓库骨架

目标：建立项目最小目录结构，让后续前端、后端、AI Worker、领域模型和文档都有固定位置。

文件：

```text
README.md
package.json
apps/web/README.md
apps/desktop/README.md
services/api/openapi.yaml
services/ai-worker/README.md
packages/domain/package.json
packages/domain/src/moduleCatalog.mjs
packages/domain/src/ledger.mjs
packages/domain/tests/moduleCatalog.test.mjs
packages/domain/tests/ledger.test.mjs
scripts/run-domain-tests.mjs
```

完成标准：

- 根目录说明项目目标。
- `apps/`、`services/`、`packages/`、`docs/` 目录存在。
- 领域层测试能运行。
- GitHub 仓库可访问。

验证：

```powershell
Get-ChildItem -LiteralPath C:\antigra-workplace\ais-erp-suite
```

### Task 0.2 完成 PRD

目标：把产品目标、角色、模块范围、非功能需求和验收标准写清楚。

文件：

```text
docs/prd.md
```

必须覆盖：

- 产品目标。
- 用户角色。
- 系统管理与基础档案。
- 总账。
- 采购与付款。
- 销售与收款。
- 存货。
- 薪资。
- 固定资产。
- 会计报表。
- AI/API/Agent。
- 非功能需求。
- 关键验收标准。

验证：

```powershell
Select-String -LiteralPath docs/prd.md -Pattern "总账","采购与付款","销售与收款","存货","薪资","固定资产","会计报表","AI/API/Agent"
```

完成标准：

- 每个核心模块至少有一组明确功能点。
- 非功能需求包含安全、审计、性能、可用性、可迁移、多人同步、部署弹性。

### Task 0.3 完成功能追踪矩阵

目标：把教材章节映射到软件需求，确保“完整实现教材功能”有追踪依据。

文件：

```text
docs/traceability-matrix.md
```

必须覆盖：

```text
第 1 章 会计信息系统概述
第 2 章 规划、分析与设计
第 3 章 账务处理与总账子系统
第 4 章 采购与付款核算与管理
第 5 章 销售与收款核算与管理
第 6 章 存货核算与管理
第 7 章 其他业务核算与管理
第 8 章 会计报表编制
第 9 章 会计信息系统建设
```

验证：

```powershell
Select-String -LiteralPath docs/traceability-matrix.md -Pattern "第 1 章","第 2 章","第 3 章","第 4 章","第 5 章","第 6 章","第 7 章","第 8 章","第 9 章"
```

完成标准：

- 每一章都有需求编号。
- 每一章都有产品模块。
- 每一章都有验收方式。

### Task 0.4 完成总体架构设计

目标：确定系统采用模块化单体 + 独立 AI Worker，并明确主要模块边界。

文件：

```text
docs/architecture.md
```

必须覆盖：

- 架构选择。
- 部署拓扑摘要。
- 技术建议。
- 模块边界。
- 核心数据原则。
- 最小领域对象。
- 旧 AI 财务软件迁移策略。

完成标准：

- 明确不做单机共享文件账套。
- 明确正式数据不物理删除。
- 明确已记账数据通过冲销、调整或受控反向流程处理。
- 明确中心数据库和附件存储。

### Task 0.5 完成内网与公网兼容部署设计

目标：确保同一套系统可以部署在局域网、私有云/VPN 和公网 SaaS。

文件：

```text
docs/deployment-topology.md
```

必须覆盖：

- 为什么不用共享文件夹。
- 共同系统架构。
- 局域网内网部署。
- 私有云/VPN 部署。
- 公网 SaaS 部署。
- 多人实时同步。
- 并发控制。
- 数据隔离。
- 安全设计。
- 配置方式。
- 对 Agent 的影响。
- 部署验收标准。

完成标准：

- 明确同一套代码、同一套业务规则、同一套 API。
- 明确部署差异通过配置和基础设施处理。
- 明确多人同步由中心服务器和中心数据库负责。

### Task 0.6 完成 Agent 操作规范

目标：定义 Agent 可以做什么、不能做什么、高风险动作如何审批。

文件：

```text
docs/agent-operations.md
```

必须覆盖：

- Agent 目标。
- 风险分级。
- Agent API 原则。
- AI 记账任务。
- 应收催收任务。
- 月末结账助手。
- Agent Action 状态机。
- 审计字段。

完成标准：

- 写操作必须支持 `dryRun=true`。
- 写操作必须提交 `idempotencyKey`。
- 高风险动作必须审批。
- Agent 不能直接绕过业务 API 修改正式财务数据。

### Task 0.7 完成 Agent 原生系统设计

目标：让系统从设计上支持 Agent 像虚拟员工一样工作，而不是只模拟点击页面。

文件：

```text
docs/agent-native-design.md
```

必须覆盖：

- Agent Gateway。
- Tool Registry。
- Task Engine。
- Evidence Store。
- Approval Workflow。
- Replay 与 Audit。
- Agent Action 数据模型。
- Agent API 设计方向。
- UI 的 Agent-friendly 要求。
- 开发路线。
- 验收标准。

完成标准：

- Agent 通过工具接口工作。
- 所有正式动作可追溯到证据。
- 每个 Agent 动作可以回放。

### Task 0.8 完成个人优先、预留多人协作方案

目标：短期支持个人开发，长期支持多人和多 Agent 并行开发。

文件：

```text
docs/multi-team-development.md
```

必须覆盖：

- 当前阶段定位。
- 开发原则。
- 模块边界。
- 个人开发节奏。
- 分支策略。
- 模块契约。
- 接口优先。
- Agent 参与开发规则。
- PR 规则。
- 验收方式。

完成标准：

- 当前个人开发不被复杂流程拖慢。
- 未来多人加入时有模块边界、分支和 PR 规则。
- Agent 任务必须有明确文件范围。

### Task 0.9 建立 API 草案

目标：先定义关键接口方向，避免后续前端、后端、Agent 各做各的。

文件：

```text
services/api/openapi.yaml
```

必须覆盖：

- 账套。
- 会计期间。
- 凭证。
- 账簿。
- 采购付款。
- 销售收款。
- 存货。
- 薪资。
- 固定资产。
- 报表。
- AI 建议。
- Agent Action。
- 结账检查。

验证：

```powershell
Select-String -LiteralPath services/api/openapi.yaml -Pattern "/vouchers","/agent-actions","/close/checklist","/procure-to-pay","/order-to-cash","/inventory"
```

完成标准：

- 核心模块都有初始 API 入口。
- Agent 相关接口存在。
- 后续 Phase 1 可在此基础上细化。

### Task 0.10 建立最小领域测试

目标：项目不是纯文档，至少有可运行的领域规则测试。

文件：

```text
packages/domain/src/moduleCatalog.mjs
packages/domain/src/ledger.mjs
packages/domain/tests/moduleCatalog.test.mjs
packages/domain/tests/ledger.test.mjs
scripts/run-domain-tests.mjs
```

必须验证：

- 模块目录覆盖所有教材产品区域。
- 总账模块包含凭证和期末责任。
- 借贷平衡凭证可以通过。
- 借贷不平衡凭证会被拒绝。
- 凭证余额能返回借方、贷方和差额。

验证：

```powershell
C:\Users\jin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/run-domain-tests.mjs
```

完成标准：

```text
tests 5
pass 5
fail 0
```

### Task 0.11 建立本地文档预览

目标：让非开发视角也能直接浏览项目文档，不必在文件夹里找 Markdown。

文件：

```text
preview/index.html
scripts/start-preview.ps1
```

访问地址：

```text
http://127.0.0.1:8877/preview/index.html
```

启动命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-preview.ps1
```

完成标准：

- 预览页可以打开。
- 左侧包含所有核心文档入口。
- 本项目固定使用 `8877` 端口，避免和其他项目冲突。

### Task 0.12 完成 GitHub 初始化

目标：所有 Phase 0 资产进入 GitHub，方便后续持续开发。

远程仓库：

```text
https://github.com/jahad4387-ops/ais-erp-suite
```

必须完成：

- 初始化 Git 仓库。
- 首次提交。
- 推送 `main`。
- 后续文档变更持续提交。

验证：

```powershell
git log --oneline -5
git status --short --branch
```

完成标准：

- `main` 跟踪 `origin/main`。
- GitHub 上能看到最新文档。
- 本地没有未提交的核心文档改动。

## 4. Phase 0 交付物清单

| 类型 | 文件 |
| --- | --- |
| 产品需求 | `docs/prd.md` |
| 教材追踪 | `docs/traceability-matrix.md` |
| 架构 | `docs/architecture.md` |
| 部署 | `docs/deployment-topology.md` |
| Agent 操作 | `docs/agent-operations.md` |
| Agent 原生设计 | `docs/agent-native-design.md` |
| 协作方式 | `docs/multi-team-development.md` |
| 路线图 | `docs/implementation-roadmap.md` |
| Phase 0 详细计划 | `docs/phase-0-detailed-plan.md` |
| API 草案 | `services/api/openapi.yaml` |
| 领域测试 | `packages/domain/tests/*.test.mjs` |
| 本地预览 | `preview/index.html` |

## 5. Phase 0 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 教材 PDF 文字层乱码 | 以目录图像和关键章节抽样确认功能边界 |
| 文档很多但没有代码 | 保留最小领域层测试，确保项目可运行 |
| 未来部署方式不确定 | 同一套代码支持内网、私有云/VPN、公网 SaaS |
| 未来多人协作不确定 | 当前个人优先，保留模块契约和分支策略 |
| Agent 权限风险 | 先定义 dry-run、审批、证据、审计、回放规则 |
| 预览端口冲突 | 固定使用 `8877`，不占用其他项目的 `8765` |

## 6. 进入 Phase 1 的门槛

只有满足以下条件，才进入 Phase 1：

- Phase 0 文档全部存在。
- 本地预览页可浏览核心文档。
- 领域层测试通过。
- GitHub 已推送最新文档。
- 平台与总账 MVP 的边界已经明确。

Phase 1 的第一批开发对象：

```text
账套
用户
角色权限
会计期间
科目
凭证
审核
记账
试算平衡
基础 Agent 草稿接口
```
