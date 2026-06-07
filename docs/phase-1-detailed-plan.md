# Phase 1：平台与总账 MVP 详细开发计划

## 0. Phase 1 总目标

做出一个可以真实演示、真实试用的财务软件核心闭环：

```text
创建账套
→ 配置组织、用户、角色、权限
→ 配置会计期间
→ 配置科目与辅助核算
→ 录入凭证
→ 上传附件
→ 审核凭证
→ 记账
→ 查询总账、明细账、科目余额表、试算平衡
→ AI 生成凭证草稿，但不能直接入账
```

Phase 1 的产品定位不是“完整 ERP”，而是一个**稳定的总账内核**。后续采购、销售、库存、应收应付、固定资产、薪资、成本核算都可以围绕这个总账内核接入。

---

# 1. Phase 1 功能边界

## 1.1 必须做

| 模块    | 必须完成                             |
| ----- | -------------------------------- |
| 平台基础  | 账套、组织、用户、角色、权限、部署配置、数据库连接、附件存储配置 |
| 会计期间  | 年度、期间、当前期间、期间打开/关闭/锁定            |
| 科目    | 科目树、科目编码规则、科目方向、科目类别、末级科目控制      |
| 辅助核算  | 部门、人员、客户、供应商、项目、自定义辅助项           |
| 凭证    | 新增、保存草稿、提交、审核、驳回、作废、附件、状态流       |
| 记账    | 已审核凭证记账、更新余额、写入日记账、幂等控制          |
| 账簿    | 总账、明细账、科目余额表、试算平衡                |
| AI 草稿 | 根据文本/附件生成凭证草稿，必须人工确认             |
| 银行对账 | 银行流水导入、对账单管理、自动/手工核对（Bank Reconciliation） |
| 期末处理 | 期末自动结转损益凭证生成                        |
| 审计    | 登录、配置、凭证、审核、记账、附件操作全部留痕          |

---

## 1.2 Phase 1 不做

这些不进入 Phase 1，但数据库和接口要预留：

```text
采购管理
销售管理
库存核算
应收应付完整流程
固定资产
薪资
成本核算
现金流量表
完整资产负债表/利润表自动编制
税务申报
复杂审批流
多币种汇兑损益
多公司合并报表
```

预留字段：

```text
source_module
source_document_type
source_document_id
external_reference_id
business_partner_id
settlement_method
currency_id
exchange_rate
```

---

# 2. 推荐系统架构

## 2.1 总体架构

```text
Web 前端
  ↓
API Gateway / BFF
  ↓
业务服务层
  ├── Auth & Permission Service
  ├── Tenant / Account Set Service
  ├── Master Data Service
  ├── Voucher Service
  ├── Posting / Ledger Service
  ├── Report Query Service
  ├── Attachment Service
  ├── AI Draft Service
  └── Audit Log Service
  ↓
数据库 PostgreSQL / MySQL
对象存储 MinIO / S3 / OSS / Local
消息队列 Redis Stream / RabbitMQ，可选
```

Phase 1 可以先做成**模块化单体**，不要一开始拆微服务。建议代码上按 service 分层，部署上先单体，后面业务量上来再拆。

---

## 2.2 推荐技术栈

| 层    | 推荐                                      |
| ---- | --------------------------------------- |
| 前端   | React / Vue 3 + TypeScript              |
| UI   | Ant Design / Element Plus               |
| 后端   | NestJS / Spring Boot / FastAPI，选你团队熟的   |
| 数据库  | PostgreSQL 优先                           |
| ORM  | Prisma / TypeORM / MyBatis / SQLAlchemy |
| 缓存   | Redis                                   |
| 文件存储 | MinIO 优先，兼容 S3                          |
| 权限   | RBAC + 数据范围控制                           |
| 日志   | 操作日志 + 审计日志 + 应用日志                      |
| AI   | 独立 AI Draft Service，不允许直接写正式凭证          |

---

# 3. 核心业务流程

## 3.1 初始化流程

```text
系统管理员登录
→ 创建账套
→ 设置公司信息
→ 设置本位币、会计准则、启用年月
→ 生成会计年度与期间
→ 创建用户
→ 分配角色
→ 设置科目编码规则
→ 导入或新建会计科目
→ 配置辅助核算
→ 录入期初余额
→ 期初试算平衡
→ 启用账套
```

账套未启用前，允许修改基础配置；账套启用后，科目、期间、期初余额修改要受限制。

---

## 3.2 凭证流程

```text
制单人新增凭证
→ 保存草稿
→ 上传附件
→ 提交凭证
→ 系统校验借贷平衡
→ 审核人审核
→ 记账人记账
→ 系统生成日记账分录
→ 更新科目期间余额
→ 总账、明细账、余额表可查询
```

