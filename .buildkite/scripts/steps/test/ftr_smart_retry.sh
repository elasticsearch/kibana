# Sourced by ftr_configs.sh — do not execute directly.
# Reads/writes globals: exitCode, failedConfigs,
# FAILED_CONFIGS_KEY, JOB, BUILDKITE_RETRY_COUNT.

FAILED_TESTS_KEY="${BUILDKITE_STEP_ID}${FTR_CONFIG_GROUP_KEY}_failed_tests"
retry_recovered=false

smart_retry_applicable() {
  [[ -z "${KIBANA_FLAKY_TEST_RUNNER_CONFIG:-}" ]] \
    && [[ "$exitCode" != 0 ]] \
    && [[ "${FTR_SMART_RETRY_ENABLED:-}" =~ ^(1|true)$ ]]
}

store_failing_tests() {
  local junitDir="target/junit/$JOB"
  [[ -d "$junitDir" ]] || return

  local failedTestNames
  failedTestNames=$(node scripts/ftr_check_retry_result collect-results --type failures --junit-dir "$junitDir" || true)
  if [[ "$failedTestNames" ]]; then
    buildkite-agent meta-data set "$FAILED_TESTS_KEY" "$failedTestNames"
    echo "Stored $(echo "$failedTestNames" | wc -l | tr -d ' ') previously-failing test name(s) for retry evaluation"
  fi
}

apply_smart_retry() {
  local retryCount="${BUILDKITE_RETRY_COUNT:-0}"

  if [[ "$retryCount" -ge "2" ]]; then
    echo "--- [smart-retry] inactive on attempt $((retryCount + 1)) — only applies to the first automatic retry"
    return
  fi

  local prevFailedTests
  prevFailedTests=$(buildkite-agent meta-data get "$FAILED_TESTS_KEY" --default '' 2>/dev/null || true)
  [[ "$prevFailedTests" ]] || return

  local junitDir="target/junit/$JOB"

  local currentPassed
  currentPassed=$(node scripts/ftr_check_retry_result collect-results --type passes --junit-dir "$junitDir" 2>/dev/null || true)

  local notRecovered
  notRecovered=$(comm -23 <(echo "$prevFailedTests" | sort) <(echo "$currentPassed" | sort))

  if [[ -z "$notRecovered" ]]; then
    echo "--- [smart-retry] All previously-failing tests recovered on retry — marking step green"
    exitCode=0
    failedConfigs=""
    retry_recovered=true
    buildkite-agent meta-data set "$FAILED_CONFIGS_KEY" "" 2>/dev/null || true
  fi
}
