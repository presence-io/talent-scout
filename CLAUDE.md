# AI Talent Scout

自动发现 AI Coding 时代优秀中国开发者。扫描 GitHub 信号（CLAUDE.md 文件、Claude co-author commits、MCP/Claude 相关 topic），用 Claude Sonnet 智能评估候选人质量。

## 运行

```bash
# 安装依赖
pip install -r requirements.txt

# 设置环境变量
export GITHUB_TOKEN=ghp_xxx
export ANTHROPIC_API_KEY=sk-ant-xxx

# 完整运行
python scout.py

# 预览 API 预算（不实际调用）
python scout.py --dry-run

# 只跑收集阶段（不做 AI 评估）
python scout.py --skip-ai

# 只跑某个信号
python scout.py --phase code      # 代码文件搜索
python scout.py --phase commits   # commit 签名搜索
python scout.py --phase topics    # topic repo 搜索
python scout.py --phase community # 中文社区 repo
python scout.py --phase stars     # 头部 repo stargazers

# 只做 AI 评估（需要先跑过 collect）
python scout.py --phase ai-only

# 设置最低分数
python scout.py --min-score 8
```

## 输出

- `results/talent_YYYY-MM-DD.json` — 当次运行结果
- `results/talent_YYYY-MM-DD.csv` — CSV 格式
- `results/all_talent.json` — 跨次运行累积去重
- `results/raw_YYYY-MM-DD.json` — Phase 1 原始收集数据（调试用）

## Pipeline

1. **收集**（Python + GitHub API）：代码搜索、commit 搜索、topic 搜索、中文社区、stargazers
2. **去重 + 粗筛**（Python）：合并信号、按分数排序、取 top N 拉 profile
3. **AI 评估**（Claude Sonnet）：批量评估候选人质量，判断是否中国人、技术水平、联系方式可用性
4. **输出**：JSON + CSV，累积到 all_talent.json

## 定时运行

```bash
# MetaBot 每周一早上跑
mb schedule add <bot> <chatId> 604800 "cd ai-talent-scout && python scout.py"
```