状态机：

```text
draft 草稿
submitted 已提交
approved 已审核
rejected 已驳回
posted 已记账
voided 已作废
```

允许流转：

```text
draft → submitted
submitted → approved
submitted → rejected
rejected → draft
approved → posted
draft → voided
submitted → voided
```

不允许：

```text
posted → draft
posted → voided
posted → 修改凭证金额
posted → 删除附件
```

---

# 4. 数据库详细设计

## 4.1 账套表

```sql
account_sets
```

| 字段                  | 类型        | 说明                         |
| ------------------- | --------- | -------------------------- |
| id                  | uuid      | 主键                         |
| code                | varchar   | 账套编码，唯一                    |
| name                | varchar   | 账套名称                       |
| company_name        | varchar   | 公司名称                       |
| base_currency       | varchar   | 本位币                        |
| accounting_standard | varchar   | 会计准则                       |
| start_year          | int       | 启用年度                       |
| start_period        | int       | 启用期间                       |
| status              | enum      | draft / enabled / disabled |
| created_by          | uuid      | 创建人                        |
| created_at          | timestamp | 创建时间                       |

关键约束：

```text
code 全局唯一
启用后不能修改 start_year、start_period
删除账套 Phase 1 不提供，只允许停用
```

---

## 4.2 用户、角色、权限

```sql
users
roles
permissions
user_roles
role_permissions
account_set_users
```

权限粒度建议：

```text
account_set.create
account_set.manage

period.open
period.close

account.create
account.update
account.delete
account.view

voucher.create
voucher.update_own
voucher.submit
voucher.approve
voucher.reject
voucher.void
voucher.post
voucher.view

ledger.view
report.view

attachment.upload
attachment.delete

ai.generate_draft
audit_log.view
```

角色模板：

| 角色    | 权限说明           |
| ----- | -------------- |
| 系统管理员 | 管理所有账套、用户、系统配置 |
| 账套主管  | 管理某一账套内配置      |
| 制单人   | 新增、修改、提交本人凭证   |
| 审核人   | 审核、驳回凭证        |
| 记账人   | 对已审核凭证记账       |
| 查询人   | 查看凭证、账簿、报表     |
| 审计员   | 查看日志、凭证历史、附件记录 |

关键规则：

```text
制单人不能审核自己的凭证
审核人和记账人可以是同一人，也可以拆开，由配置决定
系统管理员不默认拥有所有账套业务权限，需要显式加入账套
```

---

## 4.3 会计期间

```sql
fiscal_years
accounting_periods
```

```sql
accounting_periods
- id
- account_set_id
- fiscal_year
- period_no
- start_date
- end_date
- status: unopened / open / closed / locked
- is_current
```

期间规则：

```text
一个账套同一时间只能有一个当前期间
凭证日期必须落在打开期间内
已关闭期间不能新增、修改、审核、记账
已锁定期间只允许查询
反结账 Phase 1 不做前台功能
```

---

## 4.4 科目表

```sql
chart_of_accounts
```

| 字段                 | 说明                |
| ------------------ | ----------------- |
| id                 | 主键                |
| account_set_id     | 账套                |
| code               | 科目编码              |
| name               | 科目名称              |
| parent_id          | 上级科目              |
| level              | 科目级次              |
| account_type       | 资产/负债/共同/权益/成本/损益 |
| normal_balance     | debit / credit    |
| is_leaf            | 是否末级              |
| is_cash            | 是否现金类             |
| is_bank            | 是否银行类             |
| is_enabled         | 是否启用              |
| allow_manual_entry | 是否允许手工录入          |
| created_at         | 创建时间              |

规则：

```text
只有末级科目可以录凭证
已使用科目不能删除
有下级科目的科目不能直接录凭证
科目编码必须符合编码规则
资产、成本、费用类默认借方余额
负债、权益、收入类默认贷方余额
```

编码规则表：

```sql
account_code_rules
- account_set_id
- level1_length
- level2_length
- level3_length
- level4_length
```

例如：

```text
4-2-2-2
1001
100101
10010101
```

---

## 4.5 辅助核算

```sql
auxiliary_types
auxiliary_items
account_auxiliary_requirements
voucher_line_auxiliaries
```

辅助类型：

```text
department
employee
customer
supplier
project
custom
```

科目辅助核算配置：

```sql
account_auxiliary_requirements
- account_id
- auxiliary_type_id
- required: true / false
```

规则：

```text
如果科目配置了部门辅助核算，则凭证分录必须选择部门
如果科目配置了客户辅助核算，则凭证分录必须选择客户
辅助核算可以参与明细账和余额表查询
```

