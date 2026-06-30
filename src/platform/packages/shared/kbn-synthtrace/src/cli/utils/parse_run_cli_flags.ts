/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { existsSync } from 'fs';
import { pick } from 'lodash';
import path from 'path';
import { LogLevel } from '../../lib/utils/create_logger';
import type { RunCliFlags } from '../run_synthtrace';
import { discoverRepoRoot } from './read_kibana_config';

const REPO_ROOT = discoverRepoRoot();

/**
 * Maps short scenario names to their colocated plugin paths.
 * Populated when scenarios were moved out of @kbn/synthtrace in
 * https://github.com/elastic/kibana/pull/270157.
 */
const SCENARIO_ALIASES: Record<string, string> = {
  agent_config: 'x-pack/solutions/observability/plugins/apm/test/scenarios/agent_config.ts',
  apache_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/apache_logs.ts',
  apm_anomalies: 'x-pack/solutions/observability/plugins/apm/test/scenarios/apm_anomalies.ts',
  apm_jvm_metrics_type_conflict:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/apm_jvm_metrics_type_conflict.ts',
  apm_metrics_dashboards:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/apm_metrics_dashboards.ts',
  apm_ml_anomalies: 'x-pack/solutions/observability/plugins/apm/test/scenarios/apm_ml_anomalies.ts',
  apm_service_legacy_to_otel_metrics:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/apm_service_legacy_to_otel_metrics.ts',
  apm_service_multi_env_otel_migration:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/apm_service_multi_env_otel_migration.ts',
  apm_service_overlapping_otel_metrics:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/apm_service_overlapping_otel_metrics.ts',
  aws_lambda: 'x-pack/solutions/observability/plugins/apm/test/scenarios/aws_lambda.ts',
  azure_functions: 'x-pack/solutions/observability/plugins/apm/test/scenarios/azure_functions.ts',
  cloud_services_icons:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/cloud_services_icons.ts',
  complete_trace: 'x-pack/solutions/observability/plugins/apm/test/scenarios/complete_trace.ts',
  composite_spans: 'x-pack/solutions/observability/plugins/apm/test/scenarios/composite_spans.ts',
  continuous_rollups:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/continuous_rollups.ts',
  degraded_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/degraded_logs.ts',
  degraded_synthetics_monitors:
    'x-pack/solutions/observability/plugins/synthetics/test/scenarios/degraded_synthetics_monitors.ts',
  diagnostic_service_map:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/diagnostic_service_map.ts',
  distributed_trace:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/distributed_trace.ts',
  distributed_trace_long:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/distributed_trace_long.ts',
  error_with_missing_transaction_sampled:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/error_with_missing_transaction_sampled.ts',
  failed_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/failed_logs.ts',
  high_throughput: 'x-pack/solutions/observability/plugins/apm/test/scenarios/high_throughput.ts',
  http_access_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/http_access_logs.ts',
  http_access_logs_otel:
    'x-pack/platform/plugins/shared/streams/test/scenarios/http_access_logs_otel.ts',
  infra_aws_rds: 'x-pack/solutions/observability/plugins/infra/test/scenarios/infra_aws_rds.ts',
  infra_docker_containers:
    'x-pack/solutions/observability/plugins/infra/test/scenarios/infra_docker_containers.ts',
  infra_hosts_ecs: 'x-pack/solutions/observability/plugins/infra/test/scenarios/infra_hosts_ecs.ts',
  infra_hosts_semconv:
    'x-pack/solutions/observability/plugins/infra/test/scenarios/infra_hosts_semconv.ts',
  infra_k8s_containers:
    'x-pack/solutions/observability/plugins/infra/test/scenarios/infra_k8s_containers.ts',
  infra_k8s_pods: 'x-pack/solutions/observability/plugins/infra/test/scenarios/infra_k8s_pods.ts',
  kafka_topics: 'x-pack/solutions/observability/plugins/apm/test/scenarios/kafka_topics.ts',
  kubernetes_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/kubernetes_logs.ts',
  low_throughput: 'x-pack/solutions/observability/plugins/apm/test/scenarios/low_throughput.ts',
  many_dependencies:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/many_dependencies.ts',
  many_errors: 'x-pack/solutions/observability/plugins/apm/test/scenarios/many_errors.ts',
  many_instances: 'x-pack/solutions/observability/plugins/apm/test/scenarios/many_instances.ts',
  many_otel_services:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/many_otel_services.ts',
  many_services: 'x-pack/solutions/observability/plugins/apm/test/scenarios/many_services.ts',
  many_transactions:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/many_transactions.ts',
  messaging_systems_mixed:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/messaging_systems_mixed.ts',
  missing_service_environment:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/missing_service_environment.ts',
  mobile: 'x-pack/solutions/observability/plugins/apm/test/scenarios/mobile.ts',
  otel_exit_span_missing_destination:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/otel_exit_span_missing_destination.ts',
  otel_logs_and_metrics_only:
    'x-pack/platform/plugins/shared/streams/test/scenarios/otel_logs_and_metrics_only.ts',
  otel_simple_trace:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/otel_simple_trace.ts',
  other_bucket_group:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/other_bucket_group.ts',
  sample_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/sample_logs.ts',
  serverless_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/serverless_logs.ts',
  service_map: 'x-pack/solutions/observability/plugins/apm/test/scenarios/service_map.ts',
  service_map_oom: 'x-pack/solutions/observability/plugins/apm/test/scenarios/service_map_oom.ts',
  service_summary_field_version_dependent:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/service_summary_field_version_dependent.ts',
  services_without_transactions:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/services_without_transactions.ts',
  simple_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/simple_logs.ts',
  simple_non_ecs_logs:
    'x-pack/platform/plugins/shared/streams/test/scenarios/simple_non_ecs_logs.ts',
  simple_otel_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/simple_otel_logs.ts',
  simple_trace: 'x-pack/solutions/observability/plugins/apm/test/scenarios/simple_trace.ts',
  slash_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/slash_logs.ts',
  span_links: 'x-pack/solutions/observability/plugins/apm/test/scenarios/span_links.ts',
  trace_with_long_service_names:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/trace_with_long_service_names.ts',
  trace_with_orphan_items:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/trace_with_orphan_items.ts',
  trace_with_service_names_with_slashes:
    'x-pack/solutions/observability/plugins/apm/test/scenarios/trace_with_service_names_with_slashes.ts',
  unstructured_logs: 'x-pack/platform/plugins/shared/streams/test/scenarios/unstructured_logs.ts',
  variance: 'x-pack/solutions/observability/plugins/apm/test/scenarios/variance.ts',
};

