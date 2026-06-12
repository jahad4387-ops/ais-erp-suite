# Phase 6：Agent 工作流与生产化详细开发计划

这一阶段不是继续新增业务模块，而是把 Phase 1～5 已经完成的业务功能，升级成 **可被 Agent 安全协作、可部署、可运维、可审计、可恢复、可上线验收** 的工业级系统。

# Phase 6 总目标

让系统可以正式在内外网安全上线，并让 AI Agent 像“受控虚拟财务员工”一样，在**严格边界、审批、审计与回滚**的约束下工作。

```text
人工用户 / Agent 发起任务
→ Agent Gateway (Schema拦截墙)
→ Tool Registry
→ Task Engine 拆解
→ dry-run 预演
→ 绑定且校验证据 (WORM)
→ 审批流
→ 正式执行
→ 全局审计日志
→ Replay 追溯回放
```

---

# 1. Phase 6 前置条件

进入本阶段前，总账、购销、存货、薪资、报表均已具备基本能力，且业务模块底层的凭证记账、付款、反向操作均提供了统一的草稿和审批接口。

---

# 2. 核心 AI 生产化防御机制

把 AI 从“玩具”推向“生产工具”，必须设置绝对红线。

## 2.1 防御 AI 幻觉的 Schema 拦截墙
> [!CAUTION]
> **绝对不可信任大模型的参数输出**
> 大语言模型偶尔会捏造 ID 或输出格式错误的字符串。在网关层（Agent Gateway / Tool Registry）必须架设严格的 JSON Schema 强类型校验器。在请求进入到底层业务 `dry-run` 之前，任何类型不匹配（如数字写成了字符串）、必填参数缺失或不存在的枚举值，**网关必须直接熔断并抛弃请求**，绝对禁止脏数据污染底层数据库引发 SQL 异常。

## 2.2 防篡改的证据链 WORM 校验
> [!IMPORTANT]
> **防止“狸猫换太子”的审批欺诈**
> Agent 可能凭借发票 A 生成了一笔付款审批。如果有人在审批期间将发票 A 的图片在附件存储中悄悄替换，后果不堪设想。**系统必须在记录 `evidence_refs` 时保存文件的 Hash (SHA-256)。在审批人点击 Approve 并在最终进入 Execute 执行的瞬间，系统必须强制二次比对 Hash**。若不一致，直接终止流程并触发最高级别警报。

## 2.3 资金与通讯的“绝对物理隔离”
> [!WARNING]
> **HitL (Human-in-the-Loop) 的刚性约束**
> 任何涉及向系统外发送信息（向客户发催收邮件/微信）、调用外部真实资金划拨（银行 API）的接口，**在代码底层绝对禁止被 Agent Token 触发执行**。Agent 助手（如催收助手、对账助手）的权限天花板只能是“生成草稿”；最后一击必须由拥有 User Token 的真人点击确认。

## 2.4 Idempotency Key 跨期隔离
> [!NOTE]
> **防范陈年幂等键的幽灵复活**
> 幂等键不能无限期存活。在设计 `idempotencyKey` 时，必须将其与当前执行的 `account_set_id` (账套) 绑定，并加上 TTL。当前实现默认保留 7 天，可通过 `AIS_IDEMPOTENCY_TTL_HOURS` 或 `AIS_IDEMPOTENCY_TTL_MS` 调整；同一 key 在 TTL 内跨账套复用必须返回 `IDEMPOTENCY_SCOPE_MISMATCH`，过期 key 在处理新写请求前必须被清理，防止状态机被穿透。

