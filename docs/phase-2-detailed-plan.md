# Phase 2：采购付款 + 销售收款详细开发计划

Phase 2 的目标不是直接做完整库存成本，也不是做完整经营分析，而是把 **采购到付款 P2P** 和 **销售到收款 O2C** 两条主业务链打通，作为 Phase 1 总账内核之后的第一个业务闭环阶段：**业务单据 → 应收/应付 → 收付款 → 核销 → 自动生成总账凭证 → 往来账与总账辅助账一致**。

最终闭环是：

```text
采购订单
→ 到货 / 入库
→ 采购发票
→ 应付确认
→ 付款申请
→ 付款单
→ 应付核销
→ 自动生成总账凭证
→ 供应商往来账 / 应付账龄 / 付款计划

销售订单
→ 发货 / 出库
→ 销售发票
→ 应收确认
→ 收款单
→ 应收核销
→ 自动生成总账凭证
→ 客户往来账 / 应收账龄 / 回款分析
```

---

# 1. Phase 2 前置条件

进入 Phase 2 之前，Phase 1 至少要完成这些能力：

| 前置能力     | 要求                         |
| -------- | -------------------------- |
| 账套、组织、期间 | 单据必须落在有效账套、组织、会计期间内        |
| 用户、角色、权限 | 采购、销售、付款、收款、审核权限分离         |
| 科目与辅助核算  | 应收、应付、收入、税金、银行、存货、费用等科目可配置 |
| 凭证草稿接口   | 业务单据可以生成凭证草稿               |
| 凭证审核与记账  | 业务凭证走总账统一审核和记账流程           |
| 附件与证据    | 发票、合同、银行流水、付款审批附件可追溯       |
| 审计日志     | 单据创建、审核、生成凭证、付款、收款、核销都要留痕  |
| 银行/现金基础  | 付款单、收款单能关联银行账户或现金账户        |

---

# 2. Phase 2 范围边界

## 2.1 Phase 2 必须做

| 模块       | 必做内容                          |
| -------- | ----------------------------- |
| 供应商与客户档案 | 供应商、客户、信用额度、付款条件、收款条件、税率、结算方式 |
| P2P 单据链  | 采购申请、采购订单、到货单、采购入库单、采购发票、采购退货 |
| 应付管理     | 应付确认、预付款、付款申请、付款单、付款审批、付款核销、**冻结付款**   |
| O2C 单据链  | 销售报价、销售订单、发货单、销售出库单、销售发票、销售退货 |
| 应收管理     | 应收确认、预收款、收款单、坏账准备第一版、收款核销     |
| 交叉核销     | **红字单据核销**、**应收冲应付（AR/AP Netting）** |
| 自动凭证     | 采购发票、付款单、销售发票、收款单生成总账凭证草稿     |
| 往来账      | 供应商往来账、客户往来账、应收应付明细           |
| 账龄分析     | 应收账龄、应付账龄                     |
| 计划分析     | 付款计划、回款计划、逾期清单                |
| Agent 辅助 | 应收/应付核销建议、凭证建议、催收草稿、异常检查      |

---

## 2.2 Phase 2 暂不完整做

这些要预留字段和接口，但不要在 Phase 2 做重，严禁引入过高的复杂度：

```text
完整库存成本核算（移动平均 / FIFO / 月末一次加权留到 Phase 3）
复杂销售成本结转
完整存货明细账
完整现金流量表
复杂价格体系、返利、折扣、佣金
复杂多币种汇兑损益
复杂外部电商平台对接
暂估价差追溯算法（Phase 2 的发票入库价差直接计入材料成本差异或当期损益）
复杂坏账矩阵模型（Phase 2 坏账仅做简单全局百分比或手工计提）
复杂敞口信用检查（Phase 2 仅以“总额度 - AR余额”做简易校验）
```

---

# 3. 模块契约

推荐 Phase 2 使用 `feature/procure-to-pay` 和 `feature/order-to-cash` 分支推进。

## 3.1 采购付款模块契约

```text
模块名称：procure-to-pay

负责范围：
供应商、采购申请、订单、到货、入库、发票、退货、应付、预付、付款申请、付款单、审批、核销、冻结付款、往来账、账龄、付款计划。

不负责范围：
完整库存成本、复杂供应链计划、生产采购、完整供应商门户。

依赖模块：
platform、master-data、general-ledger、cash-bank、attachment/evidence、approval、audit、ai-assist。

会生成的凭证：
采购发票凭证、暂估入库凭证、到票回冲凭证、付款凭证、预付款凭证、采购退货冲销凭证、采购暂估价差处理凭证。
```

