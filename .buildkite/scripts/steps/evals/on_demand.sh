#!/usr/bin/env bash

set -euo pipefail

# On-demand evals entry point.

EVAL_SUITE_ID="${EVAL_SUITE_ID:-}"
if [[ -z "$EVAL_SUITE_ID" ]]; then
  echo "EVAL_SUITE_ID is required (single id or comma-separated list)"
  exit 1
fi

if ! command -v buildkite-agent >/dev/null 2>&1; then
  echo "buildkite-agent is required to upload on-demand suite steps"
  exit 1
fi

FANOUT_PIPELINE_FILE="$(mktemp -t kbn-evals-on-demand.XXXXXX.yml)"
trap 'rm -f "$FANOUT_PIPELINE_FILE"' EXIT
echo "steps:" >"$FANOUT_PIPELINE_FILE"

IFS=',' read -r -a requested_suites <<<"$EVAL_SUITE_ID"
seen_suites=" "
suite_count=0
for raw_suite in "${requested_suites[@]}"; do
  suite_one="$(printf '%s' "$raw_suite" | tr -d '[:space:]')"
  [[ -z "$suite_one" ]] && continue
  case "$seen_suites" in *" ${suite_one} "*) continue ;; esac
  seen_suites="${seen_suites}${suite_one} "
  suite_count=$((suite_count + 1))

  suite_key_safe="$(printf '%s' "$suite_one" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"
  cat >>"$FANOUT_PIPELINE_FILE" <<EOF
  - label: "LLM Evals: ${suite_one} (on-demand)"
    key: "kbn-evals-on-demand-${suite_key_safe}"
    command: "bash .buildkite/scripts/steps/evals/run_suite.sh"
    env:
      KBN_EVALS: "1"
      KBN_EVALS_ON_DEMAND: "1"
      FTR_EIS_CCM: "${FTR_EIS_CCM:-}"
      EVAL_INCLUDE_EIS_MODELS: "${EVAL_INCLUDE_EIS_MODELS:-}"
      EVAL_MODEL_GROUPS: "${EVAL_MODEL_GROUPS:-}"
      EVALUATION_CONNECTOR_ID: "${EVALUATION_CONNECTOR_ID:-}"
      EVAL_SLACK_NOTIFICATION_CHANNEL: "${EVAL_SLACK_NOTIFICATION_CHANNEL:-}"
      EVAL_SUITE_ID: "${suite_one}"
      EVAL_FANOUT: "1"
      EVAL_SERVER_CONFIG_SET: "${EVAL_SERVER_CONFIG_SET:-}"
      EVAL_GREP: "${EVAL_GREP:-}"
      EVALUATION_REPETITIONS: "${EVALUATION_REPETITIONS:-}"
      KIBANA_BUILD_ID: "${KIBANA_BUILD_ID:-}"
    timeout_in_minutes: ${EVAL_STEP_TIMEOUT_IN_MINUTES:-120}
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
done

if [[ "$suite_count" -eq 0 ]]; then
  echo "No valid suite ids parsed from EVAL_SUITE_ID='${EVAL_SUITE_ID}'"
  exit 1
fi

echo "--- Uploading on-demand eval steps (${suite_count} suite(s))"
cat "$FANOUT_PIPELINE_FILE"
if ! buildkite-agent pipeline upload "$FANOUT_PIPELINE_FILE"; then
  echo "On-demand pipeline upload failed. Dumping generated YAML with line numbers:"
  nl -ba "$FANOUT_PIPELINE_FILE" || true
  exit 1
fi
echo "On-demand suite steps uploaded."
