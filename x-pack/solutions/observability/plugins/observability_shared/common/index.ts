/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  AlertConsumers,
  OBSERVABILITY_RULE_TYPE_IDS,
  STACK_RULE_TYPE_IDS_SUPPORTED_BY_OBSERVABILITY,
} from '@kbn/rule-data-utils';

export const observabilityFeatureId = 'observability';

/**
 * Combined list of all observability rule type IDs including stack rules
 * supported by observability.
 */
export const OBSERVABILITY_RULE_TYPE_IDS_WITH_SUPPORTED_STACK_RULE_TYPES = [
  ...OBSERVABILITY_RULE_TYPE_IDS,
  ...STACK_RULE_TYPE_IDS_SUPPORTED_BY_OBSERVABILITY,
];
export const observabilityAppId = 'observability-overview';
export const casesFeatureId = 'observabilityCasesV3';
export const sloFeatureId = 'slo';

// SLO alerts table in slo detail page
export const SLO_ALERTS_TABLE_ID = 'xpack.observability.slo.sloDetails.alertTable';
export const RELATED_ALERTS_TABLE_ID = 'xpack.observability.alerts.relatedAlerts';

// Emebeddable SLO alerts table
export const SLO_ALERTS_TABLE_CONFIG_ID = `${AlertConsumers.SLO}-embeddable-alerts-table`;

export {
  CLOUD,
  CLOUD_AVAILABILITY_ZONE,
  CLOUD_PROVIDER,
  CLOUD_REGION,
  CLOUD_MACHINE_TYPE,
  SERVICE,
  SERVICE_NAME,
  SERVICE_ENVIRONMENT,
  SERVICE_FRAMEWORK_NAME,
  SERVICE_FRAMEWORK_VERSION,
  SERVICE_LANGUAGE_NAME,
  SERVICE_LANGUAGE_VERSION,
  SERVICE_RUNTIME_NAME,
  SERVICE_RUNTIME_VERSION,
  SERVICE_NODE_NAME,
  SERVICE_VERSION,
  AGENT,
  AGENT_NAME,
  AGENT_VERSION,
  URL_FULL,
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  USER_ID,
  USER_AGENT_ORIGINAL,
  USER_AGENT_NAME,
  USER_AGENT_VERSION,
  DESTINATION_ADDRESS,
  OBSERVER_HOSTNAME,
  OBSERVER_VERSION_MAJOR,
  OBSERVER_LISTENING,
  PROCESSOR_EVENT,
  TRANSACTION_DURATION,
  TRANSACTION_DURATION_HISTOGRAM,
  TRANSACTION_TYPE,
  TRANSACTION_RESULT,
  TRANSACTION_NAME,
  TRANSACTION_ID,
  TRANSACTION_SAMPLED,
  TRANSACTION_PAGE_URL,
  TRANSACTION_ROOT,
  EVENT_OUTCOME,
  TRACE_ID,
  SPAN_DURATION,
  SPAN_TYPE,
  SPAN_SUBTYPE,
  SPAN_SELF_TIME_SUM,
  SPAN_ACTION,
  SPAN_NAME,
  SPAN_ID,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_COUNT,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_SUM,
  PARENT_ID,
  ERROR_GROUP_ID,
  ERROR_CULPRIT,
  ERROR_LOG_LEVEL,
  ERROR_LOG_MESSAGE,
  ERROR_EXC_MESSAGE,
  ERROR_EXC_HANDLED,
  ERROR_EXC_TYPE,
  ERROR_PAGE_URL,
  METRIC_SYSTEM_FREE_MEMORY,
  METRIC_SYSTEM_MEMORY_USAGE,
  METRIC_SYSTEM_CPU_USAGE,
  METRIC_SYSTEM_TOTAL_MEMORY,
  METRIC_SYSTEM_CPU_PERCENT,
  METRIC_PROCESS_CPU_PERCENT,
  METRIC_CGROUP_MEMORY_LIMIT_BYTES,
  METRIC_CGROUP_MEMORY_USAGE_BYTES,
  METRIC_JAVA_HEAP_MEMORY_MAX,
  METRIC_JAVA_HEAP_MEMORY_COMMITTED,
  METRIC_JAVA_HEAP_MEMORY_USED,
  METRIC_JAVA_NON_HEAP_MEMORY_MAX,
  METRIC_JAVA_NON_HEAP_MEMORY_COMMITTED,
  METRIC_JAVA_NON_HEAP_MEMORY_USED,
  METRIC_JAVA_THREAD_COUNT,
  METRIC_JAVA_GC_COUNT,
  METRIC_JAVA_GC_TIME,
  LABEL_NAME,
  HOST,
  HOST_HOSTNAME,
  HOST_NAME,
  HOST_OS_PLATFORM,
  CONTAINER_ID,
  KUBERNETES,
  POD_NAME,
  CLIENT_GEO_COUNTRY_ISO_CODE,
  CLIENT_GEO_COUNTRY_NAME,
  TRANSACTION_URL,
  CLIENT_GEO,
  USER_AGENT_DEVICE,
  USER_AGENT_OS,
  USER_AGENT_OS_VERSION,
  TRANSACTION_TIME_TO_FIRST_BYTE,
  TRANSACTION_DOM_INTERACTIVE,
  FCP_FIELD,
  LCP_FIELD,
  TBT_FIELD,
  FID_FIELD,
  CLS_FIELD,
  PROFILE_ID,
  PROFILE_DURATION,
  PROFILE_TOP_ID,
  PROFILE_STACK,
  PROFILE_SAMPLES_COUNT,
  PROFILE_CPU_NS,
  PROFILE_WALL_US,
  PROFILE_ALLOC_OBJECTS,
  PROFILE_ALLOC_SPACE,
  PROFILE_INUSE_OBJECTS,
  PROFILE_INUSE_SPACE,
  DATA_STREAM_TYPE,
  ENTITY,
  ENTITY_ID,
  ENTITY_TYPE,
  ENTITY_LAST_SEEN,
  ENTITY_FIRST_SEEN,
  ENTITY_DISPLAY_NAME,
  ENTITY_DEFINITION_ID,
  ENTITY_IDENTITY_FIELDS,
  SOURCE_DATA_STREAM_TYPE,
} from './field_names/elasticsearch';

