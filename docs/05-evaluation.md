# DESIGN-v2-05: 评估模型

> 系列文档索引：[01-overview](DESIGN-v2-01-overview.md) · [02-architecture](DESIGN-v2-02-architecture.md) · [03-data-sources](DESIGN-v2-03-data-sources.md) · [04-identity](DESIGN-v2-04-identity.md) · [05-evaluation](DESIGN-v2-05-evaluation.md) · [06-openclaw](DESIGN-v2-06-openclaw.md) · [07-data-model](DESIGN-v2-07-data-model.md) · [08-dashboard](DESIGN-v2-08-dashboard.md) · [09-testing](DESIGN-v2-09-testing.md)

## 1. 评估前提

只有通过身份识别（`china_confidence ≥ 0.5`）的候选人才进入评估流程。评估的目标是回答：

> 这个人在 AI Coding 时代是否足够优秀，是否值得招聘团队优先联系？

## 1.5 活跃度前置检查

在进入多轴评分之前，先检查候选人近 12 个月的活跃度。如果开发者已经不活跃，无论历史成就多高，对招聘的价值都大幅降低。

| 近 12 个月贡献数 | 处理 |
|----------------------|------|
| ≥ 50 | 正常评估，无调整 |
| 10 – 49 | 正常评估，无调整 |
| < 10 | **施加不活跃惩罚**：`activity_penalty = -3.0` |

贡献计数包括：public commit、PR、issue、review、discussion。数据通过 GitHub Events API 获取。

不活跃惩罚作为 `final_score` 的加法修正项，直接从最终分中扣除（见 §7.1）。

## 2. 多轴评估模型

拒绝用一个总分定义一切。设立 4 个独立轴，各自有明确的数据来源和评分逻辑：

```
┌──────────────────────────────────────────────────────┐
│                   候选人评估                          │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐ │
│  │ 技术实力  │  │ AI 深度  │  │ 可联系性  │  │ 匹配度│ │
│  │ skill    │  │ ai_depth │  │ reach    │  │ fit  │ │
│  │ 1-10     │  │ 1-10     │  │ 1-10     │  │ 1-10 │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────┘ │
│                                                       │
│  final_score = weighted combination (可配置权重)       │
│  recommended_action = reach_out | monitor | skip      │
└──────────────────────────────────────────────────────┘
```

## 3. 轴 1：技术实力 (skill_score: 1-10)

**核心理念**：无论什么时代，优秀开发者都是稀缺的。这是最重要的维度。

### 3.1 规则可计算的指标

每个候选人的技术实力通过以下**特征向量**量化，所有候选人都生成统一结构的 JSON 数据：

```typescript
/** 技术实力特征向量 */
interface SkillFeatures {
  /** 所有 repo 的 stars 总和，对数标准化 */
  total_stars_log: number;
  /** 所有 repo 的 forks 总和，对数标准化 */
  total_forks_log: number;
  /** 作为 owner 的非 fork repo 数 */
  owned_repo_count: number;
  /** 最高单 repo stars */
  max_repo_stars: number;
  /** 近 12 个月查过活跃的月份数 (0-12) */
  active_months: number;
  /** 近 12 个月总贡献数 */
  recent_contributions: number;
  /** 涉及的编程语言数 */
  language_count: number;
  /** followers 数，对数标准化 */
  followers_log: number;
  /** fork 比例（fork repo / 总 repo） */
  fork_ratio: number;
  /** 反指标惩罚分 */
  anti_pattern_penalty: number;
}
```

#### 计算公式

```typescript
function computeSkillScore(f: SkillFeatures): number {
  const raw =
    Math.min(f.total_stars_log / 4, 1.0) * 3.0 +         // stars 贡献最多 3 分
    Math.min(f.owned_repo_count / 20, 1.0) * 1.5 +       // 原创项目数
    Math.min(f.active_months / 12, 1.0) * 2.0 +           // 持续活跃度
    Math.min(f.language_count / 5, 1.0) * 0.5 +            // 技术广度
    Math.min(f.followers_log / 3, 1.0) * 1.5 +             // 社区认可
    (f.fork_ratio > 0.7 ? -1.5 : 0) +                     // fork 多于原创惩罚
    f.anti_pattern_penalty;                                 // 反指标惩罚
  return Math.max(1, Math.min(10, raw + 1.5));             // 映射到 1-10
}
```

说明：`total_stars_log = Math.log10(total_stars + 1)`，`followers_log = Math.log10(followers + 1)`。

