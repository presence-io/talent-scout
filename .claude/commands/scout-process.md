Run only the data processing stage of the talent-scout pipeline.

Steps:
1. Run `pnpm --filter @talent-scout/skills start process`
2. Report the candidate counts from `workspace-data/output/processed/latest/`
3. Show identity detection stats (total, identified Chinese, gray-area)
