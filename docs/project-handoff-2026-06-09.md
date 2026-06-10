# AIS ERP Suite Phase 1 交接说明

交接日期：2026-06-09  
项目状态：Phase 1 已完成主要闭环开发和本地验收，但仓库仍处于大量未提交/未跟踪文件状态，需要下一位开发者先确认代码范围并提交。

## 1. 项目定位

这是一个 AIS/ERP 财务套件原型，当前重点是 Phase 1：账套、用户权限、科目、期间、凭证、审核、记账、报表、附件、AI 凭证建议、部署配置检查等基础闭环。

主要技术栈：

- 前端：React 19 + TypeScript + Vite + Ant Design v6
- 后端：Node.js HTTP API，内存存储为默认模式，可接 Prisma 平台持久化
- 测试：Node test runner + 前端静态计划测试 + API/domain 测试

## 2. 当前仓库状态

当前工作区不是干净状态，包含已修改文件和大量未跟踪文件。交给下一位开发者前，建议保留现状并让对方先执行：

```powershell
git status --short
```

当前重要未跟踪/新增区域包括：

- `apps/web/`：完整前端应用
- `services/api/src/`、`services/api/tests/`：API 服务和测试
- `packages/database/`：数据库/Prisma 平台持久化相关代码
- `packages/domain/src/generalLedger.mjs`、`packages/domain/src/platform.mjs`
- `docs/phase-1-*.md`：Phase 1 验收、部署、操作、用户手册等文档
- `package-lock.json`

当前重要已修改文件包括：

- `.env.example`
- `.gitignore`
- `package.json`
- `scripts/run-domain-tests.mjs`
- `services/api/openapi.yaml`
- `apps/web/README.md`

注意：本机 `.env` 已创建但被 `.gitignore` 忽略，不会进入 git。

## 3. 本地启动方式

推荐在 Windows PowerShell 下运行。

安装依赖后：

```powershell
cmd /c npm run dev:api
cmd /c npm run dev --workspace apps/web -- --host 127.0.0.1
```

访问：

- 前端：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3000`
- 部署配置检查：`http://127.0.0.1:5173/deployment-config`

如果 Vite 后台启动不稳定，可直接启动 Vite 入口：

```powershell
node .\node_modules\vite\bin\vite.js --host 127.0.0.1
```

若端口被占用：

```powershell
netstat -ano | Select-String ':3000'
netstat -ano | Select-String ':5173'
Stop-Process -Id <PID> -Force
```

## 4. 本地环境配置

本地 `.env` 当前用于让部署配置页不再出现缺失项。若通过 git 交接，对方需要自行创建 `.env`，可从 `.env.example` 复制。

最小本地配置：

```env
DATABASE_URL="file:./dev.db"
AIS_PLATFORM_STORE="memory"

AIS_ATTACHMENT_STORAGE_PROVIDER="local"
AIS_ATTACHMENT_STORAGE_ROOT="./data/attachments"

AIS_JWT_SECRET="local-development-secret-change-before-deploying"

API_PORT=3000
AIS_DEPLOYMENT_MODE="local"
DEPLOYMENT_MODE="local"
```

已修复：`services/api/src/server.mjs` 现在会在作为主程序启动时自动加载项目根目录 `.env`，并支持 `API_PORT`。

正式部署注意：

- `AIS_JWT_SECRET` 必须换成强随机密钥。
- 生产/私有云/SaaS 模式需要显式附件存储配置。
- 如果启用外部附件存储，需要配置端点、桶、凭据引用和保留天数。

## 5. 最近完成的关键修复

### 全站中文化

已将主要页面、按钮、表头、状态、角色、权限、操作人、部署配置项等改为中文展示。

保留的英文主要是技术标识或产品缩写，例如 `AIS ERP`、`JWT`、`CSV`、`Excel`。

### 部署配置页

已修复：

- `Deployment Configuration / Check / Missing / Configured` 等英文文案。
- 环境变量名满屏显示的问题，改为中文配置项，原始变量名保留在 `title` 中。
- 本地附件模式下，外部附件端点/存储桶/凭据/保留天数不再误标红，显示为“未启用”。
- `.env` 自动加载后，数据库、JWT、本地附件存储在本机可显示为已配置。

