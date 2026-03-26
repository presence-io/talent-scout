#!/usr/bin/env bash
# Thin wrapper: run AI evaluation
set -euo pipefail
cd "$(dirname "$0")/../../.."
pnpm --filter @talent-scout/ai-evaluator run evaluate "$@"
