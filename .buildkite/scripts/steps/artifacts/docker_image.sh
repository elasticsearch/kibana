#!/bin/bash

set -euo pipefail

.buildkite/scripts/bootstrap.sh

source .buildkite/scripts/steps/artifacts/env.sh
source .buildkite/scripts/common/util.sh

GIT_ABBREV_COMMIT=${BUILDKITE_COMMIT:0:12}
if [[ "${BUILDKITE_PULL_REQUEST:-false}" == "false" ]]; then
  KIBANA_IMAGE_TAG="git-$GIT_ABBREV_COMMIT"
else
  KIBANA_IMAGE_TAG="pr-$BUILDKITE_PULL_REQUEST-$GIT_ABBREV_COMMIT"
fi

# CDN readiness file - uploaded at the very end of successful CDN asset validation
CDN_READINESS_FILE="$GIT_ABBREV_COMMIT/.ready"
CDN_READINESS_URL="$GCS_SA_CDN_URL/$CDN_READINESS_FILE"

check_cdn_assets_ready() {
  local url="$1"
  if curl --output /dev/null --silent --head --fail "$url"; then
    return 0
  else
    return 1
  fi
}

echo "--- Clean up cached images"
clean_cached_images

KIBANA_BASE_IMAGE="docker.elastic.co/kibana-ci/kibana-serverless"
export KIBANA_IMAGE="$KIBANA_BASE_IMAGE:$KIBANA_IMAGE_TAG"

retag_image_with_architecture() {
  local image="$1"
  local artifact="$2"

  docker rmi "$image" || true
  docker load < "target/${artifact}-amd64.tar.gz"
  docker tag "$image" "$image-amd64"

  docker rmi "$image" || true
  docker load < "target/${artifact}-arm64.tar.gz"
  docker tag "$image" "$image-arm64"
}

create_and_push_manifest() {
  local image="$1"
  docker manifest create \
    "$image" \
    --amend "$image-arm64" \
    --amend "$image-amd64"
  docker manifest push "$image"
}

echo "--- Verify manifest and CDN assets do not already exist"
echo "Checking manifest for $KIBANA_IMAGE"
MANIFEST_EXISTS=false
CDN_ASSETS_READY=false
SKIP_BUILD=false

if docker manifest inspect "$KIBANA_IMAGE" &> /dev/null; then
  MANIFEST_EXISTS=true
  echo "Manifest exists: $KIBANA_IMAGE"
fi

echo "Checking CDN readiness at $CDN_READINESS_URL"
if check_cdn_assets_ready "$CDN_READINESS_URL"; then
  CDN_ASSETS_READY=true
  echo "CDN assets ready: $CDN_READINESS_URL"
fi

if [[ "$MANIFEST_EXISTS" == "true" ]]; then
  # If a staging build manifest already exists, there's a workflow error and the root cause should be investigated.
  if [[ "${BUILDKITE_PULL_REQUEST:-false}" == "false" ]]; then
    echo "Manifest already exists, exiting"
    exit 1
  elif [[ "$CDN_ASSETS_READY" == "true" ]]; then
    echo "Manifest and CDN assets already exist, skipping build. Look up previous build for artifacts."
    SKIP_BUILD=true
  else
    echo "Manifest exists but CDN assets are not ready (readiness file missing), rebuilding..."
  fi
fi

