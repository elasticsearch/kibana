#!/usr/bin/env bash

set -euo pipefail

# NOTE: Keep this Buildkite *step* script mostly bash + orchestration.
# - If you need non-trivial logic (parsing/transforming JSON, label/model selection, connector merging, etc),
#   put it in a standalone script under `x-pack/platform/packages/shared/kbn-evals/scripts/ci/`
#   and call it from here (see `get_connector_ids.js`, `merge_ai_connectors.js`, `generate_eis_connectors.js`).
# - Avoid inline `node - <<'NODE'` heredocs in this file; ops/reviewers will ask to extract them anyway.

EVAL_SUITE_ID="${EVAL_SUITE_ID:-}"
if [[ -z "$EVAL_SUITE_ID" ]]; then
  echo "EVAL_SUITE_ID is required"
  exit 1
fi

# Tag inference traffic with `X-Elastic-Product-Use-Case` (forwarded from inference connector telemetry).
# The value should be the platform-level `pluginId` use-case identifier.
# `@kbn/evals` defaults this to `kbn_evals`, but you can override via KBN_EVALS_TELEMETRY_PLUGIN_ID.

# Set a base build run ID from the Buildkite build. This is used as a seed for
# generating deterministic per-task experiment IDs (not as the experiment_id itself).
# Suite-run grouping in the UI uses metadata.ci.build_id which is populated
# automatically from BUILDKITE_BUILD_ID in the Buildkite metadata.
if [[ -z "${TEST_RUN_ID:-}" ]] && [[ -n "${BUILDKITE_BUILD_ID:-}" ]]; then
  export TEST_RUN_ID="bk-${BUILDKITE_BUILD_ID}"
fi

# Bootstrap workspace deps + download build artifacts (same setup as FTR/Scout CI steps)
source .buildkite/scripts/steps/functional/common.sh

# TODO: revert before merge — always skip golden-cluster writes for notify testing.
# Skip golden-cluster writes (scores/traces). Keeps golden reads (EVALUATIONS_KBN_*) and GCS snapshots.
echo "--- Skipping golden-cluster export; dataset reads and GCS snapshots unchanged"
unset EVALUATIONS_ES_URL EVALUATIONS_ES_API_KEY
unset TRACING_ES_URL TRACING_ES_API_KEY TRACING_EXPORTERS
export KBN_EVALS_SKIP_PREFLIGHT_EXPORT=true

EVAL_SUITE_INFO="$(
  node x-pack/platform/packages/shared/kbn-evals/scripts/ci/get_suite_info.js "$EVAL_SUITE_ID" || true
)"
EVAL_SUITE_NAME="$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r '.name // empty' 2>/dev/null || true)"
EVAL_SUITE_SLACK_CHANNEL="$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r '.slackChannel // empty' 2>/dev/null || true)"

cleanup() {
  if [[ -n "${SCOUT_PID:-}" ]]; then
    kill "$SCOUT_PID" 2>/dev/null || true
  fi
  if [[ -n "${FANOUT_PIPELINE_FILE:-}" ]]; then
    rm -f "$FANOUT_PIPELINE_FILE" 2>/dev/null || true
  fi
}

record_suite_failure() {
  local exit_status="$1"
  if [[ "$exit_status" -eq 0 ]]; then
    return 0
  fi
  if [[ "${KBN_EVALS:-}" != "1" ]]; then
    return 0
  fi
  if [[ -z "${EVAL_SUITE_ID:-}" || -z "${EVAL_PROJECT:-}" ]]; then
    return 0
  fi
  if ! command -v buildkite-agent >/dev/null 2>&1; then
    return 0
  fi

  local suite_key_safe
  suite_key_safe="$(printf '%s' "$EVAL_SUITE_ID" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"
  local project_key_safe
  project_key_safe="$(printf '%s' "$EVAL_PROJECT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"

  # Use one key per failing project to avoid non-atomic read/modify/write races when fanout steps fail concurrently.
  local failure_key="kbn-evals:suite-failures:${suite_key_safe}:${project_key_safe}"
  buildkite-agent meta-data set "$failure_key" "${EVAL_PROJECT}" >/dev/null 2>&1 || true

  local failure_log_key="kbn-evals:suite-failure-log:${suite_key_safe}:${project_key_safe}"
  if [[ -n "${KBN_EVALS_RUN_LOG:-}" && -f "${KBN_EVALS_RUN_LOG}" ]]; then
    local excerpt
    excerpt="$(
      tail -c 4000 "${KBN_EVALS_RUN_LOG}" | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' || true
    )"
    if [[ -n "${excerpt}" ]]; then
      buildkite-agent meta-data set "$failure_log_key" "${excerpt}" >/dev/null 2>&1 || true
    fi
  fi
}

