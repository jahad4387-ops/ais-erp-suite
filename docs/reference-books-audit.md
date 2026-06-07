# 财务软件参考书审核记录

## 1. 审核范围

本次审核读取工作区 `C:\antigra-workplace\财务软件参考书` 下的 3 本 EPUB。按用户要求，若 EPUB 没有可解析文字层，则不继续解析图片页。

## 2. 可解析状态

| 文件 | 可解析文字层状态 | 本次使用方式 |
| --- | --- | --- |
| `会计信息系统(第9版·立体化数字教材版)...epub` | 仅能读取粗略 NCX 项，标题为扫描转换占位信息 | 作为既有教材来源，当前计划已依据 PDF/目录覆盖，不新增细节 |
| `会计管理信息系统...epub` | 仅能读取占位标题和 `Start`，正文主要为图片页 | 已通过多模态大模型读取图片目录，补充高级运维和外围系统集成要求 |
| `用友ERP-U8财务软件实用教程...epub` | 可读取完整目录和正文文字层 | 作为本次补漏的主要新增依据 |

## 3. 补充出的遗漏点

《用友ERP-U8财务软件实用教程》的目录更偏真实软件操作和实验验收。同时，《会计管理信息系统》补充了更宏观的运维与集成视角。对照当前计划，需要补入：

1. 安装、卸载和环境检查。
2. 系统管理：操作员、角色、账套启用、系统参数、备份恢复。
3. 基础档案初始化顺序和档案导入校验。
4. 数据权限设置：功能权限、数据范围权限、字段权限、Agent 工具权限。
5. 单据设置：单据编号规则、单据模板、状态流、打印/导出模板。
6. 各模块初始化：总账、工资、固定资产、应收、应付、存货。
7. 银行对账：银行日记账、银行对账单、自动勾对、手工勾对、余额调节表。
8. 模块期末处理：应收应付、工资、固定资产、存货都要进入月末检查。
9. UFO 报表式能力：自由格式报表、单元格公式、模板复制、报表输出。
10. 实验式验收：系统管理、基础档案、总账初始、总账日常、银行对账、期末处理、UFO 报表。
11. 系统日常高级维护：数据检测（健康检查）、历史数据归档与清理、重建索引与性能优化。
12. 外部系统与电子商务集成：电子商务平台与外部业务子系统对接标准 API。

## 4. 已补入的计划位置

| 遗漏点 | 补入位置 |
| --- | --- |
| 安装/卸载和环境检查 | `docs/phase-0-detailed-plan.md`、`docs/implementation-roadmap.md` |
| 系统管理 | `docs/prd.md`、`docs/phase-0-detailed-plan.md` |
| 数据权限 | `docs/prd.md`、`docs/phase-0-detailed-plan.md` |
| 单据设置 | `docs/prd.md`、`docs/phase-0-detailed-plan.md` |
| 模块初始化 | `docs/phase-0-detailed-plan.md`、`docs/implementation-roadmap.md` |
| 银行对账 | `docs/prd.md`、`docs/phase-0-detailed-plan.md` |
| 模块期末处理 | `docs/prd.md`、`docs/implementation-roadmap.md` |
| UFO 报表能力 | `docs/prd.md`、`docs/phase-0-detailed-plan.md` |
| 实验式验收 | `docs/phase-0-detailed-plan.md` |
| 系统日常高级维护 | `docs/prd.md`、`docs/phase-0-detailed-plan.md` |
| 外部系统与电子商务集成 | `docs/prd.md`、`docs/phase-0-detailed-plan.md` |

## 5. 后续建议

Phase 1 开始前，建议把《用友ERP-U8财务软件实用教程》的实验 1-6 转成平台与总账 MVP 验收用例；Phase 5 开始前，把实验 7-9 转成报表模板、公式和输出验收用例。
