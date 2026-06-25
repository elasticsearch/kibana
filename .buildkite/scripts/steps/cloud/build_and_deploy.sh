#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

.buildkite/scripts/bootstrap.sh

export KBN_NP_PLUGINS_BUILT=true

VERSION="$(jq -r '.version' package.json)-SNAPSHOT"
ECCTL_LOGS=$(mktemp --suffix ".json")

KIBANA_MEMORY_SIZE=${KIBANA_MEMORY_SIZE:-2048}
case "$KIBANA_MEMORY_SIZE" in
  1024|2048|4096|8192)
    echo "--- Kibana node memory size: ${KIBANA_MEMORY_SIZE}MB"
    ;;
  *)
    echo "Error: KIBANA_MEMORY_SIZE must be one of: 1024, 2048, 4096, 8192. Got: $KIBANA_MEMORY_SIZE"
    exit 1
    ;;
esac

ES_ZONE_COUNT=${ES_ZONE_COUNT:-1}
case "$ES_ZONE_COUNT" in
  1|2|3)
    echo "--- Elasticsearch zone count: ${ES_ZONE_COUNT}"
    ;;
  *)
    echo "Error: ES_ZONE_COUNT must be 1, 2, or 3. Got: $ES_ZONE_COUNT"
    exit 1
    ;;
esac

ES_HOT_TIER_MEMORY_SIZE=${ES_HOT_TIER_MEMORY_SIZE:-2048}
case "$ES_HOT_TIER_MEMORY_SIZE" in
  1024|2048|4096|8192|16384|32768)
    echo "--- Elasticsearch hot tier memory size: ${ES_HOT_TIER_MEMORY_SIZE}MB"
    ;;
  *)
    echo "Error: ES_HOT_TIER_MEMORY_SIZE must be one of: 1024, 2048, 4096, 8192, 16384, 32768. Got: $ES_HOT_TIER_MEMORY_SIZE"
    exit 1
    ;;
esac

echo "--- Download Kibana Distribution"

mkdir -p ./target
download_tmp_artifact "kibana-default.tar.zst" ./target "${KIBANA_BUILD_ID:-$BUILDKITE_BUILD_ID}"
mv ./target/kibana-default.tar.zst ./target/kibana-$VERSION-linux-x86_64.tar.zst

echo "--- Build Cloud Distribution"
ELASTICSEARCH_MANIFEST_URL="https://storage.googleapis.com/kibana-ci-es-snapshots-daily/$(jq -r '.version' package.json)/manifest-latest-verified.json"
ELASTICSEARCH_SHA=$(curl -s $ELASTICSEARCH_MANIFEST_URL | jq -r '.sha')
ELASTICSEARCH_CLOUD_IMAGE="docker.elastic.co/kibana-ci/elasticsearch-cloud-ess:$VERSION-$ELASTICSEARCH_SHA"

KIBANA_CLOUD_IMAGE="docker.elastic.co/kibana-ci/kibana-cloud:$VERSION-$GIT_COMMIT"

if [[ "${BUILDKITE_PULL_REQUEST:-false}" == "false" ]]; then
  PR_NUMBER="$GITHUB_PR_NUMBER"
else
  PR_NUMBER="$BUILDKITE_PULL_REQUEST"
fi

CLOUD_DEPLOYMENT_NAME="kibana-pr-$PR_NUMBER"

set +e
DISTRIBUTION_EXISTS=$(docker manifest inspect $KIBANA_CLOUD_IMAGE &> /dev/null; echo $?)
set -e

if  [ $DISTRIBUTION_EXISTS -eq 0 ]; then
  echo "Distribution already exists, skipping build"
else
  node scripts/build \
    --skip-initialize \
    --skip-generic-folders \
    --skip-platform-folders \
    --skip-archives \
    --skip-cdn-assets \
    --tar-zstd \
    --docker-images \
    --docker-tag-qualifier="$GIT_COMMIT" \
    --docker-push \
    --skip-docker-ubi \
    --skip-docker-fips \
    --skip-docker-cloud-fips \
    --skip-docker-wolfi \
    --skip-docker-serverless \
    --skip-docker-contexts
fi