on_exit() {
  local exit_status=$?
  trap - EXIT
  cleanup
  record_suite_failure "$exit_status"
  exit "$exit_status"
}

trap on_exit EXIT

# Generate LiteLLM connectors (or skip when only EIS models are requested).
# This must run after bootstrap so Node is available for the generator script.
source .buildkite/scripts/steps/evals/setup_connectors.sh

# Fan out into one Buildkite step per connector project when requested.
# This is the only practical way to run all connector projects within the 1h job timeout.
EVAL_FANOUT="${EVAL_FANOUT:-}"
EVAL_PROJECT="${EVAL_PROJECT:-}"
EVAL_FANOUT_CONCURRENCY="${EVAL_FANOUT_CONCURRENCY:-4}"

# Optional: extend eval connectors with EIS models (Elastic Inference Service).
# This is intentionally done here (post-bootstrap) so Node scripts can import repo packages if needed.
if [[ "${FTR_EIS_CCM:-}" =~ ^(1|true)$ ]]; then
  NEED_EIS_CONNECTORS="false"
  if [[ "${EVAL_INCLUDE_EIS_MODELS:-}" =~ ^(1|true)$ ]]; then
    NEED_EIS_CONNECTORS="true"
  fi
  # Fanout child steps only need EIS connectors when running an EIS project.
  if [[ -n "${EVAL_PROJECT:-}" ]] && [[ "${EVAL_PROJECT}" == eis-* ]]; then
    NEED_EIS_CONNECTORS="true"
  fi
  # If the judge connector is EIS-backed, we still need EIS connectors even when running a LiteLLM project.
  if [[ -n "${EVALUATION_CONNECTOR_ID:-}" ]] && [[ "${EVALUATION_CONNECTOR_ID}" == eis-* ]]; then
    NEED_EIS_CONNECTORS="true"
  fi

  if [[ "${NEED_EIS_CONNECTORS}" == "true" ]]; then
    if [[ -z "${KIBANA_EIS_CCM_API_KEY:-}" ]]; then
      echo "FTR_EIS_CCM was set but KIBANA_EIS_CCM_API_KEY is missing"
      exit 1
    fi

    echo "--- Discovering EIS models for eval connectors"
    node scripts/discover_eis_models.js

    echo "--- Generating EIS connectors"
    EIS_CONNECTORS_B64="$(
      node x-pack/platform/packages/shared/kbn-evals/scripts/ci/generate_eis_connectors.js
    )"

    export EIS_CONNECTORS_B64

    echo "--- Merging LiteLLM + EIS connectors"
    export KIBANA_TESTING_AI_CONNECTORS="$(
      node x-pack/platform/packages/shared/kbn-evals/scripts/ci/merge_ai_connectors.js
    )"
  fi
fi

if [[ "${EVAL_FANOUT:-}" == "1" ]] && [[ -z "${EVAL_PROJECT:-}" ]]; then
  if ! command -v buildkite-agent >/dev/null 2>&1; then
    echo "EVAL_FANOUT=1 requires buildkite-agent; falling back to running all projects in-process"
  else
    CONNECTOR_IDS="$(node x-pack/platform/packages/shared/kbn-evals/scripts/ci/get_connector_ids.js)"

    if [[ -z "${CONNECTOR_IDS:-}" ]]; then
      echo "No connectors found in KIBANA_TESTING_AI_CONNECTORS; falling back to evaluation connector only"
      if [[ -n "${EVALUATION_CONNECTOR_ID:-}" ]]; then
        export EVAL_PROJECT="${EVALUATION_CONNECTOR_ID}"
      fi
    else
      echo "--- Uploading eval connector fanout steps"

      # Buildkite YAML fragment (steps only) uploaded dynamically.
      # NOTE: we re-invoke this script with EVAL_FANOUT=0 and EVAL_PROJECT=<connector-id>
      # to avoid recursive fanout.
      group_key_safe="$(printf '%s' "$EVAL_SUITE_ID" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"

      # NOTE: Avoid building YAML via command substitution, because it strips trailing newlines.
      # That can accidentally concatenate lines (producing invalid YAML) when appending blocks.
      FANOUT_PIPELINE_FILE="$(mktemp -t kbn-evals-fanout.XXXXXX.yml)"
      cat >"$FANOUT_PIPELINE_FILE" <<EOF
