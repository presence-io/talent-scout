---
name: talent-scout
description: >
  AI Talent Scout — Discover excellent Chinese developers in the AI Coding era.
  Provides automated collection, processing, evaluation, and querying of developer talent data.
version: 0.1.0
---

# Talent Scout Skill

Unified skill entry for the AI Talent Scout system. This skill exposes collection,
processing, evaluation, and querying capabilities through a single command surface,
suitable for OpenClaw agent scheduling and ClawHub distribution.

## Commands

### Pipeline

- **collect** — Run data collection from GitHub signals, community repos, and stargazers.
- **process** — Merge, deduplicate, identify, and score collected candidates.
- **evaluate** — Run AI-assisted evaluation on processed candidates.
- **pipeline** — Run the full collect → process → evaluate pipeline.

### Query

- **query shortlist** — List the current shortlist of evaluated candidates.
- **query candidate `<username>`** — Show details for a specific candidate.
- **query stats** — Show run statistics and distributions.

### Cron

- **cron status** — Show configured cron jobs.
- **cron sync** — Sync cron jobs to OpenClaw.

## Data Flow

```
GitHub API → data-collector → output/raw/
  → data-processor → output/processed/
  → ai-evaluator → output/evaluated/
  → dashboard / skills query
```

## Configuration

All configuration is centralized in `talents.yaml` at the project root.

## References

- [Architecture](references/architecture.md)
- [Data Sources](references/data-sources.md)
- [Identity Detection](references/identity.md)
- [Evaluation Model](references/evaluation.md)