---

## 4.6 凭证表

```sql
vouchers
voucher_lines
voucher_status_logs
voucher_number_sequences
```

### vouchers

| 字段               | 说明                     |
| ---------------- | ---------------------- |
| id               | 主键                     |
| account_set_id   | 账套                     |
| fiscal_year      | 年度                     |
| period_no        | 期间                     |
| voucher_type     | 记 / 收 / 付 / 转          |
| voucher_no       | 凭证号                    |
| voucher_date     | 凭证日期                   |
| status           | 状态                     |
| summary          | 总摘要                    |
| attachment_count | 附件数                    |
| created_by       | 制单人                    |
| submitted_by     | 提交人                    |
| approved_by      | 审核人                    |
| posted_by        | 记账人                    |
| posted_at        | 记账时间                   |
| source_type      | manual / ai / imported |
| ai_draft_id      | AI 草稿 ID               |
| version          | 乐观锁版本                  |

### voucher_lines

| 字段              | 说明                |
| --------------- | ----------------- |
| id              | 主键                |
| voucher_id      | 凭证                |
| line_no         | 行号                |
| summary         | 摘要                |
| account_id      | 科目                |
| debit_amount    | 借方金额              |
| credit_amount   | 贷方金额              |
| currency        | 币种，Phase 1 可默认本位币 |
| exchange_rate   | 汇率，Phase 1 默认 1   |
| original_amount | 原币金额，Phase 1 可选   |
| quantity        | 数量，Phase 1 可选     |
| unit_price      | 单价，Phase 1 可选     |

关键约束：

```text
debit_amount 和 credit_amount 不能同时大于 0
debit_amount 和 credit_amount 不能同时为 0
凭证借方合计必须等于贷方合计
凭证至少两条分录
凭证号在账套 + 年度 + 期间 + 凭证类型下唯一
```

---

## 4.7 附件表

```sql
attachments
attachment_links
```

```sql
attachments
- id
- account_set_id
- file_name
- file_size
- mime_type
- storage_provider
- storage_key
- hash
- status: uploading / available / failed / deleted
- uploaded_by
- uploaded_at
```

```sql
attachment_links
- attachment_id
- object_type: voucher
- object_id
```

规则：

```text
附件上传成功后才允许绑定凭证
已记账凭证附件不允许删除，只能追加补充附件
附件状态必须实时或准实时同步
两个用户访问同一中心服务时，看到的附件状态必须一致
```

同步方案：

```text
MVP：前端轮询附件状态
增强版：WebSocket / SSE 推送附件状态
```

---

## 4.8 记账与余额表

```sql
posting_batches
journal_entries
account_period_balances
```

### posting_batches

```sql
- id
- account_set_id
- period_no
- status
- voucher_count
- posted_by
- posted_at
```

### journal_entries

记账后生成，不直接让用户编辑。

```sql
- id
- account_set_id
- voucher_id
- voucher_line_id
- fiscal_year
- period_no
- entry_date
- account_id
- summary
- debit_amount
- credit_amount
- auxiliary_snapshot_json
- posted_batch_id
```

### account_period_balances

```sql
- account_set_id
- fiscal_year
- period_no
- account_id
- opening_debit
- opening_credit
- period_debit
- period_credit
- cumulative_debit
- cumulative_credit
- closing_debit
- closing_credit
```

规则：

```text
记账必须在事务中完成
同一张凭证只能记账一次
记账时锁定 voucher 行
记账失败必须整体回滚
余额表可以重算，但正常情况应增量更新
```

---

## 4.9 银行对账与期末结转

```sql
bank_statements
bank_reconciliation_rules
bank_reconciliations
```

### bank_statements

```sql
- id
- account_set_id
- bank_account_id
- transaction_date
- description
- amount
- balance
- status: unreconciled / reconciled
```

### 期末结转

不需要独立表，依靠系统配置与凭证引擎实现，主要逻辑在服务层。

---

# 5. 后端 API 详细清单

**【注：所有导致数据状态变更的 POST / PATCH 等高危写操作接口（如凭证提交、审核、记账等），必须在 HTTP Header 中强制要求携带 `Idempotency-Key` 以保证 API 的幂等性防护。】**

## 5.0 API 契约硬化门槛

Phase 1 开发不能只依赖接口列表。进入前后端并行开发前，`services/api/openapi.yaml` 必须完成以下契约硬化：

