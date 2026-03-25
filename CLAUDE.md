# AI Talent Scout

自动发现 AI Coding 时代优秀中国开发者。

## 架构

- **收集**（Python + `gh` CLI）：`scout.py` 从 GitHub 多维度拉大列表，输出 JSON
- **分析**（Claude Code 自己做）：读取 `results/enriched_*.json`，智能评估每个候选人

## Step 1: 收集数据

```bash
python3 scout.py              # 完整收集（~30min，~1000 gh api calls）
python3 scout.py --dry-run    # 预览 API 预算
python3 scout.py --phase code # 只跑某个阶段
```

输出文件：
- `results/raw_YYYY-MM-DD.json` — 全量信号数据
- `results/enriched_YYYY-MM-DD.json` — top 500 候选人 + GitHub profile

## Step 2: AI 分析（你来做）

读取最新的 `results/enriched_*.json`，对每个 `location_match: true` 的候选人进行评估：

### 评估维度
1. **是否中国人**：location、name、company、bio 综合判断
2. **城市**：北京/上海优先
3. **技术水平** (1-10)：public_repos、followers、bio 内容、公司背景
4. **AI 工具使用深度** (1-10)：
   - 有 CLAUDE.md → 9-10（证明项目级使用）
   - 有 Claude co-author commit → 8-9（证明日常使用）
   - 有 .cursorrules → 7-8（Cursor 重度用户）
   - 只 star 了 repo → 3-4（围观）
5. **联系方式可用性** (1-10)：email > blog > twitter > 什么都没有
6. **推荐动作**：reach_out / monitor / skip

### 输出格式
写入 `results/talent_YYYY-MM-DD.json`：
```json
[
  {
    "username": "zhangsan",
    "name": "Zhang San",
    "city": "Beijing",
    "score": 15.0,
    "skill_level": 8,
    "ai_adoption": 9,
    "contact_quality": 7,
    "recommended_action": "reach_out",
    "summary": "字节跳动高级工程师，大量使用 Claude Code，有 12 个 MCP 相关项目",
    "email": "zhangsan@gmail.com",
    "blog": "https://zhangsan.dev",
    "twitter": "zhangsan_dev",
    "company": "ByteDance",
    "profile_url": "https://github.com/zhangsan",
    "signals": ["code:claude-code-user", "commit:claude-coauthor", "topic:mcp-server"]
  }
]
```

同时写入 CSV 版本 `results/talent_YYYY-MM-DD.csv` 方便在表格中查看。
累积更新 `results/all_talent.json`（跨次运行去重，保留最高分）。

### 评分公式
```
final_score = raw_score + skill_level * 0.5 + ai_adoption * 0.8 + contact_quality * 0.3 + city_bonus
city_bonus: 北京/上海 = 3.0, 其他中国城市 = 1.0
```

## 定时运行

通过 MetaBot 调度：
1. 每周跑一次 `python3 scout.py`
2. 跑完后读取结果做 AI 分析
3. 把 top 20 候选人摘要发到聊天

## 信号维度说明

| 维度 | 方法 | 权重 | 说明 |
|------|------|------|------|
| CLAUDE.md | code search | 5.0 | 证明项目级使用 Claude Code |
| .cursorrules | code search | 3.0 | Cursor 重度用户 |
| .clinerules | code search | 3.0 | Cline 重度用户 |
| Claude co-author | commit search | 5.0 | 证明日常使用 |
| topic:claude-code | repo search | 4.0 | 主动构建者 |
| topic:mcp-server | repo search | 4.0 | MCP 生态构建者 |
| 中文社区 star/fork | stargazers/forks | 2-3 | 几乎全是中国人 |
| 头部 repo star | stargazers | 1.0-1.5 | 量大信号弱 |
