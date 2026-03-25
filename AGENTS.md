# AI Talent Scout

## 质量要求

所有代码修改必须通过 `pnpm check`（typecheck + lint + format + test）才能被接受。
测试覆盖率不低于 90%。

## 临时文件

Agent 必须将临时的工具脚本和文件信息写入 `.agent/` 目录，不得放到项目其他目录。

## 项目结构

PNPM monorepo，所有业务代码在 `packages/` 下，详见 [02-architecture §3](docs/02-architecture.md)。

## 配置

- 统一配置文件：`$PWD/talents.yaml`
- 详见 [07-data-model §5](docs/07-data-model.md)

## 子项目快速参考

| 包 | 职责 | 详细设计 |
|---|------|----------|
| @talent-scout/shared | 类型、配置、API 封装 | [02-architecture §3](docs/02-architecture.md) |
| @talent-scout/data-collector | 数据采集 | [03-data-sources](docs/03-data-sources.md) |
| @talent-scout/data-processor | 去重、身份识别、评分 | [04-identity](docs/04-identity.md)、[05-evaluation](docs/05-evaluation.md) |
| @talent-scout/ai-evaluator | AI 评估 | [06-openclaw](docs/06-openclaw.md) |
| @talent-scout/dashboard | 可视化展示 | [08-dashboard](docs/08-dashboard.md) |