## 3.2 销售收款模块契约

```text
模块名称：order-to-cash

负责范围：
客户、信用额度、销售报价、订单、发货、出库、发票、退货、应收、预收、收款、核销、往来账、应收账龄、回款计划、催收清单。

不负责范围：
完整 CRM、复杂价格促销、完整销售成本算法、售后服务系统。

依赖模块：
platform、master-data、general-ledger、cash-bank、attachment/evidence、approval、audit、ai-assist。

会生成的凭证：
销售收入凭证、销项税凭证、收款凭证、预收款凭证、销售退货冲销凭证、坏账准备凭证。
```

---

# 4. 核心业务流程

## 4.1 P2P：采购到付款流程

```text
采购申请
→ 采购订单
→ 到货单
→ 采购入库单
→ 采购发票
→ 应付单 (支持冻结付款)
→ 付款申请
→ 付款审批
→ 付款单
→ 应付核销
→ 自动生成凭证
→ 供应商往来账 / 应付账龄 / 付款计划
```

## 4.2 O2C：销售到收款流程

```text
销售报价
→ 销售订单 (简易信用校验)
→ 发货单
→ 销售出库单
→ 销售发票
→ 应收单
→ 收款单
→ 应收核销
→ 自动生成凭证
→ 客户往来账 / 应收账龄 / 回款分析 / 催收清单
```

---

# 5. 单据状态机设计

## 5.1 通用业务单据状态

```text
draft 草稿
submitted 已提交
approved 已审核
partially_executed 部分执行
executed 已执行
closed 已关闭
cancelled 已取消
reversed 已冲销
```

---

# 6. 数据模型设计

## 6.1 通用基础表

```text
partners (统一管理客户和供应商，支持 partner_type: both)
- id
- account_set_id
- partner_type (customer / supplier / both)
- code
- name
- tax_rate
- credit_limit
- payment_terms
- settlement_method
```

## 6.2 P2P 采购与应付表

### purchase_orders

```text
- id
- account_set_id
- supplier_id
- order_no
- order_date
- total_amount
- status (draft / submitted / approved / partially_received / completed / closed)
- currency
- exchange_rate
```

### purchase_order_lines

```text
- id
- purchase_order_id
- item_id
- quantity
- unit_price
- tax_rate
- tax_amount
- total_amount
- received_quantity
- invoiced_quantity
```

### ap_bills (应付单/采购发票)

### ap_bills

```text
id
account_set_id
supplier_id
bill_no
bill_date
due_date
payable_amount
paid_amount
settled_amount
status
is_payment_blocked (防坑设计：冻结付款，true时禁止发起付款申请)
block_reason
gl_voucher_id
...
```

### ap_settlements (付款核销单)

```text
id
account_set_id
supplier_id
settlement_type: payment_to_bill / prepayment_to_bill / refund / credit_note_to_bill / ar_ap_netting
status
gl_voucher_id
...
```

## 6.3 O2C 销售与应收表

### sales_orders

```text
- id
- account_set_id
- customer_id
- order_no
- order_date
- total_amount
- status (draft / submitted / approved / partially_shipped / completed / closed)
- currency
- exchange_rate
```

### sales_order_lines

```text
- id
- sales_order_id
- item_id
- quantity
- unit_price
- tax_rate
- tax_amount
- total_amount
- shipped_quantity
- invoiced_quantity
```

### ar_bills (应收单/销售发票)

```text
- id
- account_set_id
- customer_id
- bill_no
- bill_date
- due_date
- receivable_amount
- received_amount
- settled_amount
- status
- gl_voucher_id
```

### ar_settlements (收款核销单)

```text
- id
- account_set_id
- customer_id
- settlement_type: receipt_to_bill / prepayment_to_bill / refund / credit_note_to_bill / ar_ap_netting
- status
- gl_voucher_id
```

---

# 7. 总账凭证集成设计

## 7.1 P2P 凭证模板

### 采购发票确认

```text
借：库存商品 / 原材料 / 费用科目
借：应交税费 - 应交增值税 - 进项税额
贷：应付账款 - 供应商辅助
```

### 暂估价差处理（防坑设计）
如果采购订单暂估 100，发票开具 105，由于 Phase 2 不处理复杂的库存成本回算，差额处理为：
```text
借：材料成本差异 / 当期损益科目 5
贷：应付账款 - 供应商辅助 5
```

---

# 8. 核销设计

## 8.1 交叉与复杂核销支持

