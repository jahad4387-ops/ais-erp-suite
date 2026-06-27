# AIS ERP Suite 本地开发全盘核查与项目进展报告

核查日期：2026-06-27
核查工作区：`D:\codex工作区\ais-erp-suite`
当前分支：`main`
核查基线提交：`cc3c809 docs: add phase 5 acceptance report`
远端仓库：`https://github.com/jahad4387-ops/ais-erp-suite.git`

## 1. 总体结论

本次核查确认：当前仓库已经不是单纯的项目计划或空骨架，而是一个覆盖 Phase 0 至 Phase 5 的 AIS/ERP 高覆盖 MVP。项目已经具备 Web 前端、Node API、Prisma 数据模型、领域规则、OpenAPI 契约、Electron 桌面壳、文档预览页、阶段验收报告和 290 个自动化测试。

项目最强的地方在于：财务规则、阶段验收、OpenAPI 契约、受控 AI/Agent 边界、审计、幂等、附件、报表快照和跨模块核算链路都有明确设计和测试证据。它的开发方向是先进的，尤其是 Agent 原生财务系统设计，没有把 AI 当成简单聊天框，而是围绕 dry-run、证据、审批、审计和 Replay 做生产级约束。

项目当前最大的问题不在业务覆盖，而在工程硬化：API 主实现文件已经接近一万行，Prisma schema 已经超过两千行，财务金额仍大量使用 `Float`，Phase 6 Agent Gateway/Replay/Tool Registry 仍主要停留在设计和 OpenAPI 契约层，CI 只跑 domain 测试，根目录 pnpm workspace 配置不完整。这些问题不影响当前 MVP 验收，但会影响后续生产化、多人开发、审计合规和长期维护。

建议下一阶段不要继续盲目加业务模块，而是插入一个“生产化硬化阶段”：拆 API 模块、修金额精度、补 Agent 持久化与 Replay、升级 CI、补根级 pnpm workspace、修 dev audit、完善 PostgreSQL 部署和浏览器 E2E。

## 2. 本次核查范围

本次核查覆盖以下内容：

- Git 状态、远端、当前分支和提交基线。
- 根目录、apps、services、packages、docs、scripts、.github 的文件结构。
- PRD、架构、实施路线图、Phase 1-6 计划、Phase 1-5 验收报告。
- Web 前端页面、路由、测试、构建与 lint。
- API 服务、OpenAPI 契约、权限、幂等、AI dry-run、附件、报表、跨模块流程。
- Prisma schema、迁移 SQL、数据库持久化测试。
- domain 领域规则测试。
- CI 配置、包管理器配置、依赖安装和安全审计。
- 已完成能力、未完成能力、工程风险、下一步开发工序。

本次没有提交任何业务代码改动，也没有改动 `.env`、凭据、私有数据或构建产物。

## 3. 仓库结构盘点

已跟踪文件数：249

顶层文件分布：

| 区域 | 文件数 | 说明 |
| --- | ---: | --- |
| `apps` | 124 | Web 前端和桌面端说明，Web 页面与静态回归测试是当前最大实现区。 |
| `docs` | 56 | PRD、架构、路线图、阶段计划、验收报告、QA 截图、模板和任务计划。 |
| `packages` | 46 | 领域规则、Prisma schema、迁移、数据库持久化和 seed 脚本。 |
| `services` | 7 | API 服务、OpenAPI、AI worker 说明。 |
| `scripts` | 4 | 测试聚合、预览启动、Electron/Prisma 打包辅助脚本。 |
| `.github` | 1 | CI workflow。 |

主要技术栈：

| 层 | 当前实现 |
| --- | --- |
| 前端 | React 19、Ant Design 6、React Router 7、Vite 8、TypeScript 6 |
| API | Node.js ESM、自研 HTTP/router、内存状态 + 部分 Prisma 持久化 |
| 数据库 | Prisma schema，当前 provider 为 SQLite，文档目标为 PostgreSQL/生产部署兼容 |
| 桌面 | Electron 42 + electron-builder |
| 测试 | Node test runner，API/domain/database/web 文本回归/文档验收测试 |
| AI/Agent | API 内已有 dry-run 草稿能力；独立 AI worker 仍是职责说明 |

