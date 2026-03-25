# DESIGN-v2-09: 测试与持续迭代

> 系列文档索引：[01-overview](DESIGN-v2-01-overview.md) · [02-architecture](DESIGN-v2-02-architecture.md) · [03-data-sources](DESIGN-v2-03-data-sources.md) · [04-identity](DESIGN-v2-04-identity.md) · [05-evaluation](DESIGN-v2-05-evaluation.md) · [06-openclaw](DESIGN-v2-06-openclaw.md) · [07-data-model](DESIGN-v2-07-data-model.md) · [08-dashboard](DESIGN-v2-08-dashboard.md) · [09-testing](DESIGN-v2-09-testing.md)

## 1. 测试策略总览

```
┌──────────────────────────────────────────────────────────┐
│                     测试金字塔                            │
│                                                           │
│                     ▲ E2E                                 │
│                    ╱ ╲  Pipeline 全流程验证                │
│                   ╱   ╲ (少量，手动触发)                   │
│                  ╱─────╲                                  │
│                 ╱ 集成   ╲                                │
│                ╱ API 调用 ╲                               │
│               ╱ 文件 I/O  ╲                               │
│              ╱─────────────╲                              │
│             ╱   单元测试     ╲                             │
│            ╱  规则、计算、转换  ╲                           │
│           ╱───────────────────╲                            │
│          ╱     类型检查          ╲                         │
│         ╱    TypeScript strict    ╲                       │
│        ╱───────────────────────────╲                      │
└──────────────────────────────────────────────────────────┘
```

## 2. 单元测试 (Vitest)

**要求：所有 public 类和方法的测试覆盖率 ≥ 90%**（statements / branches / functions / lines）。这是在 `vitest.config.ts` 中通过 `coverage.thresholds` 强制执行的（见 [02-architecture §2.1](DESIGN-v2-02-architecture.md)）。

每个模块的纯计算逻辑都应有单元测试，**不依赖外部 API 和文件系统**。

### 2.1 关键测试场景

#### shared 模块

| 测试对象 | 场景 |
|---------|------|
| `config.ts` | 解析合法 config.yaml / 缺少必需字段时报错 / 默认值回退 |
| `cache.ts` | cache hit / cache miss / TTL 过期 / 并发写入安全 |

#### dashboard 模块

| 测试对象 | 场景 |
|---------|------|
| `lib/candidates.ts` | 候选人列表排序、筛选、分页逻辑 |
| `lib/format.ts` | 分数格式化、日期格式化、城市名标准化 |
| `lib/merge.ts` | output 数据与 user-data 数据的合并逻辑 |
| `lib/ignore.ts` | 忽略名单读写、查询 |

> **Dashboard UI（Astro 页面、`<script>` 标签）不做单元测试**。但 `lib/` 中的所有纯函数必须测试。逻辑不应存在于 `<script>` 标签中（见 [08-dashboard](DESIGN-v2-08-dashboard.md)）。

#### data-processor 模块

| 测试对象 | 场景 |
|---------|------|
| `merge.ts` | 多源合并 / username 大小写统一 / 信号级去重 / weight 计算 |
| `identity.ts` | 每个 Tier 的信号检测 / noisy-or 合成 / 阈值过滤 / 港澳台排除 |
| `scoring.ts` | 各轴独立评分 / 组合公式 / 推荐动作判定 / 反指标检测 |

#### identity 检测的具体测试用例

```typescript
describe('identity signals', () => {
  test('Tier 1: location matches China city', () => {
    expect(matchExplicitLocation('Beijing, China')).toEqual({
      tier: 1, confidence: 0.95, evidence: 'location: Beijing, China'
    });
  });

  test('Tier 1: excludes Hong Kong', () => {
    expect(matchExplicitLocation('Hong Kong')).toBeNull();
  });

  test('Tier 1: email domain qq.com', () => {
    expect(matchEmailDomain('user@qq.com')).toEqual({
      tier: 1, confidence: 0.9, evidence: 'email domain: qq.com'
    });
  });

  test('Tier 2: bio contains simplified Chinese', () => {
    expect(matchBio('全栈工程师，目前在字节跳动工作')).toEqual({
      tier: 2, confidence: 0.8, evidence: 'bio contains simplified Chinese'
    });
  });

  test('Tier 2: bio with traditional Chinese → not mainland', () => {
    expect(matchBio('全端工程師，目前在台北工作')).toBeNull();
  });

  test('noisy-or combines weak signals correctly', () => {
    const signals = [
      { tier: 4, confidence: 0.2 }, // pinyin name
      { tier: 3, confidence: 0.4 }, // Chinese commit messages
      { tier: 3, confidence: 0.4 }, // Chinese README
    ];
    const combined = computeChinaConfidence(signals);
    // 1 - (0.8 × 0.6 × 0.6) = 0.712
    expect(combined).toBeCloseTo(0.712, 2);
  });
});
```