## 2.5 恢复演练环境的“静默沙箱化”
> [!TIP]
> **灾备演练的数据防污染隔离**
> 当我们把生产数据恢复到测试环境进行完整性演练时，里面包含真实的客户和银行数据。**系统必须通过部署环境变量（如 `RESTORE_DRILL=true`）在内核强制拦截并屏蔽一切对外的 Webhook 触发、邮件发送和网银交互**，确保演练环境是一座完全静默的“数据孤岛”。
> 当前运行时支持 `RESTORE_DRILL=true` 或 `AIS_RESTORE_DRILL=true` 打开静默沙箱；部署配置页必须展示 `restoreDrill.enabled`、`outboundBlocked` 和被阻断通道。Agent Action 中 `external_execution` 类型的工具即使完成审批并携带人工确认 token，也必须在执行前被内核拦截，并写入 `restore_drill_outbound_blocked` Replay 事件。

## 2.6 大模型草稿生成适配层
> [!IMPORTANT]
> **LLM 只能生成候选草稿，不能成为业务事实来源**
> Phase 6 必须预留统一的 `LLM Draft Adapter`，用于调用云端或本地大模型 API，把用户自然语言、附件 OCR、历史单据、业务上下文和目标草稿 Schema 组合成结构化候选草稿。大模型输出必须先经过 JSON Schema 校验、主数据解析、业务规则 dry-run、证据引用检查和人工确认，才能转换为系统草稿。任何模型输出中的客户、供应商、存货、仓库、科目、员工、资产等引用 ID，都必须由系统检索和匹配产生，不能直接信任模型生成的 ID。

上传凭证、发票、报价单、合同、仓库指令、盘点表、工资表、资产变动说明等附件时，系统必须先调用内置本地 OCR / 文档解析器抽取文字和版面信息，再把 OCR 结果、附件 Hash、来源对象和用户指令交给 `LLM Draft Adapter`。OCR 结果本身也要进入证据链，标记解析状态、置信度和人工修正记录；大模型只负责理解和结构化，不直接读取未校验附件，也不能跳过本地解析层。

当前实现要求保留两个可替换边界：

- `ocrAdapter.extractText({ attachment, content })`：默认使用 `local-ocr-placeholder`；部署可通过 `AIS_OCR_PROVIDER=local-command-ocr` + `AIS_OCR_COMMAND` + `AIS_OCR_COMMAND_ARGS` 接入本地命令模型，也可用 `AIS_OCR_PROVIDER=local-tesseract` 调用本机 Tesseract，或注入 `configured-local-ocr`（如 PaddleOCR `ppocr-v4`）。OCR 返回值必须包含 `provider`、`model`、`status`、`extractedText`、`confidence`，并进入候选草稿证据链。
- `llmDraftAdapter.generateDraft(input)`：默认使用本地规则生成器，部署时可替换为 `openai-compatible` 或其他模型供应商。输入只能接收用户指令、OCR 后文本、附件证据引用和业务上下文；输出只能是目标 `draftType` 的结构化候选草稿、未匹配字段和可解释状态。

---

# 3. Agent 工作流设计

## 3.1 Agent Action 状态机

```text
created
→ planning
→ dry_run_completed
→ submitted_for_approval
→ approved
→ executed (含最终证据Hash校验)
→ reversed (仅追加补偿事件，不静默删除历史)
→ archived
```
状态机异常分支要求：一旦 `executed`，不接受任何意义上的静默删除，出错只能通过独立的 `reverse`（红字冲销/反结账）处理并重新走审计链。当前实现已落地 `/agent-actions/{agentActionId}/reverse`，返回 `reversalResult` 并写入 Replay 与 Audit。
当前落地边界：`agent_actions`、`agent_approvals` 与 `agent_replay_events` 已通过 Prisma/platformStore 持久化；服务重启后仍可继续查询 Agent Action、提交审批、双人审批、执行、反向处理，并通过 Replay API 还原完整事件流。

## 3.2 风险分级与第一批工具
- **低风险** (仅日志)：`search_vouchers`，`search_ledger`，`search_reports` 等。
- **中风险** (必须人工确认)：`create_voucher_draft`，`suggest_ap_reconciliation`，`run_close_checklist`，`suggest_purchase_order_draft`，`suggest_sales_order_draft`，`suggest_inventory_movement_draft`，`suggest_material_requisition_draft`，`suggest_product_receipt_draft`，`suggest_stock_count_draft`，`suggest_payroll_allocation_draft`，`suggest_asset_change_draft` 等。
- **高风险** (双人审批与双活验证)：`post_approved_voucher`，`close_approved_period` 等。

