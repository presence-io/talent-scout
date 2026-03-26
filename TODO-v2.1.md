# TODO-v2.1: 审计修复执行计划

> 基于 `.agent/REVIEW_RECORD.md` 审计结论，逐项修复设计文档与实现之间的不一致。
> 每个阶段完成后打 `[x]`，并提交一次 git commit。

## Phase 1: P0 — 关键逻辑错误修复

**目标**：修复会导致系统产出错误结果的代码缺陷，保证核心管线可以端到端运行。

- [x] **1.1** 修复信号类型映射错误
  - `packages/data-collector/src/github-signals.ts` 中 `labelToSignalType()` 使用 `ai-config:*` / `ai-coauthor:*` 风格 label，但 `talents.yaml` 使用 `code:claude-md` / `commit:claude-coauthor` 风格 label。
  - 修复方式：让 `labelToSignalType()` 直接使用 `talents.yaml` 中定义的 label 作为 `SignalType`，补充缺失的类型到 `SignalType` union。
  - 更新 `SignalType` 增加 `code:cursor-rules`、`code:cursor-rules-dir`、`code:copilot-instructions`、`commit:cursor-generated`、`commit:copilot-suggestion` 等。

- [x] **1.2** 修复 Dashboard 候选人详情读取逻辑
  - `packages/ai-evaluator/src/pipeline.ts` 写出 `step4_evaluated.json` 为 `Record<string, Candidate>`。
  - `packages/dashboard/src/pages/api/candidate/[username].ts` 按 `Candidate[]` 数组读取并调用 `.find()`。
  - 修复方式：Dashboard 端读取时兼容 `Record<string, Candidate>` 格式，用 `Object.values()` 获取数组。

- [x] **1.3** 修复活跃度惩罚使用错误指标
  - `packages/data-processor/src/scoring.ts` 中 `extractSkillFeatures()` 将 `recent_contributions` 设为 `profile.public_repos`（历史累计仓库数）。
  - 设计要求使用"近 12 个月贡献数"（public commit/PR/issue/review 等），但当前没有 events API 数据。
  - 修复方式：使用近期 repo 活跃月数和 repo 总量的综合估算替代，作为 `recent_contributions` 的更佳代理指标，并在注释中标明需要后续接入 Events API。

- [x] **1.4** 实现 data-processor CLI 入口
  - `packages/data-processor/src/index.ts` 只有导出，没有 CLI 主逻辑。
  - 新增 `packages/data-processor/src/cli.ts`，实现 merge → identity → scoring → 输出的完整流程。
  - 更新 `package.json` 将 `process` 脚本指向 `tsx src/cli.ts`。

- [x] **1.5** 实现 validate-identity 脚本
  - `packages/data-processor/package.json` 声明了 `validate:identity` 指向 `src/validate-identity.ts`。
  - 仓库中不存在该文件。
  - 新建 `packages/data-processor/src/validate-identity.ts`，实现 golden set 验证流程（读 `seeds/identity-golden-set.json`，运行 identity，输出 precision/recall/F1）。

- [x] **1.6** 更新所有相关测试，确保 `pnpm check` 通过。

## Phase 2: P1 — 输出数据模型迁移

**目标**：将输出目录结构从旧版 `step*` 平铺格式迁移到设计要求的分层时间戳目录。

- [x] **2.1** 更新 data-collector 输出到 `output/raw/{timestamp}/` 格式
  - `packages/data-collector/src/index.ts` 已使用新格式（确认无需改动）。

- [x] **2.2** 更新 data-processor 输出到 `output/processed/{timestamp}/` 格式
  - `packages/data-processor/src/cli.ts` 写 `merged.json`、`identity.json`、`scored.json` 到分层目录。

- [x] **2.3** 更新 ai-evaluator 输入/输出路径
  - `packages/ai-evaluator/src/pipeline.ts` 不再硬编码 `step2_merged.json` / `step3_profiles.json`。
  - 从 `output/processed/latest/` 或传入路径读取 `merged.json`。
  - 输出写到 `output/evaluated/{timestamp}/`。
  - 写出格式为 `evaluation.json`（`Record<string, Candidate>`）和 `shortlist.json`（`TalentEntry[]`）。