if [[ "$SKIP_BUILD" == "false" ]]; then
  echo "--- Build Kibana"
  node scripts/build \
    --debug \
    --release \
    --serverless \
    --docker-cross-compile \
    --docker-namespace="kibana-ci" \
    --docker-tag="$KIBANA_IMAGE_TAG"

  echo "--- Tag images"
  retag_image_with_architecture "$KIBANA_IMAGE" "kibana-serverless-$BASE_VERSION-docker-image"

  echo "--- Push images"
  docker_with_retry push "$KIBANA_IMAGE-arm64"
  docker_with_retry push "$KIBANA_IMAGE-amd64"

  echo "--- Create and push manifests"
  create_and_push_manifest "$KIBANA_IMAGE"

  # Update latest tags when building off main
  if [[ "$BUILDKITE_BRANCH" == "$KIBANA_BASE_BRANCH" ]] && [[ "${BUILDKITE_PULL_REQUEST:-false}" == "false" ]]; then
    docker buildx imagetools create -t "$KIBANA_BASE_IMAGE:latest" "$KIBANA_IMAGE"
  fi

  echo "--- Build dependencies report"
  node scripts/licenses_csv_report "--csv=target/dependencies-$GIT_ABBREV_COMMIT.csv"

  echo "--- Upload archives"
  cd target
  buildkite-agent artifact upload "kibana-serverless-$BASE_VERSION-linux-x86_64.tar.gz"
  buildkite-agent artifact upload "kibana-serverless-$BASE_VERSION-linux-aarch64.tar.gz"
  buildkite-agent artifact upload "kibana-serverless-$BASE_VERSION-docker-image-amd64.tar.gz"
  buildkite-agent artifact upload "kibana-serverless-$BASE_VERSION-docker-image-arm64.tar.gz"
  buildkite-agent artifact upload "kibana-serverless-$BASE_VERSION-docker-build-context.tar.gz"
  buildkite-agent artifact upload "kibana-$BASE_VERSION-cdn-assets.tar.gz"
  buildkite-agent artifact upload "dependencies-$GIT_ABBREV_COMMIT.csv"

  echo "--- Upload CDN assets"
  gcloud auth activate-service-account --key-file <(echo "$GCS_SA_CDN_KEY")

  CDN_ASSETS_FOLDER=$(mktemp -d)
  tar -xf "kibana-$BASE_VERSION-cdn-assets.tar.gz" -C "$CDN_ASSETS_FOLDER" --strip=1

  gsutil -m cp -r "$CDN_ASSETS_FOLDER/*" "gs://$GCS_SA_CDN_BUCKET/$GIT_ABBREV_COMMIT"

  echo "--- Validate CDN assets"
  ts-node "$(git rev-parse --show-toplevel)/.buildkite/scripts/steps/artifacts/validate_cdn_assets.ts" \
    "$GCS_SA_CDN_URL" \
    "$CDN_ASSETS_FOLDER"

  echo "--- Upload CDN readiness file"
  # Upload readiness file to mark CDN assets as complete
  # This file is checked at the start to determine if a rebuild is needed
  echo "ready" | gsutil cp - "gs://$GCS_SA_CDN_BUCKET/$CDN_READINESS_FILE"
  echo "Readiness file uploaded to gs://$GCS_SA_CDN_BUCKET/$CDN_READINESS_FILE"

  gcloud auth revoke "$GCS_SA_CDN_EMAIL"
fi

cat << EOF | buildkite-agent annotate --style "info" --context image
  ### Serverless Images

  Manifest: \`$KIBANA_IMAGE\`

  AMD64: \`$KIBANA_IMAGE-amd64\`

  ARM64: \`$KIBANA_IMAGE-arm64\`
EOF

if [[ "${BUILDKITE_PULL_REQUEST:-false}" != "false" ]]; then
  buildkite-agent meta-data set pr_comment:build_serverless:head "* Kibana Serverless Image: \`$KIBANA_IMAGE\`"
  buildkite-agent meta-data set pr_comment:early_comment_job_id "$BUILDKITE_JOB_ID"
fi

# This part is related with updating the configuration of kibana-controller,
# so that new stack instances contain the latest and greatest image of kibana,
# and the respective stack components of course.
echo "--- Trigger image tag update"
if [[ "$BUILDKITE_BRANCH" == "$KIBANA_BASE_BRANCH" ]] && [[ "${BUILDKITE_PULL_REQUEST:-false}" == "false" ]]; then
  cat << EOF | buildkite-agent pipeline upload
steps:
  - label: "Trigger cve-slo-status pipeline for $KIBANA_IMAGE"
    trigger: cve-slo-status
    build:
      env:
        CONTAINER: "$KIBANA_IMAGE"
    soft_fail: true
  - label: ":serverless::argo: Run synthetics tests and update kibana image tag to ${GIT_ABBREV_COMMIT} for kibana-controller"
    branches: main
    trigger: gpctl-promote-after-serverless-devenv-synthetics
    build:
      env:
        SERVICE_COMMIT_HASH: "$GIT_ABBREV_COMMIT"
        SERVICE: kibana
        REMOTE_SERVICE_CONFIG: https://raw.githubusercontent.com/elastic/serverless-gitops/main/gen/gpctl/kibana/dev.yaml
        GPCTL_PROMOTE_DRY_RUN: ${DRY_RUN:-false}
        CHANGE_WINDOW_OVERRIDE: true
EOF

else
  echo "Skipping update for untracked branch $BUILDKITE_BRANCH"
fi
