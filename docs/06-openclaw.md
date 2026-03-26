# 06: OpenClaw 集成

> 系列文档索引：[01-overview](01-overview.md) · [02-architecture](02-architecture.md) · [03-data-sources](03-data-sources.md) · [04-identity](04-identity.md) · [05-evaluation](05-evaluation.md) · [06-openclaw](06-openclaw.md) · [07-data-model](07-data-model.md) · [08-dashboard](08-dashboard.md) · [09-testing](09-testing.md) · [10-distribution](10-distribution.md)

## 1. 集成原则

项目不直接调用任何 LLM API。所有需要 AI 能力的地方，统一通过 `openclaw agent` CLI 调用。

好处：

- 模型路由、配额、重试由 OpenClaw Gateway 统一管理
- 项目代码不持有 API key，安全性更好
- 可以通过 OpenClaw 配置切换后端模型（Claude、GPT、本地模型等），项目代码无需改动
- 天然集成 OpenClaw 的 memory、session、skills 生态

当项目作为 skill 发布到 ClawHub 时，skill bundle 自身也必须遵守 Agent Skills 规范：根目录包含 `SKILL.md`，可选 `scripts/`、`references/`、`assets/`，并通过这些薄封装去调用 `@talent-scout/*` 的能力，而不是在 skill 内重写主逻辑。详见 [10-distribution](10-distribution.md)。

## 2. Agent 调用方式

### 2.0 `@talent-scout/skills` 作为统一技能入口

项目对 ClawHub / OpenClaw 暴露的 skill 不再按子包拆分，而是统一由 `@talent-scout/skills` 提供一个总控入口。这个包负责：

- 提供可发布的 `SKILL.md` 与 references / scripts
- 把采集、处理、评估、查询、运维命令整理为可被模型调度的统一命令面
- 提供启动 / 暂停 / 同步 OpenClaw cron 的能力
- 在 IM channel / TUI 中提供文字化查询，而不是浏览器 UI

其他包继续专注于业务逻辑与可复用查询接口，不直接对外承担 skill 发布职责。

### 2.1 基本调用模式

所有子项目通过 `@talent-scout/shared` 的 `openclaw.ts` 封装调用（见 [02-architecture §3](02-architecture.md)），不直接调用 CLI。

```typescript
import { callAgent } from '@talent-scout/shared';

// agentKey 对应 talents.yaml 中的 openclaw.agents.{key}
const result = await callAgent('identity', {
  task: 'identity_inference',
  candidate: { username: 'user1', profile, signals },
});
```

封装层自动从 `talents.yaml` 读取 agent name、workspace、timeout 等配置，确保所有子项目使用统一的配置源。

### 2.2 配置示例

```yaml
# talents.yaml - openclaw 相关配置
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
  batch_size: 10   # 批量调用每批数量
```

## 3. AI 调用场景

项目中只有三个场景需要 AI：

### 3.1 身份推断（灰区样本）

- **触发条件**：规则层判定 `0.3 < china_confidence < 0.7`
- **输入**：候选人 profile + 已收集的 identity signals
- **输出**：`{ is_chinese: boolean, confidence: number, evidence: string, city?: string }`
- **Agent**：`talent-identity`
- **预计调用量**：候选池的 20-30%（约 100-150 人）

### 3.2 候选人深度评估

- **触发条件**：通过身份识别且 `china_confidence ≥ 0.5`
- **输入**：候选人 profile + repos + activity + signals
- **输出**：`{ skill_score: number, ai_depth: { score, tier, evidence }, summary: string }`
- **Agent**：`talent-evaluator`
- **预计调用量**：top 200 候选人

### 3.3 运行时 skill patch 生成

- **触发条件**：每次运行结束后
- **输入**：本次运行的统计数据 + 异常样本 + 与上次运行的对比
- **输出**：兼容 patch 的建议，写入工作区而不是直接改写包内文件
- **Agent**：对应模块的 agent
- **预计调用量**：每次运行 1 次

### 批量调用优化

