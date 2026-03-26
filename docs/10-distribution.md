# 10: 发布与分发

> 系列文档索引：[01-overview](01-overview.md) · [02-architecture](02-architecture.md) · [03-data-sources](03-data-sources.md) · [04-identity](04-identity.md) · [05-evaluation](05-evaluation.md) · [06-openclaw](06-openclaw.md) · [07-data-model](07-data-model.md) · [08-dashboard](08-dashboard.md) · [09-testing](09-testing.md) · [10-distribution](10-distribution.md)

## 1. 目标

项目最终需要同时支持两类公开分发形态：

- npm package：`packages/*` 下的 `@talent-scout/*` 包以公开 npm package 发布。
- ClawHub / OpenClaw skill：由单一的 `@talent-scout/skills` 包提供可发布的 `SKILL.md`、脚本和参考文档，对外暴露统一 skill 能力。

其中 `@talent-scout/skills` 是唯一面向 ClawHub / OpenClaw 的技能入口，不再让每个子包各自承担 skill 发布职责。

## 2. 设计原则

### 2.1 业务逻辑只放在 `@talent-scout/*`

所有采集、处理、评估、Dashboard、共享类型与 CLI 入口都应位于 `packages/*` 下的 `@talent-scout/*` 包中。公开 API、CLI、类型定义、配置读取逻辑与查询能力都在这些包里维护。

`@talent-scout/skills` 只做四件事：

1. 提供 `SKILL.md` 元数据和使用说明。
2. 把其他包暴露的 CLI 与查询能力整理成统一命令面，便于模型调度。
3. 在 `scripts/` 中调用对应 npm 包暴露的命令或入口。
4. 提供少量参考文档和静态资源。

不得在 `@talent-scout/skills` 中复制评分规则、身份识别规则或数据采集实现。

### 2.2 `SKILL.md`、内置 skills 与 workspace patch 职责严格分离

- `SKILL.md`：面向 Agent Skills 规范的技能入口文件，位于 `packages/skills/`，必须包含 YAML frontmatter 和 Markdown 正文。
- 内置 skills：随各 npm 包版本一起发布的只读技能基线。
- workspace patch：写入 `workspace-data/skill-patches/` 的运行时增强层。

三者不能混用。特别是 workspace patch 不能反向改写包源码或取代正式版本发布。

### 2.3 查询能力必须可复用

`dashboard` 和 `@talent-scout/skills` 都依赖本地数据查询，因此查询逻辑必须在业务包内作为正式接口存在，而不是散落在 UI 侧。

要求如下：

- `data-collector` 暴露原始采集结果与种子状态查询
- `data-processor` 暴露候选人 identity / scoring read model 查询
- `ai-evaluator` 暴露 shortlist / evaluation / stats 查询
- `dashboard` 与 `@talent-scout/skills` 只消费这些接口

### 2.3 版本由 Git tag 驱动

以仓库 Git tag `vX.Y.Z` 作为统一版本源：

- npm 包版本统一更新为 `X.Y.Z`
- skill bundle metadata 中的版本字段同步为 `X.Y.Z`
- npm 发布与 ClawHub 发布由同一条 release pipeline 驱动

不允许手工分别维护 npm 版本和 skill 版本。

## 3. `@talent-scout/skills` 包结构约束

根据 Agent Skills 规范和本项目的新分层设计，`packages/skills/` 至少包含以下结构：

```text
packages/skills/
├── SKILL.md
├── references/
├── scripts/
├── src/
│   ├── index.ts
│   ├── commands.ts
│   ├── cron.ts
│   ├── query.ts
│   ├── patches.ts
│   └── renderers.ts
└── package.json
```

其中：

- `SKILL.md` 必须包含 YAML frontmatter，至少声明 `name`、`description`
- `scripts/` 中的脚本必须是薄包装，只调用 `@talent-scout/*` 暴露的能力
- `query.ts` 负责文字查询入口，适配 IM channel / TUI
- `cron.ts` 负责 start / pause / sync 等 OpenClaw cron 控制命令
- `patches.ts` 负责加载工作区 patch，并与内置 skills 做 overlay

