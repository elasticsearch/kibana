/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { PluginConfigDescriptor, PluginInitializerContext } from '@kbn/core/server';
import type { RulesClient as RulesClientClass } from './rules_client';
import type { AlertingConfig } from './config';
import { configSchema } from './config';

export type RulesClient = PublicMethodsOf<RulesClientClass>;

export type {
  RuleType,
  ActionGroup,
  ActionGroupIdsOf,
  AlertingPlugin,
  RuleExecutorOptions,
  RuleExecutorServices,
  RuleActionParams,
  RuleTypeState,
  RuleTypeParams,
  PartialRule,
  AlertInstanceState,
  AlertInstanceContext,
  AlertingApiRequestHandlerContext,
  RuleParamsAndRefs,
  SummarizedAlertsChunk,
  ScopedQueryAlerts,
  ExecutorType,
  IRuleTypeAlerts,
  GetViewInAppRelativeUrlFnOpts,
  DataStreamAdapter,
  CpsData,
} from './types';
export { DEFAULT_AAD_CONFIG } from './types';
export { RULE_SAVED_OBJECT_TYPE, API_KEY_PENDING_INVALIDATION_TYPE } from './saved_objects';
export { RuleNotifyWhen } from '../common';
export type { AlertingServerSetup, AlertingServerStart } from './plugin';
export type {
  RuleQueryInspectorFn,
  RuleQueryInspectorResponse,
  RuleQueryInspectorResult,
  RuleQueryInspectorTimeRange,
} from './rule_query_inspector/types';
export type { RulesClientCreateOptions } from './rules_client_factory';
export type {
  FindResult,
  BulkEditOperation,
  BulkOperationError,
  GetRuleHistoryParams,
  RuleChangeHistoryDocument,
  GetRuleHistoryResult,
  RuleChangeTrackingDisabledError,
} from './rules_client';
export type {
  BulkCreateRulesItem,
  BulkCreateRulesParams,
  BulkCreateRulesResult,
} from './application/rule/methods/bulk_create';
export type { Rule } from './application/rule/types';
export type { PublicAlert as Alert } from './alert';
export { parseDuration, isRuleSnoozed } from './lib';
export { getEsErrorMessage } from './lib/errors';
export type { AlertingRulesConfig } from './config';
export {
  AlertingAuthorizationFilterType,
  AlertingAuthorization,
  ReadOperations,
  WriteOperations,
  AlertingAuthorizationEntity,
} from './authorization';
import { autocompleteConfigDeprecationProvider } from './config_deprecations';

export {
  DEFAULT_ALERTS_ILM_POLICY,
  DEFAULT_ALERTS_ILM_POLICY_NAME,
  ECS_COMPONENT_TEMPLATE_NAME,
  ECS_CONTEXT,
  TOTAL_FIELDS_LIMIT,
  VALID_ALERT_INDEX_PREFIXES,
  getComponentTemplate,
  type PublicFrameworkAlertsService,
  createOrUpdateIlmPolicy,
  createOrUpdateComponentTemplate,
  getIndexTemplate,
  createOrUpdateIndexTemplate,
  createConcreteWriteIndex,
  installWithTimeout,
  isValidAlertIndexName,
  InstallShutdownError,
} from './alerts_service';
export {
  sanitizeBulkErrorResponse,
  AlertsClientError,
  shouldCreateAlertsInAllSpaces,
} from './alerts_client';
export { getDataStreamAdapter } from './alerts_service/lib/data_stream_adapter';
export type { ConnectorAdapter } from './connector_adapters/types';

export const plugin = async (initContext: PluginInitializerContext) => {
  const { AlertingPlugin } = await import('./plugin');
  return new AlertingPlugin(initContext);
};

export const config: PluginConfigDescriptor<AlertingConfig> = {
  schema: configSchema,
  exposeToBrowser: {
    rules: { run: { alerts: { max: true } } },
    rulesSettings: { enabled: true },
    disabledRuleTypes: true,
    enabledRuleTypes: true,
  },
  deprecations: autocompleteConfigDeprecationProvider,
};
