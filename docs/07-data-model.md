# 07: 数据模型与存储

> 系列文档索引：[01-overview](01-overview.md) · [02-architecture](02-architecture.md) · [03-data-sources](03-data-sources.md) · [04-identity](04-identity.md) · [05-evaluation](05-evaluation.md) · [06-openclaw](06-openclaw.md) · [07-data-model](07-data-model.md) · [08-dashboard](08-dashboard.md) · [09-testing](09-testing.md) · [10-distribution](10-distribution.md)

## 1. 存储策略

采用纯 JSON 文件存储，不引入数据库。理由：

- 人类可读，方便调试和人工检查
- 可以 git track 种子数据和 golden set
- 不增加运行依赖
- 当前规模（千级候选人）JSON 完全胜任

如果未来候选池超过 10,000 人且查询需求复杂化，可以考虑迁移到 SQLite（`better-sqlite3`）。但当前阶段，简单优先。

### 目录结构

```
workspace-data/
├── output/
│   ├── raw/
│   │   └── 2026-03-25_013000/
│   │       ├── github-signals.json
│   │       ├── rankings.json
│   │       ├── community.json
│   │       └── follower-graph.json
│   ├── processed/
│   │   └── 2026-03-25_030000/
│   │       ├── merged.json
│   │       ├── identity.json
│   │       ├── enriched.json
│   │       └── scored.json
│   ├── evaluated/
│   │   └── 2026-03-25_050000/
│   │       ├── evaluation.json
│   │       ├── shortlist.json
│   │       └── shortlist.csv
│   └── latest -> evaluated/2026-03-25_050000/
├── user-data/
│   ├── annotations.json
│   ├── notes.json
│   ├── score-overrides.json
│   └── ignore-list.json
├── skill-patches/
│   ├── talent-skills/
│   │   └── 2026-03-25T060000Z-query-alias.md
│   └── manifests/
│       └── applied.json
└── cache/
  ├── github/
  │   ├── users/
  │   ├── repos/
  │   ├── search/
  │   └── events/
  └── rankings/
    ├── china-ranking_2026-03.json
    └── githubrank_2026-03.json

seeds/
├── china-ranking.json              # 排行榜种子（git tracked）
├── githubrank.json                 # GitHubRank 种子
├── independent-dev.json            # 1c7 列表种子
├── identity-golden-set.json        # 身份识别验证集
└── README.md                       # 种子数据说明
```

### 符号链接 `workspace-data/output/latest`

每次运行成功后，更新 `workspace-data/output/latest` 指向最新评估结果目录。Dashboard、`@talent-scout/skills` 以及其他查询入口始终读取这个路径，不需要知道具体时间戳。

### `.gitignore` 配置

所有生成的文件和目录必须在 `.gitignore` 中排除：

```gitignore
# 运行工作区
workspace-data/

# v1 Python 代码备份
legacy/

# Node.js
node_modules/
dist/

# 环境配置
.env
.env.local

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
```

注意：`seeds/` 目录不应被忽略，它包含提交到 git 的种子数据和 golden set。`workspace-data/` 则是纯运行态目录，既服务 Dashboard，也服务 `@talent-scout/skills` 的查询和 patch 机制。

## 2. 核心 TypeScript 类型定义

> 以下类型定义在 `packages/shared/src/types.ts` 中维护，是所有模块的共享契约。

### 2.1 信号 (Signal)

```typescript
/** 一条从数据源捕获的原始信号 */
interface Signal {
  /** 信号来源类型 */
  type: SignalType;
  /** 可读描述 */
  detail: string;
  /** 信号权重 */
  weight: number;
  /** 来源标识 */
  source: string;
  /** 关联 repo（如有） */
  repo?: string;
  /** 信号对象唯一 ID（用于去重：sha/filename/stargazer_id 等） */
  object_id?: string;
  /** 信号发生时间 */
  occurred_at?: string;
}

type SignalType =
  | 'code:claude-md'
  | 'code:cursorrules'
  | 'code:clinerules'
  | 'code:agents-md'
  | 'commit:claude-coauthor'
  | 'topic:claude-code'
  | 'topic:mcp-server'
  | 'topic:mcp'
  | 'community:stargazer'
  | 'community:fork'
  | 'community:contributor'
  | 'star:repo'
  | 'seed:ranking'
  | 'seed:list'
  | 'graph:follower';
```

