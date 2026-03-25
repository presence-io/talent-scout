# AI Talent Scout

自动发现 AI Coding 时代优秀中国开发者。扫描 GitHub 多维度信号，用 Claude Code 智能评估候选人。

## 工作原理

```
Python 收集 (gh CLI)          Claude Code 分析
┌─────────────────────┐      ┌─────────────────────┐
│ CLAUDE.md 文件搜索    │      │ 读取 enriched.json   │
│ Claude co-author 搜索 │ ──→  │ 判断是否中国人        │
│ Topic repo 搜索      │      │ 评估技术水平/AI深度   │
│ 中文社区 star/fork   │      │ 提取联系方式          │
│ 头部 repo stargazers │      │ 输出 talent.json/csv  │
└─────────────────────┘      └─────────────────────┘
```

## 信号维度

| 信号 | 权重 | 说明 |
|------|------|------|
| `CLAUDE.md` 文件 | 5.0 | 证明项目级使用 Claude Code |
| Claude co-author commit | 5.0 | 证明日常使用 AI coding |
| `topic:claude-code` repo | 4.0 | 主动构建 AI 工具 |
| `topic:mcp-server` repo | 4.0 | MCP 生态建设者 |
| `.cursorrules` 文件 | 3.0 | Cursor 重度用户 |
| `.clinerules` 文件 | 3.0 | Cline 重度用户 |
| 中文社区 star/fork | 2-3 | 几乎全是中国开发者 |
| 头部 repo star | 1.0-1.5 | 量大但信号弱 |

## 快速开始

```bash
# 前置条件：gh CLI 已登录
gh auth status

# 安装依赖
pip3 install -r requirements.txt

# 预览 API 预算
python3 scout.py --dry-run

# 完整收集
python3 scout.py

# 然后用 Claude Code 分析结果（参见 CLAUDE.md）
```

## 使用方式

```bash
# 完整运行
python3 scout.py

# 只跑某个阶段
python3 scout.py --phase code       # 代码文件搜索
python3 scout.py --phase commits    # commit 签名搜索
python3 scout.py --phase topics     # topic repo 搜索
python3 scout.py --phase community  # 中文社区 repo
python3 scout.py --phase stars      # 头部 repo stargazers

# 跳过收集，只用已有数据重新 enrich
python3 scout.py --enrich-only
```

## 输出文件

| 文件 | 说明 |
|------|------|
| `results/raw_YYYY-MM-DD.json` | 全量信号数据（所有候选人） |
| `results/enriched_YYYY-MM-DD.json` | Top 500 候选人 + GitHub profile |
| `results/talent_YYYY-MM-DD.json` | Claude Code 评估后的最终结果 |
| `results/talent_YYYY-MM-DD.csv` | CSV 版本，方便表格查看 |
| `results/all_talent.json` | 跨次运行累积去重 |

## 项目结构

```
├── CLAUDE.md        # Claude Code 分析指令
├── config.yaml      # 目标 repo、权重、API 预算
├── scout.py         # 主收集脚本
├── github_api.py    # gh CLI 封装
├── requirements.txt # pyyaml
└── results/         # 输出目录
```
