#!/usr/bin/env bash
set -euo pipefail

# Runs `node scripts/scout discover-flaky-tests` against the AppEx QA cluster and publishes the
# JSON report as a Buildkite artifact, linked from a short annotation on the build page.
#
# Every input is an env var so one pipeline can host several scheduled variants (e.g. flaky tests
# on kibana-on-merge, consistently failing tests on Cloud pipelines) by overriding them per
# schedule. Elasticsearch credentials come from Vault via .buildkite/scripts/common/setup_job_env.sh
# (SCOUT_REPORTER_ES_URL / SCOUT_REPORTER_ES_API_KEY), which the CLI reads by default.

source .buildkite/scripts/common/util.sh

# Ensure we're in the repo root
cd "${KIBANA_DIR:-$(pwd)}"

FLAKY_TESTS_PIPELINES="${FLAKY_TESTS_PIPELINES:-kibana-on-merge}"
FLAKY_TESTS_LOOKBACK_DAYS="${FLAKY_TESTS_LOOKBACK_DAYS:-7}"
FLAKY_TESTS_CLASSIFICATIONS="${FLAKY_TESTS_CLASSIFICATIONS:-flaky}"
# Optional; no filter when empty
FLAKY_TESTS_BRANCHES="${FLAKY_TESTS_BRANCHES:-}"
FLAKY_TESTS_FRAMEWORKS="${FLAKY_TESTS_FRAMEWORKS:-}"
# The agent PTY is 160 columns wide, but the build page log pane fits fewer once line numbers and
# timestamps are shown (about 130 on a laptop), so size the summary table explicitly.
FLAKY_TESTS_SUMMARY_WIDTH="${FLAKY_TESTS_SUMMARY_WIDTH:-140}"

REPORT_DIR="target/flaky_tests"
REPORT_PATH="$REPORT_DIR/flaky_tests.json"

echo "--- Bootstrap Kibana"
# The step only runs Node scripts; skip building the dev-mode shared webpack bundles
export KBN_BOOTSTRAP_NO_PREBUILT=true
.buildkite/scripts/bootstrap.sh

# `+++` expands this group by default so the log opens on the summary table
echo "+++ Discover flaky tests"
echo "    Pipelines       : $FLAKY_TESTS_PIPELINES"
echo "    Lookback (days) : $FLAKY_TESTS_LOOKBACK_DAYS"
echo "    Classifications : $FLAKY_TESTS_CLASSIFICATIONS"
echo "    Branches        : ${FLAKY_TESTS_BRANCHES:-any}"
echo "    Frameworks      : ${FLAKY_TESTS_FRAMEWORKS:-all}"

args=(
  --pipelines "$FLAKY_TESTS_PIPELINES"
  --lookbackDays "$FLAKY_TESTS_LOOKBACK_DAYS"
  --classifications "$FLAKY_TESTS_CLASSIFICATIONS"
  --outputPath "$REPORT_PATH"
  --summaryWidth "$FLAKY_TESTS_SUMMARY_WIDTH"
)
if [[ -n "$FLAKY_TESTS_BRANCHES" ]]; then
  args+=(--branches "$FLAKY_TESTS_BRANCHES")
fi
if [[ -n "$FLAKY_TESTS_FRAMEWORKS" ]]; then
  args+=(--frameworks "$FLAKY_TESTS_FRAMEWORKS")
fi

mkdir -p "$REPORT_DIR"
node scripts/scout discover-flaky-tests "${args[@]}"

echo "--- Upload flaky test report"
# Contract: check_flaky_test_issues.sh downloads this artifact by path. Update it if you rename
# the file.
buildkite-agent artifact upload "$REPORT_PATH"

echo "--- Annotate build"
# `summary.total*` are capped at `thresholds.maxTests` (applied to each classification separately),
# so show the cap next to each count to avoid reading a full list as the true total.
max_tests="$(jq -r '.thresholds.maxTests' "$REPORT_PATH")"
counts="**$(jq -r '.summary.totalFlaky' "$REPORT_PATH")** flaky (max ${max_tests})"
if [[ "$FLAKY_TESTS_CLASSIFICATIONS" == *consistently-failing* ]]; then
  counts+=" and **$(jq -r '.summary.totalConsistentlyFailing' "$REPORT_PATH")** consistently failing (max ${max_tests})"
fi

{
  echo "${counts} tests on \`${FLAKY_TESTS_PIPELINES}\` over the last ${FLAKY_TESTS_LOOKBACK_DAYS} days."
  echo
  echo "Report: <a href=\"artifact://${REPORT_PATH}\">${REPORT_PATH}</a>"
} | buildkite-agent annotate --style info --context flaky-test-report