`packages/skills/` 既是 npm package，也是可发布到 ClawHub 的 skill 根目录。这样版本、发布和源码边界保持一致。

推荐的命令面包括：

- 运行采集、处理、评估、全流程 pipeline
- 启动、暂停、同步和查询 OpenClaw cron
- 查询候选人、shortlist、统计指标、运行历史
- 输出适合 IM channel / TUI 的文字响应

## 4. npm 包要求

所有 `@talent-scout/*` 包必须满足公开发布要求：

- 不设置 `private: true`
- 提供稳定的 `main` / `types` / `exports`
- 使用 `files` 白名单只发布运行所需文件
- 若对外暴露 CLI，则通过明确的脚本入口或 `bin` 字段公开
- workspace 依赖在发布前统一替换为可解析的版本号

Dashboard 即使主要作为应用运行，只要仍保留在 `@talent-scout/*` 命名空间内，也应遵守同样的公开发布约束。与此同时，只有 `@talent-scout/skills` 需要额外满足 Agent Skills 规范。

## 5. 发布流水线

GitHub Actions 的目标流程如下：

1. 监听 `vX.Y.Z` tag。
2. 安装依赖并统一写入版本号。
3. 运行 `pnpm -r build`。
4. 运行 `pnpm check`。
5. 发布全部 `@talent-scout/*` npm 包。
6. 校验 `packages/skills/`。

skill bundle 发布至少需要补充以下校验：

- `skills-ref validate ./packages/skills`
- `SKILL.md` frontmatter 合法性校验
- 脚本可执行性检查
- workspace patch 向后兼容性测试

### 5.1 发布 ClawHub skill 的额外要求

由于 Clawhub 需要登录状态才能发布，所以发布 Clawhub skills 的脚本需要在本地执行，而不能完全依赖 CI 自动化。

发布命令可采用：

```bash
pnpm --filter @talent-scout/skills run bundle:clawhub
clawhub publish packages/skills/dist/clawhub/chinese-talent-scout
```

原因：Agent Skills 规范要求 `SKILL.md` 的 `name` 字段必须与发布目录名一致。源码目录 `packages/skills/` 本身不应直接作为最终发布目录；应先打包成一个符合规范、可独立运行的 bundle 目录，再交给 ClawHub。

若使用 `clawhub sync`，也应显式约束同步范围，避免误发布工作区内无关目录。

## 6. 与 OpenClaw 调度的关系

OpenClaw cron 最终调度的应是 `@talent-scout/skills` 暴露的统一命令或其薄包装脚本，而不是散落的本地 ad-hoc shell 命令。也就是说：

- 包提供长期稳定的 CLI 能力
- `@talent-scout/skills` 提供面向 OpenClaw / ClawHub 的安装、调度、查询和运维入口
- cron 配置引用 `@talent-scout/skills` 提供的固定命令约定

这样本地开发、npm 分发、ClawHub 安装、OpenClaw 调度四条链路才能保持一致。

## 6.1 Workspace Patch 发布边界

运行时生成的 patch 不属于 npm 包内容，也不直接发布到 ClawHub。它们属于用户工作区状态，生命周期如下：

1. 由运行中的 review / query / analysis 流程生成
2. 写入 `workspace-data/skill-patches/`
3. 仅在本地工作区或显式同步的工作区间共享
4. 若被验证稳定，再由维护者手工吸收进正式版本

这样可以同时保留自我迭代能力和包版本的稳定性。

## 7. 验收标准

当以下条件全部满足时，才算完成“公开分发”设计目标：

1. `packages/*` 下所有 `@talent-scout/*` 包都可独立构建并公开发布。
2. `packages/skills/` 存在合法的 `SKILL.md`，且可通过 `skills-ref validate`。
3. `SKILL.md`、内置 skills 与 workspace patch 的职责在实现中清晰分离。
4. Git tag 触发的 CI 同时覆盖 npm 发布和 skill 发布。
5. OpenClaw cron 可以基于 `@talent-scout/skills` 安装产物直接调度，而不是依赖仓库内隐式脚本路径。
6. Dashboard 与 `@talent-scout/skills` 复用同一套查询接口，而不是各自解析底层文件。