## 3.3 草稿生成工具矩阵

Agent 必须能在受控边界内帮助用户补齐草稿，但所有工具的最高权限只能到“生成候选草稿 / dry-run 预览 / 提交人工确认”。

| 模块 | 工具 | 生成对象 | 主要输入 | 输出边界 |
| --- | --- | --- | --- | --- |
| 基础档案 | `suggest_master_data_draft` | 客户、供应商、存货、员工、资产类别草稿 | 名片、合同、历史 Excel、用户描述 | 只生成待确认档案，不能自动启用关键档案 |
| 采购付款 | `suggest_purchase_order_draft` | 采购申请、采购订单、采购发票、付款申请草稿 | 请购描述、报价单、合同、供应商历史价 | 不能自动审批采购或付款 |
| 销售收款 | `suggest_sales_order_draft` | 销售报价、销售订单、销售发票、收款计划草稿 | 客户需求、报价单、合同、历史订单 | 不能突破信用额度或自动确认收入 |
| 存货生产 | `suggest_inventory_movement_draft` | 入库、出库、调拨、库存调整草稿 | 仓库指令、扫码结果、库位、批次、库存移动 source context | 必须 dry-run 库存、批次、成本状态；从库存移动单发起时预填仓库、货位、批次、物料、数量和成本 |
| 存货生产 | `suggest_material_requisition_draft` | 生产领料草稿 | 工单、BOM、领料单、仓库指令、扫码结果 | 只生成非过账草稿，不能直接扣减库存或增加工单材料成本 |
| 存货生产 | `suggest_product_receipt_draft` | 完工入库草稿 | 工单、完工报告、检验单、仓库指令 | 只生成待成本草稿，不能直接增加库存或更新工单完工数 |
| 存货生产 | `suggest_stock_count_draft` | 盘点任务和盘盈盘亏调整草稿 | 盘点表、仓库、货位、批次、盘点预览 source context | 不能直接改库存余额；从盘点预览发起时预填账面数、实盘数、差异数量和调整金额 |
| 总账 | `suggest_voucher_from_evidence` | 记账凭证草稿 | 发票、流水、合同、业务单据、用户说明、既有凭证 source context | 只能生成凭证草稿，不能记账；从凭证行发起时预填凭证号、期间、日期、摘要、科目、借贷金额和附件引用 |
| 薪资固资 | `suggest_payroll_allocation_draft` | 工资分摊、成本池草稿 | 工资批次、工资计算单 source context、部门、工单、规则 | 必须人工审核工资和分摊规则；从工资计算单发起时预填计算单号、期间、公司成本、员工/部门明细和按部门汇总的分摊规则 |
| 薪资固资 | `run_depreciation_dry_run` / `suggest_asset_change_draft` | 折旧 dry-run 草稿、资产变动草稿 | 资产卡片/折旧页面 source context、折旧方法、期间、变动说明 | `run_depreciation_dry_run` 只能生成 `depreciation_run` 候选草稿，人工确认后保存为独立 `depreciation_run_draft`，不得写入正式折旧运行、成本池或锁定折旧；从资产卡片发起时预填资产编号、净值、原值、累计折旧、当前部门和变动金额候选 |
| 报表分析 | `suggest_report_interpretation_draft` | 报表解读草稿 | 报表运行 source context、报表快照、单元格 evidenceRef、指标、来源链路 | 不修改报表快照；从报表运行发起时预填报表运行 ID、期间、快照 Hash、单元格证据引用和追溯链 |

所有草稿生成工具必须返回：`draftType`、`sourceContext`、`matchedMasterData`、`unmatchedItems`、`draftPayload`、`dryRunResult`、`warnings`、`confidence`、`evidenceRefs` 和 `requiresHumanConfirmation`。