## 4. 验证命令与结果

### 4.1 依赖安装

执行：

```powershell
npx pnpm@9.1.0 install --frozen-lockfile
npm install
```

结果：

- `pnpm` 安装成功，但提示根目录 `package.json` 的 `workspaces` 字段不被 pnpm 识别，需要根级 `pnpm-workspace.yaml`。
- 因 pnpm 未安装 web workspace 的 `tsc`/Vite 依赖，本次继续执行 `npm install` 对齐 `package-lock.json`。
- `npm install` 成功，安装后可运行 web lint 和 web build。
- `npm install` 报告 2 个 high severity audit 项；生产依赖审计为 0 漏洞，详见安全审计小节。

环境版本：

```text
node v24.13.0
npm 11.6.2
pnpm 9.1.0 via npx
```

注意：仓库 `.nvmrc` 指定 Node 20，本地实际验证使用 Node 24.13.0。CI 会按 `.nvmrc` 使用 Node 20。

### 4.2 自动化测试

执行：

```powershell
npm test
```

结果：

```text
tests 290
pass 290
fail 0
cancelled 0
skipped 0
todo 0
```

测试覆盖到：

- module catalog 与教材功能边界。
- general ledger 凭证平衡、提交、审核、记账、试算平衡。
- Phase 1-5 数据库迁移 SQL 结构。
- Prisma 平台持久化。
- OpenAPI 契约、权限、风险等级、幂等和 Agent 字段。
- API 端到端流程：账套、期间、科目、辅助核算、期初、凭证、记账、银行对账、附件、AI 草稿。
- Phase 2 采购、销售、收付款、核销、往来、账龄、信用。
- Phase 3 存货、BOM、出入库、移动平均、FIFO、生产工单、成本分配、成本凭证草稿、库存对账。
- Phase 4 薪资、个税累计、工资发放、分摊、固定资产、折旧、处置、盘点、对账。
- Phase 5 报表模板、UFO 设计器、公式快照、法定报表、现金流拦截、导出、AI 解读、管理分析。
- Web 静态回归测试和文档验收测试。

### 4.3 Web lint

执行：

```powershell
npm run lint --workspace apps/web
```

结果：通过，无 ESLint 错误输出。

### 4.4 Web production build

执行：

```powershell
npm run build:web
```

结果：通过。

构建产物摘要：

```text
dist/index.html                   0.48 kB gzip 0.33 kB
dist/assets/index-*.css           1.78 kB gzip 0.81 kB
dist/assets/index-*.js        1,603.06 kB gzip 461.59 kB
```

Vite 警告：

- 主 JS chunk 超过 500 kB。
- 建议后续使用动态导入和代码分割。
- 这是构建警告，不是失败。

### 4.5 Prisma schema

首次执行：

```powershell
npm run prisma:validate --workspace packages/database
```

首次结果：失败，原因是环境变量 `DATABASE_URL` 未设置。

根因：

```text
schema.prisma 使用 env("DATABASE_URL")
```

补充环境变量后重跑：

```powershell
$env:DATABASE_URL='file:./dev.db'
npm run prisma:validate --workspace packages/database
```

重跑结果：通过。

```text
The schema at prisma\schema.prisma is valid
```

结论：Prisma schema 有效，但验证命令必须带 `DATABASE_URL`。

### 4.6 Git 空白差异检查

执行：

```powershell
git diff --check
```

结果：通过，无空白错误。

备注：Git 输出了 `README.md` 后续触碰时 LF 会替换为 CRLF 的行尾提示。这不是 `git diff --check` 失败项，但建议后续统一仓库 Markdown 行尾策略。

### 4.7 安全审计

执行：

