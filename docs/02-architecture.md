# DESIGN-v2-02: 技术架构

> 系列文档索引：[01-overview](DESIGN-v2-01-overview.md) · [02-architecture](DESIGN-v2-02-architecture.md) · [03-data-sources](DESIGN-v2-03-data-sources.md) · [04-identity](DESIGN-v2-04-identity.md) · [05-evaluation](DESIGN-v2-05-evaluation.md) · [06-openclaw](DESIGN-v2-06-openclaw.md) · [07-data-model](DESIGN-v2-07-data-model.md) · [08-dashboard](DESIGN-v2-08-dashboard.md) · [09-testing](DESIGN-v2-09-testing.md) · [10-distribution](10-distribution.md)

## 1. 技术栈决策

| 决策 | 选型 | 理由 |
|------|------|------|
| 运行时 | Node.js LTS (22.x) | 前后端统一、TypeScript 原生支持、async/await 天然适合 API 密集型任务 |
| 语言 | TypeScript 5.x (strict mode) | 类型安全对数据处理管道至关重要，接口定义即文档 |
| 包管理 | PNPM@10 | Workspace 原生支持、磁盘效率高、lockfile 确定性好 |
| Monorepo | pnpm workspace | 无需额外工具（turborepo 等），pnpm 内置 workspace 协议足够 |
| AI 调用 | OpenClaw CLI (`openclaw agent`) | 不直接依赖任何 LLM SDK，通过 CLI 解耦，由 OpenClaw 管理模型路由 |
| 定时调度 | OpenClaw Cron (`openclaw cron`) | 与 agent 系统统一，无需额外 cron 基础设施 |
| 前端框架 | Astro | 默认零 JS、按需 Islands 交互，适合数据展示型 Dashboard |
| UI 组件 | TailwindCSS + DaisyUI | 快速搭建、主题统一、无重量级依赖 |
| API 客户端 | `gh` CLI + `octokit`（按需） | `gh` 利用本地认证免管理 token；对 `gh` 不支持的场景用 `octokit` |
| CLI 调用 | `execa` | Node.js 最成熟的子进程调用库，类型安全、支持 pipe、自动 escape 参数 |
| 网页抓取 | Playwright（按需） | 抓取有反爬措施的排行榜页面（china-ranking 等）时使用 |
| 测试 | Vitest | 与 TypeScript 原生集成，速度快 |
| Lint / Format | ESLint (flat config) + Prettier | 标准工具链，通过 pnpm script 统一执行 |

### 关于 CLI 调用库的选择

项目需要频繁调用外部 CLI 工具（`gh`、`openclaw`、`playwright`），传入参数并解析返回结果。**不要自行用 `child_process` 封装**，直接使用 `execa`：

- 自动处理参数 escaping，避免注入风险
- 支持 TypeScript 类型推断、pipe 链式调用
- 内置 timeout、signal、buffer 管理
- 社区标准，维护活跃

```typescript
import { execa } from 'execa';

// 调用 gh CLI
const { stdout } = await execa('gh', ['api', '/user', '--jq', '.login']);

// 调用 openclaw agent
const { stdout: result } = await execa('openclaw', [
  'agent', '--message', JSON.stringify(request), '--json',
], { timeout: 120_000 });
```

### 包命名规范

所有 workspace 内的包统一使用 `@talent-scout/*` 命名空间：

| 包名 | 目录 |
|------|------|
| `@talent-scout/shared` | `packages/shared` |
| `@talent-scout/data-collector` | `packages/data-collector` |
| `@talent-scout/data-processor` | `packages/data-processor` |
| `@talent-scout/ai-evaluator` | `packages/ai-evaluator` |
| `@talent-scout/dashboard` | `packages/dashboard` |

模块间引用使用 workspace 协议：

```json
// packages/data-collector/package.json
{
  "dependencies": {
    "@talent-scout/shared": "workspace:*"
  }
}
```

### 发布形态分层

为了同时满足 npm 公开发布和 ClawHub/OpenClaw skill 分发，仓库中的产物分成两层：

