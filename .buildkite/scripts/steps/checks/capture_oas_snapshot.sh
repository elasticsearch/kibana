#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

.buildkite/scripts/bootstrap.sh
.buildkite/scripts/setup_es_snapshot_cache.sh

echo --- Capture OAS snapshot
cmd="node scripts/capture_oas_snapshot\
  --include-path /api/status \
  --include-path /api/alerting/rule/ \
  --include-path /api/alerting/rules \
  --include-path /api/actions \
  --include-path /api/security/role \
  --include-path /api/spaces \
  --include-path /api/streams \
  --include-path /api/fleet \
  --include-path /api/saved_objects \
  --include-path /api/maintenance_window \
  --include-path /api/agent_builder \
  --include-path /api/workflows \
  --include-path /api/dashboards \
  --include-path /api/visualizations \
  --include-path /api/tags \
  --include-path /api/security/entity_store"

run_check() {
  eval "$cmd"
}

retry 5 15 run_check
# Bundle hand written specs
.buildkite/scripts/steps/openapi_bundling/security_solution_openapi_bundling.sh
.buildkite/scripts/steps/openapi_bundling/final_merge.sh

node ./scripts/validate_oas_docs.js --assert-no-error-increase --skip-printing-issues --update-baseline

if is_pr && ! is_auto_commit_disabled; then
  check_for_changed_files "capture_oas_snapshot.sh" true
else
  check_for_changed_files "capture_oas_snapshot.sh" false
fi