---

# 4. 核心 Agent 助手业务抽象

## 4.1 结账助手
通过遍历业务模块，检查诸如“未记账凭证”、“未审核入库单”、“未计算出库成本”、“未计提固定资产折旧”等前置条件。生成风险报告草稿。结账的动作必须人工发起。

## 4.2 对账助手
自动核对系统间差异：银行流水 vs 日记账、子系统存货余额 vs 总账余额。输出差异追溯树，并生成调整草稿凭证。

## 4.3 催收助手
扫描逾期账龄（AR Aging），结合业务人员设定的客户信誉，生成优先处理清单及包含证据引用的催收邮件草稿，进入待人工发送队列。

## 4.4 草稿填写助手
草稿填写助手面向高频录入场景，允许用户在采购订单、销售订单、仓库出入库、调拨、盘点、生产领料、完工入库、记账凭证、工资分摊、资产变动等页面，通过自然语言、附件或历史单据生成候选草稿。

工作流程必须固定为：

```text
用户在具体页面发起草稿生成
→ 系统收集当前账套、期间、页面对象、权限和证据
→ 上传附件进入本地 OCR / 文档解析，形成可审计 OCR 预览结果
→ 人工检查并修正 OCR 抽取文本，系统保留原始文本、修正文本、修正人和修正时间
→ LLM Draft Adapter 生成结构化候选草稿
→ Tool Registry 按目标草稿 Schema 校验
→ 主数据匹配与歧义提示
→ 业务规则 dry-run
→ 用户逐项确认或修改
→ 保存为正式系统草稿
```

草稿填写助手不能绕过页面原有必填项、单据编号、期间状态、库存校验、信用额度、科目辅助核算、审批流和审计规则。模型无法确定的字段必须进入 `unmatchedItems`，由人工选择后写入 `resolvedUnmatchedItems` 才能保存；转换接口必须把这一步作为硬门槛，而不是仅在 UI 上提示。不可信或无法修正的候选草稿必须允许人工拒绝，记录 `rejectedBy`、`rejectedAt` 和 `rejectionReason`，并禁止再次转换为系统草稿。

---

# 5. 生产化与运维工具

## 5.1 数据迁移工具
支持从 Excel 或老 ERP 系统导入期初余额、历史凭证、基础档案。核心流程强制 `上传 → 映射 → dry-run 报错 → 人工修正 → 正式导入 → 试算平衡检验` 的标准流水线。

- **当前落地边界**：已提供 `/api/ops/migrations/jobs`、`/api/ops/migrations/jobs/{id}/dry-run` 与 `/api/ops/migrations/jobs/{id}/import`。迁移任务支持按账套创建、保存源数据摘要、字段映射、源行快照、dry-run 校验结果、错误报告和正式导入摘要，并通过 Prisma/platformStore 持久化 `migration_jobs`；当前 dry-run 会校验必填字段，期初余额和历史凭证类任务会执行借贷试算平衡检查。正式导入已落地 `opening_balance`、`partner_master` 与 `inventory_item_master` 类型，要求任务处于 `dry_run_completed` 且 `validation.status=passed`：期初余额写入正式期初余额，伙伴档案写入供应商/客户档案，存货档案写入物料主数据，并记录 `importSummary`。

## 5.2 备份与恢复
- **备份策略**：全量/增量数据库备份、附件哈希校验备份、重要审计日志长期归档。
- **恢复演练**：结合前述的“沙箱化静默”，能够一键在测试环境还原某个时间点的账套；演练环境必须强制阻断 Webhook、邮件和网银 API 等外发通道，并在 Replay 中留下阻断事件。
- **当前落地边界**：Phase 6 已提供 `/api/ops/backups` 备份任务模型和 `/api/ops/restores/execute` 恢复演练 dry-run 入口。备份任务会生成账套级 manifest、业务表计数、附件哈希校验摘要、`sha256` checksum 和审计日志，并通过 Prisma/platformStore 持久化 `backup_jobs`；恢复任务目前只允许在 `RESTORE_DRILL=true` 或 `AIS_RESTORE_DRILL=true` 的静默沙箱内 dry-run，持久化 `restore_jobs`、恢复影响范围和被阻断外发通道，不执行真实业务数据覆盖。
- **当前落地边界**：安全事件已从普通操作日志中独立出来，提供 `security_events` 持久化表和 `/api/security/events` 查询接口。当前会结构化记录权限拒绝、幂等键跨账套复用等异常，字段包括事件类型、严重级别、操作者、账套、对象、消息和 JSON payload；查询接口支持按账套、事件类型、严重级别和操作者筛选，并继续遵守账套访问隔离。