steps:
  - group: "LLM Evals: ${EVAL_SUITE_ID}"
    key: "kbn-evals-${group_key_safe}-fanout"
    steps:
EOF

      fanout_step_keys=()
      while IFS= read -r connector_id; do
        [[ -z "$connector_id" ]] && continue
        key_safe="$(printf '%s' "$connector_id" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"
        step_key="kbn-evals-${group_key_safe}-${key_safe}"
        fanout_step_keys+=("$step_key")

        # Default BK step timeout is 120m to allow slower models/suites without
        # needing per-suite/per-model special-casing. Can be overridden if needed.
        timeout_in_minutes="${EVAL_STEP_TIMEOUT_IN_MINUTES:-120}"

        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
      - label: "LLM Evals: ${EVAL_SUITE_ID} / ${connector_id}"
        key: "${step_key}"
        command: "bash .buildkite/scripts/steps/evals/run_suite.sh"
        env:
          KBN_EVALS: "1"
          KBN_EVALS_WEEKLY: "${KBN_EVALS_WEEKLY:-}"
          FTR_EIS_CCM: "${FTR_EIS_CCM:-}"
          EVAL_INCLUDE_EIS_MODELS: "${EVAL_INCLUDE_EIS_MODELS:-}"
          EVAL_MODEL_GROUPS: "${EVAL_MODEL_GROUPS:-}"
          EVALUATION_CONNECTOR_ID: "${EVALUATION_CONNECTOR_ID:-}"
          EVAL_SUITE_ID: "${EVAL_SUITE_ID}"
          EVAL_SUITE_NAME: "${EVAL_SUITE_NAME:-}"
          EVAL_SUITE_SLACK_CHANNEL: "${EVAL_SUITE_SLACK_CHANNEL:-}"
          EVAL_PROJECT: "${connector_id}"
          EVAL_FANOUT: "0"
          TEST_RUN_ID: "${TEST_RUN_ID:-}"
          EVAL_SERVER_CONFIG_SET: "${EVAL_SERVER_CONFIG_SET:-}"
          EVAL_GREP: "${EVAL_GREP:-}"
          EVALUATION_REPETITIONS: "${EVALUATION_REPETITIONS:-}"
        timeout_in_minutes: ${timeout_in_minutes}
        concurrency_group: "kbn-evals-${group_key_safe}"
        concurrency: ${EVAL_FANOUT_CONCURRENCY}
        agents:
          image: family/kibana-ubuntu-2404
          imageProject: elastic-images-prod
          provider: gcp
          machineType: n2-standard-8
          preemptible: true
        retry:
          automatic:
            - exit_status: "-1"
              limit: 3