if is_pr_with_label "ci:cloud-redeploy" || is_pr_with_label "ci:entity-store-performance"; then
  echo "--- Shutdown Previous Deployment"
  CLOUD_DEPLOYMENT_ID=$(ecctl deployment list --output json | jq -r '.deployments[] | select(.name == "'$CLOUD_DEPLOYMENT_NAME'") | .id')
  if [ -z "${CLOUD_DEPLOYMENT_ID}" ] || [ "${CLOUD_DEPLOYMENT_ID}" == "null" ]; then
    echo "No deployment to remove"
  else
    echo "Shutting down previous deployment..."
    ecctl deployment shutdown "$CLOUD_DEPLOYMENT_ID" --force --track --output json > "$ECCTL_LOGS"
  fi
fi

echo "--- Create Deployment"
CLOUD_DEPLOYMENT_ID=$(ecctl deployment list --output json | jq -r '.deployments[] | select(.name == "'$CLOUD_DEPLOYMENT_NAME'") | .id')
if [ -z "${CLOUD_DEPLOYMENT_ID}" ] || [ "${CLOUD_DEPLOYMENT_ID}" = 'null' ]; then
  jq '
    .resources.kibana[0].plan.kibana.docker_image = "'$KIBANA_CLOUD_IMAGE'" |
    .resources.elasticsearch[0].plan.elasticsearch.docker_image = "'$ELASTICSEARCH_CLOUD_IMAGE'" |
    .name = "'$CLOUD_DEPLOYMENT_NAME'" |
    .resources.kibana[0].plan.kibana.version = "'$VERSION'" |
    .resources.elasticsearch[0].plan.elasticsearch.version = "'$VERSION'" |
    .resources.integrations_server[0].plan.integrations_server.version = "'$VERSION'" |
    .resources.kibana[0].plan.cluster_topology[0].size.value = '$KIBANA_MEMORY_SIZE' |
    (.resources.elasticsearch[0].plan.cluster_topology[] | select(.zone_count != null) | .zone_count) = '$ES_ZONE_COUNT' |
    (.resources.elasticsearch[0].plan.cluster_topology[] | select(.id == "hot_content") | .size.value) = '$ES_HOT_TIER_MEMORY_SIZE'
    ' .buildkite/scripts/steps/cloud/deploy.json > /tmp/deploy.json

  # Verify that zone_count was set (at least one topology element should have zone_count)
  if ! jq -e '.resources.elasticsearch[0].plan.cluster_topology[]? | select(.zone_count != null) | .zone_count' /tmp/deploy.json > /dev/null 2>&1; then
    echo "⚠️  Warning: No cluster_topology elements with zone_count found in deployment configuration"
  fi

  echo "Creating deployment..."
  ecctl deployment create --track --output json --file /tmp/deploy.json > "$ECCTL_LOGS"

  CLOUD_DEPLOYMENT_USERNAME=$(jq --slurp '.[]|select(.resources).resources[] | select(.credentials).credentials.username' "$ECCTL_LOGS")
  CLOUD_DEPLOYMENT_PASSWORD=$(jq --slurp '.[]|select(.resources).resources[] | select(.credentials).credentials.password' "$ECCTL_LOGS")
  CLOUD_DEPLOYMENT_ID=$(jq -r --slurp '.[0].id' "$ECCTL_LOGS")
  CLOUD_DEPLOYMENT_STATUS_MESSAGES=$(jq --slurp '[.[]|select(.resources == null)]' "$ECCTL_LOGS")

  echo "Writing to vault..."

  set_in_legacy_vault "$CLOUD_DEPLOYMENT_NAME" \
    username="$CLOUD_DEPLOYMENT_USERNAME" \
    password="$CLOUD_DEPLOYMENT_PASSWORD"

  echo "Enabling Stack Monitoring..."
  jq '
    .settings.observability.metrics.destination.deployment_id = "'$CLOUD_DEPLOYMENT_ID'" |
    .settings.observability.logging.destination.deployment_id = "'$CLOUD_DEPLOYMENT_ID'"
    ' .buildkite/scripts/steps/cloud/stack_monitoring.json > /tmp/stack_monitoring.json

  # After a deployment is created, a new Kibana plan is automatically added to update settings
  # and restart Kibana.  Polling for a plan state isn't especially reliable because it flips
  # between empty and queued, and then empty again depending on how quickly setup is run in cloud.
  # We want to enable monitoring after the automatic plan has run, if not we get an error:
  # * deployments.resource_plan_state_error: Kibana resource [main-kibana] has a plan still pending, cancel that or wait for it to complete (settings.observability.plan)
  # This adds a sleep and retry to see if we can make this step more reliable
  sleep 120
  retry 5 60 ecctl deployment update "$CLOUD_DEPLOYMENT_ID" --track --output json --file /tmp/stack_monitoring.json > "$ECCTL_LOGS"

  echo "Enabling verbose logging and EARS..."
  ecctl deployment show "$CLOUD_DEPLOYMENT_ID" --generate-update-payload | jq '
    .resources.kibana[0].plan.kibana.user_settings_yaml = "logging.root.level: all" |
    .resources.kibana[0].plan.kibana.user_settings_override_json = {"xpack.actions.auth.ears.enabled": true, "xpack.actions.auth.ears.enableExperimental": true}
    ' > /tmp/verbose_logging.json
  ecctl deployment update "$CLOUD_DEPLOYMENT_ID" --track --output json --file /tmp/verbose_logging.json > "$ECCTL_LOGS"