```text
1. 每个 Phase 1 接口都有 requestBody / response schema。
2. 所有写接口声明 Idempotency-Key header，并说明重复提交返回策略。
3. 统一 ErrorResponse：code、message、fieldErrors、traceId、nextAction。
4. 每个接口标注 x-permission、x-risk-level、x-agent-allowed。
5. 凭证、分录、附件、期间、科目、辅助核算、审计日志都有 components.schemas。
6. Agent 草稿接口包含 dryRun、evidenceRefs、approvalRequired 和风险等级。
```

完成标准：

```text
前端可以按 OpenAPI 生成类型或 mock 数据。
后端可以按 OpenAPI 实现控制器和 DTO。
Agent 工具层可以从 OpenAPI 读取权限、风险等级、幂等和 dry-run 约束。
```

## 5.1 账套

```http
POST   /api/account-sets
GET    /api/account-sets
GET    /api/account-sets/{id}
PATCH  /api/account-sets/{id}
POST   /api/account-sets/{id}/enable
POST   /api/account-sets/{id}/disable
```

创建账套请求：

```json
{
  "code": "001",
  "name": "演示账套",
  "company_name": "某某科技有限公司",
  "base_currency": "CNY",
  "accounting_standard": "小企业会计准则",
  "start_year": 2026,
  "start_period": 1
}
```

---

## 5.2 期间

```http
POST  /api/account-sets/{id}/periods/generate
GET   /api/account-sets/{id}/periods
POST  /api/periods/{id}/open
POST  /api/periods/{id}/close
POST  /api/periods/{id}/lock
POST  /api/periods/{id}/set-current
```

关闭期间前校验：

```text
是否还有未记账凭证
试算是否平衡
是否有失败的记账批次
是否有附件上传中的凭证
```

---

## 5.3 科目

```http
POST   /api/accounts
GET    /api/accounts/tree
GET    /api/accounts
GET    /api/accounts/{id}
PATCH  /api/accounts/{id}
DELETE /api/accounts/{id}
POST   /api/accounts/import
POST   /api/accounts/{id}/disable
POST   /api/accounts/{id}/enable
```

导入模板字段：

```text
科目编码
科目名称
上级科目
科目类型
余额方向
是否启用
是否现金科目
是否银行科目
辅助核算
```

---

## 5.4 辅助核算

```http
POST   /api/auxiliary-types
GET    /api/auxiliary-types
POST   /api/auxiliary-items
GET    /api/auxiliary-items
PATCH  /api/auxiliary-items/{id}
DELETE /api/auxiliary-items/{id}

POST   /api/accounts/{id}/auxiliary-requirements
GET    /api/accounts/{id}/auxiliary-requirements
```

---

## 5.5 凭证

```http
POST   /api/vouchers
GET    /api/vouchers
GET    /api/vouchers/{id}
PATCH  /api/vouchers/{id}
DELETE /api/vouchers/{id}

POST   /api/vouchers/{id}/submit
POST   /api/vouchers/{id}/approve
POST   /api/vouchers/{id}/reject
POST   /api/vouchers/{id}/void
POST   /api/vouchers/{id}/copy
GET    /api/vouchers/{id}/status-logs
```

凭证保存请求：

```json
{
  "account_set_id": "xxx",
  "voucher_type": "记",
  "voucher_date": "2026-01-15",
  "lines": [
    {
      "summary": "购买办公用品",
      "account_id": "6602",
      "debit_amount": 500,
      "credit_amount": 0,
      "auxiliaries": [
        {
          "type": "department",
          "item_id": "admin_dept"
        }
      ]
    },
    {
      "summary": "购买办公用品",
      "account_id": "1001",
      "debit_amount": 0,
      "credit_amount": 500
    }
  ]
}
```

---

## 5.6 记账

```http
POST /api/posting/post-voucher/{voucher_id}
POST /api/posting/post-batch
GET  /api/posting/batches
GET  /api/posting/batches/{id}
```

批量记账请求：

```json
{
  "account_set_id": "xxx",
  "period_no": 1,
  "voucher_ids": ["v1", "v2", "v3"]
}
```

记账返回：

```json
{
  "batch_id": "pb_001",
  "success_count": 3,
  "failed_count": 0,
  "status": "success"
}
```

---

## 5.7 账簿与报表

```http
GET /api/ledger/general-ledger
GET /api/ledger/sub-ledger
GET /api/reports/account-balances
GET /api/reports/trial-balance
```

总账查询参数：

```text
account_set_id
fiscal_year
period_from
period_to
account_code_from
account_code_to
include_unposted=false
```

试算平衡返回：

```json
{
  "debit_total": 5000,
  "credit_total": 5000,
  "is_balanced": true,
  "details": [ ... ]
}
```

---

## 5.7 账簿与报表

