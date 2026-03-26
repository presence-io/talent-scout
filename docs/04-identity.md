# 04: 中国开发者身份识别

> 系列文档索引：[01-overview](01-overview.md) · [02-architecture](02-architecture.md) · [03-data-sources](03-data-sources.md) · [04-identity](04-identity.md) · [05-evaluation](05-evaluation.md) · [06-openclaw](06-openclaw.md) · [07-data-model](07-data-model.md) · [08-dashboard](08-dashboard.md) · [09-testing](09-testing.md)

## 1. 为什么身份识别必须前置

v1 把"是否中国开发者"推迟到 Step 4（AI 评估），导致前 100 名几乎全是非中国人。v2 把身份识别作为独立步骤放在评分之前：

- 只有 `china_confidence ≥ 0.5` 的候选人才进入评估流程
- 这不是一个得分维度，而是一个硬过滤条件
- 避免在非目标人群上浪费 AI 评估预算

**范围说明**：目标为中国大陆开发者（不包括港澳台）。

## 2. 信号体系

身份识别采用多信号加权系统。每个信号独立产出一个 `(confidence_delta, evidence)` 对，最终汇总为 `china_confidence: 0-1`。

### Tier 1 — 确定性信号 (confidence ≥ 0.9)

| 信号 | 检测方式 | 说明 |
|------|---------|------|
| Location 明确包含中国城市 | 规则匹配 | 见下文城市关键词表 |
| 出现在公开中国开发者榜单 | 种子库交叉比对 | china-ranking / githubrank / 1c7 列表 |
| Email 后缀为中国大陆域名 | 规则匹配 | 见下文邮箱域名表 |

### Tier 2 — 强信号 (confidence ≥ 0.7)

| 信号 | 检测方式 | 说明 |
|------|---------|------|
| Bio 包含简体中文 | Unicode 范围检测 + 简繁区分 | 排除日文汉字（检测是否有假名混用） |
| Company 为已知中国公司 | 公司名单匹配 | 见下文公司列表 |
| Blog 域名为 `.cn` 或有 ICP 备案 | 域名后缀检查 | `.cn`、`.com.cn` 等 |
| 社交链接指向中国平台 | URL pattern 匹配 | 微博、知乎、掘金、B站等（见下文） |
| Profile README 包含简体中文 | 获取 `{user}/{user}` repo 的 README | 很多开发者的详细简介在这里 |

### Tier 3 — 中等信号 (confidence ≥ 0.4)

| 信号 | 检测方式 | 说明 |
|------|---------|------|
| 近期 repo 的 README 有简体中文 | 取最近更新的 10 个 repo，检查 README | 至少 2 个 repo 有中文才算 |
| 近 20 条 commit message 用简体中文 | 获取 events/commits | 至少 3 条中文 commit 才算 |
| 被多个已确认中国开发者 follow | follower 图交叉 | 被 ≥ 3 个已确认中国开发者 follow |

### Tier 4 — 弱信号 (confidence ≥ 0.2)

| 信号 | 检测方式 | 说明 |
|------|---------|------|
| 名字为常见中文拼音 | 拼音模式匹配 | 存在大量误判，仅作辅助 |
| Commit 时间分布集中在 UTC+8 | 近 100 条 commit 时间统计 | 需要足够样本量 |

## 3. Confidence 合成公式

```typescript
function computeChinaConfidence(signals: IdentitySignal[]): number {
  // 如果有任何 Tier 1 信号命中，直接返回高 confidence
  if (signals.some(s => s.tier === 1)) return 0.95;

  // Tier 2/3/4 采用 noisy-or 模型合成
  // P(中国) = 1 - ∏(1 - p_i)
  let productNotChina = 1.0;
  for (const signal of signals) {
    productNotChina *= (1 - signal.confidence);
  }
  return Math.min(1 - productNotChina, 0.95);
}
```

使用 noisy-or 模型而不是简单加权求和，因为：

- 多个独立弱信号叠加时，结果自然收敛到高 confidence 而不会超过 1
- 单个强信号就能直接定性，不被弱信号稀释
- 更符合概率论直觉

## 4. 模糊样本的 AI 辅助判断

对于 `0.3 < confidence < 0.7` 的候选人（规则无法确定的灰区），使用 OpenClaw agent 做最终判断：

```bash
openclaw agent --message '{
  "task": "identity_inference",
  "username": "someuser",
  "profile": { ... },
  "signals_collected": [ ... ],
  "question": "根据以上 GitHub profile 信息，判断此人是否为中国大陆开发者。输出 JSON: {is_chinese: bool, confidence: 0-1, evidence: string, city?: string}"
}' --json
```

AI 辅助只用于灰区样本，减少 API 开销。预期灰区比例在 20-30% 之间。

## 5. 关键参考数据

### 5.1 中国大陆城市关键词

```typescript
const CHINA_LOCATIONS = [
  // 一线
  'beijing', '北京', 'shanghai', '上海', 'guangzhou', '广州',
  'shenzhen', '深圳',
  // 新一线
  'hangzhou', '杭州', 'chengdu', '成都', 'nanjing', '南京',
  'wuhan', '武汉', 'xi\'an', '西安', 'suzhou', '苏州',
  'changsha', '长沙', 'zhengzhou', '郑州', 'dongguan', '东莞',
  'qingdao', '青岛', 'tianjin', '天津', 'ningbo', '宁波',
  'hefei', '合肥', 'shenyang', '沈阳', 'dalian', '大连',
  // 通用
  'china', '中国', 'mainland china', 'People\'s Republic of China', 'PRC',
  // 注意排除
  // 'hong kong', '香港', 'macau', '澳门', 'taiwan', '台湾'
];
```

匹配时需注意：

