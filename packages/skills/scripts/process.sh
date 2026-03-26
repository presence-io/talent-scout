#!/usr/bin/env bash
# Thin wrapper: run data processing via skills CLI
set -euo pipefail
cd "$(dirname "$0")/../../.."
pnpm --filter @talent-scout/skills run skill process "$@"