```http
GET /api/ledger/general-ledger
GET /api/ledger/sub-ledger
GET /api/reports/account-balances
GET /api/reports/trial-balance
```

总账查询参数：

```text
account_set_id
fiscal_year
period_from
period_to
account_code_from
account_code_to
include_unposted=false
```

试算平衡返回：

```json
{
  "opening_balance_equal": true,
  "period_amount_equal": true,
  "closing_balance_equal": true,
  "opening_diff": 0,
  "period_diff": 0,
  "closing_diff": 0
}
```

---

## 5.8 附件

```http
POST /api/attachments/upload
GET  /api/attachments/{id}
GET  /api/attachments/{id}/status
POST /api/attachment-links
GET  /api/vouchers/{id}/attachments
DELETE /api/attachments/{id}
```

---

## 5.9 AI 草稿

```http
POST /api/ai/voucher-drafts
GET  /api/ai/voucher-drafts/{id}
POST /api/ai/voucher-drafts/{id}/convert-to-voucher
```

AI 限制：

```text
AI 只写 ai_voucher_drafts
AI 不直接写 vouchers posted 状态
AI 不能调用审核接口
AI 不能调用记账接口
AI 生成结果必须经过凭证校验。
```

---

## 5.10 银行对账

```http
POST /api/bank/statements
GET  /api/bank/statements
POST /api/bank/reconcile
POST /api/bank/reconcile/auto
```

---

## 5.11 期末处理

```http
POST /api/posting/period-end/transfer-pl
```

---

# 6. 前端页面详细规划

Phase 1 前端必须遵循 `docs/ui-design.md` 的简洁商务风格：以列表、表格、凭证录入、账簿查询和审核工作台为核心，不做营销式首页。页面必须具备稳定 URL、清晰状态、明确错误提示和 Agent-friendly `data-testid`。

## 6.1 平台管理

| 页面   | 功能               |
| ---- | ---------------- |
| 登录页  | 登录、退出、刷新 token   |
| 账套列表 | 查看账套、切换账套、停用账套   |
| 新建账套 | 公司信息、启用年月、本位币、准则 |
| 用户管理 | 新建用户、停用用户、重置密码   |
| 角色权限 | 角色列表、权限勾选、账套授权   |
| 部署配置 | 部署模式、数据库连接、存储配置  |
| 操作日志 | 按用户、模块、时间查询日志    |

---

## 6.2 基础档案

| 页面     | 功能                   |
| ------ | -------------------- |
| 会计期间   | 期间列表、打开、关闭、锁定、设置当前期间 |
| 科目设置   | 科目树、新增、编辑、停用、导入      |
| 科目编码规则 | 设置 4-2-2-2 等规则       |
| 辅助核算类型 | 部门、人员、客户、供应商、项目      |
| 辅助核算档案 | 维护各类辅助项              |
| 期初余额   | 录入、导入、试算平衡           |

---

## 6.3 凭证中心

| 页面      | 功能              |
| ------- | --------------- |
| 凭证列表    | 按期间、状态、制单人、科目搜索 |
| 新增凭证    | 凭证头、分录、附件、辅助核算  |
| 凭证详情    | 查看凭证、附件、状态日志    |
| 审核工作台   | 批量审核、驳回         |
| 记账工作台   | 选择已审核凭证、执行记账    |
| AI 生成凭证 | 输入文本/上传附件，生成草稿  |

---

## 6.4 账簿报表

| 页面    | 功能             |
| ----- | -------------- |
| 总账    | 按科目和期间查询       |
| 明细账   | 查看凭证分录流水       |
| 科目余额表 | 期初、本期、累计、期末    |
| 试算平衡  | 借贷平衡检查         |
| 凭证联查  | 从账簿跳转凭证详情      |
| 导出中心  | CSV / Excel 导出 |

---

## 6.5 Phase 1 UI 验收要求

- Web App 进入后默认显示工作台或可操作列表，不显示空泛欢迎页。
- 顶部栏固定显示当前账套、组织、会计期间和用户身份。
- 左侧导航至少覆盖平台管理、基础档案、总账、报表、Agent 中心入口。
- 凭证录入页必须固定展示借方合计、贷方合计和差额。
- 凭证列表、审核工作台、记账工作台必须支持期间、状态、制单人和科目筛选。
- 凭证详情必须展示附件、审批记录、状态日志和来源链路。
- 银行对账页面必须支持银行流水与日记账左右对照。
- 权限不足、期间关闭、已记账、已锁定状态下，页面不能展示可直接执行的正式写操作按钮。

---

# 7. 核心校验规则

## 7.1 凭证保存校验

