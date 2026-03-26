# 11: MetaBot & Claude Code 适配

> 系列文档索引：[01-overview](01-overview.md) · [02-architecture](02-architecture.md) · [03-data-sources](03-data-sources.md) · [04-identity](04-identity.md) · [05-evaluation](05-evaluation.md) · [06-openclaw](06-openclaw.md) · [07-data-model](07-data-model.md) · [08-dashboard](08-dashboard.md) · [09-testing](09-testing.md) · [10-distribution](10-distribution.md) · [11-metabot-claude-code](11-metabot-claude-code.md)

## 1. 目标

让 talent-scout 同时支持三种运行环境：

| 环境 | AI 引擎 | 调度方式 | 交互界面 |
|------|---------|---------|---------|
| **OpenClaw**（现有） | `openclaw agent` CLI | `openclaw cron` | ClawHub skill |
| **Claude Code** | Anthropic SDK / `claude` CLI | 手动 / cron | Claude Code skill（`.claude/`） |
| **MetaBot** | MetaBot agent bus（`mb task`） | `mb schedule` | 飞书/Telegram card |

核心原则：**业务逻辑不变**。只在 AI 调用层和调度层做适配，`data-collector`、`data-processor`、`dashboard` 完全不动。

---

## 2. 架构变更

### 2.1 AI Provider 抽象层

当前 `@talent-scout/shared/openclaw.ts` 硬编码调用 `openclaw` CLI。改为 Provider 接口：

```typescript
// shared/src/ai-provider.ts

export interface AIProvider {
  /** 调用 AI agent 完成任务（identity inference / deep evaluation） */
  callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult>;
  /** provider 名称，用于日志和 checkpoint 标记 */
  readonly name: string;
}
```

三个实现：

```
ai-provider.ts (interface)
├── providers/openclaw-provider.ts   ← 现有逻辑迁移，调用 openclaw CLI
├── providers/claude-provider.ts     ← 新增，调用 Anthropic SDK
└── providers/metabot-provider.ts    ← 新增，调用 mb task 委托给 AI bot
```

Provider 选择通过 `talents.yaml` 配置：

```yaml
ai:
  provider: claude          # openclaw | claude | metabot
  claude:
    model: claude-opus-4-6
    max_tokens: 4096
  metabot:
    bot_name: "Max's CC"    # MetaBot agent bus 中的 bot 名
    chat_id: ""             # 目标 chat
  openclaw:                 # 现有配置不变
    agents:
      identity: { name: talent-identity, ... }
      evaluator: { name: talent-evaluator, ... }
```

### 2.2 调度层抽象

当前 cron 管理硬编码 OpenClaw。改为 Scheduler 接口：

```typescript
// shared/src/scheduler.ts

export interface Scheduler {
  sync(jobs: CronJobConfig[]): Promise<void>;
  list(): Promise<ScheduledJob[]>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
}
```

三个实现：

| Scheduler | 实现 |
|-----------|------|
| `OpenClawScheduler` | 现有 `openclaw cron` 命令 |
| `MetaBotScheduler` | `mb schedule add/list/remove` |
| `SystemScheduler` | 系统 crontab（fallback，Claude Code 场景） |

### 2.3 通知层

当前通过 `openclaw message send` 发送通知。增加 MetaBot 通知：

```typescript
// shared/src/notifier.ts

export interface Notifier {
  send(message: string, options?: NotifyOptions): Promise<void>;
}

// MetaBot 实现：调用 mb task 发送飞书/Telegram card
// OpenClaw 实现：调用 openclaw message send
// Claude Code 实现：直接 console.log（本地运行不需要推送）
```

---

## 3. Claude Code 适配

### 3.1 新增 `.claude/` 目录

```
.claude/
├── settings.json          # Claude Code project settings
└── commands/
    ├── scout.md           # /scout — 运行完整 pipeline
    ├── scout-collect.md   # /scout-collect — 仅采集
    ├── scout-process.md   # /scout-process — 仅处理
    ├── scout-evaluate.md  # /scout-evaluate — 仅评估
    ├── scout-query.md     # /scout-query — 查询候选人
    └── scout-stats.md     # /scout-stats — 查看统计
```

### 3.2 Claude Code Skill 示例

```markdown
<!-- .claude/commands/scout.md -->
Run the talent-scout pipeline: collect → process → evaluate.

Steps:
1. Run `pnpm --filter @talent-scout/skills start pipeline`
2. Report the shortlist summary from `workspace-data/output/evaluated/latest/shortlist.json`
3. Highlight top 5 candidates with recommended_action = "reach_out"
```

### 3.3 Claude Provider 实现

```typescript
// shared/src/providers/claude-provider.ts

import Anthropic from '@anthropic-ai/sdk';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private client: Anthropic;

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic();  // 自动读 ANTHROPIC_API_KEY
  }

  async callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
    // 根据 agentKey 选择 system prompt（identity vs evaluator）
    const systemPrompt = AGENT_PROMPTS[agentKey];
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.max_tokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(request) }],
    });
    return JSON.parse(response.content[0].text) as AgentResult;
  }
}
```

Agent prompts 从现有 OpenClaw agent 配置中提取，存入 `shared/src/agent-prompts/`：
- `identity-prompt.ts` — 身份推断 system prompt
- `evaluator-prompt.ts` — 深度评估 system prompt

