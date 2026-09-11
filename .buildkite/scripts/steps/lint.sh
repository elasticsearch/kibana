#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

.buildkite/scripts/bootstrap.sh

echo '--- Lint: stylelint'
node scripts/stylelint
echo "stylelint ✅"

# disable "Exit immediately" mode so that we can run oxlint and eslint, capture their exit codes,
# and respond appropriately after possibly commiting fixed files to the repo.
# oxlint runs first so that eslint (prettier) formats any oxlint autofixes in the same pass.
set +e;
if is_pr && ! is_auto_commit_disabled; then
  fix_flag="--fix"
else
  fix_flag=""
fi

echo '--- Lint: oxlint'
node scripts/lint.js $fix_flag
oxlint_exit=$?

echo '--- Lint: eslint'
node scripts/eslint_all_files --no-cache $fix_flag
eslint_exit=$?
# re-enable "Exit immediately" mode
set -e;

desc="node scripts/lint.js $fix_flag && node scripts/eslint_all_files --no-cache $fix_flag"
check_for_changed_files "$desc" true

if [[ "${oxlint_exit}" != "0" ]]; then
  echo "oxlint ❌"
fi
if [[ "${eslint_exit}" != "0" ]]; then
  echo "eslint ❌"
fi
if [[ "${oxlint_exit}" != "0" || "${eslint_exit}" != "0" ]]; then
  exit 1
fi

echo "oxlint ✅"
echo "eslint ✅"
