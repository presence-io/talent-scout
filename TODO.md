# TODO: 执行计划

> 每个阶段完成后打 `[x]`，详细设计参考对应的 `docs/*.md` 文档。

## Phase 0: 工程基础设施

**目标**：在写任何业务代码之前，先把工程化骨架搭好。

- [x] 创建 `AGENTS.md`：短小精悍，渐进式结构，拆分为多个小文件（根 AGENTS.md + 各 packages 的 AGENTS.md）→ [02 §2.5](docs/02-architecture.md)
- [x] 创建 `.gitignore`（output/、cache/、legacy/、node_modules/、dist/）→ [07 §1](docs/07-data-model.md)
- [x] 将现有 Python 代码移入 `legacy/` 目录备份
- [x] 初始化 PNPM monorepo：`pnpm init`，创建 `pnpm-workspace.yaml`
- [x] 创建 `packages/` 子目录结构：`shared`、`data-collector`、`data-processor`、`ai-evaluator`、`dashboard`
- [x] 每个子项目 `pnpm init`，统一命名为 `@talent-scout/*`
- [x] 配置 TypeScript strict mode（`tsconfig.json` + 各子项目 extends）
- [x] 配置 Vitest（`vitest.config.ts`，coverage thresholds 90%）→ [02 §2.1](docs/02-architecture.md)
- [x] 配置 ESLint flat config + Prettier → [02 §2.2-2.3](docs/02-architecture.md)
- [x] 根 `package.json` scripts：`test`、`lint`、`format`、`check`、`cron:sync` → [02 §2.4](docs/02-architecture.md)
- [x] 创建 `scripts/check-deps.js` preinstall hook → [02 §2.6](docs/02-architecture.md)

## Phase 1: 共享模块 (@talent-scout/shared)

- [x] 实现 `talents.yaml` 配置读取（Zod schema 校验）→ [07 §5](docs/07-data-model.md)
- [x] 实现 `openclaw.ts` CLI 封装（基于 execa）→ [02 §4](docs/02-architecture.md)、[06 §2](docs/06-openclaw.md)
- [x] 实现文件缓存层（cache/、TTL）→ [07 §4](docs/07-data-model.md)
- [x] 实现 `readIgnoreList()` 供各模块使用 → [08 §5.1](docs/08-dashboard.md)
- [x] TypeScript 类型定义（Signal、Candidate、CandidateFeatures 等）→ [07 §2](docs/07-data-model.md)、[05 §7.2](docs/05-evaluation.md)
- [x] 单元测试：config 解析、cache TTL → [09 §2.1](docs/09-testing.md)

## Phase 2: 数据采集 (@talent-scout/data-collector)

- [x] 从 legacy Python 迁移 GitHub API 调用逻辑到 TypeScript
- [x] 实现 5 个采集源（code signals、commits、topics、community、stargazers）→ [03 §2](docs/03-data-sources.md)
- [x] 信号标签统一为 tool-agnostic 格式 → [03 §2.2](docs/03-data-sources.md)
- [x] 从 legacy Python 迁移 GitHub API 调用逻辑到 TypeScript
- [x] 实现 5 个采集源（code signals、commits、topics、community、stargazers）→ [03 §2](docs/03-data-sources.md)
- [x] 信号标签统一为 tool-agnostic 格式 → [03 §2.2](docs/03-data-sources.md)
- [x] API 预算控制（rate limit、sleep、max pages）
- [x] 集成测试：GitHub API mock → [09 §3](docs/09-testing.md)

## Phase 3: 数据处理 (@talent-scout/data-processor)

- [x] 多源合并 + 信号去重 → [07 §3](docs/07-data-model.md)
- [x] 身份识别：5-Tier 信号 + noisy-or → [04](docs/04-identity.md)
- [x] 规则评分：SkillFeatures、AIDepthFeatures、ReachabilityFeatures、FitFeatures → [05 §3-6](docs/05-evaluation.md)
- [x] 活跃度前置检查（< 10 贡献 → -3.0 惩罚）→ [05 §1.5](docs/05-evaluation.md)
- [x] 最终评分 + 推荐动作 → [05 §7](docs/05-evaluation.md)
- [x] 多源合并 + 信号去重 → [07 §3](docs/07-data-model.md)
- [x] 身份识别：5-Tier 信号 + noisy-or → [04](docs/04-identity.md)
- [x] 规则评分：SkillFeatures、AIDepthFeatures、ReachabilityFeatures、FitFeatures → [05 §3-6](docs/05-evaluation.md)
- [x] 活跃度前置检查（< 10 贡献 → -3.0 惩罚）→ [05 §1.5](docs/05-evaluation.md)
- [x] 最终评分 + 推荐动作 → [05 §7](docs/05-evaluation.md)
- [x] Golden Set 验证框架 → [09 §4](docs/09-testing.md)
- [x] 单元测试：identity、scoring、deduplication → [09 §2.1](docs/09-testing.md)

## Phase 4: AI 评估 (@talent-scout/ai-evaluator)

- [x] OpenClaw agent 注册与调用 → [06 §2-3](docs/06-openclaw.md)
- [x] SKILLS.md 迭代机制 → [06 §3](docs/06-openclaw.md)
- [x] 批量评估 + 产出 shortlist → [05 §8](docs/05-evaluation.md)
- [x] OpenClaw agent 注册与调用 → [06 §2-3](docs/06-openclaw.md)
- [x] SKILLS.md 迭代机制 → [06 §3](docs/06-openclaw.md)
- [x] 批量评估 + 产出 shortlist → [05 §8](docs/05-evaluation.md)

## Phase 5: Dashboard (@talent-scout/dashboard)

- [ ] Astro + TailwindCSS + DaisyUI 初始化
- [ ] 候选人列表页 + 详情页 → [08 §3.1-3.2](docs/08-dashboard.md)
- [ ] OpenClaw cron 状态页 → [08 §3.3](docs/08-dashboard.md)
- [ ] 统计页 → [08 §3.4](docs/08-dashboard.md)
- [ ] API routes + 标注写入 `user-data/` → [08 §4-5](docs/08-dashboard.md)
- [ ] `lib/` 纯函数提取 + 测试 → [08 §2](docs/08-dashboard.md)、[09](docs/09-testing.md)
- [ ] 候选人列表页 + 详情页 → [08 §3.1-3.2](docs/08-dashboard.md)
- [ ] OpenClaw cron 状态页 → [08 §3.3](docs/08-dashboard.md)
- [ ] 统计页 → [08 §3.4](docs/08-dashboard.md)
- [ ] API routes + 标注写入 `user-data/` → [08 §4-5](docs/08-dashboard.md)
- [ ] `lib/` 纯函数提取 + 测试 → [08 §2](docs/08-dashboard.md)、[09](docs/09-testing.md)

## Phase 6: Cron 调度

- [ ] Cron 同步脚本（syncCronJobs 含去重）→ [06 §4.2](docs/06-openclaw.md)
- [ ] talents.yaml 中配置所有 cron 任务 → [06 §4.1](docs/06-openclaw.md)
- [ ] E2E pipeline 测试 → [09 §5](docs/09-testing.md)
- [ ] Cron 同步脚本（syncCronJobs 含去重）→ [06 §4.2](docs/06-openclaw.md)
- [ ] talents.yaml 中配置所有 cron 任务 → [06 §4.1](docs/06-openclaw.md)
- [ ] E2E pipeline 测试 → [09 §5](docs/09-testing.md)
