# Agent 操作规范

## 1. 目标

允许 Codex、Claude Code、内部 RPA 或其他 Agent 代替人工完成查询、检查、草稿生成、批量整理等工作，同时防止 Agent 绕过财务控制。

## 2. 风险分级

| 风险 | 动作 | 控制 |
| --- | --- | --- |
| 低 | 查询账表、解释报表、生成分析草稿 | 记录日志即可 |
| 中 | OCR 结构化、生成单据草稿、核销建议、凭证建议 | 人工确认后生效 |
| 高 | 审核、记账、付款、结账、反结账、删除/作废 | 双人审批、权限校验、审计、可回滚 |

## 3. Agent API 原则

- 所有写操作必须支持 `dryRun=true`。
- 所有写操作必须提交 `idempotencyKey`。
- 每个建议必须包含 `evidenceRefs`、`reasoningSummary`、`confidence`。
- Agent 不能直接调用正式记账接口，只能调用草稿或提交审批接口。
- 审批通过后的执行人应记录为“审批人 + Agent 执行主体”。

## 4. 典型任务

### 4.1 AI 记账

1. 上传发票、银行流水或合同。
2. AI worker 提取票面字段和业务事实。
3. 生成凭证草稿和来源证据。
4. 会计修改或确认。
5. 财务主管审核。
6. 系统记账并写入审计日志。

### 4.2 应收催收

1. Agent 查询逾期应收。
2. 结合客户信用、历史回款和合同条款生成催收清单。
3. 输出邮件/微信话术草稿。
4. 人工选择发送。

### 4.3 月末结账助手

1. 检查未审核凭证。
2. 检查未记账业务单据。
3. 检查未计提折旧、未分摊工资、未计算出库成本。
4. 检查总账与子系统对账差异。
5. 生成结账风险报告。
6. 人工处理后重新检查。

## 5. Agent Action 状态机

```text
created -> dry_run_completed -> submitted_for_approval -> approved -> executed -> archived
created -> dry_run_completed -> rejected -> archived
created -> cancelled -> archived
executed -> reversed -> archived
```

## 6. 必备审计字段

- `agentActionId`
- `agentName`
- `requestedByUserId`
- `approvedByUserId`
- `accountSetId`
- `fiscalPeriodId`
- `riskLevel`
- `operation`
- `dryRunPayload`
- `executionPayload`
- `evidenceRefs`
- `createdAt`
- `approvedAt`
- `executedAt`