对身份推断和深度评估，单次 agent 调用可以批量处理多个候选人：

```json
{
  "task": "batch_identity_inference",
  "candidates": [
    { "username": "user1", "profile": { ... }, "signals": [ ... ] },
    { "username": "user2", "profile": { ... }, "signals": [ ... ] }
  ],
  "batch_size": 10
}
```

批量大小需要根据运行效果持续校准。过大会导致 context window 不足，过小会浪费 API 调用次数。初始建议 batch_size = 10。

## 4. Cron 调度

通过 `openclaw cron` 实现定期自动执行，无需额外 crontab 或 CI/CD。

### 4.1 配置化的调度计划

所有 cron 任务的参数都定义在 `talents.yaml` 中，**不在代码中硬编码**：

```yaml
# talents.yaml - cron 配置
openclaw:
  cron:
    - name: talent-collect
      schedule: "0 1 * * *"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/data-collector run collect --incremental"
      description: "每日数据采集"

    - name: talent-process
      schedule: "0 3 * * *"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/data-processor run process"
      description: "每日数据处理"

    - name: talent-evaluate
      schedule: "0 5 * * 1"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/ai-evaluator run evaluate"
      description: "每周 AI 评估"

    - name: talent-seeds
      schedule: "0 0 1 * *"
      command: "cd {{project_dir}} && pnpm --filter @talent-scout/data-collector run collect --source rankings"
      description: "每月排行榜种子更新"
```

`{{project_dir}}` 在同步时替换为实际项目路径。

### 4.2 Cron 同步逻辑（去重）

**关键设计**：不能重复添加 cron 任务。多次执行同步脚本时，应根据 `name` 检查现有任务，变更则更新、新增则添加、多余则删除。

```typescript
// packages/shared/src/openclaw.ts
async function syncCronJobs(config: CronConfig[]) {
  // 1. 获取当前已注册的 cron 任务
  const { stdout } = await execa('openclaw', ['cron', 'list', '--json']);
  const existing = JSON.parse(stdout) as CronJob[];
  const existingByName = new Map(existing.map(j => [j.name, j]));

  for (const job of config) {
    const current = existingByName.get(job.name);
    const command = job.command.replace('{{project_dir}}', process.cwd());

    if (!current) {
      // 新增
      await execa('openclaw', ['cron', 'add',
        '--name', job.name,
        '--schedule', job.schedule,
        '--command', command,
      ]);
    } else if (current.schedule !== job.schedule || current.command !== command) {
      // 更新（先删后加，或用 update 命令）
      await execa('openclaw', ['cron', 'remove', '--name', job.name]);
      await execa('openclaw', ['cron', 'add',
        '--name', job.name,
        '--schedule', job.schedule,
        '--command', command,
      ]);
    }
    existingByName.delete(job.name);
  }

  // 清理配置中已移除但 openclaw 中仍存在的任务（只清理 talent-* 前缀）
  for (const [name] of existingByName) {
    if (name.startsWith('talent-')) {
      await execa('openclaw', ['cron', 'remove', '--name', name]);
    }
  }
}
```

调用方式：

```bash
# 将 talents.yaml 中的 cron 配置同步到 openclaw
pnpm --filter @talent-scout/shared run cron:sync
```

### 4.3 运维

```bash
# 查看所有调度任务
openclaw cron list

# 查看执行历史
openclaw cron runs --name talent-collect

# 手动触发一次（调试用）
openclaw cron run --name talent-collect

# 暂停某个任务
openclaw cron disable --name talent-evaluate
```

## 5. Skill Patch 自我进化机制

注意：这里讨论的是“运行时技能增强”，不是直接修改包源码。`SKILL.md` 是 `@talent-scout/skills` 的发布入口；各包内部可以维护只读的内置 skill 基线，但运行时新增经验必须进入工作区 patch，而不是改写 npm 包内容。

### 5.1 核心理念

