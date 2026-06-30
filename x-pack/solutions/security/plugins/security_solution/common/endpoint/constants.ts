/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** endpoint data streams that are used for host isolation  */
import { getFileDataIndexName, getFileMetadataIndexName } from '@kbn/fleet-plugin/common';
import { EndpointSortableField } from './types';

/** for index patterns `.logs-endpoint.actions-* and .logs-endpoint.action.responses-*`*/
export const ENDPOINT_ACTIONS_DS = '.logs-endpoint.actions';
export const ENDPOINT_ACTIONS_INDEX = `${ENDPOINT_ACTIONS_DS}-default`;
export const ENDPOINT_ACTION_RESPONSES_DS = '.logs-endpoint.action.responses';
export const ENDPOINT_ACTION_RESPONSES_INDEX = `${ENDPOINT_ACTION_RESPONSES_DS}-default`;
// search in all namespaces and not only in default
export const ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN = `${ENDPOINT_ACTION_RESPONSES_DS}-*`;

export const eventsIndexPattern = 'logs-endpoint.events.*';
export const FILE_EVENTS_INDEX_PATTERN = 'logs-endpoint.events.file-*';
export const DEVICE_EVENTS_INDEX_PATTERN = 'logs-endpoint.events.device-*';
export const alertsIndexPattern = 'logs-endpoint.alerts-*';

// metadata datastream
export const METADATA_DATASTREAM = 'metrics-endpoint.metadata-default';

/** index pattern for the data source index (data stream) that the Endpoint streams documents to */
export const metadataIndexPattern = 'metrics-endpoint.metadata-*';

/** index that the metadata transform writes to (destination) and that is used by endpoint APIs */
export const metadataCurrentIndexPattern = 'metrics-endpoint.metadata_current_*';

// endpoint package V2 has an additional prefix in the transform names
const PACKAGE_V2_PREFIX = 'logs-';

/** The metadata Transform Name prefix with NO (package) version) */
export const metadataTransformPrefix = 'endpoint.metadata_current-default';
export const METADATA_CURRENT_TRANSFORM_V2 = `${PACKAGE_V2_PREFIX}${metadataTransformPrefix}`;

// metadata transforms pattern for matching all metadata transform ids
export const METADATA_TRANSFORMS_PATTERN = 'endpoint.metadata_*';
export const METADATA_TRANSFORMS_PATTERN_V2 = `${PACKAGE_V2_PREFIX}${METADATA_TRANSFORMS_PATTERN}`;

// united metadata transform id prefix — variant-agnostic so it matches the deployment
// variants of the transform (e.g. `-default` on stateful, `-serverless` on serverless).
// All consumers use it as a prefix (`startsWith` / `${...}*`), never as an exact id.
export const METADATA_UNITED_TRANSFORM = 'endpoint.metadata_united-';
export const METADATA_UNITED_TRANSFORM_V2 = `${PACKAGE_V2_PREFIX}${METADATA_UNITED_TRANSFORM}`;

// united metadata transform destination index
export const METADATA_UNITED_INDEX = '.metrics-endpoint.metadata_united_default';

export const POLICY_RESPONSE_INDEX = 'metrics-endpoint.policy-default';
export const policyIndexPattern = 'metrics-endpoint.policy-*';

export const telemetryIndexPattern = 'metrics-endpoint.telemetry-*';

export const ENDPOINT_HEARTBEAT_INDEX = '.logs-endpoint.heartbeat-default';
export const ENDPOINT_HEARTBEAT_INDEX_PATTERN = '.logs-endpoint.heartbeat-*';

// Endpoint diagnostics index
export const DEFAULT_DIAGNOSTIC_INDEX_PATTERN = '.logs-endpoint.diagnostic.collection-*' as const;

// File storage indexes supporting endpoint Upload/download
export const FILE_STORAGE_METADATA_INDEX = getFileMetadataIndexName('endpoint');
export const FILE_STORAGE_DATA_INDEX = getFileDataIndexName('endpoint');

// Location from where all Endpoint related APIs are mounted
export const BASE_ENDPOINT_ROUTE = '/api/endpoint';
export const BASE_INTERNAL_ENDPOINT_ROUTE = `/internal${BASE_ENDPOINT_ROUTE}`;

// Endpoint API routes
export const HOST_METADATA_LIST_ROUTE = `${BASE_ENDPOINT_ROUTE}/metadata`;
export const HOST_METADATA_GET_ROUTE = `${HOST_METADATA_LIST_ROUTE}/{id}`;

export const METADATA_TRANSFORMS_STATUS_INTERNAL_ROUTE = `${BASE_INTERNAL_ENDPOINT_ROUTE}/metadata/transforms`;

export const BASE_POLICY_RESPONSE_ROUTE = `${BASE_ENDPOINT_ROUTE}/policy_response`;
export const BASE_POLICY_ROUTE = `${BASE_ENDPOINT_ROUTE}/policy`;
export const PROTECTION_UPDATES_NOTE_ROUTE = `${BASE_ENDPOINT_ROUTE}/protection_updates_note/{package_policy_id}`;

