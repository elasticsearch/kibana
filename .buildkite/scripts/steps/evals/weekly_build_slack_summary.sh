#!/usr/bin/env bash

set -euo pipefail

annotation_file=""
context_file=""
slack_body_file=""
cleanup() {
  rm -f "${annotation_file}" "${context_file}" "${slack_body_file}" 2>/dev/null || true
}
trap cleanup EXIT

if [[ "${KBN_EVALS_WEEKLY:-}" != "1" ]] && [[ "${KBN_EVALS_WEEKLY:-}" != "true" ]]; then
  echo "weekly_build_slack_summary.sh is only for weekly evals (KBN_EVALS_WEEKLY=1)"
  exit 0
fi

if ! command -v buildkite-agent >/dev/null 2>&1; then
  echo "buildkite-agent is required"
  exit 1
fi

all_keys="$(buildkite-agent meta-data keys 2>/dev/null || true)"

triage_keys="$(printf '%s\n' "${all_keys}" | grep -E '^kbn-evals:triage:' || true)"
failure_keys="$(printf '%s\n' "${all_keys}" | grep -E '^kbn-evals:suite-failures:' || true)"

if [[ -z "${triage_keys}" && -z "${failure_keys}" ]]; then
  echo "No weekly eval failures recorded in build metadata"
  exit 0
fi

declare -A suite_has_triage=()
declare -A suite_has_failure=()

while IFS= read -r key; do
  [[ -z "${key}" ]] && continue
  suite_id="${key#kbn-evals:triage:}"
  suite_has_triage["${suite_id}"]=1
done <<<"${triage_keys}"

while IFS= read -r key; do
  [[ -z "${key}" ]] && continue
  rest="${key#kbn-evals:suite-failures:}"
  suite_id="${rest%%:*}"
  [[ -n "${suite_id}" ]] && suite_has_failure["${suite_id}"]=1
done <<<"${failure_keys}"

suite_ids=()
for suite_id in "${!suite_has_triage[@]}" "${!suite_has_failure[@]}"; do
  suite_ids+=("${suite_id}")
done

if [[ "${#suite_ids[@]}" -eq 0 ]]; then
  exit 0
fi

mapfile -t suite_ids < <(printf '%s\n' "${suite_ids[@]}" | sort -u)

KIBANA_DIR="${KIBANA_DIR:-${BUILDKITE_BUILD_CHECKOUT_PATH:-$(pwd)}}"
suites_config="${KIBANA_DIR}/.buildkite/pipelines/evals/evals.suites.json"

suites_json='[]'
annotation_file="$(mktemp -t kbn-evals-weekly-annotation.XXXXXX.md)"
{
  echo ":rotating_light: *Weekly LLM evals* had failing suites"
  if [[ -n "${BUILDKITE_BUILD_URL:-}" ]]; then
    echo ""
    echo "<${BUILDKITE_BUILD_URL}|${BUILDKITE_PIPELINE_NAME:-Buildkite} #${BUILDKITE_BUILD_NUMBER:-}>"
  fi
} >"$annotation_file"