### 2.2 候选人 (Candidate)

```typescript
/** 候选人核心数据 */
interface Candidate {
  /** GitHub username (lowercase) */
  username: string;
  /** 所有信号（去重后） */
  signals: Signal[];
  /** 信号权重总分（仅作参考，不作为排序依据） */
  signal_score: number;
  /** 是否被标记为 AI Coding 爱好者 */
  is_ai_coding_enthusiast: boolean;
  /** GitHub profile */
  profile?: GitHubProfile;
  /** 身份识别结果 */
  identity?: IdentityResult;
  /** 量化特征向量（用于评分计算，见 05-evaluation） */
  features?: CandidateFeatures;
  /** 评估结果 */
  evaluation?: Evaluation;
}
```

### 2.3 GitHub Profile

```typescript
interface GitHubProfile {
  login: string;
  name: string | null;
  location: string | null;
  email: string | null;
  blog: string | null;
  twitter: string | null;
  bio: string | null;
  company: string | null;
  hireable: boolean | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  /** 最近活跃 repos */
  recent_repos: RepoSummary[];
}

interface RepoSummary {
  name: string;
  full_name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  is_fork: boolean;
  updated_at: string;
  /** 是否包含 AI 工具文件 */
  ai_files?: string[];
}
```

### 2.4 身份识别结果

```typescript
interface IdentityResult {
  /** 综合 confidence (0-1) */
  china_confidence: number;
  /** 推断的城市（如果可判断） */
  city: string | null;
  /** 所有检测到的身份信号 */
  signals: IdentitySignal[];
  /** 是否经过 AI 辅助判断 */
  ai_assisted: boolean;
  /** 判断时间 */
  inferred_at: string;
}

interface IdentitySignal {
  /** 信号层级 */
  tier: 1 | 2 | 3 | 4;
  /** 信号类型 */
  type: string;
  /** 此信号贡献的 confidence */
  confidence: number;
  /** 证据描述 */
  evidence: string;
}
```

### 2.5 评估结果

```typescript
interface Evaluation {
  /** 技术实力 (1-10) */
  skill_score: number;
  skill_evidence: string[];

  /** AI 深度 (1-10) */
  ai_depth_score: number;
  ai_depth_tier: 'consumer' | 'user' | 'builder' | 'amplifier';
  ai_depth_evidence: string[];

  /** 可联系性 (1-10) */
  reachability_score: number;
  reachability_evidence: string[];

  /** 岗位匹配度 (1-10) */
  fit_score: number;
  fit_evidence: string[];

  /** 最终综合分 */
  final_score: number;

  /** 推荐动作 */
  recommended_action: 'reach_out' | 'monitor' | 'skip';

  /** 人类可读摘要 */
  summary: string;

  /** 评估时间 */
  evaluated_at: string;
}
```

### 2.6 最终输出 (TalentEntry)

```typescript
/** 写入 shortlist.json / shortlist.csv / all_talent.json 的最终条目 */
interface TalentEntry {
  username: string;
  name: string | null;
  city: string | null;
  company: string | null;
  email: string | null;
  blog: string | null;
  twitter: string | null;
  profile_url: string;

  china_confidence: number;

  skill_score: number;
  ai_depth_score: number;
  ai_depth_tier: string;
  reachability_score: number;
  fit_score: number;
  final_score: number;

  recommended_action: string;
  summary: string;

  /** 信号类型列表（去重后） */
  signal_types: string[];
  /** 原始信号数量 */
  signal_count: number;
}
```