---

## 4. MetaBot 适配

### 4.1 MetaBot Provider

```typescript
// shared/src/providers/metabot-provider.ts

export class MetaBotProvider implements AIProvider {
  readonly name = 'metabot';

  async callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
    // 通过 mb task 委托给指定 bot
    const { stdout } = await execa('mb', [
      'task', this.config.bot_name, this.config.chat_id,
      `Run talent-scout ${agentKey} task: ${JSON.stringify(request)}`
    ]);
    return JSON.parse(stdout) as AgentResult;
  }
}
```

### 4.2 MetaBot Scheduler

```typescript
// shared/src/schedulers/metabot-scheduler.ts

export class MetaBotScheduler implements Scheduler {
  async sync(jobs: CronJobConfig[]): Promise<void> {
    for (const job of jobs) {
      await execa('mb', [
        'schedule', 'add',
        this.config.bot_name,
        this.config.chat_id,
        job.schedule,          // cron expression → seconds interval
        job.command
      ]);
    }
  }
}
```

### 4.3 MetaBot 通知（飞书/Telegram Card）

pipeline 完成后，自动发送结果 card：

```typescript
// skills/src/notify.ts

async function notifyPipelineComplete(stats: RunStats, shortlist: ShortlistEntry[]) {
  const top5 = shortlist.slice(0, 5);
  const card = formatCard({
    title: `🔍 Talent Scout: ${stats.identified_chinese} candidates evaluated`,
    fields: [
      { label: 'Total', value: stats.total_candidates },
      { label: 'Chinese', value: stats.identified_chinese },
      { label: 'Reach Out', value: stats.reach_out },
      { label: 'Monitor', value: stats.monitor },
    ],
    top5: top5.map(c => `${c.username} (${c.final_score.toFixed(1)})`),
  });

  await notifier.send(card);
}
```

---

## 5. 实施计划

### Phase 1: AI Provider 抽象（不改变外部行为）

| 任务 | 改动范围 | 测试 |
|------|---------|------|
| 定义 `AIProvider` 接口 | `shared/src/ai-provider.ts` | 接口 + mock 测试 |
| 迁移 `openclaw.ts` → `OpenClawProvider` | `shared/src/providers/` | 现有测试不变 |
| `ai-evaluator` 改用 `AIProvider` 接口 | `ai-evaluator/src/` | 现有测试通过 mock |
| `talents.yaml` 加 `ai.provider` 字段 | `shared/src/config.ts` | Zod schema 更新 |
| Provider factory：根据配置创建实例 | `shared/src/ai-provider.ts` | 工厂测试 |

### Phase 2: Claude Provider + Claude Code Skill

| 任务 | 改动范围 |
|------|---------|
| 实现 `ClaudeProvider` | `shared/src/providers/claude-provider.ts` |
| 提取 agent prompts | `shared/src/agent-prompts/` |
| 创建 `.claude/commands/` skill 文件 | `.claude/commands/*.md` |
| 更新 `AGENTS.md` 加入 Claude Code 使用说明 | `AGENTS.md` |

### Phase 3: MetaBot 适配

| 任务 | 改动范围 |
|------|---------|
| 实现 `MetaBotProvider` | `shared/src/providers/metabot-provider.ts` |
| 实现 `MetaBotScheduler` | `shared/src/schedulers/metabot-scheduler.ts` |
| 实现 MetaBot 通知（card 格式化） | `skills/src/notify.ts` |
| Scheduler 抽象 + OpenClaw/MetaBot/System 三实现 | `shared/src/scheduler.ts` |

### Phase 4: 端到端验证

| 任务 | 验证方式 |
|------|---------|
| OpenClaw 路径回归 | 现有 pipeline 不变 |
| Claude Code 路径 | `/scout` 命令 → pipeline → shortlist 输出 |
| MetaBot 路径 | `mb task` → pipeline → 飞书 card 通知 |

---

## 6. 不做的事

- **不改 data-collector / data-processor / dashboard**：这些包不依赖 AI provider，保持原样
- **不引入新的 ORM/数据库**：JSON 文件流水线不变
- **不改评分算法**：scoring.ts 纯规则，不依赖 AI
- **不移除 OpenClaw 支持**：三个 provider 并存，通过配置切换

---

## 7. 配置示例

### Claude Code 场景

```yaml
# talents.yaml
ai:
  provider: claude
  claude:
    model: claude-opus-4-6
    max_tokens: 4096
```

```bash
# 运行
cd talent-scout
claude   # 进入 Claude Code
> /scout  # 运行 pipeline
```

### MetaBot 场景

```yaml
# talents.yaml
ai:
  provider: metabot
  metabot:
    bot_name: "Talent Scout"
    chat_id: "oc_xxx"
    notify: true
```

```bash
# 调度
mb schedule add "Talent Scout" oc_xxx 86400 "cd /path/to/talent-scout && pnpm pipeline"
```

### OpenClaw 场景（不变）

```yaml
# talents.yaml
ai:
  provider: openclaw
  openclaw:
    agents:
      identity: { name: talent-identity, workspace: talent-scout, timeout: 120 }
      evaluator: { name: talent-evaluator, workspace: talent-scout, timeout: 180 }
```