```powershell
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

结果：

| 命令 | 结果 |
| --- | --- |
| `npm audit --audit-level=high` | 失败，2 个 high severity |
| `npm audit --omit=dev --audit-level=high` | 通过，0 vulnerabilities |

完整 audit 的 high 项：

- `form-data 4.0.0 - 4.0.5`，CRLF injection advisory。
- `undici <=6.26.0 || 7.0.0 - 7.27.2`，多项 HTTP/TLS/WebSocket advisory。

判断：

- 当前生产依赖路径审计为 0。
- 风险主要来自开发/打包依赖树。
- 仍建议在下一轮工程硬化中执行受控依赖升级，而不是在本次审计报告提交里直接自动 `npm audit fix`。

## 5. 当前项目进展

### 5.1 Phase 0：需求冻结与验证资产

状态：已完成并持续被后续阶段引用。

已具备：

- `docs/prd.md`：产品目标、角色、功能范围、非功能需求、验收标准。
- `docs/traceability-matrix.md`：教材章节到产品模块映射。
- `docs/architecture.md`：模块化单体 + AI worker + Agent API 架构。
- `docs/deployment-topology.md`：内网、私有云/VPN、公网 SaaS 三种部署模式。
- `docs/ui-design.md`：ERP 前端信息架构、页面模式和 Agent-friendly 要求。
- `docs/agent-operations.md`、`docs/agent-native-design.md`：Agent 权限、dry-run、审批、证据和审计原则。
- `preview/index.html`：文档和 UI 预览入口。

评价：

- Phase 0 文档质量较高，范围清楚。
- 追踪矩阵让“教材功能覆盖”可验收，不只是主观描述。

### 5.2 Phase 1：平台与总账 MVP

状态：已实现并有验收报告。

已具备：

- 账套、组织、期间、用户、角色、权限。
- 账套用户授权和账套隔离。
- 科目、科目编码规则、辅助核算、期初余额。
- 凭证草稿、提交、审核、驳回、作废、冲销、复制、删除。
- 凭证号生成、状态日志、附件上传/关联/状态检查。
- 记账、批量记账、部分失败处理、日记账、总账、明细账、余额表、试算平衡。
- 银行流水导入、银行对账、自动匹配。
- AI 凭证建议 dry-run，人工确认后转正式凭证草稿。
- Prisma 平台持久化切换和本地内存 MVP 模式。
- Phase 1 操作手册、部署手册、测试步骤和验收矩阵。

测试证据：

- Phase 1 相关 API、数据库、前端静态回归和文档验收都在 `npm test` 中通过。

### 5.3 Phase 2：采购付款 + 销售收款

状态：已实现并有验收报告。

已具备：

- 往来单位主数据，支持 customer/supplier/both。
- P2P：采购订单、到货/入库、采购发票、应付、付款申请、付款、冻结付款、AP 核销。
- O2C：销售订单、发货/出库、销售发票、应收、收款、AR 核销。
- AR/AP netting，应收冲应付。
- 供应商/客户往来账、账龄、付款计划、回款计划、信用敞口。
- Agent dry-run：核销建议、催收草稿、异常检查。
- Web 页面：伙伴档案、订单、履约、发票、往来账、付款工作台、收款工作台、核销工作台、分析页。

剩余边界：

- 复杂库存成本回算留给 Phase 3。
- 薪资、折旧、制造成本留给 Phase 4。
- 生产级 Agent gateway 留给 Phase 6。

### 5.4 Phase 3：存货、生产与成本

状态：已实现，并已经与 Phase 4 的正式成本池完成测试覆盖。

已具备：

- 存货档案、BOM、仓库、库位、期初库存。
- 出入库、调拨、盘点。
- 移动平均、FIFO、成本层、零数量金额余值处理。
- 生产工单、领料、完工入库。
- Phase 3 mock/manual 成本输入。
- Phase 4 payroll/depreciation cost pool 正式成本输入。
- 成本分配 dry-run 和 commit。
- 成本凭证草稿，保留人工审核边界。
- 存货对账和成本调整。
- Web 页面：存货档案、BOM、仓库、库存期初、库存移动、调拨、盘点、库存台账、生产工单、领料、完工、成本输入、成本分配、成本凭证、库存对账。

重要进展：

- Phase 3 初期 mock/manual 成本池的限制已经通过 Phase 4 formal cost pool 集成得到补强。
- 测试中已覆盖 Phase 4 成本池被 Phase 3 成本分配消费且不再出现 mock warning 的场景。

### 5.5 Phase 4：薪资与固定资产

状态：已实现并有验收报告。

已具备：

- 薪资类别、工资项目、员工薪资档案、变量导入。
- 工资计算，支持月内累计个税、人工调整、社保公积金、净发和公司成本。
- 工资批次审核、锁定、付款文件、工资分摊、工资成本池输出。
- 固定资产类别、折旧方法、资产卡片、新增、变动、转移。
- 折旧 dry-run、审批、锁定、提足折旧刹车。
- 固定资产折旧成本池输出。
- 资产处置、资产盘点、固定资产台账、固定资产对账。
- Phase 4 成本池回流 Phase 3 生产成本分配。

财务控制点：

- 折旧不能突破残值/净值边界。
- 当月新增、当月减少的折旧规则有设计和测试覆盖。
- 未审核/未锁定成本池不能被正式成本分配消费。

### 5.6 Phase 5：报表与管理分析

状态：已实现并有验收报告。

已具备：

- UFO 式报表模板、模板版本、sheet、cell、公式、依赖。
- 法定报表预设：资产负债表、利润表、现金流量表、所有者权益变动表。
- 报表运行、公式快照、锁定、重算控制。
- 已锁定报表只基于快照渲染和导出。
- 单元格 drilldown，支持追溯公式、来源余额、明细账、凭证。
- 现金流量表未分配现金流拦截，阻止提交/锁定。
- 报表审批、导出、AI 解读。
- 管理分析：采购、销售、存货、往来、现金流、人工成本、折旧成本、经营概览、预警和 drilldown。
- 报表列表具备账套范围隔离。

评价：

- Phase 5 是当前项目完成度最高的亮点之一。
- 报表快照和数据血缘设计优于普通 MVP。

### 5.7 Phase 6：Agent 工作流与生产化

状态：设计先进，但实现尚未完成。

已具备：

- 文档层设计：Agent Gateway、Tool Registry、Task Engine、Evidence Store、Approval Workflow、Replay/Audit。
- OpenAPI 层已经声明 `/agent-actions`、审批、执行等契约。
- API 已有若干 AI/Agent dry-run 类能力：凭证建议、核销建议、催收草稿、异常检查、报表解读证据引用。
- Web 有 Agent Center 页面，支持附件上传、AI 凭证草稿、Phase 2 dry-run。

尚未具备：

- Prisma schema 未出现 `AgentAction`、`AgentTool`、`AgentApproval`、`AgentReplayEvent` 等持久化模型。
- API runtime 没有真正实现 `/agent-actions` 路由。
- 前端没有完整 Agent 动作列表、审批队列、Tool Registry、Evidence Hash 校验页、Replay 回放页。
- AI worker 仍是 README，没有实际 OCR/LLM 服务、评估集、提示词版本、模型供应商适配器。

结论：

- Phase 6 应作为下一阶段重点。
- 在进入 Phase 6 前，建议先做架构和金额精度硬化，否则 Agent 执行链会放大现有技术债。

## 6. 关键实现内容清单

### 6.1 Web 前端

主要路径：`apps/web`

已实现页面范围：

- 平台：登录、账套、期间、用户权限、部署配置、审计日志。
- 总账：科目、编码规则、辅助核算、期初、凭证录入、凭证管理、凭证审核、批量记账、账簿报表、银行对账。
- 采购销售：伙伴、订单、履约、发票、付款、收款、AP/AR 核销、往来和分析。
- 存货生产：存货、BOM、仓库、期初、出入库、调拨、盘点、库存台账、工单、领料、完工、成本分配、成本凭证、库存对账。
- 薪资固资：薪资设置、薪资运行、固资设置、资产卡片、折旧、处置、盘点、固资对账。
- 报表：传统报表、UFO 设计器、报表运行、报表审批、导出与 AI 解读、管理分析。
- Agent：智能助手中心。

当前前端风险：

- 主 bundle 约 1.6 MB，后续需要路由级动态导入。
- 部分页面仍有英文 placeholder 和原型式输入，例如直接输入对象 ID。
- Phase 6 Agent 专用页面未完成。

### 6.2 API 服务

主要路径：`services/api`

已实现内容：

- 自研 HTTP server 和 route handler。
- 登录、token、权限、角色、用户、账套授权。
- 内存状态 MVP 和 Prisma platform persistence 部分切换。
- 174 个 OpenAPI 路径。
- 写操作幂等键要求和权限映射。
- 大量跨模块业务流程和审计日志。
- 附件本地/外部对象存储元数据校验。
- AI dry-run 和人工确认边界。

主要风险：

- `services/api/src/api.mjs` 约 9546 行，模块边界已经过大。
- 路由、权限、业务规则、状态存储混在同一文件中。
- 后续 Phase 6 不应继续在该文件上堆功能。

### 6.3 数据库与 Prisma

主要路径：`packages/database`

当前数据模型：

- `schema.prisma` 约 2027 行。
- Prisma model 数：111。
- 迁移 SQL 覆盖 Phase 1-5。
- 支持权限、账套、期间、总账、购销、存货、薪资、固定资产、报表等对象。

主要风险：

- `Float` 使用 187 处，涉及金额、余额、税额、单价、成本、工资、折旧、报表值。
- 财务系统建议迁移到 `Decimal` 或整数最小货币单位。
- 文档目标提到 PostgreSQL，但当前 Prisma provider 是 SQLite，需要生产数据库迁移和兼容计划。

### 6.4 Domain 包

主要路径：`packages/domain`

已实现：

- 模块目录覆盖教材产品区域。
- 平台账套和期间规则。
- 总账领域函数：科目、凭证、提交、审核、记账、作废、冲销、试算平衡。

评价：

- domain 包是当前最干净的部分。
- 后续建议把更多业务规则从 API 大文件中抽回 domain/application service 层。

### 6.5 AI Worker

主要路径：`services/ai-worker`

当前状态：

- 只有 README。
- 职责定义清楚：OCR、票据结构化、LLM 调用、提示词版本、凭证草稿、核销建议、结账检查、报表解读、Agent dry-run、风险评估、证据链整理。

未完成：

- 没有实际 worker server。
- 没有 OCR pipeline。
- 没有 LLM provider adapter。
- 没有评估集和提示词版本管理。
- 没有异步任务队列或任务状态回写。

### 6.6 Desktop

主要路径：`desktop`、`apps/desktop`

当前状态：

- Electron main 入口存在。
- desktop README 明确它不是完整 ERP 唯一实现位置，主要复用 Web/API。
- `dist:exe` 脚本存在，但本次未打包 portable exe。

未验证项：

- 未执行 `npm run dist:exe`。
- 未验证 Electron portable 包体积、启动、Prisma 准备脚本和运行时路径。

## 7. 当前开发工序复盘

从提交历史和阶段文档看，项目工序基本是：

1. 先冻结产品边界和教材追踪矩阵。
2. 搭建 monorepo、domain、API 契约、Web 壳、AI worker 壳。
3. Phase 1 建总账内核，保证账套、期间、凭证、记账、账簿、附件、权限可跑。
4. Phase 2 接入采购付款和销售收款，建立业务单据到往来账和总账凭证的闭环。
5. Phase 3 接入存货、生产、成本，先用 mock/manual 成本池验证生产成本分配。
6. Phase 4 接入薪资和固定资产，补正式人工/折旧成本池，反哺 Phase 3。
7. Phase 5 建报表模板、公式快照、锁定、导出、AI 解读和管理分析。
8. Phase 6 文档已经设计，但运行时实现尚未完成。

这个工序总体正确。它先保总账，再做业务，再做成本，再做报表，最后做 Agent 生产化，符合财务系统建设规律。

## 8. 优点清单

1. 业务闭环意识强：不是只做 CRUD，而是围绕凭证、账簿、报表、对账、审批、审计闭环。
2. 阶段计划完整：Phase 0-6 分工清晰，验收报告能回溯。
3. Agent 安全理念先进：dry-run、证据、审批、Replay、权限和外部资金/通讯隔离都已进入设计。
4. 报表设计较成熟：公式快照、锁定后断连渲染、现金流异常拦截、单元格 drilldown 都是好设计。
5. 测试数量和覆盖面优于普通 MVP：当前 290 个测试通过。
6. 部署意识较强：内网、私有云/VPN、公网 SaaS 三种拓扑都有设计。
7. 权限和账套隔离有实际测试，而不是只写文档。
8. 附件和证据链有早期实现，支持后续 Agent 审计体系。

## 9. 风险与缺口清单

| 优先级 | 风险 | 影响 | 建议 |
| --- | --- | --- | --- |
| P0 | 财务金额大量使用 `Float` | 审计、汇总、对账、税额和工资可能出现精度风险 | 设计金额类型迁移，优先总账、往来、存货成本、薪资、折旧、报表 |
| P0 | API 单文件 9546 行 | 继续开发会快速失控，权限/幂等/事务难一致 | 拆模块、拆 router、拆 application service、拆 repository |
| P0 | Phase 6 Agent runtime 未实现 | Agent 原生能力仍不能生产化落地 | 建 `agent` 模块、持久化模型、Tool Registry、Replay、Evidence Hash |
| P1 | CI 只跑 domain 测试 | PR 可能漏过 API/web/schema/build 失败 | CI 加全量 `npm test`、lint、build、Prisma validate、audit omit dev |
| P1 | pnpm workspace 配置缺失 | 新环境使用 pnpm 不能完整安装 workspace | 增加根级 `pnpm-workspace.yaml` 或统一改 npm |
| P1 | dev audit 有 2 个 high | 桌面/构建链路存在依赖安全风险 | 受控升级 `form-data`、`undici` 相关依赖 |
| P1 | SQLite 与 PostgreSQL 目标不一致 | 生产部署、事务、索引、报表性能需要二次验证 | 规划 PostgreSQL schema/migration/profile |
| P1 | Web bundle 过大 | 初始加载慢，Electron 包也会变重 | 路由级 lazy loading 和代码分割 |
| P2 | AI worker 只是 README | OCR/LLM 能力未真正服务化 | 建 worker 服务、任务队列、provider adapter、eval set |
| P2 | 部分 UI 仍偏原型 | 业务人员需要更少 ID 输入、更强选择器和状态引导 | 用业务对象选择器替代裸 ID 输入 |
| P2 | Electron exe 未验证 | 桌面交付还缺真实包体和安装体验验证 | 单独跑 `dist:exe`，记录包体、启动、数据路径 |

## 10. 推荐下一步开发工序

### 第 1 步：工程硬化小阶段

目标：让项目进入可继续扩展的结构。

任务：

- 建根级 `pnpm-workspace.yaml` 或明确弃用 pnpm 改 npm。
- 升级 CI 到完整 gate。
- 拆分 `services/api/src/api.mjs`：
  - `src/http/router.mjs`
  - `src/security/permissions.mjs`
  - `src/platform/*`
  - `src/general-ledger/*`
  - `src/procure-to-pay/*`
  - `src/order-to-cash/*`
  - `src/inventory-costing/*`
  - `src/payroll/*`
  - `src/fixed-assets/*`
  - `src/reporting/*`
  - `src/agent/*`
- 给每个模块建立 route、service、repository、domain rule 边界。

### 第 2 步：金额精度迁移

目标：避免财务审计硬伤。

任务：

- 设计 `Money`/`Quantity` 类型策略。
- Prisma 金额改 `Decimal` 或整数最小单位。
- API/OpenAPI 明确金额字符串或 decimal 传输。
- 前端金额输入和显示统一格式化。
- 添加金额边界测试：0.1 + 0.2、税额尾差、批量核销、库存成本余值、工资个税、折旧刹车、报表汇总。

### 第 3 步：Phase 6 Agent 基础设施

目标：把先进设计落到可运行系统。

任务：

- Prisma 增加：
  - `Agent`
  - `AgentTool`
  - `AgentToolPermission`
  - `AgentAction`
  - `AgentToolInvocation`
  - `AgentApproval`
  - `AgentEvidenceRef`
  - `AgentReplayEvent`
  - `IdempotencyRecord`
- 实现 `/agent-actions`、approve、execute、replay。
- 实现 Tool Registry schema 校验。
- 实现 Evidence Hash 二次校验。
- 实现 Agent Token 与 User Token 的执行边界。
- 前端实现 Agent 动作列表、审批队列、Tool Registry、证据链、Replay。

### 第 4 步：AI Worker 真实服务化

目标：让 AI 不只停留在 API 内 dry-run mock。

任务：

- 建 worker server。
- OCR/票据结构化接口。
- LLM provider adapter。
- prompt/version registry。
- AI 记账评估集。
- 任务队列和回写。
- 与 AgentAction/EvidenceStore 打通。

### 第 5 步：生产部署与运维

目标：让系统进入可部署验收状态。

任务：

- PostgreSQL 部署 profile。
- 数据备份/恢复演练。
- 附件对象存储适配器。
- 性能压测：百万分录账簿、报表公式、库存成本。
- 安全演练：越权、幂等重放、证据篡改、恢复环境静默沙箱。
- Electron portable 打包和启动验收。

## 11. 建议更新 CI

当前 `.github/workflows/ci.yml` 只跑：

```yaml
pnpm run test:domain
```

建议升级为：

```yaml
npm ci
npm test
npm run lint --workspace apps/web
npm run build:web
DATABASE_URL=file:./dev.db npm run prisma:validate --workspace packages/database
npm audit --omit=dev --audit-level=high
git diff --check
```

如果继续使用 pnpm，应先补根级 `pnpm-workspace.yaml`，否则 workspace 安装行为不可靠。

## 12. 本次未运行或未覆盖的项目

为了避免误报，本节明确列出本次未验证项：

- 未运行 `npm run dist:exe`，因此未验证 Electron portable exe 打包。
- 未启动 Web dev server 做浏览器点击流测试。
- 未重新捕获视觉 QA 截图；仓库已有 Phase 1 visual smoke 截图。
- 未执行真实 PostgreSQL 迁移部署；当前 Prisma validate 使用 SQLite URL。
- 未调用真实 OCR、OpenAI、Anthropic 或其他 LLM 服务。
- 未执行 `npm audit fix`，因为这会改依赖锁文件，建议作为单独受控任务处理。

## 13. GitHub 更新建议摘要

本次报告建议随提交推送到 GitHub，作为当前项目真实状态说明。

建议 commit 信息：

```text
docs: add full development audit report
```

后续推荐 issue/任务拆分：

1. `chore: add root pnpm workspace and expand CI gate`
2. `refactor(api): split monolithic API routes into modules`
3. `feat(database): migrate financial amounts from Float to Decimal`
4. `feat(agent): implement AgentAction persistence and replay`
5. `feat(ai-worker): add OCR and LLM worker runtime`
6. `perf(web): split routes and reduce initial bundle size`
7. `chore(security): resolve dev dependency audit findings`

## 14. 最终判断

AIS ERP Suite 当前已经完成了一个相当扎实的 Phase 1-5 财务 ERP/AIS 骨架，测试和文档都比普通早期项目强。它最值得保留的设计方向是：总账为核心、业务单据反查、报表快照锁定、AI/Agent 永远受控。

接下来最重要的不是继续堆页面，而是把它从“能跑的高覆盖 MVP”推进到“可生产部署、可审计、可长期维护”的工程形态。只要优先处理 API 分层、金额精度、Agent 持久化、CI 和部署验证，这个项目的基础是值得继续投资的。