/** Suggestions routes */
export const SUGGESTIONS_INTERNAL_ROUTE = `${BASE_INTERNAL_ENDPOINT_ROUTE}/suggestions/{suggestion_type}`;

/**
 * Action Response Routes
 */

/** Base Actions route. Used to get a list of all actions and is root to other action related routes */
export const BASE_ENDPOINT_ACTION_ROUTE = `${BASE_ENDPOINT_ROUTE}/action`;
export const BASE_INTERNAL_ENDPOINT_ACTION_ROUTE = `/internal${BASE_ENDPOINT_ACTION_ROUTE}`;

export const ISOLATE_HOST_ROUTE_V2 = `${BASE_ENDPOINT_ACTION_ROUTE}/isolate`;
export const UNISOLATE_HOST_ROUTE_V2 = `${BASE_ENDPOINT_ACTION_ROUTE}/unisolate`;
export const GET_PROCESSES_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/running_procs`;
export const KILL_PROCESS_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/kill_process`;
export const SUSPEND_PROCESS_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/suspend_process`;
export const GET_FILE_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/get_file`;
export const EXECUTE_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/execute`;
export const UPLOAD_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/upload`;
export const SCAN_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/scan`;
export const RUN_SCRIPT_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/run_script`;
export const MEMORY_DUMP_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/memory_dump`;
export const CANCEL_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/cancel`;
export const CUSTOM_SCRIPTS_ROUTE = `${BASE_INTERNAL_ENDPOINT_ACTION_ROUTE}/custom_scripts`;

/** Endpoint Actions Routes */
export const ACTION_STATUS_ROUTE = `${BASE_ENDPOINT_ROUTE}/action_status`;
export const ACTION_DETAILS_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/{action_id}`;
export const ACTION_AGENT_FILE_INFO_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/{action_id}/file/{file_id}`;
export const ACTION_AGENT_FILE_DOWNLOAD_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/{action_id}/file/{file_id}/download`;
export const ACTION_STATE_ROUTE = `${BASE_ENDPOINT_ACTION_ROUTE}/state`;
// Route that allows read/update the space id that should be used to display orphaned action
export const ORPHAN_ACTIONS_SPACE_ROUTE = `${BASE_INTERNAL_ENDPOINT_ROUTE}/action/_orphan_actions_space`;

/** Scripts Library */
export const SCRIPTS_LIBRARY_ROUTE = `${BASE_ENDPOINT_ROUTE}/scripts_library`;
export const SCRIPTS_LIBRARY_ROUTE_ITEM = `${SCRIPTS_LIBRARY_ROUTE}/{script_id}`;
export const SCRIPTS_LIBRARY_ITEM_DOWNLOAD_ROUTE = `${SCRIPTS_LIBRARY_ROUTE_ITEM}/download`;

/** Endpoint Agent Routes */
export const AGENT_STATUS_ROUTE = `/internal${BASE_ENDPOINT_ROUTE}/agent_status`;

export const failedFleetActionErrorCode = '424';

export const ENDPOINT_DEFAULT_PAGE = 0;
export const ENDPOINT_DEFAULT_PAGE_SIZE = 10;
export const ENDPOINT_DEFAULT_SORT_FIELD = EndpointSortableField.ENROLLED_AT;
export const ENDPOINT_DEFAULT_SORT_DIRECTION = 'desc';

export const ENDPOINT_ERROR_CODES: Record<string, number> = {
  ES_CONNECTION_ERROR: -272,
  OUTPUT_SERVER_ERROR: -273,
};

export const ENDPOINT_FIELDS_SEARCH_STRATEGY = 'endpointFields';
export const ENDPOINT_SEARCH_STRATEGY = 'endpointSearchStrategy';

/** Endpoint Exceptions routes */
export const ENDPOINT_EXCEPTIONS_PER_POLICY_OPT_IN_ROUTE = `${BASE_INTERNAL_ENDPOINT_ROUTE}/endpoint_exceptions_per_policy_opt_in`;

/** Search strategy keys */
export const ENDPOINT_PACKAGE_POLICIES_STATS_STRATEGY = 'endpointPackagePoliciesStatsStrategy';

/** The list of OS types that support. Value usually found in ECS `host.os.type` */
export const SUPPORTED_HOST_OS_TYPE = Object.freeze(['macos', 'windows', 'linux'] as const);
export type SupportedHostOsType = (typeof SUPPORTED_HOST_OS_TYPE)[number];

/**
 * Workflow Insights
 */

export const BASE_WORKFLOW_INSIGHTS_ROUTE = `/workflow_insights`;
export const WORKFLOW_INSIGHTS_ROUTE = `${BASE_INTERNAL_ENDPOINT_ROUTE}${BASE_WORKFLOW_INSIGHTS_ROUTE}`;
export const WORKFLOW_INSIGHTS_UPDATE_ROUTE = `${WORKFLOW_INSIGHTS_ROUTE}/{insightId}`;
export const WORKFLOW_INSIGHTS_PENDING_ROUTE = `${WORKFLOW_INSIGHTS_ROUTE}/pending`;
