#!/usr/bin/env bash
# Thin wrapper: run data collection
set -euo pipefail
cd "$(dirname "$0")/../../.."
pnpm --filter @talent-scout/data-collector run collect "$@"
