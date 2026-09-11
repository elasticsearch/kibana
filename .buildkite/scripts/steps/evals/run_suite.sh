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

# Boot disk for the fanout agents. Eval steps bootstrap the workspace, unpack the Kibana
# distributable and run a local ES + Kibana; on the image default ES ends up under its merge
# disk watermark and stops merging segments. Keep in sync with `pipelines/evals/eval_pipeline.ts`.
EVAL_AGENT_DISK_SIZE_GB="${EVAL_AGENT_DISK_SIZE_GB:-130}"

# Tag inference traffic with `X-Elastic-Product-Use-Case` (forwarded from inference connector telemetry).
# The value should be the platform-level `pluginId` use-case identifier.
# `@kbn/evals` defaults this to `kbn_evals`, but you can override via KBN_EVALS_TELEMETRY_PLUGIN_ID.

# Set a base build run ID from the Buildkite build. This is used as a seed for
# generating deterministic per-task experiment IDs (not as the experiment_id itself)
# and feeds metadata.execution_id, the key the Experiments listing groups by
# (see buildExecutionId in @kbn/evals for how the suite and model are combined).
if [[ -z "${TEST_RUN_ID:-}" ]] && [[ -n "${BUILDKITE_BUILD_ID:-}" ]]; then
  export TEST_RUN_ID="bk-${BUILDKITE_BUILD_ID}"
fi

# Bootstrap workspace deps + download build artifacts (same setup as FTR/Scout CI steps)
source .buildkite/scripts/steps/functional/common.sh

EVAL_SUITE_INFO="$(
  node x-pack/platform/packages/shared/kbn-evals/scripts/ci/get_suite_info.js "$EVAL_SUITE_ID" || true
)"
EVAL_SUITE_NAME="$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r '.name // empty' 2>/dev/null || true)"
EVAL_SUITE_SLACK_CHANNEL="$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r '.slackChannel // empty' 2>/dev/null || true)"
# Per-suite step timeout for suites that legitimately need longer than the 120m default.
EVAL_SUITE_STEP_TIMEOUT="$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r '.stepTimeoutInMinutes // empty' 2>/dev/null || true)"

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

  # Shards of one model run as separate steps but share EVAL_PROJECT, and each records a
  # different excerpt, so the log needs a key per shard or the last step to fail wins.
  local failure_log_key="kbn-evals:suite-failure-log:${suite_key_safe}:${project_key_safe}"
  if [[ -n "${EVAL_SHARD_ID:-}" ]]; then
    local shard_key_safe
    shard_key_safe="$(printf '%s' "$EVAL_SHARD_ID" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"
    failure_log_key="${failure_log_key}:${shard_key_safe}"
  fi

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
  # The pre-run snapshot is only a baseline; ES fills `.es` while the suite runs, so these are the
  # numbers that show a watermark breach. Skipped in the parent fanout step, which never starts ES.
  # Diagnostics must never abort the trap under `set -e`, or the steps below are skipped and the
  # failure goes unrecorded for triage.
  if [[ -d .es ]]; then
    echo "--- Disk usage after the run"
    df -h . || true
    du -sh .es 2>/dev/null || true
  fi
  cleanup
  record_suite_failure "$exit_status"
  exit "$exit_status"
}

trap on_exit EXIT