EOF
      done <<<"$CONNECTOR_IDS"

      # Resolve a PR number (if any) so triage can be posted as a PR comment:
      # GITHUB_PR_NUMBER (PR-label CI) -> BUILDKITE_PULL_REQUEST -> refs/pull/<N>/head
      # branch (how on-demand selects a PR via the New Build form).
      resolved_pr_number=""
      if [[ -n "${GITHUB_PR_NUMBER:-}" ]]; then
        resolved_pr_number="${GITHUB_PR_NUMBER}"
      elif [[ -n "${BUILDKITE_PULL_REQUEST:-}" && "${BUILDKITE_PULL_REQUEST}" != "false" ]]; then
        resolved_pr_number="${BUILDKITE_PULL_REQUEST}"
      elif [[ "${BUILDKITE_BRANCH:-}" =~ ^refs/pull/([0-9]+)/head$ ]]; then
        resolved_pr_number="${BASH_REMATCH[1]}"
      fi

      # Enable the suite owner notify step when there is somewhere to send triage:
      # - weekly: the suite's team channel
      # - any run: a PR comment (PR context) or EVAL_SLACK_NOTIFICATION_CHANNEL
      enable_suite_owner_notify="false"
      if [[ "${KBN_EVALS_WEEKLY:-}" =~ ^(1|true)$ ]] && [[ -n "${EVAL_SUITE_SLACK_CHANNEL:-}" ]]; then
        enable_suite_owner_notify="true"
      elif [[ -n "${resolved_pr_number}" ]]; then
        enable_suite_owner_notify="true"
      elif [[ -n "${EVAL_SLACK_NOTIFICATION_CHANNEL:-}" ]]; then
        enable_suite_owner_notify="true"
      fi

      if [[ "${enable_suite_owner_notify}" == "true" ]]; then
        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
      - label: "LLM Evals: ${EVAL_SUITE_ID} (suite owner notify)"
        key: "kbn-evals-${group_key_safe}-suite-owner-notify"
        command: "bash .buildkite/scripts/steps/evals/suite_owner_notify.sh"
        env:
          KBN_EVALS: "1"
          KBN_EVALS_WEEKLY: "${KBN_EVALS_WEEKLY:-}"
          EVAL_SUITE_ID: "${EVAL_SUITE_ID}"
          EVAL_SUITE_SLACK_CHANNEL: "${EVAL_SUITE_SLACK_CHANNEL:-}"
          EVAL_SLACK_NOTIFICATION_CHANNEL: "${EVAL_SLACK_NOTIFICATION_CHANNEL:-}"
          EVAL_PR_NUMBER: "${resolved_pr_number}"
          EVAL_SUITE_NAME: "${EVAL_SUITE_NAME:-}"
        depends_on:
EOF
        for key in "${fanout_step_keys[@]}"; do
          printf '          - "%s"\n' "$key" >>"$FANOUT_PIPELINE_FILE"
        done

        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
        timeout_in_minutes: 10
        allow_dependency_failure: true
        soft_fail: true
        agents:
          image: family/kibana-ubuntu-2404
          imageProject: elastic-images-prod
          provider: gcp
          machineType: n2-standard-2
          preemptible: true
EOF
      fi

      if ! buildkite-agent pipeline upload "$FANOUT_PIPELINE_FILE"; then
        echo "Fanout pipeline upload failed. Dumping generated YAML with line numbers:"
        nl -ba "$FANOUT_PIPELINE_FILE" || true
        exit 1
      fi
      echo "Fanout uploaded. Exiting parent step."
      exit 0
    fi
  fi
fi

# Start Scout server in background (run Kibana from the distributable)
SCOUT_SERVER_ARGS=(start-server --location local --arch stateful --domain classic --kibanaInstallDir "${KIBANA_BUILD_LOCATION:?}")
if [[ -n "${EVAL_SERVER_CONFIG_SET:-}" ]]; then
  SCOUT_SERVER_ARGS+=(--serverConfigSet "$EVAL_SERVER_CONFIG_SET")
else
  SCOUT_SERVER_ARGS+=(--serverConfigSet evals_tracing)
fi

node scripts/scout "${SCOUT_SERVER_ARGS[@]}" &
SCOUT_PID=$!

# Wait for Scout to write servers config (and fail fast if the Scout server process exits)
for _ in {1..60}; do
  if [[ -f .scout/servers/local.json ]]; then
    break
  fi
  if ! kill -0 "$SCOUT_PID" 2>/dev/null; then
    echo "Scout server exited before writing .scout/servers/local.json"
    wait "$SCOUT_PID" || true
    exit 1
  fi
  sleep 1
done

if [[ ! -f .scout/servers/local.json ]]; then
  echo "Timed out waiting for .scout/servers/local.json"
  exit 1
fi

