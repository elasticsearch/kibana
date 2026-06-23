#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/steps/functional/common.sh

CONFIG_PATHS=(
  "x-pack/solutions/security/plugins/security_solution/test/scout_cps_local/ui/playwright.config.ts"
  "x-pack/solutions/security/plugins/security_solution/test/scout_cps_local/api/playwright.config.ts"
  "x-pack/solutions/security/plugins/entity_store/test/scout_cps_local/api/playwright.config.ts"
)

echo "--- Cross Project Search (CPS) Tests"
echo "Server config set: cps_local (origin + linked ES clusters)"

EXIT_CODE=0
for CONFIG_PATH in "${CONFIG_PATHS[@]}"; do
  echo ""
  echo "--- Running CPS tests for $CONFIG_PATH"

  if ! node scripts/scout run-tests \
    --location local \
    --serverConfigSet cps_local \
    --arch serverless \
    --domain security_complete \
    --config "$CONFIG_PATH" \
    --kibanaInstallDir "$KIBANA_BUILD_LOCATION"; then
    echo "^^^ +++ FAILED: $CONFIG_PATH"
    EXIT_CODE=1
  fi
done

exit "$EXIT_CODE"