export {
  NETWORK_TIMINGS_FIELDS,
  SYNTHETICS_BLOCKED_TIMINGS,
  SYNTHETICS_CONNECT_TIMINGS,
  SYNTHETICS_DNS_TIMINGS,
  SYNTHETICS_RECEIVE_TIMINGS,
  SYNTHETICS_SEND_TIMINGS,
  SYNTHETICS_SSL_TIMINGS,
  SYNTHETICS_TOTAL_TIMINGS,
  SYNTHETICS_WAIT_TIMINGS,
} from './field_names/synthetics';

export { type Color, colorTransformer } from './color_palette';
export { getInspectResponse, type InspectResponse } from './utils/get_inspect_response';
export {
  type DataTier,
  indexLifeCyclePhaseToDataTier,
  IndexLifecyclePhaseSelectOption,
} from './ilm_types';

export const LOGS_ONBOARDING_FEEDBACK_LINK = 'https://ela.st/logs-onboarding-feedback';
export const LOGS_EXPLORER_FEEDBACK_LINK = 'https://ela.st/explorer-feedback';

export type {
  ServiceOverviewParams,
  ServiceOverviewLocator,
  TransactionDetailsByNameLocator,
  ServiceTransactionsLocator,
  ServiceAlertsLocator,
  ServiceAlertsLocatorParams,
  AssetDetailsFlyoutLocator,
  AssetDetailsFlyoutLocatorParams,
  AssetDetailsLocator,
  AssetDetailsLocatorParams,
  HostsLocator,
  HostsLocatorParams,
  InventoryLocator,
  InventoryLocatorParams,
  MetricsExplorerLocator,
  MetricsExplorerLocatorParams,
  FlamegraphLocatorParams,
  FlamegraphLocator,
  StacktracesLocatorParams,
  StacktracesLocator,
  TopNFunctionsLocatorParams,
  TopNFunctionsLocator,
  TransactionDetailsByTraceIdLocator,
  TransactionDetailsByTraceIdLocatorParams,
} from './locators';

export {
  ServiceOverviewLocatorDefinition,
  SERVICE_OVERVIEW_LOCATOR_ID,
  DependencyOverviewLocatorDefinition,
  TransactionDetailsByNameLocatorDefinition,
  ServiceTransactionsLocatorDefinition,
  SERVICE_TRANSACTIONS_LOCATOR_ID,
  ServiceAlertsLocatorDefinition,
  SERVICE_ALERTS_LOCATOR_ID,
  ASSET_DETAILS_FLYOUT_LOCATOR_ID,
  AssetDetailsFlyoutLocatorDefinition,
  ASSET_DETAILS_LOCATOR_ID,
  AssetDetailsLocatorDefinition,
  SupportedEntityTypes,
  HostsLocatorDefinition,
  INVENTORY_LOCATOR_ID,
  InventoryLocatorDefinition,
  METRICS_EXPLORER_LOCATOR_ID,
  MetricsExplorerLocatorDefinition,
  FlamegraphLocatorDefinition,
  StacktracesLocatorDefinition,
  TopNFunctionsLocatorDefinition,
  HOSTS_LOCATOR_ID,
  TransactionDetailsByTraceIdLocatorDefinition,
  TRANSACTION_DETAILS_BY_TRACE_ID_LOCATOR,
} from './locators';

export { COMMON_OBSERVABILITY_GROUPING } from './embeddable_grouping';

export { BUILT_IN_ENTITY_TYPES, EntityDataStreamType } from './entity';