#### 信号去重测试

```typescript
describe('signal deduplication', () => {
  test('same user, same type, same repo → keep one', () => {
    const signals: Signal[] = [
      { type: 'commit:claude-coauthor', repo: 'user/proj', weight: 5, detail: 'commit 1', source: 'step1b' },
      { type: 'commit:claude-coauthor', repo: 'user/proj', weight: 5, detail: 'commit 2', source: 'step1b' },
    ];
    expect(deduplicateSignals(signals)).toHaveLength(1);
  });

  test('same user, same type, different repo → keep both', () => {
    const signals: Signal[] = [
      { type: 'code:claude-md', repo: 'user/proj-a', weight: 5, detail: 'CLAUDE.md in proj-a', source: 'step1a' },
      { type: 'code:claude-md', repo: 'user/proj-b', weight: 5, detail: 'CLAUDE.md in proj-b', source: 'step1a' },
    ];
    expect(deduplicateSignals(signals)).toHaveLength(2);
  });
});
```

### 2.2 测试运行

```bash
# 运行所有单元测试
pnpm test

# 运行单个模块的测试
pnpm --filter data-processor test

# watch 模式（开发时）
pnpm --filter data-processor test -- --watch

# 带覆盖率
pnpm test -- --coverage
```

## 3. 集成测试

测试模块与外部依赖（GitHub API、文件系统）的交互，使用 mock 或 fixture。

### 3.1 GitHub API Mock

```typescript
// __fixtures__/github-api.ts
import { vi } from 'vitest';

export function mockGitHubProfile(overrides: Partial<GitHubProfile> = {}): GitHubProfile {
  return {
    login: 'testuser',
    name: 'Test User',
    location: 'Beijing, China',
    email: 'test@example.com',
    // ...defaults
    ...overrides,
  };
}

// 在测试中
vi.mock('../../shared/src/github', () => ({
  getUser: vi.fn().mockResolvedValue(mockGitHubProfile()),
  getUserRepos: vi.fn().mockResolvedValue([mockRepo()]),
}));
```

### 3.2 文件系统测试

使用临时目录测试 JSON 读写和缓存逻辑：

```typescript
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

let testDir: string;
beforeEach(async () => { testDir = await mkdtemp(path.join(tmpdir(), 'talent-')); });
afterEach(async () => { await rm(testDir, { recursive: true }); });
```

## 4. Golden Set 验证

### 4.1 身份识别 Golden Set

手工策划一个包含已知答案的验证集：

```json
// seeds/identity-golden-set.json
{
  "verified_chinese": [
    { "username": "user1", "expected_city": "beijing", "source": "china-ranking" },
    { "username": "user2", "expected_city": "shanghai", "source": "manual" }
  ],
  "verified_not_chinese": [
    { "username": "user3", "location": "San Francisco", "source": "manual" },
    { "username": "user4", "location": "Tokyo", "source": "manual" }
  ]
}
```

### 4.2 验证流程

```bash
# 运行 golden set 验证
pnpm --filter data-processor run validate:identity
```

输出结果和指标：

```
Identity Validation Report
══════════════════════════
Golden set: 50 Chinese + 50 non-Chinese

Results:
  True Positive:  47/50  (correctly identified as Chinese)
  True Negative:  48/50  (correctly identified as not Chinese)
  False Positive:  2/50  (误判为中国人)
  False Negative:  3/50  (漏判的中国人)

Metrics:
  Precision: 0.959
  Recall:    0.940
  F1:        0.949

Target: precision ≥ 0.95, recall ≥ 0.80
Status: ✓ PASS
```

### 4.3 误判分析自动化

每次 golden set 验证后，自动将误判样本输出到 `output/validation/identity-errors.json`，格式：

```json
[
  {
    "username": "someuser",
    "expected": "chinese",
    "predicted": "not_chinese",
    "confidence": 0.35,
    "signals": [...],
    "analysis": "location 为空，bio 为英文，但 commit messages 有中文（未被检测到）"
  }
]
```