for suite_id in "${suite_ids[@]}"; do
  triage_body="$(buildkite-agent meta-data get "kbn-evals:triage:${suite_id}" --default '' 2>/dev/null || true)"
  job_url="$(buildkite-agent meta-data get "kbn-evals:suite-job-url:${suite_id}" --default '' 2>/dev/null || true)"

  failures_prefix="kbn-evals:suite-failures:${suite_id}:"
  failing_projects=()
  while IFS= read -r key; do
    [[ -z "${key}" ]] && continue
    [[ "${key}" != "${failures_prefix}"* ]] && continue
    value="$(buildkite-agent meta-data get "${key}" --default '' 2>/dev/null || true)"
    [[ -z "${value}" ]] && continue
    failing_projects+=("${value}")
  done <<<"${failure_keys}"

  if [[ "${#failing_projects[@]}" -gt 0 ]]; then
    projects_json="$(printf '%s\n' "${failing_projects[@]}" | sort -u | jq -R . | jq -s .)"
  else
    projects_json='[]'
  fi

  suite_name="${suite_id}"
  slack_channel=''
  slack_channel_id=''
  if [[ -f "${suites_config}" ]]; then
    suite_info="$(jq -c --arg id "$suite_id" '.suites[] | select(.id == $id) | {name, slackChannel, slackChannelId}' "${suites_config}" 2>/dev/null || true)"
    if [[ -n "${suite_info}" && "${suite_info}" != "null" ]]; then
      suite_name="$(jq -r '.name // empty' <<<"${suite_info}")"
      [[ -z "${suite_name}" ]] && suite_name="${suite_id}"
      slack_channel="$(jq -r '.slackChannel // empty' <<<"${suite_info}")"
      slack_channel_id="$(jq -r '.slackChannelId // empty' <<<"${suite_info}")"
    fi
  fi

  suite_obj="$(jq -n \
    --arg suiteId "$suite_id" \
    --arg suiteName "$suite_name" \
    --arg jobUrl "$job_url" \
    --arg slackChannel "$slack_channel" \
    --arg slackChannelId "$slack_channel_id" \
    --arg triageBody "$triage_body" \
    --argjson failingProjects "$projects_json" \
    '{suiteId: $suiteId, suiteName: $suiteName, failingProjects: $failingProjects, jobUrl: $jobUrl, slackChannel: $slackChannel, slackChannelId: $slackChannelId, triageBody: $triageBody}')"
  suites_json="$(jq -c --argjson obj "$suite_obj" '. + [$obj]' <<<"$suites_json")"

  # Full per-suite detail is kept in the build annotation.
  {
    echo ""
    echo "---"
    echo ""
    if [[ -n "${triage_body}" ]]; then
      printf '%s\n' "${triage_body}"
    else
      echo "*Suite \`${suite_id}\`* failed (no suite summary metadata)."
      echo ""
      echo "Failing connector projects:"
      if [[ "${#failing_projects[@]}" -gt 0 ]]; then
        for value in "${failing_projects[@]}"; do
          printf -- '- `%s`\n' "${value}"
        done
      fi
    fi
  } >>"$annotation_file"
done

context_file="$(mktemp -t kbn-evals-weekly-context.XXXXXX.json)"
jq -n \
  --argjson suites "$suites_json" \
  --arg buildUrl "${BUILDKITE_BUILD_URL:-}" \
  --arg pipelineName "${BUILDKITE_PIPELINE_NAME:-Buildkite}" \
  --arg buildNumber "${BUILDKITE_BUILD_NUMBER:-}" \
  '{
     buildUrl: $buildUrl,
     pipelineName: $pipelineName,
     buildNumber: $buildNumber,
     suites: $suites
   }' \
  >"$context_file"

slack_body_file="$(mktemp -t kbn-evals-weekly-slack.XXXXXX.md)"

echo "--- Building condensed weekly Slack summary (executive model summary + by-suite)"
if EVAL_WEEKLY_CONTEXT_PATH="$context_file" \
  EVAL_WEEKLY_SUMMARY_PATH="$slack_body_file" \
  node "${KIBANA_DIR}/x-pack/platform/packages/shared/kbn-evals/scripts/ci/build_weekly_slack_summary.js"; then
  slack_body="$(cat "$slack_body_file")"
else
  echo "--- Condensed weekly summary builder failed; falling back to full annotation body"
  slack_body="$(cat "$annotation_file")"
fi

annotation_body="$(cat "$annotation_file")"

# Buildkite annotation metadata limit is ~100KB; keep the full detail but cap it.
if [[ "${#annotation_body}" -gt 95000 ]]; then
  annotation_body="${annotation_body:0:95000}

_(truncated for Buildkite metadata size limit)_"
fi

buildkite-agent annotate --context 'kbn-evals-weekly-failures' --style 'error' "$annotation_body" || true

if [[ "${#slack_body}" -gt 38000 ]]; then
  slack_body="${slack_body:0:38000}

_(truncated for Slack length limit)_"
fi

if [[ "${KIBANA_SLACK_NOTIFICATIONS_ENABLED:-}" =~ ^(1|true)$ ]]; then
  buildkite-agent meta-data set 'slack:kbn_evals_weekly_failures:body' "$slack_body" >/dev/null 2>&1 || true
fi

echo "$slack_body"
exit 1
