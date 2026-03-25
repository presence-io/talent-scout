# DESIGN-v2-03: 数据来源与采集策略

> 系列文档索引：[01-overview](DESIGN-v2-01-overview.md) · [02-architecture](DESIGN-v2-02-architecture.md) · [03-data-sources](DESIGN-v2-03-data-sources.md) · [04-identity](DESIGN-v2-04-identity.md) · [05-evaluation](DESIGN-v2-05-evaluation.md) · [06-openclaw](DESIGN-v2-06-openclaw.md) · [07-data-model](DESIGN-v2-07-data-model.md) · [08-dashboard](DESIGN-v2-08-dashboard.md) · [09-testing](DESIGN-v2-09-testing.md)

## 1. 总体策略

v1 只有一条路径——从 GitHub 搜索 API 出发按 AI 信号抓人。v2 改为**多源种子 + 逐层扩展**：

```
Layer 1: 种子池（Seed Pool）
  ├── 公开排行榜 / 名录
  ├── GitHub AI 信号搜索（沿用 v1 核心）
  └── 中文 AI 社区 repo 互动者

Layer 2: 图扩展（Graph Expansion）
  └── 已确认中国开发者的 follower / following 中筛选

Layer 3: 持续补充（Ongoing Feed）
  └── OpenClaw cron 定期增量采集 + 新源接入
```

## 2. Layer 1 种子源详情

### 2.1 公开排行榜与名录

| 数据源 | URL | 获取方式 | 频率 | 价值 |
|--------|-----|---------|------|------|
| China Open Source Ranking | `china-ranking.aolifu.org` | Playwright 抓取 | 每月 | 中国开发者种子，含 GitHub username |
| GitHubRank (中国) | `githubrank.com` | HTTP 抓取 | 每月 | 按 followers/stars 排名的中国开发者 |
| 中国独立开发者列表 | `github.com/1c7/chinese-independent-developer` | GitHub API 读取 README parse | 每月 | 已确认的中国独立开发者 |
| OpenDigger / OpenRank | `open-digger.cn` / X-Lab 数据集 | 公开 JSON/CSV 下载 | 每季度 | 高影响力开发者指标 |

排行榜数据采集之后存储到 `seeds/` 目录，作为长期积累的种子库。每次采集时与已有数据 merge，不覆盖。

**实现要点**：

- china-ranking 和 githubrank 是网页，可能有反爬措施，使用 Playwright headless 浏览器抓取
- 1c7/chinese-independent-developer 是 GitHub README，用 GitHub API 获取 raw content 后正则解析提取 GitHub 链接
- 首次运行时手动触发全量抓取，后续由 cron 增量更新

### 2.2 GitHub AI 信号搜索

沿用 v1 的信号搜索思路，但做以下重要调整：

#### 工具平权原则

v1 过度倾向于 Claude Code 生态的信号，这对使用 Copilot、Cursor、Windsurf、Cline 等其他 AI Coding 工具的开发者不公平。v2 应对所有主流 AI Coding 工具进行平等覆盖：

| 信号 | 工具 | 搜索方式 | 权重 | 标签 |
|------|------|---------|------|------|
| `CLAUDE.md` 文件 | Claude Code | code search | 2.0 | `ai-config:claude` |
| `Co-Authored-By: Claude` | Claude Code | commit search | 2.0 | `ai-coauthor:claude` |
| `.cursorrules` 文件 | Cursor | code search | 2.0 | `ai-config:cursor` |
| `.clinerules` 文件 | Cline | code search | 2.0 | `ai-config:cline` |
| `AGENTS.md` 文件 | GitHub Copilot | code search | 2.0 | `ai-config:copilot` |
| `.github/copilot-instructions.md` | GitHub Copilot | code search | 2.0 | `ai-config:copilot` |
| `.windsurfrules` 文件 | Windsurf | code search | 2.0 | `ai-config:windsurf` |
| `Co-Authored-By: GitHub Copilot` | GitHub Copilot | commit search | 2.0 | `ai-coauthor:copilot` |
| `topic:claude-code` repo | Claude Code | repo search | 2.0 | `ai-topic:claude` |
| `topic:mcp-server` repo | MCP 生态 | repo search | 2.0 | `ai-topic:mcp` |
| `topic:mcp` repo | MCP 生态 | repo search | 1.0 | `ai-topic:mcp` |
| `topic:copilot-extension` repo | Copilot | repo search | 2.0 | `ai-topic:copilot` |
| `topic:cursor` repo | Cursor | repo search | 1.5 | `ai-topic:cursor` |

#### AI 信号的定位：标签而非排序依据

**关键设计决策**：AI 配置文件的存在只是“这个开发者主动配置了 AI Coding 工具”的信号，但它并不是“这个开发者是否使用 AI”的必要条件：

- 大量优秀开发者日常使用 AI Coding 工具，但从不在 repo 中放置配置文件
- 有一定历史的项目不会回过头来添加 AI 配置文件
- **有无 AI 配置文件与开发者质量无关**

因此，AI 信号在系统中的作用是：

1. **发现候选人**：作为种子源，帮助发现潜在的中国开发者
2. **打标签**：标记为「AI Coding 爱好者」，作为候选人的一个属性标签（未来可能有用）
3. **不作为强排序因子**：AI 信号的权重很低（2.0 而非 v1 的 5.0），不应显著影响最终排序

