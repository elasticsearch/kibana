/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { getCasesFromAlertsUrl } from '@kbn/cases-plugin/common';
import type { ResponseActionAgentType } from '../../../../../common/endpoint/service/response_actions/constants';
import type { ResponseActionApiResponse, HostInfo } from '../../../../../common/endpoint/types';
import {
  DETECTION_ENGINE_QUERY_SIGNALS_URL,
  DETECTION_ENGINE_SIGNALS_STATUS_URL,
  DETECTION_ENGINE_INDEX_URL,
  DETECTION_ENGINE_PRIVILEGES_URL,
  ALERTS_AS_DATA_FIND_URL,
  DETECTION_ENGINE_ALERTS_INDEX_URL,
  DETECTION_ENGINE_SEARCH_UNIFIED_ALERTS_URL,
} from '../../../../../common/constants';
import { HOST_METADATA_GET_ROUTE } from '../../../../../common/endpoint/constants';
import { KibanaServices } from '../../../../common/lib/kibana';
import type {
  BasicSignals,
  Privilege,
  QueryAlerts,
  AlertSearchResponse,
  AlertsIndex,
  UpdateAlertStatusByQueryProps,
  CasesFromAlertsResponse,
  CheckSignalIndex,
  UpdateAlertStatusByIdsProps,
} from './types';
import { isolateHost, unIsolateHost } from '../../../../common/lib/endpoint/endpoint_isolation';
import { resolvePathVariables } from '../../../../common/utils/resolve_path_variables';

/**
 * Fetch Alerts by providing a query
 *
 * @param query String to match a dsl
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const fetchQueryAlerts = async <Hit, Aggregations>({
  query,
  signal,
}: QueryAlerts): Promise<AlertSearchResponse<Hit, Aggregations>> => {
  return KibanaServices.get().http.fetch<AlertSearchResponse<Hit, Aggregations>>(
    DETECTION_ENGINE_QUERY_SIGNALS_URL,
    {
      version: '2023-10-31',
      method: 'POST',
      body: JSON.stringify(query),
      signal,
    }
  );
};

/**
 * Fetch Unified Alerts (detection and attack alerts) by providing a query
 *
 * @param query String to match a dsl
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const fetchQueryUnifiedAlerts = async <Hit, Aggregations>({
  query,
  signal,
}: QueryAlerts): Promise<AlertSearchResponse<Hit, Aggregations>> => {
  return KibanaServices.get().http.fetch<AlertSearchResponse<Hit, Aggregations>>(
    DETECTION_ENGINE_SEARCH_UNIFIED_ALERTS_URL,
    {
      version: '1',
      method: 'POST',
      body: JSON.stringify(query),
      signal,
    }
  );
};

/**
 * Fetch Alerts by providing a query
 *
 * @param query String to match a dsl
 * @param signal to cancel request
 *
 * @throws An error if response is not OK
 */
export const fetchQueryRuleRegistryAlerts = async <Hit, Aggregations>({
  query,
  signal,
}: QueryAlerts): Promise<AlertSearchResponse<Hit, Aggregations>> => {
  return KibanaServices.get().http.fetch<AlertSearchResponse<Hit, Aggregations>>(
    ALERTS_AS_DATA_FIND_URL,
    {
      method: 'POST',
      body: JSON.stringify(query),
      signal,
    }
  );
};

