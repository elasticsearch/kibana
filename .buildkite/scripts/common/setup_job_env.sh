#!/usr/bin/env bash

set -euo pipefail

echo '--- Job Environment Setup'

if [[ "$(type -t vault_get)" != "function" ]]; then
  source .buildkite/scripts/common/vault_fns.sh
fi

source .buildkite/scripts/common/util.sh

# Set up general-purpose tokens and credentials
{
  BUILDKITE_TOKEN="$(vault_get buildkite-ci buildkite_token_all_jobs)"
  export BUILDKITE_TOKEN

  GITHUB_TOKEN=$(vault_get kibanamachine github_token)
  export GITHUB_TOKEN

  KIBANA_DOCKER_USERNAME="$(vault_get container-registry username)"
  KIBANA_DOCKER_PASSWORD="$(vault_get container-registry password)"
  function docker_login() {
      if (command -v docker && docker version) &> /dev/null; then
        echo "$KIBANA_DOCKER_PASSWORD" | docker login -u "$KIBANA_DOCKER_USERNAME" --password-stdin docker.elastic.co
      fi
  }
  retry 5 15 docker_login
}

# Set up a custom ES Snapshot Manifest if one has been specified for this build
{
  ES_SNAPSHOT_MANIFEST=${ES_SNAPSHOT_MANIFEST:-$(buildkite-agent meta-data get ES_SNAPSHOT_MANIFEST --default '')}
  export ES_SNAPSHOT_MANIFEST

  if [[ "${ES_SNAPSHOT_MANIFEST:-}" ]]; then
  cat << EOF | buildkite-agent annotate --style "info" --context es-snapshot-manifest
  This build is running using a custom Elasticsearch snapshot.

  ES Snapshot Manifest: $ES_SNAPSHOT_MANIFEST

  To use this locally, simply prefix your commands with:

  \`\`\`
  ES_SNAPSHOT_MANIFEST="$ES_SNAPSHOT_MANIFEST"
  \`\`\`

  e.g.

  \`\`\`
  ES_SNAPSHOT_MANIFEST="$ES_SNAPSHOT_MANIFEST" node scripts/functional_tests_server.js
  \`\`\`
EOF
  fi
}

# If a custom manifest isn't specified, then use the default one that we resolve earlier in the build
{
  if [[ ! "${ES_SNAPSHOT_MANIFEST:-}" ]]; then
    ES_SNAPSHOT_MANIFEST=${ES_SNAPSHOT_MANIFEST:-$(buildkite-agent meta-data get ES_SNAPSHOT_MANIFEST_DEFAULT --default '')}
    export ES_SNAPSHOT_MANIFEST
    echo "Using default ES Snapshot Manifest: $ES_SNAPSHOT_MANIFEST"
  fi
}

# Setup CI Stats
{
  CI_STATS_BUILD_ID="$(buildkite-agent meta-data get ci_stats_build_id --default '')"
  export CI_STATS_BUILD_ID

  CI_STATS_TOKEN="$(vault_get kibana_ci_stats api_token)"
  export CI_STATS_TOKEN

  CI_STATS_HOST="$(vault_get kibana_ci_stats api_host)"
  export CI_STATS_HOST

  if [[ "$CI_STATS_BUILD_ID" ]]; then
    echo "CI Stats Build ID: $CI_STATS_BUILD_ID"

    KIBANA_CI_STATS_CONFIG=$(jq -n \
      --arg buildId "$CI_STATS_BUILD_ID" \
      --arg apiUrl "https://$CI_STATS_HOST" \
      --arg apiToken "$CI_STATS_TOKEN" \
      '{buildId: $buildId, apiUrl: $apiUrl, apiToken: $apiToken}' \
    )
    export KIBANA_CI_STATS_CONFIG
  fi
}

# Set up misc keys
{
  EC_API_KEY="$(vault_get kibana-ci-cloud-deploy pr_deploy_api_key)"
  export EC_API_KEY

  PROJECT_API_KEY="$(vault_get kibana-ci-project-deploy pr_deploy_api_key)"
  export PROJECT_API_KEY

  PROJECT_API_DOMAIN="$(vault_get kibana-ci-project-deploy pr_deploy_domain)"
  export PROJECT_API_DOMAIN

  DEPLOY_TAGGER_SLACK_WEBHOOK_URL=${DEPLOY_TAGGER_SLACK_WEBHOOK_URL:-"$(vault_get kibana-serverless-release-tools DEPLOY_TAGGER_SLACK_WEBHOOK_URL)"}
  export DEPLOY_TAGGER_SLACK_WEBHOOK_URL

  # unset APM creds to ensure APM data gets sent to preconfigured APM cluster (kibana-cloud-apm)
  if ! is_pr_with_label "ci:collect-apm"; then
    ELASTIC_APM_SERVER_URL=$(vault_get project-kibana-ci-apm apm_server_url)
    export ELASTIC_APM_SERVER_URL

    ELASTIC_APM_API_KEY=$(vault_get project-kibana-ci-apm apm_server_api_key)
    export ELASTIC_APM_API_KEY
  fi
}

# Set up GenAI keys
{
  if [[ "${FTR_GEN_AI:-}" =~ ^(1|true)$ ]]; then
    echo "FTR_GEN_AI was set - exposing LLM connectors"
    export KIBANA_TESTING_AI_CONNECTORS="$(vault_get ai-infra-ci-connectors connectors-config)"
  fi
}

# Set up Security GenAI keys
{
  if [[ "${FTR_SECURITY_GEN_AI:-}" =~ ^(1|true)$ ]]; then
    echo "FTR_SECURITY_GEN_AI was set - exposing LLM connectors"
    export KIBANA_SECURITY_GEN_AI_CONFIG="$(vault_get security-gen-ai config)"
  fi
}

# Set up Kibana Evals secrets
{
  if [[ "${KBN_EVALS:-}" =~ ^(1|true)$ ]]; then
    echo "KBN_EVALS was set - exposing evals connectors and export credentials"

    KBN_EVALS_CONFIG_JSON="$(vault_get kbn-evals config | base64 -d)"
    # Validate config shape (safe; does not print secrets)
    node x-pack/platform/packages/shared/kbn-evals/scripts/vault/validate_config.js --stdin <<<"$KBN_EVALS_CONFIG_JSON" >/dev/null

    # Eval suites require this for the LLM-as-a-judge connector selection
    export EVALUATION_CONNECTOR_ID="${EVALUATION_CONNECTOR_ID:-"$(jq -r '.evaluationConnectorId // empty' <<<"$KBN_EVALS_CONFIG_JSON")"}"

    # Exported for suite-owner triage when connector generation is skipped
    export LITELLM_BASE_URL="$(jq -r '.litellm.baseUrl // empty' <<<"$KBN_EVALS_CONFIG_JSON")"
    export LITELLM_VIRTUAL_KEY="$(jq -r '.litellm.virtualKey // empty' <<<"$KBN_EVALS_CONFIG_JSON")"

    # Export the vault config so eval-owned scripts can extract LiteLLM / connector
    # settings without needing vault access themselves.
    # Connector generation happens in .buildkite/scripts/steps/evals/setup_connectors.sh.
    export KBN_EVALS_CONFIG_B64
    KBN_EVALS_CONFIG_B64="$(printf '%s' "$KBN_EVALS_CONFIG_JSON" | base64)"

    # Optional: separate cluster for trace-based evaluators
    export TRACING_ES_URL="$(jq -r '.tracingEs.url // empty' <<<"$KBN_EVALS_CONFIG_JSON")"
    export TRACING_ES_API_KEY="$(jq -r '.tracingEs.apiKey // empty' <<<"$KBN_EVALS_CONFIG_JSON")"

    # Optional: trace exporters for the Playwright worker process (supports http/grpc/phoenix/langfuse)
    TRACING_EXPORTERS_JSON="$(jq -c '.tracingExporters // empty' <<<"$KBN_EVALS_CONFIG_JSON")"
    if [[ -n "$TRACING_EXPORTERS_JSON" && "$TRACING_EXPORTERS_JSON" != "null" ]]; then
      export TRACING_EXPORTERS="$TRACING_EXPORTERS_JSON"
    fi

    # Optional: Remote Kibana for managed dataset operations (golden cluster)
    EVALUATIONS_KBN_URL="$(jq -r '.evaluationsKbn.url // empty' <<<"$KBN_EVALS_CONFIG_JSON")"
    if [[ -n "$EVALUATIONS_KBN_URL" ]]; then
      export EVALUATIONS_KBN_URL
      export EVALUATIONS_KBN_API_KEY="$(jq -r '.evaluationsKbn.apiKey // empty' <<<"$KBN_EVALS_CONFIG_JSON")"
    fi

    # Optional: GCS service account credentials for snapshot restoration (e.g. AI Insights)
    export GCS_CREDENTIALS="$(jq -c '.gcsDatasetAccessCredentials // empty' <<<"$KBN_EVALS_CONFIG_JSON")"
  fi
}

# Set up GCS Service Account for CDN
{
  GCS_SA_CDN_KEY="$(vault_get gcs-sa-cdn-prod key)"
  export GCS_SA_CDN_KEY

  GCS_SA_CDN_EMAIL="$(vault_get gcs-sa-cdn-prod email)"
  export GCS_SA_CDN_EMAIL

  GCS_SA_CDN_BUCKET="$(vault_get gcs-sa-cdn-prod bucket)"
  export GCS_SA_CDN_BUCKET

  GCS_SA_CDN_URL="$(vault_get gcs-sa-cdn-prod cdn)"
  export GCS_SA_CDN_URL
}

# Setup Failed Test Reporter Elasticsearch credentials
{
  TEST_FAILURES_ES_CLOUD_ID=$(vault_get failed_tests_reporter_es cloud_id)
  export TEST_FAILURES_ES_CLOUD_ID

  TEST_FAILURES_ES_USERNAME=$(vault_get failed_tests_reporter_es username)
  export TEST_FAILURES_ES_USERNAME

  TEST_FAILURES_ES_PASSWORD=$(vault_get failed_tests_reporter_es password)
  export TEST_FAILURES_ES_PASSWORD
}

# Scout reporter settings
{
  export SCOUT_REPORTER_ENABLED="${SCOUT_REPORTER_ENABLED:-false}"

  SCOUT_REPORTER_ES_URL="$(vault_get scout/reporter/cluster-credentials es-url)"
  export SCOUT_REPORTER_ES_URL

  SCOUT_REPORTER_ES_API_KEY="$(vault_get scout/reporter/cluster-credentials es-api-key)"
  export SCOUT_REPORTER_ES_API_KEY
}

# Setup GCS Service Account Proxy for CI
{
  KIBANA_SERVICE_ACCOUNT_PROXY_KEY="$(mktemp -d)/kibana-gcloud-service-account.json"
  export KIBANA_SERVICE_ACCOUNT_PROXY_KEY
  vault_get kibana-ci-sa-proxy-key key | base64 -d > "$KIBANA_SERVICE_ACCOUNT_PROXY_KEY"
}

# Acquire credentials for legacy vault if needed
{
  VAULT_ROLE_ID="$(vault_get kibana-buildkite-vault-credentials role-id)"
  export VAULT_ROLE_ID
  VAULT_SECRET_ID="$(vault_get kibana-buildkite-vault-credentials secret-id)"
  export VAULT_SECRET_ID
}

# Set up EIS Cloud Connected Mode (CCM) API key
# Note: This secret is in the legacy vault, requires approle authentication
{
  if [[ "${FTR_EIS_CCM:-}" =~ ^(1|true)$ ]]; then
    echo "FTR_EIS_CCM was set - exposing EIS CCM API key"
    VAULT_TOKEN_COPY="${VAULT_TOKEN:-}"
    VAULT_TOKEN=$(VAULT_ADDR=$LEGACY_VAULT_ADDR vault write -field=token auth/approle/login role_id="$VAULT_ROLE_ID" secret_id="$VAULT_SECRET_ID")
    VAULT_ADDR=$LEGACY_VAULT_ADDR vault login -no-print "$VAULT_TOKEN"
    export KIBANA_EIS_CCM_API_KEY="$(vault read -address=$LEGACY_VAULT_ADDR -field key secret/kibana-issues/dev/inference/kibana-eis-ccm)"
    VAULT_TOKEN="$VAULT_TOKEN_COPY"
  fi
}

# Inject moon remote-cache credentials on CI
if [[ "${CI:-}" =~ ^(1|true)$ ]]; then
  MOON_REMOTE_CACHE_TOKEN=$(vault_get moon-remote-cache token)
  export MOON_REMOTE_CACHE_TOKEN
fi

PIPELINE_PRE_COMMAND=${PIPELINE_PRE_COMMAND:-".buildkite/scripts/lifecycle/pipelines/$BUILDKITE_PIPELINE_SLUG/pre_command.sh"}
if [[ -f "$PIPELINE_PRE_COMMAND" ]]; then
  source "$PIPELINE_PRE_COMMAND"
fi