### 3.2 AI 辅助判断的维度

对 top 候选人的代表性 repo 进行深入分析（通过 OpenClaw agent）：

- 代码结构与工程实践（CI/CD、测试覆盖、文档质量）
- 项目复杂度（是玩具项目还是真实系统）
- 长期维护能力（commit 历史跨度、issue 响应、版本发布节奏）

### 3.3 反指标（应降权的情况）

1. **大量实验性热门技术项目**：近一年内创建了 5+ 个不同热门技术栈的 demo 项目，每个都很浅，说明跟风而非深耕
2. **fork 多于原创**：大量 fork 但几乎没有自己的原创项目
3. **stars 高但 commit 少**：可能是一次性病毒传播的 Awesome 列表，而非持续工程产出

```typescript
// 反指标检测伪代码
function detectAntiPatterns(repos: Repo[]): AntiPattern[] {
  const patterns: AntiPattern[] = [];

  // 热门技术跟风检测
  const recentRepos = repos.filter(r => isRecentYear(r.created_at));
  const hotTopics = ['langchain', 'llamaindex', 'autogpt', 'rag', 'agent'];
  const hotCount = recentRepos.filter(r =>
    hotTopics.some(t => r.name.includes(t) || r.description?.includes(t))
  ).length;
  if (hotCount >= 5) {
    patterns.push({ type: 'hype-chaser', penalty: -2 });
  }

  return patterns;
}
```

> **辩证说明**：使用 AI 相关技术本身不是问题。构建了一个被广泛采用的 LangChain 扩展库是真正的贡献。但创建 5 个 "my-chatgpt-clone" 项目不是。区分标准是项目的**被采用程度**（stars/forks/dependents），而不是**是否使用了 AI 技术栈**。

## 4. 轴 2：AI 深度 (ai_depth_score: 1-10)

### 4.1 四个层次

| 层次 | 分数范围 | 定义 | 信号 |
|------|---------|------|------|
| **消费者** | 1-3 | 只是 star/fork 了 AI 工具 repo | stargazer 信号、fork 但无后续 commit |
| **使用者** | 4-6 | 在自己的项目中实际使用了 AI 工具 | `CLAUDE.md`、`.cursorrules`、`AGENTS.md`、`Co-Authored-By` commit 等 |
| **建设者** | 7-8 | 为 AI 生态构建了工具或扩展 | MCP server、Agent tool、AI 工作流开源、VS Code 扩展 |
| **放大者** | 9-10 | 在多个项目/团队/渠道传播 AI Native 工作方式 | 多 repo 复用 AI 配置、教程/文章、community 维护 |

> **重要说明**：有无 AI 配置文件只是层次判定的**一个参考信号**，不是充分条件。许多优秀开发者深度使用 AI Coding 工具但不在 repo 中放置配置文件。层次判定应更多关注**实际产出**（是否构建了 AI 生态工具）而非配置文件的存在。

### 4.2 特征向量与计算公式

```typescript
/** AI 深度特征向量 */
interface AIDepthFeatures {
  /** 拥有 AI 配置文件的 repo 数 */
  ai_config_repo_count: number;
  /** AI co-author commit 数 */
  ai_coauthor_commit_count: number;
  /** 是否维护 MCP server / agent tool / AI 扩展 */
  has_ai_builder_project: boolean;
  /** AI 相关 repo 的总 stars */
  ai_project_stars: number;
  /** 是否维护 AI 社区资源 */
  has_ai_community_maintenance: boolean;
  /** 标签：AI Coding 爱好者 */
  is_ai_coding_enthusiast: boolean;
}

function computeAIDepthScore(f: AIDepthFeatures): { score: number; tier: string } {
  if (f.has_ai_community_maintenance && f.ai_config_repo_count >= 3) {
    return { score: 9.5, tier: 'amplifier' };
  }
  if (f.has_ai_builder_project) {
    const bonus = Math.min(f.ai_project_stars / 500, 1.0) * 0.5;
    return { score: 7.5 + bonus, tier: 'builder' };
  }
  if (f.ai_config_repo_count > 0 || f.ai_coauthor_commit_count > 0) {
    const configBonus = Math.min(f.ai_config_repo_count / 3, 1.0) * 1.0;
    return { score: 4.5 + configBonus, tier: 'user' };
  }
  return { score: 2, tier: 'consumer' };
}
```

### 4.3 Coding 生产效率代理指标

