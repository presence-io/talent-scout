# DESIGN-v2-08: Dashboard

> 系列文档索引：[01-overview](DESIGN-v2-01-overview.md) · [02-architecture](DESIGN-v2-02-architecture.md) · [03-data-sources](DESIGN-v2-03-data-sources.md) · [04-identity](DESIGN-v2-04-identity.md) · [05-evaluation](DESIGN-v2-05-evaluation.md) · [06-openclaw](DESIGN-v2-06-openclaw.md) · [07-data-model](DESIGN-v2-07-data-model.md) · [08-dashboard](DESIGN-v2-08-dashboard.md) · [09-testing](DESIGN-v2-09-testing.md) · [10-distribution](10-distribution.md)

## 1. 定位

一个本地运行的轻量级 Web 界面，供招聘人员和项目维护者使用：

- 浏览候选人列表，按多个维度筛选和排序
- 查看单个候选人的详细 profile、评分和证据链
- 对候选人进行人工标注（approved / rejected / noted），反馈写回 JSON
- 查看系统运行统计和趋势

Dashboard 不是唯一的数据消费入口。与之并行的还有 `@talent-scout/skills` 提供的 IM channel / TUI 文本查询界面。两者必须复用同一套查询接口，而不是各自重新解析底层 JSON。

**不是**一个需要部署到线上的生产级 SaaS。

## 2. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | Astro (SSR mode) | 默认零 JS、Server Islands 按需交互、API routes 原生支持 |
| UI | TailwindCSS + DaisyUI | 快速搭建、丰富的预制组件、主题统一 |
| 交互 Islands | 使用 Astro 原生客户端脚本（`<script>`） | 避免引入 React/Vue 等框架（交互需求不复杂） |
| 数据源 | 调用共享查询层，再由查询层读写本地文件 | 方便 Dashboard 与 `@talent-scout/skills` 复用 |
| 运行方式 | `astro dev` 本地开发服务器 | 不需要 build + deploy |

> **安全性**：Dashboard 仅在本地运行，不暴露到公网，无需登录或权限控制。

### 为什么不用 React / Vue

Dashboard 的交互需求有限（表格排序/筛选、弹窗详情、标注按钮），不需要完整的 SPA 框架。Astro 的 Server Islands + `lib/` 函数足以实现。

**重要规则**：不要在 Astro 的 `<script>` 标签中放置业务逻辑。所有可测试的逻辑（数据转换、排序、筛选、格式化）都应抽取到 `packages/dashboard/lib/` 目录下的纯函数中，`<script>` 仅做 DOM 事件绑定和函数调用。这样 lib/ 下的函数可以被 Vitest 测试，而 `<script>` 本身无需测试。

```typescript
// ✘ 不要这样：在 <script> 中放计算逻辑
// <script>
//   const sorted = candidates.sort((a, b) => ...);
//   const filtered = sorted.filter(c => ...);
// </script>

// ✔ 正确做法：逻辑在 lib/，<script> 只做绑定
// lib/candidates.ts
export function sortCandidates(list: Candidate[], by: string, order: 'asc' | 'desc') { ... }
export function filterByAction(list: Candidate[], action: string) { ... }

// <script>
//   import { sortCandidates, filterByAction } from '../lib/candidates';
//   btn.addEventListener('click', () => { ... });
// </script>
```

## 3. 页面结构

```
pages/
├── index.astro           # 候选人列表（主页面）
├── candidate/
│   └── [username].astro  # 候选人详情页
├── stats.astro           # 运行统计与趋势
├── cron.astro            # OpenClaw 脚本/Cron 执行状态
└── api/
    ├── candidates.ts     # GET: 列表查询 / POST: 批量操作
    ├── candidate/
    │   └── [username].ts # GET: 详情 / PATCH: 标注
    ├── ignore.ts         # GET/POST: 忽略名单
    └── stats.ts          # GET: 统计数据
```

### 3.1 候选人列表页 (index.astro)

| 功能 | 实现方式 |
|------|---------|
| 表格展示 | DaisyUI table，列：username, name, city, final_score, skill, ai_depth, action |
| 排序 | 点击列头按该列排序，默认按 final_score 降序 |
| 筛选 | 顶部筛选栏：recommended_action (reach_out/monitor/skip)、city、ai_depth_tier |
| 分页 | 每页 50 条，DaisyUI pagination |
| 快速标注 | 每行末尾有 ✓ / ✗ / 📝 按钮，点击即提交 PATCH |

### 3.2 候选人详情页 (candidate/[username].astro)

| 区域 | 内容 |
|------|------|
| 顶部 | GitHub 头像 + 基本信息（name, city, company, email, blog） |
| 评分卡片 | 4 个轴的分数 + 证据列表 + 推荐动作 |
| 身份识别 | china_confidence + 各 tier 信号列表 |
| 信号列表 | 所有原始信号（type, detail, weight, source） |
| AI 摘要 | 自然语言的候选人评估总结 |
| 标注区域 | 文本框 + approved/rejected/noted 选择 |

### 3.3 OpenClaw 状态页 (cron.astro)

| 区域 | 内容 |
|------|------|
| 脚本列表 | 显示 `talents.yaml` 中配置的所有 cron 任务名、schedule、描述 |
| 执行状态 | 通过 `openclaw cron runs` 获取各任务最近 5 次执行的状态/时间/耗时 |
| 手动触发 | 每行有「Run Now」按钮，调用 `openclaw cron run --name {name}` |
| 同步按钮 | 将 `talents.yaml` 中的 cron 配置同步到 OpenClaw（调用 `cron:sync`） |

### 3.4 统计页 (stats.astro)