在评估阶段（见 [05-evaluation](DESIGN-v2-05-evaluation.md) §4），候选人的 AI 深度应更多基于其**实际产出和工程实践**，而非是否存在配置文件。

**信号级去重**（同 v1 问题修复）：

v1 的致命问题是同一用户的同类信号被重复计分。v2 要求在 merge 阶段按 `(username, signal_type, repo)` 三元组去重。同一用户在同一 repo 的同类信号只保留一条，取最高权重。

**commit 搜索窗口策略**（同 v1 问题修复）：

v1 按 90 天窗口切分搜索，导致跨窗口重复。v2 改为：

- 首次全量搜索：过去 12 个月
- 增量搜索：只搜自上次运行以来的新 commit（通过记录上次运行的时间戳实现）
- commit 按 `sha` 去重，彻底消除重复

### 2.3 中文 AI 社区 repo 互动者

| 社区 repo | 互动类型 | 权重 |
|-----------|---------|------|
| `yzfly/Awesome-MCP-ZH` | stargazers | 3.0 |
| `hesreallyhim/awesome-claude-code` | forks | 2.0 |
| `anthropics/claude-code` | stargazers | 1.5 |
| `cline/cline` | stargazers | 1.0 |
| `aider-ai/aider` | stargazers | 1.0 |

这些保持与 v1 一致。额外新增：

- 如果社区 repo 有 contributor 列表，contributor 的权重应高于 stargazer
- 对中文社区 repo（如 Awesome-MCP-ZH），互动者的中国开发者先验概率更高，在 identity 阶段给予适当加分

### 2.4 未来数据源扩展（当前暂不实现）

当前版本仅专注 GitHub 平台。架构上预留了扩展能力：在 `@talent-scout/data-collector` 中，每个数据源是一个独立的 source 文件（如 `github-signals.ts`、`rankings.ts`），通过统一接口输出标准化的候选人信号。未来新增数据源（Gitee、Hugging Face、npm 等）只需添加一个文件并在 `talents.yaml` 中注册。

## 3. Layer 2 图扩展

### 策略

以 Layer 1 中**已确认为中国开发者**（identity confidence ≥ 0.7）的人为起点：

1. 获取他们的 followers 列表（GitHub API: `GET /users/{username}/followers`）
2. 对每个 follower，执行粗筛：
   - 如果该 follower 已在候选池中，跳过
   - 如果该 follower 的 profile 有明确的中国信号（location/email/name），加入候选池
   - 如果信号不明确，暂存，等 identity 模块进一步判断
3. 重复扩展不超过 2 层（follower 的 follower），避免爆炸

### 预算控制

follower graph 扩展的 API 调用量很大。需要设置上限：

```yaml
# config.yaml
graph_expansion:
  enabled: true
  max_seed_users: 200       # 最多从 200 个种子出发
  max_followers_per_user: 100  # 每个种子最多取 100 个 follower
  max_depth: 1              # 只扩展 1 层（不做 follower 的 follower）
  min_seed_confidence: 0.7  # 种子的中国开发者 confidence 下限
```

这样最多产生 200 × 100 = 20,000 个候选人，约需 200 次 API 调用（每次返回 100 个 follower）。

## 4. API 预算与限流

### GitHub API 限制

- **Search API**：30 请求/分钟（authenticated）
- **Core API**：5000 请求/小时（authenticated）
- **GraphQL**：5000 点/小时

### 限流策略（在 `shared/github.ts` 统一实现）

v1 使用固定 sleep，v2 改为基于 response header 的自适应限流：

```typescript
// 伪代码
async function githubRequest(endpoint: string): Promise<Response> {
  const cached = await cache.get(endpoint);
  if (cached && !cached.expired) return cached.data;

  const response = await exec('gh', ['api', endpoint, ...]);

  // 读取 rate limit headers
  const remaining = response.headers['x-ratelimit-remaining'];
  const resetAt = response.headers['x-ratelimit-reset'];

  if (remaining < 10) {
    const waitMs = (resetAt - Date.now() / 1000) * 1000;
    await sleep(waitMs);
  }

  await cache.set(endpoint, response.data, { ttl: '24h' });
  return response.data;
}
```

关键点：

- **缓存优先**：相同请求在 TTL 内直接返回缓存，不消耗 API 额度
- **Header-based 限流**：根据 `x-ratelimit-remaining` 动态调整，而不是固定 sleep
- **指数退避**：遇到 4xx/5xx 错误时退避重试（最多 3 次），而不是 break
- **Checkpoint**：长时间采集任务支持断点续传，中间结果持续落盘

### 实际 API 预算估算

| 阶段 | 操作 | 预估调用量 |
|------|------|-----------|
| GitHub 信号搜索 | code/commit/topic/repo search | ~120 |
| 社区 repo stargazers/forks | paginated list | ~40 |
| 种子排行榜采集 | 网页请求（非 GitHub API） | 0 |
| Profile enrichment (500 人) | profile + repos × 2 | ~1000 |
| Follower graph (200 seeds) | followers list | ~200 |
| Activity enrichment (100 人) | events/commits | ~300 |
| **合计** | | **~1660** |

在 5000/hour 的限额内可以在 1 小时内完成。Search API 的 120 次调用需要至少 4 分钟（30/min 限制）。
