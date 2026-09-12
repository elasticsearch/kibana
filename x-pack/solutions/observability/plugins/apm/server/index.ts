/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { offeringBasedSchema, schema } from '@kbn/config-schema';
import type { PluginConfigDescriptor, PluginInitializerContext } from '@kbn/core/server';
import { maxSuggestions } from '@kbn/observability-plugin/common';
import { SearchAggregatedTransactionSetting } from '../common/aggregated_transactions';

const disabledOnServerless = offeringBasedSchema({
  serverless: schema.boolean({
    defaultValue: false,
  }),
  traditional: schema.oneOf([schema.literal(true)], { defaultValue: true }),
});

// All options should be documented in the APM configuration settings: https://github.com/elastic/kibana/blob/main/docs/settings/apm-settings.asciidoc
// and be included on cloud allow list unless there are specific reasons not to
const configSchema = schema.object({
  autoCreateApmDataView: schema.boolean({ defaultValue: true }),
  serviceMapEnabled: schema.boolean({ defaultValue: true }),
  serviceMapFingerprintBucketSize: schema.number({ defaultValue: 100 }),
  serviceMapFingerprintGlobalBucketSize: schema.number({
    defaultValue: 1000,
  }),
  serviceMapMaxAllowableBytes: schema.number({ defaultValue: 2_576_980_377 }), // 2.4GB
  serviceMapTraceIdBucketSize: schema.number({ defaultValue: 65 }),
  serviceMapTraceIdGlobalBucketSize: schema.number({ defaultValue: 6 }),
  serviceMapMaxTracesPerRequest: schema.number({ defaultValue: 50 }),
  serviceMapTerminateAfter: schema.number({ defaultValue: 100_000 }),
  serviceMapMaxTraces: schema.number({ defaultValue: 1000 }),
  ui: schema.object({
    enabled: schema.boolean({ defaultValue: true }),
    maxTraceItems: schema.number({ defaultValue: 5000 }),
  }),
  searchAggregatedTransactions: schema.oneOf(
    [
      schema.literal(SearchAggregatedTransactionSetting.auto),
      schema.literal(SearchAggregatedTransactionSetting.always),
      schema.literal(SearchAggregatedTransactionSetting.never),
    ],
    { defaultValue: SearchAggregatedTransactionSetting.auto }
  ),
  telemetryCollectionEnabled: schema.boolean({ defaultValue: true }),
  metricsInterval: schema.number({ defaultValue: 30 }),
  agent: schema.object({
    migrations: schema.object({
      enabled: schema.boolean({ defaultValue: false }),
    }),
  }),

  forceSyntheticSource: schema.boolean({ defaultValue: false }), // deprecated
  latestAgentVersionsUrl: schema.string({
    defaultValue: 'https://apm-agent-versions.elastic.co/versions.json',
  }),
  enabled: schema.boolean({ defaultValue: true }),
  serverlessOnboarding: offeringBasedSchema({
    serverless: schema.boolean({ defaultValue: false }),
  }),
  managedServiceUrl: offeringBasedSchema({
    serverless: schema.string({ defaultValue: '' }),
  }),
  managedOtlpServiceUrl: offeringBasedSchema({
    serverless: schema.string({ defaultValue: '' }),
  }),
  featureFlags: schema.object({
    agentConfigurationAvailable: disabledOnServerless,
    configurableIndicesAvailable: disabledOnServerless,
    infrastructureTabAvailable: disabledOnServerless,
    infraUiAvailable: disabledOnServerless,
    migrationToFleetAvailable: disabledOnServerless,
    sourcemapApiAvailable: disabledOnServerless,
    storageExplorerAvailable: disabledOnServerless,
    // to be removed in https://github.com/elastic/kibana/issues/221904
    profilingIntegrationAvailable: schema.boolean({ defaultValue: false }),
    ruleFormV2Enabled: schema.boolean({ defaultValue: false }),
    traceChartEngine: schema.boolean({ defaultValue: false }),
  }),
  serverless: schema.object({
    enabled: offeringBasedSchema({
      serverless: schema.literal(true),
      options: { defaultValue: schema.contextRef('serverless') },
    }),
  }),
});

// plugin config
export const config: PluginConfigDescriptor<APMConfig> = {
  deprecations: ({ rename, unused, renameFromRoot, deprecateFromRoot, unusedFromRoot }) => [
    unused('ui.transactionGroupBucketSize', {
      level: 'warning',
    }),
    rename('autocreateApmIndexPattern', 'autoCreateApmDataView', {
      level: 'warning',
    }),
    deprecateFromRoot('apm_oss.enabled', '8.0.0', { level: 'warning' }),
    unusedFromRoot('apm_oss.fleetMode', { level: 'warning' }),
    unusedFromRoot('apm_oss.indexPattern', { level: 'warning' }),
    renameFromRoot('apm_oss.traceChartEngine', 'xpack.apm.featureFlags.traceChartEngine', {
      level: 'warning',
    }),
    renameFromRoot('xpack.apm.maxServiceEnvironments', `uiSettings.overrides[${maxSuggestions}]`, {
      level: 'warning',
    }),
    renameFromRoot('xpack.apm.maxServiceSelection', `uiSettings.overrides[${maxSuggestions}]`, {
      level: 'warning',
    }),
    unused('forceSyntheticSource', {
      level: 'warning',
    }),
  ],
  exposeToBrowser: {
    serviceMapEnabled: true,
    ui: true,
    latestAgentVersionsUrl: true,
    managedServiceUrl: true,
    serverlessOnboarding: true,
    featureFlags: true,
    serverless: true,
  },
  schema: configSchema,
};

export type APMConfig = TypeOf<typeof configSchema>;

export const plugin = async (initContext: PluginInitializerContext) => {
  const { APMPlugin } = await import('./plugin');
  return new APMPlugin(initContext);
};

export { APM_SERVER_FEATURE_ID } from '../common/rules/apm_rule_types';
export type { APMPluginSetup } from './types';
export type {
  APMServerRouteRepository,
  APIEndpoint,
} from './routes/apm_routes/get_global_apm_server_route_repository';