| 指标 | 展示 |
|------|------|
| 候选池总量 | 数字 + 历史趋势折线图 |
| 身份识别分布 | 饼图：high confidence / medium / low / below threshold |
| AI depth 分布 | 柱状图：consumer / user / builder / amplifier |
| 推荐动作分布 | 饼图：reach_out / monitor / skip |
| 城市分布 | 柱状图：top 10 城市 |
| 信号来源分布 | 水平柱状图：各 signal type 的候选人数量 |

图表使用 DaisyUI + 简单的 CSS 实现（不引入 Chart.js 等库），因为数据量小（< 10 个数据点），纯 CSS 柱状图/饼图足够。如果需要折线趋势图，可按需引入轻量级图表库。

## 4. API Routes

这些 API route 只是 Web 适配层。真正的数据读取、筛选、聚合逻辑应下沉到各业务包暴露的查询函数中，由 Dashboard API 和 `@talent-scout/skills` 共用。

### 4.1 GET /api/candidates

从共享查询层读取候选人列表；共享查询层再从 `workspace-data/output/latest/shortlist.json` 等文件中读取底层数据。

Query params：

- `sort`: 排序字段（默认 `final_score`）
- `order`: `asc` / `desc`（默认 `desc`）
- `action`: 筛选 recommended_action
- `city`: 筛选城市
- `page`, `limit`: 分页

### 4.2 GET /api/candidate/[username]

从共享查询层读取指定候选人的完整数据。

### 4.3 PATCH /api/candidate/[username]

接收人工标注，写入 `workspace-data/user-data/annotations.json`：

```json
{
  "zhangsan": {
    "status": "approved",
    "note": "已联系，等待回复",
    "annotated_at": "2026-03-25T10:00:00Z",
    "annotated_by": "recruiter-a"
  }
}
```

`annotations.json` 是独立文件，不混入评估结果。Dashboard 展示时 merge 显示。

### 4.4 GET /api/stats

汇总统计数据，通过共享查询层从 `workspace-data/output/latest/` 各文件中计算。

## 5. 用户数据隔离

Dashboard 产生的用户数据**必须与 pipeline 抓取/评估的数据完全隔离**，存放在独立目录 `workspace-data/user-data/` 中：

```
workspace-data/user-data/
├── annotations.json    # 人工标注（approved/rejected/noted）
├── notes.json          # 候选人备注（自由文本）
├── score-overrides.json # 手动分数修正
└── ignore-list.json    # 忽略名单
```

设计原则：

- **Pipeline 永不读写 `workspace-data/user-data/`**：抓取和评估只写入 `workspace-data/output/`，保证可重跑
- **Dashboard 读 `workspace-data/output/` + `workspace-data/user-data/`**：展示时 merge 两个来源的数据
- **Dashboard 只写 `workspace-data/user-data/`**：标注、备注、分数修正都写到用户数据目录
- **`workspace-data/` 不提交到 git**：这是运行态与用户工作区状态

### 5.1 忽略名单 (ignore-list.json)

忽略名单是唯一被其他子项目读取的用户数据。Pipeline 在评估阶段跳过已忽略的候选人。

```typescript
// ignore-list.json
interface IgnoreList {
  [username: string]: {
    reason: string;
    ignored_at: string;
  };
}
```

读取方式：通过 `@talent-scout/shared` 提供的 `readIgnoreList()` 函数，所有子项目均可使用。

### 5.2 标注写入机制

- **只写 `workspace-data/user-data/` 目录**：不修改 `workspace-data/output/` 中的评估结果文件，保持评估数据的不可变性
- **追加式更新**：每次标注操作读取 → merge → 写回，不覆盖其他标注
- **JSON 原子写入**：先写临时文件，再 rename，避免写入中断导致数据损坏

```typescript
// API route 中的写入逻辑
async function updateAnnotation(username: string, annotation: Annotation) {
  const filePath = path.join(USER_DATA_DIR, 'annotations.json');
  const tmpPath = filePath + '.tmp';

  const existing = await readJsonSafe(filePath, {});
  existing[username] = { ...annotation, annotated_at: new Date().toISOString() };

  await fs.writeFile(tmpPath, JSON.stringify(existing, null, 2));
  await fs.rename(tmpPath, filePath);
}
```

## 6. 开发与运行

```bash
# 安装依赖
pnpm --filter dashboard install

# 开发模式（热重载）
pnpm --filter dashboard run dev
# → http://localhost:4321

# Dashboard 读取的数据路径
# workspace-data/output/latest/ (只读)
# workspace-data/user-data/ (读写)
# 可通过环境变量覆盖:
#   TALENT_WORKSPACE_DIR=/path/to/workspace-data
#   TALENT_OUTPUT_DIR=/path/to/workspace-data/output
#   TALENT_USER_DATA_DIR=/path/to/workspace-data/user-data
```

## 7. 辩证备注

### 不需要实时数据

Dashboard 不需要 WebSocket 或 Server-Sent Events。数据由后台 pipeline 定期更新，Dashboard 每次页面加载时读取最新文件即可。如果招聘人员需要"刷新数据"，刷新浏览器就够了。

### 可视化的优先级

在项目早期，Dashboard 的优先级低于数据采集和评估。一个可用的 `shortlist.json` + `shortlist.csv` 比一个精美的 Dashboard 更有价值。建议先确保 pipeline 产出正确数据，Dashboard 作为第二阶段需求实现。

### 未来可扩展方向

如果需要多人协作标注：

- 将 `annotations.json` 替换为以用户为维度的 `user-data/annotations/{annotator}.json`
- 但当前阶段不需要

如果需要与 CRM 对接：

- 在 `api/` 下新增 export endpoint，输出 CRM 兼容格式
- 或直接由外部脚本读取 `shortlist.csv`