## 5.3 审计与 Replay 系统
构建 `agent_replay_events`，实现全事件流记录。对于任何财务异动，能够通过界面像回看录像一样，还原出：Agent 收到了什么指令 → 调了什么工具 → 读取了哪些表格 → dry-run 结果 → 谁审批的 → 影响了哪张单据。

## 5.4 安全与性能压测
- 压测标准：满足至少 100 万行凭证明细和存货单据下的极速查询与报表 Batch Fetching 处理能力。
- 安全拦截：多租户越权查询熔断、敏感操作需提供二次登录 Token 验证。

---

# 6. 三种架构部署模式

本系统代码严禁包含任何环境“硬编码”，统一由环境变量注入，以适配三种商业部署拓扑：
1. **LAN 局域网模式**：单体高内聚部署，满足传统企业物理断网隔离要求。
2. **私有云 / VPN 模式**：通过网关防火墙和 IP 白名单隔离。
3. **公网 SaaS 模式**：具备 HTTPS 强制跳转、WAF 拦截、严格多租户数据范围加密隔离设计。

---

# 7. 数据模型精简概览
* **Agent Core**: `agents`, `agent_tools`, `agent_tool_permissions`
* **Agent Exec**: `agent_actions`, `agent_tool_invocations`, `agent_approvals`
* **Audit**: `agent_replay_events`, `evidence_refs`
* **Draft AI**: `llm_providers`, `llm_draft_prompts`, `llm_draft_runs`, `agent_draft_candidates`
* **Ops**: `migration_jobs`, `backup_jobs`, `restore_jobs`, `security_events`

---

# 8. API 层架构
提供严格遵守 REST 契约和状态机边界的接口，如：
- `/api/agent/actions/{id}/dry-run`
- `/api/agent/actions/{id}/submit`
- `/api/agent/tools/{toolName}/invoke`
- `/api/agent/draft-candidates`
- `/api/agent/draft-candidates/{id}/convert`
- `/api/ai/ocr-preview`
- `/api/ai/llm-draft-runs`
- `/api/ai/llm-draft-runs/metrics`
- `/api/ops/migrations/jobs`
- `/api/ops/migrations/jobs/{id}/dry-run`
- `/api/ops/migrations/jobs/{id}/import`
- `/api/ops/backups`
- `/api/ops/restores`
- `/api/ops/restores/execute`

LLM API 适配层必须通过环境变量配置供应商、模型、超时、最大 token、是否启用本地模型和脱敏策略。业务层只依赖统一接口，不直接耦合单一模型供应商。
LLM 评估指标必须按账套和草稿类型汇总 Schema 成功率、草稿采纳率、拒绝率、人工修正率以及 provider/model 分组结果，用于比较不同模型配置在真实候选草稿审核中的质量。

Phase 6 AI 运行配置至少包括：