1. `packages/*` 下的 `@talent-scout/*` 包：承载数据采集、处理、评估、Dashboard 与共享基础设施，是长期稳定维护的公开 npm package。
2. skill bundle：承载 Agent Skills 规范要求的 `SKILL.md`、少量 `scripts/` 包装脚本和引用文档，职责仅是调用 `@talent-scout/*` 已发布能力，不重复实现业务逻辑。

skill bundle 不是新的业务核心层，也不应该把评分、身份识别、采集逻辑复制进去。更多约束见 [10-distribution](10-distribution.md)。

## 2. 工程化先行原则

**在编写任何业务代码之前，必须先完成工程化基础设施搭建。** 这包括：

1. 初始化 monorepo 结构和所有子包
2. 配置 TypeScript strict mode、ESLint、Prettier
3. 配置 Vitest 测试框架，确保 `pnpm test` / `pnpm lint` / `pnpm format:check` 从 Day 1 可用
4. 编写 AGENTS.md，明确要求所有生成的代码必须通过 test + lint + format 检查才能被接受
5. 编写外部依赖检查脚本（见 §2.3）

这是渐进式质量保障的基础——后续每次迭代都在这个工程化骨架上增量添加业务代码。

### 2.1 代码质量工具链

#### Vitest 配置

在 root 级别配置共享 Vitest 设置，各子包继承：

```typescript
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
      exclude: [
        'packages/dashboard/src/pages/**',     // Astro 页面不计入覆盖率
        'packages/dashboard/src/components/**', // UI 组件不计入覆盖率
        '**/index.ts',                          // CLI 入口文件
        '**/__fixtures__/**',
      ],
    },
  },
});
```

#### ESLint (flat config)

```typescript
// eslint.config.js (root)
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  tseslint.configs.strictTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { ignores: ['**/dist/**', 'output/**', 'cache/**'] },
);
```

#### Prettier

```json
// .prettierrc
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

#### Root package.json 脚本

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint packages/",
    "lint:fix": "eslint packages/ --fix",
    "format:check": "prettier --check 'packages/**/*.{ts,tsx,json,md}'",
    "format": "prettier --write 'packages/**/*.{ts,tsx,json,md}'",
    "typecheck": "tsc --build",
    "check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test",
    "pipeline": "pnpm --filter @talent-scout/data-collector run collect && pnpm --filter @talent-scout/data-processor run process && pnpm --filter @talent-scout/ai-evaluator run evaluate",
    "preinstall": "node scripts/check-deps.js"
  }
}
```

**`pnpm check` 是质量门禁**：AGENTS.md 中应要求所有代码修改必须通过 `pnpm check`（typecheck + lint + format + test）才能被接受。

### 2.2 AGENTS.md 设计原则

AGENTS.md 应遵循**渐进披露原则**，尽量简短，将细节引用到对应的设计文档，Agent 必须将临时的工具脚本和文件信息写入 `.agent/` 目录，不得放到项目其他目录：

```markdown
# AI Talent Scout

## 质量要求

所有代码修改必须通过 `pnpm check`（typecheck + lint + format + test）才能被接受。
测试覆盖率不低于 90%。

## 项目结构

- 参见 DESIGN-v2-02-architecture.md §3

## 配置

- 统一配置文件：`$PWD/talents.yaml`
- 参见 DESIGN-v2-07-data-model.md §5

## 子项目快速参考

| 包 | 职责 | 详细设计 |
|---|------|----------|
| @talent-scout/shared | 类型、配置、API 封装 | 02-architecture §3 |
| @talent-scout/data-collector | 数据采集 | 03-data-sources |
| @talent-scout/data-processor | 去重、身份识别、评分 | 04-identity, 05-evaluation |
| @talent-scout/ai-evaluator | AI 评估 | 06-openclaw |
| @talent-scout/dashboard | 可视化展示 | 08-dashboard |
```

### 2.3 外部依赖检查脚本

项目依赖 `openclaw`、`gh` 等外部 CLI 工具。通过 `pnpm install` 的 `preinstall` hook 自动检查：

```javascript
// scripts/check-deps.js
const { execSync } = require('child_process');

const deps = [
  { cmd: 'gh', check: 'gh --version', install: 'brew install gh && gh auth login' },
  { cmd: 'openclaw', check: 'openclaw --version', install: '参见 https://openclaw.dev/install' },
];

for (const dep of deps) {
  try {
    execSync(dep.check, { stdio: 'ignore' });
  } catch {
    console.warn(`⚠️  未检测到 ${dep.cmd}。安装方式: ${dep.install}`);
  }
}
```