核心表 `ap_settlement_lines` 和 `ar_settlement_lines` 必须支持以下组合：
1. **付款核销应付 / 收款核销应收**。
2. **预付核销应付 / 预收核销应收**。
3. **红字核销（Credit Note Application）**：采购退货产生的红字应付，与正常应付或退款的核销。
4. **应收冲应付（AR/AP Netting）**：如果 Partner 同时是客户和供应商，允许使用应收账款核销应付账款，生成对应的借贷总账凭证。

---

# 9. Agent / AI 设计

Phase 2 要把 Agent 能力扩展到 **应收应付核销建议、发票识别、付款/收款匹配、催收建议**。
必须遵循：所有写操作支持 `dryRun=true` 和 `idempotencyKey`，Agent 不能直接调用正式记账接口，只能生成草稿或提交审批。

---

# 10. 前端页面规划

Phase 2 前端遵循 `docs/ui-design.md` 的通用列表页、编辑页、工作台和详情页模式。采购付款与销售收款页面必须突出“单据状态流、来源链路、凭证预览、核销关系和往来余额一致性”，界面保持简洁商务，不做装饰型大屏。

| 页面 | 设计重点 |
| --- | --- |
| 供应商档案 | 表格展示供应商、付款条件、税率、状态；详情抽屉展示往来余额、冻结付款原因和最近单据 |
| 客户档案 | 表格展示客户、信用额度、收款条件、状态；详情抽屉展示应收余额、逾期金额和信用占用 |
| 采购订单列表 | 按供应商、状态、期间、到货进度筛选；表格展示订单金额、已入库、已开票、已付款 |
| 采购订单详情 | 状态条展示下游到货、入库、发票、付款和凭证；明细行支持来源反查 |
| 采购发票 | 展示 OCR/导入结果、发票金额、税额、暂估差异、应付确认和凭证草稿预览 |
| 付款申请工作台 | 左侧待付款队列，中间付款对象，右侧付款风险、冻结提示、审批意见和凭证影响 |
| 应付核销工作台 | 并列表格展示应付、预付、红字单据和付款单；核销前展示差额和总账辅助账影响 |
| 销售订单列表 | 按客户、销售员、状态、发货进度筛选；突出信用额度状态和回款计划 |
| 销售发票 | 展示收入确认、销项税、应收确认和凭证草稿；异常税率需高亮说明 |
| 收款核销工作台 | 收款单与应收单匹配，支持预收、红字和 AR/AP Netting 的清晰关系展示 |
| 往来账详情 | 从客户或供应商进入，展示单据、凭证、核销、余额和账龄分布 |
| 账龄分析 | 应收/应付账龄表支持按对象、业务员、部门和期间下钻到明细单据 |
| 付款/回款计划 | 列表视图优先，日历视图辅助；逾期项显示原因和下一步动作 |

UI 验收：

- 每张业务单据都可以从详情页反查来源、附件、审批、凭证和核销记录。
- 付款、收款和核销动作必须进入预览确认页，展示金额、对象、期间、凭证影响和风险。
- 冻结付款、信用额度不足、红字核销、AR/AP Netting 必须有明确状态标签和文字说明。
- Agent 建议只能进入草稿或待确认状态，不能直接生成正式付款、收款或记账结果。

---

# 11. 开发排期：12 周详细版

- 第 1 周：供应商、客户、付款条件、收款条件、税率和结算方式档案。
- 第 2 周：采购申请、采购订单、销售报价、销售订单的状态机和列表页面。
- 第 3 周：采购到货、采购入库、销售发货、销售出库的来源链路和附件证据。
- 第 4 周：采购发票、销售发票、OCR/导入结果确认和暂估差异提示。
- 第 5 周：应付确认、应收确认、往来明细和总账辅助核算映射。
- 第 6 周：付款申请、付款审批、付款单、冻结付款控制。
- 第 7 周：收款单、预收款、信用额度占用和回款计划。
- 第 8 周：应付核销、预付核销、红字核销和核销差额处理。
- 第 9 周：应收核销、预收核销、AR/AP Netting 和凭证草稿生成。
- 第 10 周：供应商往来账、客户往来账、应收应付账龄、付款/回款计划页面。
- 第 11 周：Agent 核销建议、催收草稿、异常检查和 dry-run 预览。
- 第 12 周：P2P/O2C 端到端联调，验证单据、凭证、核销、往来账和总账辅助账一致。

---

# 12. Phase 2 优先级与验收要求

Phase 2 的核心是建立 **业务单据到财务核算的双闭环**。

只要 Phase 2 做到 **单据可追溯、凭证可反查、暂估价差受控、支持红字与应收冲应付、冻结防坑生效、往来余额与总账辅助账一致、Agent 只能建议不能越权执行**，后面的存货成本和高阶报表阶段就都有了稳固基石。