- `AIS_OCR_PROVIDER`：本地 OCR 提供方，默认 `local-ocr-placeholder`；可配置为 `local-command-ocr`、`local-tesseract` 或 `configured-local-ocr`。
- `AIS_OCR_MODEL`：本地 OCR 模型名，例如 `ppocr-v4` 或 `tesseract:chi_sim+eng`。生产环境启用非默认 OCR provider 时必须配置。
- `AIS_OCR_COMMAND`：本地 OCR 可执行文件路径或命令名。配置后服务端会通过 `execFile` 调用，不经过 shell。
- `AIS_OCR_COMMAND_ARGS`：OCR 命令参数 JSON 数组，支持 `{input}`、`{filename}`、`{contentType}`、`{attachmentId}` 模板；未配置时 `local-command-ocr` 默认传入 `{input}`，`local-tesseract` 默认使用 `{input} stdout -l chi_sim+eng`。
- `AIS_LLM_DRAFT_PROVIDER`：草稿生成模型提供方，默认 `local-rule-based`，可配置为 `openai-compatible` 或私有模型网关。
- `AIS_LLM_DRAFT_MODEL`：草稿生成模型或部署名。
- `AIS_LLM_DRAFT_BASE_URL`：OpenAI-compatible 或私有模型网关地址。
- `AIS_LLM_DRAFT_API_KEY_REF`：模型密钥引用，不直接暴露明文密钥。
- `AIS_LLM_DRAFT_TIMEOUT_MS`、`AIS_LLM_DRAFT_MAX_TOKENS`：调用超时和 token 上限。
- `AIS_LLM_DRAFT_REDACTION`：模型输入脱敏策略开关或策略名。
- `AIS_IDEMPOTENCY_TTL_HOURS` / `AIS_IDEMPOTENCY_TTL_MS`：写请求幂等缓存 TTL，默认 168 小时；部署检查必须展示当前 `ttlHours` 和 `ttlMs`，方便运维确认 Agent 写操作的重放窗口。

私有云、生产和 SaaS 等生产类部署中，如果启用非默认 OCR 或非本地规则 LLM provider，启动时必须校验模型名、网关地址和密钥引用是否完整。

`openai-compatible` 草稿 adapter 的运行约束：

- 请求统一发送到 `${AIS_LLM_DRAFT_BASE_URL}/chat/completions`，使用 `AIS_LLM_DRAFT_MODEL`、`AIS_LLM_DRAFT_TIMEOUT_MS`、`AIS_LLM_DRAFT_MAX_TOKENS`。
- `AIS_LLM_DRAFT_API_KEY_REF` 必须使用密钥引用形式，当前运行时支持 `env:ENV_NAME` 注入，部署配置页只显示引用是否存在，不展示密钥值。
- `AIS_LLM_DRAFT_REDACTION=enabled` 时，模型输入中的手机号、长银行卡号等敏感数字必须先脱敏，再发送到模型网关。
- 模型响应必须是结构化 JSON；解析失败、HTTP 失败或超时只能生成 `failed` 状态的 `LlmDraftRun`，不能创建业务草稿或候选草稿。
- 模型响应即使是合法 JSON，也必须继续校验目标 `draftType` 的草稿结构；例如订单草稿必须包含 `lines`，订单行必须包含数量和单价。Schema 校验失败同样只能记录 `failed` 状态的 `LlmDraftRun.errorMessage`，不能进入候选草稿队列。
- **当前落地边界**：`llm_draft_runs` 与 `agent_draft_candidates` 已通过 Prisma/platformStore 持久化，保留 OCR 结果、模型输入摘要、候选草稿 payload、dry-run 结果、人工拒绝/转换状态与证据引用；服务重启后仍可继续查询和审核候选草稿。

---

# 9. 前端页面规划

Phase 6 前端遵循 `docs/ui-design.md`。Agent 和生产化页面必须把“建议、dry-run、审批、正式执行、证据、回放”区分清楚，避免用户误以为 AI 已经执行正式财务动作。