- [x] **2.4** 更新 ai-evaluator CLI 入口
  - `packages/ai-evaluator/src/index.ts` 使用新的输入/输出目录。

- [x] **2.5** 更新 Dashboard 文件读取
  - `packages/dashboard/src/lib/file.ts` `resolveOutputDir()` 支持 `output/evaluated/latest/` 路径。
  - Dashboard API 和页面从 `output/evaluated/latest/shortlist.json` 读取。

- [x] **2.6** 更新现有测试 fixture 和路径引用，确保 `pnpm check` 通过。

## Phase 3: P1 — Pipeline 集成与 Ignore List 接入

**目标**：确保 pipeline 各阶段可串联运行，ignore list 真正生效。

- [x] **3.1** 在 data-processor CLI 中接入 ignore list
  - 读取 `readIgnoreList()`，在 merge 完成后跳过已忽略的候选人。

- [x] **3.2** 在 ai-evaluator pipeline 中接入 ignore list
  - 加载 ignore list，跳过已忽略的候选人的 AI 评估。

- [x] **3.3** 更新根 `package.json` 的 `pipeline` 脚本
  - 确保 `pnpm pipeline` 可以端到端运行。

- [x] **3.4** 更新测试，确保 `pnpm check` 通过。

## Phase 4: P1 — 信号配置修复与身份识别增强

**目标**：补齐设计文档要求的 AI 工具平权信号，扩展身份识别规则覆盖。

- [x] **4.1** 补齐 `talents.yaml` 中的工具平权信号配置
  - 增加 `.clinerules`、`.windsurfrules`、`AGENTS.md`、`.github/copilot-instructions.md` 的 code signal。
  - 增加 `topic:mcp-server`、`topic:mcp`、`topic:copilot-extension`、`topic:cursor` 的 topic query。
  - 将所有工具信号权重统一为 2.0（按设计文档要求）。

- [x] **4.2** 更新 config schema（如需要）以支持新的 label 格式。

- [x] **4.3** 更新测试，确保 `pnpm check` 通过。

## Phase 5: P1 — OpenClaw 封装修复

**目标**：让 `callAgent()` 真正使用配置中的 agent name 和 workspace。

- [x] **5.1** 修复 `packages/shared/src/openclaw.ts` 中 `callAgent()`
  - 将配置中的 `name` 传给 `openclaw agent --agent-name`。
  - 将配置中的 `workspace` 传给 `openclaw agent --workspace`。

- [x] **5.2** 更新测试，确保 `pnpm check` 通过。

## Phase 6: P1 — Dashboard 标注能力与详情页修复

**目标**：落地 Dashboard 设计文档要求的标注功能。

- [x] **6.1** 实现 `PATCH /api/candidate/[username]`
  - 接收 `{ action: 'approved' | 'rejected' | 'noted', note?: string }` body。
  - 写入 `user-data/annotations.json`。

- [x] **6.2** 在候选人详情页添加标注 UI
  - 提供 approved / rejected / noted 标注按钮和备注输入框。

- [x] **6.3** 在列表页添加快速标注按钮
  - 在每行添加快速 approve / reject 操作。

- [x] **6.4** 更新测试，确保 `pnpm check` 通过。

## Phase 7: P2 — 清理与配置对齐

**目标**：清理占位代码，对齐配置与设计。

- [x] **7.1** 清理 `packages/shared/src/index.ts` 的占位注释。

- [x] **7.2** 确保 `pnpm check` 通过。

## Phase 8: 包发布配置

**目标**：为 npm 公开发布做准备。

- [x] **8.1** 移除各包 `package.json` 中的 `"private": true`
  - 添加 `publishConfig: { "access": "public" }`。
  - 添加 `files` 白名单（`["dist", "src"]`）。
  - 添加 `main` / `types` 指向编译产出。
  - Dashboard 保留 `"private": true`（不发布）。

- [x] **8.2** 创建 `.github/workflows/publish.yml`
  - 监听 `v*` tag push。
  - 提取版本号，批量更新各包版本。
  - 执行 install → build → test → publish。
  - 按依赖顺序 `pnpm publish --access public --no-git-checks`。

- [x] **8.3** 确保 `pnpm check` 通过。