function getParsedFiles(flags: RunCliFlags) {
  const { _: parsedFiles } = flags;

  if (!parsedFiles.length) {
    throw new Error('Please specify at least one scenario to run');
  }

  const filesPath = parsedFiles.map((parsedFile) => {
    const aliasRelPath = SCENARIO_ALIASES[parsedFile];
    const candidates = [
      // Alias lookup for scenarios moved out of @kbn/synthtrace to plugin directories.
      ...(aliasRelPath ? [path.resolve(REPO_ROOT, aliasRelPath)] : []),
      // Built-in scenarios that remain in @kbn/synthtrace.
      path.resolve(__dirname, '../../scenarios', parsedFile),
      path.resolve(__dirname, '../../scenarios', `${parsedFile}.ts`),
      path.resolve(__dirname, '../../scenarios', `${parsedFile}.js`),
      // Absolute or CWD-relative path provided directly.
      path.resolve(parsedFile),
      path.resolve(`${parsedFile}.ts`),
    ];

    const foundPath = candidates.find((p) => existsSync(p));

    if (!foundPath) {
      throw new Error(`Could not find scenario file for: "${parsedFile}"`);
    }

    return foundPath;
  });

  return filesPath;
}

export function parseRunCliFlags(flags: RunCliFlags) {
  const { logLevel, target, debug, verbose } = flags;
  if (target?.includes('.kb.')) {
    throw new Error(`Target URL seems to be a Kibana URL, please provide Elasticsearch URL`);
  }
  const parsedFiles = getParsedFiles(flags);

  let parsedLogLevel = verbose ? LogLevel.verbose : debug ? LogLevel.debug : LogLevel.info;

  switch (logLevel) {
    case 'verbose':
      parsedLogLevel = LogLevel.verbose;
      break;

    case 'info':
      parsedLogLevel = LogLevel.info;
      break;

    case 'debug':
      parsedLogLevel = LogLevel.debug;
      break;

    case 'warn':
      parsedLogLevel = LogLevel.warn;
      break;

    case 'error':
      parsedLogLevel = LogLevel.error;
      break;
  }
  return {
    ...pick(
      flags,
      'target',
      'workers',
      'kibana',
      'apiKey',
      'concurrency',
      'versionOverride',
      'clean',
      'assume-package-version',
      'liveBucketSize',
      'uniqueIds',
      'insecure'
    ),
    scenarioOpts: flags.scenarioOpts as unknown as Record<string, unknown>,
    logLevel: parsedLogLevel,
    files: parsedFiles,
  };
}

export type RunOptions = ReturnType<typeof parseRunCliFlags>;
