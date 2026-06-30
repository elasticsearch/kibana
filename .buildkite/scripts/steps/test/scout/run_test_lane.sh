#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/steps/functional/common.sh

SCOUT_SERVER_LOG=".scout/server.log"
PLAYWRIGHT_BIN="./node_modules/.bin/playwright"

LOAD_IDS=()
PASSED_INDICES=""
PASSED=()
FAILED=()
SKIPPED=()
RETRY_SPEC_FILES=()

# Fail early if any of the given environment variable names are unset or empty
check_required_env_vars() {
  local missing=()

  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Missing required environment variables:"
    printf '  - %s\n' "${missing[@]}"
    exit 1
  fi
}

# Download the test lane loads artifact produced by uploadAllScoutTestLaneSteps()
download_test_lane_loads() {
  echo "--- Downloading test lane loads file"
  download_tmp_artifact "$SCOUT_TEST_LANE_LOADS_PATH" . "$BUILDKITE_BUILD_ID"
}

# Per-config, attempt-stamped artifact path for a config's failed-spec snapshot.
failed_specs_artifact_path() {
  local idx="$1" attempt="$2"
  local key="${BUILDKITE_STEP_KEY//[^a-zA-Z0-9_-]/_}"
  echo ".scout/failed-specs-${key}-${idx}-attempt-${attempt}.json"
}

# Per-config path for Playwright's JSON report; set via PLAYWRIGHT_JSON_OUTPUT_FILE so it resolves
# against this script's cwd rather than the config's directory.
json_report_path() {
  echo ".scout/test-results-${1}.json"
}

# After a config fails, persist its failed spec files so the next attempt can re-run only those.
# Spec-file level (not per-test) so state-sharing blocks (e.g. describe.serial) re-run together.
snapshot_failed_specs() {
  local idx="$1"

  local report
  report="$(json_report_path "$idx")"
  if [[ ! -f "$report" ]]; then
    echo "No $report produced for index $idx; whole config will re-run on retry"
    return
  fi

  # `|| true`: a non-zero jq exit (e.g. truncated report after a crash) must not abort the lane.
  local failed_specs
  failed_specs="$(jq -r '[.suites[]? | recurse(.suites[]?) | .specs[]? | select(.ok == false) | .file] | unique[]?' "$report" 2>/dev/null)" || true

  if [[ -z "$failed_specs" ]]; then
    echo "No failed spec files parsed for index $idx; whole config will re-run on retry"
    return
  fi

  local artifact_path
  artifact_path="$(failed_specs_artifact_path "$idx" "${BUILDKITE_RETRY_COUNT:-0}")"
  printf '%s\n' "$failed_specs" > "$artifact_path"
  # Best-effort: on upload failure the retry just re-runs the whole config.
  buildkite-agent artifact upload "$artifact_path" || echo "Failed to upload failed-specs snapshot for index $idx"
}

