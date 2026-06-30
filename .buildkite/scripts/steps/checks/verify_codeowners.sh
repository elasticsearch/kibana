#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

echo --- Verify CODEOWNERS

if is_pr && ! is_auto_commit_disabled && [[ "$BUILDKITE_PULL_REQUEST_BASE_BRANCH" == "main" ]]; then
  node scripts/generate codeowners
  check_for_changed_files "node scripts/generate codeowners" true

  echo --- Verify CODEOWNERS Teams
  ts-node .buildkite/scripts/steps/checks/verify_codeowners_teams.ts
else
  echo "CODEOWNERS is only verified for PRs targeting main, skipping check."
  exit 0
fi