```text
账套必须启用
凭证日期必须在打开期间
分录至少两行
每行必须有摘要
每行必须有末级启用科目
借方和贷方不能同时填写
借方和贷方不能同时为空
金额必须大于 0
辅助核算必填项必须填写
```

---

## 7.2 凭证提交校验

```text
借方合计 = 贷方合计
凭证号可自动生成
当前用户必须有提交权限
凭证状态必须是 draft 或 rejected
期间必须打开
```

---

## 7.3 审核校验

```text
凭证状态必须是 submitted
审核人不能等于制单人
审核人必须有 voucher.approve 权限
凭证仍然必须借贷平衡
凭证期间必须未关闭
```

---

## 7.4 记账校验

```text
凭证状态必须是 approved
凭证期间必须打开
凭证未被记账
凭证借贷仍然平衡
凭证科目仍然有效
辅助核算仍然完整
附件上传状态不能是 uploading
```

---

# 8. 记账引擎详细逻辑

## 8.1 单张凭证记账伪流程

```text
begin transaction

1. 查询 voucher，并加行锁
2. 校验 voucher.status = approved
3. 校验 period.status = open
4. 查询 voucher_lines
5. 校验借贷平衡
6. 创建 posting_batch
7. 为每条 voucher_line 创建 journal_entry
8. 按 account_id + period 汇总借贷金额
9. 更新 account_period_balances
10. 修改 voucher.status = posted
11. 写入 voucher_status_logs
12. 写入 audit_logs

commit transaction
```

失败处理：

```text
任何一步失败，全部 rollback
返回明确错误原因
不要出现凭证 posted 但余额未更新的情况
不要出现余额更新但凭证未 posted 的情况
```

---

## 8.2 余额更新公式

```text
本期期初 = 上期期末
本期借方发生额 = 已记账借方合计
本期贷方发生额 = 已记账贷方合计
期末余额 = 期初余额 + 本期借方 - 本期贷方
```

但显示方向要根据科目余额方向处理：

```text
借方余额科目：
期末借方 = 期初借方 + 本期借方发生额 - 本期贷方发生额  (允许为负数，表示透支或反向余额)

贷方余额科目：
期末贷方 = 期初贷方 + 本期贷方发生额 - 本期借方发生额  (允许为负数，表示透支或反向余额)
```

---

## 8.3 试算平衡公式

```text
期初借方合计 = 期初贷方合计
本期借方发生额合计 = 本期贷方发生额合计
期末借方余额合计 = 期末贷方余额合计
```

如果不平，返回：

```text
不平类型
借方合计
贷方合计
差额
异常科目
异常凭证
```

---

# 9. AI 记账草稿设计

## 9.1 AI 输入

```json
{
  "account_set_id": "xxx",
  "source_type": "text",
  "content": "公司购买办公用品500元，通过银行支付",
  "attachment_ids": []
}
```

---

## 9.2 AI 输出

```json
{
  "confidence": 0.86,
  "draft": {
    "voucher_date": "2026-01-15",
    "lines": [
      {
        "summary": "购买办公用品",
        "account_suggestion": "管理费用-办公费",
        "debit_amount": 500,
        "credit_amount": 0
      },
      {
        "summary": "银行支付办公用品款",
        "account_suggestion": "银行存款",
        "debit_amount": 0,
        "credit_amount": 500
      }
    ]
  },
  "warnings": [
    "请确认付款账户",
    "请确认是否需要进项税处理"
  ]
}
```

---

## 9.3 AI 安全边界

```text
AI 不直接生成正式凭证编号
AI 不直接提交凭证
AI 不审核凭证
AI 不记账
AI 低置信度时必须提示人工确认
AI 推荐科目不存在时不能自动创建科目
AI 输出必须经过凭证校验器
```

---

# 10. 开发排期：10 周详细版

## 第 1 周：项目基础与架构

交付：

```text
代码仓库
前后端项目骨架
数据库迁移工具
基础 CI/CD
环境配置
统一错误码
统一响应格式
登录鉴权基础
审计日志基础表
```

后端任务：

```text
搭建项目结构
设计数据库 schema v0.1
实现 migration
实现 JWT 登录
实现租户上下文 account_set_id 中间件
实现统一异常处理
```

前端任务：

```text
搭建前端工程
登录页
主布局
菜单权限控制雏形
账套切换器 UI
```

测试任务：

```text
接口测试框架
E2E 测试框架
测试数据库初始化脚本
```

验收：

```text
用户可以登录
前端可以调用后端接口
数据库 migration 可重复执行
每个请求可以识别当前用户
```

---

## 第 2 周：账套、组织、用户、权限

交付：

