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
- 参考书审核记录说明 3 本 EPUB 的可解析状态，并补入可解析文字层发现的遗漏。
- 架构文档明确模块化单体、AI Worker、Agent API、PostgreSQL、附件存储。
- 部署文档明确同一套系统支持内网、私有云/VPN、公网 SaaS。
- Agent 文档明确 dry-run、审批、证据、审计、回放。
- 多人协作文档明确当前个人开发、未来预留多人/多 Agent 并行。
- 本地预览页可以打开所有核心文档。
- 领域层最小测试通过。
- GitHub 仓库有首次提交和 Phase 0 文档提交。
- 研发基础设施就绪：完成代码规范、环境锁定、Agent 规则与测试验证。
- Phase 1 前置遗漏已进入计划：安装/卸载检查、系统管理、数据权限、单据设置、模块初始化、银行对账、UFO 报表和实验式验收。

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
- 安装/卸载检查、系统参数、备份恢复。
- 数据权限、字段权限、Agent 工具权限。
- 单据编号、单据模板、状态流、打印/导出模板。
- 数据检测、历史数据归档、重建索引与性能优化。
- 总账。
- 银行对账。
- 采购与付款。
- 销售与收款。
- 存货。
- 薪资。
- 固定资产。
- 会计报表。
- UFO 报表式自由格式模板和单元格公式。
- AI/API/Agent。
- 外部业务系统与电子商务对接 API。
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

### Task 0.3A 完成参考书补漏审核

目标：读取工作区中的 3 本 EPUB 参考书，对当前计划做补漏审核。若 EPUB 没有可解析文字层，则只记录可解析状态，不继续解析图片页。

文件：

```text
docs/reference-books-audit.md
```

必须记录：

- 3 本 EPUB 的文件名。
- 每本书的可解析文字层状态。
- 能从文字目录中确认的新增功能点。
- 已补入哪些计划文件。

当前新增补漏点：

```text
安装和卸载
系统管理
基础档案初始化顺序
数据权限设置
单据设置
系统日常高级维护（数据检测、归档、重建索引）
外部系统与电子商务集成对接
各模块初始化
银行对账
模块期末处理
UFO 报表式模板能力
实验式验收
```

完成标准：

- 不基于图片页继续推断细节。
- 可解析文字层发现的遗漏已经补入 PRD、路线图和 Phase 0 计划。

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
- 银行对账。
- 单据设置。
- 报表模板和报表输出。

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

### Task 0.10A 建立 Phase 1 实验式验收清单

目标：把《用友ERP-U8财务软件实用教程》中可解析目录确认的实验场景转成后续 Phase 1/Phase 5 的验收清单。

文件：

```text
docs/phase-0-detailed-plan.md
```

后续必须转成用例的实验：

```text
实验1：账务处理前的系统管理
实验2：基础档案设置
实验3：总账管理系统初始设置
实验4：总账管理系统日常业务处理
实验5：总账管理系统银行对账
实验6：总账管理系统期末处理
实验7：UFO报表管理（1）
实验8：UFO报表管理（2）
实验9：UFO报表管理（3）
```

完成标准：

- Phase 1 开始前，至少将实验 1-6 变成平台与总账 MVP 验收用例。
- Phase 5 开始前，将实验 7-9 变成报表模板、公式和输出验收用例。

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

### Task 0.13 配置代码规范与自动化构建

目标：配置代码 Lint 与自动化测试工作流，确保在后续多人或人机协同开发中代码风格一致且能自动验证质量。

文件：

```text
package.json
.prettierrc
.github/workflows/ci.yml
```

必须完成：

- 在 `package.json` 锁定 `pnpm` 包管理器并配置初步格式化脚本。
- 配置基础的 Prettier 规则。
- 设置 GitHub Actions 工作流模板。

### Task 0.14 建立 AI 助手全局规则文件与依赖锁定

目标：把 Agent 操作规范和研发基础环境转化为明确的配置文件，让开发者或 AI 自动遵循。

文件：

```text
.cursorrules
.nvmrc
.env.example
```

必须完成：

- `.cursorrules`：提炼核心架构原则（如写操作要求幂等、财务操作带审计日志等）。
- `.nvmrc`：锁定 Node 运行环境版本（20）。
- `.env.example`：梳理后续所需的环境变量模板。

## 4. Phase 0 交付物清单

| 类型 | 文件 |
| --- | --- |
| 产品需求 | `docs/prd.md` |
| 教材追踪 | `docs/traceability-matrix.md` |
| 架构 | `docs/architecture.md` |
| 部署 | `docs/deployment-topology.md` |
| 参考书审核 | `docs/reference-books-audit.md` |
| Agent 操作 | `docs/agent-operations.md` |
| Agent 原生设计 | `docs/agent-native-design.md` |
| 协作方式 | `docs/multi-team-development.md` |
| 路线图 | `docs/implementation-roadmap.md` |
| Phase 0 详细计划 | `docs/phase-0-detailed-plan.md` |
| API 草案 | `services/api/openapi.yaml` |
| 领域测试 | `packages/domain/tests/*.test.mjs` |
| 本地预览 | `preview/index.html` |
| 开发与环境规范 | `package.json`, `.nvmrc`, `.env.example` |
| AI 规则模板 | `.cursorrules` |

## 5. Phase 0 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 教材 PDF 文字层乱码 | 以目录图像和关键章节抽样确认功能边界 |
| EPUB 参考书无可解析文字层 | 按用户要求不解析图片页，只记录可解析状态 |
| 文档很多但没有代码 | 保留最小领域层测试，确保项目可运行 |
| 未来部署方式不确定 | 同一套代码支持内网、私有云/VPN、公网 SaaS |
| 未来多人协作不确定 | 当前个人优先，保留模块契约和分支策略 |
| Agent 权限风险 | 先定义 dry-run、审批、证据、审计、回放规则 |
| 预览端口冲突 | 固定使用 `8877`，不占用其他项目的 `8765` |

## 6. 进入 Phase 1 的门槛

只有满足以下条件，才进入 Phase 1：

- Phase 0 文档全部存在。
- 参考书补漏审核完成，且可解析文字层发现的遗漏已进入计划。
- 本地预览页可浏览核心文档。
- 领域层测试通过，基础工程规范已配置。
- GitHub 已推送最新文档并配置 CI 流。
- 已建立 AI 助手的全局指导文件（.cursorrules）。
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
银行对账
试算平衡
单据设置
数据权限
基础 Agent 草稿接口
```