这些误判案例会在 SKILLS.md 更新流程中被 AI agent 分析，提出规则改进建议。

## 5. E2E Pipeline 测试

完整跑一次 collect → process → evaluate 流程，验证端到端数据正确性。

```bash
# 使用 mock 数据运行全流程
pnpm run pipeline:test
```

这个命令会：

1. 使用 `__fixtures__/` 中的预置数据替代真实 API 调用
2. 运行完整的 collect → process → evaluate 流程
3. 检查 `output/` 中生成的文件格式是否符合 TypeScript 类型定义
4. 检查关键候选人的评分是否在预期范围内

E2E 测试不应频繁运行（依赖较多、执行较慢），建议在以下时机触发：

- 修改了核心数据模型（types.ts）
- 修改了评分逻辑
- 准备发布前

## 6. 持续迭代闭环

```
┌─────────────────────────────────────────────────────────┐
│                    迭代闭环                              │
│                                                          │
│  ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐          │
│  │ 运行  │──>│ 验证  │──>│ 分析  │──>│ 改进  │──┐       │
│  │pipeline│   │golden │   │误判  │   │SKILLS │  │       │
│  │       │   │ set   │   │样本  │   │ .md   │  │       │
│  └──────┘   └──────┘   └──────┘   └───┬──┘  │       │
│      ▲                                  │      │       │
│      └──────────────────────────────────┘──────┘       │
└─────────────────────────────────────────────────────────┘
```

### 6.1 每日迭代（自动）

1. OpenClaw cron 触发 pipeline 运行
2. Pipeline 完成后自动运行 golden set 验证
3. 如果 precision/recall 低于阈值，发送告警（通过 OpenClaw channels）
4. 误判样本写入 `output/validation/`

### 6.2 每周迭代（半自动）

1. AI evaluator 的 review 步骤分析本周所有运行结果
2. 对比上周的指标变化
3. 生成 SKILLS-pending.md 更新建议
4. 人工 review 并合入

### 6.3 每月迭代（手动）

1. Review all_talent.json 的积累量和质量
2. 从 Dashboard 标注的 approved/rejected 中提取反馈
3. 将 approved 的候选人补充到 golden set 的 verified_chinese
4. 根据 rejected 的案例调整评分权重或反指标规则
6. 更新 `talents.yaml` 中的权重和参数

## 7. 质量指标追踪

在 `output/stats.json` 中跟踪以下指标（每次运行自动更新）：

| 指标 | 含义 | 健康范围 |
|------|------|---------|
| `total_candidates` | 候选池总量 | 持续增长 |
| `china_identified` | 通过身份识别的比例 | 30-60% |
| `reach_out_count` | 推荐联系的人数 | > 20 |
| `identity_precision` | 身份识别精度 | ≥ 0.95 |
| `identity_recall` | 身份识别召回率 | ≥ 0.80 |
| `avg_signal_count` | 人均信号数 | 2-5 |
| `unique_signal_types` | reach_out 候选人的平均信号类型数 | ≥ 2 |

这些指标在 Dashboard 的 stats 页面可视化展示，帮助维护者判断系统是否在正确的方向上迭代。

## 8. 辩证备注

### 测试不能替代人工判断

自动化测试能验证规则的正确性和数据的一致性，但无法验证"这个推荐是否真的对招聘有用"。最终的质量验证需要来自招聘团队的实际反馈。

Dashboard 的标注功能就是这个反馈渠道。当招聘人员在 Dashboard 上标记 approved/rejected 时，这些标注本身就是最有价值的训练信号。

### Golden Set 的维护成本

手工维护 golden set 是有成本的。建议：

- 初始 golden set 只需 50+50 = 100 个样本
- 来源：从 v1 的 step3_profiles.json 中手动标注，或从种子榜单中提取
- 每月从 Dashboard 标注中补充 5-10 个样本
- 总量保持在 100-200 个即可，不需要太大

### 不要 over-test

对于 data-collector（数据采集）模块，主要逻辑是调用外部 API + 解析响应。这种代码的单元测试价值有限（主要在测 mock 的正确性而不是业务逻辑）。应把测试精力集中在：

- identity detection（业务规则最密集的地方）
- scoring（计算逻辑最复杂的地方）
- deduplication（正确性要求最高的地方）
- dashboard lib/（所有从 `<script>` 抽出的可测试逻辑）

采集模块更适合用集成测试和 golden set 验证来保障质量。