```text
账套管理
公司信息
用户管理
角色管理
权限配置
账套用户授权
```

后端任务：

```text
account_sets CRUD
companies CRUD
users CRUD
roles CRUD
permissions 初始化
role_permissions 配置
account_set_users 授权
```

前端页面：

```text
账套列表
新建账套
用户管理
角色权限
账套授权
```

验收：

```text
管理员可以创建账套
管理员可以创建用户
用户只能进入被授权的账套
不同角色看到不同菜单
无权限调用接口返回 403
```

---

## 第 3 周：会计期间、部署配置、附件配置

交付：

```text
会计年度
会计期间
当前期间
期间打开/关闭/锁定
部署模式配置
中心数据库连接配置
附件存储配置
```

后端任务：

```text
生成 12 个自然月期间
设置当前期间
期间状态流转
数据库连接测试接口
存储连接测试接口
附件上传接口雏形
```

前端页面：

```text
会计期间管理
部署配置
存储配置
附件测试上传
```

验收：

```text
账套启用时自动生成期间
只能有一个当前期间
关闭期间前会做业务检查
附件可以上传并返回 available 状态
```

---

## 第 4 周：科目体系

交付：

```text
科目编码规则
科目树
科目新增/编辑/停用
科目导入
末级科目控制
```

后端任务：

```text
account_code_rules
chart_of_accounts CRUD
科目树查询
科目编码校验
科目删除/停用规则
科目导入解析
```

前端页面：

```text
科目设置
科目编码规则
科目导入预览
```

验收：

```text
可以创建多级科目
编码不符合规则不能保存
有下级科目不能作为凭证分录科目
已被使用科目不能删除
```

---

## 第 5 周：辅助核算与期初余额

交付：

```text
辅助核算类型
辅助核算档案
科目绑定辅助核算
期初余额录入
期初试算平衡
```

后端任务：

```text
auxiliary_types CRUD
auxiliary_items CRUD
account_auxiliary_requirements
opening_balances
期初试算平衡接口
```

前端页面：

```text
辅助核算类型
辅助核算档案
科目辅助核算配置
期初余额录入
期初试算平衡
```

验收：

```text
可以配置某科目需要部门辅助核算
录入期初余额后能试算平衡
期初不平衡时显示差额
账套启用后期初余额修改受控
```

---

## 第 6 周：凭证录入

交付：

```text
凭证新增
凭证保存草稿
凭证明细
辅助核算选择
凭证编号
附件绑定
凭证列表
凭证详情
```

后端任务：

```text
vouchers CRUD
voucher_lines CRUD
voucher_number_sequences
voucher_line_auxiliaries
凭证保存校验器
附件与凭证关联
```

前端页面：

```text
凭证列表
新增凭证
凭证详情
附件上传组件
辅助核算选择组件
```

验收：

```text
可以保存草稿凭证
借贷不平可以保存草稿，但不能提交
凭证分录可以选择辅助核算
附件可以绑定凭证
凭证号可以自动生成
```

---

## 第 7 周：凭证提交、审核、驳回、作废

交付：

```text
提交凭证
审核凭证
驳回凭证
作废凭证
状态日志
审核工作台
```

后端任务：

```text
submit voucher
approve voucher
reject voucher
void voucher
voucher_status_logs
审核权限校验
制单人/审核人分离校验
```

前端页面：

```text
审核工作台
凭证状态流展示
驳回原因弹窗
批量审核
```

验收：

```text
借贷不平不能提交
制单人不能审核自己的凭证
驳回后凭证回到可修改状态
所有状态变化有日志
```

---

## 第 8 周：记账引擎

交付：

```text
单张记账
批量记账
posting_batch
journal_entries
account_period_balances
记账日志
幂等控制
```

后端任务：

```text
记账事务
凭证加锁
余额增量更新
重复记账防护
失败回滚
记账批次查询
```

前端页面：

```text
记账工作台
记账结果页
记账批次详情
```

验收：

```text
已审核凭证可以记账
未审核凭证不能记账
同一凭证不能重复记账
记账后凭证不能修改
记账失败不会产生脏数据
```

---

## 第 9 周：账簿与报表

交付：

```text
总账
明细账
科目余额表
试算平衡
凭证联查
导出
```

后端任务：

```text
general-ledger query
sub-ledger query
account-balances query
trial-balance query
CSV/Excel export
```

前端页面：

```text
总账查询
明细账查询
科目余额表
试算平衡表
报表导出
凭证联查
```

验收：

```text
记账后总账有数据
明细账可以联查凭证
科目余额表与凭证发生额一致
试算平衡结果正确
导出文件金额准确
```

---

## 第 10 周：AI 草稿、联调、验收、修复

