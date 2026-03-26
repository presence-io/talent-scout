#!/usr/bin/env bash
# Thin wrapper: run data processing
set -euo pipefail
cd "$(dirname "$0")/../../.."
pnpm --filter @talent-scout/data-processor run process "$@"
