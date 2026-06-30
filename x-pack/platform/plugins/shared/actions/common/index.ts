/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// TODO: https://github.com/elastic/kibana/issues/110895

export type {
  SubFeature,
  ActionType,
  ActionTypeSource,
  ValidatedEmail,
  ActionTypeExecutorResult,
  ActionTypeExecutorRawResult,
  ActionsPublicConfigType,
} from './types';
export { InvalidEmailReason, isActionTypeExecutorResult } from './types';
export {
  AlertHistoryDefaultIndexName,
  AlertHistoryEsIndexConnectorId,
  buildAlertHistoryDocument,
  AlertHistoryDocumentTemplate,
} from './alert_history_schema';
export type {
  AsApiContract,
  RewriteRequestCase,
  RewriteResponseCase,
} from './rewrite_request_case';
export {
  MustacheInEmailRegExp,
  hasMustacheTemplate,
  withoutMustacheTemplate,
} from './mustache_template';
export type { ValidateEmailAddressesOptions } from './validate_email_addresses';
export {
  validateEmailAddressesAsAlwaysValid,
  validateEmailAddresses,
  invalidEmailsAsMessage,
} from './validate_email_addresses';
export {
  AlertingConnectorFeatureId,
  CasesConnectorFeatureId,
  UptimeConnectorFeatureId,
  SecurityConnectorFeatureId,
  GenerativeAIForSecurityConnectorFeatureId,
  GenerativeAIForObservabilityConnectorFeatureId,
  GenerativeAIForSearchPlaygroundConnectorFeatureId,
  EndpointSecurityConnectorFeatureId,
  WorkflowsConnectorFeatureId,
  AgentBuilderConnectorFeatureId,
  AlertingConnectorFeature,
  CasesConnectorFeature,
  UptimeConnectorFeature,
  SecuritySolutionFeature,
  GenerativeAIForSecurityFeature,
  GenerativeAIForObservabilityFeature,
  GenerativeAIForSearchPlaygroundFeature,
  EndpointSecurityConnectorFeature,
  WorkflowsConnectorFeature,
  AgentBuilderConnectorFeature,
  areValidFeatures,
  getConnectorFeatureName,
  getConnectorCompatibility,
} from './connector_feature_config';
export type {
  IExecutionLog,
  IExecutionLogResult,
  GetGlobalExecutionLogParams,
  GetGlobalExecutionKPIParams,
  IExecutionKPIResult,
  ExecutionLogSortFields,
} from './execution_log_types';
export { EMPTY_EXECUTION_KPI_RESULT, executionLogSortableColumns } from './execution_log_types';
export { validateEmptyStrings } from './validate_empty_strings';

export const BASE_ACTION_API_PATH = '/api/actions';
export const INTERNAL_BASE_ACTION_API_PATH = '/internal/actions';
export const ACTIONS_FEATURE_ID = 'actions';

export const DEFAULT_MICROSOFT_EXCHANGE_URL = 'https://login.microsoftonline.com';
export const DEFAULT_MICROSOFT_GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
export const DEFAULT_MICROSOFT_GRAPH_API_SCOPE = 'https://graph.microsoft.com/.default';

// Default == max, which we will change later when we have more
// information on email sizes.  Greater than 25MB does seem to cause
// OOMs, so that seems like a safe limit for now.
export const MAX_EMAIL_BODY_LENGTH = 25 * 1000 * 1000; // 25MB

export const CONNECTOR_ID_MAX_LENGTH = 36;
export const ISO_DATE_MAX_LENGTH = 100;
export const MAX_EXECUTION_FILTER_LENGTH = 8192;
export const MAX_FEATURE_ID_LENGTH = 100;
export const DEFAULT_EMAIL_BODY_LENGTH = MAX_EMAIL_BODY_LENGTH;

export type {
  StartOAuthFlowRequestBody,
  StartOAuthFlowPathParams,
  StartOAuthFlowResponse,
  DisconnectOAuthPathParams,
  CancelOAuthPathParams,
  CancelOAuthBody,
} from './routes/connector/apis/oauth';
export {
  OAuthAuthorizationStatus,
  OAUTH_CALLBACK_QUERY_PARAMS,
  OAUTH_BROADCAST_CHANNEL_NAME,
} from './oauth_callback';
