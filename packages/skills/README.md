# @talent-scout/skills

[![GitHub Actions](https://github.com/huandu/talent-scout/actions/workflows/publish.yml/badge.svg)](https://github.com/huandu/talent-scout/actions/workflows/publish.yml)
[![npm: @talent-scout/skills](https://img.shields.io/npm/v/%40talent-scout%2Fskills?logo=npm)](https://www.npmjs.com/package/@talent-scout/skills)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f.svg)](../../LICENSE)

`@talent-scout/skills` 是对 OpenClaw 和 ClawHub 暴露的统一 skill 包。它不重写业务逻辑，而是把采集、处理、评估、查询和 cron 管理整理成单一命令面，既适合 OpenClaw agent 调用，也适合本地命令行使用。

## 角色定位

- 对外，这是唯一应该安装到 OpenClaw/ClawHub 的 skill 入口
- 对内，它只是薄包装，负责调用其他 `@talent-scout/*` 包

这条边界很重要：真正的采集、身份识别、评分和评估规则都不应该复制进这个包。

## 开发前提

- Node.js 22+
- pnpm 10+
- `openclaw` 已安装
- 若要发布到 ClawHub，需要额外安装 `clawhub`

在仓库根目录安装依赖：

```bash
pnpm install
```

## 常用命令

```bash
pnpm --filter @talent-scout/skills run skill collect
pnpm --filter @talent-scout/skills run skill process
pnpm --filter @talent-scout/skills run skill evaluate
pnpm --filter @talent-scout/skills run skill pipeline
pnpm --filter @talent-scout/skills run skill query shortlist
pnpm --filter @talent-scout/skills run skill query candidate huandu
pnpm --filter @talent-scout/skills run skill query stats
pnpm --filter @talent-scout/skills run skill cron status
pnpm --filter @talent-scout/skills run skill cron sync
```

## 代码结构

- `SKILL.md`: Agent Skills 入口文件
- `src/index.ts`: 命令分发器
- `src/commands.ts`: collect/process/evaluate 的薄包装
- `src/query.ts`: shortlist、candidate、stats 查询
- `src/cron.ts`: OpenClaw cron 控制
- `src/renderers.ts`: 终端文本渲染
- `src/patches.ts`: 运行时 skill patch overlay
- `references/`: 发布给 skill 消费者的参考文档

## 设计思想

### 1. 统一命令面比“包越多越细”更重要

对 OpenClaw 来说，最稳定的使用方式不是让模型自己猜该调用哪个内部包，而是给它一个明确的、长期稳定的 skill 入口。这个包的价值就是把调用面收口。

### 2. skill 包必须保持轻量

如果评分规则、身份识别逻辑和查询实现都复制到这里，分发看起来方便，维护时就会立刻失控。这里的实现原则是“只编排，不重写”。

### 3. patch 是运行时增强，不是替代版本发布

`workspace-data/skill-patches/` 里的 patch 用来叠加运行经验，而不是偷偷改写正式源码。稳定经验应该回收到正式版本里，再通过 npm/ClawHub 发布。

## 命令流

```mermaid
flowchart LR
  A[OpenClaw / CLI] --> B[src/index.ts]
  B --> C[commands.ts]
  B --> D[query.ts]
  B --> E[cron.ts]
  C --> F[@talent-scout/data-collector]
  C --> G[@talent-scout/data-processor]
  C --> H[@talent-scout/ai-evaluator]
  D --> H
```

## 如何发布到 ClawHub

ClawHub 发布是这个包的特殊职责。根据项目分发设计，推荐在仓库根目录执行：

```bash
pnpm add -g clawhub
clawhub login
clawhub publish packages/skills
```

如果你使用 `clawhub sync`，请显式限制同步范围，避免把工作区里无关的 skill 一并发布。

## 如何在本地 OpenClaw 环境测试

本地测试分成两层。

### 1. 先验证命令面

直接在仓库里运行：

```bash
pnpm --filter @talent-scout/skills run skill pipeline
pnpm --filter @talent-scout/skills run skill query shortlist
```

这一步验证的是命令编排、文本渲染和对业务包的调用是否正确。

### 2. 再验证 OpenClaw skill 装载

OpenClaw 会在工作区的 `skills/` 目录加载 skill。一个简单的本地测试方式是把 `packages/skills` 复制或软链接到某个 OpenClaw 工作区中：

```bash
mkdir -p ~/openclaw-workspace/skills
ln -s "$(pwd)/packages/skills" ~/openclaw-workspace/skills/talent-scout
cd ~/openclaw-workspace
openclaw
```

然后开启一个新的 OpenClaw session，使用类似下面的提示词验证 skill 是否被正确装载：

```text
请使用 talent-scout skill 展示当前 shortlist。
```

```text
请使用 talent-scout skill 把 talents.yaml 里的 cron 同步到 OpenClaw。
```

如果你已经把 skill 发布到 ClawHub，也可以在 OpenClaw 工作区直接执行：

```bash
openclaw skills install talent-scout
```

## 什么时候改这个包

- 需要增加新的统一命令或查询入口
- 需要调整 OpenClaw cron 的用户体验
- 需要补充适合 skill 消费者的参考文档

如果你是在改评分、身份识别、采集规则，请回到对应业务包。

## 相关文档

- [../../docs/06-openclaw.md](../../docs/06-openclaw.md)
- [../../docs/10-distribution.md](../../docs/10-distribution.md)
