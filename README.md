# AI Talent Scout

自动发现 AI Coding 时代优秀中国开发者。扫描 GitHub 多维度信号，用 Claude Code 智能评估候选人。

## 工作原理

```
Python 收集 (gh CLI)                 Claude Code 分析
┌────────────────────────────┐      ┌─────────────────────┐
│ Step 1a  代码文件搜索        │      │ 读取 step3 结果      │
│ Step 1b  Commit 签名搜索     │      │ 判断是否中国人        │
│ Step 1c  Topic repo 搜索    │ ──→  │ 评估技术水平/AI深度   │
│ Step 1d  中文社区 star/fork  │      │ 提取联系方式          │
│ Step 1e  头部 repo stargazers│      │ 输出 talent.json/csv │
│ Step 2   合并去重            │      └─────────────────────┘
│ Step 3   拉 profile + 粗筛  │        Step 4 (AI analysis)
└────────────────────────────┘
```

## Pipeline 步骤

每步独立运行，中间结果落盘：

| Step | 命令 | 输出文件 | 说明 |
|------|------|----------|------|
| 1a | `python3 scout.py --step 1a` | `results/step1a_code.json` | CLAUDE.md / .cursorrules 搜索 |
| 1b | `python3 scout.py --step 1b` | `results/step1b_commits.json` | Claude co-author commit 搜索 |
| 1c | `python3 scout.py --step 1c` | `results/step1c_topics.json` | topic:claude-code 等搜索 |
| 1d | `python3 scout.py --step 1d` | `results/step1d_community.json` | 中文社区 repo star/fork |
| 1e | `python3 scout.py --step 1e` | `results/step1e_stars.json` | 头部 repo stargazers |
| 2 | `python3 scout.py --step 2` | `results/step2_merged.json` | 合并去重，按分数排序 |
| 3 | `python3 scout.py --step 3` | `results/step3_enriched.json` | Top N 拉 profile + 中国粗筛 |
| 4 | Claude Code | `results/step4_talent.json` | AI 评估 + 最终排名 |

## 快速开始

```bash
# 前置条件
gh auth status
pip3 install -r requirements.txt

# 预览 API 预算
python3 scout.py --dry-run

# 跑全部步骤 (1a→3)
python3 scout.py --all

# 或者单步执行
python3 scout.py --step 1a
python3 scout.py --step 1b
# ...
python3 scout.py --step 2
python3 scout.py --step 3

# Step 4: Claude Code 分析（参见 CLAUDE.md）
```

## 信号权重

| 信号 | 权重 | Step | 说明 |
|------|------|------|------|
| `CLAUDE.md` 文件 | 5.0 | 1a | 证明项目级使用 Claude Code |
| Claude co-author commit | 5.0 | 1b | 证明日常使用 AI coding |
| `topic:claude-code` repo | 4.0 | 1c | 主动构建 AI 工具 |
| `topic:mcp-server` repo | 4.0 | 1c | MCP 生态建设者 |
| `.cursorrules` 文件 | 3.0 | 1a | Cursor 重度用户 |
| `.clinerules` 文件 | 3.0 | 1a | Cline 重度用户 |
| 中文社区 star/fork | 2-3 | 1d | 几乎全是中国开发者 |
| 头部 repo star | 1.0-1.5 | 1e | 量大但信号弱 |

## 项目结构

```
├── CLAUDE.md        # Claude Code Step 4 分析指令
├── config.yaml      # 目标 repo、权重、API 预算
├── scout.py         # 分步 pipeline（Step 1-3）
├── github_api.py    # gh CLI 封装
├── requirements.txt # pyyaml
└── results/         # 每步输出目录
```
