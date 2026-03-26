# TODO-v2.3: 审计修复执行计划（v2.2 审计残留问题）

> 基于 `.agent/RECORD_RECORD-v2.2.md` 审计结论，逐项修复仍然存在的设计/实现差距。
> 每个阶段完成后打 `[x]`，并提交一次 git commit。

## Phase 1: P1 — 运行时目录模型统一到 `workspace-data/`

**目标**：将所有包的默认运行态路径从 `output/` + `user-data/` 收敛到 `workspace-data/output/` + `workspace-data/user-data/`，与 `docs/07-data-model.md` 对齐。

- [ ] **1.1** 在 `@talent-scout/shared` 中新增 `workspace.ts` 工具模块
  - 导出 `resolveWorkspaceDir(base?): string`：读取 `TALENT_WORKSPACE` 环境变量，默认 `$PWD/workspace-data`。
  - 导出 `resolveOutputDir(base?): string`、`resolveUserDataDir(base?): string`、`resolveCacheDir(base?): string`。
  - 所有路径基于 `workspace-data/` 前缀。

- [ ] **1.2** 迁移 `@talent-scout/data-collector` 使用新路径
  - `src/index.ts`：`runCollect()` 输出目录改为 `workspace-data/output/raw/${timestamp}`。
  - `cache` 路径改为 `workspace-data/cache/github`。

- [ ] **1.3** 迁移 `@talent-scout/ai-evaluator` 使用新路径
  - `src/index.ts`：读取 `workspace-data/output/processed/latest`，写入 `workspace-data/output/evaluated/${timestamp}`。
  - ignore list 路径改为 `workspace-data/user-data/ignore-list.json`。

- [ ] **1.4** 迁移 `@talent-scout/shared` ignore-list 默认路径
  - `src/ignore-list.ts`：默认路径改为 `workspace-data/user-data/ignore-list.json`。

- [ ] **1.5** 迁移 `@talent-scout/skills`
  - `src/commands.ts`：所有路径使用 `workspace.ts` 提供的解析函数。
  - `src/query.ts`：使用 `resolveOutputDir()` 指向 `workspace-data/output/evaluated/latest`。

- [ ] **1.6** 迁移 `@talent-scout/dashboard`
  - `src/lib/file.ts`：`resolveOutputDir` / `resolveUserDataDir` 默认指向 `workspace-data/` 下的路径。

- [ ] **1.7** 更新所有相关测试，确保 `pnpm check` 通过。

## Phase 2: P1 — Dashboard 与 skills 真正共享查询层

**目标**：消除 Dashboard 页面和 skills query 模块直接读取 JSON 文件的代码，统一使用 `@talent-scout/ai-evaluator` 和 `@talent-scout/data-processor` 暴露的查询接口。

- [ ] **2.1** 重构 `packages/skills/src/query.ts`
  - 使用 `loadShortlist()` / `loadEvaluation()` / `loadRunStats()` 替代直接 `readFile(join(dir, 'shortlist.json'))`。

- [ ] **2.2** 重构 Dashboard 页面层使用查询接口
  - `pages/index.astro`：通过 `loadShortlist(outputDir)` 读取数据，不再直接拼接 `shortlist.json` 路径。
  - `pages/candidate/[username].astro`：通过 `loadEvaluation(outputDir)` 读取数据。
  - user-data 读写保留 `readJsonFile` / `writeJsonAtomic`（属于 Dashboard 自有域）。

- [ ] **2.3** 更新测试，确保 `pnpm check` 通过。

## Phase 3: P1 — 修复覆盖率门禁

**目标**：让 `pnpm test:coverage` 可以成功执行，并将覆盖率纳入 `pnpm check`。

- [ ] **3.1** 修复 Dashboard dist sourcemap 路径编码问题
  - 在 `vitest.config.ts` 的 coverage exclude 中排除 `**/dist/**`，避免 Vitest 尝试解析 Astro 构建产物的 sourcemap。

- [ ] **3.2** 将覆盖率纳入 `pnpm check`
  - 修改根 `package.json` 的 `check` 脚本，将 `pnpm test` 替换为 `pnpm test:coverage`。

- [ ] **3.3** 验证 `pnpm check` 通过（包含覆盖率检查）。

## Phase 4: P1 — Skills cron 命令对齐设计文档

**目标**：`talents.yaml` 中的 cron 命令应通过 `@talent-scout/skills` CLI 调度，而非直接调用各业务包。

- [ ] **4.1** 更新 `talents.yaml` 中的 cron 配置
  - `talent-collect` 命令改为调用 `pnpm --filter @talent-scout/skills run skill collect`。
  - `talent-process` 命令改为调用 `pnpm --filter @talent-scout/skills run skill process`。
  - `talent-evaluate` 命令改为调用 `pnpm --filter @talent-scout/skills run skill evaluate`。

- [ ] **4.2** 更新 `packages/skills/scripts/` 薄包装脚本
  - 确保 `collect.sh` / `process.sh` / `evaluate.sh` / `pipeline.sh` 调用 skills CLI 而非直接调用业务包。

- [ ] **4.3** 更新根 `package.json` 的 `pipeline` 脚本
  - 改为调用 `pnpm --filter @talent-scout/skills run skill pipeline`。

- [ ] **4.4** 确保 `pnpm check` 通过。

## Phase 5: P1 — 端到端集成测试：实际运行 skills

**目标**：在 `workspace-data/` 中实际运行 skills 的 collect → process → evaluate → query 全流程，验证功能可用。

- [ ] **5.1** 运行 `skills collect` 执行真实数据采集
- [ ] **5.2** 运行 `skills process` 执行数据处理
- [ ] **5.3** 运行 `skills evaluate` 执行 AI 评估
- [ ] **5.4** 运行 `skills query shortlist / candidate / stats` 验证查询
- [ ] **5.5** 运行 `skills cron status / sync` 验证 cron 管理
- [ ] **5.6** 启动 Dashboard 并验证页面功能
- [ ] **5.7** 修复在实际运行中发现的所有问题

