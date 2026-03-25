# AI Talent Scout

自动发现 AI Coding 时代优秀中国开发者。

## Pipeline 步骤

每步独立运行，中间结果落盘到 `results/` 目录：

```
Step 1a → results/step1a_code.json        代码文件搜索 (CLAUDE.md, .cursorrules)
Step 1b → results/step1b_commits.json     Commit 签名搜索 (Co-Authored-By: Claude)
Step 1c → results/step1c_topics.json      Topic repo 搜索 (claude-code, mcp-server)
Step 1d → results/step1d_community.json   中文社区 star/fork
Step 1e → results/step1e_stars.json       头部 repo stargazers
Step 2  → results/step2_merged.json       合并去重 + 按分数排序
Step 3  → results/step3_enriched.json     Top N 拉 GitHub profile + location 粗筛
Step 4  → results/step4_talent.json       (你来做) AI 评估
```

## 运行命令

```bash
python3 scout.py --step 1a       # 单步运行
python3 scout.py --step 2        # 合并（读取 step1*.json）
python3 scout.py --step 3        # 充实（读取 step2_merged.json）
python3 scout.py --all           # 跑全部 1a→3
python3 scout.py --dry-run       # 预览 API 预算
```

## Step 4: AI 分析（你来做）

读取 `results/step3_enriched.json`，对候选人评估：

### 输入
`step3_enriched.json` 中每个候选人包含：
- `username`: GitHub 用户名
- `raw_score`: 信号权重总分
- `signal_count`: 信号数量
- `signals`: 信号列表（type, detail, weight）
- `profile`: GitHub profile（name, location, email, blog, twitter, bio, company, public_repos, followers）
- `location_match`: Python 粗筛是否匹配中国 location

### 评估维度
1. **是否中国人**：location + name + company + bio 综合判断（比 Python 关键词匹配更准）
2. **城市**：北京/上海优先
3. **技术水平** (1-10)：repos 数、followers、bio、公司背景
4. **AI 工具使用深度** (1-10)：
   - CLAUDE.md in repo → 9-10
   - Claude co-author commit → 8-9
   - .cursorrules → 7-8
   - 只 star → 3-4
5. **联系方式可用性** (1-10)：email > blog > twitter > 无
6. **推荐动作**：reach_out / monitor / skip

### 评分公式
```
final_score = raw_score + skill_level × 0.5 + ai_adoption × 0.8 + contact_quality × 0.3 + city_bonus
city_bonus: 北京/上海 = 3.0, 其他中国城市 = 1.0
```

### 输出
写入 `results/step4_talent.json`：
```json
[
  {
    "username": "zhangsan",
    "name": "Zhang San",
    "city": "Beijing",
    "final_score": 15.0,
    "skill_level": 8,
    "ai_adoption": 9,
    "contact_quality": 7,
    "recommended_action": "reach_out",
    "summary": "字节跳动高级工程师，大量使用 Claude Code",
    "email": "zhangsan@gmail.com",
    "blog": "https://zhangsan.dev",
    "company": "ByteDance",
    "profile_url": "https://github.com/zhangsan",
    "signals": ["code:claude-code-user", "commit:claude-coauthor"]
  }
]
```

同时写入 `results/step4_talent.csv`。
累积更新 `results/all_talent.json`（跨次运行去重，保留最高分）。

## 信号权重

| 信号 | 权重 | Step |
|------|------|------|
| CLAUDE.md 文件 | 5.0 | 1a |
| Claude co-author commit | 5.0 | 1b |
| topic:claude-code repo | 4.0 | 1c |
| topic:mcp-server repo | 4.0 | 1c |
| .cursorrules 文件 | 3.0 | 1a |
| .clinerules 文件 | 3.0 | 1a |
| 中文社区 star/fork | 2-3 | 1d |
| 头部 repo star | 1.0-1.5 | 1e |