# Generate OpenRouter connectors (or skip when only EIS models are requested).
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
  # If the judge connector is EIS-backed, we still need EIS connectors even when running an OpenRouter project.
  if [[ -n "${EVAL_CONNECTOR_ID:-}" ]] && [[ "${EVAL_CONNECTOR_ID}" == eis-* ]]; then
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

    echo "--- Merging OpenRouter + EIS connectors"
    export KIBANA_TESTING_INFERENCE_ENDPOINTS="$(
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
      echo "No connectors found in KIBANA_TESTING_INFERENCE_ENDPOINTS; falling back to evaluation connector only"
      if [[ -n "${EVAL_CONNECTOR_ID:-}" ]]; then
        export EVAL_PROJECT="${EVAL_CONNECTOR_ID}"
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

      fanout_preemptible=true
      if [[ "$(printf '%s' "${EVAL_PREEMPTIBLE:-1}" | tr '[:upper:]' '[:lower:]')" =~ ^(0|false|no)$ ]]; then
        fanout_preemptible=false
      fi

      # Suites that don't fit one step declare `shards` in evals.suites.json; each shard becomes a
      # separate step (with its own Scout stack) running only the spec files it lists.
      # An explicit grep/grep-invert is a manual override, so it takes precedence over the shards.
      # Expanded into parallel arrays rather than read positionally from a delimited row, because
      # bash collapses runs of tabs when splitting and would shift a shard with an empty field.
      shard_ids=()
      shard_spec_files=()
      shard_count=0
      if [[ -z "${EVAL_GREP:-}" && -z "${EVAL_GREP_INVERT:-}" ]]; then
        shard_count="$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r '(.shards // []) | length' 2>/dev/null || echo 0)"
        [[ "$shard_count" =~ ^[0-9]+$ ]] || shard_count=0
      fi

      for ((shard_index = 0; shard_index < shard_count; shard_index++)); do
        shard_ids+=("$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r --argjson i "$shard_index" '.shards[$i].id // ""')")
        shard_spec_files+=("$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r --argjson i "$shard_index" '(.shards[$i].specFiles // []) | join(" ")')")
      done

      # No shards configured: a single step per connector, honouring any manual grep overrides.
      if ((shard_count == 0)); then
        shard_ids=("")
        shard_spec_files=("")
      fi

      # A moved or renamed spec would just stop being run by its shard, and the step would still go
      # green having run the rest. Fail the whole fanout here instead, before any stack is booted.
      if ((shard_count > 0)); then
        suite_root="$(dirname "$(printf '%s' "${EVAL_SUITE_INFO}" | jq -r '.configPath // ""')")"
        missing_spec_files=()
        for ((shard_index = 0; shard_index < shard_count; shard_index++)); do
          read -r -a shard_spec_file_list <<<"${shard_spec_files[$shard_index]}"
          for spec_file in ${shard_spec_file_list[@]+"${shard_spec_file_list[@]}"}; do
            if [[ ! -f "${suite_root}/${spec_file}" ]]; then
              missing_spec_files+=("${shard_ids[$shard_index]}: ${spec_file}")
            fi
          done
        done
        if ((${#missing_spec_files[@]} > 0)); then
          echo "Shard spec files missing from ${suite_root}/:" >&2
          printf '  %s\n' "${missing_spec_files[@]}" >&2
          echo "Update the suite's shards in .buildkite/pipelines/evals/evals.suites.json." >&2
          exit 1
        fi
      fi

      # Explicit env override wins, then the suite's own budget, then the 120m default that lets
      # most suite/model combinations through without per-suite special-casing.
      timeout_in_minutes="${EVAL_STEP_TIMEOUT_IN_MINUTES:-${EVAL_SUITE_STEP_TIMEOUT:-120}}"

      fanout_step_keys=()
      while IFS= read -r connector_id; do
        [[ -z "$connector_id" ]] && continue
        key_safe="$(printf '%s' "$connector_id" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"

        for ((shard_index = 0; shard_index < ${#shard_ids[@]}; shard_index++)); do
          shard_id="${shard_ids[$shard_index]}"
          shard_spec_file_args="${shard_spec_files[$shard_index]}"

          step_key="kbn-evals-${group_key_safe}-${key_safe}"
          step_label="LLM Evals: ${EVAL_SUITE_ID} / ${connector_id}"
          if [[ -n "$shard_id" ]]; then
            shard_key_safe="$(printf '%s' "$shard_id" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"
            step_key="${step_key}-${shard_key_safe}"
            step_label="${step_label} [${shard_id}]"
          fi
          fanout_step_keys+=("$step_key")

          cat >>"$FANOUT_PIPELINE_FILE" <<EOF
      - label: "${step_label}"
        key: "${step_key}"
        command: "bash .buildkite/scripts/steps/evals/run_suite.sh"
        env:
          KBN_EVALS: "1"
          KBN_EVALS_WEEKLY: "${KBN_EVALS_WEEKLY:-}"
          FTR_EIS_CCM: "${FTR_EIS_CCM:-}"
          EVAL_INCLUDE_EIS_MODELS: "${EVAL_INCLUDE_EIS_MODELS:-}"
          EVAL_MODEL_GROUPS: "${EVAL_MODEL_GROUPS:-}"
          EVAL_CONNECTOR_ID: "${EVAL_CONNECTOR_ID:-}"
          EVAL_SUITE_ID: "${EVAL_SUITE_ID}"
          EVAL_SUITE_NAME: "${EVAL_SUITE_NAME:-}"
          EVAL_SUITE_SLACK_CHANNEL: "${EVAL_SUITE_SLACK_CHANNEL:-}"
          EVAL_PROJECT: "${connector_id}"
          EVAL_SHARD_ID: "${shard_id}"
          EVAL_FANOUT: "0"
          TEST_RUN_ID: "${TEST_RUN_ID:-}"
          EVAL_SERVER_CONFIG_SET: "${EVAL_SERVER_CONFIG_SET:-}"
          EVAL_GREP: "${EVAL_GREP:-}"
          EVAL_GREP_INVERT: "${EVAL_GREP_INVERT:-}"
          EVAL_SPEC_FILES: "${shard_spec_file_args}"
          EVAL_REPETITIONS: "${EVAL_REPETITIONS:-}"
        timeout_in_minutes: ${timeout_in_minutes}
        concurrency_group: "kbn-evals-${group_key_safe}"
        concurrency: ${EVAL_FANOUT_CONCURRENCY}
        agents:
          image: family/kibana-ubuntu-2404
          imageProject: elastic-images-prod
          provider: gcp
          machineType: n2-standard-8
          diskSizeGb: ${EVAL_AGENT_DISK_SIZE_GB}
EOF

          if [[ "$fanout_preemptible" == "true" ]]; then
            cat >>"$FANOUT_PIPELINE_FILE" <<EOF
          preemptible: true
        retry:
          automatic:
            - exit_status: "-1"
              limit: 3
EOF
          fi
        done
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

      # Only ping suite owners on the pipeline's default branch (main). Manual rebuilds
      # from feature branches still run the evals but skip the Slack notification, so we
      # don't spam suite owners with results from in-progress/experimental branches.
      EVAL_NOTIFY_BRANCH="${BUILDKITE_PIPELINE_DEFAULT_BRANCH:-main}"
      
      # Enable the suite owner notify step when there is somewhere to send triage:
      # - weekly: the suite's team channel
      # - any run: a PR comment (PR context) or EVAL_SLACK_NOTIFICATION_CHANNEL
      enable_suite_owner_notify="false"
      if [[ "${KBN_EVALS_WEEKLY:-}" =~ ^(1|true)$ ]] && [[ -n "${EVAL_SUITE_SLACK_CHANNEL:-}" ]] && [[ "${BUILDKITE_BRANCH:-}" == "${EVAL_NOTIFY_BRANCH}" ]]; then
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

      # PR-only steps: post-comparison comment + refresh baseline block/trigger.
      # Both live here in the fanout so they start only after all model steps
      # complete and execution IDs are written by evaluate.ts.
      if [[ -n "${BUILDKITE_PULL_REQUEST:-}" && "${BUILDKITE_PULL_REQUEST}" != "false" ]]; then
        suite_display_name="${EVAL_SUITE_NAME:-$EVAL_SUITE_ID}"

        # Post-comparison step (inside the fanout group — 6-space indent).
        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
      - label: "LLM Evals: ${EVAL_SUITE_ID} (post comparison)"
        key: "kbn-evals-${group_key_safe}-post-comparison"
        command: "bash .buildkite/scripts/steps/evals/post_eval_comment.sh"
        env:
          KBN_EVALS: "1"
          EVAL_SUITE_ID: "${EVAL_SUITE_ID}"
          EVAL_SUITE_IDS: "${EVAL_SUITE_ID}"
        depends_on:
EOF
        for key in "${fanout_step_keys[@]}"; do
          printf '          - "%s"\n' "$key" >>"$FANOUT_PIPELINE_FILE"
        done
        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
        timeout_in_minutes: 10
        allow_dependency_failure: true
        agents:
          image: family/kibana-ubuntu-2404
          imageProject: elastic-images-prod
          provider: gcp
          machineType: n2-standard-2
          preemptible: true
EOF
        # Refresh baseline block + trigger (top-level — 2-space indent).
        # The trigger fires a fresh main eval run so the PR comment is updated
        # with a same-day baseline when the auto-discovered one is stale.
        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
  - block: "LLM Evals: Refresh ${suite_display_name}"
    key: "kbn-evals-${group_key_safe}-refresh-block"
    depends_on:
      - "kbn-evals-${group_key_safe}-post-comparison"
    allow_dependency_failure: true
  - trigger: kibana-evals-on-demand-llm-evals
    label: "LLM Evals: Refresh ${suite_display_name}"
    key: "kbn-evals-${group_key_safe}-refresh-trigger"
    async: true
    soft_fail: true
    depends_on:
      - "kbn-evals-${group_key_safe}-refresh-block"
    build:
      branch: main
      message: "Fresh baseline for PR #${BUILDKITE_PULL_REQUEST}: ${EVAL_SUITE_ID}"
      env:
        EVAL_SUITE_ID: "${EVAL_SUITE_ID}"
        EVAL_SUITE_IDS: "${EVAL_SUITE_ID}"
        FRESH_BASELINE_PR_EXPERIMENT_ID: "bk-${BUILDKITE_BUILD_ID}"
        EVAL_PR_NUMBER: "${BUILDKITE_PULL_REQUEST}"
        EVAL_CONNECTOR_ID: "${EVAL_CONNECTOR_ID:-}"
        EVAL_INCLUDE_EIS_MODELS: "${EVAL_INCLUDE_EIS_MODELS:-}"
        EVAL_MODEL_GROUPS: "${EVAL_MODEL_GROUPS:-}"
        EVAL_SERVER_CONFIG_SET: "${EVAL_SERVER_CONFIG_SET:-}"
EOF
      elif [[ -n "${FRESH_BASELINE_PR_EXPERIMENT_ID:-}" ]]; then
        # Fresh-baseline mode: emit the post-comparison step inside the fanout so
        # it starts only after all model steps have written their execution IDs to
        # Buildkite metadata.
        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
      - label: "LLM Evals: ${EVAL_SUITE_ID} (fresh baseline comparison)"
        key: "kbn-evals-${group_key_safe}-fresh-compare"
        command: "bash .buildkite/scripts/steps/evals/post_eval_comment.sh"
        env:
          KBN_EVALS: "1"
          EVAL_SUITE_ID: "${EVAL_SUITE_ID}"
          EVAL_SUITE_IDS: "${EVAL_SUITE_ID}"
          GITHUB_PR_NUMBER: "${EVAL_PR_NUMBER:-}"
          FRESH_BASELINE_PR_EXPERIMENT_ID: "${FRESH_BASELINE_PR_EXPERIMENT_ID}"
        depends_on:
EOF
        for key in "${fanout_step_keys[@]}"; do
          printf '          - "%s"\n' "$key" >>"$FANOUT_PIPELINE_FILE"
        done
        cat >>"$FANOUT_PIPELINE_FILE" <<EOF
        timeout_in_minutes: 10
        allow_dependency_failure: true
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

      # Publish the connector list so the post-comparison step can discover
      # which models ran without querying the experiments API.
      _connectors_csv="$(printf '%s' "$CONNECTOR_IDS" | tr '\n' ',' | sed 's/,$//')"
      buildkite-agent meta-data set "kbn-evals:connectors:${EVAL_SUITE_ID}" "$_connectors_csv" 2>/dev/null || true

      echo "Fanout uploaded. Exiting parent step."
      exit 0
    fi
  fi
fi

# Free space on the ES data path drives the merge scheduler's disk watermark: once it drops below
# `min(5% of total, 100GB)` Elasticsearch stops merging segments and only says so in a repeated
# warning. Record the numbers up front so a recurrence is diagnosable from the build log alone.
echo "--- Disk usage before starting Scout"
df -h .
du -sh .es node_modules "${KIBANA_BUILD_LOCATION:-}" 2>/dev/null || true

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
  if [[ -n "${EVAL_CONNECTOR_ID:-}" ]] && [[ "${EVAL_CONNECTOR_ID}" == eis-* ]]; then
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
# If EVAL_GREP / EVAL_GREP_INVERT are set, pass Playwright --grep / --grep-invert to filter tests
# by name/pattern. This is the manual override for ad-hoc runs.
# If EVAL_SPEC_FILES is set, pass those paths as Playwright file filters. Sharded suites use this
# to split one suite across several steps; the fanout step has already checked the paths exist.
# Otherwise, Playwright will run all projects defined by the suite config (useful locally).
EVAL_RUN_ARGS=()
if [[ -n "${EVAL_GREP:-}" ]]; then
  EVAL_RUN_ARGS+=(--grep "${EVAL_GREP}")
fi
if [[ -n "${EVAL_GREP_INVERT:-}" ]]; then
  EVAL_RUN_ARGS+=(--grep-invert "${EVAL_GREP_INVERT}")
fi
if [[ -n "${EVAL_SPEC_FILES:-}" ]]; then
  read -r -a EVAL_SPEC_FILE_LIST <<<"${EVAL_SPEC_FILES}"
  EVAL_RUN_ARGS+=(${EVAL_SPEC_FILE_LIST[@]+"${EVAL_SPEC_FILE_LIST[@]}"})
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