## 3. 去重策略

### 3.1 用户级去重

所有 username 统一转为 lowercase。同一 username 从不同 source 采集到的信号合并到同一个 Candidate 对象。

### 3.2 信号级去重

使用 `(username, signal_type, repo || '', object_id || '')` 四元组作为去重 key。

```typescript
function deduplicateSignals(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  return signals.filter(s => {
    const key = `${s.type}|${s.repo ?? ''}|${s.object_id ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

对 v1 commit 搜索的问题直接修复：同一作者在同一 repo 的同类 commit 只保留一条。

### 3.3 跨运行去重 (all_talent.json)

维护一个 `output/all_talent.json` 文件，累积所有历史运行的候选人。去重策略：

- 按 username 去重
- 保留最高 `final_score` 的版本
- 保留最近的 `evaluated_at` 时间

```typescript
function mergeAllTalent(existing: TalentEntry[], newEntries: TalentEntry[]): TalentEntry[] {
  const map = new Map<string, TalentEntry>();
  for (const entry of existing) map.set(entry.username, entry);
  for (const entry of newEntries) {
    const prev = map.get(entry.username);
    if (!prev || entry.final_score > prev.final_score) {
      map.set(entry.username, entry);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.final_score - a.final_score);
}
```

## 4. 缓存策略

### 4.1 缓存服务 (cache.ts)

```typescript
interface CacheOptions {
  /** TTL in seconds. Default: 24 hours */
  ttl?: number;
}

interface CacheEntry<T> {
  data: T;
  fetched_at: string;
  expires_at: string;
}

class FileCache {
  constructor(private baseDir: string) {}

  async get<T>(key: string): Promise<T | null> {
    // 读取 {baseDir}/{category}/{hash}.json
    // 检查 expires_at，过期则返回 null
  }

  async set<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
    // 写入 {baseDir}/{category}/{hash}.json
  }
}
```

### 4.2 TTL 策略

| 数据类型 | TTL | 理由 |
|---------|-----|------|
| User profile | 7 天 | Profile 变动不频繁 |
| User repos | 3 天 | Repo 更新较频繁 |
| Search results | 24 小时 | 搜索结果每天都会变 |
| Events/commits | 12 小时 | 实时性要求较高 |
| Rankings | 30 天 | 排行榜月更足够 |

### 4.3 缓存清理

```bash
# 清理过期缓存
pnpm --filter shared run cache:clean

# 清理全部缓存（强制重新采集）
pnpm --filter shared run cache:purge
```

## 5. 配置文件 (talents.yaml)

> 所有子项目的运行参数都从项目根目录的 `talents.yaml` 读取。默认路径为 `$PWD/talents.yaml`，可通过环境变量 `TALENT_CONFIG` 覆盖。

```yaml
# ── 信号搜索配置 ──
code_signals:
  - { filename: "CLAUDE.md", path: "/", weight: 2.0, label: "ai-config:claude" }
  - { filename: ".cursorrules", path: "/", weight: 2.0, label: "ai-config:cursor" }
  - { filename: ".clinerules", path: "/", weight: 2.0, label: "ai-config:cline" }
  - { filename: "AGENTS.md", path: "/", weight: 2.0, label: "ai-config:copilot" }
  - { filename: ".github/copilot-instructions.md", path: "/", weight: 2.0, label: "ai-config:copilot" }
  - { filename: ".windsurfrules", path: "/", weight: 2.0, label: "ai-config:windsurf" }

commit_queries:
  - { query: '"Co-Authored-By: Claude"', weight: 2.0, label: "ai-coauthor:claude" }
  - { query: '"Co-Authored-By: GitHub Copilot"', weight: 2.0, label: "ai-coauthor:copilot" }

topic_queries:
  - { topic: "claude-code", weight: 2.0 }
  - { topic: "mcp-server", weight: 2.0 }
  - { topic: "mcp", weight: 1.0, max_pages: 3 }
  - { topic: "copilot-extension", weight: 2.0 }
  - { topic: "cursor", weight: 1.5, max_pages: 3 }

# ── 社区 repo ──
chinese_community:
  - { owner: yzfly, repo: Awesome-MCP-ZH, type: stargazers, weight: 3.0, max_pages: 10 }
  - { owner: hesreallyhim, repo: awesome-claude-code, type: forks, weight: 2.0, max_pages: 5 }

stargazer_repos:
  - { owner: anthropics, repo: claude-code, weight: 1.5, max_pages: 10 }
  - { owner: cline, repo: cline, weight: 1.0, max_pages: 5 }

# ── 图扩展 ──
graph_expansion:
  enabled: true
  max_seed_users: 200
  max_followers_per_user: 100
  max_depth: 1
  min_seed_confidence: 0.7

# ── API 预算 ──
api_budget:
  max_total_calls: 2000
  search_pages_per_query: 10
  profile_batch_size: 500
  search_sleep_ms: 2500

# ── 身份识别 ──
identity:
  min_confidence: 0.5
  ai_assist_range: [0.3, 0.7]

# ── 评估配置 ──
evaluation:
  weights:
    skill: 0.35
    ai_depth: 0.30
    reachability: 0.15
    fit: 0.20
  activity_penalty: -3.0       # 近 12 月贡献 < 10 时的惩罚分
  activity_threshold: 10       # 活跃度阈值
  max_ai_evaluations: 200

# ── 岗位匹配 ──
target_profile:
  preferred_cities:
    - { name: "beijing", bonus: 3.0 }
    - { name: "shanghai", bonus: 3.0 }
    - { name: "hangzhou", bonus: 2.0 }
  preferred_languages: ["TypeScript", "Go", "Rust", "Python"]

# ── OpenClaw ──
openclaw:
  agents:
    identity:
      name: talent-identity
      workspace: ./packages/data-processor
      timeout: 120
    evaluator:
      name: talent-evaluator
      workspace: ./packages/ai-evaluator
      timeout: 180
  batch_size: 10
  cron:
    - name: talent-collect
      schedule: "0 1 * * *"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/data-collector run collect --incremental"
    - name: talent-process
      schedule: "0 3 * * *"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/data-processor run process"
    - name: talent-evaluate
      schedule: "0 5 * * 1"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/ai-evaluator run evaluate"
    - name: talent-seeds
      schedule: "0 0 1 * *"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/data-collector run collect --source rankings"

# ── 缓存 ──
cache:
  ttl:
    user_profile: 604800     # 7 days
    user_repos: 259200       # 3 days
    search_results: 86400    # 1 day
    events: 43200            # 12 hours
    rankings: 2592000        # 30 days
```

## 6. 辩证备注

### 为什么用 JSON 而不是 SQLite

SQLite 在关系查询、去重、增量更新方面有天然优势。但在当前阶段：

- 候选池规模 < 5000 人，JSON 文件读写的性能完全足够
- JSON 文件可以直接用任意文本编辑器查看和修改，调试效率高
- `output/` 中的 JSON 文件可以直接被 Dashboard 的 API route 读取，无需数据库驱动
- 不增加 `better-sqlite3` 等 native 依赖，部署 / CI 更简单

当候选池增长到 10,000+ 人，或者需要复杂的关联查询和事务时，再迁移到 SQLite。TypeScript 接口定义已经做好了 schema 约束，迁移时只需要改存储层实现，上层逻辑不变。

### 为什么保留历史输出而不是覆盖

每次运行创建独立的时间戳目录，原因：

- 可以对比不同运行的结果，观察系统效果的趋势变化
- 如果某次运行出了问题，不会污染之前的好数据
- SKILLS.md 的更新可以参考历史输出来验证改进效果
- 磁盘空间不是瓶颈（千级候选人的 JSON 文件通常 < 10MB）

`output/latest` 符号链接让"取最新数据"这个操作保持一致的路径。
