# AI Talent Scout

自动发现 AI Coding 时代优秀中国开发者。扫描 GitHub 多维度信号，用 AI 智能评估候选人。

## Background

这个项目的目标是从 GitHub 上找到正在深度使用 AI coding tools（Claude Code、Cursor、Cline 等）的中国开发者，作为招聘候选人。

当前版本是一个**可运行的 MVP** — pipeline 能跑通，产出候选人列表。但在工程质量、产品完整度、AI 集成深度上都有明显的提升空间。

## 现有 Pipeline

```
Python 收集 (gh CLI)                 Claude Code 分析
┌────────────────────────────┐      ┌─────────────────────┐
│ Step 1a  代码文件搜索        │      │ 读取 step3 结果      │
│ Step 1b  Commit 签名搜索     │      │ 判断是否中国人        │
│ Step 1c  Topic repo 搜索    │ ──→  │ 评估技术水平/AI深度   │
│ Step 1d  中文社区 star/fork  │      │ 提取联系方式          │
│ Step 1e  头部 repo stargazers│      │ 输出 talent.json/csv │
│ Step 2   合并去重            │      └─────────────────────┘
│ Step 3   拉 profile + 粗筛  │        Step 4 (手动)
└────────────────────────────┘
```

| Step | 命令 | 输出文件 | 说明 |
|------|------|----------|------|
| 1a | `python3 scout.py --step 1a` | `results/step1a_code.json` | CLAUDE.md / .cursorrules 搜索 |
| 1b | `python3 scout.py --step 1b` | `results/step1b_commits.json` | Claude co-author commit 搜索 |
| 1c | `python3 scout.py --step 1c` | `results/step1c_topics.json` | topic:claude-code 等搜索 |
| 1d | `python3 scout.py --step 1d` | `results/step1d_community.json` | 中文社区 repo star/fork |
| 1e | `python3 scout.py --step 1e` | `results/step1e_stars.json` | 头部 repo stargazers |
| 2 | `python3 scout.py --step 2` | `results/step2_merged.json` | 合并去重，按分数排序 |
| 3 | `python3 scout.py --step 3` | `results/step3_profiles.json` | Top N 拉 profile |
| 4 | 手动 Claude Code | `results/step4_talent.json` | AI 评估 + 最终排名 |

## Quick Start

```bash
gh auth status
pip3 install -r requirements.txt
python3 scout.py --dry-run       # 预览 API 预算
python3 scout.py --all           # 跑全部步骤 (1a→3)
```

`results/` 目录下有上一次运行的样本数据，可以直接用来理解数据结构。

## Assignment

**你的任务：把这个 MVP 迭代成一个你自己满意的工具。**

没有强制的方向。你可以自由决定改什么、怎么改、优先级如何。我们关注的是你做出来的东西，不是 checklist。

以下是一些我们注意到的现状，供参考（不是必须全做）：

### 工程层面

- Step 4（AI 评估）目前是手动用 Claude Code 跑的，没有集成到 pipeline 里
- 没有测试
- 跑失败了只能从头来，没有断点续传
- Rate limiting 是固定 sleep，比较粗糙
- 没有 cache，重复跑同一个 username 会重复调 API

### 产品层面

- 中国人判断靠 location 关键词，漏掉了大量 location 为空或写英文的中国开发者
- 信号权重是拍脑袋定的，没有验证过
- 没有增量更新机制（每次全量重跑）
- 候选人评估只看 profile 元数据，没有读候选人的实际代码/repo 内容
- 没有输出渠道（CSV 导出、通知、CRM 对接等）

### AI 集成

- Step 4 依赖人手动跑 Claude Code，没有自动化
- 没有利用 AI 做更深层的评估（比如读候选人 repo 的代码质量、CLAUDE.md 的内容深度）
- 信号收集阶段没有 AI 参与（比如用 AI 判断 commit message 是否真的是 AI 协作）

### 时间

建议投入 **3-5 天**（part-time 即可）。不需要全做 — 选你认为最有价值的方向，做到你满意的程度。

## 项目结构

```
├── CLAUDE.md        # Claude Code Step 4 分析指令
├── config.yaml      # 目标 repo、权重、API 预算
├── scout.py         # 分步 pipeline（Step 1-3）
├── github_api.py    # gh CLI 封装
├── requirements.txt # pyyaml
└── results/         # 每步输出（含样本数据）
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
