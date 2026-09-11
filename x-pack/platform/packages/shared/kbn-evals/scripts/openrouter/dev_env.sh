#!/usr/bin/env bash

set -euo pipefail

DEFAULT_CONFIG="x-pack/platform/packages/shared/kbn-evals/scripts/vault/config.json"
DEFAULT_BASE_URL="https://openrouter.ai/api/v1"
CONFIG_PATH="${1:-$DEFAULT_CONFIG}"

BASE_URL="${OPENROUTER_BASE_URL:-}"
API_KEY="${OPENROUTER_API_KEY:-}"

if [[ -f "$CONFIG_PATH" ]]; then
  CONFIG_JSON="$(cat "$CONFIG_PATH")"
  if [[ -z "$BASE_URL" ]]; then
    BASE_URL="$(jq -r '.openrouter.baseUrl // empty' <<<"$CONFIG_JSON")"
  fi
  if [[ -z "$API_KEY" ]]; then
    API_KEY="$(jq -r '.openrouter.apiKey // empty' <<<"$CONFIG_JSON")"
  fi
fi

BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"

if [[ -z "$API_KEY" ]]; then
  echo "Missing OpenRouter API key."
  echo "Set OPENROUTER_API_KEY or add openrouter.apiKey to $CONFIG_PATH"
  echo "(copy from x-pack/platform/packages/shared/kbn-evals/scripts/vault/config.example.json if needed)."
  exit 1
fi

echo "Generating KIBANA_TESTING_INFERENCE_ENDPOINTS from OpenRouter..."
KIBANA_TESTING_INFERENCE_ENDPOINTS="$(
  EVAL_MODEL_GROUPS= node x-pack/platform/packages/shared/kbn-evals/scripts/ci/generate_openrouter_connectors.js \
    --base-url "$BASE_URL" \
    --api-key "$API_KEY"
)"

if [[ -z "${KIBANA_TESTING_INFERENCE_ENDPOINTS:-}" ]]; then
  echo "Failed to generate KIBANA_TESTING_INFERENCE_ENDPOINTS (empty output)."
  exit 1
fi

echo ""
echo "# Paste/run these in your shell:"
echo "export OPENROUTER_BASE_URL=\"$BASE_URL\""
echo "export OPENROUTER_API_KEY=\"$API_KEY\""
echo "export KIBANA_TESTING_INFERENCE_ENDPOINTS=\"$KIBANA_TESTING_INFERENCE_ENDPOINTS\""
echo ""
echo "# Then run a suite:"
echo "# EVAL_CONNECTOR_ID=<one-of-the-generated-connector-ids> node scripts/evals run --suite agent-builder"
