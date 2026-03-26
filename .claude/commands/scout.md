Run the talent-scout pipeline: collect → process → evaluate.

Steps:
1. Run `pnpm --filter @talent-scout/skills start pipeline`
2. Report the shortlist summary from `workspace-data/output/evaluated/latest/shortlist.json`
3. Highlight top 5 candidates with recommended_action = "reach_out"
