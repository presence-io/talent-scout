# TODO-v2.2: 审计修复执行计划（v2.1 审计残留问题）

> 基于 `.agent/REVIEW_RECORD-v2.1.md` 审计结论，逐项修复仍然存在的设计/实现差距。
> 每个阶段完成后打 `[x]`，并提交一次 git commit。

## Phase 1: P1 — 创建 `@talent-scout/skills` 统一 skill 包

**目标**：落地 `packages/skills/` 包，作为 ClawHub / OpenClaw 的唯一 skill 发布入口。

- [x] **1.1** 创建 `packages/skills/` 基础结构
  - `package.json`（`@talent-scout/skills`，公开发布，依赖其他四个包）。
  - `tsconfig.json`。
  - `SKILL.md`：包含 YAML frontmatter（`name`、`description`、`version`）和 Markdown 使用说明。
  - `references/` 目录，放入 README 链接或简要参考文档。
  - `scripts/` 目录，放入调用其他包命令的薄包装脚本。

- [x] **1.2** 实现 `packages/skills/src/` 核心模块
  - `index.ts`：CLI 路由，解析子命令分发到对应模块。
  - `commands.ts`：统一命令面，封装 collect / process / evaluate / pipeline。
  - `cron.ts`：OpenClaw cron 控制命令（start / pause / sync / status）。
  - `query.ts`：文本查询入口，调用各业务包暴露的查询接口。
  - `patches.ts`：工作区 patch 加载与 overlay 逻辑。
  - `renderers.ts`：IM / TUI 友好的文字渲染。

- [x] **1.3** 更新 `pnpm-workspace.yaml` 包含 `packages/skills`。

- [x] **1.4** 更新 `.github/workflows/publish.yml`
  - 增加 `@talent-scout/skills` 的 npm 发布步骤。
  - 增加 `skills-ref validate ./packages/skills` 校验步骤（允许 `skills-ref` 不存在时跳过）。
  - 将 tag 触发条件从 `v*` 收紧为 `v[0-9]+.[0-9]+.[0-9]+*`（仅匹配 semver 格式 tag）。

- [x] **1.5** 添加 skills 包测试，确保 `pnpm check` 通过。

## Phase 2: P1 — 建立共享查询层

**目标**：让 Dashboard 和 `@talent-scout/skills` 复用同一套查询接口，不再各自直接解析 JSON 文件。

- [x] **2.1** 在 `@talent-scout/ai-evaluator` 中暴露查询 API
  - 导出 `loadShortlist(outputDir): Promise<TalentEntry[]>`。
  - 导出 `loadEvaluation(outputDir): Promise<Record<string, Candidate>>`。
  - 导出 `loadRunStats(outputDir): Promise<RunStats>`。

- [x] **2.2** 在 `@talent-scout/data-processor` 中暴露查询 API
  - 导出 `loadProcessedCandidates(processedDir): Promise<Record<string, Candidate>>`。
  - 导出 `loadIdentityResults(processedDir): Promise<Record<string, IdentityResult>>`。

- [x] **2.3** 在 `@talent-scout/data-collector` 中暴露查询 API
  - 导出 `loadRawSignals(rawDir): Promise<Record<string, Signal[]>>`。

- [x] **2.4** 重构 Dashboard 使用共享查询接口
  - `lib/file.ts` 中的 `readJsonFile` 保留用于 user-data 读写。
  - Dashboard 页面和 API 改为调用 `@talent-scout/ai-evaluator` 的查询接口读取 shortlist/evaluation 数据。

- [x] **2.5** 更新测试，确保 `pnpm check` 通过。

## Phase 3: P1 — Dashboard 发布配置与发布流水线修复

**目标**：将 Dashboard 纳入公开 npm 发布链路，完善发布流水线。

- [x] **3.1** 移除 `packages/dashboard/package.json` 中的 `"private": true`
  - 添加 `publishConfig: { "access": "public" }`。
  - 添加 `files` 白名单。
  - 添加 `main` / `types`（指向 Astro 构建产物或 lib 入口）。

- [x] **3.2** 更新 `.github/workflows/publish.yml` 发布 Dashboard
  - 在发布步骤中添加 `@talent-scout/dashboard`。

- [x] **3.3** 确保 `pnpm check` 通过。

## Phase 4: P1 — 身份识别规则增强

**目标**：补齐设计文档（`docs/04-identity.md`）要求但尚未实现的身份识别规则。

- [x] **4.1** 实现 Tier 3 身份信号检测
  - profile README 中文检测：检查候选人 `{username}/{username}` 仓库描述或 README 中的简体中文。
  - 最近 repo README 中文检测：检查 `recent_repos` 的 description 中是否含简体中文。
  - commit message 中文检测：检查候选人最近提交消息中的简体中文（基于 signal 数据推断）。

- [x] **4.2** 实现 Tier 4 辅助信号检测
  - 拼音名检测：检测用户名或 name 是否符合拼音模式。
  - commit timezone 辅助信号：基于 commit 时间推测 UTC+8 时区偏好。

- [x] **4.3** 在 `identifyCandidate()` 中接入新规则
  - 先执行 Tier 1-2（free cost），如结论不确定再执行 Tier 3-4。
  - 更新 `computeChinaConfidence()` 支持 Tier 3/4 加入 noisy-or 模型。

- [x] **4.4** 更新身份识别测试，确保 `pnpm check` 通过。

## Phase 5: P2 — Dashboard Cron 页面与 Stats 页面增强

**目标**：让 Cron 页面支持运行历史展示，让 Stats 页面支持趋势与质量指标。

- [x] **5.1** 增强 Cron 页面
  - 保留现有配置展示。
  - 增加"最近运行历史"区域：扫描 `output/evaluated/` 目录列出历史运行的时间戳。
  - 增加"Run Now"按钮占位（前端按钮 + 对应 API 端点，实际执行留给 OpenClaw 调度）。

- [x] **5.2** 增强 Stats 页面
  - 增加 `output/stats.json` 的趋势数据展示（如果 stats.json 存在）。
  - 增加信号来源分布（signal_types 分布统计）。
  - 增加质量指标展示（identity_precision / recall，如果 validation 数据存在）。

- [x] **5.3** 更新测试，确保 `pnpm check` 通过。

## Phase 6: P2 — 清理旧版输出产物与杂项

**目标**：清理旧格式文件，对齐仓库状态与代码逻辑。

- [x] **6.1** 删除 `output/` 下的旧版 `step*` 文件
  - 移除 `step1a_code.json`、`step1b_commits.json`、`step1c_topics.json`、`step1d_community.json`、`step1e_stars.json`、`step2_merged.json`、`step3_profiles.json`。

- [x] **6.2** 在 `.gitignore` 中忽略运行产物目录
  - 添加 `output/raw/`、`output/processed/`、`output/evaluated/` 到 `.gitignore`。
  - 添加 `workspace-data/` 到 `.gitignore`。
  - 添加 `cache/` 到 `.gitignore`。

- [x] **6.3** 最终验证 `pnpm check` 通过，全部提交。