交付：

```text
AI 凭证草稿
AI 草稿转凭证
完整流程联调
权限联调
附件同步联调
性能优化
验收测试
```

后端任务：

```text
ai_voucher_drafts
AI 输出结构化
AI 草稿校验
AI 草稿转 voucher draft
AI 操作日志
```

前端页面：

```text
AI 生成凭证
AI 结果确认页
AI 草稿转正式草稿
```

验收：

```text
AI 能生成凭证草稿
AI 不能直接审核
AI 不能直接记账
两用户访问同一中心服务时凭证状态同步
附件状态同步
完整闭环可演示
```

---

# 11. 测试计划

## 11.1 单元测试

覆盖：

```text
科目编码校验
科目末级校验
凭证借贷平衡校验
辅助核算必填校验
期间状态校验
制单人不能审核自己
记账幂等校验
余额更新公式
试算平衡公式
```

---

## 11.2 集成测试

场景：

```text
创建账套 → 创建期间 → 创建科目 → 录入凭证 → 审核 → 记账 → 查总账
上传附件 → B 用户查看附件状态
AI 生成草稿 → 人工确认 → 提交 → 审核 → 记账
关闭期间 → 尝试新增凭证失败
停用科目 → 尝试录凭证失败
```

---

## 11.3 权限测试

| 场景         | 预期 |
| ---------- | -- |
| 制单人审核自己凭证  | 失败 |
| 查询人提交凭证    | 失败 |
| 未授权用户进入账套  | 失败 |
| 审核人修改凭证金额  | 失败 |
| 记账人查看记账工作台 | 成功 |
| 记账人新增用户    | 失败 |

---

## 11.4 并发测试

必须测：

```text
两个用户同时记账同一凭证
两个用户同时修改同一凭证
两个用户同时上传附件
一个用户审核时另一个用户修改凭证
批量记账时部分凭证状态变化
```

预期：

```text
同一凭证只会被记账一次
乐观锁冲突时提示用户刷新
事务失败不产生半成品数据
```

---

# 12. 最终验收用例

## 用例 1：完整财务闭环

```text
1. 创建账套 A
2. 创建用户：张三制单、李四审核、王五记账
3. 创建 2026 年 1 月期间
4. 创建科目：银行存款、管理费用-办公费
5. 张三录入凭证：
   借：管理费用-办公费 500
   贷：银行存款 500
6. 上传发票附件
7. 张三提交
8. 李四审核
9. 王五记账
10. 查询总账、明细账、科目余额表、试算平衡
```

通过标准：

```text
凭证状态为 posted
总账金额正确
明细账显示该凭证
科目余额表金额正确
试算平衡为平衡
附件可查看
审计日志完整
```

---

## 用例 2：AI 草稿边界

```text
1. 输入：购买办公用品 500 元，银行支付
2. AI 生成凭证草稿
3. 人工确认科目
4. 保存为正式凭证草稿
5. 人工提交
6. 人工审核
7. 人工记账
```

通过标准：

```text
AI 只能生成草稿
AI 不能直接提交
AI 不能直接审核
AI 不能直接记账
AI 草稿转凭证后仍走完整校验
```

---

## 用例 3：权限隔离

```text
1. A 用户属于账套 001
2. B 用户属于账套 002
3. A 用户访问账套 002 的凭证
```

通过标准：

```text
返回 403
不能查到其他账套数据
审计日志记录越权尝试
```

---

# 13. Phase 1 交付物清单

最终你应该交付这些东西：

```text
1. 可运行的前端系统
2. 可运行的后端 API
3. 数据库 migration
4. 初始化权限脚本
5. 标准科目导入模板
6. 凭证导入模板，可选
7. API 文档
8. 数据库 ER 图
9. 操作手册
10. 测试用例
11. 部署文档
12. 验收报告
```

---

# 14. 推荐优先级

按优先级排：

```text
P0：
账套、用户、权限、期间、科目、凭证、审核、记账、总账、明细账、余额表、试算平衡

P1：
附件、辅助核算、期初余额、导出、审计日志

P2：
AI 草稿、批量审核、批量记账、导入模板、附件状态推送

P3：
复杂报表、多币种、审批流、外部系统接入
```

---

# 15. 一句话版本

Phase 1 不要追求“ERP 全功能”，而是先把**总账内核做扎实**：
**权限隔离、期间控制、科目体系、凭证状态、审核记账、余额更新、账簿查询、试算平衡、附件同步、AI 只出草稿**。

只要这个闭环稳定，后面的采购、销售、库存、应收应付都可以通过 `source_module + source_document_id` 接进来生成凭证。
