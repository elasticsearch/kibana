#!/usr/bin/env bash

set -euo pipefail

# Generates an LLM performance matrix artifact from exported evaluation results
# and uploads it as a Buildkite artifact (and optionally to a GCS bucket consumed
# by the docs-content sync workflow).
#
# Required env:
#   MATRIX_CONFIG       Path to the matrix config JSON.
# Optional env:
#   MATRIX_DOMAIN       Logical domain name (default: security). Used as the GCS prefix.
#   MATRIX_OUT_DIR      Output directory (default: target/llm_matrix).
#   MATRIX_BRANCH       Git branch filter override (default: config.branch).
#   MATRIX_VERSION      Stack version for a version-pinned artifact (manual releases).
#   MATRIX_GCS_BUCKET   GCS bucket name; when empty, the GCS upload is skipped.

MATRIX_CONFIG="${MATRIX_CONFIG:?MATRIX_CONFIG is required}"
MATRIX_DOMAIN="${MATRIX_DOMAIN:-security}"
MATRIX_OUT_DIR="${MATRIX_OUT_DIR:-target/llm_matrix}"

.buildkite/scripts/bootstrap.sh

if [[ -z "${EVALUATIONS_KBN_URL:-}" ]]; then
  echo "EVALUATIONS_KBN_URL is not set. Ensure KBN_EVALS=1 so the CI env hook exposes evals credentials."
  exit 1
fi

echo "--- Generating LLM performance matrix ($MATRIX_DOMAIN)"
node scripts/evals matrix \
  --config "$MATRIX_CONFIG" \
  --out "$MATRIX_OUT_DIR" \
  ${MATRIX_BRANCH:+--branch "$MATRIX_BRANCH"}

echo "--- Uploading matrix artifacts to Buildkite"
buildkite-agent artifact upload "$MATRIX_OUT_DIR/*"

if [[ -n "${MATRIX_GCS_BUCKET:-}" ]]; then
  echo "--- Uploading matrix artifacts to GCS ($MATRIX_GCS_BUCKET)"
  MATRIX_DOMAIN="$MATRIX_DOMAIN" MATRIX_OUT_DIR="$MATRIX_OUT_DIR" \
    bash .buildkite/scripts/steps/evals/upload_matrix_artifacts.sh
else
  echo "MATRIX_GCS_BUCKET not set; skipping GCS upload (Buildkite artifact only)."
fi