这个脚本只做 warn 提示，不阻断安装——因为 CI 环境或纯开发 Dashboard 时可能不需要所有工具。

## 3. Monorepo 目录结构

```text
talent-scout/
├── package.json              # root: workspaces, scripts, devDependencies
├── pnpm-workspace.yaml       # workspace 定义
├── tsconfig.base.json        # 共享 TypeScript 配置
├── vitest.config.ts          # 共享 Vitest 配置
├── eslint.config.js          # ESLint flat config
├── .prettierrc               # Prettier 配置
├── talents.yaml              # 统一运行配置（所有子项目读取）
├── AGENTS.md                 # AI coding 指令
├── scripts/
│   └── check-deps.js         # 外部依赖检查（preinstall hook）
│
├── packages/
│   ├── shared/               # @talent-scout/shared
│   │   ├── src/
│   │   │   ├── types.ts      # 全局类型定义（Candidate, Signal, Evaluation...）
│   │   │   ├── config.ts     # talents.yaml 加载与校验
│   │   │   ├── github.ts     # GitHub API 封装（gh CLI via execa）
│   │   │   ├── openclaw.ts   # OpenClaw CLI 封装（统一 agent name / workspace 等配置）
│   │   │   ├── cache.ts      # 通用缓存层（文件级，按 key 去重）
│   │   │   ├── logger.ts     # 统一日志
│   │   │   └── utils.ts      # 通用工具函数
│   │   ├── __tests__/        # 单元测试
│   │   └── package.json
│   │
│   ├── data-collector/       # @talent-scout/data-collector
│   │   ├── src/
│   │   │   ├── index.ts      # CLI 入口
│   │   │   ├── github-signals.ts    # GitHub 信号采集（code/commit/topic/star）
│   │   │   ├── rankings.ts          # 外部排行榜采集
│   │   │   ├── community.ts         # 中文社区 repo stargazers/forks
│   │   │   ├── follower-graph.ts    # 已知中国开发者的 follower 扩展
│   │   │   └── SKILLS.md            # 采集模块积累的经验
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── data-processor/       # @talent-scout/data-processor
│   │   ├── src/
│   │   │   ├── index.ts      # CLI 入口
│   │   │   ├── merge.ts      # 多源合并 + 信号级去重
│   │   │   ├── identity.ts   # 中国开发者身份推断（规则层）
│   │   │   ├── enrich.ts     # profile/repo/activity 特征补全
│   │   │   ├── scoring.ts    # 多轴评分计算
│   │   │   └── SKILLS.md     # 处理模块积累的经验
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── ai-evaluator/         # @talent-scout/ai-evaluator
│   │   ├── src/
│   │   │   ├── index.ts      # CLI 入口
│   │   │   ├── prompts.ts    # prompt 模板管理
│   │   │   ├── evaluate.ts   # 调用 openclaw agent 进行评估
│   │   │   ├── review.ts     # 评估结果审查与 patch 建议生成
│   │   │   └── skills.ts     # AI 评估内置 skill 基线管理
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── skills/               # @talent-scout/skills
│   │   ├── SKILL.md          # 可发布到 ClawHub 的统一 skill 入口
│   │   ├── references/       # skill 参考文档
│   │   ├── scripts/          # 极薄包装脚本
│   │   ├── src/
│   │   │   ├── index.ts      # skills CLI / 命令路由入口
│   │   │   ├── commands.ts   # 可被模型调度的命令集合
│   │   │   ├── cron.ts       # 启动/暂停/同步 OpenClaw cron
│   │   │   ├── query.ts      # 文本查询入口（IM/TUI）
│   │   │   ├── patches.ts    # skill patch 加载与兼容性判定
│   │   │   └── renderers.ts  # 面向文本通道的结果渲染
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   └── dashboard/            # @talent-scout/dashboard
│       ├── src/
│       │   ├── pages/        # Astro 页面（仅模板和布局）
│       │   ├── components/   # UI 组件
│       │   ├── api/          # API routes（读写 JSON 数据）
│       │   └── lib/          # 前端工具函数（可测试的纯逻辑）
│       ├── __tests__/        # lib/ 中的函数测试
│       ├── astro.config.mjs
│       └── package.json
│
├── workspace-data/           # 可写运行工作区（.gitignore）
│   ├── output/               # 运行产出
│   │   ├── raw/
│   │   ├── processed/
│   │   ├── evaluated/
│   │   └── latest -> ...
│   ├── user-data/            # 标注、备注、忽略名单等用户数据
│   ├── skill-patches/        # 运行时生成的 skill patch
│   └── cache/                # API 响应缓存
│       ├── github/
│       └── rankings/
│
├── legacy/                   # v1 Python 代码备份（.gitignore）
│
└── seeds/                    # 种子数据（提交到 git）
    ├── china-ranking.json    # china-ranking.aolifu.org 定期采集
    ├── githubrank.json       # githubrank.com 定期采集
    └── independent-dev.json  # 1c7/chinese-independent-developer 定期采集
```

