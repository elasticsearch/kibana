#!/usr/bin/env bash

set -euo pipefail

# Uploads generated LLM matrix artifacts to a GCS bucket so the docs-content
# sync workflow can pull them. Weekly (serverless) runs publish under the
# `latest/` prefix; manual versioned-release runs (MATRIX_VERSION set) publish
# under `<version>/` so the docs manual hatch can fetch a specific Stack version.
#
# Layout: gs://<bucket>/<domain>/<latest|version>/<file>

BUCKET_NAME="${MATRIX_GCS_BUCKET:?MATRIX_GCS_BUCKET is required}"
GCS_BUCKET="gs://$BUCKET_NAME"
MATRIX_DOMAIN="${MATRIX_DOMAIN:-security}"
MATRIX_OUT_DIR="${MATRIX_OUT_DIR:-target/llm_matrix}"
PREFIX="${MATRIX_VERSION:-latest}"

DEST="$GCS_BUCKET/$MATRIX_DOMAIN/$PREFIX"

echo "--- Activate GCP service account for $GCS_BUCKET"
if [[ -n "${GCS_CREDENTIALS:-}" ]]; then
  # Preferred: reuse the eval CI service account (obs GCS access) exposed via the
  # kbn-evals vault config (KBN_EVALS=1 -> setup_job_env.sh sets GCS_CREDENTIALS).
  # This keeps the writer in the elastic-observability ecosystem alongside the
  # docs-content reader identity, avoiding a new kibana-ci service account.
  gcloud auth activate-service-account --key-file <(echo "$GCS_CREDENTIALS")
else
  # Fallback: impersonate a Kibana CI service account derived from the bucket name.
  .buildkite/scripts/common/activate_service_account.sh "$GCS_BUCKET"
fi

if [[ ! -d "$MATRIX_OUT_DIR" ]]; then
  echo "Matrix output directory not found: $MATRIX_OUT_DIR"
  exit 1
fi

echo "--- Upload matrix artifacts to $DEST"
for f in proprietary-models.csv open-source-models.csv matrix.md matrix.json; do
  src="$MATRIX_OUT_DIR/$f"
  if [[ -f "$src" ]]; then
    echo "Uploading $f -> $DEST/$f"
    gsutil -o "GSUtil:no_clobber=False" cp "$src" "$DEST/$f"
  else
    echo "Skipping missing artifact: $src"
  fi
done

echo "Finished uploading matrix artifacts to $DEST"