| 页面 | 设计重点 |
| --- | --- |
| Agent 动作列表 | 展示任务类型、风险等级、状态、发起人、目标账套、期间、更新时间 |
| Agent Action 详情 | 分区展示用户输入、Agent 计划、工具调用、dry-run 结果、证据、审批和执行结果 |
| Agent 审批队列 | 按风险等级、状态、工具、金额、账套和等待时间筛选/排序，显示双人审批要求和审批意见 |
| Tool Registry | 工具名称、用途、参数 Schema、风险等级、可调用角色、是否允许 Agent Token 调用 |
| 工具权限 | 按角色配置可调用工具，清楚区分读取、草稿、审批、执行 |
| 证据链 | 附件 Hash、来源对象、验证状态、审批时二次校验结果和异常提示 |
| Replay 回放 | 时间线展示 Agent 收到什么、读取哪些数据、生成什么建议、谁审批、执行结果和每步事件载荷；同时展示 `auditSummary`，汇总审批进度、证据校验状态、Replay 事件序列、下一步动作和 mutationState |
| 结账助手 | 展示未记账凭证、未审核单据、未计算成本、未计提折旧等检查项 |
| 对账助手 | 展示银行、总账、子系统差异树和调整草稿凭证 |
| 催收助手 | 展示逾期客户、证据引用、催收文案草稿和人工发送确认 |
| 草稿生成工作台 | 展示订单、仓库、凭证、薪资固资等候选草稿，支持附件 OCR 预览、OCR 人工修正、字段级确认、主数据匹配、拒绝原因留痕和 dry-run 错误修正 |
| LLM 配置与评估 | 配置大模型供应商、模型、脱敏策略、Schema 成功率、草稿采纳率和人工修正率 |
| 迁移向导 | 上传、字段映射、dry-run 报错、修正、正式导入和试算平衡 |
| 备份恢复 | 已提供 `/backup-restore` 工作台，展示持久化备份列表、恢复演练、静默沙箱状态、外发阻断通道、附件 Hash 校验和恢复影响范围 |
| 安全审计 | 越权拦截、敏感操作、环境模式、幂等键异常和性能压测结果；已落地 `security_events` 与 `/api/security/events`，支持权限拒绝和幂等范围异常的持久化筛选 |

UI 验收：

- Agent 动作详情必须在同一页面展示 dry-run 与正式执行的差异。
- Agent 动作详情执行反向处理时必须要求填写反向原因，并把原因写入 `reversalResult` 与 Replay。
- 高风险动作在审批前必须展示证据 Hash 校验状态和风险等级。
- Tool Registry 必须能看出哪些工具只能读、哪些只能生成草稿、哪些需要人工审批。
- Replay 回放必须能按时间顺序还原输入、工具调用、证据、审批和执行结果，并在 Agent Action 详情与 Replay API 中返回一致的 `auditSummary`。
- 任何对外通讯或资金相关动作页面必须明确显示“需要真人最终确认”。
- 草稿生成页面必须展示模型原始建议、系统匹配后的主数据、未匹配项、dry-run 错误和人工修改痕迹，不能让用户误以为模型输出已经成为正式单据。

---

# 10. 开发排期：12 周详细版

- 第 1-3 周：Agent Gateway（强 Schema 墙）、Tool Registry、Agent Action 状态机、Idempotency 隔离、草稿工具 Schema 注册。
- 第 4-5 周：Evidence 证据防篡改机制（WORM）、Replay 回放与全量 Audit 日志组件落地。
- 第 6-7 周：三大智能助手（结账、对账、催收）与草稿填写助手业务规则开发。落实人工审批、字段级确认与外部物理拦截红线。
- 第 8 周：数据迁移引擎与 dry-run 支持。
- 第 9-10 周：LLM Draft Adapter、模型供应商配置、脱敏策略、灾备演练、备份脚本、沙箱隔离环境配置。
- 第 11 周：高并发性能压测、越权安全演练。
- 第 12 周：三套环境部署脚本及端到端验收打通测试，准备最终交付。

---

# 11. 一句话总结

Phase 6 是从“能用的代码”到“可信赖的工业级金融产品”的跨越：

```text
严控大模型幻觉与越权红线
+
打造不可篡改的证据与回放链条
+
完善的迁移、备份与多态部署能力
```

**系统具备上线一切条件。AIS ERP Suite，扬帆起航！**