每个使用 AI 的模块都可以提供只读的内置 skill 基线，记录该模块在发布版本时已经验证过的经验。OpenClaw agent 在运行时除了读取这些内置技能外，还会读取工作区中的兼容 patch，从而把后续获得的经验叠加到当前版本上。

这形成了一个自我进化闭环：

```text
运行 → 产出结果 → 分析异常/误判 → 生成 skill patch → 下次运行时 overlay 生效
```

### 5.2 Patch 存储位置与格式

所有运行时 patch 都写入工作区数据目录，例如：

```text
workspace-data/
└── skill-patches/
  ├── talent-skills/
  │   ├── 2026-03-26T120000Z-identity-threshold.md
  │   └── 2026-03-28T090000Z-query-alias.md
  └── manifests/
    └── applied.json
```

单个 patch 建议使用 Markdown + YAML frontmatter，至少包含：

```yaml
id: identity-threshold-2026-03-26
target: ai-evaluator
applies_to: ">=0.2.0 <0.3.0"
kind: calibration
priority: 10
```

正文用于补充规则、示例、参数调整或查询别名。

### 5.3 边界与兼容性

patch 机制必须受到明确边界约束：

- 不修改任何 npm 包源码、`package.json`、测试或构建产物
- 不写回包内 `SKILL.md` / 内置 skills 文件
- 只允许增强指令、补充示例、调整阈值建议、增加查询别名和解释模板
- 通过 `applies_to` 的 semver 范围保证向后兼容
- 当内置 skill 升级导致 patch 不兼容时，系统应跳过该 patch 并记录告警，而不是强行应用

### 5.4 更新流程

1. 每次运行结束后，review 步骤分析新增误判和新模式
2. 生成 patch 建议，而不是直接修改源码
3. 将 patch 写入 `workspace-data/skill-patches/`
4. `@talent-scout/skills` 在下一次启动时加载内置 skill 基线和所有兼容 patch
5. 若 patch 效果稳定，可以在后续正式版本中人工吸收为内置技能

### 5.5 与 OpenClaw Memory 的关系

OpenClaw 自身也有 memory 系统（`openclaw memory`）。两者的定位不同：

- **内置 skills**：项目级知识，随 npm 包与 skill 版本发布，所有运行环境共享，只能通过正常版本升级改变
- **workspace skill patches**：用户工作区级知识，存在 `workspace-data/skill-patches/` 中，可随运行逐步积累
- **OpenClaw Memory**：agent 级知识，存在 OpenClaw 本地状态中，主要用于 session 间的上下文延续

建议“内置 skills + workspace patch”作为权威知识源，OpenClaw Memory 作为 agent 运行时的辅助记忆。两者不冲突。

## 6. 辩证备注

### 为什么不直接调用 LLM API

直接调用 Claude API 或 OpenAI API 看似更简单，但会引入以下问题：

- 需要在项目中管理 API key（安全风险）
- 需要自己实现 retry、rate limit、model fallback
- 无法利用 OpenClaw 的 session、memory、agent 隔离能力
- 换模型时需要改代码

OpenClaw 作为中间层虽然多了一跳，但把复杂性内聚到了 Gateway 中，项目代码保持干净。

### `openclaw agent` 调用延迟

每次 `openclaw agent` 调用需要经过 CLI → Gateway → LLM → Gateway → CLI 的链路，单次延迟约 5-30 秒。对于需要批量评估 200+ 候选人的场景，串行调用会很慢。

缓解策略：

- 批量 prompt（每次评估 10 个候选人）
- 只对 top 候选人做 AI 评估，其余用规则打分（约减少 60% 调用量）
- 规则层尽量做多的工作，把 AI 调用留给真正需要语义理解的决策

### 对 `openclaw cron` 的依赖

使用 `openclaw cron` 意味着需要 OpenClaw Gateway 保持运行。如果 Gateway 宕机，定时任务不会执行。

兜底方案：项目的 `pnpm run pipeline` 命令可以完全脱离 OpenClaw cron 手动运行。cron 只是自动化的便利层，不是核心依赖。