else
  ecctl deployment show "$CLOUD_DEPLOYMENT_ID" --generate-update-payload | jq '
    .resources.kibana[0].plan.kibana.docker_image = "'$KIBANA_CLOUD_IMAGE'" |
    .resources.kibana[0].plan.kibana.user_settings_override_json = {"xpack.actions.auth.ears.enabled": true, "xpack.actions.auth.ears.enableExperimental": true} |
    (.. | select(.version? != null).version) = "'$VERSION'" |
    (.resources.elasticsearch[0].plan.cluster_topology[]? | select(.zone_count != null) | .zone_count) = '$ES_ZONE_COUNT' |
    (.resources.elasticsearch[0].plan.cluster_topology[]? | select(.id == "hot_content") | .size.value) = '$ES_HOT_TIER_MEMORY_SIZE'
    ' > /tmp/deploy.json

  # Verify that zone_count was set (at least one topology element should have zone_count)
  if ! jq -e '.resources.elasticsearch[0].plan.cluster_topology[]? | select(.zone_count != null) | .zone_count' /tmp/deploy.json > /dev/null 2>&1; then
    echo "⚠️  Warning: No cluster_topology elements with zone_count found in deployment update payload"
  fi

  echo "Updating deployment..."
  ecctl deployment update "$CLOUD_DEPLOYMENT_ID" --track --output json --file /tmp/deploy.json > "$ECCTL_LOGS"
fi

VAULT_READ_COMMAND=$(print_legacy_vault_read "$CLOUD_DEPLOYMENT_NAME")

CLOUD_DEPLOYMENT_KIBANA_URL=$(ecctl deployment show "$CLOUD_DEPLOYMENT_ID" | jq -r '.resources.kibana[0].info.metadata.aliased_url')
CLOUD_DEPLOYMENT_ELASTICSEARCH_URL=$(ecctl deployment show "$CLOUD_DEPLOYMENT_ID" | jq -r '.resources.elasticsearch[0].info.metadata.aliased_url')

cat << EOF | buildkite-agent annotate --style "info" --context cloud
### Cloud Deployment

Kibana: $CLOUD_DEPLOYMENT_KIBANA_URL

Elasticsearch: $CLOUD_DEPLOYMENT_ELASTICSEARCH_URL

Credentials: \`$VAULT_READ_COMMAND\`

Kibana image: \`$KIBANA_CLOUD_IMAGE\`

Elasticsearch image: \`$ELASTICSEARCH_CLOUD_IMAGE\`
EOF

buildkite-agent meta-data set pr_comment:deploy_cloud:head "* [Cloud Deployment](${CLOUD_DEPLOYMENT_KIBANA_URL})"
buildkite-agent meta-data set pr_comment:early_comment_job_id "$BUILDKITE_JOB_ID"
