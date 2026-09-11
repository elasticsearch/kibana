#!/usr/bin/env bash

set -euo pipefail

die() {
  echo "$*" >&2
  # If this script is sourced, never exit the parent shell (tmux pane).
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 1
  fi
  exit 1
}

# NOTE: `source` ignores the shebang and runs in the *current* shell.
# This file uses bash features (`[[ ]]`, here-strings, etc.), so sourcing it from zsh will behave poorly
# and can terminate the session. Ensure we're running under bash.
if [[ -z "${BASH_VERSION:-}" ]]; then
  die "This script must be sourced from bash. Try: bash -lc 'source x-pack/platform/packages/shared/kbn-evals/scripts/ci/local_ci_env.sh x-pack/platform/packages/shared/kbn-evals/scripts/vault/config.json && env | rg \"^(OPENROUTER_|EVAL_|TRACING_ES_|TRACING_EXPORTERS|KIBANA_TESTING_INFERENCE_ENDPOINTS)\"'"
fi

CONFIG_PATH="${1:-x-pack/platform/packages/shared/kbn-evals/scripts/vault/config.json}"

if [[ ! -f "$CONFIG_PATH" ]]; then
  die "Missing config file: $CONFIG_PATH
Copy the example and fill it out locally:
  cp x-pack/platform/packages/shared/kbn-evals/scripts/vault/config.example.json $CONFIG_PATH"
fi

CONFIG_JSON="$(cat "$CONFIG_PATH")"

# Validate config shape (safe; does not print secrets)
node x-pack/platform/packages/shared/kbn-evals/scripts/vault/validate_config.js --config "$CONFIG_PATH" >/dev/null

OPENROUTER_BASE_URL="$(jq -r '.openrouter.baseUrl // empty' <<<"$CONFIG_JSON")"
OPENROUTER_API_KEY="$(jq -r '.openrouter.apiKey // empty' <<<"$CONFIG_JSON")"

EVAL_CONNECTOR_ID="$(jq -r '.evaluationConnectorId // empty' <<<"$CONFIG_JSON")"

TRACING_ES_URL="$(jq -r '.tracingEs.url // empty' <<<"$CONFIG_JSON")"
TRACING_ES_API_KEY="$(jq -r '.tracingEs.apiKey // empty' <<<"$CONFIG_JSON")"

TRACING_EXPORTERS_JSON="$(jq -c '.tracingExporters // empty' <<<"$CONFIG_JSON")"
GCS_CREDENTIALS="$(jq -c '.gcsDatasetAccessCredentials // empty' <<<"$CONFIG_JSON")"
EVAL_KBN_URL="$(jq -r '.evaluationsKbn.url // empty' <<<"$CONFIG_JSON")"
EVAL_KBN_API_KEY="$(jq -r '.evaluationsKbn.apiKey // empty' <<<"$CONFIG_JSON")"

if [[ -z "$OPENROUTER_BASE_URL" || -z "$OPENROUTER_API_KEY" ]]; then
  die "Missing openrouter.baseUrl or openrouter.apiKey in $CONFIG_PATH"
fi

if [[ -z "$EVAL_CONNECTOR_ID" ]]; then
  die "Missing evaluationConnectorId in $CONFIG_PATH"
fi

export OPENROUTER_BASE_URL
export OPENROUTER_API_KEY
export EVAL_CONNECTOR_ID
export TRACING_ES_URL
export TRACING_ES_API_KEY
export GCS_CREDENTIALS
if [[ -n "$EVAL_KBN_URL" ]]; then
  export EVAL_KBN_URL
fi
if [[ -n "$EVAL_KBN_API_KEY" ]]; then
  export EVAL_KBN_API_KEY
fi
if [[ -n "$TRACING_EXPORTERS_JSON" && "$TRACING_EXPORTERS_JSON" != "null" ]]; then
  export TRACING_EXPORTERS="$TRACING_EXPORTERS_JSON"
fi

# NOTE: bash `set -e` does not reliably fail the script for errors inside `$(...)` in all contexts.
# Generate into a variable, then explicitly validate it, so we never feed empty/invalid data into JSON.parse below.
KIBANA_TESTING_INFERENCE_ENDPOINTS="$(
  EVAL_MODEL_GROUPS= node x-pack/platform/packages/shared/kbn-evals/scripts/ci/generate_openrouter_connectors.js \
    --base-url "$OPENROUTER_BASE_URL" \
    --api-key "$OPENROUTER_API_KEY"
)"
export KIBANA_TESTING_INFERENCE_ENDPOINTS

if [[ -z "${KIBANA_TESTING_INFERENCE_ENDPOINTS:-}" ]]; then
  die "ERROR: Failed to generate KIBANA_TESTING_INFERENCE_ENDPOINTS (empty output)."
fi

# Print a safe summary (no secrets)
CONNECTOR_COUNT="$(
  node -e "const b=process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS||'';const s=Buffer.from(b,'base64').toString('utf8');const o=JSON.parse(s);console.log(Object.keys(o).length);"
)"

if [[ "$EVAL_CONNECTOR_ID" == openrouter-* ]]; then
  EVAL_CONNECTOR_PRESENT="$(
    node -e "const b=process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS||'';const s=Buffer.from(b,'base64').toString('utf8');const o=JSON.parse(s);const id=process.env.EVAL_CONNECTOR_ID||'';process.stdout.write(String(Boolean(id && Object.prototype.hasOwnProperty.call(o,id))));"
  )"

  if [[ "$EVAL_CONNECTOR_PRESENT" != "true" ]]; then
    echo "ERROR: evaluationConnectorId ($EVAL_CONNECTOR_ID) is not present in generated connectors." >&2
    echo "Sample generated connector ids:" >&2
    node -e "const b=process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS||'';const s=Buffer.from(b,'base64').toString('utf8');const o=JSON.parse(s);console.log(Object.keys(o).slice(0,20).join('\\n'));"
    die "evaluationConnectorId ($EVAL_CONNECTOR_ID) is not present in generated connectors."
  fi
fi

echo "Loaded kbn-evals CI env from: $CONFIG_PATH"
echo "  OPENROUTER_BASE_URL=$OPENROUTER_BASE_URL"
echo "  OPENROUTER_API_KEY=${OPENROUTER_API_KEY:+<redacted>}"
echo "  EVAL_CONNECTOR_ID=$EVAL_CONNECTOR_ID"
echo "  EVAL_KBN_URL=${EVAL_KBN_URL:-<empty>}"
echo "  EVAL_KBN_API_KEY=${EVAL_KBN_API_KEY:+<redacted>}"
echo "  TRACING_ES_URL=${TRACING_ES_URL:-<empty>}"
if [[ -n "${TRACING_EXPORTERS:-}" ]]; then
  echo "  TRACING_EXPORTERS=<set (JSON array)>"
else
  echo "  TRACING_EXPORTERS=<empty>"
fi
if [[ -n "${GCS_CREDENTIALS:-}" ]]; then
  echo "  GCS_CREDENTIALS=<set (service account JSON)>"
else
  echo "  GCS_CREDENTIALS=<empty>"
fi
echo "  Generated connectors: $CONNECTOR_COUNT"