### 关于 `shared` 包的说明

将 GitHub API 封装、类型定义、缓存层和 **OpenClaw CLI 封装**提取到 `@talent-scout/shared` 包。原因：

- GitHub API 调用逻辑（限流、重试、缓存）是跨模块共享的基础设施
- TypeScript 接口定义（Candidate、Signal、Evaluation 等）是全局契约，集中管理能防止漂移
- 缓存层需要统一策略，避免不同模块各自实现导致重复请求
- **OpenClaw CLI 调用需要统一管理**：agent name、workspace、timeout 等配置参数不应在每个子项目中各自维护

### 关于统一配置文件 `talents.yaml`

所有子项目的运行参数都从项目根目录的 `talents.yaml` 读取。`@talent-scout/shared` 的 `config.ts` 负责加载这个文件，默认路径为 `$PWD/talents.yaml`，可通过环境变量 `TALENT_CONFIG` 覆盖。

`talents.yaml` 包含所有子项目所需的配置（信号权重、API 预算、OpenClaw agent 配置、cron 参数等），详见 [07-data-model §5](DESIGN-v2-07-data-model.md)。

### 关于 OpenClaw CLI 封装 (`shared/openclaw.ts`)

所有子项目通过 `@talent-scout/shared` 提供的封装调用 `openclaw` CLI，封装会：

1. 从 `talents.yaml` 读取 agent 名称、workspace 路径、timeout 等配置
2. 统一 JSON 输入/输出的序列化和错误处理
3. 统一 cron 任务的注册与去重逻辑（见 [06-openclaw §4](DESIGN-v2-06-openclaw.md)）

```typescript
// packages/shared/src/openclaw.ts
import { execa } from 'execa';
import { loadConfig } from './config.js';

export async function callAgent(agentKey: string, message: unknown) {
  const config = await loadConfig();
  const agentConfig = config.openclaw.agents[agentKey];

  const { stdout } = await execa('openclaw', [
    'agent',
    '--agent', agentConfig.name,
    '--message', JSON.stringify(message),
    '--json',
    '--timeout', String(agentConfig.timeout ?? 120),
  ]);
  return JSON.parse(stdout);
}
```

### 关于共享查询层

`dashboard` 和 `@talent-scout/skills` 都需要读取同一批本地数据，但它们只是不同的展示与交互层，不应各自重新实现文件读取和聚合逻辑。

因此设计要求各业务包同时暴露“生产能力”和“查询能力”：

- `@talent-scout/data-collector` 暴露原始采集结果和种子状态的查询接口
- `@talent-scout/data-processor` 暴露 identity / scoring / candidate read model 查询接口
- `@talent-scout/ai-evaluator` 暴露 shortlist / evaluation / stats 查询接口

`dashboard` 和 `@talent-scout/skills` 只做编排、过滤和展示，不直接持有底层文件格式知识。

### 关于 `output/` vs `cache/` 的区分

- `workspace-data/output/` 是**运行产出**：每次运行都创建新的时间戳目录，保留历史记录，永远不覆盖
- `workspace-data/cache/` 是**请求缓存**：跨运行复用，按 key（API endpoint + params hash）去重，有 TTL 策略
- `workspace-data/output/latest` 是一个符号链接，始终指向最近一次运行的目录，方便 Dashboard 和 skills 查询入口直接读取