直接测量"AI 提升了多少效率"是不可能的，但可以通过代理指标间接推断：

| 指标 | 衡量方式 | 说明 |
|------|---------|------|
| 高频高质产出 | 近 3 个月 commit 频率 + 项目质量 | AI 辅助的开发者产出节奏通常更快 |
| 代码审查效率 | PR review 响应时间 + 处理量 | AI 辅助的 reviewer 处理更快 |
| 项目启动速度 | 从 repo 创建到首个 release 的间隔 | AI 辅助的项目启动更快 |

**重要约束**：生产效率基准应按语言分开设置。Go 项目的 commit 密度和 Python 项目天然不同。在积累足够样本后，基准参数应自动回归更新；更新结果不直接改写包内实现，而是以兼容的 skill patch 形式写入工作区，由 `@talent-scout/skills` 在运行时叠加。

## 5. 轴 3：可联系性 (reachability_score: 1-10)

这个轴决定招聘团队能否实际触达候选人。

### 特征向量与计算公式

```typescript
/** 可联系性特征向量 */
interface ReachabilityFeatures {
  has_email: boolean;
  has_blog: boolean;
  has_twitter: boolean;
  has_hireable: boolean;
  /** bio 是否非空 */
  has_bio: boolean;
  /** 是否有中文技术社区 profile（掘金/知乎等） */
  has_chinese_community_profile: boolean;
}

function computeReachabilityScore(f: ReachabilityFeatures): number {
  let score = 1;
  if (f.has_email) score += 3;
  if (f.has_blog) score += 2;
  if (f.has_twitter) score += 1;
  if (f.has_hireable) score += 1;
  if (f.has_chinese_community_profile) score += 1.5;
  if (f.has_bio) score += 0.5;
  return Math.min(10, score);
}
```

## 6. 轴 4：岗位匹配度 (fit_score: 1-10)

可配置的匹配维度（在 `talents.yaml` 中定义目标岗位画像）：

```yaml
# talents.yaml
target_profile:
  preferred_cities:
    - { name: 'beijing', bonus: 3.0 }
    - { name: 'shanghai', bonus: 3.0 }
    - { name: 'hangzhou', bonus: 2.0 }
  preferred_languages: ['TypeScript', 'Go', 'Rust', 'Python']
  preferred_domains: ['infra', 'backend', 'devtools']
  avoid_seniority: 'too_senior'  # 超头部人物几乎无法触达
```

### 特征向量与计算公式

```typescript
/** 岗位匹配特征向量 */
interface FitFeatures {
  /** 城市匹配 bonus（0 表示未知或不匹配） */
  city_bonus: number;
  /** 主语言是否匹配 preferred_languages */
  language_match: boolean;
  /** 是否超头部 (followers > 10K or stars > 50K) */
  is_too_senior: boolean;
}

function computeFitScore(f: FitFeatures): number {
  let score = 5; // 基础分
  score += f.city_bonus;                         // 城市 bonus
  if (f.language_match) score += 1.5;            // 语言匹配
  if (f.is_too_senior) score -= 3;               // 超头部降权
  return Math.max(1, Math.min(10, score));
}
```

匹配度不是"这个人有多好"，而是"这个人和当前招聘需求有多匹配"。同一个候选人在不同招聘目标下的 fit_score 可以不同。

## 7. 最终评分与排序

### 7.1 组合公式

```typescript
const WEIGHTS = {
  skill: 0.35,
  ai_depth: 0.30,
  reachability: 0.15,
  fit: 0.20,
};

function computeFinalScore(axes: Scores, activityPenalty: number): number {
  const weighted =
    axes.skill * WEIGHTS.skill +
    axes.ai_depth * WEIGHTS.ai_depth +
    axes.reachability * WEIGHTS.reachability +
    axes.fit * WEIGHTS.fit;
  return Math.max(0, weighted + activityPenalty);
}
```

其中 `activityPenalty` 来自 §1.5 的活跃度前置检查（近 12 月贡献 < 10 则为 -3.0，否则为 0）。

权重可在 `talents.yaml` 中配置，不同招聘场景可以调节侧重点。

### 7.2 统一特征向量输出 (CandidateFeatures)

所有候选人的特征向量都以统一的 JSON 结构存储，方便未来融入人工标注分数后，通过神经网络反向学习更合理的计算公式：