- `China` 出现在 location 中不一定指大陆（可能是 "China, Taiwan"），需要排除港澳台关键词共现
- 拼音匹配应 case-insensitive
- 城市列表应持续通过 SKILLS.md 积累补充

### 5.2 中国常用邮箱后缀

```typescript
const CHINA_EMAIL_DOMAINS = [
  // 大众邮箱
  'qq.com', '163.com', '126.com', 'yeah.net', 'foxmail.com',
  'sina.com', 'sina.cn', 'sohu.com', '139.com', '189.cn',
  'wo.cn', '21cn.com', 'tom.com', 'aliyun.com',
  // 企业邮箱（常见中国科技公司域名）
  'bytedance.com', 'tencent.com', 'alibaba-inc.com', 'baidu.com',
  'meituan.com', 'jd.com', 'xiaomi.com', 'huawei.com', 'oppo.com',
  'didi.com', 'bilibili.com', 'kuaishou.com', 'pinduoduo.com',
  // 教育
  'edu.cn',
];
```

### 5.3 中国社交平台 URL Pattern

```typescript
const CHINA_SOCIAL_PATTERNS = [
  { name: '微博', pattern: /weibo\.com/ },
  { name: '知乎', pattern: /zhihu\.com/ },
  { name: '掘金', pattern: /juejin\.cn/ },
  { name: 'B站', pattern: /bilibili\.com|space\.bilibili\.com/ },
  { name: 'CSDN', pattern: /csdn\.net/ },
  { name: '博客园', pattern: /cnblogs\.com/ },
  { name: '思否', pattern: /segmentfault\.com/ },
  { name: '微信公众号', pattern: /mp\.weixin\.qq\.com/ },
  { name: '即刻', pattern: /okjike\.com|jike\.city/ },
  { name: '少数派', pattern: /sspai\.com/ },
  { name: '小红书', pattern: /xiaohongshu\.com/ },
  { name: 'V2EX', pattern: /v2ex\.com/ },
];
```

### 5.4 已知中国科技公司

```typescript
const CHINA_COMPANIES = [
  // 大厂
  'bytedance', '字节跳动', 'tiktok', 'tencent', '腾讯', 'alibaba', '阿里',
  'baidu', '百度', 'meituan', '美团', 'jd.com', '京东', 'xiaomi', '小米',
  'huawei', '华为', 'didi', '滴滴', 'pinduoduo', '拼多多', 'netease', '网易',
  // 中厂
  'bilibili', 'B站', 'kuaishou', '快手', 'shopee', 'ant group', '蚂蚁',
  'zhihu', '知乎', 'douyu', '斗鱼', 'ximalaya', '喜马拉雅',
  'shein', 'sensetime', '商汤', 'megvii', '旷视', 'cloudwalk', '云从',
  // 这个列表应在 SKILLS.md 中持续积累
];
```

## 6. 实现分层

```
identity.ts 职责分层：

1. matchExplicitLocation(profile)     → Tier 1 信号
2. matchSeedLists(username, seeds)    → Tier 1 信号
3. matchEmailDomain(email)            → Tier 1/2 信号
4. matchBio(bio)                      → Tier 2 信号
5. matchCompany(company)              → Tier 2 信号
6. matchBlogDomain(blog)              → Tier 2 信号
7. matchSocialLinks(blog, bio)        → Tier 2 信号
8. matchProfileReadme(username)       → Tier 2 信号 (需 API)
9. matchRepoReadmes(username)         → Tier 3 信号 (需 API)
10. matchCommitLanguage(username)     → Tier 3 信号 (需 API)
11. matchFollowerGraph(username)      → Tier 3 信号 (需已有数据)
12. matchNamePinyin(name)             → Tier 4 信号
13. matchCommitTimezone(username)     → Tier 4 信号 (需 API)
```

Tier 1-2 的检测只依赖 profile 数据（一次 API 调用已获取），成本为零。

Tier 3 需要额外 API 调用，只对 Tier 1-2 未能确定的候选人执行。

Tier 4 成本低但误判高，仅作辅助。

**这种分层设计让 90% 的候选人只需 profile 数据就能判定，只有灰区 10-20% 需要额外 API 调用。** API 预算可控。

## 7. 测试与验证

身份识别模块的准确率直接决定系统有效性，必须有独立的验证机制：

- 从 step3_profiles.json（v1 数据）中取 50 个已知中国开发者和 50 个已知非中国开发者，作为 golden set
- 对 golden set 运行 identity 模块，计算 precision / recall / F1
- 目标：precision ≥ 0.95, recall ≥ 0.80
- 将误判样本记录到 SKILLS.md，驱动规则迭代

golden set 存放在 `seeds/identity-golden-set.json`，随项目一起提交。

## 8. 辩证备注

### Profile README 的价值

获取 `{user}/{user}` repo 的 README 是一个高价值信号源，很多开发者在这里放详细的中英文自我介绍、公司、城市、技术栈。但需要注意：

- 不是所有用户都有 profile repo
- 404 不算反向证据
- README 内容可能很长，只取前 2000 字符足够

### 简繁体区分

Bio/README 中检测中文时，需要区分简体和繁体。简体中文指向大陆，繁体指向港澳台。区分方法：

- 使用 Unicode 码点范围粗筛（但简繁在 Unicode 中有大量重叠）
- 更可靠的方式是检测"简体独有字"（如"这"vs"這"、"国"vs"國"等），出现 ≥ 2 个简体独有字即判为简体

这个区分逻辑应在 SKILLS.md 中持续积累边缘案例。

### 名字拼音匹配的局限

中文拼音名（如 "Zhang San"、"Li Wei"）在世界范围内并不唯一——越南、韩国等也有相似拼音。单独使用拼音判断的误判率很高，只能作为 Tier 4 辅助信号。结合其他信号使用时才有价值。
