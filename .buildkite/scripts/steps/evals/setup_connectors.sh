#!/usr/bin/env bash

set -euo pipefail

# Generate KIBANA_TESTING_INFERENCE_ENDPOINTS from OpenRouter (when needed).
#
# This script is sourced by run_suite.sh after the pre-command hook has
# exported KBN_EVALS_CONFIG_B64 and EVAL_CONNECTOR_ID.
#
# When EVAL_MODEL_GROUPS contains only EIS models (eis/...) and the judge
# connector is also EIS-backed (or unset), OpenRouter connector generation is
# skipped entirely. This avoids failing eval runs when OpenRouter is
# unavailable but the eval doesn't need it at all.

if [[ -z "${KBN_EVALS_CONFIG_B64:-}" ]]; then
  echo "ERROR: KBN_EVALS_CONFIG_B64 is not set. Was setup_job_env.sh sourced?"
  exit 1
fi

KBN_EVALS_CONFIG_JSON="$(printf '%s' "$KBN_EVALS_CONFIG_B64" | base64 -d)"

OPENROUTER_BASE_URL="$(jq -r '.openrouter.baseUrl // empty' <<<"$KBN_EVALS_CONFIG_JSON")"
OPENROUTER_API_KEY="$(jq -r '.openrouter.apiKey // empty' <<<"$KBN_EVALS_CONFIG_JSON")"

NEED_OPENROUTER_CONNECTORS="true"

# Check 1: If EVAL_MODEL_GROUPS only contains EIS models, OpenRouter is not needed.
if [[ -n "${EVAL_MODEL_GROUPS:-}" ]]; then
  _all_eis="true"
  IFS=',' read -ra _model_groups <<< "$EVAL_MODEL_GROUPS"
  for _mg in "${_model_groups[@]}"; do
    _mg="${_mg## }"; _mg="${_mg%% }"
    if [[ -n "$_mg" ]] && [[ "$_mg" != eis/* ]]; then
      _all_eis="false"
      break
    fi
  done
  if [[ "$_all_eis" == "true" ]]; then
    NEED_OPENROUTER_CONNECTORS="false"
  fi
fi

# Check 2: Fanout child steps set EVAL_PROJECT to a connector id.
# If the project is EIS-backed, this step only needs EIS connectors.
if [[ -n "${EVAL_PROJECT:-}" ]] && [[ "${EVAL_PROJECT}" == eis-* ]]; then
  NEED_OPENROUTER_CONNECTORS="false"
fi

# Override: if the judge connector is OpenRouter-backed, we always need OpenRouter.
if [[ -n "${EVAL_CONNECTOR_ID:-}" ]] && [[ "${EVAL_CONNECTOR_ID}" == openrouter-* ]]; then
  NEED_OPENROUTER_CONNECTORS="true"
fi

if [[ "$NEED_OPENROUTER_CONNECTORS" == "true" ]]; then
  echo "--- Generating OpenRouter connectors"

  if [[ -z "$OPENROUTER_BASE_URL" || -z "$OPENROUTER_API_KEY" ]]; then
    echo "ERROR: Missing openrouter.baseUrl or openrouter.apiKey in KBN_EVALS_CONFIG_JSON"
    exit 1
  fi

  KIBANA_TESTING_INFERENCE_ENDPOINTS="$(
    node x-pack/platform/packages/shared/kbn-evals/scripts/ci/generate_openrouter_connectors.js \
      --base-url "$OPENROUTER_BASE_URL" \
      --api-key "$OPENROUTER_API_KEY"
  )"
  export KIBANA_TESTING_INFERENCE_ENDPOINTS

  if [[ -z "${KIBANA_TESTING_INFERENCE_ENDPOINTS:-}" ]]; then
    echo "ERROR: Failed to generate KIBANA_TESTING_INFERENCE_ENDPOINTS (empty output)."
    exit 1
  fi

  if [[ -n "${EVAL_CONNECTOR_ID:-}" ]] && [[ "${EVAL_CONNECTOR_ID}" == openrouter-* ]]; then
    if ! node -e "const b=process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS||'';const s=Buffer.from(b,'base64').toString('utf8');const o=JSON.parse(s);const id=process.env.EVAL_CONNECTOR_ID;process.exit(Object.prototype.hasOwnProperty.call(o,id)?0:1);" ; then
      echo "ERROR: EVAL_CONNECTOR_ID ($EVAL_CONNECTOR_ID) is not present in generated connectors."
      echo "Sample generated connector ids:"
      node -e "const b=process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS||'';const s=Buffer.from(b,'base64').toString('utf8');const o=JSON.parse(s);console.log(Object.keys(o).slice(0,20).join('\\n'));"
      exit 1
    fi
  fi
else
  echo "--- Skipping OpenRouter connector generation (only EIS models requested)"
  KIBANA_TESTING_INFERENCE_ENDPOINTS="$(printf '{}' | base64)"
  export KIBANA_TESTING_INFERENCE_ENDPOINTS
fi
