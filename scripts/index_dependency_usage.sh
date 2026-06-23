#!/bin/bash
# Index per-(package, dep) dependency usage docs into Elasticsearch.
#
# Requires: Node 24+ (uses --experimental-strip-types to run TS natively)
#           and root node_modules installed (yarn install).
#
# Usage:
#   bash scripts/index_dependency_usage.sh --group <group> [options]
#   bash scripts/index_dependency_usage.sh --paths <path>... [options]
#
# Environment variables:
#   ELASTICSEARCH_URL      ES base URL (default: https://localhost:9200)
#   ELASTICSEARCH_API_KEY  API key for authentication
#
# Examples:
#   # Dry-run a single package
#   bash scripts/index_dependency_usage.sh --paths x-pack/platform/plugins/shared/security -n
#
#   # Index the platform group
#   bash scripts/index_dependency_usage.sh --group platform
#
#   # Index all solutions against Elastic Cloud
#   ELASTICSEARCH_URL=https://my-deployment.es.us-east-1.aws.elastic-cloud.com \
#   ELASTICSEARCH_API_KEY=id:key \
#   bash scripts/index_dependency_usage.sh --group solutions

# Node 24 runs TypeScript natively via --experimental-strip-types.
# NODE_TLS_REJECT_UNAUTHORIZED=0 allows self-signed certs used by local
# serverless clusters; has no effect against valid Elastic Cloud certs.
NODE_OPTIONS="--max-old-space-size=8192" NODE_NO_WARNINGS=1 NODE_TLS_REJECT_UNAUTHORIZED=0 \
node --experimental-strip-types packages/kbn-dependency-usage/src/indexer/cli.ts "$@"