# Enable EIS Cloud Connected Mode (CCM) on the Scout ES cluster so EIS-backed
# inference endpoints are available for `.inference` connectors.
if [[ "${FTR_EIS_CCM:-}" =~ ^(1|true)$ ]]; then
  NEED_EIS_RUNTIME="false"
  if [[ -n "${EVAL_PROJECT:-}" ]] && [[ "${EVAL_PROJECT}" == eis-* ]]; then
    NEED_EIS_RUNTIME="true"
  fi
  if [[ -n "${EVALUATION_CONNECTOR_ID:-}" ]] && [[ "${EVALUATION_CONNECTOR_ID}" == eis-* ]]; then
    NEED_EIS_RUNTIME="true"
  fi
  if [[ "${EVAL_MODEL_GROUPS:-}" == *"eis/"* ]]; then
    NEED_EIS_RUNTIME="true"
  fi

  if [[ "${NEED_EIS_RUNTIME}" != "true" ]]; then
    echo "EIS CCM enabled but not required for this run; skipping CCM setup"
  else
    if [[ -z "${KIBANA_EIS_CCM_API_KEY:-}" ]]; then
      echo "FTR_EIS_CCM was set but KIBANA_EIS_CCM_API_KEY is missing"
      exit 1
    fi

    ES_URL="$(jq -r '.hosts.elasticsearch' .scout/servers/local.json | sed 's:/*$::')"

    echo "--- Waiting for Elasticsearch to be ready at $ES_URL"
    ES_READY="false"
    for _ in {1..120}; do
      if ! kill -0 "$SCOUT_PID" 2>/dev/null; then
        echo "Scout server exited before Elasticsearch became ready"
        wait "$SCOUT_PID" || true
        exit 1
      fi

      if curl -sSf -u elastic:changeme \
        "$ES_URL/_cluster/health?wait_for_status=yellow&timeout=1s" >/dev/null; then
        ES_READY="true"
        break
      fi

      sleep 1
    done

    if [[ "${ES_READY}" != "true" ]]; then
      echo "Timed out waiting for Elasticsearch at $ES_URL"
      exit 1
    fi

    echo "--- Enabling EIS Cloud Connected Mode (CCM) on $ES_URL"

    curl -sSf -u elastic:changeme \
      -H 'content-type: application/json' \
      -X PUT "$ES_URL/_inference/_ccm" \
      -d "{\"api_key\":\"${KIBANA_EIS_CCM_API_KEY:?}\"}" >/dev/null

    echo "--- Waiting for EIS inference endpoints"
    for attempt in {1..10}; do
      if curl -sSf -u elastic:changeme "$ES_URL/_inference/_all" \
        | jq -e '.endpoints | any(.task_type=="chat_completion" and .service=="elastic")' >/dev/null; then
        echo "✅ EIS endpoints available"
        break
      fi
      if [[ "$attempt" == "10" ]]; then
        echo "❌ Timed out waiting for EIS endpoints"
        curl -sSf -u elastic:changeme "$ES_URL/_inference/_all" || true
        exit 1
      fi
      sleep 3
    done
  fi
fi

# Wait for Kibana to be ready (and fail fast if the Scout server process exits)
KIBANA_URL="$(jq -r '.hosts.kibana' .scout/servers/local.json)"
KIBANA_URL="$(printf '%s' "$KIBANA_URL" | sed 's:/*$::')"

for _ in {1..180}; do
  if ! kill -0 "$SCOUT_PID" 2>/dev/null; then
    echo "Scout server exited before Kibana became ready"
    wait "$SCOUT_PID" || true
    exit 1
  fi

  if curl -sSf "$KIBANA_URL/api/status" >/dev/null; then
    echo "Kibana is ready at $KIBANA_URL"
    break
  fi

  sleep 5
done

# Run eval suite via @kbn/evals CLI (internal executor by default).
# If EVAL_PROJECT is set, run a single Playwright project (used by CI fanout steps).
# If EVAL_GREP is set, pass Playwright --grep to filter tests by name/pattern.
# Otherwise, Playwright will run all projects defined by the suite config (useful locally).
EVAL_RUN_ARGS=()
if [[ -n "${EVAL_GREP:-}" ]]; then
  EVAL_RUN_ARGS+=(--grep "${EVAL_GREP}")
fi

run_eval_suite() {
  if [[ -n "${EVAL_PROJECT:-}" ]]; then
    KBN_EVALS_RUN_LOG="$(mktemp -t kbn-evals-run.XXXXXX.log)"
    export KBN_EVALS_RUN_LOG
    set +e
    node scripts/evals run --suite "$EVAL_SUITE_ID" --project "$EVAL_PROJECT" "${EVAL_RUN_ARGS[@]}" 2>&1 | tee "$KBN_EVALS_RUN_LOG"
    local eval_exit="${PIPESTATUS[0]}"
    set -e
    return "${eval_exit}"
  fi

  node scripts/evals run --suite "$EVAL_SUITE_ID" "${EVAL_RUN_ARGS[@]}"
}

run_eval_suite

