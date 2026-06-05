# AIS ERP Suite

基于《会计信息系统(第9版·立体化数字教材版)——基于用友新道 U8+ V15.0》功能边界整理的企业财务与业务核算系统骨架。

本项目目标不是复刻任何专有软件界面或代码，而是实现教材覆盖的会计信息系统功能等价能力：总账、采购付款、销售收款、存货、薪资、固定资产、报表、实施验收，以及可被 AI/API/Agent 安全调用的工作流。

## 当前资产

- [PRD](docs/prd.md)
- [功能追踪矩阵](docs/traceability-matrix.md)
- [架构设计](docs/architecture.md)
- [Agent 操作规范](docs/agent-operations.md)
- [Agent 原生财务系统设计](docs/agent-native-design.md)
- [个人优先、预留多人协作的开发方式](docs/multi-team-development.md)
- [实施路线图](docs/implementation-roadmap.md)
- [任务级实施计划](docs/superpowers/plans/2026-06-05-ais-erp-suite.md)
- [API 草案](services/api/openapi.yaml)

## 仓库结构

```text
ais-erp-suite/
  apps/
    web/                 # 未来的 Web 前端
    desktop/             # 未来可迁移/复用 ai-finance-desktop 的桌面端能力
  services/
    api/                 # 主业务 API 服务
    ai-worker/           # OCR、大模型、Agent 执行与审核服务
  packages/
    domain/              # 财务领域模型、模块目录、基础规则测试
  docs/
    superpowers/plans/   # 给 Codex/Claude Code 等 agent 执行的任务计划
```

## 本地验证

当前骨架不依赖网络安装包，可以直接运行领域层测试：

```powershell
node scripts/run-domain-tests.mjs
```

如果本机没有 `node`，可使用 Codex 工作区运行时里的 Node：

```powershell
C:\Users\jin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/run-domain-tests.mjs
```

## 与旧 AI 财务软件的关系

`C:\antigra-workplace\ai-finance-desktop` 可以作为参考或未来迁移来源，尤其是 OCR、AI 记账、凭证、报表、审批、桌面打包等能力。本项目先独立建立完整 ERP/AIS 范围，避免把教材全功能需求直接塞进旧桌面工具导致边界混乱。
