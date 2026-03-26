#!/usr/bin/env bash
# Thin wrapper: run the full pipeline (collect → process → evaluate)
set -euo pipefail
cd "$(dirname "$0")/../../.."
pnpm pipeline