/**
 * Update alert status by query
 *
 * @param query of alerts to update
 * @param status to update to('open' / 'closed' / 'acknowledged')
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const updateAlertStatusByQuery = async ({
  query,
  status,
  signal,
  reason,
  runtimeFields,
}: UpdateAlertStatusByQueryProps): Promise<estypes.UpdateByQueryResponse> =>
  KibanaServices.get().http.fetch(DETECTION_ENGINE_SIGNALS_STATUS_URL, {
    version: '2023-10-31',
    method: 'POST',
    body: JSON.stringify({
      conflicts: 'proceed',
      status,
      query,
      reason,
      runtime_fields: runtimeFields,
    }),
    signal,
  });

/**
 * Update alert status by signalIds
 *
 * @param signalIds List of signal ids to update
 * @param status to update to('open' / 'closed' / 'acknowledged')
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const updateAlertStatusByIds = async ({
  signalIds,
  status,
  signal,
  reason,
}: UpdateAlertStatusByIdsProps): Promise<estypes.UpdateByQueryResponse> =>
  KibanaServices.get().http.fetch(DETECTION_ENGINE_SIGNALS_STATUS_URL, {
    version: '2023-10-31',
    method: 'POST',
    body: JSON.stringify({ status, signal_ids: signalIds, reason }),
    signal,
  });

/**
 * Fetch Signal Index
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const getSignalIndex = async ({ signal }: BasicSignals): Promise<AlertsIndex> =>
  KibanaServices.get().http.fetch<AlertsIndex>(DETECTION_ENGINE_INDEX_URL, {
    version: '2023-10-31',
    method: 'GET',
    signal,
  });

/**
 * Check Signal Index
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const checkSignalIndex = async ({ signal }: BasicSignals): Promise<CheckSignalIndex> =>
  KibanaServices.get().http.fetch<CheckSignalIndex>(DETECTION_ENGINE_ALERTS_INDEX_URL, {
    version: '1',
    method: 'GET',
    signal,
  });

/**
 * Get User Privileges
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const getUserPrivilege = async ({ signal }: BasicSignals): Promise<Privilege> =>
  KibanaServices.get().http.fetch<Privilege>(DETECTION_ENGINE_PRIVILEGES_URL, {
    version: '2023-10-31',
    method: 'GET',
    signal,
  });

/**
 * Create Signal Index if needed it
 *
 * @param signal AbortSignal for cancelling request
 *
 * @throws An error if response is not OK
 */
export const createSignalIndex = async ({ signal }: BasicSignals): Promise<AlertsIndex> =>
  KibanaServices.get().http.fetch<AlertsIndex>(DETECTION_ENGINE_INDEX_URL, {
    version: '2023-10-31',
    method: 'POST',
    signal,
  });

/**
 * Get Host Isolation index
 *
 * @param agent id
 * @param optional comment for the isolation action
 * @param optional case ids if associated with an alert on the host
 *
 * @throws An error if response is not OK
 */
export const createHostIsolation = async ({
  endpointId,
  comment = '',
  caseIds,
  agentType,
}: {
  endpointId: string;
  comment?: string;
  caseIds?: string[];
  agentType: ResponseActionAgentType;
}): Promise<ResponseActionApiResponse> =>
  isolateHost({
    endpoint_ids: [endpointId],
    comment,
    case_ids: caseIds,
    agent_type: agentType,
  });

/**
 * Unisolate a host
 *
 * @param agent id
 * @param optional comment for the unisolation action
 * @param optional case ids if associated with an alert on the host
 *
 * @throws An error if response is not OK
 */
export const createHostUnIsolation = async ({
  endpointId,
  comment = '',
  caseIds,
  agentType,
}: {
  endpointId: string;
  comment?: string;
  caseIds?: string[];
  agentType: ResponseActionAgentType;
}): Promise<ResponseActionApiResponse> =>
  unIsolateHost({
    endpoint_ids: [endpointId],
    comment,
    case_ids: caseIds,
    agent_type: agentType,
  });

/**
 * Get list of associated case ids from alert id
 *
 * @param alert id
 */
export const getCaseIdsFromAlertId = async ({
  alertId,
  owner,
}: {
  alertId: string;
  owner: string[];
}): Promise<CasesFromAlertsResponse> =>
  KibanaServices.get().http.fetch<CasesFromAlertsResponse>(getCasesFromAlertsUrl(alertId), {
    method: 'get',
    query: { ...(owner.length > 0 ? { owner } : {}) },
  });

/**
 * Get Host metadata
 *
 * @param host id
 */
export const getHostMetadata = async ({
  agentId,
  signal,
}: {
  agentId: string;
  signal?: AbortSignal;
}): Promise<HostInfo> =>
  KibanaServices.get().http.fetch<HostInfo>(
    resolvePathVariables(HOST_METADATA_GET_ROUTE, { id: agentId }),
    { method: 'GET', signal, version: '2023-10-31' }
  );
