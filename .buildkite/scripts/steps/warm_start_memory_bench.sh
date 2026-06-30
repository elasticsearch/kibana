#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

.buildkite/scripts/bootstrap.sh
.buildkite/scripts/setup_es_snapshot_cache.sh

echo '--- Warm-start memory bench (PR vs merge-base baseline build)'
ts-node .buildkite/scripts/steps/warm_start_memory_bench/run.ts