# On retry, load the previous attempt's failed spec files into RETRY_SPEC_FILES. Returns non-zero
# on any miss (first attempt, agent lost before snapshot, download failure) so we re-run the whole config.
restore_failed_specs() {
  local idx="$1"
  RETRY_SPEC_FILES=()

  local retry_count="${BUILDKITE_RETRY_COUNT:-0}"
  [[ "$retry_count" -gt 0 ]] || return 1

  local artifact_path
  artifact_path="$(failed_specs_artifact_path "$idx" "$(( retry_count - 1 ))")"

  # --include-retried-jobs: the snapshot was uploaded by the now-superseded previous attempt, whose
  # artifacts buildkite-agent excludes by default.
  if ! download_artifact "$artifact_path" . --include-retried-jobs >/dev/null 2>&1; then
    return 1
  fi
  [[ -f "$artifact_path" ]] || return 1

  mapfile -t RETRY_SPEC_FILES < "$artifact_path"
  [[ ${#RETRY_SPEC_FILES[@]} -gt 0 ]]
}

# Read the comma-separated list of previously passed load indices from Buildkite metadata
load_passed_indices() {
  PASSED_INDICES=$(buildkite-agent meta-data get "$PASSED_LOAD_INDICES_META_KEY" --default "" 2>/dev/null)

  if [[ -n "$PASSED_INDICES" ]]; then
    echo "Resuming: indices already passed: $PASSED_INDICES"
  fi
}

# Check if a load index was already marked as passed
has_load_index_passed() {
  local idx="$1"
  [[ ",$PASSED_INDICES," == *",$idx,"* ]]
}

# Append a load index to the passed list and persist it to Buildkite metadata
mark_index_passed() {
  local idx="$1"

  if [[ -z "$PASSED_INDICES" ]]; then
    PASSED_INDICES="$idx"
  else
    PASSED_INDICES="${PASSED_INDICES},${idx}"
  fi

  buildkite-agent meta-data set "$PASSED_LOAD_INDICES_META_KEY" "$PASSED_INDICES"
}

# Extract the load IDs (Scout test config paths) assigned to this lane from the loads file
read_load_ids() {
  mapfile -t LOAD_IDS < <(jq -r --arg key "$BUILDKITE_STEP_KEY" '.[$key].loadIDs[]' "$SCOUT_TEST_LANE_LOADS_PATH")

  if [[ ${#LOAD_IDS[@]} -eq 0 ]]; then
    echo "No test lane load IDs found for step key '$BUILDKITE_STEP_KEY'"
    exit 1
  fi

  echo "Found ${#LOAD_IDS[@]} test lane load(s) for step key '$BUILDKITE_STEP_KEY'"
}

# Uploads Scout test server logs as a Buildkite artifact
upload_test_server_log() {
  if [[ ! -f "$SCOUT_SERVER_LOG" ]]; then
    echo "No server log found at $SCOUT_SERVER_LOG, skipping upload"
    return
  fi

  echo "--- Uploading test server log"
  buildkite-agent artifact upload "$SCOUT_SERVER_LOG"
}

# Start the Scout test server in the background and wait for it to become ready
start_server() {
  local timeout_seconds="$1"
  mkdir -p "$(dirname "$SCOUT_SERVER_LOG")"

  echo "--- Starting test server (timeout: ${timeout_seconds}s)"

  node scripts/scout start-server \
    --location "$SCOUT_TEST_TARGET_LOCATION" \
    --arch "$SCOUT_TEST_TARGET_ARCH" \
    --domain "$SCOUT_TEST_TARGET_DOMAIN" \
    --serverConfigSet "$SCOUT_TEST_SERVER_CONFIG_SET" \
    --kibanaInstallDir "$KIBANA_BUILD_LOCATION" \
    > "$SCOUT_SERVER_LOG" 2>&1 &
  SCOUT_SERVER_PID=$!

  local ready_marker="Elasticsearch and Kibana are ready for functional testing"

  for _ in $(seq 1 "$timeout_seconds"); do
    if grep -q "$ready_marker" "$SCOUT_SERVER_LOG" 2>/dev/null; then
      echo "Test server is ready (PID: $SCOUT_SERVER_PID)"
      return
    fi
    if ! kill -0 "$SCOUT_SERVER_PID" 2>/dev/null; then
      echo "Test server exited unexpectedly. Last 50 lines of log:"
      tail -n 50 "$SCOUT_SERVER_LOG" 2>/dev/null || true
      wait "$SCOUT_SERVER_PID" || true
      upload_test_server_log
      exit 1
    fi
    sleep 1
  done

  echo "Timed out waiting for test server to be ready. Last 50 lines of log:"
  tail -n 50 "$SCOUT_SERVER_LOG" 2>/dev/null || true
  upload_test_server_log
  exit 1
}

# Stop the test server if it's still running
stop_server() {
  if [[ -n "${SCOUT_SERVER_PID:-}" ]] && kill -0 "$SCOUT_SERVER_PID" 2>/dev/null; then
    echo "--- Stopping test server (PID: $SCOUT_SERVER_PID)"
    kill "$SCOUT_SERVER_PID" 2>/dev/null || true
    wait "$SCOUT_SERVER_PID" 2>/dev/null || true
  fi

  if [[ ${#FAILED[@]} -gt 0 ]]; then
    upload_test_server_log
  fi
}

# Run Playwright tests for a single config and categorize the result as passed or failed
run_scout_tests() {
  local idx="$1"
  local config_path="$2"

  # On retry, re-run only the previously-failed spec files (passed as positional path filters).
  local spec_filter_args=()
  if restore_failed_specs "$idx"; then
    echo "--- Retrying ${#RETRY_SPEC_FILES[@]} failed spec file(s): $config_path"
    printf '  %s\n' "${RETRY_SPEC_FILES[@]}"
    spec_filter_args=("${RETRY_SPEC_FILES[@]}")
  else
    echo "--- Running: $config_path"
  fi

  local pw_args=(
    test
    "${spec_filter_args[@]+"${spec_filter_args[@]}"}"
    "--config=$config_path"
    "--grep=$PLAYWRIGHT_GREP_TAG"
    "--project=$PLAYWRIGHT_PROJECT"
  )

  local pw_env=(
    "SCOUT_TARGET_LOCATION=$SCOUT_TEST_TARGET_LOCATION"
    "SCOUT_TARGET_ARCH=$SCOUT_TEST_TARGET_ARCH"
    "SCOUT_TARGET_DOMAIN=$SCOUT_TEST_TARGET_DOMAIN"
    "NODE_OPTIONS=${NODE_OPTIONS:-} --require=@kbn/babel-register/install"
    # Pin the JSON report to a path we control (see json_report_path).
    "PLAYWRIGHT_JSON_OUTPUT_FILE=$(json_report_path "$idx")"
  )

  local start_time
  start_time=$(date +%s)

  set +e
  env "${pw_env[@]}" "$PLAYWRIGHT_BIN" "${pw_args[@]}"
  local exit_code=$?
  set -e

  local elapsed=$(( $(date +%s) - start_time ))
  local duration
  if [[ $elapsed -ge 60 ]]; then
    duration="$(( elapsed / 60 ))m $(( elapsed % 60 ))s"
  else
    duration="${elapsed}s"
  fi

  case $exit_code in
    0)
      upload_report_events "$config_path"
      mark_index_passed "$idx"
      PASSED+=("$config_path ($duration)")
      ;;
    *)
      upload_report_events "$config_path"
      snapshot_failed_specs "$idx"
      FAILED+=("$config_path")
      echo "Exited with code $exit_code for $config_path"
      ;;
  esac
}

# Upload Scout reporter events and clean up event reports, preserving failure reports
upload_report_events() {
  local config_path="$1"

  if [[ ! "${SCOUT_REPORTER_ENABLED:-}" =~ ^(1|true|yes)$ ]]; then
    return
  fi

  if [[ ! -d ".scout/reports" ]] || [[ -z "$(ls -A .scout/reports 2>/dev/null)" ]]; then
    echo "No Scout reports found for $config_path"
    return
  fi

  echo "~~~ Uploading report events: $config_path"

  set +e
  node scripts/scout upload-events --dontFailOnError
  local exit_code=$?
  set -e

  if [[ $exit_code -ne 0 ]]; then
    echo "Upload failed for $config_path (exit code $exit_code)"
  fi

  # Clean up event reports to avoid double ingestion, preserving failure reports for annotations
  for dir in .scout/reports/scout-playwright-*; do
    if [[ -d "$dir" ]] && [[ "$dir" != *"scout-playwright-test-failures-"* ]]; then
      rm -rf "$dir"
    fi
  done
}

# Return the final status of a config path based on the run results
get_config_status() {
  local config="$1" s
  for s in "${SKIPPED[@]+"${SKIPPED[@]}"}"; do [[ "$s" == "$config" ]] && echo "skipped" && return; done
  for s in "${PASSED[@]+"${PASSED[@]}"}"; do [[ "$s" == "$config"* ]] && echo "passed" && return; done
  for s in "${FAILED[@]+"${FAILED[@]}"}"; do [[ "$s" == "$config" ]] && echo "failed" && return; done
  echo "unknown"
}

display_test_load_ids_in_order_of_execution() {
  local load_count=${#LOAD_IDS[@]}
  local idx_width=${#load_count}
  local idx_sep
  idx_sep=$(printf '%*s' "$idx_width" '' | tr ' ' '-')
  printf '  %*s  %-7s  %s\n' "$idx_width" "#" "Status" "Config"
  printf '  %*s  %-7s  %s\n' "$idx_width" "$idx_sep" "-------" "------"
  local i
  for i in "${!LOAD_IDS[@]}"; do
    local config="${LOAD_IDS[$i]}"
    local status
    status=$(get_config_status "$config")
    printf '  %*d  %-7s  %s\n' "$idx_width" "$((i+1))" "$status" "$config"
  done
}

# Print a summary of test results
print_summary() {
  echo "+++ Lane summary"
  echo "Test server configuration:"
  echo "  Arch: $SCOUT_TEST_TARGET_ARCH"
  echo "  Domain: $SCOUT_TEST_TARGET_DOMAIN"
  echo "  Server config set: $SCOUT_TEST_SERVER_CONFIG_SET"
  echo ""
  echo "Test count by status:"
  [[ ${#PASSED[@]}   -gt 0 ]] && echo "✅  Passed: ${#PASSED[@]}"
  [[ ${#FAILED[@]}   -gt 0 ]] && echo "❌  Failed: ${#FAILED[@]}"
  [[ ${#SKIPPED[@]}  -gt 0 ]] && echo "⏩️ Skipped: ${#SKIPPED[@]}"
  echo ""
  echo "Test loads ran in the following order:"
  echo ""
  display_test_load_ids_in_order_of_execution
  echo ""
}

#
# MAIN SCRIPT WORKFLOW
#
check_required_env_vars \
  BUILDKITE_STEP_KEY \
  SCOUT_TEST_LANE_LOADS_PATH \
  SCOUT_TEST_TARGET_LOCATION \
  SCOUT_TEST_TARGET_ARCH \
  SCOUT_TEST_TARGET_DOMAIN \
  SCOUT_TEST_SERVER_CONFIG_SET \
  SCOUT_TEST_SERVER_START_TIMEOUT_SECONDS \
  KIBANA_BUILD_LOCATION

PASSED_LOAD_INDICES_META_KEY="${BUILDKITE_STEP_KEY}_passed"
PLAYWRIGHT_GREP_TAG="@${SCOUT_TEST_TARGET_LOCATION}-${SCOUT_TEST_TARGET_ARCH}-${SCOUT_TEST_TARGET_DOMAIN}"
PLAYWRIGHT_PROJECT="local"

download_test_lane_loads
read_load_ids
load_passed_indices

trap stop_server EXIT
start_server "$SCOUT_TEST_SERVER_START_TIMEOUT_SECONDS"

for i in "${!LOAD_IDS[@]}"; do
  config_path="${LOAD_IDS[$i]}"

  if has_load_index_passed "$i"; then
    SKIPPED+=("$config_path")
    echo "~~~ Skipping (already passed): $config_path"
    continue
  fi

  run_scout_tests "$i" "$config_path"
done

print_summary

if [[ ${#FAILED[@]} -gt 0 ]]; then
  # Track how many lane attempts ended with real test failures (exit 10).
  # Agent-lost retries (exit -1) never reach this block, so they don't bump the counter.
  # post_command.sh uses this counter to skip GitHub issue updates until the same lane
  # has failed in at least 2 attempts of the current build.
  if [[ -n "${BUILDKITE_STEP_KEY:-}" ]]; then
    SCOUT_FAILURE_COUNT_KEY="${BUILDKITE_STEP_KEY}_scout_failure_count"
    PREV_SCOUT_FAILURE_COUNT=$(buildkite-agent meta-data get "$SCOUT_FAILURE_COUNT_KEY" --default "0" 2>/dev/null || echo 0)
    NEXT_SCOUT_FAILURE_COUNT=$((PREV_SCOUT_FAILURE_COUNT + 1))
    buildkite-agent meta-data set "$SCOUT_FAILURE_COUNT_KEY" "$NEXT_SCOUT_FAILURE_COUNT"
  fi
  exit 10
fi
