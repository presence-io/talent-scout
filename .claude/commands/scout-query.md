Query talent-scout data. Accepts an optional argument for the query type.

Usage:
- `/scout-query shortlist` — Show the latest shortlist with top candidates
- `/scout-query candidate <username>` — Show details for a specific candidate
- `/scout-query stats` — Show historical run statistics

Steps:
1. Run `pnpm --filter @talent-scout/skills start query $ARGUMENTS`
2. Format the output as a readable summary
