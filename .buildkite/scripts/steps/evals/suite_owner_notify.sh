#!/usr/bin/env bash

set -euo pipefail

SLACK_FILE=""
GITHUB_FILE=""
NOTIFY_PIPELINE_FILE=""
cleanup() {
  rm -f "${SLACK_FILE}" "${GITHUB_FILE}" "${NOTIFY_PIPELINE_FILE}" 2>/dev/null || true
}
trap cleanup EXIT

EVAL_SUITE_ID="${EVAL_SUITE_ID:-}"
if [[ -z "${EVAL_SUITE_ID}" ]]; then
  echo "EVAL_SUITE_ID is required"
  exit 1
fi

if ! command -v buildkite-agent >/dev/null 2>&1; then
  echo "buildkite-agent is required"
  exit 1
fi

suite_key_safe="$(printf '%s' "$EVAL_SUITE_ID" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-|-$//g')"
failures_prefix="kbn-evals:suite-failures:${suite_key_safe}:"

all_keys="$(buildkite-agent meta-data keys 2>/dev/null || true)"
failure_keys="$(printf '%s\n' "${all_keys}" | grep -E "^${failures_prefix}" || true)"
if [[ -z "${failure_keys}" ]]; then
  echo "No failures recorded for suite ${EVAL_SUITE_ID}"
  exit 0
fi

suite_name="${EVAL_SUITE_NAME:-$EVAL_SUITE_ID}"

if [[ "${KBN_EVALS_WEEKLY:-}" =~ ^(1|true)$ ]]; then
  EVAL_NOTIFY_MODE="weekly"
else
  EVAL_NOTIFY_MODE="on-demand"
fi

# --- Resolve destinations -------------------------------------------------
# Slack: weekly -> the suite's team channel; otherwise -> EVAL_SLACK_NOTIFICATION_CHANNEL
# (so on-demand/PR runs never auto-post to a team channel).
slack_channel=""
if [[ "${EVAL_NOTIFY_MODE}" == "weekly" ]]; then
  slack_channel="${EVAL_SUITE_SLACK_CHANNEL:-}"
else
  slack_channel="${EVAL_SLACK_NOTIFICATION_CHANNEL:-}"
fi

# PR: comment when a PR number was resolved (run_suite.sh derives it from
# GITHUB_PR_NUMBER, BUILDKITE_PULL_REQUEST, or refs/pull/<N>/head).
pr_number="${EVAL_PR_NUMBER:-}"

if [[ -z "${slack_channel}" && -z "${pr_number}" ]]; then
  echo "No Slack channel and not a PR build; skipping triage for suite ${EVAL_SUITE_ID}"
  exit 0
fi

echo "Suite failed: ${suite_name} (${EVAL_SUITE_ID})"
echo "Destinations: slack='${slack_channel:-<none>}' pr='${pr_number:-<none>}'"
mapfile -t failing_projects < <(
  while IFS= read -r key; do
    [[ -z "${key}" ]] && continue
    value="$(buildkite-agent meta-data get "${key}" --default '' 2>/dev/null || true)"
    [[ -z "${value}" ]] && continue
    printf '%s\n' "${value}"
  done <<<"${failure_keys}" | sort -u
)

cd "${KIBANA_DIR:-${BUILDKITE_BUILD_CHECKOUT_PATH:-$(pwd)}}"

if ! node -e "require('yaml')" 2>/dev/null; then
  echo "--- Bootstrap (required for suite owner triage)"
  .buildkite/scripts/bootstrap.sh
fi

echo "--- Preparing model connector for triage summary"
if [[ -n "${KBN_EVALS_CONFIG_B64:-}" ]]; then
  source .buildkite/scripts/steps/evals/setup_connectors.sh || {
    echo "WARNING: setup_connectors failed; build_suite_owner_slack_message will use vault LiteLLM fallback"
  }
else
  echo "WARNING: KBN_EVALS_CONFIG_B64 is not set; build_suite_owner_slack_message requires vault LiteLLM env vars"
fi

FAILING_PROJECTS_CSV="$(IFS=,; echo "${failing_projects[*]}")"

if [[ -n "${slack_channel}" ]]; then
  SLACK_FILE="$(mktemp -t kbn-evals-triage-slack.XXXXXX.md)"
fi
if [[ -n "${pr_number}" ]]; then
  GITHUB_FILE="$(mktemp -t kbn-evals-triage-github.XXXXXX.md)"
fi