```typescript
/** 候选人全量特征，所有轴的特征向量合并 */
interface CandidateFeatures {
  skill: SkillFeatures;
  ai_depth: AIDepthFeatures;
  reachability: ReachabilityFeatures;
  fit: FitFeatures;
  /** 近 12 月贡献数（用于活跃度检查） */
  recent_contributions: number;
}
```

这个结构是整个评估系统的核心数据载体。每个候选人一张特征表，每个特征都是确定性的数值，当前的评分公式只是基于这些特征的一种“模型”。未来积累足够人工标注后，可以用监督学习的方式反向优化权重。

### 7.3 推荐动作

| 条件 | 动作 |
|------|------|
| `final_score ≥ 7.0` 且 `reachability ≥ 5` | `reach_out` |
| `final_score ≥ 5.0` 或 `reachability < 5` | `monitor` |
| `final_score < 5.0` | `skip` |
| `skill_score ≤ 3` 且 `ai_depth ≤ 3` | `skip`（即使总分不低） |

### 7.4 Evidence Chain

每个最终推荐都必须附带证据链：

```json
{
  "username": "zhangsan",
  "final_score": 8.2,
  "recommended_action": "reach_out",
  "evidence": {
    "skill": {
      "score": 9,
      "reasons": [
        "bytedance employee, maintains large-scale internal tool",
        "3 repos with 1000+ stars",
        "active contributor in 12 out of last 12 months"
      ]
    },
    "ai_depth": {
      "score": 8,
      "tier": "builder",
      "reasons": [
        "CLAUDE.md in 2 repos",
        "published MCP server with 200+ stars",
        "Co-Authored-By: Claude in 15 commits"
      ]
    },
    "reachability": {
      "score": 7,
      "reasons": ["email: zhangsan@gmail.com", "blog: zhangsan.dev"]
    },
    "fit": {
      "score": 8,
      "reasons": ["city: beijing (+3.0)", "primary language: TypeScript (match)"]
    }
  }
}
```

## 8. 规则层 vs AI 层的职责划分

| 维度 | 规则层（确定性计算） | AI 层（OpenClaw agent） |
|------|---------------------|----------------------|
| 技术实力 | stars/forks/commits 统计、角色判定 | 代码质量分析、项目复杂度判断 |
| AI 深度 | 文件检测、commit 分析、topic 匹配 | repo 内容语义理解、tier 边界判断 |
| 可联系性 | email/blog/social 有无检测 | — |
| 岗位匹配 | 城市/语言/领域 pattern 匹配 | — |
| 候选人摘要 | — | 生成人类可读的推荐理由 |

设计原则：**规则能做的绝不用 AI**。AI 只用于需要理解语义或做模糊判断的场景。这样既省预算，又保证可重复性。

## 9. 辩证备注

### 为什么 AI 技术栈不应加分

考虑两个候选人：

- A：后端工程师，5 年 Go 经验，在自己的基础设施项目中深度使用 Claude Code，commit 效率提升明显，维护的项目被多家公司采用
- B：前端开发者，近半年创建了 8 个 AI 项目（langchain-demo、rag-chatbot、agent-framework...），每个项目 < 50 stars，社区参与度低

A 是我们要找的人，但如果按"AI 技术栈"加分，B 的得分会更高。

正确的做法是：看**项目的被采用程度和持续维护状态**，而不是看技术栈标签。

### 为什么量化特征向量很重要

将所有评估输入统一为结构化的特征向量（`CandidateFeatures`）有两个关键好处：

1. **可解释性**：每个候选人的分数都可以追溯到具体的特征值，而不是一个黑盒数字
2. **可学习性**：当積累了足够的人工标注（通过 Dashboard 的 approved/rejected）后，可以将特征向量作为输入、标注结果作为目标，用简单的神经网络或回归模型反向学习更优的权重组合

这是当前“手写规则”与未来“数据驱动”之间的桥梁。

### 生产效率指标的局限性

从 GitHub 公开数据推断"AI 工具是否提升了生产效率"是有局限的：

- 很多优秀开发者的主要工作在私有 repo 中
- Commit 频率受团队流程、代码审查规范影响
- 不同类型项目的"正常"产出节奏差异极大

因此，生产效率相关的指标只能作为辅助参考，不能作为核心评分维度。它的主要作用是在样本足够后自动回归语言级基准，帮助发现异常高效的开发者。

### 超头部过滤

followers > 10K 或 stars 总和 > 50K 的开发者，虽然技术分很高，但通常不是招聘可触达的对象。建议在 fit_score 中降权，而不是直接排除——因为有些超头部开发者仍然对新机会开放。
