# DESIGN-v2-06: OpenClaw 集成

> 系列文档索引：[01-overview](DESIGN-v2-01-overview.md) · [02-architecture](DESIGN-v2-02-architecture.md) · [03-data-sources](DESIGN-v2-03-data-sources.md) · [04-identity](DESIGN-v2-04-identity.md) · [05-evaluation](DESIGN-v2-05-evaluation.md) · [06-openclaw](DESIGN-v2-06-openclaw.md) · [07-data-model](DESIGN-v2-07-data-model.md) · [08-dashboard](DESIGN-v2-08-dashboard.md) · [09-testing](DESIGN-v2-09-testing.md)

## 1. 集成原则

项目不直接调用任何 LLM API。所有需要 AI 能力的地方，统一通过 `openclaw agent` CLI 调用。

好处：

- 模型路由、配额、重试由 OpenClaw Gateway 统一管理
- 项目代码不持有 API key，安全性更好
- 可以通过 OpenClaw 配置切换后端模型（Claude、GPT、本地模型等），项目代码无需改动
- 天然集成 OpenClaw 的 memory、session、skills 生态

## 2. Agent 调用方式

### 2.1 基本调用模式

所有子项目通过 `@talent-scout/shared` 的 `openclaw.ts` 封装调用（见 [02-architecture §3](DESIGN-v2-02-architecture.md)），不直接调用 CLI。

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

### 3.3 SKILLS.md 更新

- **触发条件**：每次运行结束后
- **输入**：本次运行的统计数据 + 异常样本 + 与上次运行的对比
- **输出**：SKILLS.md 的更新建议（追加到文件末尾，人工确认后合入）
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

批量大小需要在 SKILLS.md 中根据实践调整。过大会导致 context window 不足，过小会浪费 API 调用次数。初始建议 batch_size = 10。

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

## 5. SKILLS.md 自我进化机制

### 5.1 核心理念

每个使用 AI 的模块都维护一个 SKILLS.md 文件，记录该模块在迭代过程中积累的经验。OpenClaw agent 在执行任务时会自动读取 SKILLS.md，从而"记住"之前的经验并应用到新一轮处理中。

这形成了一个自我进化闭环：

```
运行 → 产出结果 → 分析异常/误判 → 更新 SKILLS.md → 下次运行时 agent 更准
```

### 5.2 SKILLS.md 内容结构

每个模块的 SKILLS.md 应包含以下章节：

```markdown
# [模块名] SKILLS

## 已知规则

在此记录通过实践验证的规则和模式。
- Location "PRC" 应视为中国大陆
- Email @bytedance.com 用户均为中国开发者
- ...

## 边缘案例

在此记录仅靠规则难以处理的边缘案例和处理决策。
- 用户 xxx：location 为空但 bio 中提到 "based in Beijing" → 判为中国
- ...

## 参数校准历史

在此记录参数调整的记录和效果。
- 2025-06-01: identity confidence 阈值从 0.5 调整为 0.45，recall 提升 5%
- ...

## 待改进方向

在此记录已知的不足和未来改进方向。
- 简繁体检测对混用场景不准确
- ...
```

### 5.3 更新流程

1. 每次运行结束后，`ai-evaluator` 的 review 步骤将本次运行的结果与上次对比
2. 识别新增的误判案例、效果异常等
3. 组织成 prompt 发给 OpenClaw agent，请求生成 SKILLS.md 更新建议
4. 更新建议追加到 SKILLS.md 的对应章节
5. **守卫机制**：SKILLS.md 的更新建议默认不自动生效，而是写入 `SKILLS-pending.md`，由人工 review 后合入

自动更新存在写入错误经验的风险（如果某次运行的数据本身有偏差，AI 可能会总结出错误的规则）。pending 文件 + 人工确认是必要的安全网。随着信心提升，可以逐步放开为自动合入。

### 5.4 与 OpenClaw Memory 的关系

OpenClaw 自身也有 memory 系统（`openclaw memory`）。两者的定位不同：

- **SKILLS.md**：项目级知识，随项目代码提交到 git，所有运行环境共享，可人工审阅
- **OpenClaw Memory**：agent 级知识，存在 OpenClaw 本地状态中，主要用于 session 间的上下文延续

建议 SKILLS.md 作为权威知识源，OpenClaw Memory 作为 agent 运行时的辅助记忆。两者不冲突。

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
