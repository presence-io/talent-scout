# @talent-scout/dashboard

[![GitHub Actions](https://github.com/huandu/talent-scout/actions/workflows/publish.yml/badge.svg)](https://github.com/huandu/talent-scout/actions/workflows/publish.yml)
[![npm: @talent-scout/dashboard](https://img.shields.io/npm/v/%40talent-scout%2Fdashboard?logo=npm)](https://www.npmjs.com/package/@talent-scout/dashboard)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f.svg)](../../LICENSE)

`@talent-scout/dashboard` 是一个本地 Astro 界面，用来浏览 shortlist、查看单个候选人的证据链、写人工标注，以及管理 OpenClaw cron 的运行状态。它不是线上 SaaS，而是工作区里的运营台。

## 开发前提

- Node.js 22+
- pnpm 10+
- 已经至少跑过一次 `collect -> process -> evaluate`
- `workspace-data/` 目录里存在 `output/evaluated/latest`

统一在仓库根目录安装依赖：

```bash
pnpm install
```

## 最重要的运行约定

Dashboard 现在统一通过配置文件管理运行路径，不再依赖 `TALENT_WORKSPACE`、`TALENT_OUTPUT_DIR`、`TALENT_USER_DATA_DIR` 这类环境变量。

配置入口是 [dashboard.config.mjs](./dashboard.config.mjs)。默认行为是：

- 自动向上查找包含 `talents.yaml` 或 `pnpm-workspace.yaml` 的项目根目录
- 从该根目录下读取 `workspace-data/`
- 使用 `workspace-data/output/evaluated/latest` 作为评估结果目录
- 使用 `workspace-data/user-data` 作为人工标注目录

默认配置已经适配当前仓库，因此通常不需要额外设置任何参数。

推荐从仓库根目录启动：

```bash
pnpm --filter @talent-scout/dashboard run dev
```

如果你要预览构建产物：

```bash
pnpm --filter @talent-scout/dashboard run build
pnpm --filter @talent-scout/dashboard run preview
```

如果你维护多套运行数据，直接修改 [dashboard.config.mjs](./dashboard.config.mjs) 中的 `workspaceDir` 或 `projectRoot` 即可。

## 在 `workspace-data` 上工作的方式

Dashboard 读写两个目录：

- 读取 `workspace-data/output/evaluated/latest`
- 写入 `workspace-data/user-data`

这意味着它既能看到最新评估结果，也能把人工标注、忽略名单等“运营层数据”与 pipeline 产物隔离开。

一个最常见的本地流程：

1. 在仓库根目录跑一次 `pnpm pipeline`
2. 直接启动 Dashboard；默认配置会自动指向仓库根目录下的 `workspace-data`
3. 打开候选人列表页筛选 `reach_out`
4. 在详情页补充备注或加入忽略名单
5. 回到统计页查看这轮运行的分布变化

如果你要切换到别的工作区，例如 `../talent-scout-prod/workspace-data`，可以这样改：

```js
export default {
  projectRoot: '../talent-scout-prod',
  workspaceDir: 'workspace-data',
  talentsConfigFile: 'talents.yaml',
};
```

## 页面与模块

- `src/pages/index.astro`: 候选人列表页
- `src/pages/candidate/[username].astro`: 候选人详情页
- `src/pages/stats.astro`: 统计页
- `src/pages/cron.astro`: OpenClaw cron 状态页
- `src/pages/api/*`: Web 适配层 API route
- `src/lib/candidates.ts`: 排序、筛选、分页
- `src/lib/format.ts`: 展示格式化
- `src/lib/merge.ts`: 把评估结果与人工标注、忽略名单合并
- `src/lib/stats.ts`: 分布和趋势计算
- `src/lib/dashboard-config.ts`: Dashboard 运行配置与 `talents.yaml` 解析
- `src/lib/file.ts`: 本地 JSON 读写与工作区路径解析

## 设计思想

### 1. UI 层只负责交互，不负责业务计算

排序、筛选、合并、统计都放在 `src/lib/` 里做成纯函数，页面只负责绑定和展示。这样 Dashboard 的大部分核心逻辑都可以被 Vitest 直接测试，而不是塞进浏览器脚本里。

### 2. 运营数据必须独立存放

人工标注是主观信息，不能混入评估结果文件，否则重跑 pipeline 就会覆盖人工工作。这个包因此只写 `workspace-data/user-data/`，不直接改动 `output/`。

### 3. Dashboard 和 skills 必须共享同一套读模型

列表、详情和统计都通过 `@talent-scout/ai-evaluator` 提供的查询函数读取结果，而不是 UI 自己重新解析多份 JSON。这样文本查询和 Web 查询看到的是同一套事实。

## 页面流

```mermaid
flowchart TD
  A[workspace-data/output/evaluated/latest] --> B[API routes]
  C[workspace-data/user-data] --> B
  B --> D[index.astro]
  B --> E[candidate/[username].astro]
  B --> F[stats.astro]
  B --> G[cron.astro]
```

## 开发建议

- 任何可测试逻辑都优先下沉到 `src/lib/`
- 如果你要扩展筛选条件，先改 API route 和纯函数，再改页面
- 如果要切换到其他工作区数据，修改 [dashboard.config.mjs](./dashboard.config.mjs)，不要再新增散落的路径环境变量

## 相关文档

- [08-dashboard.md](../../docs/08-dashboard.md)
- [07-data-model.md](../../docs/07-data-model.md)