### 关于 `legacy/` 目录

v1 的 Python 代码（`scout.py`、`github_api.py` 等）在迁移完成前移入 `legacy/` 目录保留备份，该目录通过 `.gitignore` 排除。

## 4. 数据流

```text
                    ┌──────────────────────────────┐
                    │       data-collector          │
                    │                              │
  GitHub API ──────>│  github-signals              │
  Rankings ────────>│  rankings                    │──> workspace-data/output/raw/{timestamp}/
  Community repos ─>│  community                   │
  Follower graph ──>│  follower-graph              │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │       data-processor          │
                    │                              │
 workspace-data/output/raw/ ─────>│  merge → identity → enrich   │──> workspace-data/output/processed/{timestamp}/
 workspace-data/cache/ ──────────>│  → scoring                   │
  seeds/ ──────────>│                              │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │       ai-evaluator            │
                    │                              │
 workspace-data/output/processed/ >│  evaluate → review           │──> workspace-data/output/evaluated/{timestamp}/
 workspace-data/skill-patches/ ───>│  → patch suggestion         │
  openclaw agent ──>│                              │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │         skills                │
                    │                              │
 workspace-data/ ──>│  命令编排 + 文本查询 +       │──> IM / TUI / OpenClaw skill
 openclaw cron ───>│  cron 控制 + patch overlay   │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │       dashboard               │
                    │                              │
 workspace-data/ ──>│  展示 + 筛选 + 排序 + 标注   │──> 浏览器
 共享查询层 ───────>│  修改反馈写回 JSON            │
                    └──────────────────────────────┘
```

## 5. 模块间依赖关系

```text
shared ◄──── data-collector
  ▲              │
  │              ▼ (workspace-data/output/raw/)
  ├──── data-processor
  │              │
  │              ▼ (workspace-data/output/processed/)
  ├──── ai-evaluator
  │              │
  │              ▼ (workspace-data/output/evaluated/)
  ├──── skills
  └──── dashboard
```

- 模块间**不直接互相依赖**（不 import 对方的代码）
- 模块间的数据传递通过**文件系统**（output/ 目录下的 JSON 文件）
- 所有模块都依赖 `shared` 包获取类型定义、配置、API 封装

这种设计让每个模块可以独立运行、独立测试、独立迭代。OpenClaw cron 可以单独调度任意模块。

## 6. 运行方式

```bash
# 开发阶段：手动单步运行
pnpm --filter @talent-scout/data-collector run collect --source github-signals
pnpm --filter @talent-scout/data-collector run collect --source rankings
pnpm --filter @talent-scout/data-processor run process
pnpm --filter @talent-scout/ai-evaluator run evaluate
pnpm --filter @talent-scout/dashboard run dev

# 质量检查（所有代码提交前必须通过）
pnpm check    # typecheck + lint + format:check + test

# 生产阶段：OpenClaw cron 调度（通过 talents.yaml 配置，见 06-openclaw §4）
pnpm --filter @talent-scout/shared run cron:sync   # 将 talents.yaml 中的 cron 配置同步到 openclaw

# 全流程一键运行
pnpm run pipeline          # 依次执行 collect → process → evaluate
```

## 7. 辩证备注：为什么不继续用 Python

Python 版本仅有 2 个文件（scout.py + github_api.py），sunk cost 极低。切换到 Node.js 的收益：

- Dashboard（Astro）和业务逻辑使用同一语言，无需维护两套技术栈
- TypeScript strict mode 提供的类型安全，对于多阶段数据管道中的 schema 一致性有实质帮助
- pnpm workspace 提供的 monorepo 能力比 Python 的 monorepo 方案（poetry workspace 等）更成熟
- `openclaw agent` 和 `gh` 都是 CLI 工具，从 Node.js 调用 CLI 与从 Python 调用并无差异
- 项目本身不依赖 Python 生态特有的库（没有 pandas、scikit-learn 等）

唯一的潜在劣势是 Node.js 的 subprocess 调用不如 Python 直观（`child_process.execFile` vs `subprocess.run`）。可通过在 `shared` 包中提供统一的 `exec` 封装来消除。