echo "--- Building suite triage message(s)"
if ! EVAL_SUITE_ID="$EVAL_SUITE_ID" \
  EVAL_FAILING_PROJECTS="$FAILING_PROJECTS_CSV" \
  EVAL_NOTIFY_MODE="$EVAL_NOTIFY_MODE" \
  EVAL_TRIAGE_SLACK_OUT="${SLACK_FILE}" \
  EVAL_TRIAGE_GITHUB_OUT="${GITHUB_FILE}" \
  node x-pack/platform/packages/shared/kbn-evals/scripts/ci/build_suite_owner_slack_message.js; then
  echo "--- build_suite_owner_slack_message crashed; writing static fallback summary"
  if [[ "${EVAL_NOTIFY_MODE}" == "weekly" ]]; then
    header_label="Weekly LLM evals"
  else
    header_label="On-demand LLM eval"
  fi
  if [[ -n "${SLACK_FILE}" ]]; then
    {
      printf ':rotating_light: *%s* — %s (`%s`) failed.\n\n' "$header_label" "$suite_name" "$EVAL_SUITE_ID"
      printf '*Failing models:*\n'
      for project in "${failing_projects[@]}"; do printf -- '- `%s`\n' "${project}"; done
      [[ -n "${BUILDKITE_BUILD_URL:-}" ]] && printf '\n<%s|View build>\n' "${BUILDKITE_BUILD_URL}"
      printf '\n*Triage summary:*\n'
      printf '_Suite owner message builder failed. See the suite owner notify Buildkite step for details._\n'
    } >"$SLACK_FILE"
  fi
  if [[ -n "${GITHUB_FILE}" ]]; then
    {
      printf ':rotating_light: **%s** — %s (`%s`) failed.\n\n' "$header_label" "$suite_name" "$EVAL_SUITE_ID"
      printf '**Failing models:**\n'
      for project in "${failing_projects[@]}"; do printf -- '- `%s`\n' "${project}"; done
      [[ -n "${BUILDKITE_BUILD_URL:-}" ]] && printf '\n[View build](%s)\n' "${BUILDKITE_BUILD_URL}"
      printf '\n**Triage summary:**\n\n'
      printf '_Suite owner message builder failed. See the suite owner notify Buildkite step for details._\n'
    } >"$GITHUB_FILE"
  fi
fi

if [[ -n "${SLACK_FILE}" && -f "${SLACK_FILE}" ]]; then
  buildkite-agent meta-data set "kbn-evals:triage:${suite_key_safe}" "$(cat "$SLACK_FILE")" >/dev/null 2>&1 || true
fi

ANNOTATION_FILE="${SLACK_FILE:-${GITHUB_FILE}}"
if [[ -n "${ANNOTATION_FILE}" && -f "${ANNOTATION_FILE}" ]]; then
  echo "--- Suite failure summary"
  cat "$ANNOTATION_FILE"
  buildkite-agent annotate --context "kbn-evals-summary-${suite_key_safe}" --style 'error' "$(cat "$ANNOTATION_FILE")" || true
fi

# Record a per-suite job link so the weekly roll-up can deep-link to this suite's
# triage job (instead of one link per failing model).
if [[ -n "${BUILDKITE_BUILD_URL:-}" && -n "${BUILDKITE_JOB_ID:-}" ]]; then
  buildkite-agent meta-data set "kbn-evals:suite-job-url:${suite_key_safe}" \
    "${BUILDKITE_BUILD_URL}#${BUILDKITE_JOB_ID}" >/dev/null 2>&1 || true
fi

# --- Post to Slack --------------------------------------------------------
if [[ -n "${slack_channel}" && -n "${SLACK_FILE}" && -f "${SLACK_FILE}" ]]; then
  NOTIFY_PIPELINE_FILE="$(mktemp -t kbn-evals-notify-pipeline.XXXXXX.yml)"
  EVAL_TRIAGE_SUMMARY_PATH="$SLACK_FILE" \
    EVAL_SUITE_SLACK_CHANNEL="$slack_channel" \
    node x-pack/platform/packages/shared/kbn-evals/scripts/ci/generate_suite_notify_pipeline.js \
    >"$NOTIFY_PIPELINE_FILE"

  echo "--- Uploading suite owner Slack notify pipeline (channel: ${slack_channel})"
  cat "$NOTIFY_PIPELINE_FILE"
  buildkite-agent pipeline upload "$NOTIFY_PIPELINE_FILE" || echo "WARNING: failed to upload Slack notify pipeline"
  rm -f "$NOTIFY_PIPELINE_FILE"
fi

# --- Post a PR comment ----------------------------------------------------
if [[ -n "${pr_number}" && -n "${GITHUB_FILE}" && -f "${GITHUB_FILE}" ]]; then
  echo "--- Posting triage as a PR comment (elastic/kibana#${pr_number})"
  if ! ts-node .buildkite/scripts/lifecycle/comment_on_pr.ts \
    --message "$(cat "$GITHUB_FILE")" \
    --context "evals-triage-${suite_key_safe}" \
    --clear-previous \
    --issue-number "$pr_number" \
    --repository-owner "elastic" \
    --repository "kibana"; then
    echo "WARNING: failed to post PR comment for suite ${EVAL_SUITE_ID}"
  fi
fi

exit 0