### 用户管理/角色权限重复入口

已确认 `/users` 和 `/roles` 原本渲染同一个 `UserAccess` 页面。现在：

- 侧边栏只保留一个入口：`用户与角色权限`
- `/roles` 保留为正式页面
- `/users` 重定向到 `/roles`

### 科目导入误解

当前规则：账套启用后，科目、辅助核算、期初余额等初始化主数据不能再变更。

已修复：

- API 英文错误翻译为中文。
- 科目页会根据当前账套状态禁用 `导入标准科目`、`导入预览`、`新增科目`、行内编辑/停用/启用/删除，并显示中文提示。

正确操作流程：

1. 在账套管理中保持账套未启用，或先停用账套。
2. 导入/维护科目。
3. 完成初始化后再启用账套。

## 6. 当前验证结果

最近一次验证全部通过：

```powershell
cmd /c npm run lint --workspace apps/web
cmd /c npm run build --workspace apps/web
cmd /c npm test
```

结果：

- 前端 lint：通过
- 前端 build：通过
- 根测试：137/137 通过

Vite build 有 chunk size warning，但不是失败：

```text
Some chunks are larger than 500 kB after minification
```

后续可通过代码分割处理。

## 7. 重要业务规则

### 账套生命周期

- 草稿/停用账套：允许初始化主数据，如科目、辅助核算、期初余额。
- 启用账套：锁定初始化主数据，不允许导入科目或修改期初余额。

### 凭证生命周期

典型流程：

```text
草稿 -> 提交 -> 审核 -> 记账
```

期间关闭/锁定会阻止凭证新增、修改、审核、记账等操作。

### JWT

JWT 用于登录身份和权限校验。部署配置页检查 `JWT 密钥` 是为了确保令牌签名安全。

## 8. 已有文档入口

优先阅读：

- `docs/phase-1-detailed-plan.md`
- `docs/phase-1-acceptance-report.md`
- `docs/phase-1-acceptance-matrix.md`
- `docs/phase-1-deployment-manual.md`
- `docs/phase-1-operation-manual.md`
- `docs/phase-1-user-manual-zh.md`
- `docs/phase-1-test-steps-zh.md`

设计和全局规划：

- `docs/prd.md`
- `docs/architecture.md`
- `docs/ui-design.md`
- `docs/traceability-matrix.md`
- `docs/implementation-roadmap.md`

## 9. 建议下一步

建议下一位开发者按以下顺序继续：

1. 整理 git 工作区  
   先确认哪些新增文件要纳入提交，避免漏掉 `apps/web`、`services/api/src`、`packages/database` 等核心目录。

2. 做一次代码审查  
   重点看后端 enabled account set lock 是否需要覆盖更多写接口。当前前端已禁用科目维护，但后端对部分科目更新/删除接口的锁定还可以继续加严。

3. 持久化模式验证  
   当前默认 `AIS_PLATFORM_STORE="memory"`。如果要进入真实联调，应切换到 `prisma`，跑迁移、seed，并验证账套/用户/凭证持久化。

4. 前端体验收尾  
   - 当前菜单选中状态主要依赖默认值，建议改成跟随路由。
   - `apps/web/package.json` 包名仍是 `web-temp`，建议改为正式名称。
   - Vite chunk warning 后续可用动态导入拆分。

5. Phase 2 前准备  
   Phase 1 测试已过，但进入 Phase 2 前建议再跑一次人工验收脚本，并确认 Phase 1 文档与实际 UI 完全一致。

## 10. 给下一位开发者的快速检查清单

```powershell
git status --short
cmd /c npm install
cmd /c npm run lint --workspace apps/web
cmd /c npm run build --workspace apps/web
cmd /c npm test
cmd /c npm run dev:api
cmd /c npm run dev --workspace apps/web -- --host 127.0.0.1
```

浏览器打开：

```text
http://127.0.0.1:5173
```

重点检查：

- 部署配置页无红色必填项误报。
- 用户与角色权限入口不重复。
- 已启用账套下科目页主数据按钮被禁用。
- 未启用/停用账套下可以导入科目。
- 凭证从录入到记账、报表查询可以跑通。

